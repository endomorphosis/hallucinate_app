import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    CapabilityAction,
    CapabilityGrant,
    IdentityRef,
    ResourceClaim,
    ResourceKind,
    ResourceRef,
    ResourceUnit,
    StorageOperation,
    StorageRef,
    StorageRequest,
)
from hallucinate_app.virtual_os.sandbox import (  # noqa: E402
    CommandDenied,
    ResourceLimitDenied,
    SandboxCommand,
    SandboxPolicy,
    StorageCapabilityScope,
    StorageScopeDenied,
    UnsafeOperationDenied,
    VirtualOSSandbox,
    storage_operation_action,
)


class TestVirtualOSSandbox(unittest.TestCase):
    def setUp(self):
        self.actor = IdentityRef(did="did:example:agent", roles=("agent",))
        self.issuer = IdentityRef(did="did:example:system", roles=("system",))
        self.cpu = ResourceRef(
            uri="hardware://local/cpu",
            kind=ResourceKind.HARDWARE,
            component="local",
            name="cpu",
        )
        self.memory = ResourceRef(
            uri="hardware://local/memory",
            kind=ResourceKind.HARDWARE,
            component="local",
            name="memory",
        )

    def make_policy(self, *, storage_capabilities=(), storage_scopes=()):
        return SandboxPolicy(
            policy_id="test-sandbox",
            command_allowlist=("python", "echo"),
            resource_limits=(
                ResourceClaim(
                    resource=self.cpu,
                    amount=1000,
                    unit=ResourceUnit.MILLICORES,
                    hard_limit=True,
                    metadata={"source": "test-cpu-limit"},
                ),
                ResourceClaim(
                    resource=self.memory,
                    amount=512 * 1024 * 1024,
                    unit=ResourceUnit.BYTES,
                    hard_limit=True,
                    metadata={"source": "test-memory-limit"},
                ),
            ),
            storage_capabilities=tuple(storage_capabilities),
            storage_scopes=tuple(storage_scopes),
        )

    def test_command_allowlist_allows_known_command_and_denies_unlisted_command(self):
        sandbox = VirtualOSSandbox(self.make_policy())
        allowed = sandbox.require_command(
            SandboxCommand(
                argv=("python", "-m", "py_compile", "example.py"),
                actor=self.actor,
                resource_claims=(
                    ResourceClaim(resource=self.cpu, amount=500, unit=ResourceUnit.MILLICORES),
                ),
            )
        )

        self.assertTrue(allowed.allowed)
        self.assertEqual(allowed.command[0], "python")
        self.assertEqual(allowed.metadata["resource_limits"]["hard_limit_count"], 2)
        self.assertEqual(allowed.metadata["resource_limits"]["limits"][0]["metadata"]["source"], "test-cpu-limit")

        denied = sandbox.authorize_command(("git", "status"))
        self.assertFalse(denied.allowed)
        self.assertIn("allowlist", denied.reason)

        with self.assertRaises(CommandDenied):
            sandbox.require_command(("git", "status"))

    def test_resource_limits_are_metadata_and_hard_limits_are_enforced(self):
        sandbox = VirtualOSSandbox(self.make_policy())
        within_limit = sandbox.require_resources(
            (
                ResourceClaim(resource=self.cpu, amount=250, unit=ResourceUnit.MILLICORES),
                ResourceClaim(resource=self.memory, amount=128 * 1024 * 1024, unit=ResourceUnit.BYTES),
            ),
            actor=self.actor,
        )

        self.assertTrue(within_limit.allowed)
        self.assertEqual(within_limit.metadata["resource_limits"]["hard_limit_count"], 2)
        self.assertEqual(within_limit.metadata["resource_limits"]["limits"][1]["unit"], ResourceUnit.BYTES.value)

        over_limit = sandbox.authorize_resources(
            (
                ResourceClaim(resource=self.memory, amount=1024 * 1024 * 1024, unit=ResourceUnit.BYTES),
            ),
            actor=self.actor,
        )
        self.assertFalse(over_limit.allowed)
        self.assertEqual(over_limit.metadata["resource_limit"], "exceeded")
        self.assertEqual(over_limit.metadata["limit"]["amount"], 512 * 1024 * 1024)

        with self.assertRaises(ResourceLimitDenied):
            sandbox.require_resources(
                (
                    ResourceClaim(resource=self.memory, amount=1024 * 1024 * 1024, unit=ResourceUnit.BYTES),
                ),
                actor=self.actor,
            )

    def test_storage_access_is_limited_by_capability_scope(self):
        grant = CapabilityGrant(
            grant_id="grant-storage-read-workspace",
            action=CapabilityAction.READ,
            resource=ResourceRef(uri="vfs:///workspace/*", kind=ResourceKind.STORAGE),
            issuer=self.issuer,
            audience=self.actor,
            constraints={"operation": "storage.read"},
        )
        sandbox = VirtualOSSandbox(self.make_policy(storage_capabilities=(grant,)))

        allowed = sandbox.require_storage(
            StorageRequest(
                operation=StorageOperation.READ,
                ref=StorageRef(uri="vfs:///workspace/data.json", path="/workspace/data.json"),
                actor=self.actor,
            )
        )

        self.assertTrue(allowed.allowed)
        self.assertEqual(allowed.matched_grant, grant)
        self.assertEqual(storage_operation_action(StorageOperation.READ), CapabilityAction.READ)

        denied_path = sandbox.authorize_storage(
            StorageRequest(
                operation=StorageOperation.READ,
                ref=StorageRef(uri="vfs:///secrets/token.txt", path="/secrets/token.txt"),
                actor=self.actor,
            )
        )
        self.assertFalse(denied_path.allowed)
        self.assertIn("capability", denied_path.reason)

        with self.assertRaises(StorageScopeDenied):
            sandbox.require_storage(
                StorageRequest(
                    operation=StorageOperation.ADD,
                    ref=StorageRef(uri="vfs:///workspace/new.json", path="/workspace/new.json"),
                    actor=self.actor,
                )
            )

    def test_storage_scope_can_bound_grants_to_a_maximum_path(self):
        grant = CapabilityGrant(
            grant_id="grant-storage-admin",
            action=CapabilityAction.ADMIN,
            resource=ResourceRef(uri="vfs:///*", kind=ResourceKind.STORAGE),
            issuer=self.issuer,
            audience=self.actor,
        )
        scope = StorageCapabilityScope(
            scope_id="workspace-read-only",
            action=CapabilityAction.READ,
            resource=ResourceRef(uri="vfs:///workspace/*", kind=ResourceKind.STORAGE),
            operations=(StorageOperation.READ,),
        )
        sandbox = VirtualOSSandbox(self.make_policy(storage_capabilities=(grant,), storage_scopes=(scope,)))

        allowed = sandbox.require_storage(
            StorageRequest(
                operation=StorageOperation.READ,
                ref=StorageRef(uri="vfs:///workspace/report.md", path="/workspace/report.md"),
                actor=self.actor,
            )
        )
        self.assertTrue(allowed.allowed)
        self.assertEqual(allowed.metadata["storage_scope"], "workspace-read-only")

        outside_scope = sandbox.authorize_storage(
            StorageRequest(
                operation=StorageOperation.READ,
                ref=StorageRef(uri="vfs:///other/report.md", path="/other/report.md"),
                actor=self.actor,
            )
        )
        self.assertFalse(outside_scope.allowed)
        self.assertEqual(outside_scope.metadata["storage_scope"], "missing")

    def test_explicit_unsafe_operations_are_denied(self):
        sandbox = VirtualOSSandbox(self.make_policy())

        denied = sandbox.deny_unsafe_operation("host_filesystem_write", actor=self.actor)
        self.assertFalse(denied.allowed)
        self.assertEqual(denied.metadata["unsafe_operation"], "host_filesystem_write")

        with self.assertRaises(UnsafeOperationDenied):
            sandbox.require_safe_operation("network_egress", actor=self.actor)

        with self.assertRaises(UnsafeOperationDenied):
            sandbox.require_command(SandboxCommand(argv=("echo", "hello"), actor=self.actor, shell=True))


if __name__ == "__main__":
    unittest.main()
