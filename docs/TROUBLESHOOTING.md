# Troubleshooting Guide

This guide covers common issues and their solutions when working with Hallucinate App.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Runtime Errors](#runtime-errors)
- [Python Integration Issues](#python-integration-issues)
- [IPFS Connection Problems](#ipfs-connection-problems)
- [Authentication Issues](#authentication-issues)
- [Database Issues](#database-issues)
- [MCP Daemon Issues](#mcp-daemon-issues)
- [Performance Problems](#performance-problems)
- [Testing Issues](#testing-issues)

## Installation Issues

### Submodules Not Initialized

**Symptom**: Missing modules or import errors

**Solution**:
```bash
git submodule update --init --recursive
npm run install:submodules
```

### Python Dependencies Failed to Install

**Symptom**: `ModuleNotFoundError` when running Python code

**Solution**:
```bash
# Reinstall Python dependencies
cd ipfs_kit_py && pip install -e . && cd ..
cd ipfs_datasets_py && pip install -e . && cd ..
cd ipfs_accelerate_py && pip install -e . && cd ..

# Or use the installation script
bash scripts/install_submodule_deps.sh
```

### Node Modules Installation Fails

**Symptom**: npm install errors

**Solution**:
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules
npm install

# Or use Yarn
yarn install
```

### Electron Rebuild Issues

**Symptom**: Native module errors

**Solution**:
```bash
# Rebuild native modules
npm rebuild

# Or with electron-rebuild
npx electron-rebuild
```

## Runtime Errors

### Application Won't Start

**Symptom**: Electron app crashes on startup

**Diagnostic Steps**:
```bash
# Check for errors in console
npm start

# Run with debugging
NODE_ENV=development npm start

# Check Electron logs
# Linux/Mac: ~/.config/hallucinate_app/logs/
# Windows: %APPDATA%/hallucinate_app/logs/
```

**Common Causes**:
1. Missing configuration files
2. Python dependencies not installed
3. IPFS daemon not running (if required)
4. Port conflicts

**Solutions**:
```bash
# Copy configuration template
cp config/config\ template.toml config/config.toml

# Disable auto-start daemons temporarily
export AUTO_START_DAEMONS=false
npm start
```

### IPC Communication Failures

**Symptom**: "No IPC response" or timeout errors

**Solution**:
```javascript
// In main process, check IPC handlers are registered
ipcMain.handle('channel-name', async (event, data) => {
  // handler logic
});

// Increase timeout if needed
const result = await ipcRenderer.invoke('channel-name', data, {
  timeout: 30000 // 30 seconds
});
```

## Python Integration Issues

### Python Process Won't Start

**Symptom**: "Failed to start Python server"

**Diagnostic Steps**:
```bash
# Test Python script directly
python hallucinate_app/python/hallucinate_app/server.py

# Check Python path
which python
python --version

# Verify dependencies
pip list | grep ipfs
```

**Solutions**:
```bash
# Use specific Python version
export PYTHON_PATH=/usr/bin/python3.9

# Install missing dependencies
pip install -r requirements.txt
```

### PyArrow/Plasma Store Errors

**Symptom**: "Cannot connect to Plasma store"

**Solutions**:
```bash
# Install PyArrow with plasma support
pip install pyarrow[plasma]

# Start Plasma store manually
plasma_store -m 1000000000 -s /tmp/plasma

# Or use alternative without Plasma
export USE_PLASMA_STORE=false
```

### Apache Arrow Data Transfer Issues

**Symptom**: "Arrow serialization failed"

**Solutions**:
```javascript
// Check Arrow version compatibility
// JavaScript and Python should use compatible versions

// Install correct version
npm install apache-arrow@latest
pip install pyarrow==latest
```

## IPFS Connection Problems

### IPFS Daemon Not Running

**Symptom**: "Connection refused" on IPFS API

**Solutions**:
```bash
# Start IPFS daemon
ipfs daemon

# Or use embedded IPFS (js-ipfs)
export USE_JS_IPFS=true

# Check IPFS is running
ipfs id
```

### IPFS API Connection Timeout

**Symptom**: Timeouts when accessing IPFS

**Solutions**:
```javascript
// Increase timeout in configuration
{
  ipfs: {
    timeout: 60000, // 60 seconds
    retry: 3
  }
}
```

### Content Not Found

**Symptom**: "CID not found" errors

**Solutions**:
```bash
# Check if content is pinned
ipfs pin ls --type=all

# Add content manually
ipfs add <file>

# Pin existing content
ipfs pin add <cid>
```

## Authentication Issues

### UCAN Token Verification Failed

**Symptom**: "Invalid capability token"

**Diagnostic Steps**:
```javascript
// Check token expiration
const token = await authManager.getToken();
console.log('Expires:', token.expiration);

// Verify capability
const canAccess = await authManager.verifyCapability(
  token,
  'resource:action'
);
```

**Solutions**:
```javascript
// Request new token
const newToken = await authManager.issueToken({
  audience: principal,
  capabilities: ['resource:action'],
  expiration: Date.now() + 3600000 // 1 hour
});

// Or use mock authentication for development
export USE_MOCK_AUTH=true
```

### Keystore Access Denied

**Symptom**: "Failed to access keystore"

**Solutions**:
```bash
# Check keystore permissions
ls -la ~/.hallucinate_app/keystore/

# Reset keystore (WARNING: loses stored keys)
rm -rf ~/.hallucinate_app/keystore/
```

## Database Issues

### OrbitDB Connection Failed

**Symptom**: "Cannot connect to OrbitDB"

**Solutions**:
```javascript
// Check IPFS connection first
const ipfs = await IPFS.create();

// Use local OrbitDB instance
const orbitdb = await OrbitDB.createInstance(ipfs);

// Check database exists
const dbs = await orbitdb.list();
console.log('Databases:', dbs);
```

### FireproofDB Sync Issues

**Symptom**: "Sync failed" or data inconsistency

**Solutions**:
```javascript
// Force full sync
await fireproofDb.sync({ force: true });

// Check sync status
const status = await fireproofDb.syncStatus();
console.log('Sync status:', status);

// Reset local database (WARNING: loses local changes)
await fireproofDb.reset();
```

### DuckDB Query Failures

**Symptom**: SQL query errors

**Solutions**:
```javascript
// Check database connection
const conn = await duckdb.connect();

// Verify table exists
const tables = await duckdb.query('SHOW TABLES');
console.log('Tables:', tables);

// Use parameterized queries
const result = await duckdb.query(
  'SELECT * FROM table WHERE id = ?',
  [id]
);
```

## MCP Daemon Issues

### Daemon Won't Start

**Symptom**: "Failed to start MCP daemon"

**Diagnostic Steps**:
```bash
# Check daemon logs
tail -f ~/.config/hallucinate_app/logs/mcp-daemon.log

# Test daemon manually
python ipfs_accelerate_py/mcp_server.py

# Check port availability
lsof -i :8000
```

**Solutions**:
```bash
# Kill conflicting process
kill <pid>

# Use different port
export MCP_PORT=8001

# Disable auto-start
export AUTO_START_DAEMONS=false
```

### Daemon Crashed

**Symptom**: Daemon stopped unexpectedly

**Solutions**:
```javascript
// Enable auto-restart
const daemonManager = new DaemonManager({
  autoRestart: true,
  maxRestarts: 5
});

// Check health status
const status = await daemonManager.checkHealth();

// Restart daemon
await daemonManager.restart('daemon-name');
```

## Performance Problems

### Slow Model Loading

**Symptom**: Models take long time to load

**Solutions**:
```javascript
// Enable caching
const modelManager = new ModelManager({
  cache: true,
  cacheSize: '10GB'
});

// Use model quantization
const model = await modelManager.load('model-id', {
  quantize: '8bit'
});

// Preload frequently used models
await modelManager.preload(['model1', 'model2']);
```

### High Memory Usage

**Symptom**: Application uses too much memory

**Solutions**:
```javascript
// Limit process pool size
const processPool = new ProcessPool({
  maxProcesses: 4,
  memoryLimit: '4GB'
});

// Enable garbage collection
const v8 = require('v8');
v8.setFlagsFromString('--expose-gc');
global.gc();

// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('Memory:', usage);
}, 5000);
```

### UI Freezing

**Symptom**: Dashboard becomes unresponsive

**Solutions**:
```javascript
// Use web workers for heavy operations
const worker = new Worker('worker.js');
worker.postMessage(heavyTask);

// Debounce frequent updates
const debouncedUpdate = debounce(updateFunction, 250);

// Use virtual scrolling for large lists
const virtualList = new VirtualScroll({
  items: largeArray,
  rowHeight: 50
});
```

## Testing Issues

### Tests Failing Locally

**Symptom**: Tests pass in CI but fail locally

**Solutions**:
```bash
# Clean test environment
rm -rf test-results/
npm test

# Use same Node version as CI
nvm use 18

# Check environment variables
env | grep NODE
env | grep CI
```

### Playwright Tests Timeout

**Symptom**: E2E tests timeout

**Solutions**:
```bash
# Increase timeout
export PLAYWRIGHT_TIMEOUT=60000

# Run in headed mode to debug
npm run test:e2e:headed

# Use debug mode
npm run test:e2e:debug
```

### Mock Data Issues

**Symptom**: Tests fail due to mock data

**Solutions**:
```javascript
// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
  // or
  sinon.restore();
});

// Use consistent test data
const testData = require('./fixtures/test-data.json');
```

## Getting More Help

If your issue isn't covered here:

1. **Check existing issues**: [GitHub Issues](https://github.com/endomorphosis/hallucinate_app/issues)
2. **Search discussions**: [GitHub Discussions](https://github.com/endomorphosis/hallucinate_app/discussions)
3. **Create new issue**: Include:
   - Operating system and version
   - Node.js and Python versions
   - Steps to reproduce
   - Error messages and logs
   - Expected vs actual behavior

## Logs and Debugging

### Enable Debug Logging

```bash
# JavaScript debug logging
DEBUG=* npm start

# Python debug logging
export LOG_LEVEL=DEBUG
python script.py
```

### Log Locations

- **Linux**: `~/.config/hallucinate_app/logs/`
- **macOS**: `~/Library/Application Support/hallucinate_app/logs/`
- **Windows**: `%APPDATA%/hallucinate_app/logs/`

### Collect Diagnostic Information

```bash
# System information
node --version
python --version
npm list
pip list

# Application logs
tail -n 100 ~/.config/hallucinate_app/logs/main.log

# IPFS status
ipfs id
ipfs swarm peers

# Database status
sqlite3 ~/.hallucinate_app/database.db ".tables"
```

---

*If you find solutions to common problems not listed here, please contribute by creating a pull request!*
