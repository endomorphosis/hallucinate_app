# Multimodal Control Surface Logic IDL Plan

Daemon task-board path:

```text
hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md
```

This backlog is split into daemon-ingestible `HAO-` tasks. `HAO-000` through
`HAO-003` cover the bootstrap, canonical ownership, schema seed, and interaction
envelope that already exist in this workspace. `HAO-004` through `HAO-025`
decompose the remaining implementation into logic API integration, formal IR,
schema upgrades, strict and general rule compilation, event-calculus context
extraction, mediation, receipts, descriptor/ORB binding, surface-specific
adapters, operator UI, remote clients, tests, observability, and discovery.

Short commands from the `lift_coding` repo root:

```bash
PYTHONPATH=external/ipfs_datasets python3 scripts/hallucinate_multimodal_control_todo_daemon.py --once
PYTHONPATH=external/ipfs_datasets python3 scripts/hallucinate_multimodal_control_todo_supervisor.py --once
PYTHONPATH=external/ipfs_datasets python3 scripts/hallucinate_multimodal_control_autopilot.py
python3 scripts/hallucinate_multimodal_control_llm_router.py --task-id HAO-002
```

Equivalent explicit daemon/supervisor invocations:

```bash
PYTHONPATH=external/ipfs_datasets python3 scripts/virtual_ai_os_todo_daemon.py --todo-path hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md --task-prefix "## HAO-" --state-prefix hallucinate_multimodal_control --state-dir data/hallucinate_multimodal_control/state --worktree-root data/hallucinate_multimodal_control/worktrees --once
PYTHONPATH=external/ipfs_datasets python3 scripts/virtual_ai_os_todo_supervisor.py --todo-path hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md --task-prefix "## HAO-" --state-prefix hallucinate_multimodal_control --state-dir data/hallucinate_multimodal_control/state --worktree-root data/hallucinate_multimodal_control/worktrees --once
```

The `autopilot` entrypoint is the intended queue-draining command. It enables implementation mode for the Hallucinate supervisor, keeps work isolated in the configured worktree root, and turns repeated validation failures into evidence-backed follow-up HAO tasks instead of retrying the same broken check indefinitely.

## Purpose
This is the canonical implementation-plan document for bringing multimodal control-surface mediation into Hallucinate App, which is the AI operating system shell in this workspace.

`lift_coding` remains the Meta-glasses integration slice. The control-surface logic, policy mediation, and AI-OS runtime architecture should live here in `hallucinate_app`, with the glasses path treated as one remote and constrained client of the broader operating system.

## Objective
Upgrade the interface description layer so a single AI-OS interface can safely expose and mediate:
- voice commands,
- gesture controls,
- mouse clicks / touch selection,
- and AI-agent initiated actions,

against the same control surfaces and the same user-defined policy rules.

The design target is that a rule like "ignore my wrist gestures at night, because I'm sleeping" compiles into formal temporal-deontic policy, evaluates against runtime context, and blocks or reshapes the attempted invocation before the underlying method executes.

## Why Hallucinate App Is The Right Home
Hallucinate App is already the operator-facing runtime shell that packages and supervises:
- Swissknife as the virtual desktop surface,
- `ipfs_datasets_py` as the reasoning and data-processing substrate,
- `ipfs_accelerate_py` and `ipfs_kit_py` as supporting AI and infrastructure services,
- MCP daemons and orchestration logic,
- the desktop shell where policy, state, and agent activity are visible together.

That makes Hallucinate App the correct home for:
- canonical interface-description upgrades,
- runtime control-surface mediation,
- agent delegation policy,
- operator-facing explanation and auditing,
- and the shared AI-OS control plane.

The Meta-glasses path belongs downstream as one client and transport surface, not as the canonical owner of the control model.

## Existing Assets To Reuse

### AI-OS shell and orchestration assets in Hallucinate App
- `docs/ARCHITECTURE.md`
  - defines Hallucinate App as the wrapper and orchestration shell.
- `docs/MCP_DAEMON_ARCHITECTURE.md`
  - documents the daemon-managed runtime surface where policy-aware services can be supervised.
- `README.md`
  - already positions Hallucinate App as the operator console and virtual AI OS desktop shell.
- local submodule checkouts:
  - `swissknife/`
  - `ipfs_datasets_py/`
  - `ipfs_accelerate_py/`
  - `ipfs_kit_py/`

### Logic and policy assets in `ipfs_datasets_py`
- `ipfs_datasets_py/ipfs_datasets_py/logic/api.py`
  - stable public logic API surface.
- `ipfs_datasets_py/ipfs_datasets_py/logic/integration/nl_ucan_policy_compiler.py`
  - NL -> DCEC -> Policy + UCAN pipeline.
- `ipfs_datasets_py/ipfs_datasets_py/processors/legal_data/reasoner/hybrid_legal_ir.py`
  - frame-first IR with actions, events, states, temporal constraints, and norms.
- `ipfs_datasets_py/docs/logic/COMPREHENSIVE_LOGIC_REFACTORING_PLAN_2026_v16.md`
  - evidence that the relevant compiler, evaluator, cache, audit, and conflict-detection phases are complete enough to build on.

### UI and desktop assets in `swissknife`
- Swissknife should remain the principal user-facing virtual desktop and widget surface.
- The descriptor and ORB-side work for multimodal control should be implemented in the local `swissknife/` checkout bundled with Hallucinate App.

### Current Meta-glasses incubation note
Some Meta-glasses-specific descriptor and bridge work currently exists in the sibling `lift_coding` workspace slice. That work should be treated as an input to be absorbed into Hallucinate App, not as the final home of the AI-OS control model.

## Design Thesis
Do not create separate control contracts for voice, gesture, mouse, and agents.

Instead:
1. Keep one canonical interface descriptor for the service or widget.
2. Add an explicit multimodal control-surface contract to that descriptor.
3. Normalize all incoming interactions into one frame-first intent IR.
4. Compile natural-language user rules into temporal-deontic policy artifacts.
5. Evaluate every attempted interaction against those policy artifacts before invocation.
6. Emit a receipt that records the control surface, reasoning inputs, policy decision, and resulting action.

This keeps policy and mediation centralized in the AI-OS shell rather than scattering it across per-device adapters.

## Target Architecture
The target architecture has five layers.

### 1. Interface descriptor layer
Each interface descriptor remains the authoritative description of operations, schemas, permissions, and state projections, but gains a new multimodal mediation section.

### 2. Interaction normalization layer
Voice, gesture, mouse, and agent actions are translated into the same canonical interaction envelope and then into the frame-first IR.

### 3. Policy compilation layer
Natural-language rules are compiled by `ipfs_datasets_py` into temporal-deontic policy objects and optional delegation artifacts.

### 4. Runtime mediation layer
Before an interface method is invoked, Hallucinate App evaluates whether the normalized interaction is permitted, forbidden, required to confirm, rate-limited, rewritten, or rerouted.

### 5. Audit and explanation layer
Every decision yields a receipt containing the control-surface source, normalized intent, relevant context, policy references, and explanation metadata.

## Implementation Workstreams

### Workstream A: Logic-module contract
Pin the exact `ipfs_datasets_py.logic.api` symbols Hallucinate App depends on:
`compile_nl_to_policy`, `evaluate_nl_policy`, `NLUCANPolicyCompiler`,
`evaluate_with_manager`, conflict detection helpers, and any event-calculus,
deontic, or frame-logic helper that can be imported without heavy side effects.
This workstream produces a small adapter layer so the AI-OS does not import
private logic internals directly.

### Workstream B: Formal control policy IR
Define Hallucinate-owned dataclasses and schemas for:
- frame facts, such as actor, surface, target, method, state, and device facts,
- temporal guards, such as quiet hours, at-night windows, wake events, and grant expiry,
- deontic norms, such as permission, prohibition, obligation, confirmation, and delegation limits,
- policy bundles, containing natural-language source, compiled artifacts, CIDs, and explanations.

### Workstream C: Compiler lanes
Use two compiler lanes:
- a strict deterministic compiler for common operator rules such as
  "ignore my wrist gestures at night" and "require confirmation before sending",
- a general `ipfs_datasets_py` natural-language policy compiler adapter for freeform rules,
  with explanation output and clarification fallback when confidence or parse coverage is weak.

### Workstream D: Runtime mediation
Insert one policy decision point between normalized interaction envelopes and
interface method invocation. The decision point must be shared by voice,
gesture, pointer, agent, Meta-glasses, mobile, simulator, and ORB/MCP paths.
Supported outcomes are `allow`, `deny`, `require_confirmation`, `defer`,
`rewrite`, `fallback_surface`, and `rate_limit`.

### Workstream E: Receipts, audit, and operator control
Persist decision receipts that link the raw event, normalized intent, actor,
context facts, compiled policy references, result, and explanation. Surface
those receipts in Hallucinate App so operators can inspect, confirm, disable,
or revise policies without relying on device-specific tools.

### Workstream F: Surface adapters and tests
Bind voice, gesture, mouse/touch, and agent adapters to the same canonical
contract. Then adopt the same remote-surface envelope for Meta-glasses, mobile,
and simulator clients. Build a regression corpus that proves the same intent
from different surfaces reaches the same method gate and receives the same
policy decision.

## Proposed IDL Upgrade
Add a top-level descriptor section named `control_surface_contract`.

This must be supported first in the descriptor/runtime surfaces packaged by Hallucinate App, then mirrored to remote clients such as the Meta-glasses path.

Canonical schema artifacts:
- `hallucinate_app/swissknife/contracts/control_surface_contract.schema.json`
- `hallucinate_app/swissknife/contracts/interaction_envelope.schema.json`
- `hallucinate_app/swissknife/contracts/policy_decision.schema.json`
- `hallucinate_app/swissknife/contracts/mediation_receipt.schema.json`

The bundled `hallucinate_app/swissknife/` checkout is currently empty in this workspace, so `HAO-002` starts by defining the schema artifact there as the canonical source of truth that later descriptor builders and ORB surfaces will consume.

### Proposed descriptor shape
```json
{
  "control_surface_contract": {
    "version": "0.1.0",
    "control_surfaces": [
      {
        "id": "voice",
        "kind": "voice_command",
        "event_types": ["utterance", "confirm", "cancel"],
        "intent_resolver": "nl_policy_compiler",
        "confidence_policy": {
          "min_confidence": 0.85,
          "clarify_below": 0.92
        }
      },
      {
        "id": "gesture",
        "kind": "captouch_or_wrist",
        "event_types": ["tap", "swipe", "hold", "wrist_raise"],
        "intent_resolver": "gesture_mapping_table"
      },
      {
        "id": "mouse",
        "kind": "pointer",
        "event_types": ["click", "double_click", "hover", "focus"],
        "intent_resolver": "pointer_mapping_table"
      },
      {
        "id": "agent",
        "kind": "ai_agent",
        "event_types": ["proposal", "autonomous_invoke", "scheduled_action"],
        "intent_resolver": "structured_agent_intent"
      }
    ],
    "intent_bindings": [
      {
        "intent": "display.focus_next",
        "method": "focus_next",
        "allowed_surfaces": ["gesture", "mouse", "voice", "agent"]
      },
      {
        "intent": "display.activate",
        "method": "activate",
        "allowed_surfaces": ["gesture", "mouse", "voice", "agent"]
      }
    ],
    "policy_hooks": {
      "compile_api": "ipfs_datasets_py.logic.api.compile_nl_to_policy",
      "evaluate_api": "ipfs_datasets_py.logic.api.evaluate_nl_policy",
      "decision_receipt": true
    },
    "context_schema": {
      "state_frames": ["sleeping", "driving", "meeting", "screen_locked"],
      "time_context": true,
      "location_context": true,
      "device_context": true,
      "agent_identity": true
    },
    "conflict_resolution": {
      "default": "deny_over_permit",
      "requires_explanation": true,
      "requires_user_confirmation_for": ["destructive", "financial", "communication.send"]
    }
  }
}
```

### Formal policy binding fields
`HAO-006` upgrades the descriptor schemas so policy linkage is explicit instead
of implied by runtime adapters. The `control_surface_contract` schema now
requires `logic_bindings` at the contract level, on every control surface, and
on every intent/method binding. Each `logic_bindings[]` entry carries a
`policy_bundle_ref`, a `compiled_policy_cid`, selected frame-fact kinds, optional
norm and compiled artifact references, plus schema refs for
`interaction_envelope`, `policy_decision`, and `mediation_receipt`.

The runtime schemas mirror that chain:
- `interaction_envelope` may carry the selected `policy_bundle_ref`,
  `compiled_policy_cid`, and descriptor `logic_bindings` used for one attempted
  invocation.
- `policy_decision` records the evaluated `interaction_envelope`, matched norms,
  invocation effects, `policy_bundle_ref`, and `compiled_policy_cid`.
- `mediation_receipt` nests the `interaction_envelope` and `policy_decision`,
  then records `policy_refs` so audit storage can trace an outcome back to the
  policy bundle and compiled logic artifacts that mediated the method call.

### Swissknife descriptor and ORB binding

`HAO-014` binds the bundled Swissknife descriptor and ORB runtime to the same
pre-invocation mediation path. Swissknife MCP++ UI descriptors carry a
`control_surface_contract` generated from their operation contracts. The
contract declares the shared voice, gesture, mouse, and agent surfaces, maps
every descriptor operation through `intent_bindings`, and pins the policy hook
names to `hallucinate_app.control_surface_mediator.evaluate_control_surface_interaction`
with `mediation_receipt` emission enabled.

The Swissknife ORB capability router now normalizes every invocation into an
`interaction_envelope` before transport dispatch. The local `control_surface_mediator`
checks the descriptor's allowed surface and event bindings, emits a
`policy_decision`, attaches the resulting `mediation_receipt` to the ORB receipt,
and only then invokes the underlying local, HTTP, websocket, or MCP-server
transport. A denied or confirmation-blocked surface never reaches the interface
method handler.

Swissknife browser descriptor actions also stamp UI events with the same surface
context: mouse clicks use `mouse/click`, voice helpers use `voice/utterance`,
gesture helpers use `gesture` event names, and agent helpers use
`agent/autonomous_invoke`. Generated app command buttons expose the same
control-surface metadata so ORB-backed UI launches and agent-originated actions
flow through one policy-aware mediation path.

### VAIOS-G030 objective proof: interface descriptor language

This document is the scanner-visible interface descriptor language proof for the
IDL/ORB/MCP++ bridge objective. The interface descriptor language is the
`control_surface_contract` descriptor section and its paired
`interaction_envelope`, `policy_decision`, and `mediation_receipt` schemas. It
describes the control modalities, binds them to interface methods, names the
logic-policy hooks, and gives the ORB/MCP++ runtime one mediation point before
dispatch.

Current modality evidence:

| Modality | Descriptor evidence | Policy evidence | Dispatch evidence |
| --- | --- | --- | --- |
| Voice | `control_surface_contract.control_surfaces[].id == "voice"` with `utterance`, `confirm`, and `cancel` events in `hallucinate_app/swissknife/contracts/control_surface_contract.schema.json` and descriptor validation tests. | `control_surface_voice.py` applies confidence policy and sends voice envelopes through `evaluate_control_surface_interaction`; `test_control_surface_voice.py` covers clarification, denial, and confirmation policy. | `swissknife/test/mcp-plus-plus/mcp-orb-capability-router.test.ts` invokes the same ORB operation with `voice/utterance` and receives a mediation receipt before handler dispatch. |
| Gesture | `control_surface_contract` declares `gesture` with `tap`, `swipe`, `hold`, and `wrist_raise`; descriptor validation rejects unmapped or unsupported gesture events. | `control_surface_gesture.py` normalizes captouch/wearable events into the shared envelope; `test_control_surface_gesture.py` proves sleep/quiet-hours wrist policy denies before invocation. | The ORB capability-router test dispatches `gesture/tap` through the same mediated `control_surface_contract` path. |
| Mouse | `control_surface_contract` declares the `mouse` pointer surface with `click`, `double_click`, `hover`, and `focus` event bindings. | `control_surface_pointer.py` routes mouse/touch events through the shared mediator; `test_control_surface_pointer.py` covers confirmation gates for message and destructive actions. | The ORB capability-router test dispatches `mouse/click`, and denial coverage proves disallowed pointer surfaces do not reach local handlers. |
| Agent | `control_surface_contract` declares `agent` events for `proposal`, `autonomous_invoke`, and `scheduled_action`. | `control_surface_agents.py` adds delegation/UCAN checks on top of shared policy mediation; `test_control_surface_agents.py` proves proposal confirmation, authorized delegation, and overbroad delegation denial. | The ORB capability-router test dispatches `agent/autonomous_invoke` through the same contract and records an allow mediation receipt. |

No modality child goals are needed for this scan: each named control modality
has descriptor, policy, and dispatch evidence tied to the same interface
descriptor language and ORB/MCP++ mediation path.

## Canonical Runtime Envelope
Every control surface should normalize into one envelope before policy evaluation.

```json
{
  "interaction_id": "cid-or-uuid",
  "surface": "voice|gesture|mouse|agent",
  "surface_event": "utterance|tap|click|proposal",
  "raw_payload": {},
  "normalized_intent": {
    "intent": "display.activate",
    "method": "activate",
    "target_ref": "widget:primary-action",
    "arguments": {},
    "confidence": 0.94
  },
  "actor": {
    "type": "user|agent",
    "id": "...",
    "delegation_chain": []
  },
  "context": {
    "local_time": "2026-05-23T23:15:00-07:00",
    "state_frames": ["sleeping"],
    "device_mode": "quiet_hours",
    "platform": "hallucinate_app"
  }
}
```

This envelope becomes the common input to policy evaluation and the common source of audit receipts.

Current Hallucinate runtime surface:
- `python/hallucinate_app/control_surface_intents.py` defines the canonical `interaction_envelope` and `normalized_intent` helpers.
- `python/hallucinate_app/control_surface_context.py` defines the actor/context payloads that preserve `delegation_chain`, `state_frames`, and device/runtime metadata across voice, gesture, mouse, and agent inputs.
- `python/hallucinate_app/control_surface_logic_ir.py` defines the formal frame-first policy IR used between normalized envelopes and later compiler/mediation stages.

## Formal Control Policy IR

`control_surface_logic_ir.py` is the Hallucinate-owned intermediate
representation for multimodal control policy. It deliberately models UI,
device, and agent control concepts locally before any optional conversion into
`ipfs_datasets_py` logic helpers. This keeps surface adapters from importing
private `event_calculus`, deontic, or frame-logic internals directly.

The IR includes these stable objects:

- `FrameFact`: a frame-logic fact about an attempted invocation. Canonical fact
  kinds cover actors, surfaces, events, methods, targets, context facts, and
  device facts.
- `TemporalGuard`: an activation guard for context or time. Guard kinds cover
  active `state_frames`, named time windows such as quiet hours, event windows,
  grant expiry, and generic context facts. Each guard serializes symbolic
  `event_calculus` atoms such as `holds_at(...)` or `clipped(...)` for future
  guarded adapters.
- `DeonticOutcome`: the runtime decision vocabulary: `allow`, `deny`,
  `require_confirmation`, `defer`, `rewrite`, `fallback_surface`, and
  `rate_limit`.
- `InvocationEffect`: the target invocation effect attached to a norm. It
  records the method, target reference, arguments, optional rewrite method,
  fallback surface, confirmation requirement, rate-limit key, and reason.
- `ControlSurfaceNorm`: a deontic norm scoped over actor, surface,
  surface event, method, and target reference, plus temporal guards and a target
  `InvocationEffect`.
- `ControlSurfacePolicy`: a policy snapshot or bundle containing frame facts,
  ordered deontic norms, natural-language source text, compiled policy CIDs,
  compiled artifacts, and explanation strings.

### Policy bundle persistence
`control_surface_store.PolicyBundleStore` persists each `policy_bundle` as
canonical JSON under `data/hallucinate_multimodal_control/policies`. The stored
record keeps the natural-language source rules, the `compiled_policy` IR, any
optional `ipfs_datasets_py` artifacts retained by the compiler, stable
`policy_cid` and `compiled_policy_cid` references, the operator-facing
`explanation` text, and a separate user/profile attachment index that points
the active profile at the selected `policy_bundle_ref`.

The helper `frame_facts_from_interaction(envelope)` turns the canonical
`interaction_envelope` into frame facts before policy evaluation. For a wrist
gesture that attempts `display.activate` while `state_frames` include
`sleeping`, the resulting facts include:

```json
[
  {"kind": "actor", "predicate": "actor.type", "value": "user"},
  {"kind": "surface", "predicate": "surface.id", "value": "gesture"},
  {"kind": "event", "predicate": "surface_event", "value": "wrist_raise"},
  {"kind": "method", "predicate": "intent.method", "value": "activate"},
  {"kind": "target", "predicate": "intent.target_ref", "value": "widget:primary-action"},
  {"kind": "context", "predicate": "state_frame", "value": "sleeping"}
]
```

A rule like "Ignore my wrist gestures at night, because I'm sleeping" is
represented as a `ControlSurfaceNorm` with `DeonticOutcome.DENY`, `surface` set
to `gesture`, `surface_event` set to `wrist_raise`, guards for
`TemporalGuard.state_frame("sleeping")` and a quiet-hours `TemporalGuard`, and
an `InvocationEffect` targeting the attempted method. Later tasks can compile
or evaluate the same policy through `compile_nl_to_policy`,
`evaluate_nl_policy`, or guarded `event_calculus` adapters without changing the
IR shape.

## Logic Model

### Frame logic for structural meaning
Use the frame-first IR in `hybrid_legal_ir.py` to model:
- which interface method an interaction targets,
- which entity or widget it acts on,
- which actor initiated it,
- and which user/device state is currently active.

### Event calculus for temporal mediation
Use temporal constraints to express when an interaction should or should not be active.

Examples:
- ignore wrist gestures during quiet hours,
- allow wake-word voice commands only after a wake event,
- suppress agent actions while a confirmation window is open,
- expire grants after the user leaves a context.

### Deontic logic for normative decisions
Use deontic norms to express permission, prohibition, and obligation.

Examples:
- a mouse click may activate a button,
- a gesture must not trigger outbound communication while sleeping,
- an agent must request confirmation before sending a message.

## Natural-Language Rule Compilation
User-authored rules should be stored as natural language plus compiled policy artifacts, not translated into ad hoc booleans.

### Example rule
"Ignore my wrist gestures at night, because I'm sleeping."

### Desired compilation path
1. Parse the sentence into a frame-first norm.
2. Compile it into temporal-deontic policy clauses using `compile_nl_to_policy`.
3. Persist the compiled rule with a stable CID and explanation string.
4. Attach the policy CID to the active Hallucinate App operator/user profile.
5. Evaluate the rule for every gesture-originated interaction, including remote clients.

### Compiler strategy
Use a two-lane compiler.

#### Lane A: strict template compiler
Use constrained templates for high-confidence user rules tied to device and UI behavior.

Examples:
- "Ignore my {surface} at {time_window}."
- "Allow {surface} to {method} only when {state}."
- "Require confirmation before {method}."
- "Never let agents {method} unless I said yes."

#### Lane B: general natural-language compiler
Use the broader `NLUCANPolicyCompiler` pipeline for freeform user rules, with explanation output and clarification fallback.

## Runtime Decisions
A policy result must be richer than allow or deny.

Supported runtime outcomes should include:
- `allow`
- `deny`
- `require_confirmation`
- `defer`
- `rewrite`
- `fallback_surface`
- `rate_limit`

## Operational Safety

`HAO-024` makes the multimodal control plane rollout-safe by treating
observability, audit, security review, feature flag sequencing, and rollback as
part of the IDL contract. Every schema, policy, and runtime mediation change
must be able to run in shadow mode before it can block an invocation.

### Rollout feature flag contract

The canonical feature flag modes are `off`, `shadow`, and `enforce`.
Implementations may add narrower cohorts, but they must preserve these mode
semantics across Electron, Python, Swissknife ORB, daemon-managed MCP, remote
mobile, Meta-glasses, and simulator clients.

- `CONTROL_SURFACE_SCHEMA_MODE` gates descriptor,
  `interaction_envelope`, `policy_decision`, and `mediation_receipt` schema
  validation.
- `CONTROL_SURFACE_POLICY_MODE` gates policy compilation, evaluator cache use,
  and whether a policy decision can affect runtime behavior.
- `CONTROL_SURFACE_RUNTIME_MEDIATION` gates local ORB and desktop invocation
  mediation.
- `CONTROL_SURFACE_DAEMON_MEDIATION` gates MCP daemon before-invoke mediation.
- `CONTROL_SURFACE_REMOTE_CLIENTS` gates Meta-glasses, mobile, and simulator
  event adoption.
- `CONTROL_SURFACE_AUDIT_PAYLOADS=metadata|full-local` gates whether audit
  persistence stores only redacted payload metadata or full raw payload evidence
  in the local operator context.

Rollout order:
1. Enable schema validation in `shadow`; emit schema validation metrics without
   rejecting envelopes.
2. Enable policy evaluation in `shadow`; emit a policy decision and
   mediation receipt while executing the previous invocation behavior.
3. Enable runtime mediation in `enforce` for local desktop and ORB actions only.
4. Enable daemon mediation in `enforce` after blocked-invocation metrics match
   the shadow policy decision distribution.
5. Enable remote clients in `enforce` only after their raw payload redaction and
   fallback-surface behavior pass security review.

### Observability and audit metrics

The required metrics are deliberately low-cardinality:
- `control_surface_interactions_total{surface,surface_event,method,source,mode}`
- `control_surface_policy_decisions_total{outcome,surface,method,source,mode}`
- `control_surface_policy_decision_latency_ms{surface,method,outcome,source}`
- `control_surface_mediation_receipts_total{outcome,persisted,source,mode}`
- `control_surface_confirmation_queue_depth{source}`
- `control_surface_schema_validation_failures_total{schema,source,mode}`
- `control_surface_raw_payload_redactions_total{payload_class,source}`
- `control_surface_rollback_events_total{rollback_type,source}`

Audit receipts remain the source of truth for operator investigation. Each
receipt links `interaction_id`, `control_surface_contract_ref`,
`policy_bundle_ref`, `compiled_policy_cid`, `policy_decision`, matched norm
references, `mediation_result`, explanation, and receipt CID when persisted.
Metrics and logs reference only category labels, decision IDs, receipt CIDs, and
redacted summaries; they never use raw payload contents or high-cardinality
actor identifiers as labels.

### Raw payload privacy boundary

`raw_payload` exists to preserve enough local evidence for deterministic
mediation and audit. It is not a general telemetry channel.

- Raw media, sensor, display, DOM, transcript, location, token, credential, and
  delegation data must be classified before persistence.
- Adapters should put large or sensitive evidence behind a CID, file handle, or
  correlation ID and place only the reference in `raw_payload`.
- Full payload evidence can be persisted only in the local receipt store under
  `CONTROL_SURFACE_AUDIT_PAYLOADS=full-local`; exported reports, dashboard
  lists, metrics, and daemon logs use redacted metadata.
- Policy evaluation may inspect raw payload evidence during mediation, but
  compiled policy artifacts and policy decision explanations must not embed raw
  secrets, transcripts, media bytes, or exact location traces.

### Security review gates

Before any adapter, schema version, policy compiler lane, or daemon mediation
path moves to `enforce`, review evidence must show:
- schema validation accepts current envelopes and rejects malformed or
  cross-contract payloads,
- policy decision outcomes match the regression corpus for voice, gesture,
  mouse, agent, and remote events,
- destructive, financial, and communication-send methods still require
  confirmation where configured,
- raw payload redaction covers the adapter's media, sensor, location, token, and
  credential classes,
- direct daemon port or ORB transport paths cannot bypass the before-invoke
  mediation hook,
- rollback to the previous schema, policy bundle, and runtime mode was exercised
  in staging and produced an audit record.

### Rollback runbooks

Schema rollback:
1. Set `CONTROL_SURFACE_SCHEMA_MODE=shadow` or `off`.
2. Restore the previous `control_surface_contract` schema and descriptor
   version while keeping readers compatible with receipts already emitted.
3. Re-run descriptor and E2E validation, then emit a `schema` rollback audit
   event with the old and restored schema refs.

Policy rollback:
1. Set `CONTROL_SURFACE_POLICY_MODE=shadow`.
2. Detach the failing `policy_bundle_ref` from the active profile and restore
   the previous `compiled_policy_cid`.
3. Clear compiler and evaluator caches, keep the reverted bundle available for
   audit, and emit a `policy` rollback event with the operator and reason.

Runtime mediation rollback:
1. Set `CONTROL_SURFACE_RUNTIME_MEDIATION=shadow` and
   `CONTROL_SURFACE_DAEMON_MEDIATION=shadow` to stop blocking while retaining
   policy decision and receipt telemetry.
2. If the mediator itself is unhealthy, set the flags to `off`, remove active
   policy hooks from daemon managers, and restart only affected daemon or ORB
   adapters.
3. Verify allowed invocation recovery, confirm that blocked-invocation metrics
   stop increasing, and emit a `runtime` rollback audit event.

## Hallucinate App Implementation Targets
This work should land here.

### Descriptor and orchestration surfaces
- `swissknife/`
  - canonical virtual desktop descriptor and ORB surface.
- `index.js`, `preload.js`, and renderer/dashboard layers
  - operator-facing explanation, confirmation, and policy controls.
- daemon-manager surfaces
  - policy-aware orchestration and diagnostics.

### Python runtime surfaces
- `python/hallucinate_app/`
  - canonical home for shared AI-OS mediation modules.

Recommended new modules:
- `python/hallucinate_app/control_surface_intents.py`
- `python/hallucinate_app/control_surface_logic_ir.py`
- `python/hallucinate_app/control_surface_policy.py`
- `python/hallucinate_app/control_surface_context.py`
- `python/hallucinate_app/control_surface_receipts.py`

### Shared schema additions
- `control_surface_contract`
- `interaction_envelope`
- `policy_decision`
- `mediation_receipt`

### Remote-client integration targets
Remote clients such as Meta glasses, mobile shells, and simulator surfaces should consume this contract and publish normalized events into the Hallucinate App mediation layer.

### Remote interaction surface adoption
`HAO-021` treats Meta-glasses, mobile, and simulator clients as remote
interaction surface producers for the same Hallucinate-owned
`control_surface_contract`. These clients may provide device capabilities,
transport metadata, and raw sensor or display payloads, but they must not define
client-local policy hooks, competing intent bindings, or a separate control
contract.

Remote events enter Hallucinate App as the same `interaction_envelope` used by
local voice, gesture, pointer, and agent adapters:
- `surface` remains the normalized control modality, such as `voice`,
  `gesture`, `mouse`, or `agent`.
- `surface_event` remains the canonical event, such as `utterance`, `tap`,
  `swipe`, `click`, or `proposal`.
- `raw_payload` preserves transport-specific evidence, such as DAT display
  action data, Web App event metadata, mobile card input, simulator trace
  entries, Neural Band/captouch values, sensor readings, and correlation IDs.
- `context.platform` identifies the remote client runtime, such as
  `meta_glasses`, `mobile`, or `simulator`.
- `context.device_context.remote_surface` records the concrete device path,
  such as `meta-rayban-display-webapp`, `dat-native-display`,
  `mobile-shell`, or `meta-rayban-display-simulator`.

The remote-surface flow is:
1. The Meta-glasses, mobile, or simulator adapter receives a raw device event.
2. The adapter resolves that event to the canonical interaction envelope and
   attaches descriptor, policy, receipt, and correlation references when known.
3. Hallucinate App validates the envelope against `control_surface_contract`.
4. The shared mediator emits the `policy_decision` and `mediation_receipt`
   before any ORB, MCP, display, audio, or mobile render target proceeds.
5. The remote client executes only the mediated result, including
   `fallback_surface`, `rewrite`, `require_confirmation`, or denial outcomes.

The existing `lift_coding` mobile ORB endpoint
`/v1/mobile/orb/publish_glasses_event` is therefore a compatibility ingress for
remote events, not a new policy authority. Its Meta-glasses, mobile, and
simulator paths should forward normalized envelopes and receive Hallucinate App
mediation results rather than evaluating separate local control policy.

### Virtual desktop multimodal session contract

`HAO-427` defines the Hallucinate App control-surface contract for one
`virtual_desktop_session` that spans the phone controller, desktop peer,
Swissknife UI, and Meta glasses terminal. The session contract is a profile of
the canonical `control_surface_contract`; it does not introduce a separate
policy authority. Every participant publishes normalized events into the same
mediation path, receives command intents from the same decision point, and
renders receipt-backed state with the same identifiers.

The session descriptor extends a Swissknife-backed desktop descriptor with:

```json
{
  "virtual_desktop_session": {
    "version": "0.1.0",
    "session_id": "vdsk_2026_06_23_example",
    "desktop_ref": "swissknife:desktop:primary",
    "participants": [
      {
        "participant_id": "phone:operator",
        "role": "controller",
        "platform": "mobile",
        "surfaces": ["voice", "gesture", "mouse"],
        "transport": "mobile_orb"
      },
      {
        "participant_id": "desktop:peer",
        "role": "executor",
        "platform": "desktop_peer",
        "surfaces": ["mouse", "agent"],
        "transport": "peer_orb"
      },
      {
        "participant_id": "swissknife:ui",
        "role": "operator_surface",
        "platform": "swissknife",
        "surfaces": ["mouse", "agent"],
        "transport": "local_orb"
      },
      {
        "participant_id": "meta_glasses:terminal",
        "role": "constrained_terminal",
        "platform": "meta_glasses",
        "surfaces": ["voice", "gesture"],
        "transport": "mobile_orb"
      }
    ],
    "event_contract_ref": "interaction_envelope@0.1.0",
    "command_contract_ref": "virtual_desktop_command_intent@0.1.0",
    "placement_contract_ref": "virtual_desktop_placement_hint@0.1.0",
    "receipt_contract_ref": "mediation_receipt@0.1.0"
  }
}
```

Normalized session events keep the existing `interaction_envelope` fields and
add a `session` object so phone, desktop peer, Swissknife UI, and Meta glasses
terminal events can be correlated without changing the surface vocabulary:

```json
{
  "interaction_id": "evt_01J_session_input",
  "surface": "voice",
  "surface_event": "utterance",
  "raw_payload": {
    "transcript": "open the model monitor on my desktop",
    "transport_correlation_id": "mobile-orb-923"
  },
  "normalized_intent": {
    "intent": "desktop.open_widget",
    "method": "open_widget",
    "target_ref": "widget:model-monitor",
    "arguments": {"source": "phone"},
    "confidence": 0.93
  },
  "actor": {
    "type": "user",
    "id": "operator",
    "delegation_chain": []
  },
  "context": {
    "platform": "mobile",
    "device_context": {
      "remote_surface": "mobile-shell"
    }
  },
  "session": {
    "session_id": "vdsk_2026_06_23_example",
    "participant_id": "phone:operator",
    "desktop_ref": "swissknife:desktop:primary",
    "sequence": 42,
    "parent_receipt_ids": ["rcpt_session_join_001"]
  }
}
```

The normalized event vocabulary for a virtual desktop session is:

| Participant | Surface events | Normalized intents |
| --- | --- | --- |
| Phone controller | `voice/utterance`, `voice/confirm`, `voice/cancel`, `gesture/tap`, `gesture/swipe`, `mouse/click` | `desktop.open_widget`, `desktop.focus_window`, `desktop.move_window`, `desktop.confirm_command`, `desktop.cancel_command`, `terminal.render_summary` |
| Desktop peer | `mouse/click`, `mouse/focus`, `agent/proposal`, `agent/autonomous_invoke` | `desktop.execute_command`, `desktop.share_window`, `desktop.stream_region`, `desktop.sync_state`, `desktop.fallback_local` |
| Swissknife UI | `mouse/click`, `mouse/hover`, `mouse/focus`, `agent/proposal` | `desktop.open_widget`, `desktop.focus_window`, `desktop.activate_control`, `desktop.show_receipt`, `desktop.replay_session` |
| Meta glasses terminal | `voice/utterance`, `voice/confirm`, `voice/cancel`, `gesture/tap`, `gesture/swipe`, `gesture/hold` | `terminal.render_summary`, `terminal.focus_card`, `terminal.activate_action`, `terminal.dismiss`, `desktop.request_handoff` |

Command intents are the mediated output of the session contract. They are
separate from raw events so policy can deny, rewrite, defer, or move work
between surfaces before execution:

```json
{
  "command_intent_id": "cmd_01J_open_model_monitor",
  "interaction_id": "evt_01J_session_input",
  "session_id": "vdsk_2026_06_23_example",
  "intent": "desktop.open_widget",
  "method": "open_widget",
  "target_ref": "widget:model-monitor",
  "arguments": {
    "layout": "right_panel",
    "restore_if_open": true
  },
  "issued_to": "swissknife:ui",
  "requires_receipt": true,
  "placement_hint": {
    "placement_id": "place_01J_model_monitor",
    "preferred_surface": "swissknife:ui",
    "fallback_surfaces": ["desktop:peer", "meta_glasses:terminal", "phone:operator"],
    "display_region": "right_panel",
    "attention": "foreground",
    "privacy": "operator_visible",
    "constraints": ["avoid_glasses_full_text", "desktop_peer_if_available"]
  },
  "receipt_ids": {
    "event_receipt_id": "rcpt_evt_01J_session_input",
    "policy_receipt_id": "rcpt_policy_01J_open_model_monitor",
    "command_receipt_id": "rcpt_cmd_01J_open_model_monitor"
  }
}
```

Placement hints are advisory instructions attached to mediated command intents.
They never bypass policy and must be copied into receipts when they affect
routing. The required fields are `placement_id`, `preferred_surface`,
`fallback_surfaces`, `display_region`, `attention`, `privacy`, and
`constraints`. Valid `preferred_surface` and `fallback_surfaces` values are
session participant IDs, which lets the same command target the Swissknife UI
when the desktop peer is present, render a condensed card on Meta glasses, or
fall back to the phone controller if the desktop peer is unavailable.

Every virtual desktop session action must carry stable receipt IDs:

- `event_receipt_id` records the raw participant event, normalized envelope,
  `session_id`, `participant_id`, transport correlation ID, and prior
  `parent_receipt_ids`.
- `policy_receipt_id` is the canonical `mediation_receipt.receipt_id` for the
  policy decision that allowed, denied, confirmed, rewrote, deferred,
  rate-limited, or rerouted the command.
- `command_receipt_id` records the command intent emitted after mediation,
  including the selected placement hint and final target participant.
- `render_receipt_id` records what the Swissknife UI, phone controller, desktop
  peer, or Meta glasses terminal actually displayed or executed.

Receipt IDs are opaque stable strings or CIDs. Downstream payloads may include
`receipt_cid` aliases for content-addressed storage, but UI and diagnostics must
preserve the `receipt_id` chain so all participants can render the same
command status and audit trail.

### Offload-session mobile and glasses mediation path

`HAO-428` routes every phone-controller and Meta-glasses terminal event through
the Hallucinate App mediator before a local runtime, Swissknife UI, desktop
peer, or peer-offload transport can execute it. Offload-session ingress is a
transport boundary only; it is not allowed to dispatch normalized intents
directly to a runtime.

The required offload-session path is:

1. `mobile_orb`, display bridge, DAT display, or simulator ingress receives a
   voice, gesture, display action, or phone UI event.
2. The ingress adapter creates one `interaction_envelope` with
   `context.platform`, `context.device_context.remote_surface`,
   `session.session_id`, `session.participant_id`, transport correlation ID,
   and the raw event evidence preserved in `raw_payload`.
3. The adapter submits the envelope to the shared Hallucinate App mediation
   entrypoint for `control_surface_contract` validation and policy evaluation.
4. The mediator emits a `policy_decision` and `mediation_receipt` before any
   command intent is issued.
5. Only an allowed, rewritten, confirmed, deferred, or rerouted mediated result
   may create `virtual_desktop_command_intent`; denied results stop at the
   receipt and render denial status to the phone UI, Swissknife UI, and glasses
   terminal.
6. The mediated command intent is dispatched to `swissknife:ui`,
   `desktop:peer`, `phone:operator`, or `meta_glasses:terminal` according to the
   policy result and placement hint.

The event-to-mediator mapping is fixed for offload sessions:

| Source event class | Canonical envelope | Pre-dispatch requirement |
| --- | --- | --- |
| Voice command from phone or glasses | `surface: "voice"`, `surface_event: "utterance"`, `confirm`, or `cancel` | Evaluate voice confidence, wake/quiet-hours policy, delegation, and session participant policy before command intent creation. |
| Gesture from phone, captouch, Neural Band, or glasses | `surface: "gesture"`, `surface_event: "tap"`, `swipe`, `hold`, or mapped wrist event | Evaluate gesture allow/deny rules, sleep/quiet-hours policy, display focus, and target participant policy before execution. |
| Display action from glasses terminal or DAT display | `surface: "gesture"` or `surface: "mouse"` with `raw_payload.display_action` and terminal card/action IDs | Evaluate terminal action policy and rewrite or deny before `terminal.activate_action`, `terminal.focus_card`, `desktop.request_handoff`, or desktop peer routing. |
| Phone UI event from mobile shell | `surface: "mouse"` or `surface: "gesture"` with `raw_payload.phone_ui_event` and mobile view/action IDs | Evaluate mobile session policy and placement policy before `desktop.open_widget`, `desktop.focus_window`, `desktop.move_window`, confirmation, cancellation, or local fallback. |

Offload-session adapters MUST NOT call desktop peer RPC, Swissknife local ORB,
local desktop execution, or Meta-glasses rendering directly from `normalized_intent`.
They must call the mediator first and dispatch only from the resulting
`virtual_desktop_command_intent` plus `policy_receipt_id`. The peer runtime may
validate transport authentication and resource availability, but it must treat
policy outcome, command target, fallback, and confirmation state as the
mediator-owned decision.

The minimal command-dispatch envelope after mediation is:

```json
{
  "offload_dispatch": {
    "session_id": "vdsk_2026_06_23_example",
    "interaction_id": "evt_01J_session_input",
    "policy_receipt_id": "rcpt_policy_01J_open_model_monitor",
    "command_intent_id": "cmd_01J_open_model_monitor",
    "policy_outcome": "allow",
    "dispatch_target": "desktop:peer",
    "fallback_targets": ["swissknife:ui", "phone:operator"],
    "source_participant_id": "phone:operator",
    "source_event_class": "phone_ui_event"
  }
}
```

This makes voice commands, gestures, display actions, and phone UI events
observably policy-gated before they can reach a local runtime or desktop peer
runtime.

### Peer-offload policy receipts and recovery states

`HAO-429` extends the offload-session contract so every peer-offload routing
decision and recovery outcome is rendered from receipts, not from
surface-local status strings. The phone UI, Swissknife UI, and Meta glasses
terminal must subscribe to the same receipt chain and display equivalent
decision, selected peer, fallback, cancellation, timeout, and retry state.

The canonical `peer_offload_policy_receipt` is emitted after the
`mediation_receipt` and before peer dispatch. It records the policy decision,
peer selection, fallback plan, execution lease, and display-safe summary that
all participant surfaces may render:

```json
{
  "peer_offload_policy_receipt": {
    "receipt_id": "rcpt_offload_01J_open_model_monitor",
    "receipt_contract_ref": "peer_offload_policy_receipt@0.1.0",
    "session_id": "vdsk_2026_06_23_example",
    "interaction_id": "evt_01J_session_input",
    "policy_receipt_id": "rcpt_policy_01J_open_model_monitor",
    "command_receipt_id": "rcpt_cmd_01J_open_model_monitor",
    "policy_decision": "allow",
    "policy_reason": "desktop_peer_if_available",
    "selected_peer": {
      "participant_id": "desktop:peer",
      "runtime_ref": "peer_orb:desktop-primary",
      "selection_reason": "preferred placement satisfied",
      "capability_refs": ["desktop.execute_command", "desktop.stream_region"]
    },
    "fallback_plan": {
      "fallback_targets": ["swissknife:ui", "phone:operator", "meta_glasses:terminal"],
      "fallback_reason": null,
      "requires_operator_confirmation": false
    },
    "recovery_state": "dispatching",
    "retry_budget": {
      "max_attempts": 2,
      "attempt": 1,
      "remaining_attempts": 1
    },
    "render_targets": ["phone:operator", "swissknife:ui", "meta_glasses:terminal"]
  }
}
```

Peer-offload recovery records are appended when dispatch does not complete as
selected. They use `peer_offload_recovery_receipt` and carry the same
`session_id`, `interaction_id`, `policy_receipt_id`, `command_receipt_id`, and
`peer_offload_policy_receipt_id` so every surface can replace the in-flight
status with the same recovery state.

| Outcome | Required receipt fields | Required render state |
| --- | --- | --- |
| Policy allow or confirmation | `policy_decision`, `selected_peer.participant_id`, `selection_reason`, `command_receipt_id`, `render_targets` | Show the selected desktop peer or confirmation prompt on phone UI, Swissknife UI, and Meta glasses terminal. |
| Peer selection fallback | `fallback_plan.fallback_targets`, `fallback_reason`, `selected_peer` set to the fallback participant, `parent_receipt_ids` | Show the fallback target and preserve the original peer selection receipt in the audit chain. |
| User cancellation | `recovery_outcome: "cancelled"`, `cancel_source_participant_id`, `cancel_event_receipt_id`, `last_good_receipt_id` | Show cancelled state everywhere and prevent the peer runtime from continuing the command. |
| Peer timeout | `recovery_outcome: "timeout"`, `timeout_ms`, `failed_peer_id`, `last_good_receipt_id`, `retry_budget` | Show timed-out state, then either retry, reroute, or fail closed according to the mediator-owned recovery decision. |
| Retry scheduled or exhausted | `recovery_outcome: "retry_scheduled"` or `"retry_exhausted"`, `retry_attempt`, `remaining_attempts`, `next_target_participant_id` | Show retry attempt counts consistently and show fail-closed state when the retry budget is exhausted. |

The recovery-state vocabulary is fixed: `dispatching`, `awaiting_confirmation`,
`running_on_peer`, `fallback_selected`, `retry_scheduled`, `cancelled`,
`timed_out`, `retry_exhausted`, `failed_closed`, and `recovered`. Runtime-plane
targets may report transport availability and execution errors, but they must
not choose a new recovery state. Hallucinate App owns recovery-state transitions
and emits the receipt that authorizes each retry, fallback, cancellation, or
fail-closed outcome.

The peer-offload receipt chain is:
`event_receipt_id -> policy_receipt_id -> command_receipt_id ->
peer_offload_policy_receipt_id -> runtime_receipt_id ->
peer_offload_recovery_receipt_id -> render_receipt_id`. A command that never
reaches a peer still emits `peer_offload_policy_receipt_id` when peer selection
was evaluated, then emits a recovery receipt for the fallback, cancellation,
timeout, retry, or failed-closed outcome. All three UI surfaces render from the
same receipt IDs and may only localize labels; they must not invent different
status semantics for phone UI, Swissknife, or Meta glasses display.

### Launch-slice deterministic replay artifacts

`HAO-432` promotes the launch-slice receipts from policy examples into a
deterministic replay artifact. The replay artifact lives at
`data/hallucinate_multimodal_control/discovery/2026-06-23-hao-432-launch-slice-replay-receipts.md`
and is the reviewable evidence that a phone-originated virtual desktop command
can be replayed through desktop peer selection, policy decisions, retry,
fallback, user cancellation, and Meta glasses status updates without physical
hardware.

The launch-slice artifact is a strict receipt ledger, not a narrative log. Each
`replay_steps[]` entry carries a stable `phase`, deterministic timestamp, and
the receipt object emitted by that phase. Replayers must process the sequence in
order and reject any entry whose parent IDs do not match the prior receipt
chain:
`phone_event -> mediation_receipt -> virtual_desktop_command_intent ->
peer_offload_policy_receipt -> runtime_receipt ->
peer_offload_recovery_receipt -> meta_glasses_status_receipt ->
render_receipt`. Retry, fallback, and cancellation are represented by appended
`peer_offload_recovery_receipt` entries, so the original
`policy_receipt_id`, `command_receipt_id`, and
`peer_offload_policy_receipt_id` remain stable across recovery.

The artifact must include these launch-slice checks:

- The source event is a phone-originated command from `phone:operator`, and no
  desktop peer dispatch appears before the `mediation_receipt`.
- Desktop peer selection is recorded in `peer_offload_policy_receipt` with
  `selected_peer.participant_id: "desktop:peer"` and the policy decision that
  authorized the attempt.
- Retry, fallback, and cancel outcomes are separate recovery receipts with
  `recovery_state: "retry_scheduled"`, `recovery_state: "fallback_selected"`,
  and `recovery_state: "cancelled"` respectively.
- Meta glasses status updates are explicit
  `meta_glasses_status_receipt` entries tied to the same recovery receipt IDs
  rendered by the phone UI and Swissknife UI.
- The deterministic harness remains hardware-free: fixed clock, simulated
  network, stable participant IDs, and no device-local policy authority.

### Physical-device operator handoff gates

`HAO-433` defines the operator handoff gates that must pass before the
Hallucinate App command plane may move from hardware-free replay to
physical-device validation with a real phone, a desktop peer, and Meta glasses.
The handoff is a command-plane promotion, not a new runtime mode: every
physical-device event must still enter as an `interaction_envelope`, pass
mediation, produce receipt-backed command and recovery records, and render the
same status across phone UI, Swissknife UI, desktop peer, and Meta glasses
terminal.

The canonical handoff record is `physical_device_operator_handoff_gate@0.1.0`.
It is emitted after the HAO-432 deterministic replay ledger passes and before
any real phone, desktop peer, or Meta glasses session can execute a mediated
command:

```json
{
  "physical_device_operator_handoff_gate": {
    "gate_id": "gate_hao433_physical_device_operator_handoff",
    "task_id": "HAO-433",
    "session_id": "vdsk_physical_validation_candidate",
    "source_replay_artifact": "data/hallucinate_multimodal_control/discovery/2026-06-23-hao-432-launch-slice-replay-receipts.md",
    "required_participants": [
      "phone:operator",
      "desktop:peer",
      "swissknife:ui",
      "meta_glasses:terminal"
    ],
    "promotion_state": "blocked_until_all_gates_pass",
    "operator_handoff_receipt_id": "rcpt_gate_hao433_operator_handoff",
    "verified_by": "hallucinate_app_command_plane"
  }
}
```

The command plane must evaluate these gates in order:

| Gate | Required command-plane verification | Blocks physical-device validation when |
| --- | --- | --- |
| Replay parity gate | The HAO-432 launch-slice replay passes with fixed participant IDs, parent receipt continuity, no desktop peer dispatch before `mediation_receipt`, and the same fallback/retry/cancel states rendered to phone, Swissknife UI, and Meta glasses. | Any physical-device path requires behavior not present in hardware-free replay, or the replay ledger cannot be reproduced from stored receipts. |
| Real phone ingress gate | The phone-hosted controller can publish voice, gesture, and phone UI events as `interaction_envelope` records with `context.platform: "mobile"`, `session.participant_id: "phone:operator"`, transport correlation ID, and no direct desktop peer or local runtime dispatch. | The phone adapter can execute or render a command without a `policy_receipt_id`, or cannot attach the active virtual desktop session. |
| Desktop peer readiness gate | The desktop peer announces authenticated transport, capability refs, stream-region support, runtime health, retry budget, and receipt return path before it can be selected by `peer_offload_policy_receipt`. | The peer cannot prove the selected command route, cannot return runtime receipts, or attempts to own policy, fallback, retry, or cancellation decisions. |
| Meta glasses terminal gate | Meta glasses display-widget actions and confirmations map through the HAO-431 bridge into the existing command plane with `context.platform: "meta_glasses"`, `participant_id: "meta_glasses:terminal"`, display-action evidence, and receipt aliases preserved. | A glasses action targets the phone-hosted virtual desktop without an active session, command receipt, or mediated `desktop.request_handoff` / `terminal.activate_action` result. |
| Operator handoff gate | The operator explicitly acknowledges the physical-device session, sees the selected phone, desktop peer, and Meta glasses participants, and receives the replay-derived proof chain before hardware input is allowed to affect state. | The operator cannot inspect the prior replay proof, participant identities, current policy state, or fail-closed recovery route. |
| Fail-closed recovery gate | Every physical-device route has a matching recovery receipt plan for timeout, disconnect, denied policy, malformed envelope, user cancellation, and exhausted retry budget. | Any route would leave the phone-hosted virtual desktop, desktop peer, or Meta glasses terminal in a state not represented by `operator_console_error_recovery`. |

Promotion from hardware-free replay to physical-device validation is allowed
only when the command plane emits an allowed
`operator_handoff_receipt_id` whose parents include the final HAO-432 replay
receipt, the real phone ingress proof, the desktop peer readiness proof, the
Meta glasses terminal proof, and the operator acknowledgement proof. The receipt
must name `promotion_state: "physical_validation_allowed"` and must be rendered
to all operator surfaces before the first physical-device command is accepted.

Physical-device validation remains fail-closed. Missing transport
authentication, missing active session, missing receipt parents, mismatched
participant IDs, unavailable desktop peer runtime, stale Meta glasses display
action, or absent operator acknowledgement must produce a denial or recovery
receipt and keep the session in hardware-free replay mode. No physical phone,
desktop peer, or Meta glasses adapter may promote itself; only Hallucinate App
can emit the operator handoff receipt that unlocks the physical-device session.

### VAI/MGW shared launch evidence packet

`HAO-434` connects the Hallucinate App launch replay receipts to the shared
evidence packet consumed by the VAI launch replay and MGW glasses-widget launch
replay. Hallucinate App remains the receipt emitter. VAI and MGW consume the
same mediation, command-intent, peer-offload, recovery, and render receipt IDs
with identical `session_id`, `command_correlation_id`,
`policy_correlation_id`, and `placement_correlation_id`.

The packet lives at
`data/hallucinate_multimodal_control/discovery/2026-06-23-hao-434-vai-mgw-shared-evidence-packet.md`
and extends the HAO-432 replay ledger without changing replay authority. It
must expose these fields:

```json
{
  "vai_mgw_shared_launch_evidence_packet": {
    "task_id": "HAO-434",
    "source_replay_artifact": "launch_slice_replay_receipts",
    "correlation_ids": {
      "session_id": "vdsk_hao432_launch_slice",
      "command_correlation_id": "cmdcorr_hao434_open_monitor",
      "policy_correlation_id": "polcorr_hao434_open_monitor",
      "placement_correlation_id": "placecorr_hao434_desktop_peer"
    },
    "emitted_receipt_ids": {
      "mediation_receipt_id": "rcpt_policy_hao432_open_monitor",
      "command_intent_receipt_id": "rcpt_cmd_hao432_open_monitor",
      "peer_offload_policy_receipt_id": "rcpt_offload_hao432_open_monitor",
      "recovery_receipt_ids": [
        "rcpt_recovery_hao432_retry",
        "rcpt_recovery_hao432_fallback",
        "rcpt_recovery_hao432_cancelled"
      ],
      "render_receipt_ids": {
        "phone:operator": "rcpt_render_hao432_phone",
        "swissknife:ui": "rcpt_render_hao432_swissknife",
        "meta_glasses:terminal": "rcpt_render_hao432_glasses"
      }
    },
    "consumed_by": [
      "virtual_ai_os.launch_replay",
      "meta_glasses_display_widgets.glasses_widget_launch_replay"
    ]
  }
}
```

The command plane must stamp the four correlation IDs onto every emitted
receipt in the packet, including `mediation_receipt`,
`virtual_desktop_command_intent`, `peer_offload_policy_receipt`, each
`peer_offload_recovery_receipt`, and each surface `render_receipt`. The VAI
launch replay and MGW glasses-widget launch replay must reject the packet when
any consumed receipt has a different session, command, policy, or placement
correlation value from the Hallucinate App emitted receipt.

For MGW, the Meta glasses `render_receipt_id` is also the widget
`orb_receipt_cid` alias. That alias is evidence only: the MGW display widget
may render the replayed state, but it may not confirm, cancel, retry, or
dispatch the virtual desktop command from a client-local receipt. Any mismatch
between the widget `correlation_id`, `request_id`, `orb_receipt_cid`,
`policy_receipt_cid`, and the HAO-434 packet must reject the packet and stop at
the last valid Hallucinate App recovery receipt.

### Operator recovery rehearsal for desktop peer offload failure

`HAO-435` adds an operator recovery rehearsal over the HAO-434 shared evidence
packet before any physical-device offload validation is promoted. The rehearsal
is hardware-free and replays desktop peer offload failure outcomes through the
same Hallucinate App recovery contract used by the phone UI, Swissknife UI, and
Meta glasses terminal. It proves that every surface renders the same
`operator_console_error_recovery` state, source recovery receipt, and receipt
chain before the operator is allowed to continue.

The rehearsal artifact lives at
`data/hallucinate_multimodal_control/discovery/2026-06-23-hao-435-operator-recovery-rehearsal.md`
and extends the HAO-434 packet with these required drills:

| Drill | Injected offload failure | Required Hallucinate App outcome | Surface parity proof |
| --- | --- | --- | --- |
| `desktop_peer_timeout` | The selected desktop peer does not return a runtime receipt before the dispatch timeout. | Emit `peer_offload_recovery_receipt` with `recovery_state: "retry_scheduled"` while retry budget remains. | Phone UI, Swissknife UI, and Meta glasses render the same retry state and parent `peer_offload_policy_receipt`. |
| `desktop_peer_denial` | Policy denies the desktop peer route or the peer readiness proof is stale. | Stop before peer dispatch and emit denied `operator_console_error_recovery` with no runtime invocation. | All three surfaces render the denial receipt and the last good mediation receipt. |
| `retry_exhaustion` | The final retry attempt also times out or disconnects. | Emit exhausted recovery with `recovery_state: "fallback_selected"` and the selected fallback participant. | Phone UI, Swissknife UI, and Meta glasses show the same exhausted retry count, fallback target, and recovery receipt. |
| `user_cancellation` | The operator cancels from phone, Swissknife, or Meta glasses while recovery is pending. | Emit cancelled recovery whose parent is the last allowed recovery receipt. | All render receipts use `state: "cancelled"` and preserve the cancel source participant. |
| `fallback_to_phone` | Desktop peer and Swissknife fallback are unavailable, or policy selects the phone as the safest local surface. | Emit fallback recovery with `fallback_surface: "phone:operator"` and no desktop peer execution. | Phone UI, Swissknife UI, and Meta glasses render the phone fallback receipt chain, with Meta glasses only showing status. |

Each drill must replay the chain
`mediation_receipt_id -> command_intent_receipt_id ->
peer_offload_policy_receipt_id -> recovery_receipt_id -> render_receipt_ids`.
The three render receipts must carry the same `session_id`,
`command_correlation_id`, `policy_correlation_id`,
`placement_correlation_id`, `source_recovery_receipt_id`, and
`recovery_state`. A rehearsal fails closed when any surface mints an
independent state, omits the source receipt, or renders a fallback target not
selected by Hallucinate App.

The operator console may expose retry, cancel, continue-on-phone, and fail
closed controls during the rehearsal, but those controls are display-only until
the corresponding Hallucinate App recovery receipt exists. Desktop peer,
Swissknife, phone, and Meta glasses adapters must not promote a client-local
timeout, denial, retry exhaustion, cancellation, or fallback-to-phone result
into command state without the shared receipt chain.

### Meta glasses display-widget intent bridge

`HAO-431` integrates Meta glasses display-widget actions with the Hallucinate App
command plane by treating MGW action payloads as remote interaction events for
the existing `virtual_desktop_session`. The bridge does not define a second
command contract. It preserves the MGW display-widget action contract as raw
input evidence, then emits the same normalized intents and
`virtual_desktop_command_intent` records used by the phone controller,
Swissknife UI, and desktop peer.

MGW display actions map into the shared command plane as follows:

| MGW action or confirmation | Canonical envelope | Normalized intent before mediation | Mediated command intent |
| --- | --- | --- | --- |
| `focusDisplayWidgetAction`, `focus_next`, `focus_previous`, region focus, or D-pad navigation | `surface: "gesture"` with `surface_event: "swipe"` or `surface_event: "tap"` and `raw_payload.display_action` | `terminal.focus_card` with `target_ref` set to the widget, card, region, or focus action ID | `terminal.focus_card` issued to `meta_glasses:terminal` with placement and render receipts |
| `activateDisplayWidgetAction`, selected action activation, or widget button press | `surface: "gesture"` or `surface: "mouse"` with `raw_payload.display_action.action_id` | `terminal.activate_action` when the target remains display-local, or `desktop.request_handoff` when the action targets the phone-hosted virtual desktop | `terminal.activate_action`, `desktop.open_widget`, `desktop.focus_window`, `desktop.activate_control`, or `desktop.request_handoff` according to policy |
| Confirmation accept or continue from the widget | `surface: "voice"` or `surface: "gesture"` with `surface_event: "confirm"` and `raw_payload.confirmation_prompt.prompt_id` | `desktop.confirm_command` with `target_ref` set to the prompt or command receipt ID | `desktop.confirm_command` issued to the policy-selected participant |
| Confirmation reject, cancel, dismiss, reset, or timeout action | `surface: "voice"` or `surface: "gesture"` with `surface_event: "cancel"` or `surface_event: "tap"` | `desktop.cancel_command`, `terminal.dismiss`, or `terminal.render_summary` depending on the prompt action | `desktop.cancel_command`, `terminal.dismiss`, `terminal.render_summary`, or fallback render command with denial/recovery receipt |
| `render_widget`, `update_widget`, `clear_widget`, `play_video`, or `subscribe_updates` result acknowledgement | `surface: "agent"` with `surface_event: "proposal"` and `raw_payload.display_receipt` | `terminal.render_summary` or `desktop.sync_state` for render-state convergence | Receipt-backed render/update command or recovery state for `meta_glasses:terminal`, `phone:operator`, or `swissknife:ui` |

The adapter must copy these MGW fields into `raw_payload.display_action` when
present: `widget_id`, `descriptor_cid`, `manifest_cid`, `action_id`,
`action_kind`, `confirmation_prompt.prompt_id`, `correlation_id`,
`request_id`, `orb_receipt_cid`, `policy_receipt_cid`, `render_path`,
`fallback_path`, and any display-safe selected region or focus ID. These fields
are evidence for receipts; they are not command-plane authority.

The bridge lifecycle is:

1. The mobile DAT bridge, display-webapp preview, simulator, or Swissknife ORB
   handler receives an MGW display-widget action or confirmation.
2. The adapter creates one `interaction_envelope` with `context.platform:
   "meta_glasses"`, `context.device_context.remote_surface`, the active
   `session.session_id`, and `session.participant_id:
   "meta_glasses:terminal"`.
3. The adapter stores the original MGW payload in `raw_payload.display_action`
   and resolves only the preliminary `normalized_intent` listed above.
4. Hallucinate App validates and mediates the envelope through the shared
   `control_surface_contract`, producing `policy_decision` and
   `mediation_receipt` records before dispatch.
5. Only the resulting `virtual_desktop_command_intent` may call Swissknife,
   desktop peer, phone UI, or Meta glasses render targets. The command carries
   `policy_receipt_id`, `command_receipt_id`, and the render or recovery
   receipt ID returned to the widget.

The required receipt chain for MGW-originated commands is
`display_action_receipt_id -> event_receipt_id -> policy_receipt_id ->
command_receipt_id -> render_receipt_id`. If the MGW payload already contains
`orb_receipt_cid` or `policy_receipt_cid`, the bridge records those as aliases
on the matching receipt object and still allocates the Hallucinate App
`receipt_id` values. A confirmation prompt shown on glasses must therefore
confirm the Hallucinate App command receipt, not a client-local display action.

The bridge must reject any MGW action that cannot be tied to the active
`virtual_desktop_session`, participant ID, and policy receipt. Rejected actions
stop at a denial `mediation_receipt` and may render `terminal.render_summary`,
`terminal.dismiss`, or a display-widget recovery message, but they must not
invoke a desktop, phone, or Swissknife command directly.

### Operator-console plane contract

For VAI-007, Hallucinate App is promoted from a packaged shell to the
multimodal operator console for the virtual desktop. The operator-console plane
is the bridge between UI-plane participants, such as Swissknife, phone, and Meta
glasses surfaces, and runtime-plane targets, such as local adapters, MCP
providers, daemon-mediated workflows, desktop peers, and offloaded accelerator
tasks. UI-plane adapters may present controls and streams, but Hallucinate App
owns the command route, stream lease, proof chain, and recovery decision before
runtime execution changes state.

The operator-console IDL has four required subcontracts:

| Subcontract | Required fields | UI-plane responsibility | Runtime-plane responsibility |
| --- | --- | --- | --- |
| `operator_console_command_route` | `route_id`, `interaction_id`, `command_intent_id`, `source_surface`, `target_runtime`, `policy_receipt_id`, `placement_hint`, `fallback_targets` | Publish the normalized UI event and render the selected command state. | Execute only the command route selected after mediation and return execution receipts. |
| `operator_console_stream_control` | `stream_id`, `session_id`, `producer_participant_id`, `consumer_participant_ids`, `stream_kind`, `lease_state`, `backpressure_policy`, `pause_resume_receipt_ids` | Request, pause, resume, or stop audio, display, desktop-region, and response-token streams through Hallucinate App. | Honor stream leases, backpressure, cancellation, and fallback targets without bypassing mediation. |
| `operator_console_proof_capture` | `proof_id`, `event_receipt_id`, `policy_receipt_id`, `command_receipt_id`, `stream_receipt_ids`, `runtime_receipt_id`, `receipt_cid`, `redaction_profile` | Show receipt-backed status and expose proof links for operator inspection. | Attach runtime output, error, stream, and artifact receipts to the same proof chain. |
| `operator_console_error_recovery` | `recovery_id`, `failed_route_id`, `failure_class`, `last_good_receipt_id`, `retry_budget`, `fallback_surface`, `operator_action_required`, `recovery_receipt_id` | Render recovery state consistently on the phone UI, Swissknife UI, and Meta glasses terminal. | Retry, cancel, reroute, or fail closed according to the mediator-owned recovery outcome. |

The command routing lifecycle is:

1. A UI-plane surface submits an `interaction_envelope`.
2. Hallucinate App validates `control_surface_contract`, evaluates policy, and
   emits `policy_decision` plus `mediation_receipt`.
3. Hallucinate App creates one `operator_console_command_route` from the
   mediated `virtual_desktop_command_intent`.
4. The selected runtime-plane target executes only that route and returns
   `runtime_receipt_id`, `artifact_refs`, and any stream-control receipts.
5. Hallucinate App appends all receipts to `operator_console_proof_capture`
   and republishes status to every UI-plane participant.

Stream control is command-scoped. A stream may be created only by an allowed
command route, and every pause, resume, stop, backpressure, timeout, or consumer
handoff emits a stream receipt. Display-region streams from a desktop peer,
token streams from an agent workflow, audio streams from mobile or glasses, and
state-sync streams from Swissknife all share the same `lease_state` vocabulary:
`requested`, `active`, `paused`, `draining`, `stopped`, `failed`, and
`recovered`.

Proof capture is also command-scoped. The canonical proof chain is
`event_receipt_id -> policy_receipt_id -> command_receipt_id ->
stream_receipt_ids/runtime_receipt_id -> recovery_receipt_id`. Proof records
may include CIDs for stored artifacts, but the operator console must preserve
the receipt IDs in the UI so phone, Swissknife, desktop peer, and Meta glasses
participants can render the same audit trail.

Error recovery fails closed unless a mediated recovery route exists. Runtime
timeouts, peer disconnects, stream failures, denied policy decisions, evaluator
errors, malformed envelopes, missing proof receipts, and exhausted retry budgets
must create `operator_console_error_recovery` records. The recovery decision may
retry the same target, reroute to a fallback surface, request operator
confirmation, cancel the command, or keep the command denied. Runtime-plane
targets are not allowed to invent a recovery route without a
`recovery_receipt_id` issued by Hallucinate App.

## Meta-Glasses Relationship
The Meta-glasses path should be treated as:
- a remote interaction surface,
- a constrained rendering and event-input client,
- and a policy-subject of the AI-OS control plane.

It should not remain the canonical owner of multimodal control policy.

That means:
- glasses descriptors should conform to the Hallucinate App control contract,
- glasses-originated events should normalize into the Hallucinate App interaction envelope,
- and the mediation decision should be computed in the AI-OS shell before transport-specific execution continues.

## Phased Rollout

### Phase 1: Canonical documentation and contract ownership
- Land this plan in `hallucinate_app/docs`.
- Make Hallucinate App the canonical owner of the control-surface contract.
- Demote `lift_coding` copies to integration references.

### Phase 2: Descriptor contract definition
- Extend the Swissknife descriptor layer with `control_surface_contract`.
- Define shared schema for interaction envelopes and mediation receipts.

### Phase 3: Canonical interaction envelope
- Normalize voice, gesture, mouse, and agent actions into one envelope.
- Route remote client events through the same path.

### Phase 4: Policy compilation profile
- Add strict template rules for common UI and device control scenarios.
- Enable explanation-backed freeform compilation for advanced rules.

### Phase 5: Runtime mediation engine
- Insert a mediation step between normalized interaction and invocation.
- Emit structured decision receipts.

### Phase 6: Agent delegation integration
- Require agent-initiated actions to use the same policy path plus delegation metadata.

### Phase 7: Remote-client adoption
- Update Meta-glasses and other clients to publish into the canonical Hallucinate App contract.

### Phase 8: Observability, security, and rollback controls
- Roll out schema, policy decision, runtime mediation, daemon mediation, and
  remote-client enforcement behind the canonical feature flag modes.
- Publish low-cardinality metrics and audit receipts for shadow and enforce
  modes.
- Exercise schema, policy, and runtime rollback before broad enablement.

## Testing Strategy

### Unit tests
- descriptor schema validation,
- surface-to-intent normalization,
- strict-rule compilation,
- mediation decision precedence,
- explanation rendering.

### Integration tests
- desktop input -> mediation -> allowed invocation,
- desktop input -> mediation -> denied invocation,
- agent proposal -> confirmation gate,
- remote client event -> same mediation path.

### Regression tests
- the same canonical intent from different surfaces resolves to the same target method,
- paraphrased user rules remain stable when the compiler claims semantic equivalence,
- policy denials do not bypass transport or rendering constraints.

## First High-Value Slice
The smallest useful slice is:

1. add `control_surface_contract` to one Swissknife-backed descriptor,
2. define the canonical interaction envelope in Hallucinate App,
3. implement mediation for `display.activate` and `display.focus_next`,
4. support two strict rule templates:
   - ignore `{surface}` at `{time_window}`
   - require confirmation before `{method}`
5. emit mediation receipts in operator diagnostics.

This is the cheapest slice that can disconfirm the core assumption that one canonical descriptor and one mediation engine can safely serve all four surface types.

## Success Criteria
- Hallucinate App owns the canonical control-surface contract,
- one runtime mediation engine gates voice, gesture, mouse, and agent surfaces,
- natural-language user rules compile into explainable policy objects,
- denied actions are blocked before method execution and produce structured receipts,
- remote clients, including Meta-glasses flows, consume the same contract rather than defining competing ones.
