import unittest
import json
import requests
import os
import sys
import subprocess
import time
import signal
from pathlib import Path

class TestIPFSAccelerateServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Find the server script path
        project_root = Path(__file__).parents[3]
        cls.server_path = project_root / "hallucinate_app" / "python" / "hallucinate_app" / "ipfs_accelerate_server.py"
        
        if not cls.server_path.exists():
            raise FileNotFoundError(f"Server script not found at {cls.server_path}")
        
        # Start server
        cls.server_process = subprocess.Popen(
            [sys.executable, str(cls.server_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Wait for server to start
        cls.server_url = "http://localhost:8000"
        max_retries = 10
        retries = 0
        
        while retries < max_retries:
            try:
                response = requests.get(f"{cls.server_url}/status")
                if response.status_code == 200:
                    break
            except requests.ConnectionError:
                pass
            
            retries += 1
            time.sleep(1)
        
        if retries >= max_retries:
            cls.tearDownClass()
            raise ConnectionError("Failed to connect to server")
    
    @classmethod
    def tearDownClass(cls):
        # Terminate server
        if hasattr(cls, 'server_process') and cls.server_process:
            cls.server_process.terminate()
            cls.server_process.wait(timeout=5)
            
            # Force kill if not terminated
            if cls.server_process.poll() is None:
                if os.name == 'nt':  # Windows
                    os.kill(cls.server_process.pid, signal.CTRL_C_EVENT)
                else:  # Unix/Linux
                    os.kill(cls.server_process.pid, signal.SIGKILL)
    
    def test_server_status(self):
        """Test that the server is running and responds to status requests"""
        response = requests.get(f"{self.server_url}/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('status', data)
        self.assertEqual(data['status'], 'running')
    
    def test_load_model(self):
        """Test model loading endpoint"""
        model_id = "bert-base-uncased"
        response = requests.post(
            f"{self.server_url}/load_model",
            json={"model_id": model_id}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('status', data)
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['model'], model_id)
    
    def test_inference(self):
        """Test inference endpoint"""
        # First load a model
        model_id = "bert-base-uncased"
        requests.post(
            f"{self.server_url}/load_model",
            json={"model_id": model_id}
        )
        
        # Test inference
        test_input = {"text": "This is a test input for inference"}
        response = requests.post(
            f"{self.server_url}/inference",
            json=test_input
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Validate response structure
        self.assertIn('input', data)
        self.assertIn('output', data)
        self.assertEqual(data['model'], model_id)
    
    def test_run_test(self):
        """Test the test endpoint"""
        response = requests.get(f"{self.server_url}/test")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Validate response contains test results
        self.assertIsInstance(data, dict)
        if 'test_results' in data:
            self.assertIsInstance(data['test_results'], dict)

if __name__ == "__main__":
    # Run unit tests and output results in JSON format
    test_loader = unittest.TestLoader()
    test_suite = test_loader.loadTestsFromTestCase(TestIPFSAccelerateServer)
    test_runner = unittest.TextTestRunner(verbosity=2)
    test_result = test_runner.run(test_suite)
    
    # Output results in JSON format
    results = {
        "total": test_result.testsRun,
        "failures": len(test_result.failures),
        "errors": len(test_result.errors),
        "success": test_result.wasSuccessful()
    }
    
    print(f"\nTest Summary: {json.dumps(results)}")