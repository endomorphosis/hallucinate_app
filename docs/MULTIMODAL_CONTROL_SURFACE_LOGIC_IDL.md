# Multimodal Control Surface Logic IDL Plan

Machine-readable backlog: `hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md`

The backlog is split into daemon-ingestible `HAO-` tasks. `HAO-000` through
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

Canonical schema artifact:
- `hallucinate_app/swissknife/contracts/control_surface_contract.schema.json`

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
