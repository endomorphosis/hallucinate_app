from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time
from typing import Any


KNOWN_STATE_FRAMES = ("sleeping", "driving", "meeting", "screen_locked")
GATING_STATE_FRAMES = ("sleeping", "driving", "meeting")


def normalize_context_token(value: Any) -> str:
    """Normalize runtime context labels into stable policy predicates."""

    return str(value or "").strip().casefold().replace("-", "_").replace(" ", "_")


@dataclass(frozen=True)
class TimeWindowDefinition:
    """Named time window that can be exposed as policy context."""

    name: str
    start: str
    end: str
    aliases: tuple[str, ...] = ()

    def names(self) -> tuple[str, ...]:
        return (self.name,) + tuple(self.aliases)

    def contains(self, current_time: datetime | None) -> bool:
        if current_time is None:
            return False

        try:
            start = time.fromisoformat(self.start)
            end = time.fromisoformat(self.end)
        except ValueError:
            return False

        observed = current_time.timetz().replace(tzinfo=None)
        if start <= end:
            return start <= observed < end
        return observed >= start or observed < end

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "start": self.start,
            "end": self.end,
            "aliases": list(self.aliases),
        }


DEFAULT_TIME_WINDOWS: tuple[TimeWindowDefinition, ...] = (
    TimeWindowDefinition("quiet_hours", "22:00", "07:00", aliases=("at_night",)),
)


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

    def parsed_local_time(self) -> datetime | None:
        """Parse local_time when it is an ISO-8601 timestamp."""

        if not self.local_time:
            return None

        value = self.local_time.strip()
        if value.endswith("Z"):
            value = f"{value[:-1]}+00:00"

        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None

    def event_time(self) -> str:
        return self.local_time or "runtime"

    def effective_timezone(self) -> str:
        for source in (self.device_context, self.location_context):
            for key in ("timezone", "time_zone", "tz"):
                value = source.get(key)
                if value:
                    return str(value)

        parsed = self.parsed_local_time()
        if parsed is not None and parsed.tzinfo is not None:
            return parsed.tzname() or "UTC"
        return "UTC"

    def normalized_state_frames(self) -> list[str]:
        frames: list[str] = []
        for item in self.state_frames:
            _append_unique(frames, normalize_context_token(item))

        for derived in _derive_state_frames_from_mapping(self.device_context):
            _append_unique(frames, derived)
        for derived in _derive_state_frames_from_mapping(self.location_context):
            _append_unique(frames, derived)

        mode = normalize_context_token(self.device_mode)
        if mode in {"sleep", "sleeping", "bedtime"}:
            _append_unique(frames, "sleeping")
        elif mode in {"driving", "car", "car_mode", "commute"}:
            _append_unique(frames, "driving")
        elif mode in {"meeting", "in_meeting", "on_call"}:
            _append_unique(frames, "meeting")

        return frames

    def previous_state_frames(self) -> list[str]:
        values = self.device_context.get("previous_state_frames")
        if values is None:
            values = self.device_context.get("previous_state_frame")
        if values is None:
            return []
        if isinstance(values, (str, bytes)):
            raw_values = [values]
        else:
            raw_values = list(values)

        frames: list[str] = []
        for item in raw_values:
            _append_unique(frames, normalize_context_token(item))
        return frames

    def normalized_device_mode(self) -> str:
        return normalize_context_token(self.device_mode)

    def previous_device_mode(self) -> str:
        return normalize_context_token(self.device_context.get("previous_device_mode"))

    def active_time_windows(
        self,
        definitions: tuple[TimeWindowDefinition, ...] = DEFAULT_TIME_WINDOWS,
    ) -> list[TimeWindowDefinition]:
        parsed = self.parsed_local_time()
        return [window for window in definitions if window.contains(parsed)]


def _append_unique(values: list[str], value: str) -> None:
    if value and value not in values:
        values.append(value)


def _derive_state_frames_from_mapping(payload: dict[str, Any]) -> list[str]:
    frames: list[str] = []
    truthy_keys = {
        "sleeping": "sleeping",
        "asleep": "sleeping",
        "driving": "driving",
        "in_vehicle": "driving",
        "meeting": "meeting",
        "in_meeting": "meeting",
        "on_call": "meeting",
    }
    for key, state_frame in truthy_keys.items():
        if payload.get(key) is True:
            _append_unique(frames, state_frame)

    for key in ("activity", "motion", "calendar_status", "focus", "status"):
        value = normalize_context_token(payload.get(key))
        if value in {"sleep", "sleeping", "asleep", "bedtime"}:
            _append_unique(frames, "sleeping")
        elif value in {"driving", "in_vehicle", "car", "car_mode", "commuting"}:
            _append_unique(frames, "driving")
        elif value in {"meeting", "in_meeting", "on_call"}:
            _append_unique(frames, "meeting")

    return frames
