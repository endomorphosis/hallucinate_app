from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ActorIdentity:
    """Actor metadata preserved across control-surface normalization."""

    type: str
    id: str
    delegation_chain: list[str] = field(default_factory=list)

    @classmethod
    def from_mapping(cls, payload: dict[str, Any] | None) -> "ActorIdentity":
        data = payload or {}
        return cls(
            type=str(data.get("type") or "user"),
            id=str(data.get("id") or ""),
            delegation_chain=[str(item) for item in data.get("delegation_chain", []) or []],
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "id": self.id,
            "delegation_chain": list(self.delegation_chain),
        }


@dataclass(frozen=True)
class RuntimeContext:
    """Runtime context attached to every normalized interaction envelope."""

    local_time: str = ""
    state_frames: list[str] = field(default_factory=list)
    device_mode: str = ""
    platform: str = "hallucinate_app"
    location_context: dict[str, Any] = field(default_factory=dict)
    device_context: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_mapping(cls, payload: dict[str, Any] | None) -> "RuntimeContext":
        data = payload or {}
        return cls(
            local_time=str(data.get("local_time") or ""),
            state_frames=[str(item) for item in data.get("state_frames", []) or []],
            device_mode=str(data.get("device_mode") or ""),
            platform=str(data.get("platform") or "hallucinate_app"),
            location_context=dict(data.get("location_context") or {}),
            device_context=dict(data.get("device_context") or {}),
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "local_time": self.local_time,
            "state_frames": list(self.state_frames),
            "device_mode": self.device_mode,
            "platform": self.platform,
            "location_context": dict(self.location_context),
            "device_context": dict(self.device_context),
        }