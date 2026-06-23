"""
Tests for DuckDB-IPLD Kit self-test behavior.
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


class CleanupFailureDuckDBIPLDKit(DuckDBIPLDKit):
    """Dependency-free kit stub for exercising self-test result handling."""

    def __init__(self):
        super().__init__()
        self.initialized = True

    async def execute(self, sql, params=None):
        if sql.strip().upper().startswith("SELECT"):
            return {"success": True, "row_count": 1}
        return {"success": True}

    async def export_table_to_ipld(self, table_name):
        return {"success": True, "cid": "test-cid"}

    async def export_table_to_parquet(self, table_name, output_path=None):
        return {"success": True}

    async def export_table_to_arrow(self, table_name):
        return {"success": True, "record_count": 1}


class TestDuckDBIPLDKit(unittest.TestCase):
    def test_self_test_reports_parquet_cleanup_failure(self):
        temp_dir = tempfile.mkdtemp()
        cleanup_error = OSError("cleanup failed")

        try:
            kit = CleanupFailureDuckDBIPLDKit()
            with patch("duckdb_ipld_kit.tempfile.mkdtemp", return_value=temp_dir), \
                    patch("shutil.rmtree", side_effect=cleanup_error):
                result = asyncio.run(kit.test())
        finally:
            shutil.rmtree(temp_dir)

        parquet_result = result["tests"]["parquet_export"]
        self.assertFalse(result["success"])
        self.assertFalse(parquet_result["success"])
        self.assertEqual(parquet_result["cleanup_error"], str(cleanup_error))


if __name__ == "__main__":
    unittest.main()
