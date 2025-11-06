#!/usr/bin/env node
/**
 * Build script to prepare web assets for Capacitor
 * This creates a www directory with all necessary files for mobile deployment
 */

import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const wwwDir = join(rootDir, 'www');
const srcDir = join(rootDir, 'hallucinate_app');

// Create www directory
if (!existsSync(wwwDir)) {
  mkdirSync(wwwDir, { recursive: true });
}

// Directories to copy
const dirsToCopy = [
  'assets',
  'css',
  'experiments',
  'model_collection_viewer'
];

// Files to copy from node directory
const nodeDashboardFiles = [
  join('node', 'dashboard', 'error_monitor_dashboard.html'),
  join('node', 'dashboard', 'pyarrow_error_dashboard.html')
];

console.log('Building web assets for Capacitor...');

// Copy directories recursively
function copyDir(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  
  const entries = readdirSync(src);
  
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
      console.log(`  Copied: ${srcPath.replace(rootDir, '')}`);
    }
  }
}

// Copy each directory
for (const dir of dirsToCopy) {
  const srcPath = join(srcDir, dir);
  const destPath = join(wwwDir, dir);
  
  if (existsSync(srcPath)) {
    console.log(`\nCopying ${dir}...`);
    copyDir(srcPath, destPath);
  }
}

// Copy dashboard files
console.log('\nCopying dashboard files...');
const dashboardDir = join(wwwDir, 'dashboard');
if (!existsSync(dashboardDir)) {
  mkdirSync(dashboardDir, { recursive: true });
}

for (const file of nodeDashboardFiles) {
  const srcPath = join(srcDir, file);
  const destPath = join(wwwDir, 'dashboard', file.split('/').pop());
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, destPath);
    console.log(`  Copied: ${file}`);
  }
}

// Create main index.html for mobile
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hallucinate App</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    header {
      background: rgba(0, 0, 0, 0.3);
      padding: 20px;
      text-align: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    
    .subtitle {
      font-size: 14px;
      opacity: 0.7;
    }
    
    main {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
    }
    
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .feature-card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      transition: all 0.3s ease;
      cursor: pointer;
      text-decoration: none;
      color: inherit;
      display: block;
    }
    
    .feature-card:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }
    
    .feature-card h2 {
      font-size: 18px;
      margin-bottom: 8px;
      color: #4CAF50;
    }
    
    .feature-card p {
      font-size: 14px;
      line-height: 1.5;
      opacity: 0.8;
    }
    
    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-top: 8px;
    }
    
    .status-badge.ready {
      background: rgba(76, 175, 80, 0.2);
      color: #4CAF50;
    }
    
    .status-badge.experimental {
      background: rgba(255, 152, 0, 0.2);
      color: #FF9800;
    }
  </style>
</head>
<body>
  <header>
    <h1>🎭 Hallucinate App</h1>
    <p class="subtitle">IPFS HuggingFace Bridge - Mobile Edition</p>
  </header>
  
  <main>
    <div class="feature-grid">
      <a href="experiments/webnn-developer-preview/install.html" class="feature-card">
        <h2>🧠 WebNN Developer Preview</h2>
        <p>Run ONNX models in the browser with WebNN hardware acceleration</p>
        <span class="status-badge experimental">Experimental</span>
      </a>
      
      <a href="model_collection_viewer/index.html" class="feature-card">
        <h2>📊 Model Collection Viewer</h2>
        <p>Browse and explore HuggingFace model collections</p>
        <span class="status-badge ready">Ready</span>
      </a>
      
      <a href="experiments/gradio_lite/index.html" class="feature-card">
        <h2>🎨 Gradio Lite</h2>
        <p>Interactive ML demos powered by Gradio in the browser</p>
        <span class="status-badge experimental">Experimental</span>
      </a>
      
      <a href="experiments/jupyter_lite/index.html" class="feature-card">
        <h2>📓 Jupyter Lite</h2>
        <p>Run Jupyter notebooks directly in your browser</p>
        <span class="status-badge experimental">Experimental</span>
      </a>
      
      <a href="experiments/st_lite/index.html" class="feature-card">
        <h2>📈 Streamlit Lite</h2>
        <p>Build and run Streamlit apps in the browser</p>
        <span class="status-badge experimental">Experimental</span>
      </a>
      
      <a href="dashboard/error_monitor_dashboard.html" class="feature-card">
        <h2>🔍 Error Monitor</h2>
        <p>Monitor and debug application errors</p>
        <span class="status-badge ready">Ready</span>
      </a>
      
      <a href="dashboard/pyarrow_error_dashboard.html" class="feature-card">
        <h2>🏹 PyArrow Dashboard</h2>
        <p>PyArrow data processing and error monitoring</p>
        <span class="status-badge ready">Ready</span>
      </a>
    </div>
  </main>
  
  <script>
    // Check for WebGPU support
    if ('gpu' in navigator) {
      console.log('✅ WebGPU is available on this device');
    } else {
      console.log('⚠️ WebGPU is not available on this device');
    }
    
    // Check for WebNN support
    if ('ml' in navigator) {
      console.log('✅ WebNN is available on this device');
    } else {
      console.log('⚠️ WebNN is not available on this device');
    }
  </script>
</body>
</html>
`;

writeFileSync(join(wwwDir, 'index.html'), indexHtml);
console.log('\n✓ Created index.html');

console.log('\n✅ Web build complete! Output directory: www/');
console.log('   You can now run: npm run cap:sync');
