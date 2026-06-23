"""
Tests for DuckDB-IPLD kit self-test cleanup handling.
"""

import asyncio
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


parent_dir = str(Path(__file__).parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

from duckdb_ipld_kit import DuckDBIPLDKit


class TestDuckDBIPLDKitSelfTestCleanup(unittest.TestCase):
    def test_parquet_temp_cleanup_failure_is_reported(self):
        """Self-test should expose Parquet temp cleanup failures in results."""
        with patch("duckdb_ipld_kit.HAS_DUCKDB", True), \
                patch("duckdb_ipld_kit.HAS_IPLD", True):
            kit = DuckDBIPLDKit()
        kit.initialized = True

        async def execute(sql, params=None):
            if sql.strip().upper().startswith("SELECT"):
                return {"success": True, "row_count": 1}
            return {"success": True}

        async def export_table_to_ipld(table_name):
            return {"success": True, "cid": "bafy-test"}

        async def export_table_to_parquet(table_name, output_path):
            return {"success": True, "output_path": output_path}

        async def export_table_to_arrow(table_name):
            return {"success": True, "record_count": 1}

        kit.execute = execute
        kit.export_table_to_ipld = export_table_to_ipld
        kit.export_table_to_parquet = export_table_to_parquet
        kit.export_table_to_arrow = export_table_to_arrow

        temp_dir = tempfile.mkdtemp()

        def fail_rmtree(path):
            if path == temp_dir:
                raise OSError("cleanup failed")
            shutil.rmtree(path)

        try:
            with patch("duckdb_ipld_kit.tempfile.mkdtemp", return_value=temp_dir), \
                    patch("shutil.rmtree", side_effect=fail_rmtree), \
                    self.assertLogs("duckdb_ipld_kit", level="WARNING"):
                result = asyncio.run(kit.test())
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

        parquet_result = result["tests"]["parquet_export"]
        self.assertFalse(result["success"])
        self.assertFalse(parquet_result["success"])
        self.assertEqual(parquet_result["cleanup_error"], "cleanup failed")


if __name__ == "__main__":
    unittest.main()
