import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    CapabilityAction,
    CapabilityDenied,
    CapabilityGrant,
    CapabilitySpec,
    IdentityRef,
    ResourceKind,
    ResourceRef,
    utc_now,
)
from hallucinate_app.virtual_os.security import (  # noqa: E402
    AuditOutcome,
    CapabilityCheck,
    CapabilityDecisionOutcome,
    CapabilityGrantSource,
    CredentialAccessRequest,
    CredentialKind,
    CredentialScope,
    DaemonPermission,
    DaemonPermissionRequest,
    InMemoryRevocationRegistry,
    LocalCapabilityAuthority,
    SubmoduleCredentialRef,
    UCANCapability,
    UCANProof,
    authorize_capability,
    authorize_credential_access,
    authorize_daemon_permission,
    credential_resource,
    daemon_resource,
    emit_denied_event,
    grant_allows,
    redact_error,
    require_capability,
    security_audit_event,
    service_resource,
    ucan_capability_to_grant,
)


FIXED_TIME = datetime(2026, 5, 22, 12, 0, 0, tzinfo=timezone.utc)


class TestVirtualOSSecurityContracts(unittest.TestCase):
    def setUp(self):
        self.issuer = IdentityRef(did="did:example:issuer", roles=("system",))
        self.actor = IdentityRef(did="did:example:agent", roles=("agent",))
        self.other_actor = IdentityRef(did="did:example:other", roles=("agent",))

    def test_local_grant_validation_checks_actor_action_resource_and_caveats(self):
        authority = LocalCapabilityAuthority(issuer=self.issuer)
        service = service_resource("models/primary")
        grant = authority.issue(
            CapabilitySpec(
                capability_id="model-execute",
                action=CapabilityAction.EXECUTE,
                resource_kind=ResourceKind.SERVICE,
            ),
            ResourceRef(
                uri="virtual-os://services/models/*",
                kind=ResourceKind.SERVICE,
                component="virtual_os.registry",
            ),
            self.actor,
            issuer=self.issuer,
            constraints={
                "service_id": "models/primary",
                "required_context": {"approval": "ticket-123"},
            },
            expires_at=FIXED_TIME + timedelta(days=1),
        )
        context = {"service_id": "models/primary", "approval": "ticket-123"}

        self.assertTrue(
            grant_allows(
                grant,
                CapabilityAction.EXECUTE,
                service,
                actor=self.actor,
                at=FIXED_TIME,
                context=context,
            )
        )
        self.assertFalse(
            grant_allows(
                grant,
                CapabilityAction.EXECUTE,
                service,
                actor=self.other_actor,
                at=FIXED_TIME,
                context=context,
            )
        )
        self.assertFalse(
            grant_allows(
                grant,
                CapabilityAction.WRITE,
                service,
                actor=self.actor,
                at=FIXED_TIME,
                context=context,
            )
        )
        self.assertFalse(
            grant_allows(
                grant,
                CapabilityAction.EXECUTE,
                service_resource("models/secondary"),
                actor=self.actor,
                at=FIXED_TIME,
                context={**context, "service_id": "models/secondary"},
            )
        )
        self.assertFalse(
            grant_allows(
                grant,
                CapabilityAction.EXECUTE,
                service,
                actor=self.actor,
                at=FIXED_TIME,
                context={**context, "approval": "missing"},
            )
        )

        decision = authorize_capability(
            self.actor,
            CapabilityAction.EXECUTE,
            service,
            (grant,),
            operation="model.invoke",
            at=FIXED_TIME,
            context=context,
            service_id="models/primary",
            trace_id="trace-grant-validation",
        )

        self.assertTrue(decision.allowed)
        self.assertEqual(decision.outcome, CapabilityDecisionOutcome.ALLOW)
        self.assertEqual(decision.matched_grant, grant)
        audit_event = decision.audit_event()
        self.assertEqual(audit_event.event_type, "security.capability.allow")
        self.assertEqual(audit_event.payload["matched_grant_id"], grant.grant_id)
        self.assertEqual(audit_event.trace_id, "trace-grant-validation")

    def test_revocation_lookup_invalidates_grant_and_redacts_audit_payload(self):
        raw_token = "ucan-token-with-sensitive-material-1234567890"
        grant = CapabilityGrant(
            grant_id="grant:storage-write",
            action=CapabilityAction.WRITE,
            resource=ResourceRef(uri="ipfs://bafydata", kind=ResourceKind.STORAGE),
            issuer=self.issuer,
            audience=self.actor,
            token_ref=raw_token,
            expires_at=FIXED_TIME + timedelta(days=1),
            metadata={"proof_cid": "bafyproofcid"},
        )
        registry = InMemoryRevocationRegistry()

        self.assertIsNone(registry.find_revocation(grant))
        self.assertTrue(
            grant_allows(
                grant,
                CapabilityAction.WRITE,
                ResourceRef(uri="ipfs://bafydata", kind=ResourceKind.STORAGE),
                actor=self.actor,
                at=FIXED_TIME,
                revocations=registry.list_revocations(),
            )
        )

        event = registry.revoke_grant(
            grant,
            actor=self.issuer,
            reason="rotated after token=raw-secret-value-123456",
        )
        revocation = registry.find_revocation(grant)

        self.assertIsNotNone(revocation)
        self.assertEqual(revocation.grant_id, grant.grant_id)
        self.assertFalse(
            grant_allows(
                grant,
                CapabilityAction.WRITE,
                ResourceRef(uri="ipfs://bafydata", kind=ResourceKind.STORAGE),
                actor=self.actor,
                at=FIXED_TIME,
                revocations=registry.list_revocations(),
            )
        )
        self.assertEqual(event.event_type, "security.capability.revoked")
        self.assertEqual(event.payload["token_ref"], "[REDACTED]")
        self.assertIn("token_ref", event.redacted_fields)
        self.assertNotIn(raw_token, repr(event.payload))
        self.assertNotIn("raw-secret-value-123456", repr(event.payload))

    def test_denied_operations_raise_and_emit_denied_events(self):
        daemon_request = DaemonPermissionRequest(
            daemon_id="ipfs",
            permission=DaemonPermission.RESTART,
            actor=self.actor,
            capabilities=(),
            trace_id="trace-denied-daemon",
        )
        daemon_decision = authorize_daemon_permission(daemon_request)

        self.assertFalse(daemon_decision.allowed)
        self.assertEqual(daemon_decision.capability_decision.outcome, CapabilityDecisionOutcome.DENY)
        self.assertEqual(daemon_decision.capability_decision.request.operation, "daemon.restart")

        denied_event = emit_denied_event(daemon_decision.capability_decision)
        self.assertEqual(denied_event.event_type, "security.operation.denied")
        self.assertEqual(denied_event.payload["outcome"], AuditOutcome.DENY.value)
        self.assertEqual(denied_event.payload["operation"], "daemon.restart")
        self.assertEqual(denied_event.subject, daemon_resource("ipfs"))
        self.assertEqual(denied_event.trace_id, "trace-denied-daemon")

        with self.assertRaises(CapabilityDenied) as denied:
            require_capability(
                self.actor,
                CapabilityAction.EXECUTE,
                daemon_resource("ipfs"),
                (),
                operation="daemon.restart",
                trace_id="trace-require-denied",
            )

        self.assertIn("missing", str(denied.exception))

    def test_redacted_error_logging_removes_tokens_keys_and_private_material(self):
        jwt = (
            "aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb."
            "cccccccccccccccc"
        )
        private_key = (
            "-----BEGIN PRIVATE KEY-----\n"
            "raw-private-key-material\n"
            "-----END PRIVATE KEY-----"
        )
        message = (
            f"backend failed with bearer supersecretbearertoken12345 "
            f"token={jwt} api_key=sk-live-secret {private_key}"
        )

        redacted_message = redact_error(message)
        self.assertNotIn("supersecretbearertoken12345", redacted_message)
        self.assertNotIn(jwt, redacted_message)
        self.assertNotIn("sk-live-secret", redacted_message)
        self.assertNotIn("raw-private-key-material", redacted_message)
        self.assertIn("[REDACTED", redacted_message)

        event = security_audit_event(
            event_type="security.error",
            outcome=AuditOutcome.ERROR,
            actor=self.actor,
            subject=credential_resource("ipfs_kit_py", "cluster"),
            action=CapabilityAction.READ,
            reason=message,
            payload={
                "authorization": "Bearer anothersecrettoken12345",
                "nested": {
                    "api_key": "sk-nested-secret",
                    "safe_id": "credential-id-not-secret",
                },
                "notes": f"token={jwt}",
            },
            trace_id="trace-redaction",
        )

        self.assertEqual(event.payload["authorization"], "[REDACTED]")
        self.assertEqual(event.payload["nested"]["api_key"], "[REDACTED]")
        self.assertEqual(event.payload["nested"]["safe_id"], "credential-id-not-secret")
        self.assertIn("authorization", event.redacted_fields)
        self.assertIn("nested.api_key", event.redacted_fields)
        self.assertIn("notes", event.redacted_fields)
        self.assertNotIn("anothersecrettoken12345", repr(event.payload))
        self.assertNotIn("sk-nested-secret", repr(event.payload))
        self.assertNotIn(jwt, repr(event.payload))
        self.assertNotIn("raw-private-key-material", repr(event.payload))

    def test_ucan_projection_and_credential_access_work_offline(self):
        credential = SubmoduleCredentialRef(
            credential_id="hf-read-token",
            component="ipfs_accelerate_py",
            kind=CredentialKind.BEARER_TOKEN,
            scope=CredentialScope.SUBMODULE,
            secret_ref="vault://local/raw-token",
            owner=self.issuer,
            allowed_services=("embedding-worker",),
            metadata={"token_ref": "raw-metadata-token"},
        )
        proof = UCANProof(
            proof_id="proof-offline-credential",
            issuer=self.issuer,
            audience=self.actor,
            capabilities=(
                UCANCapability(
                    resource=credential.resource().uri,
                    action=CapabilityAction.READ.value,
                    caveats={
                        "component": "ipfs_accelerate_py",
                        "required_context": {"purpose": "embedding"},
                    },
                ),
            ),
            token_cid="bafyucanproof",
            expires_at=utc_now() + timedelta(days=1),
        )

        projected = proof.to_grants()
        direct_projection = ucan_capability_to_grant(proof, proof.capabilities[0])
        self.assertEqual(len(projected), 1)
        self.assertEqual(projected[0].metadata["source"], CapabilityGrantSource.UCAN.value)
        self.assertEqual(direct_projection.resource.uri, credential.resource().uri)
        self.assertEqual(direct_projection.resource.kind, ResourceKind.SECRET)
        self.assertEqual(direct_projection.token_ref, "bafyucanproof")

        request = CredentialAccessRequest(
            credential=credential,
            actor=self.actor,
            service_id="embedding-worker",
            purpose="embedding",
            proofs=(proof,),
        )
        decision = authorize_credential_access(request)

        self.assertTrue(decision.allowed)
        self.assertEqual(decision.matched_grant.resource.uri, credential.resource().uri)
        self.assertEqual(decision.matched_grant.resource.kind, ResourceKind.SECRET)
        self.assertEqual(decision.matched_grant.metadata["source"], CapabilityGrantSource.UCAN.value)

        offline_check = CapabilityCheck(
            actor=self.actor,
            action=CapabilityAction.READ,
            resource=credential.resource(),
            proofs=(proof,),
            context={
                "component": "ipfs_accelerate_py",
                "purpose": "embedding",
            },
        )
        offline_decision = LocalCapabilityAuthority(issuer=self.issuer).authorize(offline_check)
        self.assertTrue(offline_decision.allowed)

        redacted_credential = credential.redacted()
        self.assertTrue(redacted_credential.secret_ref.startswith("redacted:"))
        self.assertEqual(redacted_credential.metadata["token_ref"], "[REDACTED]")
        self.assertNotIn("vault://local/raw-token", repr(redacted_credential))
        self.assertNotIn("raw-metadata-token", repr(redacted_credential))


if __name__ == "__main__":
    unittest.main()
