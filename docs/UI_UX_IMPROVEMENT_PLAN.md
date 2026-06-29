# Hallucinate App — UI/UX Improvement Plan

> Synthesized from an automated Playwright screenshot survey of every navigable
> section of the desktop app. The survey spec, raw metrics, and full-page
> screenshots are reproducible — see [How this plan was generated](#how-this-plan-was-generated).

## How this plan was generated

A new Playwright suite launches the Electron app and walks all **14 navigable
HTML sections**, capturing for each:

- a full-page screenshot (`test-results/ui-survey/screenshots/<id>.png`)
- structured UX metrics (control counts, accessibility signals, theme, console
  errors, external/CDN resources) written to `test-results/ui-survey/survey.json`

Run it with:

```bash
cd hallucinate_app
DISPLAY=:0 node scripts/run_playwright_test.mjs test feature-screenshot-survey.spec.ts
```

Spec: [test/e2e/feature-screenshot-survey.spec.ts](../test/e2e/feature-screenshot-survey.spec.ts)

## Sections surveyed

| Section | Category | Buttons | Inputs | `data-testid` | Console errs | Theme | Notable |
|---|---|---:|---:|---:|---:|---|---|
| Main Dashboard | Core | 11 | 1 | 0 | 3 | light | only view with sidebar nav |
| Settings | Core | 2 | 6 | 0 | 0 | dark | 3 inputs missing labels |
| Model Tester | Testing | 5 | 1 | 0 | 0 | light | — |
| Test Interface | Testing | 12 | 2 | 0 | 1 | light | has `<main>`/`<nav>` |
| Benchmark Dashboard | Testing | 2 | 0 | 0 | 1 | light | no `<h1>`; Chart.js via CDN |
| IPFS Kit Dashboard | MCP Servers | 7 | 0 | 0 | 0 | light | blocking on-load fetch hangs page |
| IPFS Datasets Dashboard | MCP Servers | 19 | 0 | 0 | 1 | light | — |
| IPFS Accelerate Dashboard | MCP Servers | 8 | 0 | 0 | 15 | light | status contradiction; blank embed |
| Daemon Manager | System | 12 | 0 | 0 | 0 | dark | **unrendered template literal bug** |
| Usage Dashboard | System | 0 | 0 | 0 | 0 | light | empty (no offline/empty state) |
| Auth Dashboard | Security | 0 | 0 | 0 | 0 | light | empty (no offline/empty state) |
| Security Test Dashboard | Security | 0 | 0 | 0 | 0 | light | empty (no offline/empty state) |
| Database Backup Dashboard | Storage | 9 | 12 | 0 | 3 | light | 5 canvases, rich controls |
| PyArrow Content Index | Storage | 29 | 12 | 0 | 1 | light | 4 buttons missing accessible name |

## Cross-cutting findings

### 1. Testability — no stable selectors anywhere
**Zero** of the 14 sections expose `data-testid` / `data-test` hooks; tests rely
on text matching and keyboard accelerators, which are brittle. This directly
blocks the goal of "testing all features of the MCP server tools and dashboard."

### 2. MCP tool coverage gap (primary goal)
[node/menu_config.js](../hallucinate_app/node/menu_config.js) declares concrete
per-server tools (e.g. IPFS Kit: *Add / Get / Pin / Status / Configure*; Datasets:
*Load / Create / Transform / Export / GraphRAG / Scraper*; Accelerate:
*Inference / Batch / Training / GPU / Metrics*). The dashboards only surface two
generic actions — **"Run tools/list"** and **"Run safe tools/call"** — so the
individual MCP tools cannot be invoked or asserted from the UI. There is no
per-tool form (arguments in, result out), so most server capabilities are
untested end-to-end.

### 3. Real, user-visible bugs
- **Daemon Manager** event log renders the literal text
  `${new Date().toLocaleTimeString()}` because it sits in static HTML rather than
  a JS template — see [daemon_manager.html:284](../hallucinate_app/node/views/daemon_manager.html#L284).
- **IPFS Accelerate Dashboard** shows **"Server Status: Stopped"** and
  **"Health: Healthy"** simultaneously — contradictory state semantics. Its
  embedded "Native Package Dashboard" iframe is blank and emits **15** `404`s
  when the server is offline, with no fallback.

### 4. Offline fragility (CDN + missing local assets)
- Icons load from CDN Font Awesome and charts from CDN Chart.js. A desktop app
  is frequently offline → broken icons and empty charts.
- Mixed Font Awesome versions (**6.0.0-beta3** on dashboard/test/benchmark vs
  **5.15.4** on the MCP/security/storage dashboards) → inconsistent iconography.
- Multiple `ERR_FILE_NOT_FOUND` for local assets (e.g. logo, stylesheets) on the
  main dashboard, database-backup, test-interface, benchmark, pyarrow views.

### 5. Inconsistent visual system
Themes are split (Settings + Daemon Manager are dark; everything else is light),
backgrounds differ per view (`#f9fafb`, `#f5f5f5`, `#ecf0f1`, `#f5f7fa`), and
card/gradient styles vary. There is no shared design-token layer.

### 6. Navigation dead-ends
Only the Main Dashboard has a persistent sidebar. Every sub-dashboard relies on
the application menu / keyboard accelerators with no in-page "Back to Dashboard"
or breadcrumb, so users get stranded inside a view.

### 7. Accessibility gaps
- No section uses ARIA `role`s; almost none use `aria-label`.
- Most dashboards lack `<main>`/`<nav>` landmarks (only Dashboard, Test
  Interface, Benchmark have a landmark).
- Settings has **3** unlabeled inputs; PyArrow has **4** icon-only buttons with
  no accessible name; Benchmark Dashboard has **no `<h1>`**.

### 8. Loading / empty states
Usage, Auth, and Security Test dashboards render essentially blank when their
backing server is offline (0 interactive controls captured). The Main Dashboard
stays stuck on "System is initializing. Please wait…" / "Waiting for logs…" with
no timeout or retry affordance.

## Improvement plan (prioritized)

> **Status legend:** ✅ implemented · ⬜ planned

### P0 — Make every MCP tool testable (the core ask)
1. ✅ **Add stable selectors.** `data-testid` hooks added across the three MCP
   server dashboards and the Daemon Manager (status fields, tool buttons,
   receipts, controls). Survey `testIds` went **0 → 16 / 10 / 10 / 6**.
   Convention: `data-testid="mcp-dashboard"` + `data-daemon-id`, plus
   `server-status`, `health-status`, `btn-tools-list`, `btn-tools-call`,
   `tool-receipt`, `discovered-tools`, and per-tool `data-testid="mcp-tool"`.
2. ✅ **Per-tool surface.** Each MCP dashboard now renders a **Discovered MCP
   Tools** explorer (`#discovered-tools`) that enumerates the advertised tools
   from `tools/list`, each row carrying `data-tool-name` and a per-tool test id.
   (Live invocation with arbitrary args remains gated by the fail-closed
   mediation contract — see Notes.)
3. ✅ **Tool-coverage E2E suite.**
   [test/e2e/mcp-tool-coverage.spec.ts](../test/e2e/mcp-tool-coverage.spec.ts)
   asserts the selector contract, exercises `tools/list` + `tools/call` per
   server, and writes `test-results/mcp-tool-coverage/coverage.json` (declared
   vs. discovered tools, mediation receipt status).

### P1 — Fix correctness bugs
4. ✅ Daemon Manager event-log timestamp now rendered via JS (the literal
   `${new Date().toLocaleTimeString()}` is gone).
5. ✅ Accelerate dashboard health no longer contradicts status — when the daemon
   is not running it shows **Unavailable** instead of **Healthy**.
6. ⬜ Give the embedded "Native Package Dashboard" iframe an explicit
   loading/offline fallback instead of silent 404s. *(Deferred: existing
   `mcp-feature-exposure` tests pin the iframe's hardcoded `src`, so a fallback
   that defers loading would require updating that test contract.)*

### P1 — Offline-first robustness
7. ✅ Bundled Font Awesome (`@fortawesome/fontawesome-free@6`) and Chart.js
   (`chart.js@3.9.1`) into local `node_modules`; **all 11 Font Awesome and 4
   Chart.js CDN/missing references repointed** to local paths. Survey
   `cdnReferences`: **many → 0** across all 14 sections. CSP headers tightened to
   drop `cdn.jsdelivr.net`/`cdnjs.cloudflare.com` allowances.
8. ✅ Standardized on a single icon set/version (Font Awesome 6) — the mixed
   `5.15.4` / `6.0.0-beta3` split is gone.
9. ✅ Fixed the broken logo path (`../assets/logo.png` → `../../assets/logo.svg`).
   Total survey console errors **39 → 21**; remaining are the offline-iframe
   404s (see #6) plus a few pre-existing minor missing assets.


### P2 — Design system & navigation
10. ⬜ Extract shared design tokens (color, spacing, typography, card styles) into
    a single stylesheet; pick one theme (or a real light/dark toggle in
    Settings) and apply it consistently.
11. ✅ Added a persistent **Home** escape hatch (`data-testid="nav-home"`, fixed
    bottom-left, `aria-label`) to all 13 sub-dashboards, wired through a new
    `navigate-home` IPC channel (`navigation.navigateHome()` in the preload) back
    to the main dashboard. Covered by
    [test/e2e/navigation-shell.spec.ts](../test/e2e/navigation-shell.spec.ts)
    (14 passed: presence on every sub-view + click navigates to `dashboard.html`).
    *(Full breadcrumb/top-bar shell still planned.)*


### P2 — Accessibility
12. ✅ Added `<main>`/`role="main"` landmarks to the 11 views that lacked one and
    an `<h1>` to the benchmark dashboard — every view now has a main landmark and
    at least one `<h1>`.
13. ✅ Labeled the 3 unlabeled settings inputs (`aria-label`) and named the
    icon-only close buttons in the PyArrow dashboard (`aria-label="Close"`).
14. ✅ Added [test/e2e/accessibility-audit.spec.ts](../test/e2e/accessibility-audit.spec.ts)
    as a CI gate: asserts every view has a main landmark, ≥1 `<h1>`, a `lang`
    attribute, no unlabeled inputs, and guards against new unnamed buttons
    (15 passed). Survey deltas: missing-main **11 → 0**, unlabeled inputs
    **3 → 0**, unnamed buttons **4 → 2** (remaining 2 are dynamic busy-states).


### P3 — State handling
15. ⬜ Standard loading, empty, and error states for every data-backed dashboard,
    with retry and timeout (replace indefinite "Waiting…" text).
16. ⬜ Surface daemon/connection status consistently using a shared status
    component.

> **Note on live tool invocation:** the preload bridge enforces a *fail-closed*
> mediation contract — `tools/call` only runs a non-mutating safe probe, and all
> tool actions are blocked unless the daemon is healthy. Exposing arbitrary
> argument-driven invocation requires extending that mediation contract in
> `mcp_daemon_manager.js`; it was intentionally **not** bypassed here to preserve
> the security model.

## Live backend verification (mock → real transport)

The dashboard tool surface was **mocked at the transport layer**: the daemon
manager's `_dashboardTransportProbe` only ran a health check and returned
`ok: health.healthy` — it never actually issued `tools/list`/`tools/call` against
the running MCP server.

- ✅ **Real transport.** `_dashboardTransportProbe` now performs a real HTTP
  request via `_invokeLiveTool` (GET for `tools/list`, POST of the non-mutating
  safe probe for `tools/call`) against the live daemon endpoint, returning the
  parsed backend response (`live: true`, `status_code`, `response`). It still
  fail-closes when the daemon is not healthy. The dashboards' **Discovered MCP
  Tools** explorer now renders the real tools when a backend is live.
- ✅ **Live verification suite.**
  [test/e2e/mcp-live-backend.spec.ts](../test/e2e/mcp-live-backend.spec.ts)
  (opt-in via `MCP_LIVE_BACKEND=1`, `AUTO_START_DAEMONS=true`) starts the managed
  daemons, waits for health, calls the tool surface, and asserts **working live
  results** (not fail-closed mocks), writing
  `test-results/mcp-live-backend/live-backend.json`.

### Diagnosed environment/backend blockers (not app-logic bugs)

### End-to-end live result (all three verified)
With a free kit port (`MCP_KIT_PORT=8014` to dodge the VS Code 8004 conflict),
`MCP_LIVE_BACKEND=1` shows **all three MCP servers healthy and live**:
- **IPFS Kit** — healthy, `tools/list` 200, **95 real tools**.
- **IPFS Datasets** — healthy, authenticated `tools/list` 200 (16 categories).
- **IPFS Accelerate** — healthy, `tools/list` 200 (REST tool enumeration is
  backend-stubbed; full tools are on the mcplusplus transport).

Reconciled config: kit port is env-configurable; datasets tool paths
`/tools/list` + `/tools/execute/{tool_name}` with bearer login; accelerate paths
`/api/mcp/tools` + `/api/tools`. Mutating operations remain fail-closed.


## Suggested test roadmap

The screenshot survey is the regression baseline. Build on it:

1. **Visual regression** — compare `ui-survey/screenshots/*` across runs.
2. **Accessibility gate** — assert survey metrics: 0 unlabeled inputs, 0 buttons
   without accessible name, 1 `<h1>`, presence of landmarks.
3. **Selector contract** — assert each view exposes its expected `data-testid`s.
4. **MCP tool coverage** — per server/tool: launch daemon → invoke tool → assert
   result, producing a coverage report (declared vs. exercised tools).
5. **Offline mode** — run with daemons stopped to verify graceful empty/error
   states (no unhandled 404 floods, no contradictory status).
