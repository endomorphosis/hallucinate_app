/**
 * PythonEnvironmentManager Test
 *
 * Verifies the runtime Python bootstrap that makes the packaged app work out
 * of the box: base interpreter resolution, venv creation, requirements install,
 * idempotency (fingerprint cache), and re-provision on requirements change.
 *
 * Uses an EMPTY requirements file so it exercises the full provisioning
 * mechanism without any network access or heavyweight installs.
 */

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import PythonEnvironmentManager from '../../hallucinate_app/node/python_environment_manager.js';

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`\u2713 ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`\u2717 ${name}\n   ${err.message}`);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`\u2713 ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`\u2717 ${name}\n   ${err.message}`);
  }
}

function makeTempAppRoot(reqContent) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'halluc-pyenv-root-'));
  fs.mkdirSync(path.join(root, 'python'), { recursive: true });
  fs.writeFileSync(path.join(root, 'python', 'requirements-bundled.txt'), reqContent);
  return root;
}

function makeTempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'halluc-pyenv-data-'));
}

function hasSystemPython() {
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return true;
  }
  return false;
}

console.log('Testing PythonEnvironmentManager...\n');

const systemPython = hasSystemPython();

// --- Pure-logic tests (no Python required) ---------------------------------

await checkAsync('resolveBasePython returns a usable interpreter when system python exists', async () => {
  if (!systemPython) {
    console.log('   (skipped: no system python available)');
    return;
  }
  const mgr = new PythonEnvironmentManager({
    userDataDir: makeTempUserData(),
    appRoot: makeTempAppRoot('# empty\n'),
    allowDownload: false,
  });
  const base = await mgr.resolveBasePython();
  assert.ok(base && base.command, 'expected a base python to be resolved');
  assert.ok(/^\d+\.\d+/.test(base.version), `expected version string, got ${base?.version}`);
});

check('getVenvPython path is platform-appropriate', () => {
  const mgr = new PythonEnvironmentManager({ userDataDir: makeTempUserData(), appRoot: makeTempAppRoot('') });
  const p = mgr.getVenvPython();
  if (process.platform === 'win32') {
    assert.ok(p.endsWith(path.join('Scripts', 'python.exe')), p);
  } else {
    assert.ok(p.endsWith(path.join('bin', 'python')), p);
  }
});

check('fingerprint changes when requirements change', () => {
  const root = makeTempAppRoot('alpha\n');
  const mgr = new PythonEnvironmentManager({ userDataDir: makeTempUserData(), appRoot: root });
  const fp1 = mgr._computeFingerprint();
  fs.writeFileSync(path.join(root, 'python', 'requirements-bundled.txt'), 'beta\n');
  const fp2 = mgr._computeFingerprint();
  assert.notStrictEqual(fp1, fp2, 'fingerprint should change with requirements');
});

check('_findRequirementsFile prefers the bundled requirements', () => {
  const root = makeTempAppRoot('# bundled\n');
  fs.writeFileSync(path.join(root, 'python', 'requirements.txt'), '# legacy\n');
  const mgr = new PythonEnvironmentManager({ userDataDir: makeTempUserData(), appRoot: root });
  assert.ok(mgr._findRequirementsFile().endsWith('requirements-bundled.txt'));
});

check('isProvisioned is false before provisioning', () => {
  const mgr = new PythonEnvironmentManager({ userDataDir: makeTempUserData(), appRoot: makeTempAppRoot('') });
  assert.strictEqual(mgr.isProvisioned(), false);
});

check('_parseRequirements strips comments/blank/option lines', () => {
  const root = makeTempAppRoot('# header\nfastapi>=0.100.0  # web\n\n-r other.txt\nuvicorn[standard]>=0.23.0\n');
  const mgr = new PythonEnvironmentManager({ userDataDir: makeTempUserData(), appRoot: root });
  const specs = mgr._parseRequirements(mgr._findRequirementsFile());
  assert.deepStrictEqual(specs, ['fastapi>=0.100.0', 'uvicorn[standard]>=0.23.0']);
});

check('_isCoreRequirement recognizes core vs optional packages', () => {
  const mgr = new PythonEnvironmentManager({ userDataDir: makeTempUserData(), appRoot: makeTempAppRoot('') });
  assert.strictEqual(mgr._isCoreRequirement('fastapi>=0.100.0'), true);
  assert.strictEqual(mgr._isCoreRequirement('uvicorn[standard]>=0.23.0'), true);
  assert.strictEqual(mgr._isCoreRequirement('PyJWT>=2.8.0'), true);
  assert.strictEqual(mgr._isCoreRequirement('rich>=13.4.1'), false);
  assert.strictEqual(mgr._isCoreRequirement('structlog>=23.1.0'), false);
});

// --- Full provisioning lifecycle (requires system python; empty deps) ------

if (!systemPython) {
  console.log('\n(Provisioning lifecycle tests skipped: no system python)\n');
} else {
  const userData = makeTempUserData();
  const appRoot = makeTempAppRoot('# no dependencies for the test\n');
  const mgr = new PythonEnvironmentManager({ userDataDir: userData, appRoot, allowDownload: false });

  const firstResult = await mgr.ensureEnvironment();

  check('fresh provision succeeded with a real venv python', () => {
    assert.strictEqual(firstResult.provisioned, true, `error: ${firstResult.error}`);
    assert.strictEqual(firstResult.fromCache, false);
    assert.ok(firstResult.pythonPath && fs.existsSync(firstResult.pythonPath), 'venv python should exist');
  });

  check('provisioned venv python actually runs', () => {
    if (!firstResult.pythonPath) throw new Error('no python path');
    const r = spawnSync(firstResult.pythonPath, ['-c', 'print(1+1)'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout.trim(), '2');
  });

  check('marker is written and isProvisioned is now true', () => {
    assert.ok(fs.existsSync(mgr.markerPath), 'marker should exist');
    assert.strictEqual(mgr.isProvisioned(), true);
  });

  const secondResult = await mgr.ensureEnvironment();
  check('second ensureEnvironment uses the cache (fast path)', () => {
    assert.strictEqual(secondResult.provisioned, true);
    assert.strictEqual(secondResult.fromCache, true);
    assert.strictEqual(secondResult.pythonPath, firstResult.pythonPath);
  });

  // Change requirements -> fingerprint changes -> re-provision (not cached).
  fs.writeFileSync(path.join(appRoot, 'python', 'requirements-bundled.txt'), '# changed deps\n');
  const mgr2 = new PythonEnvironmentManager({ userDataDir: userData, appRoot, allowDownload: false });
  check('requirements change invalidates the cache', () => {
    assert.strictEqual(mgr2.isProvisioned(), false);
  });
  const thirdResult = await mgr2.ensureEnvironment();
  check('re-provision after requirements change is not from cache', () => {
    assert.strictEqual(thirdResult.provisioned, true, `error: ${thirdResult.error}`);
    assert.strictEqual(thirdResult.fromCache, false);
  });
}

console.log('');
if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log('All PythonEnvironmentManager tests passed');
}
