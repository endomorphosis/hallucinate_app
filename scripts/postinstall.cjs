#!/usr/bin/env node
/**
 * Smart postinstall script for hallucinate_app
 * 
 * This script intelligently determines if submodule dependencies need to be installed
 * and only runs the installation when necessary.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check if we should skip postinstall
if (process.env.SKIP_SUBMODULE_INSTALL === 'true' || process.env.SKIP_POSTINSTALL === 'true') {
  console.log('Skipping submodule dependency installation (SKIP_SUBMODULE_INSTALL=true)');
  process.exit(0);
}

// Check if we're in CI environment and should skip
if (process.env.CI === 'true' && process.env.INSTALL_SUBMODULES !== 'true') {
  console.log('Skipping submodule dependency installation in CI (set INSTALL_SUBMODULES=true to enable)');
  process.exit(0);
}

const rootDir = path.join(__dirname, '..');
const baselinePath = path.join(rootDir, 'config', 'submodule_integration_baseline.json');

/**
 * Check if submodules are initialized
 */
function areSubmodulesInitialized() {
  const submodules = ['ipfs_accelerate_py', 'ipfs_datasets_py', 'ipfs_kit_py', 'swissknife'];
  
  for (const submodule of submodules) {
    const submodulePath = path.join(rootDir, submodule);
    
    // Check if directory exists and has content (more than just .git file)
    if (!fs.existsSync(submodulePath)) {
      return false;
    }
    
    const files = fs.readdirSync(submodulePath);
    // If only .git exists, submodule is not initialized
    if (files.length <= 1) {
      return false;
    }
  }
  
  return true;
}

function checkSubmoduleBaseline() {
  if (!fs.existsSync(baselinePath)) {
    return;
  }

  try {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')).baseline || {};
    const drifted = [];

    for (const [submodule, config] of Object.entries(baseline)) {
      const submodulePath = path.join(rootDir, submodule);
      if (!fs.existsSync(submodulePath)) continue;
      const resolved = path.resolve(submodulePath);
      if (!resolved.startsWith(path.resolve(rootDir) + path.sep)) continue;
      try {
        const sha = execSync('git rev-parse HEAD', { cwd: submodulePath, stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim();
        if (config.currentSha && sha !== config.currentSha) {
          drifted.push({ submodule, sha, expected: config.currentSha });
        }
      } catch {
        // ignore submodule rev-parse failures
      }
    }

    if (drifted.length) {
      console.warn('\n⚠ Submodule baseline drift detected:');
      for (const item of drifted) {
        console.warn(`  - ${item.submodule}: ${item.sha} (expected ${item.expected})`);
      }
      console.warn('Run: python scripts/manage_submodule_baseline.py apply-baseline\n');
    }
  } catch {
    // ignore baseline parse errors in postinstall
  }
}

/**
 * Check if we're doing a fresh install (node_modules doesn't exist or is empty)
 */
function isFreshInstall() {
  const nodeModulesPath = path.join(rootDir, 'node_modules');
  return !fs.existsSync(nodeModulesPath) || fs.readdirSync(nodeModulesPath).length === 0;
}

/**
 * Run the installation script
 */
function runInstallScript() {
  console.log('\n=== Installing submodule dependencies ===');
  console.log('This may take a few minutes...\n');
  
  // Try bash script first, fall back to python
  const bashScript = path.join(rootDir, 'scripts', 'install_submodule_deps.sh');
  const pythonScript = path.join(rootDir, 'scripts', 'install_submodule_deps.py');
  
  let command, args;
  
  if (process.platform === 'win32') {
    // On Windows, prefer Python
    command = 'python';
    args = [pythonScript];
  } else {
    // On Unix-like systems, prefer bash
    command = 'bash';
    args = [bashScript];
  }
  
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true
    });
    
    proc.on('exit', (code) => {
      if (code === 0) {
        console.log('\n✓ Submodule dependencies installed successfully!\n');
        resolve();
      } else {
        // Try the alternative script
        console.log(`\nTrying alternative installation method...\n`);
        
        const altCommand = process.platform === 'win32' ? 'bash' : 'python';
        const altScript = process.platform === 'win32' ? bashScript : pythonScript;
        
        const altProc = spawn(altCommand, [altScript], {
          cwd: rootDir,
          stdio: 'inherit',
          shell: true
        });
        
        altProc.on('exit', (altCode) => {
          if (altCode === 0) {
            console.log('\n✓ Submodule dependencies installed successfully!\n');
            resolve();
          } else {
            console.warn('\n⚠ Warning: Failed to install submodule dependencies.');
            console.warn('You can install them manually by running:');
            console.warn('  make install-submodule-deps');
            console.warn('or');
            console.warn('  npm run install:submodules\n');
            resolve(); // Don't fail the npm install
          }
        });
        
        altProc.on('error', (err) => {
          console.warn(`\n⚠ Warning: ${err.message}`);
          console.warn('You can install submodule dependencies manually with: make install-submodule-deps\n');
          resolve(); // Don't fail the npm install
        });
      }
    });
    
    proc.on('error', (err) => {
      console.log(`\nTrying alternative installation method...\n`);
      
      const altCommand = process.platform === 'win32' ? 'bash' : 'python';
      const altScript = process.platform === 'win32' ? bashScript : pythonScript;
      
      const altProc = spawn(altCommand, [altScript], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: true
      });
      
      altProc.on('exit', (altCode) => {
        if (altCode === 0) {
          console.log('\n✓ Submodule dependencies installed successfully!\n');
          resolve();
        } else {
          console.warn('\n⚠ Warning: Failed to install submodule dependencies.');
          console.warn('You can install them manually by running:');
          console.warn('  make install-submodule-deps\n');
          resolve(); // Don't fail the npm install
        }
      });
      
      altProc.on('error', (err) => {
        console.warn(`\n⚠ Warning: ${err.message}`);
        console.warn('You can install submodule dependencies manually with: make install-submodule-deps\n');
        resolve(); // Don't fail the npm install
      });
    });
  });
}

// Main logic
async function main() {
  // Check if this is a fresh install or if submodules need initialization
  const freshInstall = isFreshInstall();
  const submodulesInitialized = areSubmodulesInitialized();
  
  if (freshInstall) {
    console.log('Fresh install detected, installing submodule dependencies...');
    await runInstallScript();
  } else if (!submodulesInitialized) {
    console.log('Submodules not initialized, installing submodule dependencies...');
    await runInstallScript();
  } else {
    console.log('Submodule dependencies already installed. Skipping...');
    console.log('(Run "npm run install:submodules" to reinstall if needed)');
  }

  checkSubmoduleBaseline();
}

main().catch((err) => {
  console.error('Error in postinstall script:', err);
  process.exit(0); // Don't fail npm install
});
