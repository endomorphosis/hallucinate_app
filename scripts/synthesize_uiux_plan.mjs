#!/usr/bin/env node
/**
 * UI/UX Improvement Plan Synthesizer
 *
 * Processes the comprehensive screenshot audit results and generates
 * an actionable improvement plan for the hallucinate_app.
 *
 * Usage:
 *   node scripts/synthesize_uiux_plan.mjs [audit-dir]
 *
 * Input:
 *   - test-results/screenshots/comprehensive-audit/audit-report.json
 *   - test-results/screenshots/comprehensive-audit/mcp-tool-coverage-matrix.json
 *   - test-results/screenshots/comprehensive-audit/analysis--*.json
 *
 * Output:
 *   - test-results/uiux-improvement-plan.md
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const DEFAULT_AUDIT_DIR = path.join(PROJECT_ROOT, 'test-results', 'screenshots', 'comprehensive-audit');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'test-results', 'uiux-improvement-plan.md');

async function loadJSON(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function collectAnalysisFiles(auditDir) {
  const files = await fs.readdir(auditDir).catch(() => []);
  const analyses = {};
  for (const file of files) {
    if (file.startsWith('analysis--') && file.endsWith('.json')) {
      const section = file.replace('analysis--', '').replace('.json', '');
      analyses[section] = await loadJSON(path.join(auditDir, file));
    }
  }
  return analyses;
}

function generateMCPToolCoverageSection(matrix) {
  if (!matrix) return '> No MCP tool coverage matrix found. Run the audit first.\n';

  let md = '';
  const exposed = [];
  const missing = [];

  for (const [key, info] of Object.entries(matrix.dashboard_coverage || {})) {
    if (info.exposed) {
      exposed.push(key);
    } else {
      missing.push({ tool: key, surface: info.surface });
    }
  }

  const total = exposed.length + missing.length;
  const coverage = total > 0 ? Math.round((exposed.length / total) * 100) : 0;

  md += `### Coverage: ${coverage}% (${exposed.length}/${total} tools exposed)\n\n`;

  if (missing.length > 0) {
    md += '#### Missing Tool Exposure\n\n';
    md += '| Tool | Expected Surface | Priority |\n';
    md += '|------|-----------------|----------|\n';
    for (const { tool, surface } of missing) {
      const priority = tool.includes('status') || tool.includes('health') ? 'P0' :
        tool.includes('dispatch') || tool.includes('list') ? 'P1' : 'P2';
      md += `| \`${tool}\` | ${surface} | ${priority} |\n`;
    }
    md += '\n';
  }

  if (matrix.recommendations?.length > 0) {
    md += '#### Recommendations\n\n';
    for (const rec of matrix.recommendations.slice(0, 20)) {
      md += `- ${rec}\n`;
    }
    md += '\n';
  }

  return md;
}

function generateDashboardAnalysisSection(analyses) {
  if (Object.keys(analyses).length === 0) {
    return '> No dashboard analyses found. Run the audit first.\n';
  }

  let md = '';

  for (const [section, analysis] of Object.entries(analyses)) {
    if (!analysis) continue;

    md += `#### ${section}\n\n`;
    md += `- **Title:** ${analysis.title || 'Untitled'}\n`;
    md += `- **Elements:** ${analysis.total_elements || 0}\n`;
    md += `- **Forms:** ${analysis.forms || 0}\n`;
    md += `- **Buttons:** ${(analysis.buttons || []).length}\n`;
    md += `- **Inputs:** ${(analysis.inputs || []).length}\n`;

    if (analysis.headings?.length > 0) {
      md += `- **Headings:** ${analysis.headings.join(', ')}\n`;
    }

    // Identify gaps
    const gaps = [];
    if ((analysis.buttons || []).length === 0) {
      gaps.push('No interactive buttons found');
    }
    if ((analysis.inputs || []).length === 0) {
      gaps.push('No input fields - cannot invoke operations');
    }
    if ((analysis.forms || 0) === 0) {
      gaps.push('No forms - tool parameters cannot be submitted');
    }

    if (gaps.length > 0) {
      md += `- **Gaps:** ${gaps.join('; ')}\n`;
    }
    md += '\n';
  }

  return md;
}

function generateIssuesSection(auditReport) {
  if (!auditReport) return '> No audit report found. Run the audit first.\n';

  let md = '';
  const allIssues = [];

  for (const [section, entries] of Object.entries(auditReport.sections || {})) {
    for (const entry of entries) {
      for (const issue of entry.issues || []) {
        allIssues.push({ section, issue, screenshot: entry.name });
      }
    }
  }

  if (allIssues.length === 0) {
    md += '> No issues detected during audit.\n';
    return md;
  }

  md += `### ${allIssues.length} Issues Found\n\n`;
  md += '| # | Section | Issue | Screenshot |\n';
  md += '|---|---------|-------|------------|\n';
  for (let i = 0; i < allIssues.length; i++) {
    const { section, issue, screenshot } = allIssues[i];
    md += `| ${i + 1} | ${section} | ${issue} | ${screenshot} |\n`;
  }
  md += '\n';

  return md;
}

function generateImprovementPlan(auditReport, matrix, analyses) {
  // Synthesize specific actionable improvements
  const improvements = [];

  // Priority 0: Critical - Backend connectivity visible to users
  improvements.push({
    priority: 'P0',
    category: 'Backend Connectivity',
    title: 'Add unified health status bar to all dashboards',
    description: 'Every dashboard should show real-time connectivity status for all 3 MCP servers (ipfs-kit:8014, ipfs-datasets:3002, ipfs-accelerate:3003) with color-coded indicators.',
    implementation: 'Create a shared `<health-status-bar>` web component that polls /api/mcp/status on each server. Include it at the top of every dashboard HTML file.',
    effort: 'Medium',
  });

  improvements.push({
    priority: 'P0',
    category: 'MCP Tool Testing',
    title: 'Create universal MCP tool invocation panel',
    description: 'A reusable panel that lets users pick any registered tool, fill in arguments via auto-generated form, invoke it, and see the JSON response + receipt.',
    implementation: 'Build a `ToolInvocationPanel` class that reads tools/list from each daemon, generates input forms from inputSchema, and displays tools/call results with timing.',
    effort: 'High',
  });

  improvements.push({
    priority: 'P0',
    category: 'IPFS Kit',
    title: 'Add content upload & retrieval UI to IPFS Kit dashboard',
    description: 'Users need file drag-and-drop upload (ipfs_add), CID input for retrieval (ipfs_cat), and a pin management panel (ipfs_pin_add/rm/ls).',
    implementation: 'Add three card sections: Upload Card (file input + drop zone -> POST /mcp/tools/call {name:"ipfs_add"}), Retrieve Card (CID input -> ipfs_cat), Pin Card (CID list + pin/unpin buttons).',
    effort: 'Medium',
  });

  // Priority 1: Important - Feature exposure
  improvements.push({
    priority: 'P1',
    category: 'IPFS Datasets',
    title: 'Add dataset search and embedding generation UI',
    description: 'Expose dataset browsing (tools_dispatch/load_dataset), embedding generation (tools_dispatch/embed_texts), and background task monitoring.',
    implementation: 'Add search bar that calls datasets_list, results grid with "Embed" button per dataset, and a job status ticker at the bottom showing background tasks.',
    effort: 'High',
  });

  improvements.push({
    priority: 'P1',
    category: 'IPFS Accelerate',
    title: 'Add hardware capabilities display and inference form',
    description: 'Show detected hardware (WebNN, WebGPU, CUDA) prominently, and provide a text generation form that calls run_inference_job.',
    implementation: 'Split dashboard into two columns: left = hardware cards (from hardware_profile tool), right = inference form (model selector, prompt textarea, submit -> tools_dispatch/workflow).',
    effort: 'Medium',
  });

  improvements.push({
    priority: 'P1',
    category: 'Navigation',
    title: 'Add breadcrumb navigation and sidebar',
    description: 'Users lose context when navigating between dashboards. Add a persistent sidebar showing all available surfaces and current location.',
    implementation: 'Create a shared sidebar.html partial with links to all dashboards, health indicators per daemon, and keyboard shortcut hints.',
    effort: 'Medium',
  });

  improvements.push({
    priority: 'P1',
    category: 'Control Surface',
    title: 'Surface MCP invocation receipts in dashboard',
    description: 'Every MCP tool call should show its mediation receipt (receipt_cid, policy_decision, timing). This is required by the control surface contract.',
    implementation: 'After each tools/call response, render a receipt card showing: tool_name, upstream_status, receipt_cid, latency_ms, and policy_decision_id.',
    effort: 'Medium',
  });

  // Priority 2: Nice to have
  improvements.push({
    priority: 'P2',
    category: 'Telemetry',
    title: 'Add real-time telemetry charts for daemon performance',
    description: 'Show live charts of request latency, memory usage, and GPU utilization across the three MCP servers.',
    implementation: 'Use lightweight inline SVG sparklines polling /telemetry every 5s. No heavy charting library needed.',
    effort: 'Low',
  });

  improvements.push({
    priority: 'P2',
    category: 'Accessibility',
    title: 'Add visible focus indicators and ARIA labels',
    description: 'Keyboard navigation and screen reader support are lacking. All interactive elements need focus rings and aria-labels.',
    implementation: 'Add CSS :focus-visible styles, aria-label attributes to buttons/inputs, and role annotations to dashboard sections.',
    effort: 'Low',
  });

  improvements.push({
    priority: 'P2',
    category: 'SwissKnife Integration',
    title: 'Add ORB capability router status panel',
    description: 'Show which capabilities are currently routable through the SwissKnife ORB, their transport status, and lifecycle phase.',
    implementation: 'Query the handsfree backend /v1/ipfs/capabilities and render a table showing each capability, its transport, and whether the ORB can reach it.',
    effort: 'Medium',
  });

  return improvements;
}

async function main() {
  const auditDir = process.argv[2] || DEFAULT_AUDIT_DIR;

  console.log(`Reading audit results from: ${auditDir}`);

  const [auditReport, coverageMatrix, analyses] = await Promise.all([
    loadJSON(path.join(auditDir, 'audit-report.json')),
    loadJSON(path.join(auditDir, 'mcp-tool-coverage-matrix.json')),
    collectAnalysisFiles(auditDir),
  ]);

  const improvements = generateImprovementPlan(auditReport, coverageMatrix, analyses);

  // Generate the markdown plan
  let md = `# Hallucinate App UI/UX Improvement Plan

> Generated: ${new Date().toISOString()}
> Audit source: ${auditDir}

## Executive Summary

This plan synthesizes findings from the comprehensive Playwright screenshot audit
of the Hallucinate App. The audit captured all dashboard surfaces, analyzed DOM
structure, and identified gaps in MCP tool exposure across the three IPFS backend
servers (ipfs_kit_py, ipfs_datasets_py, ipfs_accelerate_py).

**Goal:** Ensure every MCP server tool is testable from the dashboard UI, with
proper health monitoring, invocation receipts, and control surface mediation.

---

## 1. MCP Tool Coverage Analysis

${generateMCPToolCoverageSection(coverageMatrix)}

---

## 2. Dashboard Structure Analysis

${generateDashboardAnalysisSection(analyses)}

---

## 3. Detected Issues

${generateIssuesSection(auditReport)}

---

## 4. Improvement Plan

### Priority Matrix

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | ${improvements.filter(i => i.priority === 'P0').length} | Critical - Required for MCP tool testing |
| P1 | ${improvements.filter(i => i.priority === 'P1').length} | Important - Feature exposure and UX |
| P2 | ${improvements.filter(i => i.priority === 'P2').length} | Nice to have - Polish and monitoring |

`;

  for (const imp of improvements) {
    md += `### [${imp.priority}] ${imp.title}

**Category:** ${imp.category} | **Effort:** ${imp.effort}

${imp.description}

**Implementation:**
${imp.implementation}

---

`;
  }

  md += `## 5. Architecture Recommendations

### Shared Component Library

All dashboards should share these reusable components:

1. **\`<health-status-bar>\`** - Shows daemon connectivity (green/yellow/red)
2. **\`<tool-invocation-panel>\`** - Generic MCP tool caller with auto-form
3. **\`<receipt-viewer>\`** - Displays MCP invocation receipts
4. **\`<sidebar-nav>\`** - Persistent navigation between dashboards
5. **\`<capability-card>\`** - Shows one capability with transport/status

### Backend Integration Points

| Surface | Backend URL | Purpose |
|---------|------------|---------|
| Health Bar | \`http://127.0.0.1:8080/v1/ipfs/status\` | Unified health aggregation |
| IPFS Kit Tools | \`http://127.0.0.1:8014/mcp/tools/list\` | Available kit operations |
| Datasets Tools | \`http://127.0.0.1:3002/datasets/list\` | Available dataset operations |
| Accelerate Tools | \`http://127.0.0.1:3003/models/list\` | Available accelerate operations |
| Capabilities | \`http://127.0.0.1:8080/v1/ipfs/capabilities\` | Hardware profile |

### IPC Bridge Additions

The preload.cjs should expose these additional channels:

\`\`\`javascript
electronAPI.ipfs = {
  status: () => ipcRenderer.invoke('ipfs:status'),
  add: (data) => ipcRenderer.invoke('ipfs:add', data),
  cat: (cid) => ipcRenderer.invoke('ipfs:cat', { cid }),
  pin: (cid) => ipcRenderer.invoke('ipfs:pin', { cid }),
  unpin: (cid) => ipcRenderer.invoke('ipfs:unpin', { cid }),
  embed: (texts, opts) => ipcRenderer.invoke('ipfs:embed', { texts, ...opts }),
  generate: (prompt, opts) => ipcRenderer.invoke('ipfs:generate', { prompt, ...opts }),
  capabilities: () => ipcRenderer.invoke('ipfs:capabilities'),
};
\`\`\`

---

## 6. Validation Plan

After implementing improvements, re-run the comprehensive audit:

\`\`\`bash
npm run test:e2e -- comprehensive-screenshot-audit.spec.ts
node scripts/synthesize_uiux_plan.mjs
\`\`\`

Success criteria:
- MCP tool coverage >= 90%
- Zero P0 issues in audit report
- All 3 daemon health indicators visible on every dashboard
- Every tool callable from at least one dashboard surface
- Invocation receipts displayed for all tool calls
`;

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, md);
  console.log(`\nUI/UX improvement plan written to: ${OUTPUT_PATH}`);
  console.log(`Total improvements: ${improvements.length}`);
  console.log(`  P0: ${improvements.filter(i => i.priority === 'P0').length}`);
  console.log(`  P1: ${improvements.filter(i => i.priority === 'P1').length}`);
  console.log(`  P2: ${improvements.filter(i => i.priority === 'P2').length}`);
}

main().catch((err) => {
  console.error('Failed to generate UI/UX plan:', err);
  process.exit(1);
});
