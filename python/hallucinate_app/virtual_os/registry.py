"""Component adapter registry for the Hallucinate Virtual AI OS.

The registry keeps discovery lightweight and deterministic. It normalizes the
component inventory from ``config/virtual_ai_os_components.json`` into the
kernel contract dataclasses without importing optional or heavy submodules.
"""

from __future__ import annotations

import asyncio
import inspect
import json
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .contracts import (
    CapabilityAction,
    CapabilitySpec,
    ComponentAdapter,
    HealthState,
    Metadata,
    ResourceClaim,
    ResourceKind,
    ResourceRef,
    ResourceUnit,
    ServiceDescriptor,
    ServiceStatus,
)


DEFAULT_COMPONENT_IDS: tuple[str, ...] = (
    "ipfs_kit_py",
    "ipfs_datasets_py",
    "ipfs_accelerate_py",
    "swissknife",
    "mcp_plus_plus",
)

DEFAULT_CONFIG_PATH = Path("config/virtual_ai_os_components.json")

_COMPONENT_ALIASES: Mapping[str, str] = {
    "ipfs-kit-py": "ipfs_kit_py",
    "ipfs datasets py": "ipfs_datasets_py",
    "ipfs-datasets-py": "ipfs_datasets_py",
    "ipfs accelerate py": "ipfs_accelerate_py",
    "ipfs-accelerate-py": "ipfs_accelerate_py",
    "mcp++": "mcp_plus_plus",
    "mcp-plus-plus": "mcp_plus_plus",
    "mcp_plus_plus": "mcp_plus_plus",
    "mcpplusplus": "mcp_plus_plus",
    "swissknife": "swissknife",
}

_DISPLAY_NAMES: Mapping[str, str] = {
    "ipfs_kit_py": "IPFS Kit",
    "ipfs_datasets_py": "IPFS Datasets",
    "ipfs_accelerate_py": "IPFS Accelerate",
    "swissknife": "SwissKnife",
    "mcp_plus_plus": "MCP++",
}

_DEFAULT_MARKERS: Mapping[str, tuple[str, ...]] = {
    "ipfs_kit_py": ("ipfs_kit_py/__init__.py", "pyproject.toml"),
    "ipfs_datasets_py": ("ipfs_datasets_py/__init__.py", "pyproject.toml"),
    "ipfs_accelerate_py": ("ipfs_accelerate_py/__init__.py", "pyproject.toml"),
    "swissknife": ("package.json",),
    "mcp_plus_plus": ("README.md", ".git"),
}

_FALLBACK_COMPONENTS: tuple[Mapping[str, Any], ...] = (
    {
        "id": "ipfs_kit_py",
        "path": "ipfs_kit_py",
        "role": "storage kernel and content-addressed IO substrate",
        "sha": "3133d4fdc85a885ba7d776465bdee48f7a867e01",
        "capabilities": (
            "IPFS operations",
            "IPLD and CAR-adjacent content handling",
            "metadata and cache primitives",
            "MCP server surfaces",
            "libp2p and routing scaffolding",
        ),
        "integrationContracts": (
            "Virtual filesystem adapter",
            "content metadata index adapter",
            "daemon health and lifecycle adapter",
            "capability-scoped storage operations",
        ),
        "testSeams": (
            "mocked add/cat/stat/list operations",
            "metadata lookup contract tests",
            "daemon launch smoke",
            "offline cache behavior",
        ),
    },
    {
        "id": "ipfs_datasets_py",
        "path": "ipfs_datasets_py",
        "role": "knowledge fabric, dataset runtime, GraphRAG, MCP tools, and autonomous todo daemon",
        "sha": "14755236c1831a028ac8dc2cfcbfaa0aa5870bf4",
        "capabilities": (
            "dataset loading and processing",
            "knowledge graph and GraphRAG services",
            "MCP server and tool registry",
            "legal and web data processors",
            "todo implementation supervisor and daemon",
        ),
        "integrationContracts": (
            "knowledge fabric adapter",
            "GraphRAG query adapter",
            "MCP tool namespace contract",
            "daemon task board contract",
            "provenance and audit event contract",
        ),
        "testSeams": (
            "dataset load with mocked backend",
            "GraphRAG query shape",
            "MCP tool import and registry tests",
            "todo daemon selection and artifact completion",
        ),
    },
    {
        "id": "ipfs_accelerate_py",
        "path": "ipfs_accelerate_py",
        "role": "model compute runtime, hardware-aware inference, task queues, and MCP++ reference implementation host",
        "sha": "ff61c14b4df44529ff6f73efa5e26fadeda649d5",
        "capabilities": (
            "model server and inference APIs",
            "hardware backend detection",
            "worker/task scheduling",
            "MCP server tools",
            "MCP++ module and nested reference submodule",
        ),
        "integrationContracts": (
            "compute adapter",
            "model lifecycle and inference request contract",
            "hardware profile contract",
            "task queue and workflow scheduler contract",
            "MCP++ service mesh contract",
        ),
        "testSeams": (
            "mocked inference and embedding calls",
            "hardware profile fallback",
            "daemon launch smoke",
            "MCP++ task queue and workflow adapter tests",
        ),
    },
    {
        "id": "swissknife",
        "path": "swissknife",
        "role": "agent shell, descriptor-driven UI, CLI, web runtime, and MCP++ UX layer",
        "sha": "5b4598e15709203c0fe2265fdab2f51ea822b0f2",
        "capabilities": (
            "agent CLI and tools",
            "MCP tool UI surfaces",
            "descriptor runtime",
            "schema-driven UI generation",
            "UCAN auth and MCP++ transport services",
        ),
        "integrationContracts": (
            "descriptor pack ingestion",
            "dashboard launcher adapter",
            "agent tool bridge",
            "auth and revocation adapter",
            "generated UI quality gates",
        ),
        "testSeams": (
            "descriptor schema validation",
            "generated UI runtime tests",
            "transport and revocation unit tests",
            "dashboard launcher smoke",
        ),
    },
    {
        "id": "mcp_plus_plus",
        "path": "ipfs_accelerate_py/ipfs_accelerate_py/mcplusplus",
        "role": "MCP++ protocol reference for service mesh semantics",
        "sha": "29343be704da4e193ff143bac7daae9b0f98435d",
        "capabilities": (
            "transport profiles",
            "IDL and descriptor specifications",
            "event DAG semantics",
            "policy, scheduling, and UCAN delegation references",
        ),
        "integrationContracts": (
            "service mesh profile",
            "descriptor conformance matrix",
            "event envelope contract",
            "capability delegation contract",
        ),
        "testSeams": (
            "schema conformance tests",
            "event DAG ordering tests",
            "transport fallback tests",
            "UCAN grant and revocation tests",
        ),
    },
)

_CAPABILITY_TEMPLATES: Mapping[str, tuple[tuple[str, CapabilityAction, ResourceKind, str], ...]] = {
    "ipfs_kit_py": (
        ("storage.add", CapabilityAction.WRITE, ResourceKind.STORAGE, "Add content to IPFS-backed storage."),
        ("storage.read", CapabilityAction.READ, ResourceKind.STORAGE, "Read content from IPFS-backed storage."),
        ("storage.list", CapabilityAction.LIST, ResourceKind.STORAGE, "List virtual filesystem or pin references."),
        ("storage.pin", CapabilityAction.ADMIN, ResourceKind.STORAGE, "Pin, unpin, or administer content-addressed references."),
        ("service.mcp", CapabilityAction.EXECUTE, ResourceKind.SERVICE, "Expose storage operations through MCP service surfaces."),
        ("network.route", CapabilityAction.READ, ResourceKind.NETWORK, "Inspect libp2p and routing state."),
    ),
    "ipfs_datasets_py": (
        ("dataset.load", CapabilityAction.READ, ResourceKind.DATASET, "Load datasets through the knowledge fabric."),
        ("dataset.process", CapabilityAction.EXECUTE, ResourceKind.DATASET, "Run dataset processors and transforms."),
        ("knowledge.query", CapabilityAction.READ, ResourceKind.DATASET, "Query knowledge graph and GraphRAG indexes."),
        ("mcp.tools", CapabilityAction.EXECUTE, ResourceKind.SERVICE, "Expose dataset tools through MCP namespaces."),
        ("daemon.todo", CapabilityAction.EXECUTE, ResourceKind.DAEMON, "Run todo daemon and task-board workflows."),
        ("provenance.emit", CapabilityAction.EMIT, ResourceKind.EVENT_STREAM, "Emit provenance and audit events."),
    ),
    "ipfs_accelerate_py": (
        ("model.load", CapabilityAction.READ, ResourceKind.MODEL, "Load model metadata and runtime descriptors."),
        ("inference.execute", CapabilityAction.EXECUTE, ResourceKind.MODEL, "Run model inference and embedding requests."),
        ("hardware.detect", CapabilityAction.READ, ResourceKind.HARDWARE, "Inspect available hardware backends."),
        ("task.schedule", CapabilityAction.EXECUTE, ResourceKind.PROCESS, "Schedule compute tasks and worker jobs."),
        ("service.mcp", CapabilityAction.EXECUTE, ResourceKind.SERVICE, "Expose compute tools through MCP service surfaces."),
        ("mcp_plus_plus.host", CapabilityAction.EXECUTE, ResourceKind.SERVICE, "Host MCP++ reference services."),
    ),
    "swissknife": (
        ("agent.cli", CapabilityAction.EXECUTE, ResourceKind.PROCESS, "Run agent CLI and shell tools."),
        ("descriptor.read", CapabilityAction.READ, ResourceKind.DESCRIPTOR, "Read MCP and UI descriptors."),
        ("descriptor.launch", CapabilityAction.EXECUTE, ResourceKind.DESCRIPTOR, "Launch descriptor-driven UI surfaces."),
        ("ui.generate", CapabilityAction.EXECUTE, ResourceKind.DESCRIPTOR, "Generate schema-driven UI assets."),
        ("ucan.delegate", CapabilityAction.DELEGATE, ResourceKind.SECRET, "Delegate UCAN-backed credentials."),
        ("transport.connect", CapabilityAction.EXECUTE, ResourceKind.NETWORK, "Connect MCP++ transport services."),
    ),
    "mcp_plus_plus": (
        ("transport.connect", CapabilityAction.EXECUTE, ResourceKind.NETWORK, "Connect MCP++ mesh transports."),
        ("idl.read", CapabilityAction.READ, ResourceKind.DESCRIPTOR, "Read MCP++ IDL and descriptor definitions."),
        ("descriptor.validate", CapabilityAction.EXECUTE, ResourceKind.DESCRIPTOR, "Validate service descriptors and profiles."),
        ("event.emit", CapabilityAction.EMIT, ResourceKind.EVENT_STREAM, "Emit MCP++ event DAG envelopes."),
        ("event.subscribe", CapabilityAction.SUBSCRIBE, ResourceKind.EVENT_STREAM, "Subscribe to MCP++ event DAG streams."),
        ("capability.delegate", CapabilityAction.DELEGATE, ResourceKind.ANY, "Delegate UCAN-scoped service capabilities."),
        ("workflow.schedule", CapabilityAction.EXECUTE, ResourceKind.PROCESS, "Schedule mesh workflows across services."),
    ),
}


class RegistryError(Exception):
    """Raised when adapter discovery or lookup cannot be completed."""


@dataclass(frozen=True)
class ComponentAdapterDefinition:
    """Static metadata used to construct a component adapter."""

    component_id: str
    title: str
    role: str
    path: str
    sha: str | None = None
    raw_capabilities: tuple[str, ...] = ()
    integration_contracts: tuple[str, ...] = ()
    test_seams: tuple[str, ...] = ()
    package_markers: tuple[str, ...] = ()
    metadata: Metadata = field(default_factory=dict)


@dataclass
class StaticComponentAdapter:
    """Contract adapter backed by repository component metadata."""

    definition: ComponentAdapterDefinition
    project_root: Path

    def component_id(self) -> str:
        return self.definition.component_id

    def capabilities(self) -> Sequence[CapabilitySpec]:
        return tuple(_build_capabilities(self.definition))

    def services(self) -> Sequence[ServiceDescriptor]:
        capabilities = tuple(self.capabilities())
        resource = ResourceRef(
            uri=f"virtual-os://component/{self.definition.component_id}",
            kind=ResourceKind.SERVICE,
            component=self.definition.component_id,
            name=self.definition.title,
            metadata={
                "path": self.definition.path,
                "sha": self.definition.sha,
            },
        )
        claim = ResourceClaim(
            resource=resource,
            amount=1,
            unit=ResourceUnit.COUNT,
            metadata={"source": "component-adapter-registry"},
        )
        return (
            ServiceDescriptor(
                service_id=f"{self.definition.component_id}.adapter",
                component=self.definition.component_id,
                title=f"{self.definition.title} Component Adapter",
                version=self.definition.sha,
                capabilities=capabilities,
                resources=(claim,),
                metadata={
                    "role": self.definition.role,
                    "path": self.definition.path,
                    "integration_contracts": self.definition.integration_contracts,
                    "test_seams": self.definition.test_seams,
                    "registry_source": "virtual_os.registry",
                },
            ),
        )

    def health(self) -> ServiceStatus:
        component_path = self.project_root / self.definition.path
        markers = self.definition.package_markers or _DEFAULT_MARKERS.get(self.definition.component_id, ())
        present_markers = tuple(marker for marker in markers if (component_path / marker).exists())
        current_sha = _read_git_head(component_path)

        if not component_path.exists():
            state = HealthState.UNHEALTHY
            message = f"Component path is missing: {self.definition.path}"
        elif markers and not present_markers:
            state = HealthState.DEGRADED
            message = f"Component path exists but no expected marker was found: {self.definition.path}"
        else:
            state = HealthState.HEALTHY
            message = f"Component metadata discovered at {self.definition.path}"

        return ServiceStatus(
            service_id=f"{self.definition.component_id}.adapter",
            state=state,
            message=message,
            details={
                "component_id": self.definition.component_id,
                "component_title": self.definition.title,
                "path": self.definition.path,
                "absolute_path": str(component_path),
                "available": component_path.exists(),
                "expected_markers": markers,
                "present_markers": present_markers,
                "expected_sha": self.definition.sha,
                "current_sha": current_sha,
                "role": self.definition.role,
            },
        )


class ComponentAdapterRegistry:
    """Registry for Virtual AI OS component adapters."""

    def __init__(
        self,
        *,
        project_root: str | Path | None = None,
        config_path: str | Path | None = None,
        adapters: Iterable[ComponentAdapter] = (),
    ) -> None:
        self.project_root = Path(project_root).resolve() if project_root else find_project_root()
        self.config_path = Path(config_path) if config_path else self.project_root / DEFAULT_CONFIG_PATH
        if not self.config_path.is_absolute():
            self.config_path = self.project_root / self.config_path
        self._adapters: dict[str, ComponentAdapter] = {}
        for adapter in adapters:
            self.register(adapter)

    def __contains__(self, component_id: object) -> bool:
        return isinstance(component_id, str) and normalize_component_id(component_id) in self._adapters

    def __iter__(self) -> Iterator[ComponentAdapter]:
        return iter(self.adapters())

    def __len__(self) -> int:
        return len(self._adapters)

    def register(self, adapter: ComponentAdapter) -> ComponentAdapter:
        component_id = normalize_component_id(adapter.component_id())
        if not component_id:
            raise RegistryError("Component adapter returned an empty component id.")
        self._adapters[component_id] = adapter
        return adapter

    def discover(
        self,
        component_ids: Iterable[str] | None = None,
        *,
        refresh: bool = False,
    ) -> "ComponentAdapterRegistry":
        if refresh:
            self._adapters.clear()

        requested = (
            tuple(normalize_component_id(component_id) for component_id in component_ids)
            if component_ids is not None
            else DEFAULT_COMPONENT_IDS
        )
        definitions = {
            definition.component_id: definition
            for definition in load_component_definitions(self.config_path)
        }

        for component_id in requested:
            definition = definitions.get(component_id)
            if definition is None:
                raise RegistryError(f"No component definition found for {component_id!r}.")
            if component_id not in self._adapters:
                self.register(StaticComponentAdapter(definition=definition, project_root=self.project_root))
        return self

    def adapters(self) -> tuple[ComponentAdapter, ...]:
        return tuple(self._adapters.values())

    def component_ids(self) -> tuple[str, ...]:
        return tuple(self._adapters)

    def get(self, component_id: str, default: ComponentAdapter | None = None) -> ComponentAdapter | None:
        return self._adapters.get(normalize_component_id(component_id), default)

    def require(self, component_id: str) -> ComponentAdapter:
        adapter = self.get(component_id)
        if adapter is None:
            raise RegistryError(f"Component adapter is not registered: {component_id!r}.")
        return adapter

    def capabilities(self, component_id: str | None = None) -> Mapping[str, tuple[CapabilitySpec, ...]]:
        if component_id is not None:
            adapter = self.require(component_id)
            return {normalize_component_id(component_id): tuple(adapter.capabilities())}
        return {
            registered_id: tuple(adapter.capabilities())
            for registered_id, adapter in sorted(self._adapters.items())
        }

    def services(self, component_id: str | None = None) -> Mapping[str, tuple[ServiceDescriptor, ...]]:
        if component_id is not None:
            adapter = self.require(component_id)
            return {normalize_component_id(component_id): tuple(adapter.services())}
        return {
            registered_id: tuple(adapter.services())
            for registered_id, adapter in sorted(self._adapters.items())
        }

    def health(self, component_id: str | None = None) -> Mapping[str, ServiceStatus]:
        if component_id is not None:
            adapter = self.require(component_id)
            return {normalize_component_id(component_id): _resolve_maybe_awaitable(adapter.health())}
        return {
            registered_id: _resolve_maybe_awaitable(adapter.health())
            for registered_id, adapter in sorted(self._adapters.items())
        }

    def snapshot(self) -> Mapping[str, Mapping[str, Any]]:
        """Return a JSON-friendly registry snapshot for dashboards and tests."""
        statuses = self.health()
        return {
            component_id: {
                "component_id": component_id,
                "capabilities": [
                    {
                        "capability_id": capability.capability_id,
                        "action": _enum_value(capability.action),
                        "resource_kind": _enum_value(capability.resource_kind),
                        "description": capability.description,
                        "metadata": dict(capability.metadata),
                    }
                    for capability in self._adapters[component_id].capabilities()
                ],
                "services": [service.service_id for service in self._adapters[component_id].services()],
                "health": _enum_value(statuses[component_id].state),
                "health_message": statuses[component_id].message,
                "health_details": dict(statuses[component_id].details),
            }
            for component_id in sorted(self._adapters)
        }


ComponentRegistry = ComponentAdapterRegistry


def find_project_root(start: str | Path | None = None) -> Path:
    """Find the repository root from a path inside the checkout."""
    cursor = Path(start).resolve() if start else Path(__file__).resolve()
    if cursor.is_file():
        cursor = cursor.parent
    for candidate in (cursor, *cursor.parents):
        if (candidate / DEFAULT_CONFIG_PATH).exists() or (candidate / "docs/VIRTUAL_AI_OS_INTEGRATION_TODO.md").exists():
            return candidate
    return Path.cwd().resolve()


def normalize_component_id(component_id: str) -> str:
    normalized = component_id.strip().lower().replace("_", "-")
    normalized = normalized.replace("/", "-")
    if normalized == "ipfs-kit-py":
        return "ipfs_kit_py"
    if normalized == "ipfs-datasets-py":
        return "ipfs_datasets_py"
    if normalized == "ipfs-accelerate-py":
        return "ipfs_accelerate_py"
    return _COMPONENT_ALIASES.get(normalized, component_id.strip())


def load_component_definitions(config_path: str | Path | None = None) -> tuple[ComponentAdapterDefinition, ...]:
    config = Path(config_path) if config_path else find_project_root() / DEFAULT_CONFIG_PATH
    payload: Mapping[str, Any] = {}
    if config.exists():
        with config.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)

    configured = {
        normalize_component_id(item.get("id", "")): item
        for item in payload.get("components", ())
        if isinstance(item, Mapping) and item.get("id")
    }
    fallback = {
        normalize_component_id(item["id"]): item
        for item in _FALLBACK_COMPONENTS
    }

    definitions: list[ComponentAdapterDefinition] = []
    for component_id in DEFAULT_COMPONENT_IDS:
        raw = dict(fallback[component_id])
        raw.update(configured.get(component_id, {}))
        definitions.append(_definition_from_mapping(raw))
    return tuple(definitions)


def discover_component_adapters(
    *,
    project_root: str | Path | None = None,
    config_path: str | Path | None = None,
    component_ids: Iterable[str] | None = None,
) -> ComponentAdapterRegistry:
    return ComponentAdapterRegistry(project_root=project_root, config_path=config_path).discover(component_ids)


def default_registry(*, project_root: str | Path | None = None) -> ComponentAdapterRegistry:
    return discover_component_adapters(project_root=project_root)


def _definition_from_mapping(raw: Mapping[str, Any]) -> ComponentAdapterDefinition:
    component_id = normalize_component_id(str(raw["id"]))
    return ComponentAdapterDefinition(
        component_id=component_id,
        title=str(raw.get("title") or _DISPLAY_NAMES.get(component_id, component_id)),
        role=str(raw.get("role") or ""),
        path=str(raw.get("path") or component_id),
        sha=raw.get("sha"),
        raw_capabilities=_as_tuple(raw.get("capabilities", ())),
        integration_contracts=_as_tuple(raw.get("integrationContracts", raw.get("integration_contracts", ()))),
        test_seams=_as_tuple(raw.get("testSeams", raw.get("test_seams", ()))),
        package_markers=_as_tuple(raw.get("packageMarkers", raw.get("package_markers", _DEFAULT_MARKERS.get(component_id, ())))),
        metadata={
            "major_gaps": _as_tuple(raw.get("majorGaps", raw.get("major_gaps", ()))),
            "source": raw.get("source", "component-map"),
        },
    )


def _build_capabilities(definition: ComponentAdapterDefinition) -> tuple[CapabilitySpec, ...]:
    metadata = {
        "component_id": definition.component_id,
        "component_title": definition.title,
        "component_role": definition.role,
        "component_path": definition.path,
        "component_sha": definition.sha,
        "source_capabilities": definition.raw_capabilities,
        "integration_contracts": definition.integration_contracts,
        "test_seams": definition.test_seams,
        "registry_source": "virtual_os.registry",
    }
    return tuple(
        CapabilitySpec(
            capability_id=f"{definition.component_id}.{name}",
            action=action,
            resource_kind=resource_kind,
            description=description,
            metadata=metadata | {
                "capability_name": name,
                "capability_index": index,
            },
        )
        for index, (name, action, resource_kind, description) in enumerate(
            _CAPABILITY_TEMPLATES[definition.component_id]
        )
    )


def _as_tuple(value: Any) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        return (value,)
    if isinstance(value, Sequence):
        return tuple(str(item) for item in value)
    return tuple(str(item) for item in value)


def _resolve_maybe_awaitable(value: Any) -> Any:
    if not inspect.isawaitable(value):
        return value
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(value)
    raise RegistryError("Cannot synchronously resolve adapter health while an event loop is running.")


def _read_git_head(component_path: Path) -> str | None:
    if not component_path.exists():
        return None
    git_path = component_path / ".git"
    if git_path.is_file():
        content = git_path.read_text(encoding="utf-8", errors="ignore").strip()
        if content.startswith("gitdir:"):
            target = content.split(":", 1)[1].strip()
            git_path = (component_path / target).resolve()
    if not git_path.exists():
        return None

    head_file = git_path / "HEAD"
    if not head_file.exists():
        return None
    head = head_file.read_text(encoding="utf-8", errors="ignore").strip()
    if head.startswith("ref:"):
        ref = head.split(" ", 1)[1].strip()
        ref_file = git_path / ref
        if ref_file.exists():
            return ref_file.read_text(encoding="utf-8", errors="ignore").strip() or None
        packed_refs = git_path / "packed-refs"
        if packed_refs.exists():
            for line in packed_refs.read_text(encoding="utf-8", errors="ignore").splitlines():
                if not line or line.startswith("#") or line.startswith("^"):
                    continue
                sha, _, packed_ref = line.partition(" ")
                if packed_ref == ref:
                    return sha
        return None
    return head or None


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


__all__ = [
    "ComponentAdapterDefinition",
    "ComponentAdapterRegistry",
    "ComponentRegistry",
    "DEFAULT_COMPONENT_IDS",
    "RegistryError",
    "StaticComponentAdapter",
    "default_registry",
    "discover_component_adapters",
    "find_project_root",
    "load_component_definitions",
    "normalize_component_id",
]
