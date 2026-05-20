"""
Compatibility helpers for evolving submodule APIs.
"""

import asyncio
import inspect
import logging
from typing import Any, Callable, Dict, Iterable, Optional, Tuple

logger = logging.getLogger(__name__)


def _try_constructor(ctor: Callable[..., Any], resources: Dict[str, Any], metadata: Dict[str, Any]) -> Any:
    attempts = [
        lambda: ctor(resources=resources, metadata=metadata),
        lambda: ctor(resources, metadata),
        lambda: ctor(metadata=metadata),
        lambda: ctor(resources=resources),
        lambda: ctor(),
    ]
    last_error: Optional[Exception] = None
    for attempt in attempts:
        try:
            return attempt()
        except TypeError as exc:
            last_error = exc
    if last_error:
        raise last_error
    raise TypeError("Unable to initialize constructor")


def instantiate_from_candidates(
    module_obj: Any,
    candidates: Iterable[str],
    resources: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Any:
    resources = resources or {}
    metadata = metadata or {}
    errors = []
    for name in candidates:
        target = getattr(module_obj, name, None)
        if not callable(target):
            continue
        try:
            return _try_constructor(target, resources, metadata)
        except Exception as exc:  # pragma: no cover - diagnostic path
            errors.append(f"{name}: {exc}")
    if errors:
        raise RuntimeError(f"No compatible constructor found. Attempts: {'; '.join(errors)}")
    raise RuntimeError("No compatible constructor found.")


def resolve_maybe_awaitable(value: Any) -> Any:
    if not inspect.isawaitable(value):
        return value
    try:
        loop = asyncio.get_running_loop()
        if loop.is_running():
            new_loop = asyncio.new_event_loop()
            try:
                return new_loop.run_until_complete(value)
            finally:
                new_loop.close()
    except RuntimeError:
        pass
    return asyncio.run(value)


def call_with_param_fallback(method: Callable[..., Any], params: Optional[Dict[str, Any]] = None) -> Tuple[Any, int]:
    """
    Call `method` using progressively more permissive signatures.

    Returns:
        Tuple[result, retries_used] where retries_used is the index of the
        successful attempt in the fallback chain (0 means first attempt worked,
        1 means first fallback, 2 means second fallback).
    """
    params = params or {}
    attempts = [
        lambda: method(**params),
        lambda: method(params),
        lambda: method(),
    ]
    last_error: Optional[Exception] = None
    for idx, attempt in enumerate(attempts):
        try:
            result = attempt()
            retries_used = idx
            return resolve_maybe_awaitable(result), retries_used
        except TypeError as exc:
            last_error = exc
    if last_error:
        raise last_error
    raise RuntimeError("Method invocation failed without a TypeError")


def build_simple_api(simple_api_cls: Callable[..., Any], config_path: Optional[str], role: str, metadata: Dict[str, Any]) -> Any:
    metadata_payload = dict(metadata or {})
    metadata_payload.setdefault("config_path", config_path)
    metadata_payload.setdefault("role", role)
    attempts = [
        lambda: simple_api_cls(config_path=config_path, role=role),
        lambda: simple_api_cls(metadata=metadata_payload),
        lambda: simple_api_cls(config_path, role),
        lambda: simple_api_cls(),
    ]
    last_error: Optional[Exception] = None
    for attempt in attempts:
        try:
            return attempt()
        except TypeError as exc:
            last_error = exc
    if last_error:
        raise last_error
    raise TypeError("Unable to instantiate IPFSSimpleAPI")
