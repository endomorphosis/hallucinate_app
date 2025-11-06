# Platform-Specific Installation Guide

This guide provides detailed installation instructions for the Hallucinate App on different operating systems.

## Table of Contents
- [Ubuntu/Debian](#ubuntudebian)
- [RedHat/Rocky Linux/Fedora](#redhatrocky-linuxfedora)
- [macOS](#macos)
- [Windows](#windows)
- [Building from Source](#building-from-source)

---

## Ubuntu/Debian

### Installing from DEB Package

1. Download the latest `.deb` package from the [releases page](https://github.com/endomorphosis/hallucinate_app/releases)

2. Install the package:
```bash
sudo dpkg -i hallucinate_app_*.deb

# If there are dependency issues, fix them with:
sudo apt-get install -f
```

3. Launch the application:
```bash
hallucinate_app
# Or from the application menu
```

### System Requirements
- Ubuntu 20.04, 22.04, or 24.04 (or equivalent Debian versions)
- Python 3.8 or higher
- Node.js 18.x or 20.x (bundled with the app)
- At least 4GB RAM
- At least 2GB free disk space

### Uninstalling
```bash
sudo apt-get remove hallucinate_app
```

---

## RedHat/Rocky Linux/Fedora

### Installing from RPM Package

1. Download the latest `.rpm` package from the [releases page](https://github.com/endomorphosis/hallucinate_app/releases)

2. Install the package:
```bash
# For RHEL 8/9, Rocky Linux, or Fedora
sudo dnf install hallucinate_app-*.rpm

# For older systems using yum
sudo yum install hallucinate_app-*.rpm
```

3. Launch the application:
```bash
hallucinate_app
# Or from the application menu
```

### System Requirements
- RHEL 8/9, Rocky Linux 8/9, or Fedora 36+
- Python 3.8 or higher
- Node.js 18.x or 20.x (bundled with the app)
- At least 4GB RAM
- At least 2GB free disk space

### Uninstalling
```bash
sudo dnf remove hallucinate_app
# or
sudo yum remove hallucinate_app
```

---

## macOS

### Installing from ZIP

1. Download the latest macOS `.zip` file from the [releases page](https://github.com/endomorphosis/hallucinate_app/releases)

2. Extract the ZIP file by double-clicking it

3. Drag `hallucinate_app.app` to your Applications folder

4. First launch:
   - Right-click on the app and select "Open"
   - Click "Open" in the security dialog
   - Or go to System Preferences → Security & Privacy and click "Open Anyway"

### System Requirements
- macOS 10.15 (Catalina) or higher
- Python 3.8 or higher (pre-installed or via Homebrew)
- At least 4GB RAM
- At least 2GB free disk space

### Troubleshooting
If you see "App is damaged and can't be opened":
```bash
xattr -cr /Applications/hallucinate_app.app
```

### Uninstalling
Simply drag the app from Applications to the Trash.

---

## Windows

### Installing from Installer

1. Download the latest Windows installer (`.exe`) from the [releases page](https://github.com/endomorphosis/hallucinate_app/releases)

2. Run the installer:
   - Double-click the `.exe` file
   - Follow the installation wizard
   - Choose installation directory (default: `C:\Users\<username>\AppData\Local\hallucinate_app`)

3. Launch the application:
   - From the Start Menu
   - Or from the desktop shortcut (if created during installation)

### System Requirements
- Windows 10 or higher (64-bit)
- Python 3.8 or higher
- Node.js 18.x or 20.x (bundled with the app)
- At least 4GB RAM
- At least 2GB free disk space

### Troubleshooting
If Windows Defender SmartScreen blocks the app:
- Click "More info"
- Click "Run anyway"

### Uninstalling
- Via Settings → Apps → Apps & features
- Or via Control Panel → Programs → Uninstall a program

---

## Building from Source

### Prerequisites

#### All Platforms
- Git
- Node.js 18.x or 20.x
- Python 3.8 or higher
- npm or yarn

#### Platform-Specific

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  libx11-dev \
  libxkbfile-dev \
  libsecret-1-dev \
  libgtk-3-0 \
  libnotify-dev \
  libnss3 \
  libxss1 \
  libasound2 \
  rpm \
  fakeroot
```

**RedHat/Rocky/Fedora:**
```bash
sudo dnf install -y \
  gcc \
  gcc-c++ \
  make \
  libX11-devel \
  libxkbfile-devel \
  libsecret-devel \
  gtk3 \
  libnotify \
  nss \
  libXScrnSaver \
  alsa-lib \
  rpm-build
```

**macOS:**
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python
brew install python@3.12
```

**Windows:**
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)
- Install [Python](https://www.python.org/downloads/)
- Install [Node.js](https://nodejs.org/)

### Build Steps

1. Clone the repository:
```bash
git clone --recursive https://github.com/endomorphosis/hallucinate_app.git
cd hallucinate_app
```

2. Install dependencies:
```bash
npm install
```

3. Build the application:
```bash
# Package only (no installer)
npm run package

# Create platform-specific installers
npm run make
```

4. Find the built application:
- **Packaged app:** `out/hallucinate_app-<platform>-<arch>/`
- **Installers:** `out/make/`

### Platform-Specific Builds

**Build for Linux:**
```bash
npm run make -- --platform=linux
# Generates .deb and .rpm in out/make/
```

**Build for macOS:**
```bash
npm run make -- --platform=darwin
# Generates .zip in out/make/
```

**Build for Windows:**
```bash
npm run make -- --platform=win32
# Generates .exe installer in out/make/
```

### Cross-Platform Building

**Note:** Cross-platform building is limited:
- You can build for Linux on macOS/Linux
- You cannot build for macOS on Windows/Linux
- You cannot build for Windows on macOS/Linux without additional tools

For cross-platform building, use the CI/CD workflows or tools like:
- [electron-builder](https://www.electron.build/)
- Docker containers
- GitHub Actions (already configured in this repository)

---

## CI/CD Workflows

This repository includes automated CI/CD workflows that build and test the application on all supported platforms:

- **Electron Build Workflow:** Builds and packages for all platforms on every push
- **Platform Tests Workflow:** Runs tests on multiple OS versions

View the workflows in `.github/workflows/`:
- `electron-build.yml` - Main build and release workflow
- `platform-tests.yml` - Platform-specific hardware tests

Releases are automatically created when you push a tag:
```bash
git tag v1.0.4
git push origin v1.0.4
```

---

## Support

For issues or questions:
- [GitHub Issues](https://github.com/endomorphosis/hallucinate_app/issues)
- [Documentation](https://github.com/endomorphosis/hallucinate_app#readme)

## License

This project is licensed under the AGPL-3.0-only License.
