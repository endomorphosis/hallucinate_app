const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');
const { main: stageBackendSources } = require('./scripts/stage_backend_sources.cjs');

// Backend Python packages bundled as source so the runtime
// PythonEnvironmentManager can pip-install them on first launch (the published
// PyPI wheels are incomplete/broken). A cleaned, trimmed copy is produced under
// .staged_backend/<pkg> by scripts/stage_backend_sources.cjs (run in the
// generateAssets hook below) — we bundle that, never the raw submodule
// checkouts, which contain dangling symlinks and platform-specific binaries
// that break the deb/rpm makers.
const BACKEND_PACKAGE_DIRS = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'].map((p) =>
  path.join(__dirname, '.staged_backend', p)
);

module.exports = {
  hooks: {
    // Ensure backend source is present before the packager copies extraResource.
    generateAssets: async () => {
      stageBackendSources();
    },
  },
  packagerConfig: {
    asar: true,
    name: 'hallucinate_app',
    executableName: 'hallucinate_app',
    appBundleId: 'com.endomorphosis.hallucinate_app',
    appCategoryType: 'public.app-category.developer-tools',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon'),
    extraResource: [
      path.join(__dirname, 'hallucinate_app'),
      path.join(__dirname, 'python'),
      ...BACKEND_PACKAGE_DIRS,
    ],
    ignore: [
      /^\/\.git($|\/)/,
      /^\/node_modules\/\.cache($|\/)/,
      /^\/test-results($|\/)/,
      /^\/playwright-report($|\/)/,
      /^\/\.venv($|\/)/,
      /^\/venv($|\/)/,
      /^\/__pycache__($|\/)/,
      /\.pyc$/,
      // The raw backend submodule checkouts are bundled separately (cleaned)
      // via extraResource from .staged_backend; keep them and the staging dir
      // itself out of the app asar to avoid dangling symlinks and bloat.
      /^\/ipfs_kit_py($|\/)/,
      /^\/ipfs_datasets_py($|\/)/,
      /^\/ipfs_accelerate_py($|\/)/,
      /^\/\.staged_backend($|\/)/,
    ],
  },
  // Skip the native-module source rebuild during packaging. Every native
  // module this app ships (sharp, keytar, onnxruntime-node) uses ABI-stable
  // N-API prebuilt binaries that load under Electron as-is, so they do not
  // need an Electron-ABI rebuild. The only module with a non-N-API
  // (NAN-based) addon is `deasync`, pulled in transitively by
  // ipfs_model_manager_js but never actually required at runtime; forcing its
  // source rebuild broke packaging on macOS (node-gyp) and Windows (the
  // Visual Studio finder exceeding its stdout maxBuffer). An empty
  // `onlyModules` allowlist tells @electron/rebuild to rebuild nothing, which
  // makes packaging deterministic and toolchain-independent on every runner.
  rebuildConfig: {
    onlyModules: [],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'hallucinate_app',
        authors: 'Benjamin Barber',
        description: 'Electron App for IPFS Huggingface Bridge',
        // setupIcon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.ico'),
        // loadingGif: path.join(__dirname, 'hallucinate_app', 'assets', 'loading.gif'),
        // iconUrl: 'https://github.com/endomorphosis/hallucinate_app/raw/main/hallucinate_app/assets/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
    {
      // Real macOS disk image. Only runs on darwin (requires macOS tooling);
      // Forge skips it on other platforms.
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        name: 'hallucinate_app',
      },
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'Benjamin Barber',
          homepage: 'https://github.com/endomorphosis/hallucinate_app',
          icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png'),
          categories: ['Development', 'Network'],
          section: 'devel',
          priority: 'optional',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          name: 'hallucinate_app',
          productName: 'Hallucinate App',
          homepage: 'https://github.com/endomorphosis/hallucinate_app',
          icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png'),
          categories: ['Development', 'Network'],
          license: 'AGPL-3.0-only',
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
