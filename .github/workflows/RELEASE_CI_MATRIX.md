# Release CI Workflow - Platform Matrix Summary

## Overview

This document provides a visual summary of the Electron app release CI workflow, showing all platform and architecture combinations that are built and published to GitHub Releases.

## Platform Matrix (6 Combinations)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ELECTRON APP BUILD MATRIX                         │
└─────────────────────────────────────────────────────────────────────┘

╔═══════════════════════════════════════════════════════════════════╗
║                           WINDOWS                                  ║
╠═══════════════════════════════════════════════════════════════════╣
║  ┌──────────────────────────────────────────────────────────────┐ ║
║  │ Windows x64                                                   │ ║
║  │ Runner: windows-latest                                        │ ║
║  │ Arch: x64                                                     │ ║
║  │ Output: .exe installer, .nupkg packages                       │ ║
║  └──────────────────────────────────────────────────────────────┘ ║
║  ┌──────────────────────────────────────────────────────────────┐ ║
║  │ Windows ARM64                                                 │ ║
║  │ Runner: windows-latest                                        │ ║
║  │ Arch: arm64                                                   │ ║
║  │ Output: .exe installer, .nupkg packages                       │ ║
║  └──────────────────────────────────────────────────────────────┘ ║
╚═══════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════╗
║                            macOS                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║  ┌──────────────────────────────────────────────────────────────┐ ║
║  │ macOS Intel (x64)                                             │ ║
║  │ Runner: macos-13                                              │ ║
║  │ Arch: x64                                                     │ ║
║  │ Output: .zip archive                                          │ ║
║  └──────────────────────────────────────────────────────────────┘ ║
║  ┌──────────────────────────────────────────────────────────────┐ ║
║  │ macOS Apple Silicon (arm64)                                   │ ║
║  │ Runner: macos-14                                              │ ║
║  │ Arch: arm64                                                   │ ║
║  │ Output: .zip archive                                          │ ║
║  └──────────────────────────────────────────────────────────────┘ ║
╚═══════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════╗
║                            LINUX                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║  ┌──────────────────────────────────────────────────────────────┐ ║
║  │ Linux x64                                                     │ ║
║  │ Runner: ubuntu-latest                                         │ ║
║  │ Arch: x64                                                     │ ║
║  │ Output: .deb, .rpm, .zip                                      │ ║
║  └──────────────────────────────────────────────────────────────┘ ║
║  ┌──────────────────────────────────────────────────────────────┐ ║
║  │ Linux ARM64                                                   │ ║
║  │ Runner: ubuntu-latest                                         │ ║
║  │ Arch: arm64                                                   │ ║
║  │ Output: .deb, .rpm, .zip                                      │ ║
║  └──────────────────────────────────────────────────────────────┘ ║
╚═══════════════════════════════════════════════════════════════════╝
```

## Output Artifacts

### Total Artifacts Generated: 14

#### Windows (4 artifacts)
- `hallucinate_app-{version}-win32-x64-setup.exe`
- `hallucinate_app-{version}-win32-x64.nupkg`
- `hallucinate_app-{version}-win32-arm64-setup.exe`
- `hallucinate_app-{version}-win32-arm64.nupkg`

#### macOS (2 artifacts)
- `hallucinate_app-{version}-darwin-x64.zip`
- `hallucinate_app-{version}-darwin-arm64.zip`

#### Linux (8 artifacts)
- `hallucinate_app_{version}_amd64.deb`
- `hallucinate_app-{version}.x86_64.rpm`
- `hallucinate_app-{version}-linux-x64.zip`
- `hallucinate_app_{version}_arm64.deb`
- `hallucinate_app-{version}.aarch64.rpm`
- `hallucinate_app-{version}-linux-arm64.zip`

## Workflow Flow

```
┌─────────────────┐
│  Tag Push       │
│  (e.g., v1.0.3) │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│         Trigger: release-electron.yml               │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   Build Matrix (6 jobs) │
         │   Run in Parallel       │
         └────────┬───────────────┘
                  │
     ┌────────────┼────────────┬─────────────┐
     ▼            ▼            ▼             ▼
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│Windows  │  │Windows  │  │ macOS   │  │ macOS   │
│  x64    │  │  arm64  │  │  x64    │  │  arm64  │
└────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
     │            │            │            │
     └────────────┴────────────┴────────────┘
                  │
     ┌────────────┴────────────┐
     ▼                         ▼
┌─────────┐              ┌─────────┐
│ Linux   │              │ Linux   │
│  x64    │              │  arm64  │
└────┬────┘              └────┬────┘
     │                         │
     └─────────┬───────────────┘
               ▼
    ┌──────────────────────┐
    │  Upload Artifacts     │
    │  (14 total files)     │
    └──────────┬────────────┘
               ▼
    ┌──────────────────────┐
    │  Create GitHub        │
    │  Release              │
    └──────────┬────────────┘
               ▼
    ┌──────────────────────┐
    │  Publish Release      │
    │  with all artifacts   │
    └───────────────────────┘
```

## Build Time Estimates

| Platform/Arch      | Estimated Time |
|--------------------|----------------|
| Windows x64        | 10-15 min      |
| Windows ARM64      | 10-15 min      |
| macOS x64          | 12-18 min      |
| macOS ARM64        | 12-18 min      |
| Linux x64          | 8-12 min       |
| Linux ARM64        | 8-12 min       |
| **Total (Parallel)**| **20-25 min** |

## Platform Support Details

### Why These Specific Combinations?

#### Windows
- **x64**: Covers all modern Intel/AMD Windows PCs (Windows 10+)
- **arm64**: Emerging Windows on ARM devices (Surface Pro X, etc.)

#### macOS
- **x64**: Intel Macs (pre-2020 models and current Intel Mac Pro)
- **arm64**: Apple Silicon Macs (M1/M2/M3 - 2020 onwards)

*Note: We use different runners (macos-13 vs macos-14) to ensure proper native compilation*

#### Linux
- **x64**: Standard Linux desktops/servers (Ubuntu, Fedora, Debian, etc.)
- **arm64**: ARM-based systems (Raspberry Pi 4, AWS Graviton, etc.)

### Omitted Platforms

**Not Included:**
- **ARMv7l (32-bit ARM)**: Older devices like Raspberry Pi 3
  - Reason: Limited Electron support, small user base
  - Can be added if needed

- **ia32 (32-bit x86)**: 32-bit Windows/Linux
  - Reason: Electron 32.0+ dropped 32-bit support
  - Increasingly rare hardware

## Package Format Rationale

### Windows: Squirrel.Windows
- Auto-update support
- Delta updates for smaller downloads
- Standard Windows installation experience

### macOS: ZIP Archives
- Universal format for both Intel and Apple Silicon
- Simple drag-and-drop installation
- Can be code-signed (future enhancement)

### Linux: Multiple Formats
- **DEB**: Debian/Ubuntu and derivatives (largest Linux user base)
- **RPM**: Fedora/RHEL/CentOS and derivatives
- **ZIP**: Universal format for any Linux distribution

## Future Enhancements

Potential additions to the CI workflow:

1. **Code Signing**
   - Windows: Authenticode signing
   - macOS: Apple Developer ID signing
   - Linux: GPG signing of packages

2. **Checksums**
   - Generate SHA256 checksums for all artifacts
   - Add checksums.txt to release

3. **Auto-update Infrastructure**
   - Configure Squirrel.Windows update server
   - Set up Squirrel.Mac update endpoints

4. **Additional Architectures**
   - ARMv7l for older Raspberry Pi models
   - RISC-V (experimental Electron support)

5. **Release Channels**
   - Stable releases (tags)
   - Beta releases (beta tags)
   - Nightly builds (scheduled)

6. **Build Caching**
   - Cache npm dependencies
   - Cache Python dependencies
   - Cache compiled native modules

## Troubleshooting Guide

### Common Issues

**Issue**: Missing artifacts for a platform
- **Solution**: Check the "List output directory" step in logs
- **Verify**: Electron Forge configuration in `forge.config.cjs`

**Issue**: Build timeout
- **Solution**: Increase timeout or optimize build steps
- **Check**: Network issues downloading dependencies

**Issue**: Architecture-specific build failure
- **Solution**: Verify cross-compilation support for native modules
- **Test**: Build locally with `npm run make -- --arch={arch}`

### Testing Locally

Before pushing a tag, test builds locally:

```bash
# Install dependencies
npm install

# Test x64 build
npm run make -- --arch=x64

# Test arm64 build (if on compatible host)
npm run make -- --arch=arm64

# Check output
ls -la out/make/
```

## Related Files

- **Workflow**: `.github/workflows/release-electron.yml`
- **Documentation**: `.github/workflows/RELEASE_CI_README.md`
- **Forge Config**: `forge.config.cjs`
- **Package**: `package.json`

## Version History

- **v1.0.0** (2024-11-06): Initial release CI workflow
  - 6 platform/architecture combinations
  - 14 total artifacts per release
  - Parallel builds with ~20-25 minute total time
