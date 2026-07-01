/**
 * PythonEnvironmentManager
 * ------------------------------------------------------------------------
 * Provisions a self-contained Python environment for the packaged
 * hallucinate_app so the MCP daemons "just work" out of the box across the
 * .exe / .dmg / .deb / .rpm distributions.
 *
 * Responsibilities:
 *   1. Resolve a usable base Python interpreter, trying (in order):
 *        a. explicit env override (HALLUCINATE_PYTHON / MCP_DAEMON_PYTHON)
 *        b. an already-provisioned managed virtual environment
 *        c. a standalone Python bundled into the app resources at build time
 *        d. a standalone Python previously auto-downloaded into userData
 *        e. a validated system interpreter (python3 / python, >= 3.9)
 *        f. (optional) auto-download a standalone Python build
 *   2. Create a per-user virtual environment under <userData>/python-runtime.
 *   3. Install the bundled requirements + any bundled local packages into it.
 *   4. Be fully idempotent: a fingerprint marker short-circuits re-provisioning
 *      when nothing relevant has changed, so normal launches stay fast.
 *
 * The module depends only on Node.js builtins so it can run inside a packaged
 * Electron main process without any extra npm dependencies.
 */

import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const MIN_PYTHON = [3, 9];
const MARKER_VERSION = 2;

const DEFAULT_REQUIREMENT_CANDIDATES = [
  // Preferred: consolidated, fully-pinned runtime requirements.
  ['python', 'requirements-bundled.txt'],
  // Fallbacks kept for backwards compatibility with older layouts.
  ['python', 'requirements.txt'],
];

/** Local source packages installed on top of the pinned requirements when the
 *  bundled source tree is available (dev checkouts / source distributions). */
const BUNDLED_LOCAL_PACKAGES = ['ipfs_kit_py', 'ipfs_datasets_py', 'ipfs_accelerate_py'];

/** Requirements that must install successfully for the MCP daemons to run.
 *  Names are normalized to lowercase with underscores. */
// The three IPFS packages are installed from bundled local source (see
// _installBundledPackages), not from this requirements file, so they are not
// listed here. These are the supporting deps that must install for the daemons
// to import successfully.
const CORE_REQUIREMENTS = new Set([
  'fastapi',
  'uvicorn',
  'hypercorn',
  'anyio',
  'sniffio',
  'trio',
  'pydantic',
  'pyjwt',
  'pyarrow',
]);

function noop() {}

export class PythonEnvironmentManager {
  /**
   * @param {object} options
   * @param {string} options.userDataDir  Writable per-user directory (app.getPath('userData')).
   * @param {string} [options.resourcesPath]  Packaged resources root (process.resourcesPath).
   * @param {string} [options.appRoot]  Repo/app root used for dev runs and to locate requirements.
   * @param {(evt: object) => void} [options.onProgress]  Progress callback.
   * @param {{info:Function,warn:Function,error:Function}} [options.logger]
   * @param {boolean} [options.allowDownload]  Permit auto-downloading a standalone Python.
   */
  constructor(options = {}) {
    this.userDataDir = options.userDataDir || path.join(os.homedir(), '.hallucinate_app');
    this.resourcesPath = options.resourcesPath || null;
    this.appRoot = options.appRoot || process.cwd();
    this.onProgress = typeof options.onProgress === 'function' ? options.onProgress : noop;
    this.logger = options.logger || {
      info: (...a) => console.log('[python-env]', ...a),
      warn: (...a) => console.warn('[python-env]', ...a),
      error: (...a) => console.error('[python-env]', ...a),
    };
    this.allowDownload = options.allowDownload !== false && process.env.HALLUCINATE_DISABLE_PY_DOWNLOAD !== 'true';

    this.runtimeDir = path.join(this.userDataDir, 'python-runtime');
    this.venvDir = path.join(this.runtimeDir, 'venv');
    this.markerPath = path.join(this.runtimeDir, '.provision-marker.json');
    this.logPath = path.join(this.runtimeDir, 'provision.log');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Absolute path to the managed virtual environment's python executable. */
  getVenvPython() {
    return process.platform === 'win32'
      ? path.join(this.venvDir, 'Scripts', 'python.exe')
      : path.join(this.venvDir, 'bin', 'python');
  }

  /**
   * Ensure a working Python environment exists. Idempotent and safe to call on
   * every launch. Returns a descriptor describing the resolved interpreter.
   *
   * @returns {Promise<{pythonPath:string|null, provisioned:boolean, fromCache:boolean, basePython:string|null, error:string|null}>}
   */
  async ensureEnvironment() {
    const result = {
      pythonPath: null,
      provisioned: false,
      fromCache: false,
      basePython: null,
      error: null,
    };

    try {
      fs.mkdirSync(this.runtimeDir, { recursive: true });
    } catch (err) {
      result.error = `Cannot create runtime dir ${this.runtimeDir}: ${err.message}`;
      this.logger.error(result.error);
      return result;
    }

    // Fast path: a previous provision is still valid.
    if (this.isProvisioned()) {
      const venvPython = this.getVenvPython();
      this._progress('ready', 100, 'Python environment already provisioned');
      result.pythonPath = venvPython;
      result.provisioned = true;
      result.fromCache = true;
      result.basePython = this._readMarker()?.basePython || null;
      this.logger.info(`Reusing provisioned Python environment at ${venvPython}`);
      return result;
    }

    // Resolve a base interpreter capable of building the venv.
    this._progress('resolve', 5, 'Locating a Python interpreter');
    const base = await this.resolveBasePython();
    if (!base) {
      result.error =
        'No suitable Python 3.9+ interpreter could be found or provisioned. ' +
        'Install Python 3 or set HALLUCINATE_PYTHON to a valid interpreter.';
      this.logger.error(result.error);
      this._progress('error', 100, result.error);
      return result;
    }
    result.basePython = base.command;
    this.logger.info(`Using base Python: ${base.command} (${base.version})`);

    // Create the virtual environment.
    this._progress('venv', 20, 'Creating isolated Python environment');
    const venvOk = this._createVenv(base.command);
    if (!venvOk.success) {
      result.error = `Failed to create virtual environment: ${venvOk.error}`;
      this.logger.error(result.error);
      this._progress('error', 100, result.error);
      return result;
    }
    const venvPython = this.getVenvPython();

    // Upgrade pip tooling (best-effort).
    this._progress('pip', 35, 'Preparing package installer');
    this._upgradePip(venvPython);

    // Install pinned requirements.
    this._progress('deps', 50, 'Installing backend dependencies (this may take a few minutes)');
    const reqFile = this._findRequirementsFile();
    if (reqFile) {
      const reqOk = this._installRequirements(venvPython, reqFile);
      if (!reqOk.success) {
        result.error = `Failed to install requirements from ${reqFile}: ${reqOk.error}`;
        this.logger.error(result.error);
        this._progress('error', 100, result.error);
        return result;
      }
    } else {
      this.logger.warn('No bundled requirements file found; skipping dependency install');
    }

    // Install bundled local packages on top, when present (dev/source builds).
    this._progress('packages', 80, 'Installing bundled IPFS packages');
    this._installBundledPackages(venvPython);

    // Record success.
    this._writeMarker(base);
    this._progress('ready', 100, 'Python environment ready');
    result.pythonPath = venvPython;
    result.provisioned = true;
    this.logger.info(`Python environment provisioned at ${venvPython}`);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Base interpreter resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve a base interpreter usable to build the venv.
   * @returns {Promise<{command:string, version:string}|null>}
   */
  async resolveBasePython() {
    // a. explicit override
    for (const envVar of ['HALLUCINATE_PYTHON', 'MCP_DAEMON_PYTHON']) {
      const override = process.env[envVar];
      if (override) {
        const v = this._validatePython(override);
        if (v) return { command: override, version: v };
        this.logger.warn(`${envVar}=${override} is not a usable Python 3.9+ interpreter`);
      }
    }

    // b. already-provisioned managed venv
    const venvPython = this.getVenvPython();
    if (fs.existsSync(venvPython)) {
      const v = this._validatePython(venvPython);
      if (v) return { command: venvPython, version: v };
    }

    // c. standalone python bundled into app resources at build time
    // d. standalone python previously auto-downloaded into userData
    for (const root of [this.resourcesPath, this.runtimeDir]) {
      const bundled = this._findStandalonePython(root);
      if (bundled) {
        const v = this._validatePython(bundled);
        if (v) return { command: bundled, version: v };
      }
    }

    // e. validated system interpreter
    for (const candidate of this._systemPythonCandidates()) {
      const v = this._validatePython(candidate);
      if (v) return { command: candidate, version: v };
    }

    // f. last resort: auto-download a standalone build
    if (this.allowDownload) {
      this._progress('download', 10, 'Downloading a self-contained Python runtime');
      const downloaded = await this.downloadStandalonePython();
      if (downloaded) {
        const v = this._validatePython(downloaded);
        if (v) return { command: downloaded, version: v };
      }
    }

    return null;
  }

  _systemPythonCandidates() {
    if (process.platform === 'win32') {
      return ['python.exe', 'python3.exe', 'python', 'python3', 'py'];
    }
    return ['python3', 'python'];
  }

  /**
   * Validate that a command points to a Python interpreter satisfying the
   * minimum version. Returns the version string on success, else null.
   */
  _validatePython(command) {
    if (!command) return null;
    try {
      const res = spawnSync(
        command,
        ['-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3])'],
        { encoding: 'utf8', timeout: 15000 }
      );
      if (res.status !== 0 || !res.stdout) return null;
      const version = res.stdout.trim();
      const parts = version.split('.').map((n) => parseInt(n, 10));
      if (parts.length < 2 || Number.isNaN(parts[0])) return null;
      if (parts[0] < MIN_PYTHON[0]) return null;
      if (parts[0] === MIN_PYTHON[0] && parts[1] < MIN_PYTHON[1]) return null;
      // venv module must be importable to build the environment.
      const venvCheck = spawnSync(command, ['-c', 'import venv'], { encoding: 'utf8', timeout: 15000 });
      if (venvCheck.status !== 0) {
        this.logger.warn(`${command} lacks the venv module; skipping`);
        return null;
      }
      return version;
    } catch {
      return null;
    }
  }

  /** Look for a standalone python interpreter laid out under a root directory. */
  _findStandalonePython(root) {
    if (!root) return null;
    const rel = process.platform === 'win32'
      ? [['python', 'python.exe'], ['python-runtime', 'python.exe']]
      : [['python', 'bin', 'python3'], ['python', 'bin', 'python'], ['python-standalone', 'bin', 'python3']];
    for (const segments of rel) {
      const candidate = path.join(root, ...segments);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Provisioning steps
  // ---------------------------------------------------------------------------

  _createVenv(basePython) {
    // If a stale/partial venv exists without a python, recreate it.
    const venvPython = this.getVenvPython();
    if (fs.existsSync(venvPython)) {
      return { success: true, error: null };
    }
    const res = this._run(basePython, ['-m', 'venv', '--upgrade-deps', this.venvDir], { step: 'venv' });
    if (res.status === 0 && fs.existsSync(venvPython)) {
      return { success: true, error: null };
    }
    // --upgrade-deps is unsupported on very old pythons; retry without it.
    const retry = this._run(basePython, ['-m', 'venv', this.venvDir], { step: 'venv-retry' });
    if (retry.status === 0 && fs.existsSync(venvPython)) {
      return { success: true, error: null };
    }
    return { success: false, error: (retry.stderr || res.stderr || 'venv creation failed').trim() };
  }

  _upgradePip(venvPython) {
    const res = this._run(
      venvPython,
      ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'],
      { step: 'pip-upgrade' }
    );
    if (res.status !== 0) {
      this.logger.warn('pip/setuptools/wheel upgrade failed (continuing)');
    }
    return res.status === 0;
  }

  _installRequirements(venvPython, reqFile) {
    // First attempt: a single resolved install (fast, resolves cross-deps).
    const bulk = this._run(
      venvPython,
      ['-m', 'pip', 'install', '--no-input', '-r', reqFile],
      { step: 'requirements', timeout: 1000 * 60 * 30 }
    );
    if (bulk.status === 0) return { success: true, error: null };

    // Fallback: install each requirement independently so a single broken or
    // platform-incompatible package cannot block the rest of the backend.
    this.logger.warn('Bulk requirements install failed; retrying per-package (best-effort)');
    const specs = this._parseRequirements(reqFile);
    const failedCore = [];
    for (const spec of specs) {
      const res = this._run(
        venvPython,
        ['-m', 'pip', 'install', '--no-input', spec],
        { step: `req:${spec}`, timeout: 1000 * 60 * 15 }
      );
      if (res.status !== 0) {
        if (this._isCoreRequirement(spec)) {
          failedCore.push(spec);
          this.logger.error(`Core requirement failed to install: ${spec}`);
        } else {
          this.logger.warn(`Optional requirement failed to install (continuing): ${spec}`);
        }
      }
    }
    if (failedCore.length === 0) {
      return { success: true, error: null };
    }
    return {
      success: false,
      error: `Core requirements failed to install: ${failedCore.join(', ')}`,
    };
  }

  /** Parse a requirements file into individual install specifiers. */
  _parseRequirements(reqFile) {
    let raw = '';
    try {
      raw = fs.readFileSync(reqFile, 'utf8');
    } catch {
      return [];
    }
    return raw
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+#.*$/, '').trim())
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('-'));
  }

  /** Whether a requirement is essential for the MCP daemons to function. */
  _isCoreRequirement(spec) {
    const name = spec
      .split(/[\s<>=!~;\[]/)[0]
      .trim()
      .toLowerCase()
      .replace(/-/g, '_');
    return CORE_REQUIREMENTS.has(name);
  }

  /**
   * Install the three IPFS packages from bundled local source. This is the
   * PRIMARY install path for ipfs_kit_py / ipfs_datasets_py / ipfs_accelerate_py
   * because the published PyPI wheels are incomplete/broken. The supporting
   * dependency layer is already provided by requirements-bundled.txt, so these
   * are installed with --no-deps and --force-reinstall so the local source wins
   * over anything pip may have already resolved. Best-effort per package.
   * @returns {{installed: string[], missing: string[]}}
   */
  _installBundledPackages(venvPython) {
    const installed = [];
    const missing = [];
    for (const pkg of BUNDLED_LOCAL_PACKAGES) {
      const dir = this._findLocalPackageDir(pkg);
      if (!dir) {
        missing.push(pkg);
        this.logger.warn(
          `Bundled source for ${pkg} not found; the ${pkg} MCP daemon will be unavailable. ` +
            `Ensure the build staged the submodule source (see scripts/stage_backend_sources.cjs).`
        );
        continue;
      }
      const res = this._run(
        venvPython,
        ['-m', 'pip', 'install', '--no-input', '--no-deps', '--force-reinstall', dir],
        { step: `bundled:${pkg}`, timeout: 1000 * 60 * 10 }
      );
      if (res.status === 0) {
        installed.push(pkg);
        this.logger.info(`Installed ${pkg} from bundled source: ${dir}`);
      } else {
        missing.push(pkg);
        this.logger.warn(`Failed to install ${pkg} from bundled source ${dir}`);
      }
    }
    return { installed, missing };
  }

  _findLocalPackageDir(pkg) {
    const roots = [this.resourcesPath, this.appRoot].filter(Boolean);
    for (const root of roots) {
      const dir = path.join(root, pkg);
      if (!fs.existsSync(dir)) continue;
      const hasBuild =
        fs.existsSync(path.join(dir, 'setup.py')) || fs.existsSync(path.join(dir, 'pyproject.toml'));
      // Require an actual package payload, not an empty submodule placeholder.
      if (hasBuild) return dir;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Standalone Python auto-download (best-effort fallback)
  // ---------------------------------------------------------------------------

  /**
   * Download a self-contained "install_only" Python build from the
   * python-build-standalone project into the runtime dir and return the
   * resulting interpreter path, or null on failure. Uses `tar` for extraction.
   * @returns {Promise<string|null>}
   */
  async downloadStandalonePython() {
    const url = this._standaloneDownloadUrl();
    if (!url) {
      this.logger.warn('No standalone Python build available for this platform/arch');
      return null;
    }
    const destDir = path.join(this.runtimeDir, 'python-standalone-download');
    const archive = path.join(this.runtimeDir, 'python-standalone.tar.gz');
    try {
      fs.rmSync(destDir, { recursive: true, force: true });
      fs.mkdirSync(destDir, { recursive: true });
      this.logger.info(`Downloading standalone Python: ${url}`);
      await this._downloadFile(url, archive);
      const tar = this._run('tar', ['-xzf', archive, '-C', destDir], { step: 'extract', timeout: 1000 * 60 * 5 });
      if (tar.status !== 0) {
        this.logger.warn('Failed to extract standalone Python archive');
        return null;
      }
      // python-build-standalone extracts to a top-level "python" directory.
      const interpreter = this._findStandalonePython(destDir);
      if (interpreter) {
        try { fs.unlinkSync(archive); } catch { /* ignore */ }
        return interpreter;
      }
      return null;
    } catch (err) {
      this.logger.warn(`Standalone Python download failed: ${err.message}`);
      return null;
    }
  }

  _standaloneDownloadUrl() {
    // Pinned python-build-standalone "install_only" release.
    const TAG = '20240814';
    const PY = '3.11.9';
    const arch = process.arch;
    const plat = process.platform;
    let triple = null;
    if (plat === 'linux') {
      if (arch === 'x64') triple = 'x86_64-unknown-linux-gnu';
      else if (arch === 'arm64') triple = 'aarch64-unknown-linux-gnu';
    } else if (plat === 'darwin') {
      if (arch === 'x64') triple = 'x86_64-apple-darwin';
      else if (arch === 'arm64') triple = 'aarch64-apple-darwin';
    } else if (plat === 'win32') {
      if (arch === 'x64') triple = 'x86_64-pc-windows-msvc-shared';
    }
    if (!triple) return null;
    return (
      `https://github.com/indygreg/python-build-standalone/releases/download/${TAG}/` +
      `cpython-${PY}+${TAG}-${triple}-install_only.tar.gz`
    );
  }

  _downloadFile(url, dest, redirects = 0) {
    return new Promise((resolve, reject) => {
      if (redirects > 5) {
        reject(new Error('Too many redirects'));
        return;
      }
      // Lazy import to keep top-level deps minimal.
      import('https')
        .then(({ default: https }) => {
          const file = fs.createWriteStream(dest);
          https
            .get(url, { headers: { 'User-Agent': 'hallucinate_app' } }, (res) => {
              if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                fs.rmSync(dest, { force: true });
                this._downloadFile(res.headers.location, dest, redirects + 1).then(resolve, reject);
                return;
              }
              if (res.statusCode !== 200) {
                file.close();
                fs.rmSync(dest, { force: true });
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
              }
              res.pipe(file);
              file.on('finish', () => file.close(() => resolve(dest)));
            })
            .on('error', (err) => {
              file.close();
              fs.rmSync(dest, { force: true });
              reject(err);
            });
        })
        .catch(reject);
    });
  }

  // ---------------------------------------------------------------------------
  // Idempotency marker
  // ---------------------------------------------------------------------------

  /** True when a prior provision is still valid for the current bundle. */
  isProvisioned() {
    if (process.env.HALLUCINATE_FORCE_PY_PROVISION === 'true') return false;
    const venvPython = this.getVenvPython();
    if (!fs.existsSync(venvPython)) return false;
    const marker = this._readMarker();
    if (!marker) return false;
    if (marker.markerVersion !== MARKER_VERSION) return false;
    if (marker.fingerprint !== this._computeFingerprint()) return false;
    return true;
  }

  _readMarker() {
    try {
      return JSON.parse(fs.readFileSync(this.markerPath, 'utf8'));
    } catch {
      return null;
    }
  }

  _writeMarker(base) {
    const marker = {
      markerVersion: MARKER_VERSION,
      fingerprint: this._computeFingerprint(),
      basePython: base?.command || null,
      basePythonVersion: base?.version || null,
      provisionedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
    };
    try {
      fs.writeFileSync(this.markerPath, JSON.stringify(marker, null, 2));
    } catch (err) {
      this.logger.warn(`Could not write provision marker: ${err.message}`);
    }
  }

  /** Fingerprint over the requirements content so changes trigger a re-provision. */
  _computeFingerprint() {
    const hash = crypto.createHash('sha256');
    hash.update(`v${MARKER_VERSION}|${process.platform}|${process.arch}`);
    const reqFile = this._findRequirementsFile();
    if (reqFile) {
      try {
        hash.update(fs.readFileSync(reqFile));
      } catch {
        hash.update('no-req');
      }
    }
    return hash.digest('hex');
  }

  _findRequirementsFile() {
    const roots = [this.resourcesPath, this.appRoot].filter(Boolean);
    for (const root of roots) {
      for (const segments of DEFAULT_REQUIREMENT_CANDIDATES) {
        const candidate = path.join(root, ...segments);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  _run(command, args, { step = 'run', timeout = 1000 * 60 * 5 } = {}) {
    const res = spawnSync(command, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 1024 * 1024 * 64,
    });
    this._appendLog(step, command, args, res);
    return res;
  }

  _appendLog(step, command, args, res) {
    try {
      const head =
        `\n[${new Date().toISOString()}] (${step}) ${command} ${(args || []).join(' ')}\n` +
        `exit=${res.status} signal=${res.signal || ''}\n`;
      const body = `${res.stdout || ''}${res.stderr ? `\nSTDERR:\n${res.stderr}` : ''}\n`;
      fs.appendFileSync(this.logPath, head + body);
    } catch {
      /* logging is best-effort */
    }
  }

  _progress(phase, percent, message) {
    try {
      this.onProgress({ phase, percent, message });
    } catch {
      /* never let UI callbacks break provisioning */
    }
    this.logger.info(`[${percent}%] ${message}`);
  }
}

export default PythonEnvironmentManager;
