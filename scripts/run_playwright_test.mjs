#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const playwrightCli = path.join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const electronPackage = path.join(projectRoot, 'node_modules', 'electron', 'package.json');
const commandArgs = process.argv.slice(2);
const args = commandArgs.length > 0 ? commandArgs : ['test'];
const missingDisplayDiagnostic = 'missing_xvfb_for_electron_playwright';
const launchGateEvidenceTerms = [
  'Hallucinate App menus',
  'Hallucinate App MCP dashboard',
  'dashboard capability catalog',
  'backend service catalog',
  'daemon health',
  'MCP++ telemetry',
  'tools/list',
  'tools/call',
  'control_surface receipts',
  'Swissknife applications',
  'catalog normalization',
  'dashboard UI wiring',
  'mediated tool-call receipts',
  'Swissknife consumers',
  'Playwright coverage',
  'supervisor-generated follow-up subtasks',
  'launch Playwright validation gate',
];
const noDisplayLaunchGateSpecs = new Set([
  'daemon-launch-health.spec.ts',
  'mcp-feature-exposure.spec.ts',
  'mcp-dashboard-interoperability.spec.ts',
  'multimodal-control-surface.spec.ts',
]);
const specSourceDisplayPatterns = [
  '_electron:',
  'electron.launch(',
  'ElectronApplication',
];
const headlessStaticCoverageSpecs = new Set([
  'daemon-launch-health.spec.ts',
  'mcp-feature-exposure.spec.ts',
  'mcp-dashboard-interoperability.spec.ts',
  'multimodal-control-surface.spec.ts',
]);

runPlaywright(args);

function ensureE2EDependencies() {
  if (hasE2EDependencies()) {
    return;
  }

  if (process.env.HALLUCINATE_APP_E2E_NO_BOOTSTRAP === 'true') {
    console.error('Missing local E2E dependencies and bootstrap is disabled.');
    console.error('Run `npm install --package-lock=false --include=dev` from hallucinate_app.');
    process.exit(1);
  }

  console.warn('Local Playwright test dependencies are missing; bootstrapping hallucinate_app npm dependencies.');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const status = run(npm, [
    'install',
    '--package-lock=false',
    '--no-audit',
    '--no-fund',
    '--include=dev',
  ], {
    SKIP_POSTINSTALL: 'true',
    SKIP_SUBMODULE_INSTALL: 'true',
  });

  if (status !== 0) {
    process.exit(status);
  }

  if (!hasE2EDependencies()) {
    console.error('E2E dependency bootstrap completed but @playwright/test or electron is still unavailable.');
    process.exit(1);
  }
}

function hasE2EDependencies() {
  return fs.existsSync(playwrightCli) && fs.existsSync(electronPackage);
}

function runPlaywright(playwrightArgs) {
  const command = playwrightCommand(playwrightArgs);
  if (command.diagnostic) {
    console.error(`[${command.diagnostic}] ${command.message}`);
    process.exit(78);
  }

  ensureE2EDependencies();

  if (command.usesXvfb) {
    console.warn('No graphical display detected; running Hallucinate Electron Playwright tests under xvfb-run.');
  }
  if (command.headlessGate) {
    console.warn('No graphical display detected; running headless-compatible launch gate specs without Electron UI coverage.');
  }

  const status = run(command.binary, command.args, command.env || {});
  process.exit(status);
}

function playwrightCommand(playwrightArgs) {
  const baseArgs = [playwrightCli, ...playwrightArgs];
  if (!needsVirtualDisplay()) {
    return { binary: process.execPath, args: baseArgs };
  }

  if (canRunWithoutVirtualDisplay(playwrightArgs)) {
    return {
      binary: process.execPath,
      args: baseArgs,
      env: {
        HALLUCINATE_APP_E2E_HEADLESS_GATE: 'true',
      },
      headlessGate: true,
    };
  }

  if (commandExists('xvfb-run')) {
    return {
      binary: 'xvfb-run',
      args: [
        '--auto-servernum',
        '--server-args=-screen 0 1280x960x24 -nolisten tcp',
        process.execPath,
        ...baseArgs,
      ],
      usesXvfb: true,
    };
  }

  return {
    binary: process.execPath,
    args: baseArgs,
    diagnostic: missingDisplayDiagnostic,
    message: 'Hallucinate Electron Playwright tests need DISPLAY, WAYLAND_DISPLAY, or xvfb-run. This is a repairable launch-environment blocker, not a Meta glasses MCP dashboard contract failure. Install xvfb on the host or run the supervisor in an environment with a graphical display so launch validation can execute instead of burning retry-budget attempts.',
  };
}

function canRunWithoutVirtualDisplay(playwrightArgs) {
  return !selectedTestsNeedDisplay(playwrightArgs);
}

function needsVirtualDisplay() {
  if (process.env.HALLUCINATE_APP_E2E_DISABLE_XVFB === 'true') {
    return false;
  }
  return (
    process.platform === 'linux' &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY &&
    selectedTestsNeedDisplay(args)
  );
}

function selectedTestsNeedDisplay(playwrightArgs) {
  if (playwrightArgs.some((arg) => arg === '--headed' || arg === '--debug' || arg === '--ui')) {
    return true;
  }

  const specPaths = selectedSpecPaths(playwrightArgs);
  if (specPaths.length === 0) {
    return true;
  }

  if (specPaths.every((specPath) => headlessStaticCoverageSpecs.has(path.basename(specPath)))) {
    return false;
  }

  return specPaths.some(specNeedsDisplay);
}

function selectedSpecPaths(playwrightArgs) {
  return playwrightArgs
    .filter((arg) => !arg.startsWith('-') && /\.(spec|test)\.[cm]?[jt]sx?$/.test(arg))
    .map((arg) => {
      if (path.isAbsolute(arg)) {
        return arg;
      }

      const directPath = path.resolve(projectRoot, arg);
      if (fs.existsSync(directPath)) {
        return directPath;
      }

      return path.resolve(projectRoot, 'test', 'e2e', arg);
    });
}

function specNeedsDisplay(specPath) {
  if (!fs.existsSync(specPath)) {
    return true;
  }

  const source = fs.readFileSync(specPath, 'utf8');
  return specSourceDisplayPatterns.some((pattern) => source.includes(pattern));
}

function commandExists(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], {
    cwd: projectRoot,
    stdio: 'ignore',
    env: process.env,
  });
  return result.status === 0;
}

function run(command, runArgs, extraEnv = {}) {
  const result = spawnSync(command, runArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return typeof result.status === 'number' ? result.status : 1;
}
