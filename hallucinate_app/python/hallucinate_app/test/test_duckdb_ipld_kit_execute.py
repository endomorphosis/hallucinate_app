import asyncio
import sys
import unittest
from pathlib import Path


parent_dir = str(Path(__file__).parent.parent)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

from duckdb_ipld_kit import DuckDBIPLDKit


class FailingDataFrameCursor:
    rowcount = 3

    def df(self):
        raise RuntimeError("dataframe conversion failed")


class FakeConnection:
    def execute(self, sql, params=None):
        return FailingDataFrameCursor()


class DuckDBIPLDKitExecuteTests(unittest.TestCase):
    def make_kit(self):
        kit = DuckDBIPLDKit()
        kit.mock_mode = False
        kit.initialized = True
        kit.conn = FakeConnection()
        return kit

    def test_select_df_failure_returns_error(self):
        kit = self.make_kit()

        result = asyncio.run(kit.execute("SELECT * FROM items"))

        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "dataframe conversion failed")
        self.assertEqual(result["sql"], "SELECT * FROM items")

    def test_insert_df_failure_uses_rowcount_fallback(self):
        kit = self.make_kit()

        result = asyncio.run(kit.execute("INSERT INTO items VALUES (1)"))

        self.assertTrue(result["success"])
        self.assertEqual(result["rows_affected"], 3)
        self.assertEqual(result["sql"], "INSERT INTO items VALUES (1)")


if __name__ == "__main__":
    unittest.main()
