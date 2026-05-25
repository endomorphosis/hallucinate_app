"""Semantic validation for control-surface descriptor contracts.

The JSON schema owns descriptor shape. This module owns cross-field checks that
must happen before runtime adapters bind a descriptor to mediator execution.
"""

from __future__ import annotations

from dataclasses import dataclass
import importlib
import json
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from hallucinate_app.control_surface_mediator import SUPPORTED_OUTCOMES
from hallucinate_app.control_surface_policy import (
    IPFS_LOGIC_COMPILE_API,
    IPFS_LOGIC_EVALUATE_API,
)


CONTRACT_SCHEMA_NAME = "control_surface_contract.schema.json"
CONTRACT_ROOT = Path(__file__).resolve().parents[2] / "swissknife" / "contracts"

DEFAULT_RUNTIME_METHODS = frozenset(
    {
        "activate",
        "cancel",
        "close",
        "confirm",
        "deactivate",
        "dismiss",
        "focus_next",
        "focus_previous",
        "open",
        "preview_activate",
        "select",
        "send_message",
    }
)

DEFAULT_COMPILE_POLICY_HOOKS = frozenset(
    {
        IPFS_LOGIC_COMPILE_API,
        "hallucinate_app.control_surface_policy.compile_control_surface_policy_rule",
        "hallucinate_app.control_surface_policy.compile_control_surface_policy_rule_result",
        "hallucinate_app.control_surface_policy.compile_strict_template_rule",
        "hallucinate_app.control_surface_policy.compile_strict_template_rule_result",
    }
)
DEFAULT_EVALUATE_POLICY_HOOKS = frozenset(
    {
        IPFS_LOGIC_EVALUATE_API,
        "hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction",
        "hallucinate_app.control_surface_policy.evaluate_ipfs_nl_policy",
    }
)

SUPPORTED_EVENT_TYPES_BY_SURFACE = {
    "agent": frozenset({"proposal", "autonomous_invoke", "scheduled_action"}),
    "gesture": frozenset({"tap", "swipe", "hold", "wrist_raise"}),
    "mouse": frozenset({"click", "double_click", "hover", "focus"}),
    "pointer": frozenset({"click", "double_click", "hover", "focus"}),
    "voice": frozenset({"utterance", "confirm", "cancel"}),
}
SUPPORTED_EVENT_TYPES_BY_KIND = {
    "ai_agent": SUPPORTED_EVENT_TYPES_BY_SURFACE["agent"],
    "captouch_or_wrist": SUPPORTED_EVENT_TYPES_BY_SURFACE["gesture"],
    "pointer": SUPPORTED_EVENT_TYPES_BY_SURFACE["mouse"],
    "voice_command": SUPPORTED_EVENT_TYPES_BY_SURFACE["voice"],
}

SAFE_CONFLICT_RESOLUTION_DEFAULTS = frozenset({"deny_over_permit", "require_confirmation"})
REQUIRED_CONFIRMATION_RISK_CLASSES = frozenset(
    {"destructive", "financial", "communication.send"}
)


@dataclass(frozen=True)
class ControlSurfaceContractValidationIssue:
    """One descriptor conformance issue."""

    path: str
    message: str
    code: str = "invalid_control_surface_contract"

    def as_dict(self) -> dict[str, str]:
        return {"path": self.path, "message": self.message, "code": self.code}


class ControlSurfaceContractValidationError(ValueError):
    """Raised when a descriptor cannot be safely bound before runtime."""

    def __init__(self, issues: Iterable[ControlSurfaceContractValidationIssue]) -> None:
        self.issues = tuple(issues)
        summary = "; ".join(
            f"{issue.path}: {issue.message}" if issue.path else issue.message
            for issue in self.issues
        )
        super().__init__(summary or "control_surface_contract validation failed")

    def as_dict(self) -> dict[str, Any]:
        return {"issues": [issue.as_dict() for issue in self.issues]}


@dataclass(frozen=True)
class ControlSurfaceContractValidationResult:
    """Normalized facts extracted from a valid control-surface descriptor."""

    descriptor: Mapping[str, Any]
    contract: Mapping[str, Any]
    surfaces: frozenset[str]
    intent_bindings: tuple[Mapping[str, Any], ...]
    methods: frozenset[str]
    policy_hooks: Mapping[str, Any]
    allowed_surfaces: frozenset[str]
    logic_bindings: tuple[Mapping[str, Any], ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "surfaces": sorted(self.surfaces),
            "methods": sorted(self.methods),
            "allowed_surfaces": sorted(self.allowed_surfaces),
            "intent_binding_count": len(self.intent_bindings),
            "logic_binding_count": len(self.logic_bindings),
            "policy_hooks": dict(self.policy_hooks),
        }


def validate_control_surface_contract(
    descriptor: Mapping[str, Any],
    *,
    available_methods: Iterable[str] | Mapping[str, Any] | Any | None = None,
    compile_policy_hooks: Iterable[str] | None = None,
    evaluate_policy_hooks: Iterable[str] | None = None,
    supported_event_types: Mapping[str, Iterable[str]] | None = None,
    validate_json_schema: bool = True,
) -> ControlSurfaceContractValidationResult:
    """Validate descriptor conformance before runtime policy mediation.

    The validator rejects missing methods, unmapped surfaces, invalid policy_hooks,
    unsupported event types, incompatible logic_bindings, and conflict_resolution
    settings that could let a permissive rule override a protective rule.
    """

    issues: list[ControlSurfaceContractValidationIssue] = []
    if not isinstance(descriptor, Mapping):
        issues.append(
            _issue("", "descriptor must be a mapping", code="descriptor_type")
        )
        raise ControlSurfaceContractValidationError(issues)

    if validate_json_schema:
        issues.extend(_json_schema_issues(descriptor))

    contract = descriptor.get("control_surface_contract")
    if not isinstance(contract, Mapping):
        issues.append(
            _issue(
                "control_surface_contract",
                "control_surface_contract section is required",
                code="missing_contract",
            )
        )
        raise ControlSurfaceContractValidationError(issues)

    method_registry = _coerce_available_methods(available_methods, descriptor)
    compile_registry = frozenset(compile_policy_hooks or DEFAULT_COMPILE_POLICY_HOOKS)
    evaluate_registry = frozenset(evaluate_policy_hooks or DEFAULT_EVALUATE_POLICY_HOOKS)
    event_registry = _coerce_event_registry(supported_event_types)

    control_surfaces = _mapping_list(contract.get("control_surfaces"))
    intent_bindings = _mapping_list(contract.get("intent_bindings"))
    surface_ids = _surface_ids(control_surfaces, issues)

    for index, surface in enumerate(control_surfaces):
        _validate_surface(
            surface,
            index=index,
            surface_ids=surface_ids,
            event_registry=event_registry,
            issues=issues,
        )

    methods: set[str] = set()
    allowed_surfaces: set[str] = set()
    for index, binding in enumerate(intent_bindings):
        _validate_intent_binding(
            binding,
            index=index,
            surface_ids=surface_ids,
            available_methods=method_registry,
            methods=methods,
            allowed_surfaces=allowed_surfaces,
            issues=issues,
        )
    _validate_all_surfaces_mapped(surface_ids, allowed_surfaces, issues)

    policy_hooks = contract.get("policy_hooks")
    if isinstance(policy_hooks, Mapping):
        _validate_policy_hooks(
            policy_hooks,
            compile_registry=compile_registry,
            evaluate_registry=evaluate_registry,
            issues=issues,
        )
    else:
        issues.append(_issue("control_surface_contract.policy_hooks", "policy_hooks are required"))
        policy_hooks = {}

    all_logic_bindings: list[Mapping[str, Any]] = []
    _collect_logic_bindings(contract, all_logic_bindings)
    _validate_logic_bindings(
        all_logic_bindings,
        contract=contract,
        surface_ids=surface_ids,
        available_methods=method_registry,
        issues=issues,
    )

    _validate_mediation_receipts(contract, issues)
    _validate_conflict_resolution(contract, issues)

    if issues:
        raise ControlSurfaceContractValidationError(issues)

    return ControlSurfaceContractValidationResult(
        descriptor=descriptor,
        contract=contract,
        surfaces=frozenset(surface_ids),
        intent_bindings=tuple(intent_bindings),
        methods=frozenset(methods),
        policy_hooks=policy_hooks,
        allowed_surfaces=frozenset(allowed_surfaces),
        logic_bindings=tuple(all_logic_bindings),
    )


def _json_schema_issues(
    descriptor: Mapping[str, Any],
) -> list[ControlSurfaceContractValidationIssue]:
    validator = _contract_schema_validator()
    issues: list[ControlSurfaceContractValidationIssue] = []
    for error in sorted(validator.iter_errors(descriptor), key=lambda item: list(item.path)):
        issues.append(
            _issue(
                _format_path(error.absolute_path),
                f"schema violation: {error.message}",
                code="schema",
            )
        )
    return issues


def _contract_schema_validator() -> Draft202012Validator:
    schema_path = CONTRACT_ROOT / CONTRACT_SCHEMA_NAME
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    registry = Registry().with_resources(
        [(schema["$id"], Resource.from_contents(schema))]
    )
    return Draft202012Validator(schema, registry=registry)


def _surface_ids(
    control_surfaces: list[Mapping[str, Any]],
    issues: list[ControlSurfaceContractValidationIssue],
) -> set[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for index, surface in enumerate(control_surfaces):
        surface_id = _clean_str(surface.get("id"))
        if not surface_id:
            continue
        if surface_id in seen:
            duplicates.add(surface_id)
            issues.append(
                _issue(
                    f"control_surface_contract.control_surfaces[{index}].id",
                    f"duplicate surface id {surface_id!r}",
                    code="duplicate_surface",
                )
            )
        seen.add(surface_id)
    return seen - duplicates


def _validate_surface(
    surface: Mapping[str, Any],
    *,
    index: int,
    surface_ids: set[str],
    event_registry: Mapping[str, frozenset[str]],
    issues: list[ControlSurfaceContractValidationIssue],
) -> None:
    path = f"control_surface_contract.control_surfaces[{index}]"
    surface_id = _clean_str(surface.get("id"))
    kind = _clean_str(surface.get("kind"))
    supported_events = _supported_events(surface_id, kind, event_registry)

    if not supported_events:
        issues.append(
            _issue(
                f"{path}.kind",
                f"unsupported surface kind {kind!r} for surface {surface_id!r}",
                code="unsupported_surface",
            )
        )
        return

    for event_index, event_type in enumerate(_string_list(surface.get("event_types"))):
        if event_type not in supported_events:
            issues.append(
                _issue(
                    f"{path}.event_types[{event_index}]",
                    (
                        f"unsupported event type {event_type!r} for surface "
                        f"{surface_id!r}; supported: {', '.join(sorted(supported_events))}"
                    ),
                    code="unsupported_event_type",
                )
            )

    for binding_index, logic_binding in enumerate(_mapping_list(surface.get("logic_bindings"))):
        surface_refs = set(_string_list(logic_binding.get("surface_refs")))
        if surface_refs and surface_id not in surface_refs:
            issues.append(
                _issue(
                    f"{path}.logic_bindings[{binding_index}].surface_refs",
                    f"logic_bindings for surface {surface_id!r} must reference that surface",
                    code="logic_binding_surface_mismatch",
                )
            )
        _validate_surface_refs(
            surface_refs,
            surface_ids=surface_ids,
            path=f"{path}.logic_bindings[{binding_index}].surface_refs",
            issues=issues,
        )


def _validate_intent_binding(
    binding: Mapping[str, Any],
    *,
    index: int,
    surface_ids: set[str],
    available_methods: frozenset[str],
    methods: set[str],
    allowed_surfaces: set[str],
    issues: list[ControlSurfaceContractValidationIssue],
) -> None:
    path = f"control_surface_contract.intent_bindings[{index}]"
    method = _clean_str(binding.get("method"))
    if method:
        methods.add(method)
    if not method:
        issues.append(
            _issue(
                f"{path}.method",
                "missing method on intent binding",
                code="missing_method",
            )
        )
    elif "*" not in available_methods and method not in available_methods:
        issues.append(
            _issue(
                f"{path}.method",
                f"missing method {method!r} in runtime method registry",
                code="missing_method",
            )
        )

    allowed = set(_string_list(binding.get("allowed_surfaces")))
    allowed_surfaces.update(allowed)
    _validate_surface_refs(
        allowed,
        surface_ids=surface_ids,
        path=f"{path}.allowed_surfaces",
        issues=issues,
        code="unmapped_surface",
        message_prefix="unmapped surface",
    )

    for binding_index, logic_binding in enumerate(_mapping_list(binding.get("logic_bindings"))):
        logic_path = f"{path}.logic_bindings[{binding_index}]"
        surface_refs = set(_string_list(logic_binding.get("surface_refs")))
        _validate_surface_refs(
            surface_refs,
            surface_ids=surface_ids,
            path=f"{logic_path}.surface_refs",
            issues=issues,
        )
        extra_surfaces = sorted(surface_refs - allowed)
        if extra_surfaces:
            issues.append(
                _issue(
                    f"{logic_path}.surface_refs",
                    (
                        "logic_bindings reference surfaces outside allowed_surfaces: "
                        + ", ".join(extra_surfaces)
                    ),
                    code="logic_binding_surface_mismatch",
                )
            )

        method_refs = set(_string_list(logic_binding.get("method_refs")))
        _validate_method_refs(
            method_refs,
            available_methods=available_methods,
            path=f"{logic_path}.method_refs",
            issues=issues,
        )
        if method_refs and not _contains_method_ref(method_refs, method):
            issues.append(
                _issue(
                    f"{logic_path}.method_refs",
                    f"logic_bindings for intent must reference method {method!r}",
                    code="logic_binding_method_mismatch",
                )
            )


def _validate_all_surfaces_mapped(
    surface_ids: set[str],
    allowed_surfaces: set[str],
    issues: list[ControlSurfaceContractValidationIssue],
) -> None:
    for surface_id in sorted(surface_ids - allowed_surfaces):
        issues.append(
            _issue(
                "control_surface_contract.intent_bindings.allowed_surfaces",
                f"unmapped surface {surface_id!r} is not referenced by any intent binding",
                code="unmapped_surface",
            )
        )


def _validate_policy_hooks(
    policy_hooks: Mapping[str, Any],
    *,
    compile_registry: frozenset[str],
    evaluate_registry: frozenset[str],
    issues: list[ControlSurfaceContractValidationIssue],
) -> None:
    compile_api = _clean_str(policy_hooks.get("compile_api"))
    evaluate_api = _clean_str(policy_hooks.get("evaluate_api"))

    if not _is_compatible_hook(compile_api, "compile", compile_registry):
        issues.append(
            _issue(
                "control_surface_contract.policy_hooks.compile_api",
                f"invalid policy hook compile_api {compile_api!r}",
                code="invalid_policy_hook",
            )
        )
    if not _is_compatible_hook(evaluate_api, "evaluate", evaluate_registry):
        issues.append(
            _issue(
                "control_surface_contract.policy_hooks.evaluate_api",
                f"invalid policy hook evaluate_api {evaluate_api!r}",
                code="invalid_policy_hook",
            )
        )
    if policy_hooks.get("decision_receipt") is not True:
        issues.append(
            _issue(
                "control_surface_contract.policy_hooks.decision_receipt",
                "decision_receipt must be true so mediation receipts can be emitted",
                code="invalid_policy_hook",
            )
        )


def _validate_logic_bindings(
    logic_bindings: list[Mapping[str, Any]],
    *,
    contract: Mapping[str, Any],
    surface_ids: set[str],
    available_methods: frozenset[str],
    issues: list[ControlSurfaceContractValidationIssue],
) -> None:
    artifact_types = set(
        _string_list(
            _mapping(contract.get("policy_hooks")).get("compiled_artifact_types")
        )
    )
    for index, logic_binding in enumerate(logic_bindings):
        path = f"control_surface_contract.logic_bindings[{index}]"
        _validate_surface_refs(
            set(_string_list(logic_binding.get("surface_refs"))),
            surface_ids=surface_ids,
            path=f"{path}.surface_refs",
            issues=issues,
        )
        _validate_method_refs(
            set(_string_list(logic_binding.get("method_refs"))),
            available_methods=available_methods,
            path=f"{path}.method_refs",
            issues=issues,
        )
        if logic_binding.get("mediation_required") is False:
            issues.append(
                _issue(
                    f"{path}.mediation_required",
                    "logic_bindings cannot disable mediation before policy evaluation",
                    code="unsafe_logic_binding",
                )
            )
        for artifact_index, artifact in enumerate(
            _mapping_list(logic_binding.get("compiled_artifact_refs"))
        ):
            artifact_type = _clean_str(artifact.get("artifact_type"))
            if artifact_types and artifact_type not in artifact_types:
                issues.append(
                    _issue(
                        f"{path}.compiled_artifact_refs[{artifact_index}].artifact_type",
                        (
                            f"compiled artifact {artifact_type!r} is not declared "
                            "in policy_hooks.compiled_artifact_types"
                        ),
                        code="invalid_policy_hook",
                    )
                )


def _validate_mediation_receipts(
    contract: Mapping[str, Any],
    issues: list[ControlSurfaceContractValidationIssue],
) -> None:
    policy_hooks = _mapping(contract.get("policy_hooks"))
    mediation_receipts = _mapping(contract.get("mediation_receipts"))
    store = _clean_str(mediation_receipts.get("store"))
    if policy_hooks.get("decision_receipt") is True and store == "disabled":
        issues.append(
            _issue(
                "control_surface_contract.mediation_receipts.store",
                "mediation receipt store cannot be disabled when decision_receipt is true",
                code="invalid_policy_hook",
            )
        )

    emitted = set(_string_list(mediation_receipts.get("emit_for_outcomes")))
    missing = sorted(set(SUPPORTED_OUTCOMES) - emitted)
    if policy_hooks.get("decision_receipt") is True and missing:
        issues.append(
            _issue(
                "control_surface_contract.mediation_receipts.emit_for_outcomes",
                "mediation receipts must cover outcomes: " + ", ".join(missing),
                code="invalid_policy_hook",
            )
        )


def _validate_conflict_resolution(
    contract: Mapping[str, Any],
    issues: list[ControlSurfaceContractValidationIssue],
) -> None:
    conflict_resolution = _mapping(contract.get("conflict_resolution"))
    default = _clean_str(conflict_resolution.get("default"))
    if default and default not in SAFE_CONFLICT_RESOLUTION_DEFAULTS:
        issues.append(
            _issue(
                "control_surface_contract.conflict_resolution.default",
                (
                    f"unsafe conflict-resolution rule {default!r}; "
                    "use deny_over_permit or require_confirmation"
                ),
                code="unsafe_conflict_resolution",
            )
        )
    if conflict_resolution.get("requires_explanation") is not True:
        issues.append(
            _issue(
                "control_surface_contract.conflict_resolution.requires_explanation",
                "unsafe conflict-resolution rules must require explanations",
                code="unsafe_conflict_resolution",
            )
        )
    confirmation_for = set(
        _string_list(conflict_resolution.get("requires_user_confirmation_for"))
    )
    required_risk_classes = _required_confirmation_risk_classes(contract)
    missing = sorted(required_risk_classes - confirmation_for)
    if missing:
        issues.append(
            _issue(
                "control_surface_contract.conflict_resolution.requires_user_confirmation_for",
                (
                    "unsafe conflict-resolution rules must require user confirmation for: "
                    + ", ".join(missing)
                ),
                code="unsafe_conflict_resolution",
            )
        )


def _required_confirmation_risk_classes(contract: Mapping[str, Any]) -> set[str]:
    required: set[str] = set()
    for binding in _mapping_list(contract.get("intent_bindings")):
        haystack = " ".join(
            _clean_str(binding.get(key)).casefold()
            for key in ("intent", "method", "target_ref")
        )
        if "communication.send" in haystack or "send_message" in haystack:
            required.add("communication.send")
        if any(token in haystack for token in ("financial", "payment", "purchase", "transfer")):
            required.add("financial")
        if any(token in haystack for token in ("destructive", "delete", "remove", "destroy")):
            required.add("destructive")
    return required & REQUIRED_CONFIRMATION_RISK_CLASSES


def _collect_logic_bindings(
    value: Mapping[str, Any],
    output: list[Mapping[str, Any]],
) -> None:
    output.extend(_mapping_list(value.get("logic_bindings")))
    for surface in _mapping_list(value.get("control_surfaces")):
        output.extend(_mapping_list(surface.get("logic_bindings")))
    for intent_binding in _mapping_list(value.get("intent_bindings")):
        output.extend(_mapping_list(intent_binding.get("logic_bindings")))


def _validate_surface_refs(
    refs: set[str],
    *,
    surface_ids: set[str],
    path: str,
    issues: list[ControlSurfaceContractValidationIssue],
    code: str = "logic_binding_unmapped_surface",
    message_prefix: str = "logic_bindings reference unmapped surface",
) -> None:
    for ref in sorted(refs):
        if ref == "*":
            continue
        if ref not in surface_ids:
            issues.append(
                _issue(path, f"{message_prefix} {ref!r}", code=code)
            )


def _validate_method_refs(
    refs: set[str],
    *,
    available_methods: frozenset[str],
    path: str,
    issues: list[ControlSurfaceContractValidationIssue],
) -> None:
    if "*" in available_methods:
        return
    for ref in sorted(refs):
        if _is_wildcard_ref(ref):
            continue
        if ref not in available_methods:
            issues.append(
                _issue(
                    path,
                    f"logic_bindings reference missing method {ref!r}",
                    code="missing_method",
                )
            )


def _contains_method_ref(refs: set[str], method: str) -> bool:
    if not method:
        return True
    return any(ref == method or _is_wildcard_ref(ref) for ref in refs)


def _supported_events(
    surface_id: str,
    kind: str,
    event_registry: Mapping[str, frozenset[str]],
) -> frozenset[str]:
    by_surface = event_registry.get(surface_id)
    by_kind = SUPPORTED_EVENT_TYPES_BY_KIND.get(kind)
    if by_surface and by_kind:
        return frozenset(set(by_surface) | set(by_kind))
    if by_surface:
        return by_surface
    if by_kind:
        return by_kind
    return frozenset()


def _coerce_event_registry(
    supported_event_types: Mapping[str, Iterable[str]] | None,
) -> Mapping[str, frozenset[str]]:
    registry = dict(SUPPORTED_EVENT_TYPES_BY_SURFACE)
    if supported_event_types:
        for surface, event_types in supported_event_types.items():
            registry[_clean_str(surface)] = frozenset(_string_list(event_types))
    return registry


def _coerce_available_methods(
    available_methods: Iterable[str] | Mapping[str, Any] | Any | None,
    descriptor: Mapping[str, Any],
) -> frozenset[str]:
    if available_methods is None:
        inferred = _infer_available_methods(descriptor)
        return frozenset(inferred or DEFAULT_RUNTIME_METHODS)
    if isinstance(available_methods, Mapping):
        return frozenset(_clean_str(key) for key in available_methods.keys() if _clean_str(key))
    if isinstance(available_methods, str):
        return frozenset({_clean_str(available_methods)})
    try:
        return frozenset(_clean_str(item) for item in available_methods if _clean_str(item))
    except TypeError:
        methods = set()
        for name in dir(available_methods):
            if name.startswith("_"):
                continue
            try:
                attr = getattr(available_methods, name)
            except Exception:
                continue
            if callable(attr):
                methods.add(name)
        return frozenset(methods or DEFAULT_RUNTIME_METHODS)


def _infer_available_methods(descriptor: Mapping[str, Any]) -> set[str]:
    methods: set[str] = set()
    for key in ("available_methods", "interface_methods", "methods"):
        methods.update(_extract_method_names(descriptor.get(key)))
    for key in ("interface", "runtime_interface", "method_registry"):
        value = descriptor.get(key)
        if isinstance(value, Mapping):
            methods.update(_extract_method_names(value.get("methods")))
            methods.update(_extract_method_names(value.get("available_methods")))
    return methods


def _extract_method_names(value: Any) -> set[str]:
    names: set[str] = set()
    if isinstance(value, Mapping):
        for key, item in value.items():
            names.add(_clean_str(key))
            if isinstance(item, Mapping):
                names.update(_extract_method_names([item]))
        return {name for name in names if name}
    if isinstance(value, str):
        return {_clean_str(value)}
    if not isinstance(value, Iterable):
        return set()
    for item in value:
        if isinstance(item, str):
            names.add(_clean_str(item))
        elif isinstance(item, Mapping):
            for key in ("method", "name", "id"):
                name = _clean_str(item.get(key))
                if name:
                    names.add(name)
                    break
    return {name for name in names if name}


def _is_compatible_hook(
    api: str,
    expected_role: str,
    registry: frozenset[str],
) -> bool:
    if not api:
        return False
    if api in registry:
        return True
    attr = api.rsplit(".", 1)[-1].casefold()
    if expected_role not in attr:
        return False
    return _is_importable_callable(api)


def _is_importable_callable(api: str) -> bool:
    module_name, _, attr_name = api.rpartition(".")
    if not module_name or not attr_name:
        return False
    try:
        module = importlib.import_module(module_name)
        attr = getattr(module, attr_name)
    except Exception:
        return False
    return callable(attr)


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _mapping_list(value: Any) -> list[Mapping[str, Any]]:
    if not isinstance(value, Iterable) or isinstance(value, (str, bytes, Mapping)):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        raw_values = [value]
    else:
        try:
            raw_values = list(value)
        except TypeError:
            raw_values = []
    return [_clean_str(item) for item in raw_values if _clean_str(item)]


def _clean_str(value: Any) -> str:
    return str(value or "").strip()


def _is_wildcard_ref(value: str) -> bool:
    return value in {"*", "method:*", "surface:*"}


def _format_path(path: Iterable[Any]) -> str:
    parts: list[str] = []
    for item in path:
        if isinstance(item, int):
            if parts:
                parts[-1] = f"{parts[-1]}[{item}]"
            else:
                parts.append(f"[{item}]")
        else:
            parts.append(str(item))
    return ".".join(parts)


def _issue(
    path: str,
    message: str,
    *,
    code: str = "invalid_control_surface_contract",
) -> ControlSurfaceContractValidationIssue:
    return ControlSurfaceContractValidationIssue(path=path, message=message, code=code)
