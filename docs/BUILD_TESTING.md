# Testing the Cross-Platform Build System

This guide helps you test the cross-platform build system for the Hallucinate App.

## Local Testing

### Prerequisites

Ensure you have the following installed:
- Node.js 18.x or 20.x
- npm or yarn
- Python 3.8+
- Platform-specific build tools (see below)

### Platform-Specific Build Tools

#### Ubuntu/Debian
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
  fakeroot \
  dpkg
```

#### RedHat/Rocky/Fedora
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
  rpm-build \
  rpmdevtools
```

#### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python
brew install python@3.12
```

#### Windows
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)
- Install [Python](https://www.python.org/downloads/)
- Install [Node.js](https://nodejs.org/)

### Step 1: Install Dependencies

```bash
# Install JavaScript dependencies
npm install

# Install Python dependencies (if needed)
pip install -r python/hallucinate_app/python/requirements.txt

# Install submodule dependencies (optional)
bash scripts/install_submodule_deps.sh
```

### Step 2: Test Packaging

Test that the app can be packaged without errors:

```bash
# Package for current platform
npm run package
```

This should create a packaged app in `out/hallucinate_app-<platform>-<arch>/`

### Step 3: Test Making Installers

Create platform-specific installers:

#### On Linux
```bash
# Test DEB package creation
npm run make -- --platform=linux

# Verify output
ls -lh out/make/deb/
ls -lh out/make/rpm/
```

Expected output:
- `out/make/deb/x64/hallucinate_app_*.deb`
- `out/make/rpm/x64/hallucinate_app-*.rpm`

#### On macOS
```bash
# Test macOS package creation
npm run make -- --platform=darwin

# Verify output
ls -lh out/make/zip/darwin/
```

Expected output:
- `out/make/zip/darwin/x64/hallucinate_app-darwin-x64-*.zip`

#### On Windows
```cmd
# Test Windows installer creation
npm run make -- --platform=win32

# Verify output
dir out\make\squirrel.windows\
```

Expected output:
- `out/make/squirrel.windows/x64/hallucinate_app-*-full.nupkg`
- `out/make/squirrel.windows/x64/hallucinate_app Setup *.exe`

### Step 4: Test Build Scripts

Test the helper build scripts:

#### Linux/macOS
```bash
bash scripts/build.sh
```

#### Windows
```cmd
scripts\build.bat
```

Both scripts should:
1. Check prerequisites
2. Install dependencies
3. Build the application
4. Create installers
5. List the output artifacts

### Step 5: Test Makefile Targets

```bash
# Test help
make help

# Test package target
make package

# Test platform-specific targets (based on your platform)
make make-deb    # Linux only
make make-rpm    # Linux only
make make-dmg    # macOS only
make make-exe    # Windows only

# Test clean
make clean-build
```

## CI/CD Testing

### Testing Workflows Locally

You can test GitHub Actions workflows locally using [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash  # Linux

# Test electron-build workflow
act push -W .github/workflows/electron-build.yml

# Test platform-tests workflow
act push -W .github/workflows/platform-tests.yml
```

### Testing on GitHub

#### Test Push Workflow

1. Create a test branch:
```bash
git checkout -b test/build-workflow
```

2. Make a small change and push:
```bash
echo "# Test" >> test.md
git add test.md
git commit -m "Test build workflow"
git push origin test/build-workflow
```

3. Go to the GitHub Actions tab and watch the workflows run

4. Check the artifacts:
   - Click on the completed workflow
   - Scroll to the "Artifacts" section
   - Verify all expected artifacts are present

#### Test Release Workflow

1. Create and push a test tag:
```bash
git tag v1.0.4-test
git push origin v1.0.4-test
```

2. Check the Releases page:
   - Go to https://github.com/endomorphosis/hallucinate_app/releases
   - Verify the release was created
   - Check that all platform builds are attached

3. Clean up:
```bash
# Delete the test tag locally
git tag -d v1.0.4-test

# Delete the remote tag
git push origin :refs/tags/v1.0.4-test

# Delete the release on GitHub (via web interface)
```

## Verification Checklist

After building, verify the following:

### DEB Package (Ubuntu/Debian)
- [ ] Package can be installed: `sudo dpkg -i hallucinate_app_*.deb`
- [ ] Application launches: `hallucinate_app`
- [ ] Icon appears in application menu
- [ ] Application can be uninstalled: `sudo apt-get remove hallucinate_app`

### RPM Package (RedHat/Rocky/Fedora)
- [ ] Package can be installed: `sudo rpm -i hallucinate_app-*.rpm`
- [ ] Application launches: `hallucinate_app`
- [ ] Icon appears in application menu
- [ ] Application can be uninstalled: `sudo rpm -e hallucinate_app`

### macOS ZIP
- [ ] ZIP extracts without errors
- [ ] .app bundle is present
- [ ] Application can be opened (may need to right-click → Open first time)
- [ ] Application runs without crashes
- [ ] Application can be dragged to Applications folder

### Windows Installer
- [ ] Installer runs without errors
- [ ] Application installs to correct location
- [ ] Start menu shortcut created
- [ ] Application launches
- [ ] Application can be uninstalled via Settings → Apps

## Common Issues and Solutions

### Issue: Dependencies not installing

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Issue: Build fails with native module errors

**Solution:**
Ensure you have the correct build tools installed for your platform (see Platform-Specific Build Tools above).

### Issue: Package is too large

**Solution:**
Check the `ignore` patterns in `forge.config.cjs` to ensure unnecessary files are excluded:
- `node_modules/.cache`
- `test-results`
- `.venv`
- `__pycache__`

### Issue: Application won't launch after installation

**Solution:**
1. Check the console/logs for errors
2. Ensure all Python dependencies are bundled in `extraResource`
3. Verify the `main` field in `package.json` points to the correct file

### Issue: CI/CD workflow fails

**Solution:**
1. Check the workflow logs in GitHub Actions
2. Verify all required secrets are set (if any)
3. Ensure the workflow YAML syntax is correct
4. Check that platform-specific dependencies are installed correctly

## Performance Testing

### Build Time Benchmarks

Expected build times (approximate):

- **Package only**: 2-5 minutes
- **DEB/RPM creation**: 3-7 minutes
- **macOS ZIP**: 3-6 minutes
- **Windows installer**: 5-10 minutes

### Size Benchmarks

Expected package sizes (approximate):

- **DEB package**: 200-500 MB
- **RPM package**: 200-500 MB
- **macOS ZIP**: 200-500 MB
- **Windows installer**: 150-400 MB

## Reporting Issues

If you encounter issues with the build system:

1. Collect the following information:
   - Your OS and version
   - Node.js version (`node --version`)
   - npm version (`npm --version`)
   - Python version (`python --version`)
   - Full error message and stack trace
   - Build command used

2. Check existing issues: https://github.com/endomorphosis/hallucinate_app/issues

3. Create a new issue with:
   - Clear title describing the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Collected information from step 1

## Additional Resources

- [Electron Forge Documentation](https://www.electronforge.io/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Platform Installation Guide](INSTALLATION_PLATFORMS.md)
- [CI/CD Workflows README](../.github/workflows/README.md)
