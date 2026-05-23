import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock


PROJECT_ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from hallucinate_app.virtual_os.contracts import IdentityRef  # noqa: E402
from hallucinate_app.virtual_os.vfs import (  # noqa: E402
    IPFSKitVFSAdapter,
    IPLDBlock,
    IPLDCodec,
    VFSAddRequest,
    VFSAddressKind,
    VFSCatRequest,
    VFSListRequest,
    VFSNodeKind,
    VFSOperation,
    VFSStatRequest,
    raw_cid_v1_sha256,
    ref_from_cid,
    ref_from_ipld_block,
    ref_from_path,
)


class MockIPFSAPI:
    def __init__(self, *, add_cid="bafyadded"):
        self.add_cid = add_cid
        self.add = AsyncMock(side_effect=self._add)

    def _add(self, payload, *, pin=True, **options):
        return {
            "Hash": self.add_cid,
            "size": len(payload),
            "pin": pin,
            "options": options,
        }


class MockVFSManager:
    def __init__(self, *, content_by_path=None, stat_by_path=None, list_by_path=None):
        self.content_by_path = dict(content_by_path or {})
        self.stat_by_path = dict(stat_by_path or {})
        self.list_by_path = dict(list_by_path or {})
        self.execute_vfs_operation = AsyncMock(side_effect=self._execute_vfs_operation)
        self.list_files = AsyncMock(side_effect=self._list_files)

    def _execute_vfs_operation(self, operation, **kwargs):
        path = kwargs.get("path")
        if operation == "write":
            self.content_by_path[path] = kwargs["content"]
            return {"success": True}
        if operation == "cat":
            return {"content": self.content_by_path.get(path)}
        if operation == "stat":
            return dict(self.stat_by_path.get(path, {}))
        if operation == "ls":
            return {"entries": self.list_by_path.get(path, ())}
        return {"success": False, "error": f"unexpected operation: {operation}"}

    def _list_files(self, path):
        return {"entries": self.list_by_path.get(path, ())}


class MockMetadataIndex:
    def __init__(self, records=()):
        self.records = [dict(record) for record in records]
        self.add = AsyncMock(side_effect=self._add)
        self.save = AsyncMock(return_value=None)
        self.get_by_cid = AsyncMock(side_effect=self._get_by_cid)
        self.lookup_by_path = AsyncMock(side_effect=self._lookup_by_path)
        self.query = AsyncMock(side_effect=self._query)

    def _add(self, record):
        self.records.append(dict(record))
        return {"success": True}

    def _get_by_cid(self, cid):
        return self._find("cid", cid)

    def _lookup_by_path(self, path):
        return self._find("path", path)

    def _query(self, filters=None, limit=1):
        filters = filters or ()
        results = self.records
        for field, operator, expected in filters:
            if operator != "==":
                continue
            results = [record for record in results if record.get(field) == expected]
        return {"results": results[:limit]}

    def _find(self, key, value):
        for record in self.records:
            if record.get(key) == value:
                return dict(record)
        return None


class TestVirtualOSVFSAdapter(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.actor = IdentityRef(did="did:example:agent", roles=("agent",))

    async def test_add_writes_path_registers_metadata_and_normalizes_cid_result(self):
        ipfs_api = MockIPFSAPI(add_cid="bafyaddcid")
        vfs_manager = MockVFSManager()
        metadata_index = MockMetadataIndex()
        adapter = IPFSKitVFSAdapter(
            vfs_manager=vfs_manager,
            ipfs_api=ipfs_api,
            metadata_index=metadata_index,
        )

        result = await adapter.add(
            VFSAddRequest(
                ref=ref_from_path("datasets/wiki/train.jsonl"),
                actor=self.actor,
                payload=b'{"text":"hello"}\n',
                options={"mime_type": "application/jsonl", "metadata": {"split": "train"}},
            )
        )

        self.assertTrue(result.ok)
        self.assertEqual(result.operation, VFSOperation.ADD)
        self.assertEqual(result.ref.kind, VFSAddressKind.PATH)
        self.assertEqual(result.ref.path, "/datasets/wiki/train.jsonl")
        self.assertEqual(result.ref.cid, "bafyaddcid")
        self.assertEqual(result.node.size_bytes, 17)
        self.assertFalse(result.metadata["fallback_cid"])
        ipfs_api.add.assert_awaited_once()
        vfs_manager.execute_vfs_operation.assert_awaited_with(
            "write",
            path="/datasets/wiki/train.jsonl",
            content=b'{"text":"hello"}\n',
            mime_type="application/jsonl",
            metadata={"split": "train"},
        )
        metadata_index.add.assert_awaited_once()
        stored_row = metadata_index.add.await_args.args[0]
        self.assertEqual(stored_row["cid"], "bafyaddcid")
        self.assertEqual(stored_row["path"], "/datasets/wiki/train.jsonl")
        self.assertEqual(stored_row["size_bytes"], 17)
        self.assertEqual(stored_row["mime_type"], "application/jsonl")
        self.assertTrue(stored_row["pinned"])
        self.assertEqual(stored_row["metadata"]["split"], "train")
        metadata_index.save.assert_awaited_once()

    async def test_cat_reads_path_bytes_and_attaches_metadata_node(self):
        metadata_index = MockMetadataIndex(
            (
                {
                    "cid": "bafycatcid",
                    "path": "/datasets/wiki/train.jsonl",
                    "size_bytes": 17,
                    "mime_type": "application/jsonl",
                    "pinned": True,
                },
            )
        )
        adapter = IPFSKitVFSAdapter(
            vfs_manager=MockVFSManager(
                content_by_path={"/datasets/wiki/train.jsonl": b'{"text":"hello"}\n'},
            ),
            metadata_index=metadata_index,
        )

        result = await adapter.cat(
            VFSCatRequest(ref=ref_from_path("/datasets/wiki/train.jsonl"), actor=self.actor)
        )

        self.assertTrue(result.ok)
        self.assertEqual(result.operation, VFSOperation.CAT)
        self.assertEqual(result.data, b'{"text":"hello"}\n')
        self.assertEqual(result.node.ref.cid, "bafycatcid")
        self.assertEqual(result.node.ref.path, "/datasets/wiki/train.jsonl")
        self.assertEqual(result.node.node_kind, VFSNodeKind.FILE)
        self.assertEqual(result.node.media_type, "application/jsonl")
        metadata_index.lookup_by_path.assert_awaited_once_with("/datasets/wiki/train.jsonl")

    async def test_stat_resolves_metadata_by_cid_and_query_fallback(self):
        metadata_index = MockMetadataIndex(
            (
                {
                    "cid": "bafymetacid",
                    "path": "/models/model.bin",
                    "size_bytes": 4096,
                    "mime_type": "application/octet-stream",
                    "tags": ("model",),
                    "pinned": True,
                },
            )
        )
        adapter = IPFSKitVFSAdapter(metadata_index=metadata_index)

        by_cid = await adapter.stat(
            VFSStatRequest(ref=ref_from_cid("bafymetacid"), actor=self.actor)
        )

        self.assertTrue(by_cid.ok)
        self.assertEqual(by_cid.operation, VFSOperation.STAT)
        self.assertEqual(by_cid.node.ref.cid, "bafymetacid")
        self.assertEqual(by_cid.node.ref.path, "/models/model.bin")
        self.assertEqual(by_cid.node.size_bytes, 4096)
        self.assertEqual(by_cid.node.media_type, "application/octet-stream")
        metadata_index.get_by_cid.assert_awaited_once_with("bafymetacid")

        metadata_index.lookup_by_path.return_value = None
        metadata_index.lookup_by_path.side_effect = None
        via_query = await adapter.stat(
            VFSStatRequest(ref=ref_from_path("/models/model.bin"), actor=self.actor)
        )

        self.assertTrue(via_query.ok)
        self.assertEqual(via_query.node.ref.cid, "bafymetacid")
        metadata_index.query.assert_awaited_with(
            filters=[("path", "==", "/models/model.bin")],
            limit=1,
        )

    async def test_list_normalizes_native_entries_and_honors_limit(self):
        adapter = IPFSKitVFSAdapter(
            vfs_manager=MockVFSManager(
                stat_by_path={
                    "/datasets": {
                        "type": VFSNodeKind.DIRECTORY.value,
                        "name": "datasets",
                    }
                },
                list_by_path={
                    "/datasets": (
                        {
                            "name": "wiki",
                            "cid": "bafywiki",
                            "size": 128,
                            "type": VFSNodeKind.FILE.value,
                            "mime_type": "application/json",
                        },
                        {
                            "name": "books",
                            "cid": "bafybooks",
                            "size": 256,
                            "type": VFSNodeKind.FILE.value,
                        },
                    )
                },
            )
        )

        result = await adapter.list(
            VFSListRequest(ref=ref_from_path("/datasets"), actor=self.actor, limit=1)
        )

        self.assertTrue(result.ok)
        self.assertEqual(result.operation, VFSOperation.LIST)
        self.assertEqual(result.node.node_kind, VFSNodeKind.DIRECTORY.value)
        self.assertEqual(len(result.entries), 1)
        self.assertEqual(result.entries[0].ref.cid, "bafywiki")
        self.assertEqual(result.entries[0].ref.path, "/datasets/wiki")
        self.assertEqual(result.entries[0].size_bytes, 128)
        self.assertEqual(result.entries[0].media_type, "application/json")

    async def test_missing_backend_uses_content_addressed_fallback_idempotently(self):
        payload = b"same bytes produce same content address"
        expected_cid = raw_cid_v1_sha256(payload, codec=IPLDCodec.RAW)
        adapter = IPFSKitVFSAdapter()

        first = await adapter.add(
            VFSAddRequest(
                ref=ref_from_path("/scratch/one.txt"),
                actor=self.actor,
                payload=payload,
            )
        )
        second = await adapter.add(
            VFSAddRequest(
                ref=ref_from_path("/scratch/two.txt"),
                actor=self.actor,
                payload=payload,
            )
        )
        block_result = await adapter.add(
            VFSAddRequest(
                ref=ref_from_ipld_block(IPLDBlock(data=payload, codec=IPLDCodec.RAW)),
                actor=self.actor,
            )
        )

        self.assertTrue(first.ok)
        self.assertTrue(second.ok)
        self.assertTrue(block_result.ok)
        self.assertEqual(first.ref.cid, expected_cid)
        self.assertEqual(second.ref.cid, expected_cid)
        self.assertEqual(block_result.ref.cid, expected_cid)
        self.assertTrue(first.metadata["fallback_cid"])
        self.assertTrue(second.metadata["fallback_cid"])
        self.assertTrue(block_result.metadata["fallback_cid"])
        self.assertEqual(first.ref.path, "/scratch/one.txt")
        self.assertEqual(second.ref.path, "/scratch/two.txt")


if __name__ == "__main__":
    unittest.main()
