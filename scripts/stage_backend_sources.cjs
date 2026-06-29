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
  'node_modules',
  '.pytest_cache',
  '.mypy_cache',
  'build',
  'dist',
  '.eggs',
  'test-results',
  'playwright-report',
]);

function hasPythonPackage(dir) {
  return (
    fs.existsSync(dir) &&
    (fs.existsSync(path.join(dir, 'setup.py')) || fs.existsSync(path.join(dir, 'pyproject.toml')))
  );
}

function copyTree(src, dest) {
  let stat;
  try {
    stat = fs.lstatSync(src);
  } catch {
    return; // unreadable / dangling entry
  }
  if (stat.isSymbolicLink()) {
    // Preserve symlinks; skip dangling ones rather than failing the build.
    let target;
    try {
      target = fs.readlinkSync(src);
    } catch {
      return;
    }
    try {
      fs.symlinkSync(target, dest);
    } catch {
      // Fall back to copying the resolved target if it exists.
      try {
        if (fs.existsSync(src)) copyTree(fs.realpathSync(src), dest);
      } catch {
        /* skip */
      }
    }
    return;
  }
  if (stat.isDirectory()) {
    const base = path.basename(src);
    if (EXCLUDE_DIRS.has(base)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dest, entry));
    }
  } else if (stat.isFile()) {
    if (src.endsWith('.pyc')) return;
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
  let present = 0;
  let missing = 0;

  for (const { pkg, sources } of PACKAGES) {
    const dest = path.join(APP_DIR, pkg);

    // Already populated (checked-out submodule) -> nothing to do.
    if (hasPythonPackage(dest)) {
      console.log(`[stage] ${pkg}: source already present (${dest})`);
      present += 1;
      continue;
    }

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

    if (path.resolve(src) === path.resolve(dest)) {
      present += 1;
      continue;
    }

    console.log(`[stage] ${pkg}: staging from ${src} -> ${dest}`);
    copyTree(src, dest);
    staged += 1;
  }

  console.log(
    `[stage] done: ${present} already present, ${staged} staged, ${missing} missing`
  );

  if (missing === PACKAGES.length) {
    console.error('[stage] ERROR: no backend sources could be staged.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, PACKAGES, hasPythonPackage };
