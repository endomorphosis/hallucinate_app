import asyncio
import inspect
import sys
import unittest
from dataclasses import replace
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.compute import (  # noqa: E402
    CancellationMode,
    CancellationRequest,
    CancellationResult,
    ComputeQueueState,
    ComputeQueueStatus,
    ComputeResourceAccounting,
    ComputeTaskRequest,
    ComputeTaskState,
    ComputeTaskStatus,
    HardwareAvailability,
    HardwareBackend,
    HardwareDevice,
    HardwareProfile,
    HardwareProfileRequest,
    HardwareRecommendation,
    HardwareRecommendationRequest,
    InferenceOutput,
    InferenceRequest,
    InferenceResult,
    LoadedModel,
    ModelComputeOperation,
    ModelComputeRuntimeAdapter,
    ModelFormat,
    ModelInput,
    ModelLoadMode,
    ModelLoadRequest,
    ModelLoadResult,
    ModelRef,
    ModelRuntimeState,
    ModelTaskKind,
    PrecisionMode,
    QueueDiscipline,
    ResourceAccountingPhase,
    ResourceAccountingRequest,
    ResourceAccountingResult,
    hardware_memory_usage,
    token_usage,
)
from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    IdentityRef,
    ResourceClaim,
    ResourceKind,
    ResourceRef,
    ResourceUnit,
    StorageRef,
)


class MockAccelerateError(RuntimeError):
    def __init__(self, message, *, code="ACCELERATE_ERROR", retryable=False):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


def model_from_request(value):
    if isinstance(value, LoadedModel):
        return value.model
    if isinstance(value, ModelRef):
        return value
    return ModelRef(model_id=str(value))


def backend_value(value):
    return value.value if hasattr(value, "value") else str(value)


def task_value(value):
    return value.value if hasattr(value, "value") else str(value)


def input_modalities(inputs):
    modalities = []
    for item in inputs:
        if item.text is not None:
            modalities.append("text")
        if item.media is not None:
            media_type = getattr(item.media, "media_type", None) or item.media.metadata.get("media_type")
            if media_type and "/" in media_type:
                modalities.append(media_type.split("/", 1)[0])
            else:
                modalities.append("media")
        if item.data is not None:
            modalities.append("structured")
    return tuple(dict.fromkeys(modalities))


async def resolve_maybe_awaitable(value):
    if inspect.isawaitable(value):
        return await value
    return value


class MockModelComputeAdapter:
    def __init__(
        self,
        *,
        async_inference=False,
        hardware_profile=None,
        inference_latency_s=0.0,
    ):
        self.async_inference = async_inference
        self.hardware = hardware_profile or make_hardware_profile()
        self.inference_latency_s = inference_latency_s
        self.fail_next = None
        self.models = {}
        self.tasks = {}
        self.accounting = []
        self.sequence = 0

    def load_model(self, request):
        model = model_from_request(request.model)
        device = self.hardware.best_device()
        backend = request.target_backend
        if backend == HardwareBackend.AUTO and device is not None:
            backend = device.backend
        loaded = LoadedModel(
            handle_id=f"handle-{model.model_id}",
            model=model,
            state=ModelRuntimeState.READY,
            backend=backend,
            device_id=device.device_id if device is not None else request.device_id,
            precision=request.precision,
            resource_usage=(hardware_memory_usage(256 * 1024 * 1024, backend=backend),),
            metadata={
                "load_mode": request.mode.value if isinstance(request.mode, ModelLoadMode) else request.mode,
                "queue_id": request.queue_id,
                "accelerator": "mock-ipfs-accelerate",
            },
        )
        self.models[loaded.handle_id] = loaded
        return ModelLoadResult(
            request=request,
            model=loaded,
            ok=True,
            hardware=device,
            resource_usage=loaded.resource_usage,
            metadata={"normalized": True},
        )

    def unload_model(self, request):
        model = self.models.pop(request.handle_id, None)
        if model is None:
            return ModelLoadResult(ok=False, message=f"model handle not found: {request.handle_id}")
        return ModelLoadResult(model=replace(model, state=ModelRuntimeState.UNLOADED), ok=True)

    def get_model(self, handle_id):
        return self.models.get(handle_id)

    def list_models(self):
        return tuple(self.models.values())

    def run_inference(self, request):
        if self.async_inference:
            return self._run_inference_async(request)
        return self._run_inference(request)

    async def _run_inference_async(self, request):
        await asyncio.sleep(0)
        return self._run_inference(request)

    def _run_inference(self, request):
        self.sequence += 1
        task_id = f"inference-{self.sequence}"
        model = model_from_request(request.model)
        started_status = ComputeTaskStatus(
            task_id=task_id,
            operation=ModelComputeOperation.INFERENCE,
            state=ComputeTaskState.RUNNING,
            model=model,
            actor=request.actor,
            queue_id=request.queue_id,
            priority=request.priority,
            resource_claims=request.resource_claims,
            metadata={"trace_id": request.trace_id},
        )
        self.tasks[task_id] = started_status

        if request.timeout_s is not None and self.inference_latency_s > request.timeout_s:
            error = TimeoutError(f"inference exceeded timeout of {request.timeout_s}s")
            return self._error_result(
                request,
                task_id,
                error,
                state=ComputeTaskState.TIMED_OUT,
                category="timeout",
                retryable=True,
            )

        if self.fail_next is not None:
            error = self.fail_next
            self.fail_next = None
            return self._error_result(
                request,
                task_id,
                error,
                state=ComputeTaskState.FAILED,
                category="backend",
                retryable=getattr(error, "retryable", False),
            )

        modalities = input_modalities(request.inputs)
        source_text = " ".join(item.text for item in request.inputs if item.text)
        task = task_value(request.task)
        backend = backend_value(request.target_backend)
        usage = token_usage(
            max(1, len(source_text.split())),
            task_id=task_id,
            model=model,
            metadata={"phase": "inference"},
        )
        output = InferenceOutput(
            output_id=f"{task_id}-output",
            text=f"{model.model_id}: {source_text or task}",
            input_id=request.inputs[0].input_id if request.inputs else None,
            finish_reason="stop",
            resource_usage=(usage,),
            metadata={
                "task": task,
                "modalities": modalities,
                "parameters": dict(request.parameters),
                "task_metadata": dict(request.options.get("task_metadata", {})),
            },
        )
        completed_status = replace(
            started_status,
            state=ComputeTaskState.COMPLETED,
            progress=1.0,
            attempts=1,
            resource_usage=(usage,),
            metadata={**dict(started_status.metadata), "modalities": modalities},
        )
        self.tasks[task_id] = completed_status
        return InferenceResult(
            request=request,
            ok=True,
            outputs=(output,),
            task_id=task_id,
            task_status=completed_status,
            resource_usage=(usage,),
            stats={"input_count": len(request.inputs), "latency_s": self.inference_latency_s},
            metadata={
                "normalized": True,
                "backend": backend,
                "task": task,
                "modalities": modalities,
            },
        )

    def _error_result(self, request, task_id, error, *, state, category, retryable):
        model = model_from_request(request.model)
        status = ComputeTaskStatus(
            task_id=task_id,
            operation=ModelComputeOperation.INFERENCE,
            state=state,
            model=model,
            actor=request.actor,
            queue_id=request.queue_id,
            priority=request.priority,
            message=str(error),
            metadata={"error_category": category},
        )
        self.tasks[task_id] = status
        return InferenceResult(
            request=request,
            ok=False,
            outputs=(),
            task_id=task_id,
            task_status=status,
            message=str(error),
            metadata={
                "normalized": True,
                "error": {
                    "type": error.__class__.__name__,
                    "message": str(error),
                    "code": getattr(error, "code", None),
                    "category": category,
                    "retryable": retryable,
                },
            },
        )

    def embed(self, request):
        raise NotImplementedError("embedding is outside this OS-014 acceptance test")

    def hardware_profile(self, request=None):
        return self.hardware

    def recommend_hardware(self, request):
        device = (request.profile or self.hardware).best_device()
        return HardwareRecommendation(
            request=request,
            backend=device.backend if device is not None else HardwareBackend.CPU,
            device_id=device.device_id if device is not None else "cpu:0",
            device=device,
            score=0.95 if device is not None else 0.5,
            reason="selected first available mocked device",
        )

    def submit_task(self, request):
        task_id = request.task_id or f"queued-{len(self.tasks) + 1}"
        status = ComputeTaskStatus(
            task_id=task_id,
            operation=request.operation,
            state=ComputeTaskState.QUEUED,
            model=model_from_request(request.model or getattr(request.payload, "model", "unknown")),
            actor=request.actor,
            queue_id=request.queue_id,
            priority=request.priority,
            resource_claims=request.resource_claims,
            metadata={"depends_on": request.depends_on, **dict(request.options)},
        )
        self.tasks[task_id] = status
        return status

    def queue_state(self, queue_id=None):
        tasks = tuple(
            task
            for task in self.tasks.values()
            if queue_id is None or task.queue_id == queue_id
        )
        states = [task.state for task in tasks]
        return ComputeQueueState(
            queue_id=queue_id or "default",
            status=ComputeQueueStatus.ACTIVE,
            discipline=QueueDiscipline.PRIORITY,
            depth=sum(state in {ComputeTaskState.PENDING, ComputeTaskState.QUEUED} for state in states),
            pending=sum(state in {ComputeTaskState.PENDING, ComputeTaskState.QUEUED} for state in states),
            running=states.count(ComputeTaskState.RUNNING),
            completed=states.count(ComputeTaskState.COMPLETED),
            failed=states.count(ComputeTaskState.FAILED),
            cancelled=states.count(ComputeTaskState.CANCELLED),
            workers=1,
            max_concurrency=1,
            tasks=tasks,
        )

    def task_status(self, task_id):
        return self.tasks.get(task_id)

    def cancel_task(self, request):
        status = self.tasks.get(request.task_id)
        if status is None:
            return CancellationResult(
                task_id=request.task_id,
                ok=False,
                state=ComputeTaskState.UNKNOWN,
                message=f"task not found: {request.task_id}",
            )
        cancelled = replace(
            status,
            state=ComputeTaskState.CANCELLED,
            cancellation_reason=request.reason,
            metadata={
                **dict(status.metadata),
                "cancellation_mode": (
                    request.mode.value if isinstance(request.mode, CancellationMode) else request.mode
                ),
            },
        )
        self.tasks[request.task_id] = cancelled
        return CancellationResult(
            task_id=request.task_id,
            ok=True,
            state=ComputeTaskState.CANCELLED,
            task_status=cancelled,
            message=request.reason,
            metadata={"release_resources": request.release_resources},
        )

    def reserve_resources(self, request):
        usage = tuple(
            token_usage(int(claim.amount), task_id=request.task_id, model=request.model)
            if claim.unit == ResourceUnit.TOKENS
            else hardware_memory_usage(int(claim.amount), metadata={"claim": claim.resource.uri})
            for claim in request.claims
        )
        accounting = ComputeResourceAccounting(
            account_id=f"account-{len(self.accounting) + 1}",
            phase=request.phase,
            task_id=request.task_id,
            model=request.model,
            queue_id=request.queue_id,
            actor=request.actor,
            claims=request.claims,
            reserved=usage,
        )
        self.accounting.append(accounting)
        return ResourceAccountingResult(request=request, accounting=accounting, ok=True)

    def record_usage(self, accounting):
        self.accounting.append(accounting)
        return ResourceAccountingResult(accounting=accounting, ok=True)

    def release_resources(self, request):
        accounting = ComputeResourceAccounting(
            account_id=f"account-{len(self.accounting) + 1}",
            phase=ResourceAccountingPhase.RELEASED,
            task_id=request.task_id,
            model=request.model,
            queue_id=request.queue_id,
            actor=request.actor,
            released=request.resources,
        )
        self.accounting.append(accounting)
        return ResourceAccountingResult(request=request, accounting=accounting, ok=True)

    def resource_usage(self, *, task_id=None, model_id=None, queue_id=None):
        records = self.accounting
        if task_id is not None:
            records = [record for record in records if record.task_id == task_id]
        if model_id is not None:
            records = [
                record
                for record in records
                if record.model is not None and record.model.model_id == model_id
            ]
        if queue_id is not None:
            records = [record for record in records if record.queue_id == queue_id]
        return tuple(records)


def make_hardware_profile():
    cpu = HardwareDevice(
        backend=HardwareBackend.CPU,
        device_id="cpu:0",
        name="Mock CPU",
        availability=HardwareAvailability.AVAILABLE,
        compute_units=8,
        memory_total_bytes=16 * 1024 * 1024 * 1024,
        metadata={"mocked": True},
    )
    cuda = HardwareDevice(
        backend=HardwareBackend.CUDA,
        device_id="cuda:0",
        name="Mock CUDA",
        availability=HardwareAvailability.UNAVAILABLE,
        compute_units=80,
        memory_total_bytes=24 * 1024 * 1024 * 1024,
        metadata={"mocked": True, "reason": "driver unavailable"},
    )
    return HardwareProfile(
        profile_id="mock-profile",
        node_id="node-1",
        devices=(cuda, cpu),
        preferred_backend=HardwareBackend.CUDA,
        platform={"system": "Linux", "machine": "x86_64"},
        accelerator_version="mock-accelerate-1.0",
        metadata={"source": "contract-test"},
    )


class TestVirtualOSComputeAdapter(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.actor = IdentityRef(did="did:example:compute-agent", roles=("agent",))
        self.model = ModelRef(
            model_id="mock-llm",
            revision="main",
            provider="ipfs_accelerate_py",
            format=ModelFormat.HUGGINGFACE,
            task=ModelTaskKind.CHAT,
        )

    def make_inference_request(self, **overrides):
        payload = {
            "model": self.model,
            "actor": self.actor,
            "inputs": (
                ModelInput(input_id="prompt", text="Summarize the compute contract."),
            ),
            "task": ModelTaskKind.TEXT_GENERATION,
            "parameters": {"max_new_tokens": 16},
            "target_backend": HardwareBackend.CPU,
            "queue_id": "local-compute",
            "trace_id": "trace-compute",
        }
        payload.update(overrides)
        return InferenceRequest(**payload)

    async def test_sync_inference_returns_normalized_contract_result(self):
        adapter = MockModelComputeAdapter(async_inference=False)
        self.assertIsInstance(adapter, ModelComputeRuntimeAdapter)

        load_result = adapter.load_model(
            ModelLoadRequest(
                model=self.model,
                actor=self.actor,
                mode=ModelLoadMode.WARM,
                target_backend=HardwareBackend.AUTO,
                precision=PrecisionMode.FP16,
                queue_id="local-compute",
            )
        )
        self.assertTrue(load_result.ok)
        self.assertIsInstance(load_result, ModelLoadResult)
        self.assertEqual(load_result.model.state, ModelRuntimeState.READY)
        self.assertEqual(load_result.model.backend, HardwareBackend.CPU)
        self.assertEqual(load_result.hardware.device_id, "cpu:0")

        pending = adapter.run_inference(self.make_inference_request(model=load_result.model))
        self.assertFalse(inspect.isawaitable(pending))
        result = pending

        self.assertTrue(result.ok)
        self.assertIsInstance(result, InferenceResult)
        self.assertEqual(result.outputs[0].input_id, "prompt")
        self.assertIn("compute contract", result.outputs[0].text)
        self.assertEqual(result.task_status.state, ComputeTaskState.COMPLETED)
        self.assertEqual(result.task_status.operation, ModelComputeOperation.INFERENCE)
        self.assertEqual(result.resource_usage[0].unit, ResourceUnit.TOKENS)
        self.assertEqual(result.metadata["backend"], HardwareBackend.CPU.value)
        self.assertTrue(result.metadata["normalized"])

    async def test_async_inference_returns_same_contract_shape(self):
        adapter = MockModelComputeAdapter(async_inference=True)
        request = self.make_inference_request(task=ModelTaskKind.CHAT)

        pending = adapter.run_inference(request)
        self.assertTrue(inspect.isawaitable(pending))
        result = await pending

        self.assertTrue(result.ok)
        self.assertEqual(result.request, request)
        self.assertEqual(result.metadata["task"], ModelTaskKind.CHAT.value)
        self.assertEqual(result.task_status.state, ComputeTaskState.COMPLETED)
        self.assertEqual(result.outputs[0].metadata["parameters"]["max_new_tokens"], 16)

    async def test_mocked_hardware_profile_and_recommendation(self):
        adapter = MockModelComputeAdapter(hardware_profile=make_hardware_profile())

        profile = await resolve_maybe_awaitable(
            adapter.hardware_profile(HardwareProfileRequest(actor=self.actor, include_detailed=True))
        )
        self.assertIsInstance(profile, HardwareProfile)
        self.assertEqual(profile.profile_id, "mock-profile")
        self.assertEqual(profile.available_backends, (HardwareBackend.CPU.value,))
        self.assertEqual(profile.best_device().backend, HardwareBackend.CPU)
        self.assertEqual(profile.best_device().metadata["mocked"], True)

        recommendation = await resolve_maybe_awaitable(
            adapter.recommend_hardware(
                HardwareRecommendationRequest(
                    model=self.model,
                    actor=self.actor,
                    task=ModelTaskKind.TEXT_GENERATION,
                    profile=profile,
                )
            )
        )
        self.assertIsInstance(recommendation, HardwareRecommendation)
        self.assertEqual(recommendation.backend, HardwareBackend.CPU)
        self.assertEqual(recommendation.device_id, "cpu:0")
        self.assertGreater(recommendation.score, 0.9)

    async def test_multimodal_task_metadata_is_preserved(self):
        adapter = MockModelComputeAdapter()
        image = StorageRef(
            uri="ipfs://bafyimage",
            cid="bafyimage",
            path="/media/scene.png",
            media_type="image/png",
            metadata={"width": 640, "height": 480},
        )
        request = self.make_inference_request(
            inputs=(
                ModelInput(input_id="prompt", text="Describe the image.", metadata={"part": "prompt"}),
                ModelInput(input_id="image", media=image, metadata={"part": "reference"}),
            ),
            task=ModelTaskKind.MULTIMODAL,
            parameters={"max_new_tokens": 32, "temperature": 0.2},
            options={"task_metadata": {"workflow": "caption", "source": "vfs"}},
            target_backend=HardwareBackend.WEBGPU,
        )

        result = await resolve_maybe_awaitable(adapter.run_inference(request))

        self.assertTrue(result.ok)
        self.assertEqual(result.metadata["task"], ModelTaskKind.MULTIMODAL.value)
        self.assertEqual(result.metadata["backend"], HardwareBackend.WEBGPU.value)
        self.assertEqual(result.metadata["modalities"], ("text", "image"))
        self.assertEqual(result.outputs[0].metadata["task"], ModelTaskKind.MULTIMODAL.value)
        self.assertEqual(result.outputs[0].metadata["task_metadata"]["workflow"], "caption")
        self.assertEqual(result.request.inputs[1].media.cid, "bafyimage")

    async def test_timeout_and_cancellation_are_normalized(self):
        adapter = MockModelComputeAdapter(inference_latency_s=2.0)
        timed_out = await resolve_maybe_awaitable(
            adapter.run_inference(self.make_inference_request(timeout_s=0.01))
        )

        self.assertFalse(timed_out.ok)
        self.assertEqual(timed_out.outputs, ())
        self.assertEqual(timed_out.task_status.state, ComputeTaskState.TIMED_OUT)
        self.assertEqual(timed_out.metadata["error"]["type"], "TimeoutError")
        self.assertEqual(timed_out.metadata["error"]["category"], "timeout")
        self.assertTrue(timed_out.metadata["error"]["retryable"])

        queued = await resolve_maybe_awaitable(
            adapter.submit_task(
                ComputeTaskRequest(
                    operation=ModelComputeOperation.INFERENCE,
                    actor=self.actor,
                    payload=self.make_inference_request(),
                    task_id="task-cancel",
                    model=self.model,
                    queue_id="gpu",
                    priority=10,
                    options={"reason": "test queue cancellation"},
                )
            )
        )
        self.assertEqual(queued.state, ComputeTaskState.QUEUED)

        cancelled = await resolve_maybe_awaitable(
            adapter.cancel_task(
                CancellationRequest(
                    task_id="task-cancel",
                    actor=self.actor,
                    mode=CancellationMode.FORCE,
                    queue_id="gpu",
                    reason="user requested stop",
                )
            )
        )
        self.assertTrue(cancelled.ok)
        self.assertEqual(cancelled.state, ComputeTaskState.CANCELLED)
        self.assertEqual(cancelled.task_status.cancellation_reason, "user requested stop")
        self.assertEqual(cancelled.task_status.metadata["cancellation_mode"], CancellationMode.FORCE.value)

        queue = await resolve_maybe_awaitable(adapter.queue_state("gpu"))
        self.assertIsInstance(queue, ComputeQueueState)
        self.assertEqual(queue.cancelled, 1)
        self.assertEqual(queue.pending, 0)

    async def test_backend_errors_are_returned_as_normalized_results(self):
        adapter = MockModelComputeAdapter()
        adapter.fail_next = MockAccelerateError(
            "CUDA worker lost",
            code="CUDA_WORKER_LOST",
            retryable=True,
        )

        result = await resolve_maybe_awaitable(adapter.run_inference(self.make_inference_request()))

        self.assertFalse(result.ok)
        self.assertEqual(result.outputs, ())
        self.assertEqual(result.task_status.state, ComputeTaskState.FAILED)
        self.assertEqual(result.message, "CUDA worker lost")
        self.assertEqual(result.metadata["error"]["category"], "backend")
        self.assertEqual(result.metadata["error"]["type"], "MockAccelerateError")
        self.assertEqual(result.metadata["error"]["code"], "CUDA_WORKER_LOST")
        self.assertTrue(result.metadata["error"]["retryable"])
        self.assertTrue(result.metadata["normalized"])

    async def test_resource_accounting_records_compute_contract_usage(self):
        adapter = MockModelComputeAdapter()
        token_resource = ResourceRef(
            uri="model://mock-llm@main",
            kind=ResourceKind.MODEL,
            component="ipfs_accelerate_py",
        )

        result = await resolve_maybe_awaitable(
            adapter.reserve_resources(
                ResourceAccountingRequest(
                    actor=self.actor,
                    phase=ResourceAccountingPhase.RESERVED,
                    task_id="task-accounting",
                    model=self.model,
                    queue_id="local-compute",
                    claims=(
                        ResourceClaim(
                            resource=token_resource,
                            amount=12,
                            unit=ResourceUnit.TOKENS,
                        ),
                    ),
                )
            )
        )

        self.assertTrue(result.ok)
        self.assertIsInstance(result, ResourceAccountingResult)
        self.assertEqual(result.accounting.phase, ResourceAccountingPhase.RESERVED)
        self.assertEqual(result.accounting.task_id, "task-accounting")
        self.assertEqual(result.accounting.reserved[0].unit, ResourceUnit.TOKENS)

        records = await resolve_maybe_awaitable(adapter.resource_usage(task_id="task-accounting"))
        self.assertEqual([record.account_id for record in records], [result.accounting.account_id])


if __name__ == "__main__":
    unittest.main()
