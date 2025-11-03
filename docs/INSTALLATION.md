# Installing Dependencies for hallucinate_app

This document explains how to install all dependencies for the hallucinate_app project, including dependencies from all submodules.

## Overview

The hallucinate_app project uses git submodules to include several Python packages:
- `ipfs_accelerate_py` - Accelerated IPFS operations
- `ipfs_datasets_py` - IPFS dataset management
- `ipfs_kit_py` - Core IPFS toolkit
- `swissknife` - Utility tools

Each submodule has its own set of dependencies that need to be installed for the project to function correctly.

## Quick Start

### Automatic Installation (Recommended)

When you run `npm install`, the postinstall hook will automatically:
1. Install all Node.js/JavaScript dependencies
2. Initialize git submodules
3. Install Python dependencies for all submodules

```bash
npm install
```

### Manual Installation

If you prefer to install dependencies manually or need more control:

#### Using Make (Unix/Linux/macOS)

```bash
# Install all dependencies (main project + submodules)
make install-all-deps

# Or install them separately
make install-deps              # Main project dependencies
make install-submodule-deps    # Submodule dependencies only
```

#### Using Installation Scripts Directly

**Bash (Unix/Linux/macOS):**
```bash
bash scripts/install_submodule_deps.sh
```

**Python (Cross-platform):**
```bash
python scripts/install_submodule_deps.py
```

## What Gets Installed

### Main Project Dependencies

**JavaScript/Node.js:**
- Electron and Electron Forge
- IPFS JavaScript libraries
- Testing frameworks (Mocha, Playwright)
- Other runtime dependencies

**Python:**
- Core libraries (PyArrow, fsspec, numpy)
- IPFS Kit Python with extras
- FastAPI and Uvicorn for API server
- Testing frameworks (pytest)
- Observability tools (prometheus_client, structlog)

### Submodule Dependencies

#### ipfs_accelerate_py
- Base requirements (aiohttp, duckdb, websockets)
- Dashboard requirements
- Test requirements
- Platform-specific requirements:
  - Apple/macOS specific packages (if on macOS)
  - CUDA packages (if CUDA is detected)
  - OpenVINO, Qualcomm QNN, WebNN/WebGPU support (optional)

#### ipfs_datasets_py
- Dataset handling libraries
- IPFS integration tools

#### ipfs_kit_py
- IPFS client libraries
- Filesystem spec implementations
- Content indexing tools

#### swissknife
- Utility and helper libraries

## Platform-Specific Installation

### macOS
The installation script automatically detects macOS and installs Apple-specific requirements from `ipfs_accelerate_py/install/requirements_apple.txt`.

### CUDA Systems
If CUDA is detected (via `nvcc` command), the script automatically installs CUDA-specific requirements from `ipfs_accelerate_py/install/requirements_cuda.txt`.

### Windows
Use the Python installation script for best compatibility:
```powershell
python scripts\install_submodule_deps.py
```

## Troubleshooting

### Submodules Not Initialized

If submodules are empty, initialize them manually:
```bash
git submodule update --init --recursive
```

### Some Packages Fail to Install

This is normal! Many packages in the submodules are optional dependencies for specific features. The installation will continue even if some packages fail.

To see which packages failed:
```bash
bash scripts/install_submodule_deps.sh 2>&1 | grep -i "error\|failed"
```

### Python Version Issues

Ensure you're using Python 3.8 or later:
```bash
python --version  # Should be 3.8+
```

If you have multiple Python versions, you might need to use `python3`:
```bash
python3 scripts/install_submodule_deps.py
```

### Permission Errors

On Unix/Linux/macOS, if you get permission errors:
```bash
# Install in user directory (no sudo required)
pip install --user -r <requirements-file>

# Or use a virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r <requirements-file>
```

### Missing Dependencies for Submodules

If a submodule doesn't install properly:

1. Check if the submodule is initialized:
   ```bash
   ls -la ipfs_accelerate_py/  # Should contain files, not just .git
   ```

2. Manually install that submodule's dependencies:
   ```bash
   pip install -r ipfs_accelerate_py/requirements.txt
   ```

3. Install the submodule package in editable mode:
   ```bash
   cd ipfs_accelerate_py
   pip install -e .
   ```

## Virtual Environments (Recommended)

It's recommended to use a Python virtual environment:

```bash
# Create virtual environment
python -m venv venv

# Activate it
source venv/bin/activate  # Unix/Linux/macOS
# or
venv\Scripts\activate  # Windows

# Install all dependencies
npm install  # This will trigger the postinstall hook
```

## CI/CD Integration

For continuous integration, add these steps to your workflow:

```yaml
- name: Install Node.js dependencies
  run: npm install

- name: Install Python dependencies
  run: |
    python -m pip install --upgrade pip
    make install-all-deps
```

## Advanced Options

### Installing Only Specific Submodule Dependencies

Edit `scripts/install_submodule_deps.sh` or `.py` to comment out the submodules you don't need.

### Custom Requirements

If you need additional dependencies, add them to:
- Main project: `python/requirements.txt` or `hallucinate_app/python/requirements.txt`
- Tests: `test/requirements.txt`

### Skip Submodule Installation

If you don't want to install submodule dependencies automatically:

1. Remove the postinstall hook from `package.json`
2. Use `npm install --ignore-scripts` to skip the hook

## Verification

After installation, verify everything is working:

```bash
# Run tests
npm test

# Check Python packages
pip list | grep ipfs

# Check if submodules are available
python -c "import ipfs_kit_py; print('ipfs_kit_py OK')"
```

## Getting Help

If you encounter issues:
1. Check the [main README](../README.md)
2. Review the submodule documentation
3. Open an issue on GitHub with:
   - Your OS and Python version
   - The full error message
   - Output of `pip list` and `npm list`
