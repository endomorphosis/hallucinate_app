#!/usr/bin/env python3
"""
Test script to verify installation scripts work correctly
"""

import os
import sys
import subprocess
from pathlib import Path

def test_installation_scripts():
    """Test that installation scripts exist and are executable"""
    root_dir = Path(__file__).parent.parent.absolute()
    
    # Check if scripts exist
    bash_script = root_dir / "scripts" / "install_submodule_deps.sh"
    python_script = root_dir / "scripts" / "install_submodule_deps.py"
    
    print("Testing installation scripts...")
    
    # Test bash script exists and is executable
    if bash_script.exists():
        print(f"✓ Bash script exists: {bash_script}")
        if os.access(bash_script, os.X_OK):
            print("✓ Bash script is executable")
        else:
            print("✗ Bash script is not executable")
            return False
    else:
        print(f"✗ Bash script not found: {bash_script}")
        return False
    
    # Test python script exists and is executable
    if python_script.exists():
        print(f"✓ Python script exists: {python_script}")
        if os.access(python_script, os.X_OK):
            print("✓ Python script is executable")
        else:
            print("✗ Python script is not executable")
            return False
    else:
        print(f"✗ Python script not found: {python_script}")
        return False
    
    # Test bash script syntax
    try:
        result = subprocess.run(
            ["bash", "-n", str(bash_script)],
            capture_output=True,
            check=True
        )
        print("✓ Bash script syntax is valid")
    except subprocess.CalledProcessError as e:
        print(f"✗ Bash script syntax error: {e.stderr.decode()}")
        return False
    
    # Test python script syntax
    try:
        result = subprocess.run(
            [sys.executable, "-m", "py_compile", str(python_script)],
            capture_output=True,
            check=True
        )
        print("✓ Python script syntax is valid")
    except subprocess.CalledProcessError as e:
        print(f"✗ Python script syntax error: {e.stderr.decode()}")
        return False
    
    # Test that Python script can import required modules
    try:
        result = subprocess.run(
            [sys.executable, "-c", "import os, sys, subprocess, platform, pathlib"],
            capture_output=True,
            check=True
        )
        print("✓ Python script dependencies are available")
    except subprocess.CalledProcessError as e:
        print(f"✗ Python script dependencies missing: {e.stderr.decode()}")
        return False
    
    # Test that git is available
    try:
        result = subprocess.run(
            ["git", "--version"],
            capture_output=True,
            check=True
        )
        print("✓ Git is available")
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print("✗ Git is not available (required for submodule management)")
        return False
    
    # Check if submodules are configured
    gitmodules = root_dir / ".gitmodules"
    if gitmodules.exists():
        print(f"✓ .gitmodules exists")
        with open(gitmodules) as f:
            content = f.read()
            if "ipfs_accelerate_py" in content:
                print("✓ ipfs_accelerate_py submodule configured")
            if "ipfs_datasets_py" in content:
                print("✓ ipfs_datasets_py submodule configured")
            if "ipfs_kit_py" in content:
                print("✓ ipfs_kit_py submodule configured")
            if "swissknife" in content:
                print("✓ swissknife submodule configured")
    else:
        print("✗ .gitmodules not found")
        return False
    
    print("\n✓ All installation script tests passed!")
    return True

if __name__ == "__main__":
    success = test_installation_scripts()
    sys.exit(0 if success else 1)
