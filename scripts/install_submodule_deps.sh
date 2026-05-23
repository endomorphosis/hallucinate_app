#!/bin/bash
# Installation script for all submodule dependencies
# This script installs Python dependencies from all submodules

set -e  # Exit on error

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Installing submodule dependencies..."
echo "Root directory: $ROOT_DIR"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to install requirements from a file
install_requirements() {
    local req_file=$1
    local description=$2
    
    if [ -f "$req_file" ]; then
        echo -e "${GREEN}Installing $description from $req_file${NC}"
        pip install -r "$req_file" || echo -e "${YELLOW}Warning: Some packages from $req_file may have failed to install${NC}"
    else
        echo -e "${YELLOW}Skipping $description - file not found: $req_file${NC}"
    fi
}

# Function to install from setup.py or pyproject.toml
install_package() {
    local package_dir=$1
    local package_name=$2
    
    if [ -d "$package_dir" ]; then
        echo -e "${GREEN}Installing $package_name from $package_dir${NC}"
        cd "$package_dir"
        
        # Check if setup.py or pyproject.toml exists
        if [ -f "setup.py" ] || [ -f "pyproject.toml" ]; then
            pip install -e . || echo -e "${YELLOW}Warning: Failed to install $package_name in editable mode${NC}"
        else
            echo -e "${YELLOW}No setup.py or pyproject.toml found for $package_name${NC}"
        fi
        
        cd "$ROOT_DIR"
    else
        echo -e "${YELLOW}Skipping $package_name - directory not found: $package_dir${NC}"
    fi
}

# Initialize and update submodules if not already done
echo -e "${GREEN}Initializing git submodules...${NC}"
cd "$ROOT_DIR"
git submodule update --init --recursive 2>&1 | grep -v "^Submodule" || true

# Install main project Python dependencies
echo -e "${GREEN}Installing main project dependencies...${NC}"
install_requirements "$ROOT_DIR/python/requirements.txt" "main Python requirements"
install_requirements "$ROOT_DIR/hallucinate_app/python/requirements.txt" "hallucinate_app Python requirements"
install_requirements "$ROOT_DIR/test/requirements.txt" "test requirements"

# Install ipfs_accelerate_py dependencies
echo -e "\n${GREEN}Installing ipfs_accelerate_py dependencies...${NC}"
install_requirements "$ROOT_DIR/ipfs_accelerate_py/requirements.txt" "ipfs_accelerate_py base requirements"
install_requirements "$ROOT_DIR/ipfs_accelerate_py/install/requirements_base.txt" "ipfs_accelerate_py base requirements"
install_requirements "$ROOT_DIR/ipfs_accelerate_py/requirements_dashboard.txt" "ipfs_accelerate_py dashboard requirements"
install_requirements "$ROOT_DIR/ipfs_accelerate_py/test/requirements.txt" "ipfs_accelerate_py test requirements"
install_requirements "$ROOT_DIR/ipfs_accelerate_py/ipfs_accelerate_py/mcp/requirements.txt" "ipfs_accelerate_py MCP requirements"
install_requirements "$ROOT_DIR/ipfs_accelerate_py/ipfs_accelerate_py/mcp/requirements-mcp.txt" "ipfs_accelerate_py MCP transport requirements"

# Optionally install platform-specific requirements for ipfs_accelerate_py
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${GREEN}Detected macOS - installing Apple-specific requirements${NC}"
    install_requirements "$ROOT_DIR/ipfs_accelerate_py/install/requirements_apple.txt" "ipfs_accelerate_py Apple requirements"
fi

# Install CUDA requirements if CUDA is available
if command -v nvcc &> /dev/null; then
    echo -e "${GREEN}CUDA detected - installing CUDA requirements${NC}"
    install_requirements "$ROOT_DIR/ipfs_accelerate_py/install/requirements_cuda.txt" "ipfs_accelerate_py CUDA requirements"
fi

# Install ipfs_datasets_py if available
if [ -d "$ROOT_DIR/ipfs_datasets_py" ] && [ -f "$ROOT_DIR/ipfs_datasets_py/setup.py" -o -f "$ROOT_DIR/ipfs_datasets_py/pyproject.toml" ]; then
    echo -e "\n${GREEN}Installing ipfs_datasets_py...${NC}"
    install_package "$ROOT_DIR/ipfs_datasets_py" "ipfs_datasets_py"
elif [ -f "$ROOT_DIR/ipfs_datasets_py/requirements.txt" ]; then
    install_requirements "$ROOT_DIR/ipfs_datasets_py/requirements.txt" "ipfs_datasets_py requirements"
fi

# Install ipfs_kit_py if available
if [ -d "$ROOT_DIR/ipfs_kit_py" ] && [ -f "$ROOT_DIR/ipfs_kit_py/setup.py" -o -f "$ROOT_DIR/ipfs_kit_py/pyproject.toml" ]; then
    echo -e "\n${GREEN}Installing ipfs_kit_py...${NC}"
    install_package "$ROOT_DIR/ipfs_kit_py" "ipfs_kit_py"
elif [ -f "$ROOT_DIR/ipfs_kit_py/requirements.txt" ]; then
    install_requirements "$ROOT_DIR/ipfs_kit_py/requirements.txt" "ipfs_kit_py requirements"
fi

# Install swissknife if available
if [ -d "$ROOT_DIR/swissknife" ] && [ -f "$ROOT_DIR/swissknife/setup.py" -o -f "$ROOT_DIR/swissknife/pyproject.toml" ]; then
    echo -e "\n${GREEN}Installing swissknife...${NC}"
    install_package "$ROOT_DIR/swissknife" "swissknife"
elif [ -f "$ROOT_DIR/swissknife/requirements.txt" ]; then
    install_requirements "$ROOT_DIR/swissknife/requirements.txt" "swissknife requirements"
fi

# Install ipfs_accelerate_py itself in editable mode
if [ -d "$ROOT_DIR/ipfs_accelerate_py" ] && [ -f "$ROOT_DIR/ipfs_accelerate_py/setup.py" -o -f "$ROOT_DIR/ipfs_accelerate_py/pyproject.toml" ]; then
    echo -e "\n${GREEN}Installing ipfs_accelerate_py package...${NC}"
    install_package "$ROOT_DIR/ipfs_accelerate_py" "ipfs_accelerate_py"
fi

echo -e "\n${GREEN}Submodule dependency installation completed!${NC}"
echo -e "${YELLOW}Note: Some packages may have failed to install. This is normal for optional dependencies.${NC}"
