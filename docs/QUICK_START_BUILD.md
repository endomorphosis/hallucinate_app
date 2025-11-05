# Quick Start: Building and Deploying Hallucinate App

This quick start guide gets you building and deploying the Hallucinate App across platforms in minutes.

## 🚀 Quick Build (5 minutes)

### 1. Clone and Install
```bash
git clone --recursive https://github.com/endomorphosis/hallucinate_app.git
cd hallucinate_app
npm install
```

### 2. Build for Your Platform
```bash
# All platforms
make build

# Or use npm directly
npm run package
```

### 3. Create Installer
```bash
# Linux (DEB + RPM)
npm run make -- --platform=linux

# macOS (ZIP)
npm run make -- --platform=darwin

# Windows (EXE)
npm run make -- --platform=win32
```

### 4. Find Your Build
```bash
# Check the output directory
ls -la out/make/
```

## 📦 Platform-Specific Quick Starts

### Ubuntu/Debian
```bash
# Install build dependencies
sudo apt-get update
sudo apt-get install -y build-essential libx11-dev libgtk-3-0 rpm fakeroot

# Build
npm install
npm run make -- --platform=linux

# Install and test
sudo dpkg -i out/make/deb/x64/*.deb
hallucinate_app
```

### RedHat/Rocky Linux
```bash
# Install build dependencies
sudo dnf install -y gcc gcc-c++ gtk3 rpm-build

# Build
npm install
npm run make -- --platform=linux

# Install and test
sudo rpm -i out/make/rpm/x64/*.rpm
hallucinate_app
```

### macOS
```bash
# Install Xcode tools (if not already installed)
xcode-select --install

# Build
npm install
npm run make -- --platform=darwin

# Test
open out/make/zip/darwin/x64/*.zip
# Drag the extracted .app to Applications
```

### Windows
```cmd
# Ensure Visual Studio Build Tools are installed

# Build
npm install
npm run make -- --platform=win32

# Test
out\make\squirrel.windows\x64\hallucinate_app Setup *.exe
```

## 🔄 Creating a Release (2 minutes)

### Automatic Release via CI/CD

1. **Create and push a version tag:**
```bash
git tag v1.0.4
git push origin v1.0.4
```

2. **Wait for CI/CD** (15-30 minutes)
   - Workflows build for all platforms automatically
   - GitHub release is created with all artifacts

3. **Download from Releases page:**
   - Go to https://github.com/endomorphosis/hallucinate_app/releases
   - Download platform-specific installers

## 🛠️ Development Workflow

### Daily Development
```bash
# Make changes to code
# ...

# Test locally
npm test

# Package to verify
npm run package
```

### Before Committing
```bash
# Run all tests
npm test

# Build to ensure no errors
make build

# Check CI/CD workflows will pass
# (optional) Use act to test locally:
act push -W .github/workflows/electron-build.yml
```

### Releasing New Version

1. **Update version in package.json:**
```bash
# Manually edit, or use npm version
npm version patch  # 1.0.3 -> 1.0.4
npm version minor  # 1.0.4 -> 1.1.0
npm version major  # 1.1.0 -> 2.0.0
```

2. **Commit and tag:**
```bash
git add package.json
git commit -m "Bump version to 1.0.4"
git tag v1.0.4
```

3. **Push with tags:**
```bash
git push origin main --tags
```

4. **CI/CD creates release automatically**

## 📊 Verifying Your Build

### Size Check
```bash
# DEB/RPM should be 200-500 MB
du -h out/make/deb/x64/*.deb
du -h out/make/rpm/x64/*.rpm

# macOS ZIP should be 200-500 MB
du -h out/make/zip/darwin/x64/*.zip

# Windows installer should be 150-400 MB
du -h out/make/squirrel.windows/x64/*.exe
```

### Content Check
```bash
# List what's in the package
dpkg -c out/make/deb/x64/*.deb | head -20  # DEB
rpm -qlp out/make/rpm/x64/*.rpm | head -20  # RPM
unzip -l out/make/zip/darwin/x64/*.zip | head -20  # macOS
```

## 🧪 Testing Your Build

### Quick Smoke Test

1. **Install the package**
2. **Launch the app**
3. **Verify:**
   - ✅ App launches without errors
   - ✅ Icon appears correctly
   - ✅ Main window displays
   - ✅ Menus are accessible
   - ✅ Basic functionality works

### Full Testing
See [BUILD_TESTING.md](BUILD_TESTING.md) for comprehensive testing procedures.

## 🐛 Common Issues

### "Module not found" errors
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### Build fails with native module errors
```bash
# Rebuild native modules
npm rebuild

# Or reinstall with rebuild
npm install --build-from-source
```

### Package too large
Check `.gitignore` and forge.config.cjs `ignore` patterns to exclude:
- `node_modules/.cache`
- `test-results`
- `.venv`
- `__pycache__`

### CI/CD workflow fails
1. Check the workflow logs in GitHub Actions
2. Verify YAML syntax: `python -c "import yaml; yaml.safe_load(open('.github/workflows/electron-build.yml'))"`
3. Test locally with `act` if possible

## 📚 Next Steps

- **For installation instructions:** See [INSTALLATION_PLATFORMS.md](INSTALLATION_PLATFORMS.md)
- **For testing procedures:** See [BUILD_TESTING.md](BUILD_TESTING.md)
- **For implementation details:** See [DEPLOYMENT_SUMMARY.md](DEPLOYMENT_SUMMARY.md)
- **For CI/CD details:** See [.github/workflows/README.md](../.github/workflows/README.md)
- **For contributing:** See [CONTRIBUTING.md](../CONTRIBUTING.md)

## 💡 Pro Tips

### Speed up builds
```bash
# Use npm ci instead of npm install (faster, uses package-lock.json)
npm ci

# Skip tests during development builds
npm run package --skip-tests

# Use parallel builds (if multiple platforms)
make make-deb & make make-rpm & wait
```

### Clean builds
```bash
# Clean everything before building
make clean-build
npm ci
npm run make
```

### Debug build issues
```bash
# Run with verbose output
npm run package -- --verbose

# Check what's being packaged
cat out/.forge-meta/out-config.json
```

## 🎯 Goals

After following this guide, you should be able to:
- ✅ Build the app for your platform
- ✅ Create installers for distribution
- ✅ Test your builds locally
- ✅ Create releases via CI/CD
- ✅ Troubleshoot common issues

## 🆘 Getting Help

1. Check the documentation (links above)
2. Search existing issues: https://github.com/endomorphosis/hallucinate_app/issues
3. Create a new issue with:
   - Platform and version
   - Steps to reproduce
   - Error messages
   - What you've tried

---

**Happy Building! 🎉**
