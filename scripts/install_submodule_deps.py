#!/usr/bin/env python3
"""
Installation script for all submodule dependencies
This script installs Python dependencies from all submodules
"""

import os
import sys
import subprocess
import platform
from pathlib import Path
from typing import List, Optional

# Color codes for terminal output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    NC = '\033[0m'  # No Color
    
    @staticmethod
    def disable():
        """Disable colors on Windows or when not in a TTY"""
        if platform.system() == 'Windows' or not sys.stdout.isatty():
            Colors.RED = ''
            Colors.GREEN = ''
            Colors.YELLOW = ''
            Colors.NC = ''

# Disable colors if needed
Colors.disable()

def get_root_dir() -> Path:
    """Get the root directory of the project"""
    script_dir = Path(__file__).parent.absolute()
    return script_dir.parent

def run_command(cmd: List[str], cwd: Optional[Path] = None, check: bool = False) -> bool:
    """Run a command and return success status"""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            check=check,
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except subprocess.CalledProcessError as e:
        print(f"{Colors.RED}Error running command: {' '.join(cmd)}{Colors.NC}")
        print(f"{Colors.RED}{e.stderr}{Colors.NC}")
        return False
    except Exception as e:
        print(f"{Colors.RED}Unexpected error: {e}{Colors.NC}")
        return False

def install_requirements(req_file: Path, description: str) -> bool:
    """Install requirements from a file"""
    if req_file.exists():
        print(f"{Colors.GREEN}Installing {description} from {req_file}{Colors.NC}")
        success = run_command([sys.executable, "-m", "pip", "install", "-r", str(req_file)])
        if not success:
            print(f"{Colors.YELLOW}Warning: Some packages from {req_file} may have failed to install{Colors.NC}")
        return success
    else:
        print(f"{Colors.YELLOW}Skipping {description} - file not found: {req_file}{Colors.NC}")
        return False

def install_package(package_dir: Path, package_name: str) -> bool:
    """Install a package from setup.py or pyproject.toml"""
    if package_dir.exists():
        setup_py = package_dir / "setup.py"
        pyproject_toml = package_dir / "pyproject.toml"
        
        if setup_py.exists() or pyproject_toml.exists():
            print(f"{Colors.GREEN}Installing {package_name} from {package_dir}{Colors.NC}")
            success = run_command(
                [sys.executable, "-m", "pip", "install", "-e", "."],
                cwd=package_dir
            )
            if not success:
                print(f"{Colors.YELLOW}Warning: Failed to install {package_name} in editable mode{Colors.NC}")
            return success
        else:
            print(f"{Colors.YELLOW}No setup.py or pyproject.toml found for {package_name}{Colors.NC}")
            return False
    else:
        print(f"{Colors.YELLOW}Skipping {package_name} - directory not found: {package_dir}{Colors.NC}")
        return False

def init_submodules(root_dir: Path) -> bool:
    """Initialize and update git submodules"""
    print(f"{Colors.GREEN}Initializing git submodules...{Colors.NC}")
    return run_command(
        ["git", "submodule", "update", "--init", "--recursive"],
        cwd=root_dir
    )

def has_cuda() -> bool:
    """Check if CUDA is available"""
    return run_command(["nvcc", "--version"])

def is_macos() -> bool:
    """Check if running on macOS"""
    return platform.system() == "Darwin"

def main():
    """Main installation function"""
    root_dir = get_root_dir()
    print(f"Installing submodule dependencies...")
    print(f"Root directory: {root_dir}\n")
    
    # Initialize submodules
    init_submodules(root_dir)
    
    # Install main project Python dependencies
    print(f"\n{Colors.GREEN}Installing main project dependencies...{Colors.NC}")
    install_requirements(root_dir / "python" / "requirements.txt", "main Python requirements")
    install_requirements(root_dir / "hallucinate_app" / "python" / "requirements.txt", "hallucinate_app Python requirements")
    install_requirements(root_dir / "test" / "requirements.txt", "test requirements")
    
    # Install ipfs_accelerate_py dependencies
    print(f"\n{Colors.GREEN}Installing ipfs_accelerate_py dependencies...{Colors.NC}")
    accelerate_dir = root_dir / "ipfs_accelerate_py"
    install_requirements(accelerate_dir / "requirements.txt", "ipfs_accelerate_py base requirements")
    install_requirements(accelerate_dir / "install" / "requirements_base.txt", "ipfs_accelerate_py base requirements")
    install_requirements(accelerate_dir / "requirements_dashboard.txt", "ipfs_accelerate_py dashboard requirements")
    install_requirements(accelerate_dir / "test" / "requirements.txt", "ipfs_accelerate_py test requirements")
    
    # Platform-specific requirements
    if is_macos():
        print(f"{Colors.GREEN}Detected macOS - installing Apple-specific requirements{Colors.NC}")
        install_requirements(accelerate_dir / "install" / "requirements_apple.txt", "ipfs_accelerate_py Apple requirements")
    
    # CUDA requirements
    if has_cuda():
        print(f"{Colors.GREEN}CUDA detected - installing CUDA requirements{Colors.NC}")
        install_requirements(accelerate_dir / "install" / "requirements_cuda.txt", "ipfs_accelerate_py CUDA requirements")
    
    # Install other submodules
    submodules = [
        ("ipfs_datasets_py", "ipfs_datasets_py"),
        ("ipfs_kit_py", "ipfs_kit_py"),
        ("swissknife", "swissknife"),
    ]
    
    for submodule_path, submodule_name in submodules:
        submodule_dir = root_dir / submodule_path
        print(f"\n{Colors.GREEN}Installing {submodule_name}...{Colors.NC}")
        
        # Try to install as package first
        if not install_package(submodule_dir, submodule_name):
            # Fall back to requirements.txt
            install_requirements(submodule_dir / "requirements.txt", f"{submodule_name} requirements")
    
    # Install ipfs_accelerate_py itself in editable mode
    print(f"\n{Colors.GREEN}Installing ipfs_accelerate_py package...{Colors.NC}")
    install_package(accelerate_dir, "ipfs_accelerate_py")
    
    print(f"\n{Colors.GREEN}Submodule dependency installation completed!{Colors.NC}")
    print(f"{Colors.YELLOW}Note: Some packages may have failed to install. This is normal for optional dependencies.{Colors.NC}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Installation interrupted by user{Colors.NC}")
        sys.exit(1)
    except Exception as e:
        print(f"\n{Colors.RED}Installation failed with error: {e}{Colors.NC}")
        sys.exit(1)
