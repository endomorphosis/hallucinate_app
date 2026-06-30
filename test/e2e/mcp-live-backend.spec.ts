import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import playwrightTest from '@playwright/test';
import MCPDaemonManager from '../../hallucinate_app/node/mcp_daemon_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { test, expect } = playwrightTest as unknown as typeof import('@playwright/test');

const DAEMON_IDS = ['ipfs-kit', 'ipfs-datasets', 'ipfs-accelerate'];

// This suite spins up the real Python MCP backends and verifies the dashboards
// receive WORKING live results (real tool listings + a non-mutating tool call),
// not just a reachable health endpoint or a mock. It is gated behind an env flag
// because it requires the Python virtualenv and backend dependencies to be present.
//
//   MCP_LIVE_BACKEND=1 [MCP_KIT_PORT=8014] npm run test:e2e -- mcp-live-backend.spec.ts
//
const LIVE_ENABLED = process.env.MCP_LIVE_BACKEND === '1';
const HEALTH_TIMEOUT_MS = Number(process.env.MCP_LIVE_HEALTH_TIMEOUT_MS || 90000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealthy(manager: any, daemonId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  while (Date.now() < deadline) {
    last = await manager.checkDaemonHealth(daemonId);
    if (last.healthy) {
      return last;
    }
    await sleep(2000);
  }
  return last;
}

test.describe('MCP Live Backend Verification', () => {
  test.skip(!LIVE_ENABLED, 'Set MCP_LIVE_BACKEND=1 (with the Python venv provisioned) to run live backend checks.');

  let manager: any;
  const liveResults: any[] = [];

  test.beforeAll(async () => {
    manager = new MCPDaemonManager({ startupTimeoutMs: 2000 });
    // Allow read-only probes: tools/list always, tools/call only when non-mutating.
    manager.setControlSurfaceRuntimePolicyEvaluator((request: any) => {
      const method = request?.method || request?.invocation_payload?.method;
      const mutation = request?.invocation_payload?.safe_probe?.mutation;
      const allow = method === 'tools/list' || (method === 'tools/call' && mutation === false);
      return {
        outcome: allow ? 'allow' : 'deny',
        reasons: [allow ? 'live backend read-only probe' : 'mutation not permitted in live probe'],
      };
    });

    for (const id of DAEMON_IDS) {
      await manager.startDaemon(id, { reason: 'live_backend_test' }).catch((err: any) => {
        console.error(`Failed to start ${id}:`, err?.message || err);
      });
    }
  });

  test.afterAll(async () => {
    if (manager) {
      await manager.stopAll().catch(() => {});
    }
    try {
      const outDir = path.join(__dirname, '..', '..', 'test-results', 'mcp-live-backend');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'live-backend.json'),
        JSON.stringify({ generated_at: new Date().toISOString(), liveResults }, null, 2),
      );
    } catch {
      /* best effort */
    }
  });

  for (const daemonId of DAEMON_IDS) {
    test(`live tools — ${daemonId}`, async () => {
      const health = await waitForHealthy(manager, daemonId, HEALTH_TIMEOUT_MS);
      expect(health, `${daemonId} produced no health result`).toBeTruthy();
      expect(health.healthy, `${daemonId} did not become healthy: ${JSON.stringify(health)}`).toBe(true);

      const listEnvelope = await manager.dashboardToolsList(daemonId);
      const list = listEnvelope?.output || listEnvelope;
      const callEnvelope = await manager.dashboardToolsCall(daemonId);
      const call = callEnvelope?.output || callEnvelope;

      liveResults.push({
        daemonId,
        becameHealthy: health.healthy,
        toolsList: {
          live: list?.live,
          ok: list?.live_ok,
          status: list?.live_status_code,
          toolCount: list?.tool_count,
          sample: list?.tools_sample,
        },
        toolsCall: {
          live: call?.live,
          ok: call?.live_ok,
          status: call?.live_status_code,
          listProxy: call?.live_invocation?.list_proxy,
        },
      });

      console.log(
        `live ${daemonId}: list live_ok=${list?.live_ok} tools=${list?.tool_count} | call live_ok=${call?.live_ok}`,
      );

      // tools/list must return real, working tool data from the live backend.
      expect(list?.live, `${daemonId} tools/list was not invoked live`).toBe(true);
      expect(list?.live_ok, `${daemonId} tools/list did not return working results`).toBe(true);
      expect(list?.tool_count, `${daemonId} tools/list returned no tools`).toBeGreaterThan(0);

      // tools/call must reach the live backend and return a non-error response.
      expect(call?.live, `${daemonId} tools/call was not invoked live`).toBe(true);
      expect(call?.live_ok, `${daemonId} tools/call did not return a working result`).toBe(true);
    });
  }

  test('at least one MCP server returns working live results', async () => {
    const working = liveResults.filter((r) => r.toolsList?.ok && (r.toolsList?.toolCount || 0) > 0);
    expect(working.length, `No live backend returned working tool results: ${JSON.stringify(liveResults)}`).toBeGreaterThan(0);
  });
});
