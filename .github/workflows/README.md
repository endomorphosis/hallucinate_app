# CI/CD Workflows for Hallucinate App

This directory contains GitHub Actions workflows for automated building, testing, and deployment of the Hallucinate App across multiple platforms.

## Workflows

### 1. electron-build.yml - Main Build and Release Workflow

**Purpose:** Builds and packages the Electron application for all supported platforms.

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Git tags starting with `v*` (for releases)
- Manual workflow dispatch

**Platforms:**
- Ubuntu (latest)
- macOS (latest)
- Windows (latest)

**Node.js Versions:**
- 18.x
- 20.x

**Outputs:**
- DEB packages (Ubuntu/Debian)
- RPM packages (RedHat/Fedora/Rocky)
- ZIP archives (macOS and Linux)
- Windows installers (.exe and .nupkg)

**Features:**
- Automated dependency installation
- Cross-platform testing
- Artifact uploads with 30-day retention
- Automatic GitHub Releases on version tags
- Build output debugging

### 2. platform-tests.yml - Platform-Specific Hardware Tests

**Purpose:** Tests the application on different OS versions to ensure compatibility.

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Manual workflow dispatch (with platform selection options)

**Test Matrices:**

**Ubuntu Testing:**
- Ubuntu 20.04
- Ubuntu 22.04
- Ubuntu 24.04

**RedHat/Rocky Linux Testing:**
- Rocky Linux 8
- Rocky Linux 9

**macOS Testing:**
- macOS 12 (Monterey)
- macOS 13 (Ventura)
- macOS 14 (Sonoma)

**Windows Testing:**
- Windows Server 2019
- Windows Server 2022

**Features:**
- Container-based testing for Linux distributions
- Platform-specific dependency installation
- Test execution with xvfb for headless Linux testing
- Build verification for each platform
- Comprehensive artifact collection
- Test summary generation
- 90-day artifact retention for all platform builds

### 3. mcp-daemon-e2e.yml - MCP Daemon Manager E2E Tests

**Purpose:** End-to-end testing of the MCP daemon manager functionality.

**Features:**
- Playwright-based E2E testing
- Screenshot capture
- Cross-platform testing
- Test result publishing
- Automatic documentation generation from screenshots

## Using the Workflows

### Running Tests Manually

1. Go to the "Actions" tab in the GitHub repository
2. Select the workflow you want to run
3. Click "Run workflow"
4. Select the branch and any optional parameters
5. Click "Run workflow" button

### Creating a Release

To create a new release with automated builds:

```bash
# Create and push a version tag
git tag v1.0.4
git push origin v1.0.4
```

The `electron-build.yml` workflow will:
1. Build packages for all platforms
2. Run tests on all platforms
3. Create a GitHub release
4. Upload all build artifacts to the release

### Viewing Build Artifacts

1. Go to the "Actions" tab
2. Click on a completed workflow run
3. Scroll down to the "Artifacts" section
4. Download the desired artifacts

**Artifact naming convention:**
- `hallucinate-app-deb-node-<version>` - Debian packages
- `hallucinate-app-rpm-node-<version>` - RPM packages
- `hallucinate-app-linux-zip-node-<version>` - Linux ZIP archives
- `hallucinate-app-macos-node-<version>` - macOS ZIP archives
- `hallucinate-app-windows-node-<version>` - Windows installers

## Platform-Specific Build Requirements

### Ubuntu/Debian
- System packages: `build-essential`, `libx11-dev`, `libgtk-3-0`, etc.
- Build tools: `fakeroot`, `dpkg`
- Output: `.deb` and `.zip` files

### RedHat/Rocky/Fedora
- System packages: `gcc`, `gcc-c++`, `gtk3`, etc.
- Build tools: `rpm-build`, `rpmdevtools`
- Output: `.rpm` and `.zip` files

### macOS
- Xcode Command Line Tools
- Python 3.12 (via Homebrew)
- Output: `.zip` archive with `.app` bundle

### Windows
- Visual Studio Build Tools
- Python 3.12
- Output: `.exe` installer and `.nupkg` update package

## Workflow Maintenance

### Updating Dependencies

To update Node.js or Python versions:

1. Edit the workflow files
2. Update the version in the `setup-node` or `setup-python` action
3. Update the strategy matrix if needed
4. Test the changes in a pull request

### Adding New Platforms

To add support for a new platform:

1. Add the platform to the appropriate workflow matrix
2. Add platform-specific dependency installation steps
3. Add platform-specific build steps
4. Add artifact upload steps for the new platform
5. Test thoroughly before merging

### Troubleshooting

**Build fails on a specific platform:**
- Check the platform-specific dependency installation steps
- Verify the build command syntax for that platform
- Review the build logs for specific error messages

**Artifacts not uploaded:**
- Check the artifact path patterns
- Ensure the build actually produced files in those locations
- Review the "List output directory" step for debugging

**Tests fail intermittently:**
- Check for race conditions
- Verify timeout settings
- Consider adding retry logic

## Security Considerations

- Secrets are never exposed in logs
- Build artifacts are automatically cleaned up after retention period
- Code signing should be added for production releases
- Consider adding artifact checksums for verification

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Electron Forge Documentation](https://www.electronforge.io/)
- [Platform Installation Guide](../docs/INSTALLATION_PLATFORMS.md)

## Support

For issues with the CI/CD workflows:
1. Check the workflow logs for error messages
2. Review this documentation
3. Open an issue on the GitHub repository
