# Electron Release CI Workflow

This document describes the GitHub Actions CI workflow for building and publishing Electron apps to GitHub Releases.

## Overview

The `release-electron.yml` workflow automatically builds the Hallucinate App for all major operating systems and architectures, then publishes them to GitHub Releases.

## Supported Platforms and Architectures

The workflow builds for the following real platform combinations:

### Windows
- **x64** (64-bit Intel/AMD)
- **arm64** (ARM64, e.g., Windows on ARM devices)

### macOS
- **x64** (Intel Macs)
- **arm64** (Apple Silicon M1/M2/M3 Macs)

### Linux
- **x64** (64-bit Intel/AMD)
- **arm64** (ARM64, e.g., Raspberry Pi 4, AWS Graviton)

## Package Formats

Each platform produces the following package formats:

- **Windows**: `.exe` installers and `.nupkg` packages (Squirrel)
- **macOS**: `.zip` archives
- **Linux**: `.deb` packages, `.rpm` packages, and `.zip` archives

## Triggering a Release

### Automatic Trigger (Recommended)
The workflow automatically triggers when you push a version tag:

```bash
git tag v1.0.3
git push origin v1.0.3
```

### Manual Trigger
You can also trigger the workflow manually from the GitHub Actions UI:
1. Go to the "Actions" tab in GitHub
2. Select "Release Electron Apps to GitHub"
3. Click "Run workflow"
4. Enter the version tag (e.g., `v1.0.3`)
5. Click "Run workflow"

## Workflow Steps

1. **Build**: Builds the application for each platform/architecture combination in parallel
2. **Package**: Creates platform-specific packages (DEB, RPM, ZIP, EXE, etc.)
3. **Upload Artifacts**: Uploads build artifacts to GitHub Actions
4. **Create Release**: Creates a GitHub Release with all artifacts attached

## Release Assets

After a successful release, the following assets will be available:

### Windows
- `hallucinate_app-{version}-win32-x64-setup.exe` - Windows x64 installer
- `hallucinate_app-{version}-win32-arm64-setup.exe` - Windows ARM64 installer
- Additional `.nupkg` files for updates

### macOS
- `hallucinate_app-{version}-darwin-x64.zip` - macOS Intel
- `hallucinate_app-{version}-darwin-arm64.zip` - macOS Apple Silicon

### Linux
- `hallucinate_app_{version}_amd64.deb` - Debian/Ubuntu x64
- `hallucinate_app-{version}.x86_64.rpm` - RedHat/Fedora x64
- `hallucinate_app-{version}-linux-x64.zip` - Linux x64 portable
- `hallucinate_app_{version}_arm64.deb` - Debian/Ubuntu ARM64
- `hallucinate_app-{version}.aarch64.rpm` - RedHat/Fedora ARM64
- `hallucinate_app-{version}-linux-arm64.zip` - Linux ARM64 portable

## Configuration

The workflow uses the `forge.config.cjs` file for Electron Forge configuration. Key settings:

- **Packager Config**: Defines app metadata, icons, and resources to include
- **Makers**: Configures platform-specific package builders (Squirrel, ZIP, DEB, RPM)
- **Plugins**: Enables auto-unpacking of native modules and security fuses

## Requirements

### Repository Secrets
No additional secrets are required. The workflow uses the built-in `GITHUB_TOKEN`.

### Permissions
The workflow requires `contents: write` permission to create releases.

## Build Matrix Strategy

The workflow uses a matrix strategy to build in parallel for all platforms:

```yaml
matrix:
  include:
    - os: windows, arch: x64, runner: windows-latest
    - os: windows, arch: arm64, runner: windows-latest
    - os: macos, arch: x64, runner: macos-13 (Intel)
    - os: macos, arch: arm64, runner: macos-14 (Apple Silicon)
    - os: linux, arch: x64, runner: ubuntu-latest
    - os: linux, arch: arm64, runner: ubuntu-latest
```

### Why These Runners?

- **macos-13**: Used for x64 builds (Intel Macs)
- **macos-14**: Used for arm64 builds (Apple Silicon)
- **ubuntu-latest**: Can cross-compile for both x64 and ARM64 Linux
- **windows-latest**: Can build for both x64 and ARM64 Windows

## Build Times

Approximate build times per platform:
- Windows: 10-15 minutes
- macOS: 12-18 minutes
- Linux: 8-12 minutes

Total workflow time: ~20-25 minutes (runs in parallel)

## Troubleshooting

### Build Failures

If a build fails for a specific platform:

1. Check the workflow logs for that platform
2. Look for platform-specific dependency issues
3. Verify the Electron Forge configuration for that platform
4. Test locally: `npm run make -- --platform={platform} --arch={arch}`

### Missing Artifacts

If artifacts are missing from the release:

1. Check that the build completed successfully
2. Verify the artifact paths in the workflow match the Electron Forge output
3. Check the "List output directory" step in the workflow logs

### Cross-compilation Issues

Linux ARM64 builds use cross-compilation. If you encounter issues:

1. Verify that native dependencies support ARM64
2. Check that the appropriate system libraries are installed
3. Consider adding specific ARM64 build steps if needed

## Local Testing

To test builds locally before pushing a tag:

```bash
# Test packaging for a specific platform/arch
npm run package -- --arch=x64
npm run make -- --platform=darwin --arch=x64

# Test all makers for current platform
npm run make
```

## Continuous Improvement

Future enhancements could include:

1. **Code Signing**: Add code signing for Windows and macOS builds
2. **Auto-update**: Configure Squirrel.Windows and Squirrel.Mac for auto-updates
3. **Checksums**: Generate SHA256 checksums for all artifacts
4. **Build Notifications**: Send Slack/Discord notifications on release
5. **Beta Channel**: Add prerelease workflow for beta versions
6. **ARM32**: Add ARMv7l support if needed (e.g., Raspberry Pi 3)

## Related Documentation

- [Electron Forge Documentation](https://www.electronforge.io/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Electron Distribution Guide](https://www.electronjs.org/docs/latest/tutorial/distribution-overview)

## Support

For issues with the CI workflow, please open an issue on the GitHub repository with:
- The workflow run URL
- The platform/architecture that failed
- Relevant error messages from the logs
