# Containerization & Packaging Guide

## Overview

Hallucinate App is designed to be distributed as a **fully containerized desktop application** across multiple platforms. This guide explains how everything is packaged together into distributable formats (`.exe`, `.dmg`, `.rpm`, `.deb`, `tar.gz`) and how the containerization works.

## What Gets Containerized

### The Complete Stack

```
Containerized Application Contents:
│
├── 1. Electron Runtime
│   ├── Chromium engine (for rendering)
│   ├── Node.js runtime (for backend)
│   ├── V8 JavaScript engine
│   └── Native OS integration
│
├── 2. Application Code
│   ├── Main process (index.js)
│   ├── Renderer processes (UI windows)
│   ├── IPC handlers
│   ├── Daemon manager
│   └── Menu system
│
├── 3. SwissKnife Virtual Desktop
│   ├── Built web application
│   ├── 27+ applications (bundled)
│   ├── Static assets
│   ├── WebRTC/P2P libraries
│   └── AI integration code
│
├── 4. Python Runtime & Packages
│   ├── Python 3.8+ interpreter
│   ├── ipfs_kit_py package
│   ├── ipfs_datasets_py package
│   ├── ipfs_accelerate_py package
│   ├── All dependencies (PyPI packages)
│   └── Virtual environment setup
│
├── 5. MCP Servers
│   ├── IPFS Kit server code
│   ├── IPFS Datasets server code
│   ├── IPFS Accelerate server code
│   ├── CLI tools
│   └── Configuration files
│
├── 6. Resources & Assets
│   ├── Icons (all sizes)
│   ├── Images and graphics
│   ├── Fonts
│   ├── Stylesheets
│   └── Documentation
│
├── 7. Configuration & Data
│   ├── Default configurations
│   ├── Database schemas
│   ├── Templates
│   └── Sample data
│
└── 8. Platform-Specific Files
    ├── Windows: .exe, registry keys, shortcuts
    ├── macOS: .app bundle, plist files
    ├── Linux: .desktop files, mime types
    └── Update mechanism files
```

## Packaging Technologies

### Electron Forge

**What it does:** Electron Forge is the official tool for packaging and distributing Electron applications.

**Configuration:** `forge.config.cjs`

```javascript
module.exports = {
  packagerConfig: {
    name: "hallucinate_app",
    icon: "./assets/icon",
    asar: true,  // Package app files into archive
    // ...
  },
  makers: [
    {
      name: '@electron-forge/maker-deb',     // Debian packages
      config: { /* ... */ }
    },
    {
      name: '@electron-forge/maker-rpm',     // RedHat packages
      config: { /* ... */ }
    },
    {
      name: '@electron-forge/maker-zip',     // macOS ZIP
      config: { /* ... */ }
    },
    {
      name: '@electron-forge/maker-squirrel', // Windows installer
      config: { /* ... */ }
    }
  ]
};
```

### Build Process Flow

```
Development Code
      ↓
┌─────────────────────────────────────────────┐
│  Step 1: Prepare Environment               │
│  - Install Node.js dependencies             │
│  - Install Python dependencies              │
│  - Build submodules                         │
└─────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────┐
│  Step 2: Build SwissKnife                  │
│  - npm run build in swissknife/            │
│  - Creates optimized production bundle      │
│  - Minifies JavaScript and CSS              │
│  - Generates static assets                  │
└─────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────┐
│  Step 3: Package Python Submodules         │
│  - Bundle ipfs_kit_py with dependencies     │
│  - Bundle ipfs_datasets_py with deps        │
│  - Bundle ipfs_accelerate_py with deps      │
│  - Create portable Python environment       │
└─────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────┐
│  Step 4: Electron Packaging                │
│  - npm run package                          │
│  - Bundles Electron runtime                 │
│  - Packages all application code            │
│  - Creates platform-specific structure      │
└─────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────┐
│  Step 5: Create Installers                 │
│  - npm run make                             │
│  - Generates platform installers           │
│  - Signs code (if certificates available)   │
│  - Creates update packages                  │
└─────────────────────────────────────────────┘
      ↓
Distribution Packages
(.exe, .dmg, .rpm, .deb, tar.gz)
```

## Platform-Specific Packaging

### Windows (.exe)

**Technology:** Squirrel.Windows

**Package Contents:**
```
hallucinate_app-setup.exe
├── Installer executable
├── Application files (ASAR archive)
├── Python runtime + packages
├── SwissKnife built files
├── Update.exe (auto-updater)
└── Shortcuts and registry keys
```

**Installation Process:**
1. User runs `.exe` installer
2. Installer extracts to `C:\Program Files\hallucinate_app\`
3. Creates Start Menu shortcut
4. Registers file associations
5. Configures auto-update
6. Creates desktop shortcut (optional)

**Build Command:**
```bash
npm run make -- --platform=win32
# Generates: out/make/squirrel.windows/x64/hallucinate_app-setup.exe
```

**Features:**
- ✅ Auto-update support via Squirrel
- ✅ Silent installation option
- ✅ Uninstaller included
- ✅ Windows Defender compatibility
- ✅ Code signing (with certificate)

### macOS (.dmg via .zip)

**Technology:** ZIP archive with .app bundle

**Package Contents:**
```
hallucinate_app.zip
└── hallucinate_app.app/
    ├── Contents/
    │   ├── MacOS/
    │   │   └── hallucinate_app (executable)
    │   ├── Resources/
    │   │   ├── Application files
    │   │   ├── Python runtime
    │   │   ├── SwissKnife files
    │   │   └── Assets
    │   ├── Frameworks/ (Electron framework)
    │   └── Info.plist (app metadata)
    └── Icon (app icon)
```

**Installation Process:**
1. User downloads `.zip` file
2. Extracts to reveal `.app` bundle
3. Drags `.app` to Applications folder
4. macOS verifies signature (if signed)
5. App is ready to run

**Build Command:**
```bash
npm run make -- --platform=darwin
# Generates: out/make/zip/darwin/x64/hallucinate_app-darwin-x64.zip
```

**Features:**
- ✅ Universal binary support (Intel + Apple Silicon)
- ✅ Automatic Gatekeeper bypass (with signing)
- ✅ Notarization support
- ✅ Native macOS integration
- ✅ Retina display support

### Linux Debian/Ubuntu (.deb)

**Technology:** Debian package format

**Package Contents:**
```
hallucinate_app.deb
├── DEBIAN/
│   ├── control (package metadata)
│   ├── postinst (post-installation script)
│   └── prerm (pre-removal script)
├── usr/
│   ├── bin/
│   │   └── hallucinate_app (launcher script)
│   ├── lib/
│   │   └── hallucinate_app/
│   │       ├── Application files
│   │       ├── Python runtime
│   │       └── SwissKnife files
│   └── share/
│       ├── applications/
│       │   └── hallucinate_app.desktop
│       └── icons/
│           └── hallucinate_app.png
```

**Installation Process:**
```bash
# Via dpkg
sudo dpkg -i hallucinate_app.deb
sudo apt-get install -f  # Fix dependencies

# Via apt (if in repository)
sudo apt install ./hallucinate_app.deb
```

**Build Command:**
```bash
npm run make -- --platform=linux
# Generates: out/make/deb/x64/hallucinate_app_1.0.3_amd64.deb
```

**Features:**
- ✅ Automatic dependency resolution
- ✅ Desktop integration (.desktop file)
- ✅ Icon theme integration
- ✅ Uninstall via apt
- ✅ System-wide or user installation

### Linux RedHat/Rocky (.rpm)

**Technology:** RPM Package Manager

**Package Contents:**
```
hallucinate_app.rpm
├── Metadata
│   ├── Name, version, description
│   ├── Dependencies
│   └── Scripts (pre/post install/uninstall)
└── Files
    ├── /usr/bin/hallucinate_app
    ├── /usr/lib/hallucinate_app/
    │   ├── Application files
    │   ├── Python runtime
    │   └── SwissKnife files
    └── /usr/share/
        ├── applications/hallucinate_app.desktop
        └── icons/hallucinate_app.png
```

**Installation Process:**
```bash
# Via rpm
sudo rpm -i hallucinate_app.rpm

# Via dnf (Fedora/Rocky 8+)
sudo dnf install ./hallucinate_app.rpm

# Via yum (RHEL/CentOS 7)
sudo yum localinstall hallucinate_app.rpm
```

**Build Command:**
```bash
npm run make -- --platform=linux
# Generates: out/make/rpm/x64/hallucinate_app-1.0.3-1.x86_64.rpm
```

**Features:**
- ✅ SELinux compatibility
- ✅ Dependency management
- ✅ Desktop integration
- ✅ Uninstall via dnf/yum
- ✅ RPM database integration

## Docker Containerization

### Dockerfile

While the main distribution is as desktop packages, Docker is also supported for server deployments:

```dockerfile
FROM node:18-bullseye

# Install Python 3.8+
RUN apt-get update && apt-get install -y python3 python3-pip

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY forge.config.cjs ./

# Install dependencies
RUN npm ci --production

# Copy application files
COPY . .

# Install Python submodules
RUN cd ipfs_kit_py && pip3 install -e .
RUN cd ipfs_datasets_py && pip3 install -e .
RUN cd ipfs_accelerate_py && pip3 install -e .

# Build SwissKnife
RUN cd swissknife && npm install && npm run build

# Expose ports
EXPOSE 3001 3002 3003 8004

# Start application
CMD ["npm", "start"]
```

**Build & Run:**
```bash
# Build image
docker build -t hallucinate_app:latest .

# Run container
docker run -p 3001-3003:3001-3003 -p 8004:8004 hallucinate_app:latest

# With volume for persistent data
docker run -v $HOME/.hallucinate_app:/root/.hallucinate_app \
           -p 3001-3003:3001-3003 \
           hallucinate_app:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  hallucinate_app:
    build: .
    ports:
      - "3001:3001"  # IPFS Kit
      - "3002:3002"  # IPFS Datasets
      - "3003:3003"  # IPFS Accelerate
      - "8004:8004"  # IPFS Kit Dashboard
    volumes:
      - app_data:/root/.hallucinate_app
    environment:
      - AUTO_START_DAEMONS=true
      - NODE_ENV=production

volumes:
  app_data:
```

**Usage:**
```bash
docker-compose up -d
docker-compose logs -f
docker-compose down
```

## Kubernetes Deployment

### Helm Charts

**Location:** `helm/` directory in repository

**Chart Structure:**
```
helm/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── ingress.yaml
│   └── statefulset.yaml
└── README.md
```

**Install with Helm:**
```bash
# Add repository (if published)
helm repo add hallucinate-app https://charts.hallucinate.app
helm repo update

# Install chart
helm install my-hallucinate helm/hallucinate_app

# Or from local directory
helm install my-hallucinate ./helm/

# With custom values
helm install my-hallucinate ./helm/ -f custom-values.yaml
```

**Example values.yaml:**
```yaml
replicaCount: 3

image:
  repository: hallucinate-app
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  ports:
    ipfsKit: 3001
    ipfsDatasets: 3002
    ipfsAccelerate: 3003
    dashboard: 8004

ingress:
  enabled: true
  annotations:
    kubernetes.io/ingress.class: nginx
  hosts:
    - host: hallucinate.example.com
      paths:
        - path: /
          pathType: Prefix

resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 1000m
    memory: 2Gi

persistence:
  enabled: true
  size: 20Gi
  storageClass: standard

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
```

### Kubernetes Manifests

**Deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hallucinate-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: hallucinate-app
  template:
    metadata:
      labels:
        app: hallucinate-app
    spec:
      containers:
      - name: hallucinate-app
        image: hallucinate-app:latest
        ports:
        - containerPort: 3001
        - containerPort: 3002
        - containerPort: 3003
        - containerPort: 8004
        env:
        - name: AUTO_START_DAEMONS
          value: "true"
        resources:
          limits:
            memory: "4Gi"
            cpu: "2"
          requests:
            memory: "2Gi"
            cpu: "1"
        volumeMounts:
        - name: data
          mountPath: /root/.hallucinate_app
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: hallucinate-app-data
```

**Service:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: hallucinate-app
spec:
  selector:
    app: hallucinate-app
  ports:
  - name: ipfs-kit
    port: 3001
    targetPort: 3001
  - name: ipfs-datasets
    port: 3002
    targetPort: 3002
  - name: ipfs-accelerate
    port: 3003
    targetPort: 3003
  - name: dashboard
    port: 8004
    targetPort: 8004
```

## CI/CD Workflows

### GitHub Actions

**Location:** `.github/workflows/`

**Main Build Workflow:**
```yaml
name: Build and Package

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18.x, 20.x]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Python dependencies
        run: |
          pip install -r requirements.txt
          bash scripts/install_submodule_deps.sh
      
      - name: Build SwissKnife
        run: |
          cd swissknife
          npm install --legacy-peer-deps
          npm run build
      
      - name: Package application
        run: npm run package
      
      - name: Create installers
        run: npm run make
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-${{ matrix.node }}-build
          path: out/make/**/*
          retention-days: 30
```

**Release Workflow:**
```yaml
name: Create Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      # ... build all platforms ...
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            out/make/**/*.exe
            out/make/**/*.zip
            out/make/**/*.deb
            out/make/**/*.rpm
          generate_release_notes: true
```

## Size Optimization

### Reducing Package Size

**Strategies:**

1. **Use ASAR Archive:**
   ```javascript
   // forge.config.cjs
   packagerConfig: {
     asar: true,  // Package files into archive
   }
   ```

2. **Prune Node Modules:**
   ```bash
   npm prune --production
   ```

3. **Exclude Development Files:**
   ```javascript
   packagerConfig: {
     ignore: [
       /^\/test/,
       /^\/docs/,
       /\.md$/,
       /\.txt$/,
       /^\/\.github/
     ]
   }
   ```

4. **Optimize Python Packages:**
   ```bash
   # Remove unnecessary files
   find . -name "*.pyc" -delete
   find . -name "__pycache__" -type d -exec rm -rf {} +
   ```

5. **Tree-shake JavaScript:**
   ```javascript
   // Vite automatically tree-shakes in production
   // Make sure imports are ES6 modules
   ```

**Typical Package Sizes:**
- **Windows (.exe):** 200-300 MB
- **macOS (.zip):** 250-350 MB
- **Linux (.deb/.rpm):** 180-280 MB

## Security Considerations

### Code Signing

**Windows:**
```bash
# Sign with certificate
npm run make -- --platform=win32 \
  --sign \
  --certificate="path/to/cert.pfx" \
  --password="cert-password"
```

**macOS:**
```bash
# Sign and notarize
export APPLE_ID="your@email.com"
export APPLE_ID_PASSWORD="app-specific-password"
npm run make -- --platform=darwin --sign
```

**Linux:**
```bash
# Sign DEB package
dpkg-sig --sign builder hallucinate_app.deb

# Sign RPM package
rpm --addsign hallucinate_app.rpm
```

### Sandboxing

**Electron Sandboxing:**
```javascript
// Enable sandbox for renderers
const win = new BrowserWindow({
  webPreferences: {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false
  }
});
```

### Updates & Security Patches

**Auto-update Configuration:**
```javascript
// Update URL
autoUpdater.setFeedURL({
  url: 'https://updates.hallucinate.app/releases',
  serverType: 'json'
});

// Check for updates
autoUpdater.checkForUpdates();
```

## Testing Packages

### Local Testing

```bash
# Test packaged app without creating installer
npm run package

# Run packaged app
./out/hallucinate_app-linux-x64/hallucinate_app      # Linux
open out/hallucinate_app-darwin-x64/hallucinate_app.app  # macOS
./out/hallucinate_app-win32-x64/hallucinate_app.exe  # Windows
```

### Installer Testing

```bash
# Install .deb locally
sudo dpkg -i out/make/deb/x64/hallucinate_app.deb

# Install .rpm locally
sudo rpm -i out/make/rpm/x64/hallucinate_app.rpm

# Test Windows installer in VM
# Copy .exe to Windows VM and run
```

### Automated Testing

```yaml
# GitHub Actions test job
test-package:
  runs-on: ${{ matrix.os }}
  steps:
    - name: Build package
      run: npm run package
    
    - name: Test package launches
      run: |
        timeout 30s ./out/hallucinate_app-*/hallucinate_app --version
```

## Distribution Channels

### GitHub Releases

**Automatic Release Creation:**
- Push tag: `git tag v1.0.4 && git push origin v1.0.4`
- GitHub Actions builds all platforms
- Creates GitHub Release with all artifacts
- Users download from Releases page

### Package Managers

**Homebrew (macOS/Linux):**
```ruby
# Formula
class HallucinateApp < Formula
  desc "Decentralized AI Desktop Platform"
  homepage "https://github.com/endomorphosis/hallucinate_app"
  url "https://github.com/endomorphosis/hallucinate_app/releases/download/v1.0.4/hallucinate_app.zip"
  sha256 "..."
  
  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"hallucinate_app"
  end
end
```

**Snap (Linux):**
```yaml
# snapcraft.yaml
name: hallucinate-app
version: '1.0.4'
summary: Decentralized AI Desktop Platform
description: |
  Complete decentralized AI development environment with
  SwissKnife virtual desktop and IPFS MCP servers.
  
apps:
  hallucinate-app:
    command: hallucinate_app
    plugs:
      - network
      - home
      - desktop
```

**Flatpak (Linux):**
```yaml
# org.hallucinate.App.yaml
app-id: org.hallucinate.App
runtime: org.freedesktop.Platform
runtime-version: '23.08'
sdk: org.freedesktop.Sdk
command: hallucinate_app
modules:
  - name: hallucinate-app
    sources:
      - type: archive
        url: https://github.com/endomorphosis/hallucinate_app/releases/download/v1.0.4/hallucinate_app.tar.gz
```

## Summary

Hallucinate App provides **comprehensive containerization and packaging** for all major platforms:

✅ **Desktop Packages:** Native installers for Windows, macOS, Linux  
✅ **Docker Support:** Container images for server deployment  
✅ **Kubernetes:** Helm charts for orchestrated deployments  
✅ **CI/CD:** Automated building and distribution  
✅ **Multiple Formats:** .exe, .dmg, .deb, .rpm, .tar.gz  
✅ **Code Signing:** Security for all platforms  
✅ **Auto-updates:** Keep users on latest version  
✅ **Size Optimized:** Reasonable package sizes (200-350 MB)  

The platform is designed to be **easy to distribute** and **easy to install** for end users, while maintaining the flexibility for advanced deployment scenarios like Kubernetes clusters.

---

*For build instructions, see [Quick Start: Building](QUICK_START_BUILD.md)*  
*For deployment instructions, see [Deployment Guide](DEPLOYMENT.md)*
