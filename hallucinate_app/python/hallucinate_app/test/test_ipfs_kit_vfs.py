"""
IPFS Kit VFS Test Module

Focused regression tests for the VFS methods added to IPFSKitPy.
"""

import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from ipfs_kit_py import IPFSKitPy


class TestIPFSKitVFS(unittest.TestCase):
    def setUp(self):
        self.ipfs = IPFSKitPy(metadata={"use_mock": True})

    def tearDown(self):
        try:
            asyncio.run(self.ipfs.close())
        except Exception:
            pass

    def test_vfs_mount_unmount_and_list(self):
        async def run_flow():
            await self.ipfs.init()

            mount_result = await self.ipfs.vfs_mount("/ipfs/QmTestCid", "/tmp/ipfs-test-mount")
            self.assertTrue(mount_result["mounted"])
            self.assertEqual(mount_result["mount_point"], "/tmp/ipfs-test-mount")
            self.assertEqual(mount_result["ipfs_path"], "/ipfs/QmTestCid")

            mounts_result = await self.ipfs.vfs_list_mounts()
            self.assertEqual(mounts_result["count"], 1)
            self.assertEqual(mounts_result["mounts"][0]["mount_point"], "/tmp/ipfs-test-mount")

            unmount_result = await self.ipfs.vfs_unmount("/tmp/ipfs-test-mount")
            self.assertTrue(unmount_result["unmounted"])
            self.assertEqual(unmount_result["mount_point"], "/tmp/ipfs-test-mount")

            mounts_after = await self.ipfs.vfs_list_mounts()
            self.assertEqual(mounts_after["count"], 0)

        asyncio.run(run_flow())


if __name__ == "__main__":
    unittest.main()
