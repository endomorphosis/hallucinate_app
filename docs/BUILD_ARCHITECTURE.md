# Build and Deployment Architecture

This document provides a visual overview of the build and deployment architecture for the Hallucinate App.

## Build Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Developer Workflow                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────┐
                    │   Code Changes           │
                    │   - Update features      │
                    │   - Fix bugs             │
                    │   - Update docs          │
                    └──────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────┐
                    │   Local Testing          │
                    │   - npm test             │
                    │   - npm run package      │
                    │   - make build           │
                    └──────────────────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────┐
                    │   Commit & Push          │
                    │   - git commit           │
                    │   - git push             │
                    └──────────────────────────┘
                                    │
                ┌───────────────────┴───────────────────┐
                │                                       │
                ▼                                       ▼
    ┌──────────────────────┐              ┌──────────────────────┐
    │  Push to Branch       │              │  Push Version Tag    │
    │  (main/develop)       │              │  (v1.0.4)            │
    └──────────────────────┘              └──────────────────────┘
                │                                       │
                ▼                                       ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│   electron-build.yml              │   │   electron-build.yml              │
│   - Build & Test                  │   │   - Build & Test                  │
│   - Create artifacts              │   │   - Create artifacts              │
│   - Upload (30 days)              │   │   - Create GitHub Release         │
└───────────────────────────────────┘   └───────────────────────────────────┘
                │                                       │
                ▼                                       ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│   platform-tests.yml              │   │   Automatic Release               │
│   - Test on all OS versions       │   │   - All platform builds           │
│   - Upload artifacts (90 days)    │   │   - Release notes                 │
└───────────────────────────────────┘   │   - Download URLs                 │
                                        └───────────────────────────────────┘
```

## CI/CD Workflow Matrix

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     GitHub Actions Workflow Matrix                       │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┬──────────────┬──────────────┬──────────────┐
│   Platform   │  Node 18.x   │  Node 20.x   │   Outputs    │
├──────────────┼──────────────┼──────────────┼──────────────┤
│              │              │              │  - .deb      │
│ Ubuntu       │      ✓       │      ✓       │  - .rpm      │
│ Latest       │              │              │  - .zip      │
│              │              │              │              │
├──────────────┼──────────────┼──────────────┼──────────────┤
│              │              │              │              │
│ macOS        │      ✓       │      ✓       │  - .zip      │
│ Latest       │              │              │    (.app)    │
│              │              │              │              │
├──────────────┼──────────────┼──────────────┼──────────────┤
│              │              │              │  - .exe      │
│ Windows      │      ✓       │      ✓       │  - .nupkg    │
│ Latest       │              │              │              │
│              │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘

Platform-Specific Tests:
┌──────────────┬────────────────────────────────────────────┐
│  Platform    │           Tested Versions                  │
├──────────────┼────────────────────────────────────────────┤
│ Ubuntu       │  20.04, 22.04, 24.04                       │
│ Rocky Linux  │  8, 9                                      │
│ macOS        │  12 (Monterey), 13 (Ventura), 14 (Sonoma) │
│ Windows      │  Server 2019, Server 2022                  │
└──────────────┴────────────────────────────────────────────┘
```

## Build Process Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Build Process                                   │
└─────────────────────────────────────────────────────────────────────────┘

1. Checkout Code
   └─> git clone --recursive
   
2. Setup Environment
   ├─> Install Node.js (18.x or 20.x)
   ├─> Install Python 3.12
   └─> Install platform-specific dependencies
       ├─> Ubuntu: libx11-dev, libgtk-3-0, etc.
       ├─> macOS: Xcode Command Line Tools
       ├─> Windows: Visual Studio Build Tools
       └─> RedHat: gcc, gtk3, rpm-build, etc.

3. Install Dependencies
   ├─> npm ci (or npm install)
   ├─> pip install -r requirements.txt
   └─> bash scripts/install_submodule_deps.sh

4. Run Tests
   └─> npm test

5. Package Application
   └─> npm run package
       ├─> Creates packaged app in out/
       ├─> Bundles all resources
       └─> Creates platform-specific structure

6. Create Installers
   └─> npm run make
       ├─> Linux: Creates .deb and .rpm
       ├─> macOS: Creates .zip with .app bundle
       └─> Windows: Creates .exe installer and .nupkg

7. Upload Artifacts
   ├─> Regular builds: 30-day retention
   └─> Platform tests: 90-day retention
```

## Package Structure

```
hallucinate_app Package Structure
│
├── Linux (DEB/RPM)
│   ├── /usr/bin/hallucinate_app (executable)
│   ├── /usr/lib/hallucinate_app/ (application files)
│   ├── /usr/share/applications/ (desktop entry)
│   └── /usr/share/icons/ (application icon)
│
├── macOS (ZIP → .app bundle)
│   └── hallucinate_app.app/
│       ├── Contents/
│       │   ├── MacOS/hallucinate_app (executable)
│       │   ├── Resources/ (app resources)
│       │   └── Info.plist (app metadata)
│       └── Icon files
│
└── Windows (EXE installer)
    ├── Program Files/hallucinate_app/
    │   ├── hallucinate_app.exe
    │   ├── resources/ (app files)
    │   └── Update.exe (auto-update)
    └── Start Menu shortcuts
```

## Deployment Targets

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Supported Platforms                               │
└─────────────────────────────────────────────────────────────────────────┘

Operating Systems:
├── Linux
│   ├── Ubuntu/Debian
│   │   ├── 20.04 LTS (Focal)      ✓
│   │   ├── 22.04 LTS (Jammy)      ✓
│   │   └── 24.04 LTS (Noble)      ✓
│   │
│   └── RedHat/Rocky/Fedora
│       ├── RHEL/Rocky 8           ✓
│       └── RHEL/Rocky 9           ✓
│
├── macOS
│   ├── 12 (Monterey)              ✓
│   ├── 13 (Ventura)               ✓
│   └── 14 (Sonoma)                ✓
│
└── Windows
    ├── 10 (64-bit)                ✓
    ├── 11 (64-bit)                ✓
    └── Server 2019/2022           ✓

Architecture Support:
├── x64 (Intel/AMD 64-bit)         ✓ (All platforms)
├── arm64 (Apple Silicon)          ✓ (macOS only)
└── ia32 (32-bit)                  ✗ (Not supported)
```

## Release Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Release Process                                 │
└─────────────────────────────────────────────────────────────────────────┘

Developer creates tag:
   git tag v1.0.4
   git push origin v1.0.4
            │
            ▼
┌──────────────────────┐
│  GitHub Actions      │
│  electron-build.yml  │
└──────────────────────┘
            │
            ├─> Build Ubuntu (Node 18.x, 20.x)
            ├─> Build macOS (Node 18.x, 20.x)
            └─> Build Windows (Node 18.x, 20.x)
            │
            ▼
┌──────────────────────┐
│  Collect Artifacts   │
│  - DEB packages      │
│  - RPM packages      │
│  - macOS ZIP         │
│  - Windows EXE       │
└──────────────────────┘
            │
            ▼
┌──────────────────────┐
│  Create Release      │
│  - Release notes     │
│  - Attach artifacts  │
│  - Mark as latest    │
└──────────────────────┘
            │
            ▼
┌──────────────────────┐
│  Users Download      │
│  - Platform-specific │
│  - Install & Run     │
└──────────────────────┘
```

## File Locations

```
Repository Structure:
├── .github/workflows/
│   ├── electron-build.yml        (Main build workflow)
│   ├── platform-tests.yml        (Platform testing)
│   └── README.md                 (Workflow docs)
│
├── docs/
│   ├── INSTALLATION_PLATFORMS.md (Install guide)
│   ├── BUILD_TESTING.md          (Testing guide)
│   ├── DEPLOYMENT_SUMMARY.md     (Implementation)
│   └── QUICK_START_BUILD.md      (Quick start)
│
├── scripts/
│   ├── build.sh                  (Linux/macOS build)
│   └── build.bat                 (Windows build)
│
├── forge.config.cjs               (Electron Forge config)
├── Makefile                       (Build targets)
└── package.json                   (Dependencies & scripts)

Build Outputs:
└── out/
    ├── hallucinate_app-<platform>-<arch>/  (Packaged app)
    └── make/
        ├── deb/x64/*.deb              (Ubuntu/Debian)
        ├── rpm/x64/*.rpm              (RedHat/Rocky)
        ├── zip/darwin/x64/*.zip       (macOS)
        └── squirrel.windows/x64/*.exe (Windows)
```

## Build Time Estimates

```
Approximate Build Times (CI/CD):

Local Development Build:
├── Install dependencies:  2-5 minutes
├── Package app:           2-3 minutes
└── Create installer:      3-7 minutes
    Total:                 7-15 minutes

CI/CD Full Build (all platforms):
├── Setup (3 platforms):   2-3 minutes
├── Install deps:          3-5 minutes (parallel)
├── Build & package:       5-7 minutes (parallel)
├── Create installers:     5-10 minutes (parallel)
└── Upload artifacts:      2-3 minutes
    Total:                 15-30 minutes

Platform-Specific Tests:
├── 7 OS versions
├── Per OS: 5-10 minutes
└── Total (parallel):      10-15 minutes
```

## Success Metrics

```
Build Success Indicators:

✓ All platform builds complete without errors
✓ All tests pass on all platforms
✓ Artifacts uploaded successfully
✓ Package sizes within expected range (200-500 MB)
✓ GitHub release created (for tags)
✓ All platform installers present in release
✓ Installation works on target platforms
✓ Application launches without errors
✓ Core functionality verified
```

---

This architecture enables:
- **Automated builds** for all platforms
- **Consistent packaging** across operating systems
- **Quality assurance** through multi-version testing
- **Easy distribution** via GitHub Releases
- **Professional deployment** with proper installers
