"""Structured audit receipts for control-surface mediation decisions.

The mediator returns the rich pre-invocation decision. This module turns that
decision into a schema-compatible ``mediation_receipt`` and persists it as
canonical JSON for later audit, debugging, and explanation surfaces.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import datetime, timezone
from enum import Enum
import json
import hashlib
import logging
import re
from pathlib import Path
from typing import Any, Mapping

_log = logging.getLogger(__name__)

from hallucinate_app.control_surface_mediator import (
    DEFAULT_CONFLICT_RESOLUTION,
    PolicyDecision,
    evaluate_control_surface_interaction,
)
from hallucinate_app.control_surface_store import stable_cid
from hallucinate_app.control_surface_logic_ir import stable_control_surface_id


RECEIPT_STORE_VERSION = "0.1.0"
MEDIATION_RECEIPT_KIND = "mediation_receipt"
DEFAULT_CONTROL_SURFACE_CONTRACT_REF = "control_surface_contract:runtime"
_REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RECEIPT_STORE_DIR = (
    _REPO_ROOT / "data" / "hallucinate_multimodal_control" / "receipts"
)
_BLOCKING_OUTCOMES = {
    "deny",
    "require_confirmation",
    "defer",
    "rate_limit",
}
_ARTIFACT_REF_FIELDS = ("artifact_type", "cid", "media_type")


@dataclass(frozen=True)
class MediationReceipt:
    """Schema-compatible audit receipt for one mediation decision."""

    receipt_id: str
    emitted_at: str
    control_surface_contract_ref: str
    interaction_envelope: dict[str, Any]
    policy_decision: dict[str, Any]
    policy_refs: list[dict[str, Any]]
    mediation_result: dict[str, Any]
    explanation: str
    receipt_links: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        payload = {
            "receipt_id": self.receipt_id,
            "emitted_at": self.emitted_at,
            "control_surface_contract_ref": self.control_surface_contract_ref,
            "interaction_envelope": dict(self.interaction_envelope),
            "policy_decision": dict(self.policy_decision),
            "policy_refs": [dict(ref) for ref in self.policy_refs],
            "mediation_result": dict(self.mediation_result),
            "explanation": self.explanation,
        }
        if self.receipt_links:
            payload["receipt_links"] = dict(self.receipt_links)
        if self.metadata:
            payload["metadata"] = dict(self.metadata)
        return payload


@dataclass(frozen=True)
class ReceiptRecord:
    """Filesystem persistence result for a stored mediation receipt."""

    receipt_id: str
    receipt_cid: str
    receipt_path: Path
    mediation_receipt: MediationReceipt

    def as_dict(self) -> dict[str, Any]:
        return {
            "receipt_id": self.receipt_id,
            "receipt_cid": self.receipt_cid,
            "receipt_path": str(self.receipt_path),
            "mediation_receipt": self.mediation_receipt.as_dict(),
        }


class MediationReceiptStore:
    """Content-addressed local store for control-surface mediation receipts."""

    def __init__(self, root_dir: str | Path | None = None) -> None:
        self.root_dir = Path(root_dir) if root_dir is not None else DEFAULT_RECEIPT_STORE_DIR
        self.record_dir = self.root_dir / "records"

    def emit(
        self,
        decision: PolicyDecision | Mapping[str, Any],
        *,
        emitted_at: str | None = None,
        control_surface_contract_ref: str = "",
        policy_refs: list[Mapping[str, Any]] | None = None,
        invoked: bool | None = None,
        receipt_links: Mapping[str, Any] | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> ReceiptRecord:
        """Build and persist a ``mediation_receipt`` for a policy decision."""

        receipt = build_mediation_receipt(
            decision,
            emitted_at=emitted_at,
            control_surface_contract_ref=control_surface_contract_ref,
            policy_refs=policy_refs,
            invoked=invoked,
            receipt_links=receipt_links,
            metadata=metadata,
        )
        return self.persist_receipt(receipt)

    def persist_receipt(self, receipt: MediationReceipt) -> ReceiptRecord:
        """Persist an already built receipt as canonical JSON."""

        self._ensure_dirs()
        receipt_payload = receipt.as_dict()
        receipt_cid = stable_cid(receipt_payload, prefix=MEDIATION_RECEIPT_KIND)
        receipt_path = self._receipt_path(receipt_cid)
        self._write_json(
            receipt_path,
            {
                "kind": "control_surface_mediation_receipt_record",
                "version": RECEIPT_STORE_VERSION,
                "receipt_id": receipt.receipt_id,
                "receipt_cid": receipt_cid,
                "mediation_receipt": receipt_payload,
            },
        )
        return ReceiptRecord(
            receipt_id=receipt.receipt_id,
            receipt_cid=receipt_cid,
            receipt_path=receipt_path,
            mediation_receipt=receipt,
        )

    def load_receipt(self, receipt_cid: str) -> dict[str, Any]:
        """Load a persisted receipt record by receipt CID."""

        return json.loads(self._receipt_path(receipt_cid).read_text(encoding="utf-8"))

    def _receipt_path(self, receipt_cid: str) -> Path:
        return self.record_dir / f"{_safe_ref(receipt_cid)}.json"

    def _ensure_dirs(self) -> None:
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self.record_dir.mkdir(parents=True, exist_ok=True)

    def _write_json(self, path: Path, value: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(_json_safe(value), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )


def build_mediation_receipt(
    decision: PolicyDecision | Mapping[str, Any],
    *,
    emitted_at: str | None = None,
    control_surface_contract_ref: str = "",
    policy_refs: list[Mapping[str, Any]] | None = None,
    invoked: bool | None = None,
    receipt_links: Mapping[str, Any] | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> MediationReceipt:
    """Return a structured receipt for a mediator ``PolicyDecision``."""

    decision_payload = _decision_payload(decision)
    interaction_envelope = dict(_as_mapping(decision_payload.get("interaction_envelope")))
    normalized_intent = dict(_as_mapping(interaction_envelope.get("normalized_intent")))
    actor = dict(_as_mapping(interaction_envelope.get("actor")))
    context = dict(_as_mapping(interaction_envelope.get("context")))
    emitted = emitted_at or _utc_now()
    outcome = str(decision_payload.get("outcome") or "")
    receipt_policy_refs = _policy_refs_from_decision(decision_payload, policy_refs)
    resolved_contract_ref = (
        control_surface_contract_ref
        or str(interaction_envelope.get("control_surface_contract_ref") or "")
        or DEFAULT_CONTROL_SURFACE_CONTRACT_REF
    )
    explanation = _human_explanation(decision_payload, interaction_envelope)
    receipt_id = stable_control_surface_id(
        "receipt",
        decision_payload.get("decision_id"),
        interaction_envelope.get("interaction_id"),
        outcome,
        emitted,
    )
    audit_metadata = _audit_metadata(
        decision_payload,
        interaction_envelope=interaction_envelope,
        normalized_intent=normalized_intent,
        actor=actor,
        context=context,
        policy_refs=receipt_policy_refs,
        metadata=metadata,
    )

    return MediationReceipt(
        receipt_id=receipt_id,
        emitted_at=emitted,
        control_surface_contract_ref=resolved_contract_ref,
        interaction_envelope=interaction_envelope,
        policy_decision=decision_payload,
        policy_refs=receipt_policy_refs,
        mediation_result=_mediation_result(decision_payload, interaction_envelope, invoked=invoked),
        explanation=explanation,
        receipt_links=_receipt_links(receipt_links),
        metadata=audit_metadata,
    )


def emit_mediation_receipt(
    decision: PolicyDecision | Mapping[str, Any],
    *,
    root_dir: str | Path | None = None,
    store: MediationReceiptStore | None = None,
    emitted_at: str | None = None,
    control_surface_contract_ref: str = "",
    policy_refs: list[Mapping[str, Any]] | None = None,
    invoked: bool | None = None,
    receipt_links: Mapping[str, Any] | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> ReceiptRecord:
    """Build and persist a ``mediation_receipt`` for an existing decision."""

    resolved_store = store or MediationReceiptStore(root_dir)
    return resolved_store.emit(
        decision,
        emitted_at=emitted_at,
        control_surface_contract_ref=control_surface_contract_ref,
        policy_refs=policy_refs,
        invoked=invoked,
        receipt_links=receipt_links,
        metadata=metadata,
    )


def mediate_and_emit_receipt(
    envelope: Any,
    active_policy_bundles: list[Any] | tuple[Any, ...] | None = None,
    *,
    root_dir: str | Path | None = None,
    store: MediationReceiptStore | None = None,
    conflict_resolution: str = DEFAULT_CONFLICT_RESOLUTION,
    decided_at: str | None = None,
    emitted_at: str | None = None,
    control_surface_contract_ref: str = "",
    invoked: bool | None = None,
    receipt_links: Mapping[str, Any] | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> ReceiptRecord:
    """Evaluate an interaction and immediately persist its decision receipt."""

    decision = evaluate_control_surface_interaction(
        envelope,
        active_policy_bundles=active_policy_bundles,
        conflict_resolution=conflict_resolution,
        decided_at=decided_at,
    )
    return emit_mediation_receipt(
        decision,
        root_dir=root_dir,
        store=store,
        emitted_at=emitted_at,
        control_surface_contract_ref=control_surface_contract_ref,
        invoked=invoked,
        receipt_links=receipt_links,
        metadata=metadata,
    )


def _policy_refs_from_decision(
    decision_payload: Mapping[str, Any],
    supplied_policy_refs: list[Mapping[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    matched_by_policy = _matched_norm_refs_by_policy(decision_payload)
    raw_refs: list[Mapping[str, Any]] = []
    if supplied_policy_refs is not None:
        raw_refs.extend(supplied_policy_refs)
    else:
        metadata = _as_mapping(decision_payload.get("metadata"))
        raw_refs.extend(
            _as_mapping(item)
            for item in metadata.get("policy_refs_considered", []) or []
        )

    raw_refs.append(
        {
            "policy_bundle_ref": _as_mapping(decision_payload.get("policy_bundle_ref")),
            "compiled_policy_cid": str(decision_payload.get("compiled_policy_cid") or ""),
        }
    )

    policy_refs: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for raw_ref in raw_refs:
        ref = _policy_ref(raw_ref, matched_by_policy)
        if not ref:
            continue
        key = _policy_ref_key(ref)
        if key in seen:
            continue
        seen.add(key)
        policy_refs.append(ref)
    return policy_refs


def _policy_ref(
    raw_ref: Mapping[str, Any],
    matched_by_policy: Mapping[tuple[str, str], list[str]],
) -> dict[str, Any] | None:
    bundle_ref = _policy_bundle_ref(_as_mapping(raw_ref.get("policy_bundle_ref")))
    compiled_policy_cid = str(raw_ref.get("compiled_policy_cid") or "")
    if not bundle_ref or not compiled_policy_cid:
        return None

    ref: dict[str, Any] = {
        "policy_bundle_ref": bundle_ref,
        "compiled_policy_cid": compiled_policy_cid,
    }
    matched_norm_refs = sorted(
        dict.fromkeys(
            [
                *matched_by_policy.get(_policy_ref_key(ref), []),
                *matched_by_policy.get((bundle_ref.get("policy_cid", ""), ""), []),
            ]
        )
    )
    if matched_norm_refs:
        ref["matched_norm_refs"] = matched_norm_refs

    artifact_refs = _compiled_artifact_refs(raw_ref.get("compiled_artifact_refs"))
    if artifact_refs:
        ref["compiled_artifact_refs"] = artifact_refs
    return ref


def _policy_bundle_ref(raw_ref: Mapping[str, Any]) -> dict[str, str]:
    policy_id = str(raw_ref.get("policy_id") or "")
    policy_cid = str(raw_ref.get("policy_cid") or "")
    if not policy_id or not policy_cid:
        return {}
    ref = {
        "policy_id": policy_id,
        "policy_cid": policy_cid,
    }
    for key in ("version", "scope", "source"):
        value = raw_ref.get(key)
        if value not in ("", None):
            ref[key] = str(value)
    return ref


def _matched_norm_refs_by_policy(decision_payload: Mapping[str, Any]) -> dict[tuple[str, str], list[str]]:
    refs: dict[tuple[str, str], list[str]] = {}
    for match in decision_payload.get("matched_norms", []) or []:
        match_payload = _as_mapping(match)
        norm_id = str(match_payload.get("norm_id") or "")
        if not norm_id:
            continue
        policy_ref = _policy_bundle_ref(_as_mapping(match_payload.get("policy_bundle_ref")))
        key = (
            policy_ref.get("policy_cid", ""),
            str(match_payload.get("compiled_policy_cid") or ""),
        )
        refs.setdefault(key, []).append(norm_id)
    return refs


def _compiled_artifact_refs(raw_refs: Any) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []
    for item in raw_refs or []:
        payload = _as_mapping(item)
        artifact_type = str(payload.get("artifact_type") or "")
        cid = str(payload.get("cid") or "")
        if not artifact_type or not cid:
            continue
        ref = {
            key: str(payload[key])
            for key in _ARTIFACT_REF_FIELDS
            if payload.get(key) not in ("", None)
        }
        refs.append(ref)
    return refs


def _mediation_result(
    decision_payload: Mapping[str, Any],
    interaction_envelope: Mapping[str, Any],
    *,
    invoked: bool | None = None,
) -> dict[str, Any]:
    effects = [
        _as_mapping(effect)
        for effect in decision_payload.get("effects", []) or []
    ]
    effect = effects[0] if effects else {}
    intent = _as_mapping(interaction_envelope.get("normalized_intent"))
    outcome = str(decision_payload.get("outcome") or effect.get("outcome") or "")
    decision_metadata = _as_mapping(decision_payload.get("metadata"))
    can_execute = decision_metadata.get("can_execute")
    if not isinstance(can_execute, bool):
        can_execute = outcome not in _BLOCKING_OUTCOMES

    return {
        "outcome": outcome,
        "invoked": bool(can_execute if invoked is None else invoked),
        "final_method": str(effect.get("method") or intent.get("method") or ""),
        "final_target_ref": str(effect.get("target_ref") or intent.get("target_ref") or ""),
        "fallback_surface": str(effect.get("fallback_surface") or ""),
        "confirmation_required": bool(
            effect.get("confirmation_required")
            or outcome == "require_confirmation"
        ),
        "rate_limit_key": str(effect.get("rate_limit_key") or ""),
    }


def _audit_metadata(
    decision_payload: Mapping[str, Any],
    *,
    interaction_envelope: Mapping[str, Any],
    normalized_intent: Mapping[str, Any],
    actor: Mapping[str, Any],
    context: Mapping[str, Any],
    policy_refs: list[dict[str, Any]],
    metadata: Mapping[str, Any] | None,
) -> dict[str, Any]:
    frame_facts = [
        dict(_as_mapping(fact))
        for fact in decision_payload.get("frame_facts", []) or []
    ]
    context_facts = [
        fact
        for fact in frame_facts
        if fact.get("kind") in {"context", "device"}
    ]
    audit_metadata = {
        "receipt_kind": MEDIATION_RECEIPT_KIND,
        "receipt_version": RECEIPT_STORE_VERSION,
        "decision_id": str(decision_payload.get("decision_id") or ""),
        "surface": str(interaction_envelope.get("surface") or ""),
        "surface_event": str(interaction_envelope.get("surface_event") or ""),
        "raw_surface": {
            "surface": str(interaction_envelope.get("surface") or ""),
            "surface_event": str(interaction_envelope.get("surface_event") or ""),
            "raw_payload": dict(_as_mapping(interaction_envelope.get("raw_payload"))),
        },
        "normalized_intent": dict(normalized_intent),
        "actor": dict(actor),
        "context": dict(context),
        "context_facts": context_facts,
        "policy_ref_count": len(policy_refs),
    }
    audit_metadata.update(dict(metadata or {}))
    return audit_metadata


def _receipt_links(receipt_links: Mapping[str, Any] | None) -> dict[str, Any]:
    payload = dict(receipt_links or {})
    links: dict[str, Any] = {}
    previous = str(payload.get("previous_receipt_id") or "")
    if previous:
        links["previous_receipt_id"] = previous
    followups = payload.get("followup_receipt_ids")
    if followups is not None:
        links["followup_receipt_ids"] = [str(item) for item in followups or []]
    return links


def _human_explanation(
    decision_payload: Mapping[str, Any],
    interaction_envelope: Mapping[str, Any],
) -> str:
    explanation = str(decision_payload.get("explanation") or "").strip()
    if explanation:
        return explanation
    reasons = [
        str(reason).strip()
        for reason in decision_payload.get("reasons", []) or []
        if str(reason).strip()
    ]
    if reasons:
        return " ".join(reasons)

    intent = _as_mapping(interaction_envelope.get("normalized_intent"))
    return (
        f"Decision {decision_payload.get('decision_id', '')} produced "
        f"{decision_payload.get('outcome', '')} for "
        f"{interaction_envelope.get('surface', '')} surface method "
        f"{intent.get('method', '')}."
    ).strip()


def _decision_payload(decision: PolicyDecision | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(decision, Mapping):
        return dict(_json_safe(decision))
    if hasattr(decision, "as_dict"):
        return dict(_json_safe(decision.as_dict()))
    return dict(_json_safe(decision))


def _policy_ref_key(ref: Mapping[str, Any]) -> tuple[str, str]:
    bundle_ref = _as_mapping(ref.get("policy_bundle_ref"))
    return (
        str(bundle_ref.get("policy_cid") or ""),
        str(ref.get("compiled_policy_cid") or ""),
    )


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if value is None:
        return {}
    if isinstance(value, Mapping):
        return value
    if hasattr(value, "as_dict"):
        mapped = value.as_dict()
        if isinstance(mapped, Mapping):
            return mapped
    return {}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_ref(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._-")
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]
    if not normalized:
        normalized = "ref"
    return f"{normalized[:96]}-{digest}"


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, set):
        return [_json_safe(item) for item in sorted(value, key=str)]
    if hasattr(value, "as_dict"):
        try:
            return _json_safe(value.as_dict())
        except Exception:
            _log.debug(
                "_json_safe: as_dict() failed for %r, falling back to str()",
                type(value).__name__,
                exc_info=True,
            )
    if is_dataclass(value):
        return _json_safe(asdict(value))
    return str(value)
