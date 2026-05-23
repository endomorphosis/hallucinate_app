import copy
import hashlib
import json
import socket
import sys
import unittest
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    CapabilityAction,
    CapabilityDenied,
    CapabilityGrant,
    IdentityRef,
    ResourceKind,
    ResourceRef,
)


CORE_MCP_PLUS_PLUS_PROFILES = {
    "mcp++/idl",
    "mcp++/cid-envelope",
    "mcp++/ucan",
    "mcp++/event-dag",
    "mcp++/risk-scheduler",
}

CAPABILITY_ACTIONS = {
    "mcp++/invoke": CapabilityAction.EXECUTE,
    "mcp++/describe": CapabilityAction.READ,
    "mcp++/read-cid": CapabilityAction.READ,
    "mcp++/write-cid": CapabilityAction.WRITE,
    "mcp++/derive-cid": CapabilityAction.WRITE,
    "read": CapabilityAction.READ,
    "execute": CapabilityAction.EXECUTE,
    "delegate": CapabilityAction.DELEGATE,
    "admin": CapabilityAction.ADMIN,
    "emit": CapabilityAction.EMIT,
    "subscribe": CapabilityAction.SUBSCRIBE,
}


def load_profile() -> dict[str, Any]:
    with (PROJECT_ROOT / "config" / "mcp_plus_plus_profile.json").open("r", encoding="utf-8") as handle:
        return json.load(handle)


def fake_cid(label: str) -> str:
    digest = hashlib.sha256(label.encode("utf-8")).hexdigest()
    return f"bafy{digest[:52]}"


def cid_like(value: Any) -> bool:
    return isinstance(value, str) and value.startswith(("bafy", "bafk", "Qm")) and len(value) >= 12


def get_path(payload: dict[str, Any], dotted_path: str) -> Any:
    cursor: Any = payload
    for part in dotted_path.split("."):
        if not isinstance(cursor, dict) or part not in cursor:
            return None
        cursor = cursor[part]
    return cursor


def service_requirements(profile: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        service["serviceId"]: service
        for service in profile.get("serviceRequirements", ())
    }


def build_interface_descriptor(profile: dict[str, Any], service: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": service["serviceId"],
        "namespace": service["descriptorNamespace"],
        "version": profile["profileVersion"],
        "methods": [
            {
                "name": method,
                "input_schema_cid": fake_cid(f"{service['serviceId']}:{method}:input"),
                "output_schema_cid": fake_cid(f"{service['serviceId']}:{method}:output"),
            }
            for method in service["requiredInterfaces"]
        ],
        "errors": [
            {
                "code": "capability_denied",
                "message": "A matching capability grant is required.",
            }
        ],
        "requires": service["minimumProfiles"],
        "compatibility": {
            "compatible": True,
            "reasons": [],
            "requires_missing": [],
            "suggested_alternatives": [],
        },
        "schema_hash": fake_cid(f"{service['serviceId']}:descriptor"),
    }


def build_service_descriptor(profile: dict[str, Any], service: dict[str, Any]) -> dict[str, Any]:
    interface_cids = [
        fake_cid(f"{service['serviceId']}:{method}:interface")
        for method in service["requiredInterfaces"]
    ]
    descriptor_cids = [
        fake_cid(f"{service['serviceId']}:{method}:descriptor")
        for method in service["requiredInterfaces"]
    ]
    return {
        "service_id": service["serviceId"],
        "component": service["component"],
        "title": service["serviceId"].replace("-", " ").title(),
        "version": profile["profileVersion"],
        "endpoints": [
            {
                "protocol": "stdio",
                "address": f"offline://{service['serviceId']}",
            }
        ],
        "capabilities": service["requiredCapabilities"],
        "resources": service["resourceClaims"],
        "metadata": {
            "mcp_plus_plus": {
                "profile_id": profile["id"],
                "profile_version": profile["profileVersion"],
                "supported_profiles": service["minimumProfiles"],
                "interface_cids": interface_cids,
                "descriptor_cids": descriptor_cids,
                "event_streams": service["emittedEventStreams"],
                "scheduler_class": profile["scheduler"]["frontier"],
                "authorization_required": True,
                "transport_bindings": [
                    {
                        "transport_id": profile["transport"]["baseline"]["id"],
                        "protocol": "stdio",
                        "address": f"offline://{service['serviceId']}",
                    }
                ],
            }
        },
    }


def validate_interface_descriptor(profile: dict[str, Any], descriptor: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required = profile["idl"]["descriptorRequiredFields"]
    for field in required:
        if field not in descriptor:
            errors.append(f"interface descriptor missing required field: {field}")

    for method in descriptor.get("methods", ()):
        if not isinstance(method, dict):
            errors.append("interface descriptor method must be an object")
            continue
        for field in profile["idl"]["methodRequiredFields"]:
            if field not in method:
                errors.append(f"interface descriptor method missing required field: {field}")
        for cid_field in ("input_schema_cid", "output_schema_cid"):
            if cid_field in method and not cid_like(method[cid_field]):
                errors.append(f"interface descriptor method has invalid CID field: {cid_field}")

    compatibility = descriptor.get("compatibility", {})
    for field in profile["idl"]["compatibilityVerdictFields"]:
        if field not in compatibility:
            errors.append(f"interface descriptor compatibility missing required field: {field}")
    return errors


def validate_service_descriptor(profile: dict[str, Any], descriptor: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for field in profile["descriptorRequirements"]["serviceDescriptorRequiredFields"]:
        if get_path(descriptor, field) is None:
            errors.append(f"service descriptor missing required field: {field}")

    endpoint_protocols = {
        endpoint.get("protocol")
        for endpoint in descriptor.get("endpoints", ())
        if isinstance(endpoint, dict)
    }
    supported_protocols = set(profile["transport"]["baseline"]["supportedEndpointProtocols"])
    if not endpoint_protocols:
        errors.append("service descriptor must advertise at least one endpoint")
    elif not endpoint_protocols & supported_protocols:
        errors.append("service descriptor endpoint does not preserve baseline MCP transport")

    metadata = descriptor.get("metadata", {}).get("mcp_plus_plus", {})
    for field in profile["descriptorRequirements"]["serviceDescriptorMcpPlusPlusMetadata"]:
        if field not in metadata:
            errors.append(f"service descriptor mcp_plus_plus metadata missing required field: {field}")

    for field in ("interface_cids", "descriptor_cids"):
        values = metadata.get(field, ())
        if not values:
            errors.append(f"service descriptor mcp_plus_plus metadata has no {field}")
        for value in values:
            if not cid_like(value):
                errors.append(f"service descriptor mcp_plus_plus metadata has invalid CID in {field}")
    return errors


@dataclass(frozen=True)
class CapabilityRoute:
    service_id: str
    component: str
    capability: str
    action: CapabilityAction
    resource: ResourceRef


class OfflineCapabilityRouter:
    def __init__(self, profile: dict[str, Any]) -> None:
        self.services = service_requirements(profile)

    def route(self, service_id: str, capability: str) -> CapabilityRoute:
        service = self.services[service_id]
        if capability not in service["requiredCapabilities"]:
            raise CapabilityDenied(f"{service_id} does not advertise {capability}")
        if capability not in CAPABILITY_ACTIONS:
            raise CapabilityDenied(f"{capability} is not in the MCP++ capability vocabulary")
        action = CAPABILITY_ACTIONS[capability]
        resource = ResourceRef(
            uri=f"virtual-os://services/{service_id}",
            kind=ResourceKind.SERVICE,
            component=service["component"],
            name=service_id,
        )
        return CapabilityRoute(
            service_id=service_id,
            component=service["component"],
            capability=capability,
            action=action,
            resource=resource,
        )

    def authorize(self, grant: CapabilityGrant, service_id: str, capability: str) -> CapabilityRoute:
        route = self.route(service_id, capability)
        if not grant.matches(route.action, route.resource):
            raise CapabilityDenied(f"grant {grant.grant_id} does not authorize {capability}")
        return route


def build_envelope(parent_cids: tuple[str, ...] = ()) -> dict[str, Any]:
    return {
        "interface_cid": fake_cid("interface:storage.add"),
        "input_cid": fake_cid("input:storage.add"),
        "intent_cid": fake_cid("intent:storage.add"),
        "parents": list(parent_cids),
        "policy_cid": fake_cid("policy:default"),
        "proof_cid": fake_cid("proof:ucan"),
        "created_at": "2026-05-22T00:00:00Z",
    }


def build_receipt(envelope: dict[str, Any]) -> dict[str, Any]:
    return {
        "intent_cid": envelope["intent_cid"],
        "output_cid": fake_cid("output:storage.add"),
        "proofs_checked": [envelope["proof_cid"]],
        "decision_cid": fake_cid("decision:allow"),
        "time_observed": "2026-05-22T00:00:01Z",
        "receipt_cid": fake_cid("receipt:storage.add"),
        "envelope_cid": fake_cid("envelope:storage.add"),
        "signer_did": "did:key:z6MkOfflineMcpConformancePlaceholder",
        "signatures": [
            {
                "type": "placeholder",
                "algorithm": "ed25519",
                "status": "pending",
                "covers": ["intent_cid", "output_cid", "decision_cid", "receipt_cid"],
            }
        ],
    }


def validate_envelope_and_receipt(
    profile: dict[str, Any],
    envelope: dict[str, Any],
    receipt: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    for field in profile["envelope"]["executionEnvelopeRequiredFields"]:
        if field not in envelope:
            errors.append(f"execution envelope missing required field: {field}")
    for field in ("interface_cid", "input_cid", "intent_cid", "policy_cid", "proof_cid"):
        if field in envelope and not cid_like(envelope[field]):
            errors.append(f"execution envelope has invalid CID field: {field}")
    if not isinstance(envelope.get("parents"), list):
        errors.append("execution envelope parents must be a list")
    else:
        for parent in envelope["parents"]:
            if not cid_like(parent):
                errors.append("execution envelope parent must be a CID")

    for field in profile["envelope"]["receiptRequiredFields"]:
        if field not in receipt:
            errors.append(f"receipt missing required field: {field}")
    for field in ("intent_cid", "output_cid", "decision_cid", "receipt_cid", "envelope_cid"):
        if field in receipt and not cid_like(receipt[field]):
            errors.append(f"receipt has invalid CID field: {field}")

    if "signatures" not in profile["envelope"]["receiptRecommendedFields"]:
        errors.append("profile does not reserve receipt signatures metadata")
    if "signer_did" not in profile["envelope"]["receiptRecommendedFields"]:
        errors.append("profile does not reserve receipt signer DID metadata")

    signatures = receipt.get("signatures")
    if not isinstance(signatures, list) or not signatures:
        errors.append("receipt must carry an offline signing placeholder")
    else:
        for signature in signatures:
            if signature.get("type") != "placeholder":
                errors.append("offline receipt signature must be marked as a placeholder")
            if signature.get("status") != "pending":
                errors.append("offline receipt signature placeholder must be pending")
            if not signature.get("algorithm"):
                errors.append("offline receipt signature placeholder must name an algorithm")
            if "receipt_cid" not in signature.get("covers", ()):
                errors.append("offline receipt signature placeholder must bind the receipt CID")

    signer_did = receipt.get("signer_did", "")
    if not isinstance(signer_did, str) or not signer_did.startswith("did:key:"):
        errors.append("receipt signer_did must be a did:key placeholder")
    return errors


def build_event(event_cid: str, parents: tuple[str, ...] = ()) -> dict[str, Any]:
    return {
        "event_cid": event_cid,
        "parents": list(parents),
        "interface_cid": fake_cid("interface:storage.add"),
        "intent_cid": fake_cid(f"intent:{event_cid}"),
        "proof_cid": fake_cid("proof:ucan"),
        "decision_cid": fake_cid(f"decision:{event_cid}"),
        "output_cid": fake_cid(f"output:{event_cid}"),
        "receipt_cid": fake_cid(f"receipt:{event_cid}"),
        "peer_did": "did:key:z6MkOfflinePeer",
        "timestamps": {
            "enqueued": "2026-05-22T00:00:00Z",
            "observed": "2026-05-22T00:00:01Z",
        },
        "event_type": "mcp_plus_plus.invocation.completed",
    }


def validate_event_dag(profile: dict[str, Any], events: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for index, event in enumerate(events):
        event_cid = event.get("event_cid")
        if not cid_like(event_cid):
            errors.append(f"event at index {index} must include a valid event_cid")
            continue
        if event_cid in seen:
            errors.append(f"duplicate event_cid: {event_cid}")

        for field in profile["eventDag"]["eventNodeRequiredFields"]:
            if field not in event:
                errors.append(f"event {event_cid} missing required field: {field}")

        parents = event.get("parents")
        if not isinstance(parents, list):
            errors.append(f"event {event_cid} parents must be a list")
        else:
            for parent in parents:
                if parent == event_cid:
                    errors.append(f"event {event_cid} cannot parent itself")
                if parent not in seen:
                    errors.append(f"event {event_cid} parent must appear before child: {parent}")
        seen.add(event_cid)
    return errors


class OfflineTransportSelector:
    def __init__(self, profile: dict[str, Any]) -> None:
        self.profile = profile
        self.network_attempted = False

    def select(self, service: dict[str, Any], *, allow_live_network: bool = False) -> dict[str, Any]:
        wants_p2p = "mcp+p2p" in service.get("minimumProfiles", ())
        if wants_p2p and allow_live_network:
            self.network_attempted = True
            socket.create_connection(("127.0.0.1", 9), timeout=0.001)
            return {
                "transport_id": self.profile["transport"]["p2p"]["id"],
                "protocol": self.profile["transport"]["p2p"]["protocolIds"][0],
                "fallback": False,
            }

        baseline = self.profile["transport"]["baseline"]
        return {
            "transport_id": baseline["id"],
            "protocol": baseline["supportedEndpointProtocols"][0],
            "fallback": wants_p2p,
            "fallback_reason": "live network disabled for conformance tests" if wants_p2p else "",
            "pubsub_required": self.profile["transport"]["p2p"]["pubsub"]["required"],
        }


class TestVirtualOSMCPConformance(unittest.TestCase):
    def setUp(self) -> None:
        self.profile = load_profile()
        self.services = service_requirements(self.profile)

    def assert_no_errors(self, errors: list[str]) -> None:
        self.assertEqual(errors, [])

    def test_profile_defines_offline_conformance_contract(self) -> None:
        self.assertTrue(self.profile["conformance"]["offlineRequired"])
        self.assertFalse(self.profile["conformance"]["liveNetworkRequired"])
        self.assertTrue(self.profile["transport"]["baseline"]["required"])
        self.assertFalse(self.profile["transport"]["p2p"]["required"])
        self.assertFalse(self.profile["transport"]["p2p"]["pubsub"]["required"])
        self.assertEqual(
            self.profile["idl"]["descriptorRequiredFields"],
            self.profile["descriptorRequirements"]["interfaceDescriptorRequiredFields"],
        )
        self.assertTrue(
            CORE_MCP_PLUS_PLUS_PROFILES.issubset(set(self.profile["mcpPlusPlusProfiles"]))
        )

    def test_descriptor_schema_accepts_profile_derived_fixtures_and_rejects_missing_fields(self) -> None:
        for service in self.services.values():
            with self.subTest(service_id=service["serviceId"]):
                self.assertTrue(
                    CORE_MCP_PLUS_PLUS_PROFILES.issubset(set(service["minimumProfiles"]))
                )

                descriptor = build_service_descriptor(self.profile, service)
                interface = build_interface_descriptor(self.profile, service)
                self.assert_no_errors(validate_service_descriptor(self.profile, descriptor))
                self.assert_no_errors(validate_interface_descriptor(self.profile, interface))

                broken_descriptor = copy.deepcopy(descriptor)
                del broken_descriptor["metadata"]["mcp_plus_plus"]["profile_id"]
                errors = validate_service_descriptor(self.profile, broken_descriptor)
                self.assertIn(
                    "service descriptor mcp_plus_plus metadata missing required field: profile_id",
                    errors,
                )

                broken_interface = copy.deepcopy(interface)
                del broken_interface["methods"][0]["output_schema_cid"]
                errors = validate_interface_descriptor(self.profile, broken_interface)
                self.assertIn(
                    "interface descriptor method missing required field: output_schema_cid",
                    errors,
                )

    def test_capability_routing_matches_service_requirements_and_grants(self) -> None:
        router = OfflineCapabilityRouter(self.profile)
        issuer = IdentityRef(did="did:key:z6MkIssuer")
        audience = IdentityRef(did="did:key:z6MkAgent")
        grant = CapabilityGrant(
            grant_id="grant-execute-compute",
            action=CapabilityAction.EXECUTE,
            resource=ResourceRef(
                uri="virtual-os://services/ipfs-accelerate-mcp",
                kind=ResourceKind.SERVICE,
                component="ipfs_accelerate_py",
            ),
            issuer=issuer,
            audience=audience,
            token_ref="ucan:placeholder:compute-execute",
        )

        route = router.authorize(grant, "ipfs-accelerate-mcp", "mcp++/invoke")

        self.assertEqual(route.service_id, "ipfs-accelerate-mcp")
        self.assertEqual(route.component, "ipfs_accelerate_py")
        self.assertEqual(route.action, CapabilityAction.EXECUTE)
        self.assertEqual(route.resource.uri, "virtual-os://services/ipfs-accelerate-mcp")

        read_only_grant = CapabilityGrant(
            grant_id="grant-read-only",
            action=CapabilityAction.READ,
            resource=grant.resource,
            issuer=issuer,
            audience=audience,
            token_ref="ucan:placeholder:read-only",
        )
        with self.assertRaises(CapabilityDenied):
            router.authorize(read_only_grant, "ipfs-accelerate-mcp", "mcp++/invoke")
        with self.assertRaises(CapabilityDenied):
            router.route("ipfs-accelerate-mcp", "mcp++/read-cid/not-in-profile")

    def test_envelope_receipt_and_signing_placeholders_validate_offline(self) -> None:
        envelope = build_envelope()
        receipt = build_receipt(envelope)

        self.assert_no_errors(validate_envelope_and_receipt(self.profile, envelope, receipt))

        unsigned_receipt = copy.deepcopy(receipt)
        unsigned_receipt.pop("signatures")
        errors = validate_envelope_and_receipt(self.profile, envelope, unsigned_receipt)
        self.assertIn("receipt must carry an offline signing placeholder", errors)

        broken_envelope = copy.deepcopy(envelope)
        broken_envelope["parents"] = ["not-a-cid"]
        errors = validate_envelope_and_receipt(self.profile, broken_envelope, receipt)
        self.assertIn("execution envelope parent must be a CID", errors)

    def test_event_dag_enforces_strict_partial_order_without_total_ordering_independent_events(self) -> None:
        root_a = fake_cid("event:a")
        root_b = fake_cid("event:b")
        child = fake_cid("event:c")
        grandchild = fake_cid("event:d")
        events = [
            build_event(root_a),
            build_event(root_b),
            build_event(child, (root_a, root_b)),
            build_event(grandchild, (child,)),
        ]

        self.assertEqual(self.profile["eventDag"]["ordering"], "strict-partial-order")
        self.assert_no_errors(validate_event_dag(self.profile, events))

        valid_positions = {event["event_cid"]: index for index, event in enumerate(events)}
        self.assertLess(valid_positions[root_a], valid_positions[child])
        self.assertLess(valid_positions[root_b], valid_positions[child])

        reversed_events = [events[2], events[0], events[1]]
        errors = validate_event_dag(self.profile, reversed_events)
        self.assertIn(f"event {child} parent must appear before child: {root_a}", errors)
        self.assertIn(f"event {child} parent must appear before child: {root_b}", errors)

        self_parented = [build_event(root_a, (root_a,))]
        errors = validate_event_dag(self.profile, self_parented)
        self.assertIn(f"event {root_a} cannot parent itself", errors)

    def test_transport_fallback_stays_offline_when_p2p_is_unavailable(self) -> None:
        selector = OfflineTransportSelector(self.profile)
        reference_service = self.services["mcp-plus-plus-reference"]

        with patch("socket.create_connection", side_effect=AssertionError("live network was attempted")):
            route = selector.select(reference_service, allow_live_network=False)

        self.assertFalse(selector.network_attempted)
        self.assertEqual(route["transport_id"], "mcp-json-rpc")
        self.assertIn(route["protocol"], self.profile["transport"]["baseline"]["supportedEndpointProtocols"])
        self.assertTrue(route["fallback"])
        self.assertFalse(route["pubsub_required"])
        self.assertEqual(route["fallback_reason"], "live network disabled for conformance tests")


if __name__ == "__main__":
    unittest.main()
