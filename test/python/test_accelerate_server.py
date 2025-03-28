import unittest
import json
import requests
import os
import sys
import subprocess
import time
import signal
from pathlib import Path

class TestAccelerateServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Find the server script path - FORCE the test server for now
        project_root = Path(__file__).parents[2]
        cls.server_path = project_root / "test" / "python" / "ipfs_accelerate_server.py"
        
        if not cls.server_path.exists():
            raise FileNotFoundError(f"Test server script not found at {cls.server_path}")
        
        print(f"Starting test server from: {cls.server_path}")
        
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
                    print("Server started successfully")
                    break
            except requests.ConnectionError:
                pass
            
            retries += 1
            time.sleep(1)
            print(f"Waiting for server... retry {retries}/{max_retries}")
        
        if retries >= max_retries:
            cls.tearDownClass()
            raise ConnectionError("Failed to connect to server")
    
    @classmethod
    def tearDownClass(cls):
        # Terminate server
        if hasattr(cls, 'server_process') and cls.server_process:
            print("Shutting down server...")
            cls.server_process.terminate()
            
            try:
                cls.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                print("Server did not terminate gracefully, force killing...")
                # Force kill if not terminated
                if cls.server_process.poll() is None:
                    if os.name == 'nt':  # Windows
                        os.kill(cls.server_process.pid, signal.CTRL_C_EVENT)
                    else:  # Unix/Linux
                        os.kill(cls.server_process.pid, signal.SIGKILL)
                        
            print("Server shutdown complete.")
    
    def test_server_status(self):
        """Test that the server is running and responds to status requests"""
        response = requests.get(f"{self.server_url}/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('status', data)
        self.assertEqual(data['status'], 'running')
    
    def test_load_model(self):
        """Test model loading endpoint"""
        model_id = "test-model"
        response = requests.post(
            f"{self.server_url}/load_model",
            json={"model_id": model_id}
        )
        self.assertEqual(response.status_code, 200, f"Failed to load model: {response.text}")
        data = response.json()
        self.assertIn('status', data)
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['model'], model_id)
    
    def test_inference(self):
        """Test inference endpoint"""
        # First load a model
        model_id = "inference-test-model"
        load_response = requests.post(
            f"{self.server_url}/load_model",
            json={"model_id": model_id}
        )
        self.assertEqual(load_response.status_code, 200, f"Failed to load model for inference test: {load_response.text}")
        
        # Test inference
        test_input = {"text": "Test input for inference"}
        response = requests.post(
            f"{self.server_url}/inference",
            json=test_input
        )
        self.assertEqual(response.status_code, 200, f"Inference failed: {response.text}")
        data = response.json()
        
        # Validate response structure
        self.assertIsInstance(data, dict)
        self.assertIn('output', data, "Response does not contain 'output' field")
        self.assertIn('input', data, "Response does not contain 'input' field")
        
        # Check that the input text was processed correctly
        self.assertEqual(data['input'], test_input['text'])
    
    def test_model_test_endpoint(self):
        """Test the test endpoint"""
        response = requests.get(f"{self.server_url}/test")
        self.assertEqual(response.status_code, 200, f"Test endpoint failed: {response.text}")
        data = response.json()
        
        # Validate response structure
        self.assertIsInstance(data, dict)
        self.assertIn('status', data)
        self.assertIn('test_results', data)
        
        # Test results should contain initialization, model_loading, and inference
        test_results = data['test_results']
        self.assertIn('initialization', test_results)
        self.assertIn('model_loading', test_results)
        self.assertIn('inference', test_results)

if __name__ == "__main__":
    unittest.main()