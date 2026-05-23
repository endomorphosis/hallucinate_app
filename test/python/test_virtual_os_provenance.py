import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.compute import ModelRef  # noqa: E402
from hallucinate_app.virtual_os.contracts import (  # noqa: E402
    CapabilityAction,
    EventEnvelope,
    IdentityRef,
    ResourceKind,
    ResourceRef,
    StorageRef,
)
from hallucinate_app.virtual_os.knowledge import DatasetRef  # noqa: E402
from hallucinate_app.virtual_os.processes import AgentProcessKind, AgentProcessSpec  # noqa: E402
from hallucinate_app.virtual_os.provenance import (  # noqa: E402
    EventReference,
    ModelOutputRecord,
    PromptRecord,
    ProvenanceLedger,
    ProvenanceLedgerAdapter,
    ProvenanceLedgerRecord,
    ProvenanceQuery,
    ProvenanceRecordKind,
    canonical_provenance_json,
)
from hallucinate_app.virtual_os.security import (  # noqa: E402
    CapabilityCheck,
    CapabilityDecision,
    CapabilityDecisionOutcome,
)


FIXED_TIME = datetime(2026, 5, 22, 12, 30, 0, tzinfo=timezone.utc)


class TestVirtualOSProvenance(unittest.TestCase):
    def make_record(self, *, metadata=None):
        actor = IdentityRef(
            did="did:example:agent",
            display_name="Provenance Agent",
            roles=("agent",),
            metadata={"team": "data"},
        )
        dataset = DatasetRef(
            dataset_id="dataset-alpha",
            uri="dataset://dataset-alpha@2026.05",
            name="Dataset Alpha",
            version="2026.05",
            cid="bafybeigdataset",
            row_count=42,
            metadata={"z": "last", "a": "first"},
        )
        model = ModelRef(
            model_id="model-alpha",
            revision="main",
            provider="local",
            cid="bafybeigmodel",
            metadata={"adapter": "ipfs_accelerate_py"},
        )
        prompt = PromptRecord(
            prompt_id="prompt-alpha",
            text="Summarize the dataset row.",
            variables={"row": 7, "style": "brief"},
            cid="bafybeigprompt",
        )
        output = ModelOutputRecord(
            output_id="output-alpha",
            text="The row describes a stable provenance contract.",
            cid="bafybeigoutput",
            token_count=9,
            metadata={"finish_reason": "stop"},
        )
        process = AgentProcessSpec(
            process_id="agent-process-1",
            component="virtual_os.scheduler",
            entrypoint="agent.run",
            identity=actor,
            kind=AgentProcessKind.AGENT,
            queue_id="default",
        )
        policy_resource = ResourceRef(
            uri="model://model-alpha@main",
            kind=ResourceKind.MODEL,
            component="ipfs_accelerate_py",
        )
        policy = CapabilityDecision(
            request=CapabilityCheck(
                actor=actor,
                action=CapabilityAction.EXECUTE,
                resource=policy_resource,
                operation="model.inference",
                service_id="ipfs_accelerate_py.adapter",
                trace_id="trace-alpha",
            ),
            outcome=CapabilityDecisionOutcome.ALLOW,
            reason="capability matched",
            checked_at=FIXED_TIME,
            obligations=("record_provenance",),
            metadata={"policy": "local"},
        )
        event = EventEnvelope(
            event_id="event-model-completed",
            event_type="virtual_os.compute.inference.completed",
            source="ipfs_accelerate_py",
            occurred_at=FIXED_TIME,
            actor=actor,
            subject=policy_resource,
            trace_id="trace-alpha",
            correlation_id="correlation-alpha",
            parent_event_ids=("event-model-started",),
            payload={"tokens": 9, "ok": True},
            metadata={"category": "compute"},
        )

        return ProvenanceLedgerRecord(
            kind=ProvenanceRecordKind.MODEL_INFERENCE,
            operation="model.inference",
            cid="bafybeigoutput",
            dataset=dataset,
            model=model,
            prompt=prompt,
            output=output,
            agent_process=process,
            policy_decision=policy,
            events=(event,),
            actor=actor,
            subject=StorageRef(uri="ipfs://bafybeigoutput", cid="bafybeigoutput"),
            trace_id="trace-alpha",
            created_at=FIXED_TIME,
            metadata=metadata or {"z": "last", "a": "first"},
        )

    def test_record_contains_required_lineage_fields(self):
        record = self.make_record()
        payload = record.to_json_dict()

        self.assertTrue(record.record_id.startswith("provenance:"))
        self.assertTrue(record.record_cid.startswith("sha256:"))
        self.assertEqual(payload["cid"], "bafybeigoutput")
        self.assertEqual(payload["dataset"]["dataset_id"], "dataset-alpha")
        self.assertEqual(payload["dataset"]["cid"], "bafybeigdataset")
        self.assertEqual(payload["model"]["model_id"], "model-alpha")
        self.assertEqual(payload["model"]["cid"], "bafybeigmodel")
        self.assertEqual(payload["prompt"]["prompt_id"], "prompt-alpha")
        self.assertEqual(payload["prompt"]["cid"], "bafybeigprompt")
        self.assertEqual(payload["output"]["output_id"], "output-alpha")
        self.assertEqual(payload["output"]["cid"], "bafybeigoutput")
        self.assertEqual(payload["agent_process"]["process_id"], "agent-process-1")
        self.assertEqual(payload["policy_decision"]["outcome"], CapabilityDecisionOutcome.ALLOW.value)
        self.assertEqual(payload["events"][0]["event_id"], "event-model-completed")
        self.assertEqual(payload["event_references"], payload["events"])
        self.assertEqual(payload["events"][0]["parent_event_ids"], ["event-model-started"])

        parsed = json.loads(record.stable_json())
        self.assertEqual(parsed["record_id"], record.record_id)
        self.assertEqual(parsed["record_cid"], record.record_cid)

        implicit_cid = ProvenanceLedgerRecord(
            output=ModelOutputRecord(output_id="derived", cid="bafyderived"),
            created_at=FIXED_TIME,
        )
        self.assertEqual(implicit_cid.cid, "bafyderived")

    def test_json_serialization_is_stable_for_equivalent_records(self):
        first = self.make_record(metadata={"z": "last", "a": "first"})
        second = self.make_record(metadata={"a": "first", "z": "last"})

        self.assertEqual(first.record_id, second.record_id)
        self.assertEqual(first.record_cid, second.record_cid)
        self.assertEqual(first.stable_json(), second.stable_json())
        self.assertEqual(first.stable_json(), canonical_provenance_json(first.to_json_dict()))

    def test_ledger_records_queries_and_exports_stable_json(self):
        record = self.make_record()
        ledger = ProvenanceLedger()

        receipt = ledger.record(record)
        duplicate = ledger.record(record)

        self.assertIsInstance(ledger, ProvenanceLedgerAdapter)
        self.assertTrue(receipt.ok)
        self.assertEqual(receipt.cid, record.record_cid)
        self.assertEqual(len(ledger.records()), 1)
        self.assertEqual(duplicate.record.record_id, record.record_id)
        self.assertIs(ledger.get(record.record_id), record)
        self.assertIs(ledger.get(record.record_cid), record)
        self.assertIs(ledger.get(record.cid), record)

        self.assertEqual(ledger.query(ProvenanceQuery(cid="bafybeigoutput")), (record,))
        self.assertEqual(ledger.query(dataset_id="dataset-alpha"), (record,))
        self.assertEqual(ledger.query(model_id="model-alpha"), (record,))
        self.assertEqual(ledger.query(process_id="agent-process-1"), (record,))
        self.assertEqual(ledger.query(event_id="event-model-completed"), (record,))
        self.assertEqual(ledger.query(policy_outcome=CapabilityDecisionOutcome.ALLOW), (record,))
        self.assertEqual(ledger.query(actor_did="did:example:agent"), (record,))
        self.assertEqual(ledger.query(event_id="missing"), ())

        exported = ledger.stable_json()
        self.assertEqual(exported, ledger.stable_json())
        self.assertEqual(exported, ledger.export_json())
        self.assertEqual(json.loads(exported)[0]["record_id"], record.record_id)

    def test_event_reference_preserves_event_cid_and_trace_context(self):
        record = self.make_record()
        event = record.events[0]

        reference = EventReference.from_event(event)
        payload = reference.provenance_dict()

        self.assertEqual(payload["event_id"], "event-model-completed")
        self.assertTrue(payload["event_cid"].startswith("sha256:"))
        self.assertEqual(payload["trace_id"], "trace-alpha")
        self.assertEqual(payload["correlation_id"], "correlation-alpha")


if __name__ == "__main__":
    unittest.main()
