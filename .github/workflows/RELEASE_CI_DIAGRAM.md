# Release CI Workflow - Visual Diagram

## Workflow Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RELEASE TRIGGER                                  │
│                                                                          │
│  Option 1: Push Version Tag        Option 2: Manual Trigger             │
│  ┌──────────────────────┐          ┌──────────────────────┐            │
│  │ git tag v1.0.3       │          │ GitHub Actions UI    │            │
│  │ git push origin tag  │          │ Enter version: v1.0.3│            │
│  └──────────────────────┘          └──────────────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    PARALLEL BUILD MATRIX                                 │
│                    (6 Jobs Running Simultaneously)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Windows x64    │    │  Windows ARM64  │    │   macOS x64     │
│                 │    │                 │    │  (Intel)        │
│ Runner:         │    │ Runner:         │    │                 │
│ windows-latest  │    │ windows-latest  │    │ Runner:         │
│                 │    │                 │    │ macos-13        │
│ Output:         │    │ Output:         │    │                 │
│ • setup.exe     │    │ • setup.exe     │    │ Output:         │
│ • app.nupkg     │    │ • app.nupkg     │    │ • app.zip       │
│                 │    │                 │    │                 │
│ Time: ~12 min   │    │ Time: ~12 min   │    │ Time: ~15 min   │
└─────────────────┘    └─────────────────┘    └─────────────────┘

         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  macOS ARM64    │    │   Linux x64     │    │  Linux ARM64    │
│ (Apple Silicon) │    │                 │    │                 │
│                 │    │ Runner:         │    │ Runner:         │
│ Runner:         │    │ ubuntu-latest   │    │ ubuntu-latest   │
│ macos-14        │    │                 │    │                 │
│                 │    │ Output:         │    │ Output:         │
│ Output:         │    │ • app.deb       │    │ • app.deb       │
│ • app.zip       │    │ • app.rpm       │    │ • app.rpm       │
│                 │    │ • app.zip       │    │ • app.zip       │
│ Time: ~15 min   │    │ Time: ~10 min   │    │ Time: ~10 min   │
└─────────────────┘    └─────────────────┘    └─────────────────┘

         │                        │                        │
         └────────────────────────┴────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         ARTIFACT COLLECTION                              │
│                                                                          │
│  Uploaded to GitHub Actions Artifacts (7-day retention):                │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ • windows-x64     (setup.exe, .nupkg)                          │   │
│  │ • windows-arm64   (setup.exe, .nupkg)                          │   │
│  │ • macos-x64       (app.zip)                                    │   │
│  │ • macos-arm64     (app.zip)                                    │   │
│  │ • linux-x64-deb   (app.deb)                                    │   │
│  │ • linux-x64-rpm   (app.rpm)                                    │   │
│  │ • linux-x64-zip   (app.zip)                                    │   │
│  │ • linux-arm64-deb (app.deb)                                    │   │
│  │ • linux-arm64-rpm (app.rpm)                                    │   │
│  │ • linux-arm64-zip (app.zip)                                    │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Total: 14 files across 10 artifact bundles                             │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      CREATE GITHUB RELEASE                               │
│                                                                          │
│  Job: create-release                                                     │
│  Depends on: build-release (all 6 jobs must complete)                   │
│                                                                          │
│  Steps:                                                                  │
│  1. Download all 10 artifact bundles                                     │
│  2. Generate release notes with:                                         │
│     • Version information                                                │
│     • Download links for each platform/architecture                      │
│     • Installation instructions                                          │
│     • Recent commit history                                              │
│  3. Create GitHub Release                                                │
│  4. Attach all 14 files to the release                                   │
│                                                                          │
│  Time: ~2 min                                                            │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PUBLISHED RELEASE                                │
│                                                                          │
│  GitHub Release: v1.0.3                                                  │
│  Status: Published                                                       │
│                                                                          │
│  Assets (14 files):                                                      │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Windows (4 files):                                             │   │
│  │   • hallucinate_app-1.0.3-win32-x64-setup.exe                  │   │
│  │   • hallucinate_app-1.0.3-win32-x64.nupkg                      │   │
│  │   • hallucinate_app-1.0.3-win32-arm64-setup.exe                │   │
│  │   • hallucinate_app-1.0.3-win32-arm64.nupkg                    │   │
│  │                                                                 │   │
│  │ macOS (2 files):                                               │   │
│  │   • hallucinate_app-1.0.3-darwin-x64.zip                       │   │
│  │   • hallucinate_app-1.0.3-darwin-arm64.zip                     │   │
│  │                                                                 │   │
│  │ Linux (8 files):                                               │   │
│  │   • hallucinate_app_1.0.3_amd64.deb                            │   │
│  │   • hallucinate_app-1.0.3.x86_64.rpm                           │   │
│  │   • hallucinate_app-1.0.3-linux-x64.zip                        │   │
│  │   • hallucinate_app_1.0.3_arm64.deb                            │   │
│  │   • hallucinate_app-1.0.3.aarch64.rpm                          │   │
│  │   • hallucinate_app-1.0.3-linux-arm64.zip                      │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Release Notes:                                                          │
│  • Version details                                                       │
│  • Platform-specific download links                                      │
│  • Installation instructions for each platform                           │
│  • Recent changes from git history                                       │
│                                                                          │
│  Public URL: https://github.com/endomorphosis/hallucinate_app/releases  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Timing Breakdown

```
┌─────────────────────────────────────────────────────────────────┐
│                      Build Timeline                              │
│                     (All jobs run in parallel)                   │
└─────────────────────────────────────────────────────────────────┘

0:00  ────────────────────────────────────────────────────────────
      │ Trigger
      │
0:01  │ Setup (checkout, install dependencies)
      │
0:05  │ Build Package
      │
0:10  ├─ Windows x64 ──────────────────────────┐
      │                                          │ Done @ ~12 min
      ├─ Windows ARM64 ────────────────────────┐│
      │                                          ││ Done @ ~12 min
      ├─ Linux x64 ────────────────┐            ││
      │                             │ Done @ ~10 ││
      ├─ Linux ARM64 ──────────────┼───────┐    ││
      │                             │       │ ~10││
      ├─ macOS x64 ────────────────┼───────┼────┼┘│
      │                                     │ ~15 │
      ├─ macOS ARM64 ─────────────────────┼────┼─┘
      │                                     │ ~15│
0:15  │                                     │    │
      │                                     │    │
      │                                  Done    │
0:20  │                                       Done
      │
      └─ All builds complete ─────────────────────
      │
0:22  │ Create Release Job
      │ • Download artifacts
      │ • Generate release notes
      │ • Create release
      │ • Publish
      │
0:25  └─ Release Published ───────────────────────

Total Time: ~25 minutes
```

## Job Dependencies

```
                    ┌─────────────────────┐
                    │  build-release      │
                    │  (Matrix: 6 jobs)   │
                    └──────────┬──────────┘
                               │
                               │ needs: build-release
                               │ (waits for ALL to complete)
                               │
                               ▼
                    ┌─────────────────────┐
                    │  create-release     │
                    │  (Single job)       │
                    └─────────────────────┘
```

## Error Handling Flow

```
┌──────────────────┐
│  Build Job       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐      Success?
│  Package Step    ├──────────┐
└──────────────────┘          │
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
         ▼                                         ▼
    ┌─────────┐                              ┌─────────┐
    │  Yes    │                              │   No    │
    └────┬────┘                              └────┬────┘
         │                                         │
         ▼                                         ▼
┌──────────────────┐                       ┌──────────────────┐
│  Upload Artifact │                       │  Fail Job        │
│  (with strict    │                       │  (if-no-files    │
│   validation)    │                       │   -found: error) │
└────────┬─────────┘                       └──────────────────┘
         │                                         │
         │ Success?                                │
         │                                         │
    ┌────┴────┐                                   │
    │  Yes    │                                   │
    └────┬────┘                                   │
         │                                         │
         ▼                                         │
┌──────────────────┐                              │
│  Job Complete    │                              │
└──────────────────┘                              │
         │                                         │
         └─────────────────┬───────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  All 6 jobs  │
                    │  succeeded?  │
                    └──────┬───────┘
                           │
              ┌────────────┴───────────┐
              │                        │
              ▼                        ▼
         ┌─────────┐              ┌─────────┐
         │  Yes    │              │   No    │
         └────┬────┘              └────┬────┘
              │                        │
              ▼                        ▼
    ┌──────────────────┐      ┌────────────────┐
    │  Create Release  │      │  Skip Release  │
    └──────────────────┘      │  Creation      │
                              └────────────────┘
```

## Platform-Specific Build Steps

```
┌─────────────────────────────────────────────────────────────────┐
│                   Windows Build Process                          │
├─────────────────────────────────────────────────────────────────┤
│ 1. Setup Node.js & Python                                        │
│ 2. Install npm dependencies                                      │
│ 3. Install Python dependencies                                   │
│ 4. Package: npm run package -- --arch=x64 (or arm64)            │
│ 5. Make: npm run make -- --platform=win32 --arch=x64/arm64      │
│ 6. Output:                                                        │
│    • out/make/squirrel.windows/{arch}/setup.exe                  │
│    • out/make/squirrel.windows/{arch}/*.nupkg                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    macOS Build Process                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. Setup Node.js & Python                                        │
│ 2. Install macOS dependencies (brew install python@3.12)         │
│ 3. Install npm dependencies                                      │
│ 4. Install Python dependencies                                   │
│ 5. Package: npm run package -- --arch=x64 (or arm64)            │
│ 6. Make: npm run make -- --platform=darwin --arch=x64/arm64     │
│ 7. Output:                                                        │
│    • out/make/zip/darwin/{arch}/*.zip                            │
│                                                                   │
│ Note: Uses macos-13 for x64 (Intel) and macos-14 for arm64      │
│       to ensure native compilation                               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Linux Build Process                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. Setup Node.js & Python                                        │
│ 2. Install Linux system dependencies                             │
│    (libgtk-3-0, rpm, dpkg, fakeroot, etc.)                      │
│ 3. Install npm dependencies                                      │
│ 4. Install Python dependencies                                   │
│ 5. Package: npm run package -- --arch=x64 (or arm64)            │
│ 6. Make: npm run make -- --platform=linux --arch=x64/arm64      │
│ 7. Output:                                                        │
│    • out/make/deb/{arch}/*.deb                                   │
│    • out/make/rpm/{arch}/*.rpm                                   │
│    • out/make/zip/linux/{arch}/*.zip                             │
│                                                                   │
│ Note: Cross-compilation supported for ARM64                      │
└─────────────────────────────────────────────────────────────────┘
```
