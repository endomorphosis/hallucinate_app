import { app, BrowserWindow, Menu, MenuItem, ipcMain, protocol, shell } from 'electron';
import { createModelTesterWindow } from './hallucinate_app/node/accelerate_model_tester.js';
import MCPDaemonManager from './hallucinate_app/node/mcp_daemon_manager.js';
import MenuGenerator from './hallucinate_app/node/menu_generator.js';
import path from 'path';
import url from 'url';
import { createHash } from 'crypto';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { appendFileSync as appendFileSyncSync } from 'fs';
import electron_squirrel_startup from 'electron-squirrel-startup';
import testHandler from './hallucinate_app/node/test_handler.js';
import benchmarkHandler from './hallucinate_app/node/benchmark_handler.js';
import { getDaemonManager } from './hallucinate_app/node/daemon_manager.js';

// ============================================================
// VERBOSE ERROR LOGGING CONFIGURATION
// ============================================================
const LOG_FILE = '/tmp/hallucinate-app-debug.log';
const ENABLE_VERBOSE_LOGGING = true;

function logError(context, error, additionalInfo = {}) {
  const timestamp = new Date().toISOString();
  const errorLog = {
    timestamp,
    context,
    error: {
      message: error?.message || String(error),
      stack: error?.stack,
      name: error?.name,
      code: error?.code
    },
    ...additionalInfo
  };
  
  // Only log to console if stdout is available (not EPIPE)
  try {
    console.error(`[${timestamp}] ❌ ERROR in ${context}:`, error);
    if (additionalInfo && Object.keys(additionalInfo).length > 0) {
      console.error('Additional Info:', additionalInfo);
    }
  } catch (e) {
    // Ignore EPIPE errors when writing to console
  }
  
  // Write to log file
  if (ENABLE_VERBOSE_LOGGING) {
    try {
      appendFileSyncSync(LOG_FILE, JSON.stringify(errorLog, null, 2) + '\n---\n');
    } catch (e) {
      // Ignore file write errors
    }
  }
  
  return errorLog;
}

function logInfo(context, message, data = {}) {
  const timestamp = new Date().toISOString();
  
  // Only log to console if stdout is available (not EPIPE)
  try {
    console.log(`[${timestamp}] ℹ️  ${context}: ${message}`);
    if (data && Object.keys(data).length > 0) {
      console.log('Data:', data);
    }
  } catch (e) {
    // Ignore EPIPE errors when writing to console
  }
  
  if (ENABLE_VERBOSE_LOGGING) {
    try {
      const logEntry = { timestamp, context, message, data };
      appendFileSyncSync(LOG_FILE, JSON.stringify(logEntry, null, 2) + '\n');
    } catch (e) {
      // Ignore file write errors
    }
  }
}

// Global error handlers
process.on('uncaughtException', (error) => {
  logError('UNCAUGHT_EXCEPTION', error, { fatal: true });
});

process.on('unhandledRejection', (reason, promise) => {
  logError('UNHANDLED_REJECTION', reason, { promise: String(promise) });
});

logInfo('STARTUP', 'Hallucinate App starting...', { 
  nodeVersion: process.version,
  electronVersion: process.versions.electron,
  platform: process.platform,
  arch: process.arch
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (electron_squirrel_startup) {
  logInfo('SQUIRREL', 'Squirrel startup detected, quitting...');
  app.quit();
}

// Get the directory where the current module is located
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

// Create a simple static file server for SwissKnife web files
let swissKnifeServer = null;
const SWISSKNIFE_PORT = 8765;

function startSwissKnifeServer() {
  try {
    const swissKnifeWebDir = path.join(__dirname, 'swissknife', 'web');
    logInfo('SWISSKNIFE_SERVER', 'Starting server...', { port: SWISSKNIFE_PORT, webDir: swissKnifeWebDir });
    
    swissKnifeServer = createServer(async (req, res) => {
      try {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        filePath = path.join(swissKnifeWebDir, filePath);
        
        // Security: prevent directory traversal
        if (!filePath.startsWith(swissKnifeWebDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
      
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };
      
      const contentType = contentTypes[ext] || 'application/octet-stream';
      
      const data = await readFile(filePath);
      
      // Set security headers
      const headers = {
        'Content-Type': contentType,
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http://127.0.0.1:*",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN'
      };
      
      res.writeHead(200, headers);
      res.end(data);
    } catch (err) {
      logError('SWISSKNIFE_SERVER_FILE', err, { url: req.url, filePath });
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  
  swissKnifeServer.on('error', (err) => {
    logError('SWISSKNIFE_SERVER', err, { port: SWISSKNIFE_PORT });
  });
  
  swissKnifeServer.listen(SWISSKNIFE_PORT, '127.0.0.1', () => {
    logInfo('SWISSKNIFE_SERVER', `Server running at http://127.0.0.1:${SWISSKNIFE_PORT}`);
  });
  } catch (error) {
    logError('SWISSKNIFE_SERVER_START', error);
    throw error;
  }
}

// Initialize MCP Daemon Manager
const daemonManager = new MCPDaemonManager();

// Setup daemon manager event listeners
daemonManager.on('started', ({ daemon, port }) => {
  console.log(`✅ ${daemon} started on port ${port}`);
});

daemonManager.on('stopped', ({ daemon }) => {
  console.log(`🛑 ${daemon} stopped`);
});

daemonManager.on('error', ({ daemon, error }) => {
  console.error(`❌ ${daemon} error: ${error}`);
});

daemonManager.on('all-started', () => {
  console.log('🚀 All MCP daemons are running');
});

// Setup test and benchmark handlers
testHandler.setupIpcHandlers();
benchmarkHandler.setupIpcHandlers();

// Setup daemon manager IPC handlers
ipcMain.handle('daemon:getAll', async () => {
  return daemonManager.getAllStatus();
});

ipcMain.handle('daemon:start', async (event, daemonId) => {
  return await daemonManager.startDaemon(daemonId);
});

ipcMain.handle('daemon:stop', async (event, daemonId) => {
  return await daemonManager.stopDaemon(daemonId);
});

ipcMain.handle('daemon:restart', async (event, daemonId) => {
  return await daemonManager.restartDaemon(daemonId);
});

ipcMain.handle('daemon:getLogs', async (event, daemonId, limit) => {
  return daemonManager.getLogs(daemonId, limit);
});

// ============================================================
// CONTROL SURFACE POLICY CONSOLE
// ============================================================
const CONTROL_SURFACE_IR_VERSION = '0.1.0';
const CONTROL_SURFACE_MEDIATOR_VERSION = 'operator-console-js/0.1.0';
const CONTROL_SURFACE_CONTRACT_REF = 'control_surface_contract:operator-console';
const STRICT_TEMPLATE_COMPILER_LANE = 'strict_template';
const HALLUCINATE_APP_OPERATOR_CONSOLE_EVIDENCE = 'Hallucinate App operator console';
const ORB_DISPLAY_HARNESS_EVIDENCE = 'ORB display harness';
const OPERATOR_SHELL_WORKFLOWS = Object.freeze([
  {
    id: 'task-monitor',
    label: 'task monitor',
    surface: HALLUCINATE_APP_OPERATOR_CONSOLE_EVIDENCE,
    evidence: 'daemon health, pending confirmations, receipts, and active policy refs'
  },
  {
    id: 'app-launcher',
    label: 'app launcher',
    surface: 'SwissKnife virtual desktop',
    evidence: 'SwissKnife window launch and MCP tool menu actions'
  },
  {
    id: 'orb-inspector',
    label: 'ORB inspector',
    surface: HALLUCINATE_APP_OPERATOR_CONSOLE_EVIDENCE,
    evidence: ORB_DISPLAY_HARNESS_EVIDENCE
  },
  {
    id: 'session-replay',
    label: 'session replay',
    surface: HALLUCINATE_APP_OPERATOR_CONSOLE_EVIDENCE,
    evidence: 'mediation receipts and replayable interaction envelopes'
  }
]);
const IGNORE_SURFACE_AT_TIME_TEMPLATE = 'ignore my {surface} at {time_window}';
const REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE = 'require confirmation before {method}';
const DEFAULT_OPERATOR_ACTOR = 'user:*';
const DEFAULT_OPERATOR_SCOPE = 'operator:desktop';
const DEFAULT_OPERATOR_TIMEZONE = 'America/Los_Angeles';

const controlSurfaceState = {
  rules: [],
  confirmations: [],
  receipts: []
};

const CONTROL_SURFACE_SURFACE_ALIASES = {
  'wrist gesture': { phrase: 'wrist gesture', surface: 'gesture', surface_event: 'wrist_raise' },
  'wrist gestures': { phrase: 'wrist gestures', surface: 'gesture', surface_event: 'wrist_raise' },
  gesture: { phrase: 'gesture', surface: 'gesture', surface_event: '*' },
  gestures: { phrase: 'gestures', surface: 'gesture', surface_event: '*' },
  voice: { phrase: 'voice', surface: 'voice', surface_event: 'utterance' },
  'voice command': { phrase: 'voice command', surface: 'voice', surface_event: 'utterance' },
  'voice commands': { phrase: 'voice commands', surface: 'voice', surface_event: 'utterance' },
  'mouse click': { phrase: 'mouse click', surface: 'mouse', surface_event: 'click' },
  'mouse clicks': { phrase: 'mouse clicks', surface: 'mouse', surface_event: 'click' },
  'pointer click': { phrase: 'pointer click', surface: 'pointer', surface_event: 'click' },
  'pointer clicks': { phrase: 'pointer clicks', surface: 'pointer', surface_event: 'click' }
};

const CONTROL_SURFACE_TIME_WINDOWS = {
  night: { phrase: 'night', predicate: 'quiet_hours', start: '22:00', end: '07:00' },
  overnight: { phrase: 'overnight', predicate: 'quiet_hours', start: '22:00', end: '07:00' },
  'quiet hours': { phrase: 'quiet hours', predicate: 'quiet_hours', start: '22:00', end: '07:00' }
};

const CONTROL_SURFACE_METHOD_ALIASES = {
  'send message': { phrase: 'send message', method: 'send_message', target_ref: 'service:messaging', intent: 'communication.send' },
  'send messages': { phrase: 'send messages', method: 'send_message', target_ref: 'service:messaging', intent: 'communication.send' },
  sending: { phrase: 'sending', method: 'send_message', target_ref: 'service:messaging', intent: 'communication.send' },
  'sending message': { phrase: 'sending message', method: 'send_message', target_ref: 'service:messaging', intent: 'communication.send' },
  'sending messages': { phrase: 'sending messages', method: 'send_message', target_ref: 'service:messaging', intent: 'communication.send' },
  'sending a message': { phrase: 'sending a message', method: 'send_message', target_ref: 'service:messaging', intent: 'communication.send' },
  activate: { phrase: 'activate', method: 'activate', target_ref: 'target:*', intent: 'display.activate' },
  activation: { phrase: 'activation', method: 'activate', target_ref: 'target:*', intent: 'display.activate' },
  'display activate': { phrase: 'display activate', method: 'activate', target_ref: 'target:*', intent: 'display.activate' },
  'display activation': { phrase: 'display activation', method: 'activate', target_ref: 'target:*', intent: 'display.activate' }
};

const CONTROL_SURFACE_STATE_MARKERS = [
  ['sleep', 'sleeping'],
  ['driving', 'driving'],
  ['meeting', 'meeting'],
  ['screen locked', 'screen_locked'],
  ['locked', 'screen_locked']
];

const CONTROL_SURFACE_METHOD_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
const IGNORE_SURFACE_AT_TIME_RE = /^ignore my ([a-z0-9_. -]+?) at ([a-z0-9_. -]+?)(?:,? because ([a-z0-9_' .-]+))?$/;
const REQUIRE_CONFIRMATION_BEFORE_METHOD_RE = /^require confirmation before ([a-z0-9_. -]+)$/;

function stableControlSurfaceId(prefix, ...parts) {
  const normalized = parts
    .filter((part) => part !== undefined && part !== null)
    .map((part) => String(part).trim().toLowerCase())
    .join('|');
  const digest = createHash('sha1').update(normalized).digest('hex').slice(0, 16);
  return `${prefix}:${digest}`;
}

function stableJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableJsonValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableJsonValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

function stableCid(value, prefix = 'policy_bundle') {
  const canonical = JSON.stringify(stableJsonValue(value));
  const digest = createHash('sha256').update(canonical).digest('hex');
  return `sha256:${prefix}:${digest}`;
}

function cloneForIpc(value) {
  return JSON.parse(JSON.stringify(value));
}

function utcNow() {
  return new Date().toISOString();
}

function normalizeRuleText(sourceText) {
  return String(sourceText || '')
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSlotPhrase(value) {
  return normalizeRuleText(value).replace(/^(a|an|the) /, '').trim();
}

function splitActor(actor) {
  const value = String(actor || DEFAULT_OPERATOR_ACTOR).trim();
  if (!value.includes(':')) {
    return { type: value || 'user', id: '' };
  }
  const [type, id] = value.split(':', 2);
  return { type: type || 'user', id: id || '' };
}

function actorIdentity(actor) {
  const resolved = splitActor(actor);
  return {
    type: resolved.type,
    id: resolved.id,
    delegation_chain: []
  };
}

function frameFact(kind, subject, predicate, value, attrs = {}, ...idParts) {
  return {
    fact_id: stableControlSurfaceId('fact', kind, subject, predicate, value, ...idParts),
    kind,
    subject,
    predicate,
    value,
    attrs: { ...attrs }
  };
}

function actorFact(actor) {
  const resolved = splitActor(actor);
  return frameFact(
    'actor',
    `actor:${resolved.id || resolved.type || 'unknown'}`,
    'actor.type',
    resolved.type || 'unknown',
    { actor_id: resolved.id || '', delegation_chain: [] },
    resolved.id
  );
}

function surfaceFacts(surfaceSlot) {
  const facts = [
    frameFact('surface', `surface:${surfaceSlot.surface}`, 'surface.id', surfaceSlot.surface)
  ];
  if (surfaceSlot.surface_event !== '*') {
    facts.push(
      frameFact(
        'event',
        `event:${surfaceSlot.surface_event}`,
        'surface_event',
        surfaceSlot.surface_event,
        { surface: surfaceSlot.surface }
      )
    );
  }
  return facts;
}

function methodFacts(methodSlot) {
  return [
    frameFact(
      'method',
      `method:${methodSlot.method}`,
      'intent.method',
      methodSlot.method,
      { intent: methodSlot.intent || '' }
    ),
    frameFact(
      'target',
      methodSlot.target_ref || 'target:unknown',
      'intent.target_ref',
      methodSlot.target_ref,
      { method: methodSlot.method }
    )
  ];
}

function stateFrameFromReason(reason) {
  const normalized = normalizeRuleText(reason);
  for (const [marker, stateFrame] of CONTROL_SURFACE_STATE_MARKERS) {
    if (normalized.includes(marker)) {
      return stateFrame;
    }
  }
  return '';
}

function timeWindowGuard(slot, timezone) {
  return {
    guard_id: stableControlSurfaceId('guard', 'time_window', slot.predicate, slot.start, slot.end, timezone),
    kind: 'time_window',
    predicate: slot.predicate,
    expected: true,
    relation: 'during',
    start: slot.start,
    end: slot.end,
    timezone,
    event_refs: [],
    event_calculus: [`holds_at(time_window:${slot.predicate},${slot.start},${slot.end},${timezone})`],
    metadata: {}
  };
}

function stateFrameGuard(stateFrame) {
  return {
    guard_id: stableControlSurfaceId('guard', 'state_frame', stateFrame),
    kind: 'state_frame',
    predicate: 'state_frame',
    expected: stateFrame,
    relation: 'holds',
    start: '',
    end: '',
    timezone: 'UTC',
    event_refs: [],
    event_calculus: [`holds_at(state_frame:${stateFrame})`],
    metadata: {}
  };
}

function guardFacts(guards) {
  return guards.map((guard) => {
    if (guard.kind === 'state_frame') {
      return frameFact('context', 'context:state_frames', 'state_frame', guard.expected);
    }
    if (guard.kind === 'time_window') {
      return frameFact('context', 'context:time', 'time_window', guard.predicate);
    }
    return frameFact('context', 'context', guard.predicate, guard.expected);
  });
}

function invocationEffect(outcome, method, targetRef, reason) {
  return {
    outcome,
    method,
    target_ref: targetRef,
    arguments: {},
    rewrite_method: '',
    fallback_surface: '',
    confirmation_required: outcome === 'require_confirmation',
    rate_limit_key: '',
    reason
  };
}

function normMetadata(template, slots) {
  return {
    compiler_lane: STRICT_TEMPLATE_COMPILER_LANE,
    matched_template: template,
    confidence: 1.0,
    llm_used: false,
    slots: { ...slots }
  };
}

function resolveSurfaceSlot(phrase) {
  const slot = CONTROL_SURFACE_SURFACE_ALIASES[phrase];
  if (!slot) {
    throw new Error(`Unsupported control surface slot: ${phrase}`);
  }
  return slot;
}

function resolveTimeWindowSlot(phrase) {
  const slot = CONTROL_SURFACE_TIME_WINDOWS[phrase];
  if (!slot) {
    throw new Error(`Unsupported time-window slot: ${phrase}`);
  }
  return slot;
}

function resolveMethodSlot(phrase) {
  if (CONTROL_SURFACE_METHOD_ALIASES[phrase]) {
    return CONTROL_SURFACE_METHOD_ALIASES[phrase];
  }

  const methodText = phrase.replace(/\s+/g, '_');
  if (CONTROL_SURFACE_METHOD_PATTERN.test(methodText)) {
    const methodParts = methodText.split('.');
    const method = methodParts[methodParts.length - 1];
    return {
      phrase,
      method,
      target_ref: `method:${methodText}`,
      intent: methodText.includes('.') ? methodText : ''
    };
  }

  throw new Error(`Unsupported method slot: ${phrase}`);
}

function buildPolicyFromNorm({ sourceText, normalizedText, policyId, matchedTemplate, slots, norms, facts }) {
  const eventCalculus = norms.flatMap((norm) => norm.guards.flatMap((guard) => guard.event_calculus || []));
  const policy = {
    policy_id: policyId || stableControlSurfaceId('policy', STRICT_TEMPLATE_COMPILER_LANE, normalizedText),
    version: CONTROL_SURFACE_IR_VERSION,
    source_text: String(sourceText || '').trim(),
    facts,
    norms: [...norms].sort((left, right) => right.priority - left.priority || left.norm_id.localeCompare(right.norm_id)),
    compiled_policy_cid: '',
    compiled_artifacts: {
      compiler_lane: STRICT_TEMPLATE_COMPILER_LANE,
      matched_template: matchedTemplate,
      confidence: 1.0,
      llm_used: false,
      slots: { ...slots },
      event_calculus: eventCalculus,
      deontic_outcomes: norms.map((norm) => norm.outcome)
    },
    explanations: norms.map((norm) => norm.explanation)
  };
  policy.compiled_policy_cid = stableCid(policy, 'compiled_policy');
  return policy;
}

function compileIgnoreSurfaceAtTime({ sourceText, normalizedText, match, policyId, actor, timezone }) {
  const surfacePhrase = normalizeSlotPhrase(match[1]);
  const timeWindowPhrase = normalizeSlotPhrase(match[2]);
  const because = normalizeSlotPhrase(match[3] || '');
  const surfaceSlot = resolveSurfaceSlot(surfacePhrase);
  const timeWindowSlot = resolveTimeWindowSlot(timeWindowPhrase);
  const guards = [timeWindowGuard(timeWindowSlot, timezone)];
  const stateFrame = stateFrameFromReason(because);

  if (stateFrame) {
    guards.unshift(stateFrameGuard(stateFrame));
  }

  const slots = {
    surface: surfacePhrase,
    surface_ref: surfaceSlot.surface,
    surface_event: surfaceSlot.surface_event,
    time_window: timeWindowPhrase,
    time_window_ref: timeWindowSlot.predicate
  };
  if (stateFrame) {
    slots.state_frame = stateFrame;
  }

  const effect = invocationEffect('deny', '*', '*', `Ignore ${surfacePhrase} while ${timeWindowPhrase} holds.`);
  const norm = {
    norm_id: stableControlSurfaceId(
      'norm',
      STRICT_TEMPLATE_COMPILER_LANE,
      IGNORE_SURFACE_AT_TIME_TEMPLATE,
      surfaceSlot.surface,
      surfaceSlot.surface_event,
      timeWindowSlot.predicate,
      stateFrame || ''
    ),
    outcome: 'deny',
    actor,
    surface: surfaceSlot.surface,
    surface_event: surfaceSlot.surface_event,
    method: '*',
    target_ref: '*',
    guards,
    effect,
    priority: 100,
    source_text: String(sourceText || '').trim(),
    explanation: `Compiled '${IGNORE_SURFACE_AT_TIME_TEMPLATE}' as a deny norm for ${surfaceSlot.surface}:${surfaceSlot.surface_event} during ${timeWindowSlot.predicate}.`,
    metadata: normMetadata(IGNORE_SURFACE_AT_TIME_TEMPLATE, slots)
  };
  const policy = buildPolicyFromNorm({
    sourceText,
    normalizedText,
    policyId,
    matchedTemplate: IGNORE_SURFACE_AT_TIME_TEMPLATE,
    slots,
    norms: [norm],
    facts: [actorFact(actor), ...surfaceFacts(surfaceSlot), ...guardFacts(guards)]
  });

  return {
    policy,
    matched_template: IGNORE_SURFACE_AT_TIME_TEMPLATE,
    confidence: 1.0,
    slots
  };
}

function compileRequireConfirmationBeforeMethod({ sourceText, normalizedText, match, policyId, actor }) {
  const methodPhrase = normalizeSlotPhrase(match[1]);
  const methodSlot = resolveMethodSlot(methodPhrase);
  const slots = {
    method: methodPhrase,
    method_ref: methodSlot.method,
    target_ref: methodSlot.target_ref
  };
  if (methodSlot.intent) {
    slots.intent = methodSlot.intent;
  }

  const effect = invocationEffect(
    'require_confirmation',
    methodSlot.method,
    methodSlot.target_ref,
    `Require user confirmation before ${methodPhrase}.`
  );
  const norm = {
    norm_id: stableControlSurfaceId(
      'norm',
      STRICT_TEMPLATE_COMPILER_LANE,
      REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE,
      methodSlot.method,
      methodSlot.target_ref
    ),
    outcome: 'require_confirmation',
    actor,
    surface: '*',
    surface_event: '*',
    method: methodSlot.method,
    target_ref: methodSlot.target_ref,
    guards: [],
    effect,
    priority: 90,
    source_text: String(sourceText || '').trim(),
    explanation: `Compiled '${REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE}' as a confirmation norm for ${methodSlot.method}.`,
    metadata: normMetadata(REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE, slots)
  };
  const policy = buildPolicyFromNorm({
    sourceText,
    normalizedText,
    policyId,
    matchedTemplate: REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE,
    slots,
    norms: [norm],
    facts: [actorFact(actor), ...methodFacts(methodSlot)]
  });

  return {
    policy,
    matched_template: REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE,
    confidence: 1.0,
    slots
  };
}

function compileControlSurfacePolicyRule({ ruleText, actor, timezone, policyId }) {
  const sourceText = String(ruleText || '').trim();
  const normalizedText = normalizeRuleText(sourceText);
  if (!normalizedText) {
    throw new Error('Rule text is required.');
  }

  const ignoreMatch = IGNORE_SURFACE_AT_TIME_RE.exec(normalizedText);
  if (ignoreMatch) {
    return compileIgnoreSurfaceAtTime({
      sourceText,
      normalizedText,
      match: ignoreMatch,
      policyId,
      actor,
      timezone
    });
  }

  const confirmationMatch = REQUIRE_CONFIRMATION_BEFORE_METHOD_RE.exec(normalizedText);
  if (confirmationMatch) {
    return compileRequireConfirmationBeforeMethod({
      sourceText,
      normalizedText,
      match: confirmationMatch,
      policyId,
      actor
    });
  }

  throw new Error(
    `Rule does not match a strict control-surface policy template. Try '${IGNORE_SURFACE_AT_TIME_TEMPLATE}' or '${REQUIRE_CONFIRMATION_BEFORE_METHOD_TEMPLATE}'.`
  );
}

function buildPolicyBundleRecord(policy, scope, source = 'operator_profile') {
  const policyBundle = {
    kind: 'control_surface_policy_bundle',
    version: CONTROL_SURFACE_IR_VERSION,
    policy_id: policy.policy_id,
    ir_version: policy.version,
    natural_language_rules: [policy.source_text],
    compiled_policy_cid: policy.compiled_policy_cid,
    compiled_policy: policy,
    compiled_artifacts: policy.compiled_artifacts,
    compiled_artifact_refs: [
      { artifact_type: 'source_text', cid: stableCid(policy.source_text, 'policy_artifact'), media_type: 'text/plain' },
      { artifact_type: 'frame_logic', cid: stableCid(policy.facts, 'policy_artifact'), media_type: 'application/json' },
      { artifact_type: 'deontic_policy', cid: stableCid(policy.norms, 'policy_artifact'), media_type: 'application/json' },
      { artifact_type: 'explanation', cid: stableCid(policy.explanations, 'policy_artifact'), media_type: 'application/json' }
    ],
    explanation: policy.explanations.join('\n'),
    explanations: policy.explanations
  };
  const policyCid = stableCid(policyBundle, 'policy_bundle');
  const policyBundleRef = {
    policy_id: policy.policy_id,
    policy_cid: policyCid,
    version: policy.version,
    scope,
    source
  };

  return {
    policy_cid: policyCid,
    compiled_policy_cid: policy.compiled_policy_cid,
    policy_bundle_ref: policyBundleRef,
    policy_bundle: policyBundle,
    compiled_artifacts: {
      source_text: policy.source_text,
      frame_logic: policy.facts,
      event_calculus: policy.compiled_artifacts.event_calculus,
      deontic_policy: policy.norms,
      explanation: policy.explanations
    }
  };
}

function frameFactsFromEnvelope(envelope) {
  const actor = envelope.actor || {};
  const intent = envelope.normalized_intent || {};
  const context = envelope.context || {};
  const facts = [
    frameFact('actor', `actor:${actor.id || actor.type || 'unknown'}`, 'actor.type', actor.type || 'user', {
      actor_id: actor.id || '',
      delegation_chain: actor.delegation_chain || []
    }),
    frameFact('surface', `surface:${envelope.surface || ''}`, 'surface.id', envelope.surface || ''),
    frameFact('event', `event:${envelope.surface_event || ''}`, 'surface_event', envelope.surface_event || '', {
      surface: envelope.surface || ''
    }),
    frameFact('method', `method:${intent.method || ''}`, 'intent.method', intent.method || '', {
      intent: intent.intent || ''
    }),
    frameFact('target', intent.target_ref || 'target:unknown', 'intent.target_ref', intent.target_ref || '', {
      method: intent.method || ''
    })
  ];

  for (const stateFrame of context.state_frames || []) {
    facts.push(frameFact('context', 'context:state_frames', 'state_frame', stateFrame));
  }
  if (context.device_mode) {
    facts.push(frameFact('context', 'context:device_mode', 'device_mode', context.device_mode));
  }
  if (context.local_time) {
    facts.push(frameFact('context', 'context:time', 'local_time', context.local_time));
  }
  return facts;
}

function sampleArgumentsForMethod(method) {
  if (method === 'send_message') {
    return {
      recipient: 'operator-review@example.local',
      body: 'Confirmation-gated message from the Hallucinate App shell.'
    };
  }
  if (method === 'activate') {
    return { source: 'operator_console', target_state: 'active' };
  }
  return { source: 'operator_console' };
}

function buildInteractionEnvelopeForNorm(rule, norm, payload = {}) {
  const method = payload.method || (norm.method === '*' ? 'activate' : norm.method);
  const targetRef = payload.target_ref || (norm.target_ref === '*' ? 'target:operator-console' : norm.target_ref);
  const createdAt = utcNow();
  return {
    interaction_id: stableControlSurfaceId('interaction', 'operator_console', rule.rule_id, method, targetRef, createdAt),
    surface: payload.surface || (norm.surface === '*' ? 'operator_console' : norm.surface),
    surface_event: payload.surface_event || (norm.surface_event === '*' ? 'confirmation_gate' : norm.surface_event),
    raw_payload: {
      source: 'operator_console',
      policy_rule_id: rule.rule_id,
      requested_action: payload.action_label || `${method} -> ${targetRef}`
    },
    normalized_intent: {
      intent: payload.intent || norm.metadata?.slots?.intent || 'operator.request',
      method,
      target_ref: targetRef,
      arguments: payload.arguments || sampleArgumentsForMethod(method),
      confidence: Number(payload.confidence || 1.0)
    },
    actor: actorIdentity(payload.actor || rule.actor),
    context: {
      local_time: createdAt,
      state_frames: payload.state_frames || [],
      device_mode: 'operator_console',
      platform: 'hallucinate_app',
      timezone: rule.timezone || DEFAULT_OPERATOR_TIMEZONE
    }
  };
}

function activePolicyRefs() {
  return controlSurfaceState.rules.map((rule) => ({
    policy_bundle_ref: rule.policy_bundle_ref,
    compiled_policy_cid: rule.compiled_policy_cid
  }));
}

function buildPolicyDecision(rule, envelope, norm) {
  const selectedOutcome = norm.outcome;
  const effect = {
    ...norm.effect,
    arguments: { ...(envelope.normalized_intent.arguments || {}) },
    method: envelope.normalized_intent.method,
    target_ref: envelope.normalized_intent.target_ref,
    confirmation_required: selectedOutcome === 'require_confirmation'
  };
  const decidedAt = utcNow();
  const decisionId = stableControlSurfaceId(
    'decision',
    envelope.interaction_id,
    selectedOutcome,
    norm.norm_id,
    rule.compiled_policy_cid
  );

  return {
    decision_id: decisionId,
    interaction_id: envelope.interaction_id,
    interaction_envelope: envelope,
    outcome: selectedOutcome,
    policy_bundle_ref: rule.policy_bundle_ref,
    compiled_policy_cid: rule.compiled_policy_cid,
    decided_at: decidedAt,
    matched_norms: [
      {
        norm_id: norm.norm_id,
        outcome: norm.outcome,
        priority: norm.priority,
        policy_bundle_ref: rule.policy_bundle_ref,
        compiled_policy_cid: rule.compiled_policy_cid,
        logic_clause_refs: [rule.compiled_policy_cid],
        guard_refs: norm.guards.map((guard) => guard.guard_id),
        explanation: norm.explanation
      }
    ],
    effects: [effect],
    frame_facts: frameFactsFromEnvelope(envelope),
    reasons: [norm.explanation],
    explanation: norm.explanation,
    confidence: 1.0,
    metadata: {
      mediator_version: CONTROL_SURFACE_MEDIATOR_VERSION,
      conflict_resolution: 'deny_over_permit',
      can_execute: selectedOutcome === 'allow',
      requires_confirmation: selectedOutcome === 'require_confirmation',
      active_policy_count: controlSurfaceState.rules.length,
      matched_norm_count: 1,
      selected_norm_id: norm.norm_id,
      event_calculus: norm.guards.flatMap((guard) => guard.event_calculus || []),
      policy_refs_considered: activePolicyRefs()
    }
  };
}

function createConfirmationRequest(rule, payload = {}) {
  const norm = rule.policy.norms.find((item) => item.outcome === 'require_confirmation');
  if (!norm) {
    throw new Error('Selected policy does not contain a confirmation-gated norm.');
  }
  const envelope = buildInteractionEnvelopeForNorm(rule, norm, payload);
  const decision = buildPolicyDecision(rule, envelope, norm);
  const createdAt = utcNow();
  const confirmation = {
    confirmation_id: stableControlSurfaceId('confirmation', decision.decision_id, createdAt),
    status: 'pending',
    created_at: createdAt,
    resolved_at: '',
    requested_by: 'operator_console',
    policy_rule_id: rule.rule_id,
    action_label: payload.action_label || `${envelope.normalized_intent.method} on ${envelope.normalized_intent.target_ref}`,
    interaction_envelope: envelope,
    policy_decision: decision
  };
  controlSurfaceState.confirmations.unshift(confirmation);
  return confirmation;
}

function buildMediationReceipt(confirmation, approved, operatorId) {
  const decision = confirmation.policy_decision;
  const envelope = confirmation.interaction_envelope;
  const emittedAt = utcNow();
  const policyRefs = [
    ...decision.metadata.policy_refs_considered,
    {
      policy_bundle_ref: decision.policy_bundle_ref,
      compiled_policy_cid: decision.compiled_policy_cid,
      matched_norm_refs: decision.matched_norms.map((match) => match.norm_id)
    }
  ];
  const dedupedRefs = [];
  const seen = new Set();
  for (const ref of policyRefs) {
    const key = `${ref.policy_bundle_ref?.policy_cid || ''}:${ref.compiled_policy_cid || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedupedRefs.push(ref);
    }
  }

  const receipt = {
    receipt_id: stableControlSurfaceId('receipt', decision.decision_id, envelope.interaction_id, decision.outcome, emittedAt),
    receipt_cid: '',
    emitted_at: emittedAt,
    control_surface_contract_ref: CONTROL_SURFACE_CONTRACT_REF,
    interaction_envelope: envelope,
    policy_decision: decision,
    policy_refs: dedupedRefs,
    mediation_result: {
      outcome: decision.outcome,
      invoked: Boolean(approved),
      approved: Boolean(approved),
      can_execute: Boolean(approved),
      requires_confirmation: decision.outcome === 'require_confirmation',
      method: envelope.normalized_intent.method,
      target_ref: envelope.normalized_intent.target_ref,
      blocked_reason: approved ? '' : 'operator rejected confirmation-gated action'
    },
    explanation: approved
      ? `Operator approved confirmation-gated action ${confirmation.action_label}.`
      : `Operator rejected confirmation-gated action ${confirmation.action_label}.`,
    receipt_links: {
      confirmation_id: confirmation.confirmation_id,
      policy_rule_id: confirmation.policy_rule_id
    },
    metadata: {
      surface: envelope.surface,
      normalized_intent: envelope.normalized_intent,
      actor: envelope.actor,
      context: envelope.context,
      operator_id: operatorId || DEFAULT_OPERATOR_ACTOR,
      control_surface: 'operator_console',
      policy_ref_count: dedupedRefs.length
    }
  };
  receipt.receipt_cid = stableCid(receipt, 'mediation_receipt');
  return receipt;
}

function createControlSurfaceRule(payload = {}) {
  const actor = String(payload.actor || DEFAULT_OPERATOR_ACTOR).trim();
  const scope = String(payload.scope || DEFAULT_OPERATOR_SCOPE).trim();
  const timezone = String(payload.timezone || DEFAULT_OPERATOR_TIMEZONE).trim();
  const compiled = compileControlSurfacePolicyRule({
    ruleText: payload.ruleText,
    actor,
    timezone,
    policyId: payload.policyId
  });
  const bundleRecord = buildPolicyBundleRecord(compiled.policy, scope, 'operator_profile');
  const createdAt = utcNow();
  const rule = {
    rule_id: stableControlSurfaceId('rule', compiled.policy.policy_id, bundleRecord.policy_cid, createdAt),
    created_at: createdAt,
    status: 'active',
    actor,
    scope,
    timezone,
    rule_text: compiled.policy.source_text,
    compiler_lane: STRICT_TEMPLATE_COMPILER_LANE,
    matched_template: compiled.matched_template,
    confidence: compiled.confidence,
    slots: compiled.slots,
    policy: compiled.policy,
    policy_cid: bundleRecord.policy_cid,
    compiled_policy_cid: bundleRecord.compiled_policy_cid,
    policy_bundle_ref: bundleRecord.policy_bundle_ref,
    policy_bundle: bundleRecord.policy_bundle,
    compiled_artifacts: bundleRecord.compiled_artifacts
  };

  controlSurfaceState.rules.unshift(rule);
  if (payload.queueSample !== false && rule.policy.norms.some((norm) => norm.outcome === 'require_confirmation')) {
    createConfirmationRequest(rule, {
      action_label: `Sample confirmation for ${rule.policy.norms[0].method}`
    });
  }
  return {
    rule: cloneForIpc(rule),
    snapshot: getControlSurfaceSnapshot()
  };
}

function findConfirmationRule(method = '') {
  return controlSurfaceState.rules.find((rule) =>
    rule.policy.norms.some((norm) =>
      norm.outcome === 'require_confirmation'
      && (!method || norm.method === method || norm.method === '*')
    )
  );
}

function simulateConfirmationAction(payload = {}) {
  let rule = findConfirmationRule(payload.method || '');
  if (!rule) {
    createControlSurfaceRule({
      ruleText: 'require confirmation before sending messages',
      actor: payload.actor || DEFAULT_OPERATOR_ACTOR,
      timezone: payload.timezone || DEFAULT_OPERATOR_TIMEZONE,
      scope: payload.scope || DEFAULT_OPERATOR_SCOPE,
      queueSample: false
    });
    rule = findConfirmationRule(payload.method || 'send_message');
  }
  const confirmation = createConfirmationRequest(rule, payload);
  return {
    confirmation: cloneForIpc(confirmation),
    snapshot: getControlSurfaceSnapshot()
  };
}

function resolveControlSurfaceConfirmation(confirmationId, approved, operatorId = DEFAULT_OPERATOR_ACTOR) {
  const confirmation = controlSurfaceState.confirmations.find((item) => item.confirmation_id === confirmationId);
  if (!confirmation) {
    throw new Error(`Unknown confirmation request: ${confirmationId}`);
  }
  if (confirmation.status !== 'pending') {
    throw new Error(`Confirmation request is already ${confirmation.status}.`);
  }

  confirmation.status = approved ? 'approved' : 'rejected';
  confirmation.resolved_at = utcNow();
  confirmation.resolved_by = operatorId;
  const receipt = buildMediationReceipt(confirmation, approved, operatorId);
  controlSurfaceState.receipts.unshift(receipt);
  return {
    confirmation: cloneForIpc(confirmation),
    receipt: cloneForIpc(receipt),
    snapshot: getControlSurfaceSnapshot()
  };
}

function getControlSurfaceSnapshot() {
  const pending = controlSurfaceState.confirmations.filter((item) => item.status === 'pending');
  const policyRefs = activePolicyRefs();
  return cloneForIpc({
    control_surface_contract_ref: CONTROL_SURFACE_CONTRACT_REF,
    operator_shell: {
      evidence_terms: [
        HALLUCINATE_APP_OPERATOR_CONSOLE_EVIDENCE,
        ORB_DISPLAY_HARNESS_EVIDENCE
      ],
      workflows: OPERATOR_SHELL_WORKFLOWS
    },
    diagnostics: {
      operator_console: HALLUCINATE_APP_OPERATOR_CONSOLE_EVIDENCE,
      display_harness: ORB_DISPLAY_HARNESS_EVIDENCE,
      control_surface: 'operator_console',
      compiler_lane: STRICT_TEMPLATE_COMPILER_LANE,
      mediator_version: CONTROL_SURFACE_MEDIATOR_VERSION,
      active_rule_count: controlSurfaceState.rules.length,
      compiled_policy_count: controlSurfaceState.rules.length,
      active_policy_ref_count: policyRefs.length,
      pending_confirmation_count: pending.length,
      receipt_count: controlSurfaceState.receipts.length,
      last_compiled_policy_cid: controlSurfaceState.rules[0]?.compiled_policy_cid || '',
      last_receipt_cid: controlSurfaceState.receipts[0]?.receipt_cid || ''
    },
    active_policy_refs: policyRefs,
    rules: controlSurfaceState.rules,
    pending_confirmations: pending,
    confirmations: controlSurfaceState.confirmations,
    receipts: controlSurfaceState.receipts
  });
}

ipcMain.handle('controlSurface:getSnapshot', async () => {
  return getControlSurfaceSnapshot();
});

ipcMain.handle('controlSurface:createRule', async (event, payload) => {
  return createControlSurfaceRule(payload);
});

ipcMain.handle('controlSurface:simulateConfirmation', async (event, payload) => {
  return simulateConfirmationAction(payload);
});

ipcMain.handle('controlSurface:approveConfirmation', async (event, confirmationId, operatorId) => {
  return resolveControlSurfaceConfirmation(confirmationId, true, operatorId);
});

ipcMain.handle('controlSurface:rejectConfirmation', async (event, confirmationId, operatorId) => {
  return resolveControlSurfaceConfirmation(confirmationId, false, operatorId);
});

// Create a window for the benchmark dashboard
const createBenchmarkWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    title: 'IPFS Python Modules - Benchmark Dashboard',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  win.loadFile(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'benchmark_dashboard.html'));
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Create a window for the test interface
const createTestWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    title: 'IPFS HuggingFace Bridge - Module Testing',
    icon: path.join(__dirname, 'hallucinate_app', 'node', 'assets', 'icon.png')
  });

  win.loadFile(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'test_interface.html'));
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Create main application window
const createWindow = () => {
  try {
    logInfo('WINDOW_CREATE', 'Creating main window (SwissKnife)...');
    // Create the SwissKnife virtual desktop as the default window
    mainWindow = createSwissKnifeWindow();
    
    // Add error handlers
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      logError('WINDOW_LOAD_FAIL', new Error(errorDescription), { errorCode, url: validatedURL });
    });
    
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const levelMap = { 0: 'INFO', 1: 'WARN', 2: 'ERROR' };
      if (level === 2) {
        logError('RENDERER_CONSOLE', new Error(message), { line, sourceId });
      }
    });
    
    mainWindow.webContents.on('render-process-gone', (event, details) => {
      logError('RENDERER_CRASH', new Error('Renderer process crashed'), details);
    });
    
    // Open the DevTools in development
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
    
    logInfo('WINDOW_CREATE', 'Main window created successfully');
    return mainWindow;
  } catch (error) {
    logError('WINDOW_CREATE', error);
    throw error;
  }
};

// Create a window for the IPFS Kit Dashboard
const createIPFSKitDashboardWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    title: 'IPFS Kit Dashboard',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  win.loadFile(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'ipfs_kit_dashboard.html'));
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Create a window for the MCP Daemon Manager
const createDaemonManagerWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    title: 'MCP Daemon Manager',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  // Create simple HTML content for daemon manager
  const daemonManagerHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:*">
  <title>MCP Daemon Manager</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      text-align: center;
      margin-bottom: 30px;
    }
    .daemon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .daemon-card {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 20px;
      backdrop-filter: blur(10px);
    }
    .daemon-card h2 {
      margin-top: 0;
      font-size: 1.5em;
    }
    .status {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
      margin-bottom: 15px;
    }
    .status.running { background: #10b981; }
    .status.stopped { background: #ef4444; }
    .status.starting { background: #f59e0b; }
    .status.error { background: #dc2626; }
    .info-row {
      margin: 8px 0;
      display: flex;
      justify-content: space-between;
    }
    .buttons {
      margin-top: 15px;
      display: flex;
      gap: 10px;
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      transition: opacity 0.2s;
    }
    button:hover {
      opacity: 0.8;
    }
    .btn-start { background: #10b981; color: white; }
    .btn-stop { background: #ef4444; color: white; }
    .btn-restart { background: #f59e0b; color: white; }
    .controls {
      text-align: center;
      margin: 30px 0;
    }
    .controls button {
      padding: 15px 30px;
      font-size: 1.1em;
      margin: 0 10px;
    }
    .logs {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
      padding: 20px;
      max-height: 300px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }
    .log-entry {
      margin: 5px 0;
      padding: 5px;
      border-left: 3px solid #667eea;
      padding-left: 10px;
    }
    .log-entry.error {
      border-left-color: #ef4444;
      color: #fca5a5;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔧 MCP Daemon Manager</h1>
    
    <div class="controls">
      <button class="btn-start" onclick="startAll()">🚀 Start All Daemons</button>
      <button class="btn-stop" onclick="stopAll()">🛑 Stop All Daemons</button>
      <button class="btn-restart" onclick="refreshStatus()">🔄 Refresh Status</button>
    </div>
    
    <div class="daemon-grid" id="daemon-grid">
      <!-- Daemon cards will be inserted here -->
    </div>
    
    <h2>📋 Event Log</h2>
    <div class="logs" id="event-log">
      <div class="log-entry">Daemon manager initialized</div>
    </div>
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    
    function updateDaemonStatus() {
      // In a real implementation, this would query the daemon manager
      // For now, we'll create a placeholder
      const daemons = [
        { id: 'ipfs-kit', name: 'IPFS Kit MCP', port: 3001, status: 'running' },
        { id: 'ipfs-datasets', name: 'IPFS Datasets MCP', port: 3002, status: 'running' },
        { id: 'ipfs-accelerate', name: 'IPFS Accelerate MCP', port: 3003, status: 'running' }
      ];
      
      const grid = document.getElementById('daemon-grid');
      grid.innerHTML = daemons.map(daemon => \`
        <div class="daemon-card">
          <h2>\${daemon.name}</h2>
          <span class="status \${daemon.status}">\${daemon.status.toUpperCase()}</span>
          <div class="info-row">
            <span>Port:</span>
            <span>\${daemon.port}</span>
          </div>
          <div class="info-row">
            <span>ID:</span>
            <span>\${daemon.id}</span>
          </div>
          <div class="buttons">
            <button class="btn-start" onclick="startDaemon('\${daemon.id}')">Start</button>
            <button class="btn-stop" onclick="stopDaemon('\${daemon.id}')">Stop</button>
            <button class="btn-restart" onclick="restartDaemon('\${daemon.id}')">Restart</button>
          </div>
        </div>
      \`).join('');
    }
    
    function addLog(message, isError = false) {
      const log = document.getElementById('event-log');
      const entry = document.createElement('div');
      entry.className = 'log-entry' + (isError ? ' error' : '');
      const time = new Date().toLocaleTimeString();
      entry.textContent = \`[\${time}] \${message}\`;
      log.insertBefore(entry, log.firstChild);
    }
    
    function startAll() {
      addLog('Starting all daemons...');
    }
    
    function stopAll() {
      addLog('Stopping all daemons...');
    }
    
    function refreshStatus() {
      addLog('Refreshing status...');
      updateDaemonStatus();
    }
    
    function startDaemon(id) {
      addLog(\`Starting daemon: \${id}\`);
    }
    
    function stopDaemon(id) {
      addLog(\`Stopping daemon: \${id}\`);
    }
    
    function restartDaemon(id) {
      addLog(\`Restarting daemon: \${id}\`);
    }
    
    // Initial status update
    updateDaemonStatus();
    
    // Auto-refresh every 10 seconds
    setInterval(updateDaemonStatus, 10000);
  </script>
</body>
</html>
  `;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(daemonManagerHTML)}`);
  
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

let operatorConsoleWindow = null;

// Create a window for control_surface policy, confirmation, and receipt diagnostics
const createOperatorConsoleWindow = () => {
  if (operatorConsoleWindow && !operatorConsoleWindow.isDestroyed()) {
    operatorConsoleWindow.focus();
    return operatorConsoleWindow;
  }

  const win = new BrowserWindow({
    width: 1360,
    height: 940,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    title: HALLUCINATE_APP_OPERATOR_CONSOLE_EVIDENCE,
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  operatorConsoleWindow = win;
  win.on('closed', () => {
    operatorConsoleWindow = null;
  });

  const operatorConsoleHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;">
  <title>${HALLUCINATE_APP_OPERATOR_CONSOLE_EVIDENCE}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #17202a;
      --muted: #65717f;
      --line: #d9dee7;
      --accent: #0f766e;
      --accent-dark: #115e59;
      --danger: #b42318;
      --warning: #b45309;
      --ok: #15803d;
      --code: #101828;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 24px;
      padding: 18px 24px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1, h2, h3 { margin: 0; letter-spacing: 0; }
    h1 { font-size: 22px; font-weight: 650; }
    h2 { font-size: 16px; font-weight: 650; }
    h3 { font-size: 14px; font-weight: 650; color: var(--muted); }
    .muted { color: var(--muted); }
    .layout {
      display: grid;
      grid-template-columns: minmax(360px, 0.95fr) minmax(540px, 1.35fr);
      gap: 16px;
      padding: 16px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      min-width: 0;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
    }
    .panel-body { padding: 16px; }
    .stack { display: grid; gap: 16px; }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-weight: 600;
    }
    textarea,
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px 11px;
      color: var(--ink);
      background: #fff;
      font: inherit;
    }
    textarea {
      min-height: 84px;
      resize: vertical;
      grid-column: 1 / -1;
    }
    button {
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 9px 12px;
      font-weight: 650;
      cursor: pointer;
      background: #eef2f6;
      color: var(--ink);
    }
    button.primary {
      background: var(--accent);
      color: white;
    }
    button.primary:hover { background: var(--accent-dark); }
    button.danger {
      background: #fee4e2;
      color: var(--danger);
      border-color: #fecdca;
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.58;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: 10px;
    }
    .stat {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fbfcfe;
    }
    .stat strong {
      display: block;
      font-size: 22px;
      margin-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0;
      background: #fbfcfe;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      background: #e6f4f1;
      color: var(--accent-dark);
    }
    .badge.warning {
      background: #fffaeb;
      color: var(--warning);
    }
    .badge.ok {
      background: #ecfdf3;
      color: var(--ok);
    }
    .badge.danger {
      background: #fee4e2;
      color: var(--danger);
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      overflow: auto;
      max-height: 460px;
      border-radius: 8px;
      padding: 12px;
      color: #e5e7eb;
      background: var(--code);
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .notice {
      min-height: 20px;
      color: var(--muted);
    }
    .error { color: var(--danger); }
    .success { color: var(--ok); }
    .empty {
      color: var(--muted);
      padding: 16px;
      border: 1px dashed var(--line);
      border-radius: 8px;
      background: #fbfcfe;
    }
    @media (max-width: 980px) {
      .layout { grid-template-columns: 1fr; }
      .stats { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .form-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${HALLUCINATE_APP_OPERATOR_CONSOLE_EVIDENCE}</h1>
      <div class="muted">Policy controls, confirmation mediation, and receipt diagnostics for multimodal actions.</div>
    </div>
    <div class="actions">
      <button id="refresh-btn">Refresh</button>
      <button id="simulate-btn">Queue Confirmation</button>
    </div>
  </header>

  <main class="layout">
    <section class="stack">
      <div class="panel">
        <div class="panel-header">
          <h2>Create Policy Rule</h2>
          <span class="badge">strict_template</span>
        </div>
        <div class="panel-body">
          <form id="rule-form" class="form-grid">
            <label>
              Rule text
              <textarea id="rule-text">require confirmation before sending messages</textarea>
            </label>
            <label>
              Actor
              <input id="actor" value="user:*">
            </label>
            <label>
              Scope
              <input id="scope" value="operator:desktop">
            </label>
            <label>
              Timezone
              <input id="timezone" value="America/Los_Angeles">
            </label>
            <label>
              Policy ID
              <input id="policy-id" placeholder="optional">
            </label>
            <div class="actions" style="grid-column: 1 / -1;">
              <button class="primary" type="submit">Compile Rule</button>
              <span id="form-status" class="notice"></span>
            </div>
          </form>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2>Diagnostics</h2>
          <span id="contract-ref" class="muted"></span>
        </div>
        <div class="panel-body">
          <div class="stats" id="diagnostics"></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2>Confirmation Queue</h2>
          <span id="pending-count" class="badge warning">0 pending</span>
        </div>
        <div class="panel-body" id="confirmations"></div>
      </div>
    </section>

    <section class="stack">
      <div class="panel">
        <div class="panel-header">
          <h2>Compiled Policies</h2>
          <span id="policy-count" class="badge">0 policies</span>
        </div>
        <div class="panel-body" id="policies"></div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2>Compiled Artifact Inspector</h2>
          <span id="artifact-title" class="muted">No policy selected</span>
        </div>
        <div class="panel-body">
          <pre id="artifact-json">{}</pre>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2>Mediation Receipts</h2>
          <span id="receipt-count" class="badge ok">0 receipts</span>
        </div>
        <div class="panel-body" id="receipts"></div>
      </div>
    </section>
  </main>

  <script>
    var api = window.electronAPI && window.electronAPI.controlSurface;
    var snapshot = null;
    var selectedRuleId = "";

    function byId(id) {
      return document.getElementById(id);
    }

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function shortRef(value) {
      var text = String(value || "");
      if (text.length <= 28) return text;
      return text.slice(0, 18) + "..." + text.slice(-8);
    }

    function setStatus(message, className) {
      var node = byId("form-status");
      node.className = "notice " + (className || "");
      node.textContent = message || "";
    }

    async function refresh() {
      if (!api) {
        setStatus("control_surface IPC bridge is unavailable.", "error");
        return;
      }
      snapshot = await api.getSnapshot();
      render();
    }

    function render() {
      if (!snapshot) return;
      byId("contract-ref").textContent = snapshot.control_surface_contract_ref;
      renderDiagnostics();
      renderPolicies();
      renderConfirmations();
      renderReceipts();
      renderSelectedArtifact();
    }

    function renderDiagnostics() {
      var d = snapshot.diagnostics || {};
      var items = [
        ["Rules", d.active_rule_count || 0],
        ["Compiled", d.compiled_policy_count || 0],
        ["Pending", d.pending_confirmation_count || 0],
        ["Receipts", d.receipt_count || 0]
      ];
      byId("diagnostics").innerHTML = items.map(function(item) {
        return '<div class="stat"><strong>' + escapeHtml(item[1]) + '</strong><span class="muted">' + escapeHtml(item[0]) + '</span></div>';
      }).join("");
    }

    function renderPolicies() {
      var rules = snapshot.rules || [];
      byId("policy-count").textContent = rules.length + " policies";
      if (!rules.length) {
        byId("policies").innerHTML = '<div class="empty">No operator policy rules have been compiled yet.</div>';
        return;
      }
      var rows = rules.map(function(rule) {
        var outcome = rule.policy && rule.policy.norms && rule.policy.norms[0] ? rule.policy.norms[0].outcome : "";
        var badgeClass = outcome === "require_confirmation" ? "warning" : outcome === "deny" ? "danger" : "";
        return '<tr>' +
          '<td><button onclick="selectRule(\\'' + escapeHtml(rule.rule_id) + '\\')">Inspect</button></td>' +
          '<td>' + escapeHtml(rule.rule_text) + '<br><span class="muted">' + escapeHtml(rule.matched_template) + '</span></td>' +
          '<td><span class="badge ' + badgeClass + '">' + escapeHtml(outcome) + '</span></td>' +
          '<td title="' + escapeHtml(rule.compiled_policy_cid) + '">' + escapeHtml(shortRef(rule.compiled_policy_cid)) + '</td>' +
          '<td title="' + escapeHtml(rule.policy_cid) + '">' + escapeHtml(shortRef(rule.policy_cid)) + '</td>' +
        '</tr>';
      }).join("");
      byId("policies").innerHTML = '<table><thead><tr><th></th><th>Rule</th><th>Decision</th><th>Compiled CID</th><th>Bundle CID</th></tr></thead><tbody>' + rows + '</tbody></table>';
      if (!selectedRuleId && rules[0]) {
        selectedRuleId = rules[0].rule_id;
      }
    }

    function renderSelectedArtifact() {
      var rules = snapshot.rules || [];
      var rule = rules.find(function(item) { return item.rule_id === selectedRuleId; }) || rules[0];
      if (!rule) {
        byId("artifact-title").textContent = "No policy selected";
        byId("artifact-json").textContent = "{}";
        return;
      }
      selectedRuleId = rule.rule_id;
      byId("artifact-title").textContent = shortRef(rule.compiled_policy_cid);
      byId("artifact-json").textContent = JSON.stringify({
        policy_bundle_ref: rule.policy_bundle_ref,
        compiled_policy_cid: rule.compiled_policy_cid,
        compiled_artifacts: rule.compiled_artifacts,
        compiled_policy: rule.policy
      }, null, 2);
    }

    function renderConfirmations() {
      var pending = snapshot.pending_confirmations || [];
      byId("pending-count").textContent = pending.length + " pending";
      if (!pending.length) {
        byId("confirmations").innerHTML = '<div class="empty">No confirmation-gated actions are waiting for approval.</div>';
        return;
      }
      byId("confirmations").innerHTML = pending.map(function(item) {
        return '<div class="stack" style="gap: 8px; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid var(--line);">' +
          '<div><strong>' + escapeHtml(item.action_label) + '</strong></div>' +
          '<div class="muted">' + escapeHtml(item.policy_decision.outcome) + ' via ' + escapeHtml(shortRef(item.policy_decision.compiled_policy_cid)) + '</div>' +
          '<div class="actions">' +
            '<button class="primary" onclick="approveConfirmation(\\'' + escapeHtml(item.confirmation_id) + '\\')">Approve</button>' +
            '<button class="danger" onclick="rejectConfirmation(\\'' + escapeHtml(item.confirmation_id) + '\\')">Reject</button>' +
          '</div>' +
        '</div>';
      }).join("");
    }

    function renderReceipts() {
      var receipts = snapshot.receipts || [];
      byId("receipt-count").textContent = receipts.length + " receipts";
      if (!receipts.length) {
        byId("receipts").innerHTML = '<div class="empty">Approve or reject a confirmation to emit a mediation receipt.</div>';
        return;
      }
      byId("receipts").innerHTML = receipts.map(function(receipt) {
        return '<details style="margin-bottom: 10px;">' +
          '<summary><strong>' + escapeHtml(receipt.mediation_result.outcome) + '</strong> ' +
          '<span class="muted">' + escapeHtml(shortRef(receipt.receipt_cid)) + ' at ' + escapeHtml(receipt.emitted_at) + '</span></summary>' +
          '<pre style="margin-top: 8px;">' + escapeHtml(JSON.stringify(receipt, null, 2)) + '</pre>' +
        '</details>';
      }).join("");
    }

    window.selectRule = function(ruleId) {
      selectedRuleId = ruleId;
      renderSelectedArtifact();
    };

    window.approveConfirmation = async function(confirmationId) {
      await api.approveConfirmation(confirmationId, byId("actor").value || "user:*");
      setStatus("Confirmation approved and receipt emitted.", "success");
      await refresh();
    };

    window.rejectConfirmation = async function(confirmationId) {
      await api.rejectConfirmation(confirmationId, byId("actor").value || "user:*");
      setStatus("Confirmation rejected and receipt emitted.", "success");
      await refresh();
    };

    byId("rule-form").addEventListener("submit", async function(event) {
      event.preventDefault();
      try {
        setStatus("Compiling policy rule...");
        var result = await api.createRule({
          ruleText: byId("rule-text").value,
          actor: byId("actor").value,
          scope: byId("scope").value,
          timezone: byId("timezone").value,
          policyId: byId("policy-id").value
        });
        selectedRuleId = result.rule.rule_id;
        setStatus("Policy compiled: " + shortRef(result.rule.compiled_policy_cid), "success");
        snapshot = result.snapshot;
        render();
      } catch (error) {
        setStatus(error && error.message ? error.message : String(error), "error");
      }
    });

    byId("refresh-btn").addEventListener("click", refresh);
    byId("simulate-btn").addEventListener("click", async function() {
      try {
        var result = await api.simulateConfirmation({
          actor: byId("actor").value || "user:*"
        });
        snapshot = result.snapshot;
        setStatus("Queued confirmation: " + shortRef(result.confirmation.confirmation_id), "success");
        render();
      } catch (error) {
        setStatus(error && error.message ? error.message : String(error), "error");
      }
    });

    refresh();
  </script>
</body>
</html>
  `;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(operatorConsoleHTML)}`);

  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }

  return win;
};

// Helper function to create MCP dashboard window
const createMCPDashboardWindow = (title, url, width = 1200, height = 800) => {
  const win = new BrowserWindow({
    width,
    height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    title,
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  win.loadURL(url);
  
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  return win;
};

// Create windows for specific MCP dashboards
const createIPFSKitDashboard = () => {
  return createMCPDashboardWindow('IPFS Kit MCP Dashboard', 'http://127.0.0.1:3001/dashboard');
};

const createIPFSDatasetsDashboard = () => {
  return createMCPDashboardWindow('IPFS Datasets MCP Dashboard', 'http://127.0.0.1:3002/dashboard');
};

const createIPFSAccelerateDashboard = () => {
  return createMCPDashboardWindow('IPFS Accelerate MCP Dashboard', 'http://127.0.0.1:3006/dashboard');
};

const createSwissKnifeMCPDashboard = () => {
  return createMCPDashboardWindow('SwissKnife MCP Dashboard', 'http://127.0.0.1:3004/dashboard');
};

// Create a window for SwissKnife Virtual Desktop
// Pass an optional `appName` (e.g. 'terminal', 'editor', 'files', 'chat', 'music', 'video')
// to deep-link into a specific app within the SwissKnife virtual desktop.
const createSwissKnifeWindow = (appName) => {
  const win = new BrowserWindow({
    width: 1400,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,           // Disabled for security
      contextIsolation: true,            // Enabled for security
      enableRemoteModule: false,         // Disabled for security
      webSecurity: true,                 // Enabled - use localhost server instead
      allowRunningInsecureContent: false, // Disabled for security
      preload: path.join(__dirname, 'preload.js'), // Secure IPC bridge
      sandbox: false                     // Disabled to allow preload script
    },
    title: 'hallucinate_app - IPFS HuggingFace Bridge',
    icon: path.join(__dirname, 'hallucinate_app', 'assets', 'icon.png')
  });

  // Load the main dashboard, optionally navigating to a specific app via hash
  win.loadFile(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'dashboard.html'), {
    hash: appName || ''
  });
  
  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  
  // Clear the mainWindow reference when closed (if this is the main window)
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });
  
  return win;
};

// Store reference to main window for navigation
let mainWindow = null;

// Helper function to navigate within the main window
const navigateToView = (viewPath) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(viewPath);
  }
};

// Setup IPC handlers for navigation and window management
ipcMain.on('open-daemon-manager', () => {
  navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'daemon_manager.html'));
});

ipcMain.on('open-model-tester', () => {
  navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'model_tester.html'));
});

ipcMain.on('open-security-test-dashboard', () => {
  navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'security_test_dashboard.html'));
});

ipcMain.on('open-database-backup-dashboard', () => {
  navigateToView(path.join(__dirname, 'hallucinate_app', 'node', 'views', 'database_backup_dashboard.html'));
});

ipcMain.on('open-operator-console', () => {
  createOperatorConsoleWindow();
});

// Global menu generator instance
let menuGenerator = null;

// Create application menu with programmatic generation
const createAppMenu = () => {
  // Initialize menu generator with necessary context
  menuGenerator = new MenuGenerator({
    daemonManager: daemonManager,
    navigateToView: navigateToView,
    createSwissKnifeWindow: createSwissKnifeWindow,
    createMCPDashboardWindow: createMCPDashboardWindow,
    mainWindow: mainWindow
  });
  
  // Generate and set the menu
  menuGenerator.generate();
  installControlSurfaceMenu();
  
  logInfo('MENU', 'Application menu generated programmatically');
};

const installControlSurfaceMenu = () => {
  const currentMenu = Menu.getApplicationMenu();
  if (!currentMenu || currentMenu.items.some((item) => item.label === 'Control Surface')) {
    return;
  }

  currentMenu.append(new MenuItem({
    label: 'Control Surface',
    submenu: [
      {
        label: 'Operator Console',
        accelerator: 'CmdOrCtrl+Shift+P',
        click: () => createOperatorConsoleWindow()
      },
      {
        label: 'Queue Confirmation Demo',
        click: () => {
          simulateConfirmationAction({});
          createOperatorConsoleWindow();
        }
      }
    ]
  }));
  Menu.setApplicationMenu(currentMenu);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', async () => {
  try {
    logInfo('APP_READY', 'Electron app ready, initializing...');
    
    // Start the SwissKnife web server
    await startSwissKnifeServer();
    
    logInfo('APP_READY', 'Creating window...');
    createWindow();

    logInfo('APP_READY', 'Creating menu...');
    createAppMenu();
    
    // Auto-start MCP daemons after a short delay
    setTimeout(async () => {
      try {
        logInfo('MCP_DAEMONS', 'Auto-starting MCP daemons...');
        await daemonManager.startAll();
        logInfo('MCP_DAEMONS', 'All daemons started');
      } catch (error) {
        logError('MCP_DAEMONS_START', error);
      }
    }, 2000);
  } catch (error) {
    logError('APP_READY', error);
    // Show error dialog
    const { dialog } = await import('electron');
    dialog.showErrorBox('Startup Error', `Failed to start application: ${error.message}\n\nCheck ${LOG_FILE} for details.`);
  }
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  logInfo('APP_LIFECYCLE', 'All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up daemons and server on quit
app.on('before-quit', async (event) => {
  event.preventDefault();
  
  try {
    logInfo('APP_QUIT', 'Shutting down MCP daemons...');
    await daemonManager.stopAll();
    
    // Stop SwissKnife web server
    if (swissKnifeServer) {
      swissKnifeServer.close(() => {
        logInfo('APP_QUIT', 'SwissKnife web server stopped');
      });
    }
    
    logInfo('APP_QUIT', 'Cleanup complete, exiting...');
    // Now actually quit
    app.exit(0);
  } catch (error) {
    logError('APP_QUIT', error);
    app.exit(1);
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  logInfo('APP_LIFECYCLE', 'App activated');
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
