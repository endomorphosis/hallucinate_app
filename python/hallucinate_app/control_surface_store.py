"""Filesystem persistence for control-surface policy bundles.

The store keeps Hallucinate-owned policy IR as canonical JSON and assigns local
stable content references when an upstream IPFS CID is not available. It is
intentionally small: later mediation tasks can consume the returned
``policy_bundle_ref`` without needing a database or a live IPFS daemon.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, is_dataclass
from enum import Enum
import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any, Mapping

from hallucinate_app.control_surface_logic_ir import ControlSurfacePolicy

_log = logging.getLogger(__name__)


POLICY_BUNDLE_STORE_VERSION = "0.1.0"
POLICY_BUNDLE_KIND = "control_surface_policy_bundle"
POLICY_ATTACHMENT_KIND = "control_surface_policy_profile_attachment"
_POLICY_SOURCES = {
    "descriptor",
    "operator_profile",
    "runtime_override",
    "remote_client",
    "system_default",
}
_REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_POLICY_STORE_DIR = (
    _REPO_ROOT / "data" / "hallucinate_multimodal_control" / "policies"
)


@dataclass(frozen=True)
class PolicyBundleRecord:
    """Pointers emitted after persisting a compiled control-surface policy."""

    policy_cid: str
    compiled_policy_cid: str
    policy_bundle_ref: dict[str, str]
    bundle_path: Path
    compiled_policy_path: Path
    compiled_artifact_refs: list[dict[str, str]]
    attachment_cid: str = ""
    attachment_path: Path | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "policy_cid": self.policy_cid,
            "compiled_policy_cid": self.compiled_policy_cid,
            "policy_bundle_ref": dict(self.policy_bundle_ref),
            "bundle_path": str(self.bundle_path),
            "compiled_policy_path": str(self.compiled_policy_path),
            "compiled_artifact_refs": [dict(ref) for ref in self.compiled_artifact_refs],
            "attachment_cid": self.attachment_cid,
            "attachment_path": str(self.attachment_path) if self.attachment_path else "",
        }


def canonical_json(value: Any) -> str:
    """Return the canonical JSON representation used by stable_cid."""

    return json.dumps(
        _json_safe(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )


def stable_cid(value: Any, *, prefix: str = "policy_bundle") -> str:
    """Return a deterministic local CID for JSON-serializable policy content."""

    digest = hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()
    return f"sha256:{prefix}:{digest}"


def persist_policy_bundle(
    policy: ControlSurfacePolicy,
    *,
    root_dir: str | Path | None = None,
    user_id: str = "",
    profile_id: str = "",
    scope: str = "",
    source: str = "operator_profile",
    ipfs_artifacts: Mapping[str, Any] | None = None,
    explanation: str = "",
) -> PolicyBundleRecord:
    """Persist a compiled policy bundle in the default filesystem store."""

    return PolicyBundleStore(root_dir).persist_policy_bundle(
        policy,
        user_id=user_id,
        profile_id=profile_id,
        scope=scope,
        source=source,
        ipfs_artifacts=ipfs_artifacts,
        explanation=explanation,
    )


class PolicyBundleStore:
    """Content-addressed local store for control-surface policy bundles."""

    def __init__(self, root_dir: str | Path | None = None) -> None:
        self.root_dir = Path(root_dir) if root_dir is not None else DEFAULT_POLICY_STORE_DIR
        self.bundle_dir = self.root_dir / "bundles"
        self.compiled_dir = self.root_dir / "compiled"
        self.artifact_dir = self.root_dir / "artifacts"
        self.profile_dir = self.root_dir / "profiles"

    def persist_policy_bundle(
        self,
        policy: ControlSurfacePolicy,
        *,
        user_id: str = "",
        profile_id: str = "",
        scope: str = "",
        source: str = "operator_profile",
        ipfs_artifacts: Mapping[str, Any] | None = None,
        explanation: str = "",
    ) -> PolicyBundleRecord:
        """Persist policy source rules, compiled IR, artifacts, and profile links."""

        if source not in _POLICY_SOURCES:
            raise ValueError(f"Unsupported policy source: {source}")

        self._ensure_dirs()
        policy_payload = policy.as_dict()
        compiled_policy_cid = policy.compiled_policy_cid or stable_cid(
            policy_payload,
            prefix="compiled_policy",
        )
        policy_payload["compiled_policy_cid"] = compiled_policy_cid
        policy_payload["policy_cid"] = policy_payload.get("policy_cid", "")

        explanations = _explanations(policy, explanation)
        ipfs_payload = _ipfs_artifacts(policy, ipfs_artifacts)
        artifact_refs = self._persist_artifacts(
            policy_payload=policy_payload,
            explanations=explanations,
            ipfs_artifacts=ipfs_payload,
        )
        compiled_policy_path = self._write_compiled_policy(
            compiled_policy_cid,
            policy_payload,
        )

        policy_bundle = {
            "kind": POLICY_BUNDLE_KIND,
            "version": POLICY_BUNDLE_STORE_VERSION,
            "policy_id": policy.policy_id,
            "ir_version": policy.version,
            "natural_language_rules": _source_rules(policy),
            "compiled_policy_cid": compiled_policy_cid,
            "compiled_policy": policy_payload,
            "compiled_artifacts": _json_safe(policy.compiled_artifacts),
            "compiled_artifact_refs": artifact_refs,
            "ipfs_datasets_py_artifacts": ipfs_payload,
            "explanation": "\n".join(explanations),
            "explanations": explanations,
        }
        policy_cid = stable_cid(policy_bundle, prefix="policy_bundle")
        resolved_scope = scope or _profile_scope(user_id=user_id, profile_id=profile_id)
        policy_bundle_ref = {
            "policy_id": policy.policy_id,
            "policy_cid": policy_cid,
            "version": policy.version,
            "scope": resolved_scope,
            "source": source,
        }

        bundle_path = self._bundle_path(policy_cid)
        self._write_json(
            bundle_path,
            {
                "kind": "control_surface_policy_bundle_record",
                "policy_cid": policy_cid,
                "compiled_policy_cid": compiled_policy_cid,
                "policy_bundle_ref": policy_bundle_ref,
                "policy_bundle": policy_bundle,
            },
        )

        attachment_cid = ""
        attachment_path: Path | None = None
        if user_id or profile_id or scope:
            attachment_cid, attachment_path = self.attach_policy_to_profile(
                policy_bundle_ref,
                compiled_policy_cid=compiled_policy_cid,
                compiled_artifact_refs=artifact_refs,
                user_id=user_id,
                profile_id=profile_id,
                scope=resolved_scope,
                source=source,
            )

        return PolicyBundleRecord(
            policy_cid=policy_cid,
            compiled_policy_cid=compiled_policy_cid,
            policy_bundle_ref=policy_bundle_ref,
            bundle_path=bundle_path,
            compiled_policy_path=compiled_policy_path,
            compiled_artifact_refs=artifact_refs,
            attachment_cid=attachment_cid,
            attachment_path=attachment_path,
        )

    def attach_policy_to_profile(
        self,
        policy_bundle_ref: Mapping[str, str],
        *,
        compiled_policy_cid: str,
        compiled_artifact_refs: list[dict[str, str]] | None = None,
        user_id: str = "",
        profile_id: str = "",
        scope: str = "",
        source: str = "operator_profile",
    ) -> tuple[str, Path]:
        """Attach a persisted policy bundle ref to a user/profile index."""

        if source not in _POLICY_SOURCES:
            raise ValueError(f"Unsupported policy source: {source}")
        self._ensure_dirs()
        resolved_scope = scope or _profile_scope(user_id=user_id, profile_id=profile_id)
        path = self._profile_path(resolved_scope)
        existing = self._read_json(path) if path.exists() else {}
        attachment = existing.get("attachment") if isinstance(existing, Mapping) else None
        if not isinstance(attachment, dict):
            attachment = {
                "kind": POLICY_ATTACHMENT_KIND,
                "version": POLICY_BUNDLE_STORE_VERSION,
                "user_id": user_id,
                "profile_id": profile_id,
                "scope": resolved_scope,
                "source": source,
                "policy_refs": [],
            }
        attachment["user_id"] = user_id or attachment.get("user_id", "")
        attachment["profile_id"] = profile_id or attachment.get("profile_id", "")
        attachment["scope"] = resolved_scope
        attachment["source"] = source

        policy_ref = {
            "policy_bundle_ref": dict(policy_bundle_ref),
            "compiled_policy_cid": compiled_policy_cid,
            "compiled_artifact_refs": list(compiled_artifact_refs or []),
        }
        refs_by_cid = {
            str(ref.get("policy_bundle_ref", {}).get("policy_cid")): ref
            for ref in attachment.get("policy_refs", [])
            if isinstance(ref, Mapping)
        }
        refs_by_cid[str(policy_bundle_ref["policy_cid"])] = policy_ref
        attachment["policy_refs"] = sorted(
            refs_by_cid.values(),
            key=lambda ref: (
                str(ref.get("policy_bundle_ref", {}).get("policy_id", "")),
                str(ref.get("policy_bundle_ref", {}).get("policy_cid", "")),
            ),
        )
        attachment["active_policy_cids"] = [
            ref["policy_bundle_ref"]["policy_cid"] for ref in attachment["policy_refs"]
        ]

        attachment_cid = stable_cid(attachment, prefix="policy_attachment")
        self._write_json(
            path,
            {
                "kind": "control_surface_policy_profile_attachment_record",
                "attachment_cid": attachment_cid,
                "attachment": attachment,
            },
        )
        return attachment_cid, path

    def load_policy_bundle(self, policy_cid: str) -> dict[str, Any]:
        """Load a persisted policy bundle record by CID."""

        return self._read_json(self._bundle_path(policy_cid))

    def load_compiled_policy(self, compiled_policy_cid: str) -> dict[str, Any]:
        """Load a persisted compiled_policy IR payload by CID."""

        return self._read_json(self._compiled_policy_path(compiled_policy_cid))

    def load_profile_attachment(
        self,
        *,
        user_id: str = "",
        profile_id: str = "",
        scope: str = "",
    ) -> dict[str, Any]:
        """Load the persisted policy attachment index for a user/profile scope."""

        resolved_scope = scope or _profile_scope(user_id=user_id, profile_id=profile_id)
        return self._read_json(self._profile_path(resolved_scope))

    def _persist_artifacts(
        self,
        *,
        policy_payload: dict[str, Any],
        explanations: list[str],
        ipfs_artifacts: dict[str, Any],
    ) -> list[dict[str, str]]:
        refs = [
            self._persist_artifact(
                "source_text",
                policy_payload.get("source_text", ""),
                media_type="text/plain",
                description="Natural-language source rule text.",
            ),
            self._persist_artifact(
                "frame_logic",
                policy_payload.get("facts", []),
                description="Frame facts compiled for policy matching.",
            ),
            self._persist_artifact(
                "event_calculus",
                _event_calculus_atoms(policy_payload),
                description="Temporal guard atoms extracted from compiled norms.",
            ),
            self._persist_artifact(
                "deontic_policy",
                policy_payload.get("norms", []),
                description="Ordered deontic norms and invocation effects.",
            ),
            self._persist_artifact(
                "explanation",
                {"explanations": explanations, "explanation": "\n".join(explanations)},
                description="Operator-facing policy explanation text.",
            ),
        ]
        if ipfs_artifacts:
            refs.append(
                self._persist_artifact(
                    "ucan",
                    ipfs_artifacts,
                    description="Optional ipfs_datasets_py compile and UCAN artifacts.",
                )
            )
        return refs

    def _persist_artifact(
        self,
        artifact_type: str,
        artifact: Any,
        *,
        media_type: str = "application/json",
        description: str = "",
    ) -> dict[str, str]:
        cid = stable_cid(artifact, prefix=artifact_type)
        suffix = ".txt" if media_type == "text/plain" else ".json"
        path = self.artifact_dir / f"{_safe_ref(cid)}{suffix}"
        if media_type == "text/plain":
            path.write_text(str(artifact), encoding="utf-8")
        else:
            self._write_json(path, artifact)
        ref = {
            "artifact_type": artifact_type,
            "cid": cid,
            "media_type": media_type,
        }
        if description:
            ref["description"] = description
        return ref

    def _write_compiled_policy(
        self,
        compiled_policy_cid: str,
        policy_payload: dict[str, Any],
    ) -> Path:
        path = self._compiled_policy_path(compiled_policy_cid)
        self._write_json(path, policy_payload)
        return path

    def _bundle_path(self, policy_cid: str) -> Path:
        return self.bundle_dir / f"{_safe_ref(policy_cid)}.json"

    def _compiled_policy_path(self, compiled_policy_cid: str) -> Path:
        return self.compiled_dir / f"{_safe_ref(compiled_policy_cid)}.json"

    def _profile_path(self, scope: str) -> Path:
        return self.profile_dir / f"{_safe_ref(scope)}.json"

    def _ensure_dirs(self) -> None:
        for directory in (
            self.root_dir,
            self.bundle_dir,
            self.compiled_dir,
            self.artifact_dir,
            self.profile_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)

    def _write_json(self, path: Path, value: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(_json_safe(value), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def _read_json(self, path: Path) -> dict[str, Any]:
        return json.loads(path.read_text(encoding="utf-8"))


def _source_rules(policy: ControlSurfacePolicy) -> list[str]:
    rules: list[str] = []
    if policy.source_text.strip():
        rules.append(policy.source_text.strip())
    for norm in policy.norms:
        source_text = norm.source_text.strip()
        if source_text and source_text not in rules:
            rules.append(source_text)
    return rules


def _explanations(policy: ControlSurfacePolicy, explanation: str = "") -> list[str]:
    values = [*policy.explanations, explanation]
    for norm in policy.norms:
        values.append(norm.explanation)
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value).strip()
        if text and text not in seen:
            seen.add(text)
            deduped.append(text)
    return deduped


def _ipfs_artifacts(
    policy: ControlSurfacePolicy,
    ipfs_artifacts: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    artifacts: dict[str, Any] = {}
    if ipfs_artifacts:
        artifacts.update({str(key): _json_safe(value) for key, value in ipfs_artifacts.items()})

    compiled = policy.compiled_artifacts
    for key in (
        "policy_cid",
        "ipfs_result",
        "compile_api",
        "evaluate_api",
        "compiler_class",
        "errors",
        "warnings",
    ):
        if key in compiled and compiled[key] not in ("", None, [], {}):
            artifacts[key] = _json_safe(compiled[key])
    return artifacts


def _event_calculus_atoms(policy_payload: Mapping[str, Any]) -> list[str]:
    atoms: list[str] = []
    compiled_artifacts = policy_payload.get("compiled_artifacts")
    if isinstance(compiled_artifacts, Mapping):
        atoms.extend(str(atom) for atom in compiled_artifacts.get("event_calculus", []) or [])
    for norm in policy_payload.get("norms", []) or []:
        if not isinstance(norm, Mapping):
            continue
        for guard in norm.get("guards", []) or []:
            if not isinstance(guard, Mapping):
                continue
            atoms.extend(str(atom) for atom in guard.get("event_calculus", []) or [])
    return sorted(dict.fromkeys(atom for atom in atoms if atom))


def _profile_scope(*, user_id: str = "", profile_id: str = "") -> str:
    if user_id and profile_id:
        return f"profile:{user_id}:{profile_id}"
    if profile_id:
        return f"profile:{profile_id}"
    if user_id:
        return f"operator:{user_id}"
    return "operator:*"


def _safe_ref(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._-")
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]
    if not normalized:
        normalized = "ref"
    return f"{normalized[:96]}-{digest}"


def _json_safe(value: Any) -> Any:
    """Convert supported policy values to JSON-safe structures.

    The ``as_dict`` and ``to_dict`` fallbacks catch hook failures but let recursive
    serialization errors from a successful hook propagate.
    """

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
            raw = value.as_dict()
        except Exception as exc:  # noqa: BLE001
            _log.warning(
                "_json_safe: as_dict() failed for %r; trying fallback serialization",
                type(value).__name__,
                exc_info=True,
            )
        else:
            return _json_safe(raw)
    if hasattr(value, "to_dict"):
        try:
            raw = value.to_dict()
        except Exception as exc:  # noqa: BLE001
            _log.warning(
                "_json_safe: to_dict() failed for %r; trying fallback serialization",
                type(value).__name__,
                exc_info=exc,
            )
        else:
            return _json_safe(raw)
    if is_dataclass(value):
        return _json_safe(asdict(value))
    if hasattr(value, "__dict__"):
        public_attrs = {
            key: item
            for key, item in vars(value).items()
            if not key.startswith("_") and not callable(item)
        }
        if public_attrs:
            return _json_safe(public_attrs)
    return str(value)
