# hallucinate_app Tests

This directory contains all tests for the hallucinate_app project, specifically focused on testing the integration between the Electron GUI and the ipfs_accelerate_py model server.

## Test Structure

- `test.js` - Main test runner
- `js/` - JavaScript tests
  - `test_accelerate_bridge.js` - Tests for Python-JavaScript bridge
  - `test_accelerate_electron.js` - Tests for Electron UI integration
  - `python_bridge.js` - Implementation of Python-JavaScript communication
- `python/` - Python tests
  - `test_accelerate_server.py` - Tests for Python model server
  - `ipfs_accelerate_server.py` - Implementation of model server for testing

## Requirements

Before running tests, make sure you have the following dependencies installed:

### Python Dependencies
```bash
pip install fastapi uvicorn pydantic requests
```

### JavaScript Dependencies
```bash
npm install node-fetch chai
```

## Running Tests

### Run All Tests
```bash
node test/test.js
```

### Run JavaScript Bridge Tests Only
```bash
node test/js/test_accelerate_bridge.js
```

### Run Electron UI Tests Only
```bash
node test/js/test_accelerate_electron.js
```

### Run Python Server Tests Only
```bash
python test/python/test_accelerate_server.py
```

## Test Results

After running tests, results will be saved to:
- `test/test_results.json` - JSON formatted test results
- `test/TEST_REPORT.md` - Markdown formatted test report

## Adding New Tests

When adding new tests:

1. Always add them to the appropriate subdirectory in the test folder
2. Follow the existing pattern for error handling and results reporting
3. Make sure tests can run independently and as part of the test suite
4. Update the main test runner if needed

## Guidelines

- Tests should be comprehensive but focused on specific functionality
- Always clean up resources after tests (stop servers, close connections)
- Test both success and error scenarios
- Maintain isolation between tests to prevent interference