# IPFS Kit Test Suite

This directory contains comprehensive tests for the IPFS Kit module and its dashboard integration.

## Test Files

- `test_ipfs_kit.py`: Tests the core IPFS Kit functionality
- `test_ipfs_kit_integration.py`: Tests the integration with the dashboard

## Test Structure

The tests are designed to validate:

1. **Core Functionality**:
   - Initialization of IPFS Kit
   - Node information retrieval
   - Adding and retrieving content
   - Pin operations (add, list, remove)
   - Threading model (non-blocking operations)
   - Error handling

2. **Dashboard Integration**:
   - Bridge functionality
   - RPC interface
   - Status monitoring
   - Operation execution

## Running Tests

### Run Core Tests

```bash
cd hallucinate_app/python/hallucinate_app/test
python test_ipfs_kit.py --json
```

Options:
- `--json`: Output results in JSON format
- `--no-mock`: Use real IPFS daemon instead of mock implementation
- `--api-url`: Specify custom IPFS API URL

### Run Integration Tests

```bash
cd hallucinate_app/python/hallucinate_app/test
python test_ipfs_kit_integration.py
```

### Run All Tests

```bash
cd hallucinate_app/python/hallucinate_app/test
python test.py
```

## Mock Implementation

The test suite includes a mock implementation for testing without a real IPFS daemon. This enables:

- Testing in environments without IPFS
- Faster test execution
- Consistent test results

## Dashboard Testing

The dashboard components are tested through:

1. **Panel Testing**: Tests the Python dashboard panel functionality
2. **Bridge Testing**: Tests the JS-Python bridge communication
3. **UI Testing**: Mock tests for the JavaScript UI components

## Adding New Tests

When adding new functionality to IPFS Kit:

1. Add corresponding test cases to `test_ipfs_kit.py`
2. Update the mock implementation if needed
3. Add dashboard integration tests if applicable
4. Ensure tests pass both with mock and real implementations