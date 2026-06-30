#!/usr/bin/env node
/**
 * Build script to prepare web assets for Capacitor (mobile).
 *
 * Produces a self-contained `www/` that mirrors the desktop feature surface:
 *   - The SwissKnife virtual desktop (swissknife/web/*) at the app root.
 *   - The 14 backend feature dashboards (hallucinate_app/node/views/* plus
 *     their hallucinate_app/node/dashboard/* assets), which drive
 *     ipfs_kit_py / ipfs_datasets_py / ipfs_accelerate_py.
 *   - The browser JS MCP SDK (ipfs_kit_py/.../mcp_server/js_sdk).
 *   - The experiments + model collection viewer.
 *   - A mobile launcher (index.html), a backend Settings page, and the mobile
 *     bridge that reroutes the dashboards' localhost backend calls to a
 *     user-configured remote MCP++ server.
 */

import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const wwwDir = join(rootDir, 'www');
const srcDir = join(rootDir, 'hallucinate_app');
const nodeDir = join(srcDir, 'node');
const swissWebDir = join(rootDir, 'swissknife', 'web');
const mobileSrcDir = join(__dirname, 'mobile');
const jsSdkDir = join(rootDir, 'ipfs_kit_py', 'ipfs_kit_py', 'mcp_server', 'js_sdk');

const BRIDGE_SRC = '/mobile/mobile_bridge.js';

console.log('Building web assets for Capacitor...');

if (!existsSync(wwwDir)) {
  mkdirSync(wwwDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function copyDir(src, dest) {
  if (!existsSync(src)) return;
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function listHtml(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.html')).map((f) => join(dir, f));
}

/**
 * Make a bundled HTML page work on mobile:
 *   1. Inject the mobile bridge as the first script in <head> (idempotent).
 *   2. Relax any restrictive CSP connect-src/frame-src so the bridge can reach
 *      a remote https/wss backend (dashboards otherwise allow only localhost).
 */
function prepareHtml(htmlFile) {
  let html;
  try {
    html = readFileSync(htmlFile, 'utf8');
  } catch (e) {
    return;
  }
  let changed = false;

  // (2) Relax CSP connect-src / frame-src for the configurable remote backend.
  html = html.replace(/connect-src ([^;"]*)/gi, (m, val) => {
    let out = val.trim();
    let add = false;
    if (!/(^|\s)https:(\s|$)/.test(out)) { out += ' https:'; add = true; }
    if (!/(^|\s)wss:(\s|$)/.test(out)) { out += ' wss:'; add = true; }
    if (!add) return m;
    changed = true;
    return 'connect-src ' + out;
  });
  html = html.replace(/frame-src ([^;"]*)/gi, (m, val) => {
    let out = val.trim();
    if (/(^|\s)https:(\s|$)/.test(out)) return m;
    changed = true;
    return 'frame-src ' + out + ' https:';
  });

  // (1) Inject the bridge script once, as early as possible in <head>.
  if (html.indexOf(BRIDGE_SRC) === -1) {
    const tag = `\n  <script src="${BRIDGE_SRC}"></script>`;
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/(<head[^>]*>)/i, `$1${tag}`);
      changed = true;
    } else if (/<html[^>]*>/i.test(html)) {
      html = html.replace(/(<html[^>]*>)/i, `$1<head>${tag}</head>`);
      changed = true;
    }
  }

  if (changed) writeFileSync(htmlFile, html);
}

function prepareHtmlInDir(dir) {
  for (const f of listHtml(dir)) prepareHtml(f);
}

// ---------------------------------------------------------------------------
// 1. SwissKnife virtual desktop -> www root (its absolute /css /js /assets
//    paths require it to live at the root). Keep its index.html as desktop.html
//    so our mobile launcher can own index.html.
// ---------------------------------------------------------------------------
let hasSwissKnife = false;
if (existsSync(swissWebDir)) {
  console.log('\nCopying SwissKnife web desktop...');
  copyDir(swissWebDir, wwwDir);
  const skIndex = join(wwwDir, 'index.html');
  const skDesktop = join(wwwDir, 'desktop.html');
  if (existsSync(skIndex)) {
    copyFileSync(skIndex, skDesktop); // desktop.html is the SwissKnife entry
  }
  prepareHtml(skDesktop);
  hasSwissKnife = true;
} else {
  console.log('\n(SwissKnife submodule not present — skipping desktop UI; init the `swissknife` submodule to include it.)');
}

// ---------------------------------------------------------------------------
// 2. Feature dashboards: node/views + node/dashboard (preserve the relative
//    layout the views expect, e.g. ../dashboard/*.css and components/*.js).
// ---------------------------------------------------------------------------
console.log('Copying feature dashboards (node/views + node/dashboard)...');
copyDir(join(nodeDir, 'views'), join(wwwDir, 'node', 'views'));
copyDir(join(nodeDir, 'dashboard'), join(wwwDir, 'node', 'dashboard'));
prepareHtmlInDir(join(wwwDir, 'node', 'views'));

// Backwards-compatible flat copies used by the old launcher links.
const flatDashboardDir = join(wwwDir, 'dashboard');
mkdirSync(flatDashboardDir, { recursive: true });
for (const f of ['error_monitor_dashboard.html', 'pyarrow_error_dashboard.html']) {
  const s = join(nodeDir, 'dashboard', f);
  if (existsSync(s)) copyFileSync(s, join(flatDashboardDir, f));
}

// ---------------------------------------------------------------------------
// 3. Experiments + model collection viewer.
// ---------------------------------------------------------------------------
for (const dir of ['experiments', 'model_collection_viewer']) {
  const s = join(srcDir, dir);
  if (existsSync(s)) {
    console.log(`Copying ${dir}...`);
    copyDir(s, join(wwwDir, dir));
  }
}

// ---------------------------------------------------------------------------
// 4. Mobile bridge, settings page, and the browser JS MCP SDK.
// ---------------------------------------------------------------------------
console.log('Copying mobile bridge + JS MCP SDK...');
const mobileOut = join(wwwDir, 'mobile');
mkdirSync(mobileOut, { recursive: true });
copyFileSync(join(mobileSrcDir, 'mobile_bridge.js'), join(mobileOut, 'mobile_bridge.js'));
copyFileSync(join(mobileSrcDir, 'settings.html'), join(wwwDir, 'settings.html'));
if (existsSync(jsSdkDir)) {
  for (const f of ['ipfs-kit-mcp-sdk.js', 'ipfs-kit-mcp-sdk.ts', 'tools-manifest.json']) {
    const s = join(jsSdkDir, f);
    if (existsSync(s)) copyFileSync(s, join(mobileOut, f));
  }
} else {
  console.log('(ipfs_kit_py js_sdk not present — init the ipfs_kit_py submodule to bundle the JS MCP SDK.)');
}

// ---------------------------------------------------------------------------
// 5. Mobile launcher index.html.
// ---------------------------------------------------------------------------
const dashboards = [
  { file: 'ipfs_kit_dashboard.html', icon: '🧰', title: 'IPFS Kit', desc: 'Storage, pins, CIDs and MCP++ tools (ipfs_kit_py)' },
  { file: 'ipfs_datasets_dashboard.html', icon: '📚', title: 'IPFS Datasets', desc: 'Dataset search, load and management (ipfs_datasets_py)' },
  { file: 'ipfs_accelerate_dashboard.html', icon: '⚡', title: 'IPFS Accelerate', desc: 'Hardware profiles and model acceleration (ipfs_accelerate_py)' },
  { file: 'daemon_manager.html', icon: '🛰️', title: 'Daemon Manager', desc: 'Start/stop and monitor backend MCP daemons' },
  { file: 'benchmark_dashboard.html', icon: '📊', title: 'Benchmarks', desc: 'Run and review model/backend benchmarks' },
  { file: 'model_tester.html', icon: '🧪', title: 'Model Tester', desc: 'Test inference across providers and models' },
  { file: 'pyarrow_content_index_dashboard.html', icon: '🏹', title: 'Content Index', desc: 'PyArrow content index and search' },
  { file: 'auth_dashboard.html', icon: '🔐', title: 'Auth / UCAN', desc: 'Keys, UCAN capabilities and auth' },
  { file: 'database_backup_dashboard.html', icon: '💾', title: 'Database Backup', desc: 'Backup, sync and restore datastores' },
  { file: 'usage_dashboard.html', icon: '📈', title: 'Usage', desc: 'Usage metrics and telemetry' },
  { file: 'security_test_dashboard.html', icon: '🛡️', title: 'Security Tests', desc: 'Security test surface' },
];

function card(href, icon, title, desc, badge) {
  const cls = badge === 'Experimental' ? 'experimental' : 'ready';
  return `      <a href="${href}" class="feature-card">
        <h2>${icon} ${title}</h2>
        <p>${desc}</p>
        <span class="status-badge ${cls}">${badge}</span>
      </a>`;
}

const cards = [];
if (hasSwissKnife) {
  cards.push(card('desktop.html', '🖥️', 'SwissKnife Virtual Desktop', 'Full SwissKnife desktop environment', 'Ready'));
}
cards.push(card('settings.html', '⚙️', 'Backend Settings', 'Connect to a remote MCP++ / IPFS backend', 'Ready'));
for (const d of dashboards) {
  if (existsSync(join(wwwDir, 'node', 'views', d.file))) {
    cards.push(card(`node/views/${d.file}`, d.icon, d.title, d.desc, 'Ready'));
  }
}
if (existsSync(join(wwwDir, 'model_collection_viewer', 'index.html'))) {
  cards.push(card('model_collection_viewer/index.html', '🗂️', 'Model Collection Viewer', 'Browse HuggingFace model collections', 'Ready'));
}
if (existsSync(join(wwwDir, 'experiments', 'webnn-developer-preview', 'install.html'))) {
  cards.push(card('experiments/webnn-developer-preview/install.html', '🧠', 'WebNN Developer Preview', 'Run ONNX models with WebNN acceleration', 'Experimental'));
}
for (const ex of [
  ['experiments/gradio_lite/index.html', '🎨', 'Gradio Lite', 'Interactive ML demos in the browser'],
  ['experiments/jupyter_lite/index.html', '📓', 'Jupyter Lite', 'Run notebooks in the browser'],
  ['experiments/st_lite/index.html', '📈', 'Streamlit Lite', 'Streamlit apps in the browser'],
]) {
  if (existsSync(join(wwwDir, ex[0]))) cards.push(card(ex[0], ex[1], ex[2], ex[3] || '', 'Experimental'));
}
cards.push(card('dashboard/error_monitor_dashboard.html', '🔍', 'Error Monitor', 'Monitor and debug application errors', 'Ready'));

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hallucinate App</title>
  <script src="${BRIDGE_SRC}"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); color: #fff;
      min-height: 100vh; display: flex; flex-direction: column; }
    header { background: rgba(0,0,0,.3); padding: 20px; text-align: center; border-bottom: 1px solid rgba(255,255,255,.1); }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
    .subtitle { font-size: 14px; opacity: .7; }
    main { flex: 1; padding: 20px; overflow-y: auto; }
    .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; max-width: 1200px; margin: 0 auto; }
    .feature-card { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 12px;
      padding: 20px; transition: all .3s ease; cursor: pointer; text-decoration: none; color: inherit; display: block; }
    .feature-card:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.2); transform: translateY(-2px); }
    .feature-card h2 { font-size: 18px; margin-bottom: 8px; color: #4CAF50; }
    .feature-card p { font-size: 14px; line-height: 1.5; opacity: .8; }
    .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-top: 8px; }
    .status-badge.ready { background: rgba(76,175,80,.2); color: #4CAF50; }
    .status-badge.experimental { background: rgba(255,152,0,.2); color: #FF9800; }
  </style>
</head>
<body>
  <header>
    <h1>🎭 Hallucinate App</h1>
    <p class="subtitle">SwissKnife + IPFS Kit / Datasets / Accelerate — Mobile Edition</p>
  </header>
  <main>
    <div class="feature-grid">
${cards.join('\n')}
    </div>
  </main>
  <script>
    if ('gpu' in navigator) console.log('✅ WebGPU available'); else console.log('⚠️ WebGPU unavailable');
    if ('ml' in navigator) console.log('✅ WebNN available'); else console.log('⚠️ WebNN unavailable');
  </script>
</body>
</html>
`;

writeFileSync(join(wwwDir, 'index.html'), indexHtml);

console.log('\n✅ Web build complete! Output directory: www/');
console.log(`   SwissKnife desktop: ${hasSwissKnife ? 'included (desktop.html)' : 'NOT included'}`);
console.log(`   Feature dashboards: ${listHtml(join(wwwDir, 'node', 'views')).length} pages`);
console.log('   You can now run: npm run cap:sync');
