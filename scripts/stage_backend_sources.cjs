#!/usr/bin/env node
/**
 * stage_backend_sources.cjs
 * -----------------------------------------------------------------------------
 * Ensures the three IPFS backend packages have usable Python source on disk so
 * the Electron Forge packager can bundle them (forge.config.cjs extraResource)
 * and the runtime PythonEnvironmentManager can pip-install them from local
 * source on first launch.
 *
 * The published PyPI wheels for these packages are incomplete/broken, so the
 * packaged app must ship the source trees rather than rely on PyPI.
 *
 * For each package we want source at:  hallucinate_app/<pkg>/setup.py
 * If the app's submodule dir is already populated (e.g. `git submodule update
 * --init` was run), we leave it as-is. Otherwise we stage source from the
 * parent monorepo's external/ checkout, which holds the hardened source.
 *
 * Run automatically via the Forge prePackage/generateAssets hook, and also
 * available standalone:  node scripts/stage_backend_sources.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_DIR, '..');

// All bundled backend source is written here as a freshly-cleaned copy. We
// never bundle the raw submodule checkouts directly because upstream trees
// contain dangling symlinks (e.g. ipfs_kit_py/tools/verify.py) and large
// platform-specific binaries that break the deb/rpm makers and bloat the
// installers. forge.config.cjs points extraResource at <STAGE_ROOT>/<pkg>.
const STAGE_ROOT = path.join(APP_DIR, '.staged_backend');

// destPkg (matches the Python import name / submodule dir) -> candidate sources
const PACKAGES = [
  { pkg: 'ipfs_kit_py', sources: ['ipfs_kit_py', '../external/ipfs_kit'] },
  { pkg: 'ipfs_datasets_py', sources: ['ipfs_datasets_py', '../external/ipfs_datasets'] },
  { pkg: 'ipfs_accelerate_py', sources: ['ipfs_accelerate_py', '../external/ipfs_accelerate'] },
];

const EXCLUDE_DIRS = new Set([
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  'venvs',
  'test_venv',
  'node_modules',
  '.pytest_cache',
  '.mypy_cache',
  'build',
  'dist',
  '.eggs',
  'test-results',
  'playwright-report',
  // Dev-only / bloat directories that the runtime daemons never import.
  'test',
  'tests',
  'docs',
  'doc',
  'examples',
  'benchmarks',
  'archive',
  'backup',
  'workspace',
  'artifacts',
  'htmlcov',
  '.github',
  '.idea',
  '.vscode',
  '.tools',
  // Compiled / vendored toolchain + build output dirs (platform-specific,
  // never imported by the daemons; binaries are fetched at runtime).
  'target',
  'qualcomm',
  'llvm',
]);

// Files larger than this are skipped unless they are Python source. This drops
// vendored platform-specific binaries (e.g. lotus/lassie, *.exe/*.dll, Rust
// *.rlib build artifacts) that bloat the cross-platform installers.
const MAX_NONSOURCE_FILE_BYTES = 8 * 1024 * 1024;
const SOURCE_FILE_RE = /\.(py|pyi|pyx|pxd)$/i;

// File extensions that are platform-specific build outputs we should not copy.
const EXCLUDE_FILE_RE = /\.(pyc|pyo|log|whl|tar\.gz|egg|exe|dll|dylib|rlib|rmeta)$/i;

function hasPythonPackage(dir) {
  return (
    fs.existsSync(dir) &&
    (fs.existsSync(path.join(dir, 'setup.py')) || fs.existsSync(path.join(dir, 'pyproject.toml')))
  );
}

function isExcludedDir(base) {
  if (EXCLUDE_DIRS.has(base)) return true;
  // Catch-all for backup/scratch dirs like "reorganization_backup_final".
  if (/(^|_)backup($|_)/i.test(base) || /^reorganization/i.test(base)) return true;
  return false;
}

function copyTree(src, dest, isRoot = false) {
  let stat;
  try {
    stat = fs.lstatSync(src);
  } catch {
    return; // unreadable / dangling entry
  }
  if (stat.isSymbolicLink()) {
    // Dereference symlinks so the packaged tree is self-contained and never
    // contains dangling links (which break the deb/rpm makers). Skip dangling
    // links and directory links (the latter avoids symlink loops and bloat).
    let real;
    try {
      real = fs.realpathSync(src);
    } catch {
      return; // dangling link -> drop it
    }
    let rstat;
    try {
      rstat = fs.statSync(real);
    } catch {
      return;
    }
    if (rstat.isFile() && !EXCLUDE_FILE_RE.test(real)) {
      fs.copyFileSync(real, dest);
    }
    return;
  }
  if (stat.isDirectory()) {
    const base = path.basename(src);
    if (isExcludedDir(base)) return;
    // Skip nested vendored package roots (a sub-directory that is itself a
    // Python package with its own setup.py/pyproject.toml). These are checked-out
    // submodules of the package being staged; each backend package is bundled
    // separately, so the nested copies are redundant and enormous.
    if (!isRoot && hasPythonPackage(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dest, entry));
    }
  } else if (stat.isFile()) {
    if (EXCLUDE_FILE_RE.test(src)) return;
    // Skip large non-source blobs (vendored binaries, datasets, build output).
    if (!SOURCE_FILE_RE.test(src) && stat.size > MAX_NONSOURCE_FILE_BYTES) return;
    fs.copyFileSync(src, dest);
  }
}

function resolveSource(candidates) {
  for (const c of candidates) {
    const abs = path.isAbsolute(c) ? c : path.resolve(APP_DIR, c);
    if (hasPythonPackage(abs)) return abs;
  }
  return null;
}

function main() {
  let staged = 0;
  let missing = 0;

  // Always start from a clean staging root so stale/dangling content from a
  // previous build can never leak into the packaged installers.
  fs.rmSync(STAGE_ROOT, { recursive: true, force: true });
  fs.mkdirSync(STAGE_ROOT, { recursive: true });

  for (const { pkg, sources } of PACKAGES) {
    const dest = path.join(STAGE_ROOT, pkg);

    const src = resolveSource(sources);
    if (!src) {
      console.warn(
        `[stage] ${pkg}: WARNING no source found. Checked: ${sources.join(', ')}. ` +
          `The packaged app will not include this backend. ` +
          `Run "git submodule update --init ${pkg}" or provide external source.`
      );
      missing += 1;
      continue;
    }

    console.log(`[stage] ${pkg}: staging cleaned copy from ${src} -> ${dest}`);
    copyTree(src, dest, true);

    if (!hasPythonPackage(dest)) {
      console.warn(`[stage] ${pkg}: WARNING staged copy is missing setup.py/pyproject.toml`);
    }
    staged += 1;
  }

  console.log(`[stage] done: ${staged} staged, ${missing} missing -> ${STAGE_ROOT}`);

  if (missing === PACKAGES.length) {
    console.error('[stage] ERROR: no backend sources could be staged.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, PACKAGES, hasPythonPackage, STAGE_ROOT };
