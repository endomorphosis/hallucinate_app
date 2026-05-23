"""Model and data provenance ledger for the Hallucinate Virtual AI OS.

The ledger is intentionally stdlib-only. Runtime adapters for
``ipfs_kit_py``, ``ipfs_datasets_py``, ``ipfs_accelerate_py``, agent
schedulers, policy engines, and MCP++ event DAGs can normalize native records
into these payloads at the component boundary.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Protocol, runtime_checkable

from .compute import InferenceOutput, LoadedModel, ModelRef, model_uri
from .contracts import (
    EventEnvelope,
    IdentityRef,
    Labels,
    MaybeAwaitable,
    Metadata,
    ProcessSpec,
    ProcessStatus,
    ResourceRef,
    StorageRef,
    utc_now,
)
from .events import MCPEventDAGNode, stable_observability_cid
from .knowledge import DatasetRef
from .processes import AgentProcessKind, AgentProcessSpec, AgentProcessStatus, process_uri
from .security import CapabilityDecision, CapabilityDecisionOutcome


VIRTUAL_OS_PROVENANCE_COMPONENT = "virtual_os.provenance"
PROVENANCE_SCHEMA_VERSION = "virtual-os.provenance.v1"


class ProvenanceContractError(Exception):
    """Base error raised by provenance ledger helpers and adapters."""


class ProvenanceRecordKind(str, Enum):
    """High-level record kinds stored by the provenance ledger."""

    MODEL_INFERENCE = "model_inference"
    MODEL_EMBEDDING = "model_embedding"
    DATASET_LOAD = "dataset_load"
    DATASET_TRANSFORMATION = "dataset_transformation"
    GRAPHRAG_QUERY = "graphrag_query"
    AGENT_STEP = "agent_step"
    POLICY_EVALUATION = "policy_evaluation"
    OUTPUT_ARTIFACT = "output_artifact"
    CUSTOM = "custom"


@dataclass(frozen=True)
class PromptRecord:
    """Prompt material and prompt artifact references used for model work."""

    prompt_id: str | None = None
    text: str | None = None
    template_id: str | None = None
    template: str | None = None
    variables: Metadata = field(default_factory=dict)
    system_prompt: str | None = None
    input_refs: tuple[ResourceRef | StorageRef | str, ...] = ()
    cid: str | None = None
    redacted: bool = False
    metadata: Metadata = field(default_factory=dict)

    def provenance_dict(self) -> dict[str, Any]:
        """Return a deterministic JSON-friendly prompt view."""
        return {
            "prompt_id": self.prompt_id,
            "text": self.text,
            "template_id": self.template_id,
            "template": self.template,
            "variables": provenance_safe(self.variables),
            "system_prompt": self.system_prompt,
            "input_refs": [provenance_safe(ref) for ref in self.input_refs],
            "cid": self.cid,
            "redacted": self.redacted,
            "metadata": provenance_safe(self.metadata),
        }


@dataclass(frozen=True)
class ModelOutputRecord:
    """Model output or generated artifact recorded by the provenance ledger."""

    output_id: str | None = None
    text: str | None = None
    data: Any = None
    artifact: ResourceRef | StorageRef | str | None = None
    cid: str | None = None
    media_type: str | None = None
    finish_reason: str | None = None
    score: float | None = None
    token_count: int | None = None
    metadata: Metadata = field(default_factory=dict)

    @classmethod
    def from_inference_output(cls, output: InferenceOutput) -> "ModelOutputRecord":
        """Project an inference output into the ledger's output shape."""
        token_count = len(output.tokens) if output.tokens else None
        return cls(
            output_id=output.output_id,
            text=output.text,
            data=output.data,
            finish_reason=output.finish_reason,
            score=output.score,
            token_count=token_count,
            metadata={
                "input_id": output.input_id,
                "resource_usage": provenance_safe(output.resource_usage),
                **dict(output.metadata),
            },
        )

    def provenance_dict(self) -> dict[str, Any]:
        """Return a deterministic JSON-friendly output view."""
        return {
            "output_id": self.output_id,
            "text": self.text,
            "data": provenance_safe(self.data),
            "artifact": provenance_safe(self.artifact),
            "cid": self.cid,
            "media_type": self.media_type,
            "finish_reason": self.finish_reason,
            "score": self.score,
            "token_count": self.token_count,
            "metadata": provenance_safe(self.metadata),
        }


@dataclass(frozen=True)
class AgentProcessRef:
    """Process identity and scheduler context for provenance records."""

    process_id: str
    component: str | None = None
    kind: AgentProcessKind | str | None = None
    entrypoint: str | None = None
    state: str | None = None
    identity: IdentityRef | None = None
    parent_process_id: str | None = None
    workflow_id: str | None = None
    queue_id: str | None = None
    task_id: str | None = None
    worker_id: str | None = None
    metadata: Metadata = field(default_factory=dict)

    @classmethod
    def from_process(cls, process: AgentProcessSpec | AgentProcessStatus | ProcessSpec | ProcessStatus) -> "AgentProcessRef":
        """Project process specs or statuses into a compact ledger reference."""
        if isinstance(process, AgentProcessSpec):
            return cls(
                process_id=process.process_id,
                component=process.component,
                kind=process.kind,
                entrypoint=process.entrypoint,
                identity=process.identity,
                parent_process_id=process.parent_process_id,
                workflow_id=process.workflow_id,
                queue_id=process.queue_id,
                metadata=process.metadata,
            )
        if isinstance(process, AgentProcessStatus):
            return cls(
                process_id=process.process_id,
                component=process.component,
                kind=process.kind,
                state=_enum_value(process.state),
                identity=process.identity,
                workflow_id=process.workflow_id,
                queue_id=process.queue_id,
                worker_id=process.worker_id,
                metadata=process.metadata,
            )
        if isinstance(process, ProcessSpec):
            return cls(
                process_id=process.process_id,
                component=process.component,
                entrypoint=process.entrypoint,
                identity=process.identity,
                metadata=process.metadata,
            )
        return cls(
            process_id=process.process_id,
            state=_enum_value(process.state),
            metadata={
                "health": _enum_value(process.health),
                "pid": process.pid,
                "started_at": process.started_at,
                "stopped_at": process.stopped_at,
                "exit_code": process.exit_code,
                "message": process.message,
                "resources": process.resources,
                **dict(process.metadata),
            },
        )

    def resource(self) -> ResourceRef:
        """Return this process as a provenance subject resource."""
        return ResourceRef(
            uri=process_uri(self.process_id),
            component=self.component or "virtual_os.scheduler",
            name=self.process_id,
            metadata={
                "process_kind": _enum_value(self.kind) if self.kind is not None else None,
                "workflow_id": self.workflow_id,
                "queue_id": self.queue_id,
                "task_id": self.task_id,
                "worker_id": self.worker_id,
            },
        )

    def provenance_dict(self) -> dict[str, Any]:
        """Return a deterministic JSON-friendly process view."""
        return {
            "process_id": self.process_id,
            "component": self.component,
            "kind": _enum_value(self.kind) if self.kind is not None else None,
            "entrypoint": self.entrypoint,
            "state": self.state,
            "identity": provenance_safe(self.identity),
            "parent_process_id": self.parent_process_id,
            "workflow_id": self.workflow_id,
            "queue_id": self.queue_id,
            "task_id": self.task_id,
            "worker_id": self.worker_id,
            "resource_uri": process_uri(self.process_id),
            "metadata": provenance_safe(self.metadata),
        }


@dataclass(frozen=True)
class PolicyDecisionRef:
    """Policy decision reference retained with a ledger record."""

    decision_id: str
    outcome: CapabilityDecisionOutcome | str
    allowed: bool = False
    reason: str = ""
    checked_at: datetime | None = None
    actor: IdentityRef | None = None
    action: str | None = None
    resource: ResourceRef | None = None
    operation: str | None = None
    service_id: str | None = None
    matched_grant_id: str | None = None
    obligations: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)

    @classmethod
    def from_capability_decision(cls, decision: CapabilityDecision) -> "PolicyDecisionRef":
        """Project a capability decision into a redacted ledger reference."""
        request = decision.request
        digest = stable_provenance_id(
            "policy-decision",
            request.actor.did,
            _enum_value(request.action),
            request.resource.uri,
            _enum_value(decision.outcome),
            decision.checked_at.isoformat(),
        )
        return cls(
            decision_id=f"policy:{digest[:24]}",
            outcome=decision.outcome,
            allowed=decision.allowed,
            reason=decision.reason,
            checked_at=decision.checked_at,
            actor=request.actor,
            action=_enum_value(request.action),
            resource=request.resource,
            operation=request.operation,
            service_id=request.service_id,
            matched_grant_id=decision.matched_grant.grant_id if decision.matched_grant else None,
            obligations=tuple(decision.obligations),
            metadata=decision.metadata,
        )

    def provenance_dict(self) -> dict[str, Any]:
        """Return a deterministic JSON-friendly policy decision view."""
        return {
            "decision_id": self.decision_id,
            "outcome": _enum_value(self.outcome),
            "allowed": self.allowed,
            "reason": self.reason,
            "checked_at": self.checked_at.isoformat() if self.checked_at else None,
            "actor": provenance_safe(self.actor),
            "action": self.action,
            "resource": provenance_safe(self.resource),
            "operation": self.operation,
            "service_id": self.service_id,
            "matched_grant_id": self.matched_grant_id,
            "obligations": list(self.obligations),
            "metadata": provenance_safe(self.metadata),
        }


@dataclass(frozen=True)
class EventReference:
    """Event and MCP++ DAG reference linked from a provenance record."""

    event_id: str
    event_type: str | None = None
    source: str | None = None
    event_cid: str | None = None
    occurred_at: datetime | None = None
    parent_event_ids: tuple[str, ...] = ()
    trace_id: str | None = None
    correlation_id: str | None = None
    metadata: Metadata = field(default_factory=dict)

    @classmethod
    def from_event(cls, event: EventEnvelope | MCPEventDAGNode) -> "EventReference":
        """Project an event envelope or MCP++ DAG node into a ledger reference."""
        if isinstance(event, MCPEventDAGNode):
            return cls(
                event_id=event.event_id,
                event_type=event.event_type,
                source=event.source,
                event_cid=event.event_cid,
                occurred_at=event.occurred_at,
                parent_event_ids=event.parents,
                trace_id=event.trace_id,
                correlation_id=event.correlation_id,
                metadata={
                    "node_id": event.node_id,
                    "payload_cid": event.payload_cid,
                    "proof_cid": event.proof_cid,
                    "receipt_cid": event.receipt_cid,
                    **dict(event.metadata),
                },
            )
        return cls(
            event_id=event.event_id,
            event_type=event.event_type,
            source=event.source,
            event_cid=stable_observability_cid(event),
            occurred_at=event.occurred_at,
            parent_event_ids=event.parent_event_ids,
            trace_id=event.trace_id,
            correlation_id=event.correlation_id,
            metadata=event.metadata,
        )

    def provenance_dict(self) -> dict[str, Any]:
        """Return a deterministic JSON-friendly event reference."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "source": self.source,
            "event_cid": self.event_cid,
            "occurred_at": self.occurred_at.isoformat() if self.occurred_at else None,
            "parent_event_ids": list(self.parent_event_ids),
            "trace_id": self.trace_id,
            "correlation_id": self.correlation_id,
            "metadata": provenance_safe(self.metadata),
        }


@dataclass(frozen=True)
class ProvenanceLedgerRecord:
    """Single ledger entry tying data, model, agent, policy, and event lineage."""

    kind: ProvenanceRecordKind | str = ProvenanceRecordKind.MODEL_INFERENCE
    operation: str = ""
    cid: str | None = None
    dataset: DatasetRef | ResourceRef | StorageRef | str | Mapping[str, Any] | None = None
    model: LoadedModel | ModelRef | ResourceRef | StorageRef | str | Mapping[str, Any] | None = None
    prompt: PromptRecord | str | Mapping[str, Any] | None = None
    output: ModelOutputRecord | InferenceOutput | ResourceRef | StorageRef | str | Mapping[str, Any] | None = None
    agent_process: (
        AgentProcessRef
        | AgentProcessSpec
        | AgentProcessStatus
        | ProcessSpec
        | ProcessStatus
        | str
        | Mapping[str, Any]
        | None
    ) = None
    policy_decision: PolicyDecisionRef | CapabilityDecision | str | Mapping[str, Any] | None = None
    events: tuple[EventReference | EventEnvelope | MCPEventDAGNode | str | Mapping[str, Any], ...] = ()
    actor: IdentityRef | None = None
    subject: ResourceRef | StorageRef | str | None = None
    trace_id: str | None = None
    parents: tuple[str, ...] = ()
    created_at: datetime = field(default_factory=utc_now)
    record_id: str = ""
    record_cid: str | None = None
    schema_version: str = PROVENANCE_SCHEMA_VERSION
    labels: Labels = field(default_factory=dict)
    metadata: Metadata = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "parents", tuple(str(parent) for parent in self.parents))
        object.__setattr__(self, "events", tuple(self.events))
        object.__setattr__(self, "labels", dict(self.labels))
        object.__setattr__(self, "metadata", dict(self.metadata))
        if self.cid is None:
            derived_cid = _primary_reference_cid(self.output, self.dataset, self.model, self.prompt)
            if derived_cid:
                object.__setattr__(self, "cid", derived_cid)

        content = self.to_json_dict(include_integrity=False)
        if not self.record_id:
            digest = stable_provenance_id("provenance-record", canonical_provenance_json(content))
            object.__setattr__(self, "record_id", f"provenance:{digest[:24]}")
        if self.record_cid is None:
            object.__setattr__(self, "record_cid", stable_provenance_cid(content))

    @property
    def event_ids(self) -> tuple[str, ...]:
        """Return event ids linked from this record."""
        ids: list[str] = []
        for event in self.events:
            if isinstance(event, str):
                ids.append(event)
            elif isinstance(event, Mapping):
                event_id = event.get("event_id")
                if event_id is not None:
                    ids.append(str(event_id))
            elif isinstance(event, EventReference):
                ids.append(event.event_id)
            elif isinstance(event, EventEnvelope):
                ids.append(event.event_id)
            else:
                ids.append(event.event_id)
        return tuple(ids)

    def to_json_dict(self, *, include_integrity: bool = True) -> dict[str, Any]:
        """Return the stable JSON object used for ledger storage."""
        payload = {
            "schema_version": self.schema_version,
            "kind": _enum_value(self.kind),
            "operation": self.operation,
            "cid": self.cid,
            "dataset": dataset_reference(self.dataset),
            "model": model_reference(self.model),
            "prompt": prompt_reference(self.prompt),
            "output": output_reference(self.output),
            "agent_process": agent_process_reference(self.agent_process),
            "policy_decision": policy_decision_reference(self.policy_decision),
            "events": [event_reference(event) for event in self.events],
            "event_references": [event_reference(event) for event in self.events],
            "actor": provenance_safe(self.actor),
            "subject": provenance_safe(self.subject),
            "trace_id": self.trace_id,
            "parents": list(self.parents),
            "created_at": self.created_at.isoformat(),
            "labels": dict(sorted(self.labels.items())),
            "metadata": provenance_safe(self.metadata),
        }
        if include_integrity:
            payload["record_id"] = self.record_id
            payload["record_cid"] = self.record_cid
        return payload

    def stable_json(self) -> str:
        """Return deterministic JSON serialization for this ledger record."""
        return canonical_provenance_json(self.to_json_dict())

    def to_event(
        self,
        *,
        source: str = VIRTUAL_OS_PROVENANCE_COMPONENT,
    ) -> EventEnvelope:
        """Return this provenance record as an audit/event envelope."""
        return EventEnvelope(
            event_id=stable_provenance_id("provenance-event", self.record_id, self.record_cid or ""),
            event_type="virtual_os.provenance.recorded",
            source=source,
            occurred_at=self.created_at,
            actor=self.actor,
            subject=self.subject if isinstance(self.subject, ResourceRef) else None,
            trace_id=self.trace_id,
            parent_event_ids=self.event_ids,
            payload=self.to_json_dict(),
            metadata={
                "category": "audit",
                "schema_version": self.schema_version,
                "record_id": self.record_id,
                "record_cid": self.record_cid,
            },
        )


@dataclass(frozen=True)
class ProvenanceLedgerReceipt:
    """Acknowledgement returned after a provenance record is stored."""

    record: ProvenanceLedgerRecord
    ok: bool = True
    cid: str | None = None
    stored_at: datetime = field(default_factory=utc_now)
    message: str = ""
    metadata: Metadata = field(default_factory=dict)

    def to_json_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly receipt."""
        return {
            "record_id": self.record.record_id,
            "ok": self.ok,
            "cid": self.cid or self.record.record_cid,
            "stored_at": self.stored_at.isoformat(),
            "message": self.message,
            "metadata": provenance_safe(self.metadata),
        }


@dataclass(frozen=True)
class ProvenanceQuery:
    """Filter used by in-memory and adapter-backed provenance ledgers."""

    cid: str | None = None
    dataset_id: str | None = None
    model_id: str | None = None
    process_id: str | None = None
    event_id: str | None = None
    policy_outcome: CapabilityDecisionOutcome | str | None = None
    actor_did: str | None = None
    after: datetime | None = None
    before: datetime | None = None
    limit: int | None = None


class ProvenanceLedger:
    """Small in-memory ledger useful for tests and adapter fallbacks."""

    def __init__(self, records: Sequence[ProvenanceLedgerRecord] = ()) -> None:
        self._records: dict[str, ProvenanceLedgerRecord] = {}
        self._order: list[str] = []
        for record in records:
            self.record(record)

    def record(self, record: ProvenanceLedgerRecord) -> ProvenanceLedgerReceipt:
        """Store one record idempotently by ``record_id``."""
        if record.record_id not in self._records:
            self._order.append(record.record_id)
        self._records[record.record_id] = record
        return ProvenanceLedgerReceipt(record=record, cid=record.record_cid)

    def append(self, record: ProvenanceLedgerRecord) -> ProvenanceLedgerReceipt:
        """Alias for ``record`` for callers that treat the ledger as a log."""
        return self.record(record)

    def record_run(self, **kwargs: Any) -> ProvenanceLedgerReceipt:
        """Build and store a ``ProvenanceLedgerRecord`` from keyword fields."""
        return self.record(ProvenanceLedgerRecord(**kwargs))

    def get(self, record_id: str) -> ProvenanceLedgerRecord | None:
        """Return a record by record id or record CID."""
        if record_id in self._records:
            return self._records[record_id]
        for record in self._records.values():
            if record.record_cid == record_id or record.cid == record_id:
                return record
        return None

    def records(self) -> tuple[ProvenanceLedgerRecord, ...]:
        """Return records in insertion order."""
        return tuple(self._records[record_id] for record_id in self._order)

    def query(self, query: ProvenanceQuery | None = None, **filters: Any) -> tuple[ProvenanceLedgerRecord, ...]:
        """Return records matching provenance filters."""
        criteria = query or ProvenanceQuery(**filters)
        matches = [record for record in self.records() if _record_matches(record, criteria)]
        if criteria.limit is not None:
            matches = matches[: max(0, criteria.limit)]
        return tuple(matches)

    def to_json_list(self) -> list[dict[str, Any]]:
        """Return all records as stable JSON objects."""
        return [record.to_json_dict() for record in self.records()]

    def stable_json(self) -> str:
        """Return deterministic JSON serialization for the full ledger."""
        return canonical_provenance_json(self.to_json_list())

    def export_json(self) -> str:
        """Return deterministic JSON serialization for adapter compatibility."""
        return self.stable_json()


def dataset_reference(value: Any) -> Any:
    """Return a stable JSON-friendly dataset reference."""
    if value is None:
        return None
    if isinstance(value, DatasetRef):
        return {
            "dataset_id": value.dataset_id,
            "uri": value.uri,
            "name": value.name,
            "version": value.version,
            "cid": value.cid,
            "split": value.split,
            "format": value.format,
            "schema": provenance_safe(value.schema),
            "row_count": value.row_count,
            "storage_refs": [provenance_safe(ref) for ref in value.storage_refs],
            "loaded_at": value.loaded_at.isoformat() if value.loaded_at else None,
            "metadata": provenance_safe(value.metadata),
        }
    if isinstance(value, str):
        dataset_id = value
        return {
            "dataset_id": dataset_id,
            "uri": value if "://" in value else f"dataset://{dataset_id}",
            "cid": _cid_from_uri(value),
        }
    return provenance_safe(value)


def model_reference(value: Any) -> Any:
    """Return a stable JSON-friendly model reference."""
    if value is None:
        return None
    if isinstance(value, LoadedModel):
        return {
            "handle_id": value.handle_id,
            "model": model_reference(value.model),
            "state": _enum_value(value.state),
            "backend": _enum_value(value.backend),
            "device_id": value.device_id,
            "precision": _enum_value(value.precision),
            "loaded_at": value.loaded_at.isoformat(),
            "endpoint_id": value.endpoint_id,
            "worker_id": value.worker_id,
            "metadata": provenance_safe(value.metadata),
        }
    if isinstance(value, ModelRef):
        return {
            "model_id": value.model_id,
            "uri": value.uri,
            "name": value.name,
            "version": value.version,
            "revision": value.revision,
            "provider": value.provider,
            "format": _enum_value(value.format),
            "task": _enum_value(value.task) if value.task is not None else None,
            "cid": value.cid,
            "storage_refs": [provenance_safe(ref) for ref in value.storage_refs],
            "metadata": provenance_safe(value.metadata),
        }
    if isinstance(value, str):
        return {
            "model_id": value,
            "uri": value if "://" in value else model_uri(value),
            "cid": _cid_from_uri(value),
        }
    return provenance_safe(value)


def prompt_reference(value: Any) -> Any:
    """Return a stable JSON-friendly prompt reference."""
    if value is None:
        return None
    if isinstance(value, PromptRecord):
        return value.provenance_dict()
    if isinstance(value, str):
        return {"text": value, "cid": None, "redacted": False}
    return provenance_safe(value)


def output_reference(value: Any) -> Any:
    """Return a stable JSON-friendly model output reference."""
    if value is None:
        return None
    if isinstance(value, ModelOutputRecord):
        return value.provenance_dict()
    if isinstance(value, InferenceOutput):
        return ModelOutputRecord.from_inference_output(value).provenance_dict()
    if isinstance(value, str):
        return {"text": value, "cid": None}
    return provenance_safe(value)


def agent_process_reference(value: Any) -> Any:
    """Return a stable JSON-friendly process reference."""
    if value is None:
        return None
    if isinstance(value, AgentProcessRef):
        return value.provenance_dict()
    if isinstance(value, (AgentProcessSpec, AgentProcessStatus, ProcessSpec, ProcessStatus)):
        return AgentProcessRef.from_process(value).provenance_dict()
    if isinstance(value, str):
        return {"process_id": value, "resource_uri": process_uri(value)}
    return provenance_safe(value)


def policy_decision_reference(value: Any) -> Any:
    """Return a stable JSON-friendly policy decision reference."""
    if value is None:
        return None
    if isinstance(value, PolicyDecisionRef):
        return value.provenance_dict()
    if isinstance(value, CapabilityDecision):
        return PolicyDecisionRef.from_capability_decision(value).provenance_dict()
    if isinstance(value, str):
        return {"decision_id": value}
    return provenance_safe(value)


def event_reference(value: Any) -> Any:
    """Return a stable JSON-friendly event reference."""
    if value is None:
        return None
    if isinstance(value, EventReference):
        return value.provenance_dict()
    if isinstance(value, (EventEnvelope, MCPEventDAGNode)):
        return EventReference.from_event(value).provenance_dict()
    if isinstance(value, str):
        return {"event_id": value}
    return provenance_safe(value)


def provenance_safe(value: Any) -> Any:
    """Return a deterministic JSON-friendly provenance value."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        return {
            "bytes": len(value),
            "sha256": hashlib.sha256(value).hexdigest(),
            "redacted": True,
        }
    if hasattr(value, "provenance_dict"):
        return value.provenance_dict()
    if isinstance(value, EventEnvelope):
        return event_reference(value)
    if isinstance(value, IdentityRef):
        return {
            "did": value.did,
            "display_name": value.display_name,
            "roles": list(value.roles),
            "public_key_refs": list(value.public_key_refs),
            "metadata": provenance_safe(value.metadata),
        }
    if isinstance(value, ResourceRef):
        return {
            "uri": value.uri,
            "kind": _enum_value(value.kind),
            "component": value.component,
            "name": value.name,
            "labels": dict(sorted(value.labels.items())),
            "metadata": provenance_safe(value.metadata),
        }
    if isinstance(value, StorageRef):
        return {
            "uri": value.uri,
            "cid": value.cid,
            "path": value.path,
            "size_bytes": value.size_bytes,
            "media_type": value.media_type,
            "metadata": provenance_safe(value.metadata),
        }
    if isinstance(value, Mapping):
        return {str(key): provenance_safe(value[key]) for key in sorted(value, key=str)}
    if isinstance(value, Sequence):
        return [provenance_safe(item) for item in value]
    if hasattr(value, "__dataclass_fields__"):
        return {
            field_name: provenance_safe(getattr(value, field_name))
            for field_name in sorted(value.__dataclass_fields__)
        }
    return str(value)


def canonical_provenance_json(value: Any) -> str:
    """Return deterministic JSON for ledger storage, ids, and CIDs."""
    return json.dumps(provenance_safe(value), sort_keys=True, separators=(",", ":"), default=str)


def stable_provenance_id(*parts: object) -> str:
    """Return a deterministic sha256 id for provenance records."""
    payload = "\x1f".join(str(part) for part in parts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def stable_provenance_cid(value: Any) -> str:
    """Return a deterministic CID-like digest for a provenance value."""
    digest = stable_provenance_id("provenance-cid", canonical_provenance_json(value))
    return f"sha256:{digest}"


def _record_matches(record: ProvenanceLedgerRecord, query: ProvenanceQuery) -> bool:
    if query.cid and query.cid not in _record_cids(record):
        return False
    if query.dataset_id:
        dataset = dataset_reference(record.dataset) or {}
        if str(dataset.get("dataset_id") or dataset.get("name") or dataset.get("uri")) != query.dataset_id:
            return False
    if query.model_id:
        model = model_reference(record.model) or {}
        candidate = model.get("model_id") or (model.get("model") or {}).get("model_id") or model.get("uri")
        if str(candidate) != query.model_id:
            return False
    if query.process_id:
        process = agent_process_reference(record.agent_process) or {}
        if str(process.get("process_id")) != query.process_id:
            return False
    if query.event_id and query.event_id not in record.event_ids:
        return False
    if query.policy_outcome is not None:
        decision = policy_decision_reference(record.policy_decision) or {}
        if str(decision.get("outcome")) != str(_enum_value(query.policy_outcome)):
            return False
    if query.actor_did and (record.actor is None or record.actor.did != query.actor_did):
        return False
    if query.after and record.created_at <= query.after:
        return False
    if query.before and record.created_at >= query.before:
        return False
    return True


def _record_cids(record: ProvenanceLedgerRecord) -> set[str | None]:
    cids = {record.cid, record.record_cid}
    for ref in (
        dataset_reference(record.dataset),
        model_reference(record.model),
        prompt_reference(record.prompt),
        output_reference(record.output),
    ):
        if isinstance(ref, Mapping):
            cids.add(ref.get("cid"))
            nested = ref.get("model")
            if isinstance(nested, Mapping):
                cids.add(nested.get("cid"))
    for event in record.events:
        ref = event_reference(event)
        if isinstance(ref, Mapping):
            cids.add(ref.get("event_cid"))
    return cids


def _primary_reference_cid(*values: Any) -> str | None:
    for value in values:
        ref = provenance_safe(value)
        if isinstance(ref, Mapping):
            cid = ref.get("cid")
            if cid:
                return str(cid)
            nested = ref.get("model")
            if isinstance(nested, Mapping) and nested.get("cid"):
                return str(nested["cid"])
    return None


def _cid_from_uri(value: str) -> str | None:
    if value.startswith("ipfs://"):
        return value[len("ipfs://") :].split("/", 1)[0] or None
    return None


def _enum_value(value: Any) -> Any:
    return value.value if isinstance(value, Enum) else value


@runtime_checkable
class ProvenanceLedgerAdapter(Protocol):
    """Adapter boundary for persistent provenance ledger implementations."""

    def record(self, record: ProvenanceLedgerRecord) -> MaybeAwaitable[ProvenanceLedgerReceipt]:
        """Persist one provenance ledger record."""

    def get(self, record_id: str) -> MaybeAwaitable[ProvenanceLedgerRecord | None]:
        """Return a record by record id or CID."""

    def query(self, query: ProvenanceQuery) -> MaybeAwaitable[Sequence[ProvenanceLedgerRecord]]:
        """Return records matching provenance filters."""

    def export_json(self) -> MaybeAwaitable[str]:
        """Return deterministic JSON serialization of the ledger."""


ProvenanceRecord = ProvenanceLedgerRecord


__all__ = [
    "AgentProcessRef",
    "EventReference",
    "ModelOutputRecord",
    "PROVENANCE_SCHEMA_VERSION",
    "PolicyDecisionRef",
    "PromptRecord",
    "ProvenanceContractError",
    "ProvenanceLedger",
    "ProvenanceLedgerAdapter",
    "ProvenanceLedgerReceipt",
    "ProvenanceLedgerRecord",
    "ProvenanceQuery",
    "ProvenanceRecord",
    "ProvenanceRecordKind",
    "VIRTUAL_OS_PROVENANCE_COMPONENT",
    "agent_process_reference",
    "canonical_provenance_json",
    "dataset_reference",
    "event_reference",
    "model_reference",
    "output_reference",
    "policy_decision_reference",
    "prompt_reference",
    "provenance_safe",
    "stable_provenance_cid",
    "stable_provenance_id",
]
