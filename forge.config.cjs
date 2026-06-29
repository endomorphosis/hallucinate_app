const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');
const { main: stageBackendSources } = require('./scripts/stage_backend_sources.cjs');

// Backend Python packages bundled as source so the runtime
// PythonEnvironmentManager can pip-install them on first launch (the published
// PyPI wheels are incomplete/broken). Staged by scripts/stage_backend_sources.cjs.
const BACKEND_PACKAGE_DIRS = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'].map((p) =>
  path.join(__dirname, p)
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
    ],
  },
  rebuildConfig: {},
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
