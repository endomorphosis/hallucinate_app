import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).parents[2]
CLI = PROJECT_ROOT / "scripts" / "virtual_os.py"


class TestVirtualOSCLI(unittest.TestCase):
    def run_cli(self, *args, check=True):
        result = subprocess.run(
            [sys.executable, str(CLI), *args],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise AssertionError(f"stdout was not JSON:\n{result.stdout}\nstderr:\n{result.stderr}") from error
        if check and result.returncode != 0:
            raise AssertionError(f"CLI failed with {result.returncode}: {json.dumps(payload, indent=2)}\n{result.stderr}")
        return result, payload

    def test_static_commands_emit_json(self):
        for command in ("verify", "test-matrix", "rollback"):
            args = [command]
            if command == "verify":
                args.append("--no-baseline")
            result, payload = self.run_cli(*args)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(payload["schema_version"], "virtual-ai-os-cli.v1")
            self.assertEqual(payload["command"], command)
            self.assertTrue(payload["ok"])

        _, matrix = self.run_cli("test-matrix", "--required-only")
        self.assertGreater(matrix["summary"]["suite_count"], 0)
        self.assertTrue(all(suite["requiredBeforeMerge"] for suite in matrix["testSuites"]))

        _, rollback = self.run_cli("rollback")
        self.assertTrue(rollback["dry_run"])
        self.assertGreaterEqual(len(rollback["targets"]), 1)
        self.assertTrue(all(target["rollback_sha"] for target in rollback["targets"]))

    def test_lifecycle_commands_manage_mock_daemon(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            state_file = temp_path / "state.json"
            daemon_config = temp_path / "daemons.json"
            daemon_config.write_text(json.dumps(mock_daemon_config(temp_path)), encoding="utf-8")

            common = [
                "--state-file",
                str(state_file),
                "--daemon-config",
                str(daemon_config),
                "--component",
                "ipfs_kit_py",
                "--daemon",
                "ipfs_kit_py",
                "--no-baseline",
            ]

            try:
                result, boot = self.run_cli("boot", *common, "--wait", "--health-timeout", "3")
                self.assertEqual(result.returncode, 0)
                self.assertTrue(boot["ok"])
                boot_daemons = boot["boot"]["daemon_boot"]
                self.assertEqual(len(boot_daemons), 1)
                self.assertEqual(boot_daemons[0]["status"], "running")
                self.assertTrue(boot_daemons[0]["pid"])

                _, status = self.run_cli("status", *common)
                self.assertTrue(status["ok"])
                self.assertEqual(status["daemons"][0]["status"], "running")
                self.assertEqual(status["daemons"][0]["state"], "healthy")

                _, restart = self.run_cli("restart", *common, "--wait", "--health-timeout", "3")
                self.assertTrue(restart["ok"])
                self.assertEqual(restart["boot"]["daemon_boot"][0]["status"], "running")

                _, stopped = self.run_cli("stop", *common)
                self.assertTrue(stopped["ok"])
                self.assertEqual(stopped["daemons"][0]["status"], "stopped")

                _, final_status = self.run_cli("status", *common)
                self.assertEqual(final_status["daemons"][0]["status"], "stopped")
            finally:
                self.run_cli("stop", *common, check=False)


def mock_daemon_config(temp_path):
    return {
        "schemaVersion": "virtual-ai-os-daemons.v1",
        "defaults": {
            "host": "127.0.0.1",
            "env": {"PYTHONUNBUFFERED": "1"},
            "launch": {
                "shell": False,
                "stdio": "pipe",
                "startupTimeoutMs": 3000,
                "shutdownTimeoutMs": 1000,
            },
            "healthCheck": {
                "enabled": True,
                "type": "process",
                "timeoutMs": 500,
                "intervalMs": 60000,
                "expectedStatuses": [200],
            },
        },
        "daemons": [
            {
                "id": "ipfs_kit_py",
                "componentId": "ipfs_kit_py",
                "title": "Mock IPFS Kit",
                "endpoint": {
                    "protocol": "http",
                    "host": "127.0.0.1",
                    "port": 39991,
                    "path": "/",
                },
                "launch": {
                    "command": sys.executable,
                    "args": ["-c", "import time; time.sleep(60)"],
                    "cwd": str(temp_path),
                    "env": {"VIRTUAL_AI_OS_COMPONENT": "ipfs_kit_py"},
                },
                "healthCheck": {"type": "process"},
            }
        ],
    }


if __name__ == "__main__":
    unittest.main()
