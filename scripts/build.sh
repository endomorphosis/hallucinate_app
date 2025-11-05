#!/bin/bash
# Build script for Hallucinate App
# This script builds the application for the current platform

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Detect platform
detect_platform() {
    case "$(uname -s)" in
        Linux*)     PLATFORM=linux;;
        Darwin*)    PLATFORM=darwin;;
        CYGWIN*|MINGW*|MSYS*)    PLATFORM=win32;;
        *)          PLATFORM=unknown;;
    esac
    echo "$PLATFORM"
}

PLATFORM=$(detect_platform)
print_status "Detected platform: $PLATFORM"

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18.x or 20.x"
        exit 1
    fi
    NODE_VERSION=$(node -v)
    print_status "Node.js version: $NODE_VERSION"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm"
        exit 1
    fi
    NPM_VERSION=$(npm -v)
    print_status "npm version: $NPM_VERSION"
    
    # Check Python
    if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
        print_warning "Python is not installed. Some features may not work."
    else
        if command -v python3 &> /dev/null; then
            PYTHON_VERSION=$(python3 --version)
        else
            PYTHON_VERSION=$(python --version)
        fi
        print_status "Python version: $PYTHON_VERSION"
    fi
    
    print_status "Prerequisites check complete"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    if [ -f "package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
    
    print_status "Dependencies installed"
}

# Build the application
build_app() {
    print_status "Building application for $PLATFORM..."
    
    # Clean previous builds
    if [ -d "out" ]; then
        print_status "Cleaning previous builds..."
        rm -rf out
    fi
    
    # Package the application
    print_status "Packaging application..."
    npm run package
    
    # Create installers
    print_status "Creating installers..."
    if [ "$PLATFORM" = "linux" ]; then
        npm run make -- --platform=linux
    elif [ "$PLATFORM" = "darwin" ]; then
        npm run make -- --platform=darwin
    elif [ "$PLATFORM" = "win32" ]; then
        npm run make -- --platform=win32
    else
        print_error "Unknown platform: $PLATFORM"
        exit 1
    fi
    
    print_status "Build complete!"
}

# List output
list_output() {
    print_status "Build artifacts:"
    
    if [ -d "out/make" ]; then
        find out/make -type f \( -name "*.deb" -o -name "*.rpm" -o -name "*.zip" -o -name "*.exe" -o -name "*.nupkg" \) -exec ls -lh {} \;
    else
        print_warning "No build artifacts found in out/make/"
    fi
}

# Main execution
main() {
    print_status "=== Hallucinate App Build Script ==="
    print_status ""
    
    check_prerequisites
    install_dependencies
    build_app
    list_output
    
    print_status ""
    print_status "=== Build completed successfully! ==="
    print_status "Build artifacts are in the out/ directory"
}

# Run main function
main "$@"
