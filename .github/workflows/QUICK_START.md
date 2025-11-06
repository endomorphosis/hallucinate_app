# Quick Start: Releasing Electron Apps

This guide shows how to use the automated release workflow to publish the Hallucinate App to GitHub Releases.

## Quick Release

To publish a new release, simply create and push a version tag:

```bash
# Ensure your changes are committed
git add .
git commit -m "Prepare release v1.0.4"

# Create a version tag
git tag v1.0.4

# Push the tag to trigger the release workflow
git push origin v1.0.4
```

The CI workflow will automatically:
1. Build the app for all 8 platform/architecture combinations
2. Create 18 distributable packages
3. Publish a GitHub Release with all packages attached
4. Generate release notes with download instructions

## What Gets Built

### 8 Platform Combinations
- Windows x64 & ARM64
- macOS Intel (x64) & Apple Silicon (ARM64)  
- Linux x64 & ARM64
- RedHat/RHEL x64 & ARM64

### 18 Package Files
- **Windows**: 2 installers (.exe) + 2 update packages (.nupkg)
- **macOS**: 2 archives (.zip)
- **Linux**: 6 packages (DEB, RPM, ZIP for both x64 and ARM64)
- **RHEL**: 2 packages (RPM for both x64 and ARM64)

### Mobile Platforms
For iOS and Android, see [Mobile Platform Guide](MOBILE_PLATFORM_GUIDE.md).

## Manual Release (Alternative)

You can also trigger a release manually from GitHub:

1. Go to **Actions** tab
2. Select **"Release Electron Apps to GitHub"**
3. Click **"Run workflow"**
4. Enter version (e.g., `v1.0.4`)
5. Click **"Run workflow"**

## Testing the Workflow

Before pushing a tag, validate the workflow configuration:

```bash
npm run test:release-ci
```

This runs 34 tests to verify the workflow is correctly configured.

## Build Times

- Total time: ~20-25 minutes
- All platforms build in parallel
- Results published automatically

## Release Notes

The workflow automatically generates release notes including:
- Download links for all platforms
- Installation instructions
- Recent changes from git history

## Troubleshooting

### Build Failed
Check the Actions tab for detailed logs of which platform failed.

### Missing Artifacts
Ensure Electron Forge is properly configured in `forge.config.cjs`.

### Local Testing
Test builds locally before pushing:

```bash
# Install dependencies
npm install

# Test a specific platform/arch
npm run make -- --platform=linux --arch=x64

# Check the output
ls -la out/make/
```

## More Information

- **Full Documentation**: `.github/workflows/RELEASE_CI_README.md`
- **Platform Matrix**: `.github/workflows/RELEASE_CI_MATRIX.md`
- **Workflow File**: `.github/workflows/release-electron.yml`

## Version Numbering

Follow semantic versioning:
- `v1.0.0` - Major release
- `v1.1.0` - Minor release (new features)
- `v1.0.1` - Patch release (bug fixes)

Always prefix with `v` (e.g., `v1.0.3` not `1.0.3`).
