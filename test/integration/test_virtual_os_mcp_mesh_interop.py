import hashlib
import json
import sys
import unittest
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.compute import (  # noqa: E402
    ComputeTaskRequest,
    ComputeTaskState,
    ComputeTaskStatus,
    ModelComputeOperation,
    ModelRef,
)
from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    CapabilityAction,
    CapabilityDenied,
    CapabilityGrant,
    EventEnvelope,
    IdentityRef,
    ResourceKind,
    ResourceRef,
)
from hallucinate_app.virtual_os.events import EventCategory, mcp_event_dag_mapping  # noqa: E402
from hallucinate_app.virtual_os.security import (  # noqa: E402
    CapabilityCheck,
    CapabilityDecision,
    CapabilityDecisionOutcome,
    CapabilityGrantSource,
    InMemoryRevocationRegistry,
    LocalCapabilityAuthority,
    service_resource,
)


TRACE_ID = "trace-os-027-mcp-mesh-interop"
FIXED_TIME = datetime(2026, 5, 22, 16, 0, 0, tzinfo=timezone.utc)
CORE_MCP_PLUS_PLUS_PROFILES = {
    "mcp++/idl",
    "mcp++/cid-envelope",
    "mcp++/ucan",
    "mcp++/event-dag",
    "mcp++/risk-scheduler",
}


def load_profile() -> dict[str, Any]:
    with (PROJECT_ROOT / "config" / "mcp_plus_plus_profile.json").open("r", encoding="utf-8") as handle:
        return json.load(handle)


def fake_cid(label: str) -> str:
    digest = hashlib.sha256(label.encode("utf-8")).hexdigest()
    return f"bafy{digest[:52]}"


def cid_like(value: Any) -> bool:
    return isinstance(value, str) and value.startswith(("bafy", "bafk", "Qm")) and len(value) >= 12


def service_requirements(profile: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {service["serviceId"]: service for service in profile["serviceRequirements"]}


@dataclass(frozen=True)
class MeshHandshake:
    session_id: str
    client_id: str
    service_id: str
    initialize: dict[str, Any]
    service_descriptor: dict[str, Any]
    interface_descriptor: dict[str, Any]
    descriptor_cid: str
    interface_cid: str
    event: EventEnvelope


@dataclass(frozen=True)
class MeshInvocationResult:
    task_status: ComputeTaskStatus
    execution_envelope: dict[str, Any]
    result_envelope: dict[str, Any]
    events: tuple[EventEnvelope, ...]


class MockDescriptorRepository:
    def __init__(self, profile: dict[str, Any]) -> None:
        self.profile = profile
        self.services = service_requirements(profile)

    def service_descriptor(self, service_id: str) -> dict[str, Any]:
        service = self.services[service_id]
        interface_cid = self.interface_cid(service_id)
        descriptor_cid = self.descriptor_cid(service_id)
        return {
            "service_id": service_id,
            "component": service["component"],
            "title": service_id.replace("-", " ").title(),
            "version": self.profile["profileVersion"],
            "endpoints": [
                {
                    "protocol": self.profile["transport"]["baseline"]["supportedEndpointProtocols"][0],
                    "address": f"offline://mesh/{service_id}",
                }
            ],
            "capabilities": list(service["requiredCapabilities"]),
            "resources": list(service["resourceClaims"]),
            "metadata": {
                "mcp_plus_plus": {
                    "profile_id": self.profile["id"],
                    "profile_version": self.profile["profileVersion"],
                    "supported_profiles": list(service["minimumProfiles"]),
                    "interface_cids": [interface_cid],
                    "descriptor_cids": [descriptor_cid],
                    "event_streams": list(service["emittedEventStreams"]),
                    "scheduler_class": self.profile["scheduler"]["frontier"],
                    "authorization_required": True,
                    "transport_bindings": [
                        {
                            "transport_id": self.profile["transport"]["baseline"]["id"],
                            "protocol": self.profile["transport"]["baseline"]["supportedEndpointProtocols"][0],
                            "address": f"offline://mesh/{service_id}",
                        }
                    ],
                }
            },
        }

    def interface_descriptor(self, service_id: str) -> dict[str, Any]:
        service = self.services[service_id]
        return {
            "name": service_id,
            "namespace": service["descriptorNamespace"],
            "version": self.profile["profileVersion"],
            "methods": [
                {
                    "name": method,
                    "input_schema_cid": fake_cid(f"{service_id}:{method}:input-schema"),
                    "output_schema_cid": fake_cid(f"{service_id}:{method}:output-schema"),
                }
                for method in service["requiredInterfaces"]
            ],
            "errors": [
                {
                    "code": "capability_denied",
                    "message": "A matching MCP++ UCAN grant is required.",
                }
            ],
            "requires": list(service["minimumProfiles"]),
            "compatibility": {
                "compatible": True,
                "reasons": [],
                "requires_missing": [],
                "suggested_alternatives": [],
            },
            "schema_hash": fake_cid(f"{service_id}:interface-schema"),
        }

    def interface_cid(self, service_id: str) -> str:
        return fake_cid(f"{service_id}:interface")

    def descriptor_cid(self, service_id: str) -> str:
        return fake_cid(f"{service_id}:descriptor")


class MockMeshEventDAG:
    def __init__(self) -> None:
        self.events: list[EventEnvelope] = []

    def emit(
        self,
        event_type: str,
        *,
        actor: IdentityRef | None = None,
        subject: ResourceRef | None = None,
        parent_event_ids: tuple[str, ...] = (),
        payload: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        source: str = "mock-mcp-plus-plus-mesh",
    ) -> EventEnvelope:
        sequence = len(self.events) + 1
        occurred_at = FIXED_TIME + timedelta(seconds=sequence)
        event_cid = fake_cid(f"event:{sequence}:{event_type}:{subject.uri if subject else ''}")
        payload = dict(payload or {})
        metadata = dict(metadata or {})
        interface_cid = metadata.get("interface_cid") or payload.get("interface_cid") or fake_cid("interface:mesh")
        proof_cid = metadata.get("proof_cid") or payload.get("proof_cid") or fake_cid("proof:mesh")
        decision_cid = metadata.get("decision_cid") or payload.get("decision_cid") or fake_cid(f"decision:{event_cid}")
        output_cid = metadata.get("output_cid") or payload.get("output_cid") or fake_cid(f"output:{event_cid}")
        receipt_cid = metadata.get("receipt_cid") or payload.get("receipt_cid") or fake_cid(f"receipt:{event_cid}")

        event = EventEnvelope(
            event_id=event_cid,
            event_type=event_type,
            source=source,
            occurred_at=occurred_at,
            actor=actor,
            subject=subject,
            trace_id=TRACE_ID,
            correlation_id="correlation-os-027",
            parent_event_ids=parent_event_ids,
            payload={
                "parents": list(parent_event_ids),
                "interface_cid": interface_cid,
                "intent_cid": payload.get("intent_cid") or fake_cid(f"intent:{event_cid}"),
                "proof_cid": proof_cid,
                "decision_cid": decision_cid,
                "output_cid": output_cid,
                "receipt_cid": receipt_cid,
                "peer_did": "did:key:z6MkMockMeshPeer",
                "timestamps": {
                    "observed": occurred_at.isoformat(),
                },
                **payload,
            },
            metadata={
                "category": EventCategory.MCP_DAG.value,
                "event_cid": event_cid,
                "interface_cid": interface_cid,
                "proof_cid": proof_cid,
                "decision_cid": decision_cid,
                "output_cid": output_cid,
                "receipt_cid": receipt_cid,
                **metadata,
            },
        )
        self.events.append(event)
        return event

    def ordering_errors(self, events: list[EventEnvelope] | None = None) -> list[str]:
        seen: set[str] = set()
        errors: list[str] = []
        for event in events or self.events:
            if event.event_id in seen:
                errors.append(f"duplicate event: {event.event_id}")
            for parent_id in event.parent_event_ids:
                if parent_id == event.event_id:
                    errors.append(f"event cannot parent itself: {event.event_id}")
                if parent_id not in seen:
                    errors.append(f"parent must appear before child: {parent_id} -> {event.event_id}")
            seen.add(event.event_id)
        return errors

    def profile_field_errors(self, profile: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        for event in self.events:
            for field in profile["eventDag"]["eventNodeRequiredFields"]:
                if field not in event.payload:
                    errors.append(f"{event.event_id} missing {field}")
        return errors


class MockMCPMesh:
    def __init__(self, profile: dict[str, Any]) -> None:
        self.profile = profile
        self.descriptors = MockDescriptorRepository(profile)
        self.events = MockMeshEventDAG()
        self.issuer = IdentityRef(did="did:key:z6MkMeshIssuer", roles=("mesh",))
        self.revocations = InMemoryRevocationRegistry()
        self.authority = LocalCapabilityAuthority(issuer=self.issuer, revocations=self.revocations)
        self.last_decision: CapabilityDecision | None = None
        self.last_denial_event: EventEnvelope | None = None

    def handshake(self, *, client_id: str, service_id: str, client_profiles: set[str]) -> MeshHandshake:
        if not CORE_MCP_PLUS_PLUS_PROFILES.issubset(client_profiles):
            raise AssertionError("client omitted a required MCP++ profile")

        service_descriptor = self.descriptors.service_descriptor(service_id)
        interface_descriptor = self.descriptors.interface_descriptor(service_id)
        mcp_metadata = service_descriptor["metadata"]["mcp_plus_plus"]
        if not CORE_MCP_PLUS_PLUS_PROFILES.issubset(set(mcp_metadata["supported_profiles"])):
            raise AssertionError("service omitted a required MCP++ profile")

        interface_cid = mcp_metadata["interface_cids"][0]
        descriptor_cid = mcp_metadata["descriptor_cids"][0]
        event = self.events.emit(
            "mcp_plus_plus.descriptor.handshake",
            actor=IdentityRef(did=f"did:key:{client_id}", roles=("agent-shell",)),
            subject=service_resource(service_id),
            payload={
                "client_id": client_id,
                "service_id": service_id,
                "descriptor_cid": descriptor_cid,
                "interface_cid": interface_cid,
                "transport_id": self.profile["transport"]["baseline"]["id"],
                "supported_profiles": mcp_metadata["supported_profiles"],
            },
            metadata={
                "interface_cid": interface_cid,
                "output_cid": descriptor_cid,
                "receipt_cid": fake_cid(f"receipt:handshake:{service_id}"),
            },
        )
        return MeshHandshake(
            session_id=f"session-{client_id}-{service_id}",
            client_id=client_id,
            service_id=service_id,
            initialize={
                "protocol": self.profile["transport"]["baseline"]["id"],
                "client_capabilities": {"mcp_plus_plus_profiles": sorted(client_profiles)},
                "server_capabilities": {"mcp_plus_plus_profiles": mcp_metadata["supported_profiles"]},
            },
            service_descriptor=service_descriptor,
            interface_descriptor=interface_descriptor,
            descriptor_cid=descriptor_cid,
            interface_cid=interface_cid,
            event=event,
        )

    def grant_capability(
        self,
        handshake: MeshHandshake,
        *,
        audience: IdentityRef,
        method: str,
    ) -> tuple[CapabilityGrant, EventEnvelope]:
        grant = CapabilityGrant(
            grant_id="grant-os-027-task-submit",
            action=CapabilityAction.EXECUTE,
            resource=service_resource(handshake.service_id),
            issuer=self.issuer,
            audience=audience,
            token_ref=f"ucan://{fake_cid('ucan:os-027-task-submit')}",
            constraints={"service_id": handshake.service_id, "method": method},
            delegated_from=(handshake.descriptor_cid,),
            metadata={
                "source": CapabilityGrantSource.UCAN.value,
                "capability_id": "mcp++/invoke",
                "proof_cid": fake_cid("proof:os-027-task-submit"),
                "interface_cid": handshake.interface_cid,
            },
        )
        self.authority.add_grant(grant)
        event = self.events.emit(
            "mcp_plus_plus.ucan.granted",
            actor=self.issuer,
            subject=grant.resource,
            parent_event_ids=(handshake.event.event_id,),
            payload={
                "grant_id": grant.grant_id,
                "audience_did": audience.did,
                "method": method,
                "proof_cid": grant.metadata["proof_cid"],
                "interface_cid": handshake.interface_cid,
                "decision_outcome": CapabilityDecisionOutcome.ALLOW.value,
            },
            metadata={
                "interface_cid": handshake.interface_cid,
                "proof_cid": grant.metadata["proof_cid"],
            },
        )
        return grant, event

    def build_execution_envelope(
        self,
        handshake: MeshHandshake,
        *,
        method: str,
        payload_cid: str,
        grant: CapabilityGrant,
        parent_event_ids: tuple[str, ...],
    ) -> dict[str, Any]:
        intent_cid = fake_cid(f"intent:{handshake.session_id}:{method}:{payload_cid}")
        return {
            "interface_cid": handshake.interface_cid,
            "input_cid": payload_cid,
            "intent_cid": intent_cid,
            "parents": list(parent_event_ids),
            "policy_cid": fake_cid(f"policy:{handshake.service_id}:{method}"),
            "proof_cid": grant.metadata["proof_cid"],
            "correlation_id": "correlation-os-027",
            "created_at": FIXED_TIME.isoformat(),
            "method": method,
            "service_id": handshake.service_id,
        }

    def submit_task(
        self,
        handshake: MeshHandshake,
        request: ComputeTaskRequest,
        envelope: dict[str, Any],
        grant: CapabilityGrant,
    ) -> MeshInvocationResult:
        method = str(envelope["method"])
        decision = self.authority.authorize(
            CapabilityCheck(
                actor=request.actor,
                action=CapabilityAction.EXECUTE,
                resource=service_resource(handshake.service_id),
                capabilities=(grant,),
                operation=method,
                service_id=handshake.service_id,
                trace_id=request.trace_id,
                context={"service_id": handshake.service_id, "method": method},
            )
        )
        self.last_decision = decision
        decision_cid = fake_cid(f"decision:{decision.outcome}:{grant.grant_id}:{len(self.events.events)}")
        policy_event = self.events.emit(
            "mcp_plus_plus.policy.decided",
            actor=request.actor,
            subject=service_resource(handshake.service_id),
            parent_event_ids=tuple(envelope["parents"]),
            payload={
                "intent_cid": envelope["intent_cid"],
                "decision_cid": decision_cid,
                "decision_outcome": decision.outcome.value
                if hasattr(decision.outcome, "value")
                else decision.outcome,
                "matched_grant_id": decision.matched_grant.grant_id if decision.matched_grant else None,
                "proof_cid": grant.metadata["proof_cid"],
                "interface_cid": handshake.interface_cid,
            },
            metadata={
                "interface_cid": handshake.interface_cid,
                "proof_cid": grant.metadata["proof_cid"],
                "decision_cid": decision_cid,
            },
        )
        if not decision.allowed:
            self.last_denial_event = self.events.emit(
                "mcp_plus_plus.invocation.denied",
                actor=request.actor,
                subject=service_resource(handshake.service_id),
                parent_event_ids=(policy_event.event_id,),
                payload={
                    "intent_cid": envelope["intent_cid"],
                    "decision_cid": decision_cid,
                    "decision_outcome": CapabilityDecisionOutcome.DENY.value,
                    "grant_id": grant.grant_id,
                    "proof_cid": grant.metadata["proof_cid"],
                    "interface_cid": handshake.interface_cid,
                    "reason": decision.reason,
                },
                metadata={
                    "interface_cid": handshake.interface_cid,
                    "proof_cid": grant.metadata["proof_cid"],
                    "decision_cid": decision_cid,
                },
            )
            raise CapabilityDenied(decision.reason)

        envelope_cid = fake_cid(f"envelope:{envelope['intent_cid']}")
        enqueued_event = self.events.emit(
            "mcp_plus_plus.invocation.enqueued",
            actor=request.actor,
            subject=service_resource(handshake.service_id),
            parent_event_ids=(policy_event.event_id,),
            payload={
                "task_id": request.task_id,
                "intent_cid": envelope["intent_cid"],
                "envelope_cid": envelope_cid,
                "proof_cid": grant.metadata["proof_cid"],
                "interface_cid": handshake.interface_cid,
                "priority_hint": request.priority,
                "parent_event_cids": list(envelope["parents"]),
                "capability_grants": [grant.grant_id],
            },
            metadata={
                "interface_cid": handshake.interface_cid,
                "proof_cid": grant.metadata["proof_cid"],
            },
        )
        started_event = self.events.emit(
            "mcp_plus_plus.invocation.started",
            actor=request.actor,
            subject=service_resource(handshake.service_id),
            parent_event_ids=(enqueued_event.event_id,),
            payload={
                "task_id": request.task_id,
                "intent_cid": envelope["intent_cid"],
                "proof_cid": grant.metadata["proof_cid"],
                "interface_cid": handshake.interface_cid,
            },
            metadata={
                "interface_cid": handshake.interface_cid,
                "proof_cid": grant.metadata["proof_cid"],
            },
        )

        output_cid = fake_cid(f"output:{request.task_id}:{envelope['input_cid']}")
        receipt_cid = fake_cid(f"receipt:{request.task_id}:{output_cid}")
        task_status = ComputeTaskStatus(
            task_id=request.task_id or "mesh-task",
            operation=ModelComputeOperation.SUBMIT_TASK,
            state=ComputeTaskState.COMPLETED,
            model=ModelRef(model_id=str(request.model or "mock-mesh-model")),
            actor=request.actor,
            queue_id=request.queue_id,
            priority=request.priority,
            completed_at=FIXED_TIME + timedelta(seconds=len(self.events.events) + 2),
            progress=1.0,
            attempts=1,
            result_ref=ResourceRef(
                uri=f"ipfs://{output_cid}",
                kind=ResourceKind.STORAGE,
                component="ipfs_accelerate_py",
                name="mcp-mesh-result",
            ),
            metadata={
                "method": method,
                "input_cid": envelope["input_cid"],
                "intent_cid": envelope["intent_cid"],
            },
        )
        completed_event = self.events.emit(
            "mcp_plus_plus.invocation.completed",
            actor=request.actor,
            subject=task_status.resource(),
            parent_event_ids=(started_event.event_id,),
            payload={
                "task_id": task_status.task_id,
                "intent_cid": envelope["intent_cid"],
                "proof_cid": grant.metadata["proof_cid"],
                "decision_cid": decision_cid,
                "output_cid": output_cid,
                "receipt_cid": receipt_cid,
                "interface_cid": handshake.interface_cid,
                "decision_outcome": CapabilityDecisionOutcome.ALLOW.value,
            },
            metadata={
                "interface_cid": handshake.interface_cid,
                "proof_cid": grant.metadata["proof_cid"],
                "decision_cid": decision_cid,
                "output_cid": output_cid,
                "receipt_cid": receipt_cid,
            },
        )
        result_envelope = {
            "intent_cid": envelope["intent_cid"],
            "output_cid": output_cid,
            "proofs_checked": [grant.metadata["proof_cid"]],
            "decision_cid": decision_cid,
            "time_observed": completed_event.occurred_at.isoformat(),
            "receipt_cid": receipt_cid,
            "envelope_cid": envelope_cid,
            "correlation_id": envelope["correlation_id"],
            "event_cid": completed_event.event_id,
            "ok": True,
            "task_id": task_status.task_id,
            "state": ComputeTaskState.COMPLETED.value,
            "result_ref": task_status.result_ref.uri if task_status.result_ref else None,
        }
        receipt_event = self.events.emit(
            "mcp_plus_plus.receipt.emitted",
            actor=request.actor,
            subject=task_status.resource(),
            parent_event_ids=(completed_event.event_id,),
            payload={
                **result_envelope,
                "interface_cid": handshake.interface_cid,
                "proof_cid": grant.metadata["proof_cid"],
                "decision_outcome": CapabilityDecisionOutcome.ALLOW.value,
            },
            metadata={
                "interface_cid": handshake.interface_cid,
                "proof_cid": grant.metadata["proof_cid"],
                "decision_cid": decision_cid,
                "output_cid": output_cid,
                "receipt_cid": receipt_cid,
            },
        )
        return MeshInvocationResult(
            task_status=task_status,
            execution_envelope=envelope,
            result_envelope=result_envelope,
            events=(policy_event, enqueued_event, started_event, completed_event, receipt_event),
        )

    def revoke_capability(
        self,
        grant: CapabilityGrant,
        *,
        parent_event_id: str,
        reason: str,
    ) -> EventEnvelope:
        self.authority.revoke(grant.grant_id, issuer=self.issuer, reason=reason)
        return self.events.emit(
            self.profile["ucanDelegation"]["revocation"]["auditEventType"],
            actor=self.issuer,
            subject=grant.resource,
            parent_event_ids=(parent_event_id,),
            payload={
                "grant_id": grant.grant_id,
                "issuer_did": grant.issuer.did,
                "audience_did": grant.audience.did,
                "proof_cid": grant.metadata["proof_cid"],
                "reason": reason,
                "decision_outcome": "revoke",
            },
            metadata={
                "interface_cid": grant.metadata["interface_cid"],
                "proof_cid": grant.metadata["proof_cid"],
            },
        )


class TestVirtualOSMCPMeshInterop(unittest.TestCase):
    def setUp(self) -> None:
        self.profile = load_profile()
        self.mesh = MockMCPMesh(self.profile)
        self.actor = IdentityRef(did="did:key:z6MkSwissKnifeAgent", roles=("agent", "agent-shell"))

    def assert_descriptor_handshake(self, handshake: MeshHandshake) -> None:
        metadata = handshake.service_descriptor["metadata"]["mcp_plus_plus"]
        self.assertEqual(handshake.initialize["protocol"], "mcp-json-rpc")
        self.assertEqual(handshake.service_id, "ipfs-accelerate-mcp")
        self.assertTrue(cid_like(handshake.descriptor_cid))
        self.assertTrue(cid_like(handshake.interface_cid))
        self.assertIn("stdio", [endpoint["protocol"] for endpoint in handshake.service_descriptor["endpoints"]])
        self.assertTrue(CORE_MCP_PLUS_PLUS_PROFILES.issubset(set(metadata["supported_profiles"])))
        self.assertEqual(metadata["interface_cids"], [handshake.interface_cid])
        self.assertEqual(metadata["descriptor_cids"], [handshake.descriptor_cid])
        self.assertTrue(metadata["authorization_required"])

        required_interface_fields = set(self.profile["idl"]["descriptorRequiredFields"])
        self.assertTrue(required_interface_fields.issubset(handshake.interface_descriptor))
        method_names = {method["name"] for method in handshake.interface_descriptor["methods"]}
        self.assertIn("task.submit", method_names)
        for method in handshake.interface_descriptor["methods"]:
            self.assertTrue(cid_like(method["input_schema_cid"]))
            self.assertTrue(cid_like(method["output_schema_cid"]))

    def assert_result_envelope(self, result: MeshInvocationResult, grant: CapabilityGrant) -> None:
        envelope = result.execution_envelope
        receipt = result.result_envelope
        for field in self.profile["envelope"]["executionEnvelopeRequiredFields"]:
            self.assertIn(field, envelope)
        for field in self.profile["envelope"]["receiptRequiredFields"]:
            self.assertIn(field, receipt)

        self.assertTrue(cid_like(envelope["interface_cid"]))
        self.assertTrue(cid_like(envelope["input_cid"]))
        self.assertTrue(cid_like(envelope["intent_cid"]))
        self.assertEqual(receipt["intent_cid"], envelope["intent_cid"])
        self.assertTrue(cid_like(receipt["output_cid"]))
        self.assertTrue(cid_like(receipt["decision_cid"]))
        self.assertTrue(cid_like(receipt["receipt_cid"]))
        self.assertTrue(cid_like(receipt["envelope_cid"]))
        self.assertEqual(receipt["proofs_checked"], [grant.metadata["proof_cid"]])
        self.assertTrue(receipt["ok"])
        self.assertEqual(receipt["state"], ComputeTaskState.COMPLETED.value)
        self.assertEqual(result.task_status.state, ComputeTaskState.COMPLETED)
        self.assertEqual(result.task_status.result_ref.uri, f"ipfs://{receipt['output_cid']}")

    def test_mock_mesh_interop_covers_handshake_grant_submission_result_revocation_and_dag(self) -> None:
        handshake = self.mesh.handshake(
            client_id="swissknife-mcp",
            service_id="ipfs-accelerate-mcp",
            client_profiles=CORE_MCP_PLUS_PLUS_PROFILES,
        )
        self.assert_descriptor_handshake(handshake)

        grant, grant_event = self.mesh.grant_capability(
            handshake,
            audience=self.actor,
            method="task.submit",
        )
        self.assertEqual(grant.action, CapabilityAction.EXECUTE)
        self.assertEqual(grant.resource.uri, "virtual-os://services/ipfs-accelerate-mcp")
        self.assertEqual(grant.metadata["source"], CapabilityGrantSource.UCAN.value)
        self.assertEqual(grant.metadata["proof_cid"], fake_cid("proof:os-027-task-submit"))
        self.assertEqual(grant_event.parent_event_ids, (handshake.event.event_id,))

        payload_cid = fake_cid("input:os-027-task-payload")
        envelope = self.mesh.build_execution_envelope(
            handshake,
            method="task.submit",
            payload_cid=payload_cid,
            grant=grant,
            parent_event_ids=(grant_event.event_id,),
        )
        request = ComputeTaskRequest(
            operation=ModelComputeOperation.SUBMIT_TASK,
            actor=self.actor,
            payload={
                "prompt": "summarize descriptor interoperability",
                "input_cid": payload_cid,
            },
            task_id="mesh-task-os-027",
            model="mock-mesh-model",
            queue_id="mcp-plus-plus",
            priority=7,
            capabilities=(grant,),
            trace_id=TRACE_ID,
            options={"method": "task.submit", "interface_cid": handshake.interface_cid},
        )
        result = self.mesh.submit_task(handshake, request, envelope, grant)

        self.assertTrue(self.mesh.last_decision.allowed)
        self.assert_result_envelope(result, grant)
        self.assertEqual(result.events[1].event_type, "mcp_plus_plus.invocation.enqueued")
        self.assertEqual(result.events[2].event_type, "mcp_plus_plus.invocation.started")
        self.assertEqual(result.events[3].event_type, "mcp_plus_plus.invocation.completed")
        self.assertEqual(result.events[4].event_type, "mcp_plus_plus.receipt.emitted")
        self.assertEqual(result.events[1].payload["capability_grants"], [grant.grant_id])
        self.assertEqual(result.events[1].payload["parent_event_cids"], [grant_event.event_id])

        revocation_event = self.mesh.revoke_capability(
            grant,
            parent_event_id=result.events[-1].event_id,
            reason="OS-027 verifies revoked UCAN proofs are denied before dispatch",
        )
        self.assertEqual(revocation_event.event_type, "mcp_plus_plus.ucan.revoked")
        self.assertEqual(revocation_event.payload["grant_id"], grant.grant_id)
        self.assertIsNotNone(self.mesh.revocations.find_revocation(grant))

        denied_envelope = self.mesh.build_execution_envelope(
            handshake,
            method="task.submit",
            payload_cid=fake_cid("input:os-027-revoked-task-payload"),
            grant=grant,
            parent_event_ids=(revocation_event.event_id,),
        )
        denied_request = ComputeTaskRequest(
            operation=ModelComputeOperation.SUBMIT_TASK,
            actor=self.actor,
            payload={"prompt": "this request should be denied"},
            task_id="mesh-task-os-027-revoked",
            model="mock-mesh-model",
            queue_id="mcp-plus-plus",
            priority=1,
            capabilities=(grant,),
            trace_id=TRACE_ID,
            options={"method": "task.submit", "interface_cid": handshake.interface_cid},
        )
        with self.assertRaises(CapabilityDenied):
            self.mesh.submit_task(handshake, denied_request, denied_envelope, grant)

        self.assertFalse(self.mesh.last_decision.allowed)
        self.assertEqual(self.mesh.last_decision.outcome, CapabilityDecisionOutcome.DENY)
        self.assertEqual(self.mesh.last_denial_event.event_type, "mcp_plus_plus.invocation.denied")
        self.assertEqual(self.mesh.last_denial_event.payload["grant_id"], grant.grant_id)
        self.assertEqual(self.mesh.last_denial_event.parent_event_ids, (self.mesh.events.events[-2].event_id,))

        self.assertEqual(self.mesh.events.ordering_errors(), [])
        self.assertEqual(self.mesh.events.profile_field_errors(self.profile), [])
        dag = mcp_event_dag_mapping(self.mesh.events.events, trace_id=TRACE_ID)
        self.assertEqual(dag.orphan_parent_event_ids, ())
        self.assertEqual(len(dag.nodes), len(self.mesh.events.events))
        self.assertEqual(
            len(dag.edges),
            sum(len(event.parent_event_ids) for event in self.mesh.events.events),
        )

        reversed_events = [self.mesh.events.events[-1], *self.mesh.events.events[:-1]]
        ordering_errors = self.mesh.events.ordering_errors(reversed_events)
        self.assertIn(
            f"parent must appear before child: {self.mesh.events.events[-2].event_id} -> {self.mesh.events.events[-1].event_id}",
            ordering_errors,
        )


if __name__ == "__main__":
    unittest.main()
