# Hallucinate App Multimodal Control Surface Logic IDL Todo Board

This is the machine-readable backlog for the `ipfs_datasets_py` todo supervisor/daemon.
It operationalizes `hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md`.

Run from the `lift_coding` repository root:

```bash
PYTHONPATH=external/ipfs_datasets python3 scripts/hallucinate_multimodal_control_todo_daemon.py --once
PYTHONPATH=external/ipfs_datasets python3 scripts/hallucinate_multimodal_control_todo_supervisor.py --once
PYTHONPATH=external/ipfs_datasets python3 scripts/hallucinate_multimodal_control_autopilot.py
python3 scripts/hallucinate_multimodal_control_llm_router.py --task-id HAO-004
```

Equivalent explicit invocations:

```bash
PYTHONPATH=external/ipfs_datasets python3 scripts/virtual_ai_os_todo_daemon.py --todo-path hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md --task-prefix "## HAO-" --state-prefix hallucinate_multimodal_control --state-dir data/hallucinate_multimodal_control/state --worktree-root data/hallucinate_multimodal_control/worktrees --once
PYTHONPATH=external/ipfs_datasets python3 scripts/virtual_ai_os_todo_supervisor.py --todo-path hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md --task-prefix "## HAO-" --state-prefix hallucinate_multimodal_control --state-dir data/hallucinate_multimodal_control/state --worktree-root data/hallucinate_multimodal_control/worktrees --once
```

The board uses `## HAO-` task headers plus `Status`, `Completion`, `Priority`, `Track`, `Depends on`, `Outputs`, `Validation`, and `Acceptance` metadata so `ipfs_datasets_py.optimizers.todo_daemon.implementation_daemon.parse_task_file` can ingest it directly.

## HAO-000 Bootstrap supervised multimodal-control backlog processing

- Status: completed
- Completion: manual
- Priority: P0
- Track: ops
- Depends on:
- Outputs: hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Validation: PYTHONPATH=external/ipfs_datasets python3 scripts/virtual_ai_os_todo_daemon.py --todo-path hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md --task-prefix "## HAO-" --state-prefix hallucinate_multimodal_control --state-dir data/hallucinate_multimodal_control/state --worktree-root data/hallucinate_multimodal_control/worktrees --once; PYTHONPATH=external/ipfs_datasets python3 scripts/virtual_ai_os_todo_supervisor.py --todo-path hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md --task-prefix "## HAO-" --state-prefix hallucinate_multimodal_control --state-dir data/hallucinate_multimodal_control/state --worktree-root data/hallucinate_multimodal_control/worktrees --once
- Acceptance: The Hallucinate App multimodal-control roadmap is available as a daemon-parseable backlog with a dedicated task prefix, state prefix, and worktree root.

## HAO-001 Record canonical ownership and AI-OS runtime boundaries

- Status: completed
- Completion: manual
- Priority: P0
- Track: ops
- Depends on: HAO-000
- Outputs: hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md, hallucinate_app/docs/INDEX.md, implementation_plan/docs/22-multimodal-control-surface-logic-idl.md
- Validation: rg -n "canonical|Hallucinate App|AI operating system|Meta-glasses|control-surface" hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md hallucinate_app/docs/INDEX.md implementation_plan/docs/22-multimodal-control-surface-logic-idl.md
- Acceptance: Hallucinate App is recorded as the canonical owner of multimodal control-surface logic and `lift_coding` is explicitly treated as the Meta-glasses integration slice.

## HAO-002 Define the shared `control_surface_contract` schema

- Status: completed
- Completion: manual
- Priority: P0
- Track: runtime
- Depends on: HAO-001
- Outputs: hallucinate_app/swissknife/contracts/control_surface_contract.schema.json, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Validation: rg -n "control_surface_contract|intent_bindings|policy_hooks|conflict_resolution" hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md hallucinate_app/swissknife/contracts/control_surface_contract.schema.json
- Acceptance: A canonical descriptor schema exists for multimodal control surfaces, method bindings, policy hooks, context schema, and conflict resolution without introducing a competing second control contract.

## HAO-003 Add the canonical interaction envelope and intent normalization layer

- Status: completed
- Completion: manual
- Priority: P0
- Track: runtime
- Depends on: HAO-002
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_intents.py, hallucinate_app/python/hallucinate_app/control_surface_context.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_intents.py
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_intents.py; rg -n "interaction_envelope|normalized_intent|surface_event|delegation_chain|state_frames" hallucinate_app/python/hallucinate_app hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Acceptance: Voice, gesture, mouse, and agent inputs normalize into one stable envelope before policy evaluation, with actor identity and runtime context preserved.

## HAO-004 Audit and pin the `ipfs_datasets_py.logic` API contract

- Status: completed
- Completion: manual
- Priority: P0
- Track: logic
- Depends on: HAO-003
- Outputs: data/hallucinate_multimodal_control/discovery/logic-api-inventory.md, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Validation: PYTHONPATH=external/ipfs_datasets python3 -c "exec(\"from ipfs_datasets_py.logic import api\\nrequired = ['compile_nl_to_policy', 'evaluate_nl_policy', 'NLUCANPolicyCompiler', 'evaluate_with_manager']\\nmissing = [name for name in required if not hasattr(api, name)]\\nassert not missing, missing\")"; rg -n "compile_nl_to_policy|evaluate_nl_policy|NLUCANPolicyCompiler|event_calculus|deontic|flogic" data/hallucinate_multimodal_control/discovery/logic-api-inventory.md hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Acceptance: The exact public logic-module APIs, optional imports, failure modes, and fallback strategy are documented before Hallucinate App depends on them at runtime.

## HAO-005 Define the formal multimodal control policy IR

- Status: completed
- Completion: manual
- Priority: P0
- Track: logic
- Depends on: HAO-004
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_logic_ir.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_logic_ir.py, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_logic_ir.py; rg -n "ControlSurfacePolicy|ControlSurfaceNorm|TemporalGuard|FrameFact|DeonticOutcome|event_calculus" hallucinate_app/python/hallucinate_app/control_surface_logic_ir.py hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Acceptance: A frame-first IR exists for actors, surfaces, events, methods, context facts, temporal guards, deontic norms, and target invocation effects.

## HAO-006 Upgrade descriptor schemas with formal policy bindings

- Status: completed
- Completion: manual
- Priority: P0
- Track: runtime
- Depends on: HAO-005
- Outputs: hallucinate_app/swissknife/contracts/control_surface_contract.schema.json, hallucinate_app/swissknife/contracts/interaction_envelope.schema.json, hallucinate_app/swissknife/contracts/policy_decision.schema.json, hallucinate_app/swissknife/contracts/mediation_receipt.schema.json, hallucinate_app/python/hallucinate_app/test/test_control_surface_schemas.py
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_schemas.py; rg -n "logic_bindings|policy_bundle_ref|compiled_policy_cid|interaction_envelope|policy_decision|mediation_receipt" hallucinate_app/swissknife/contracts hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Acceptance: Descriptor schemas explicitly connect interface methods and control surfaces to policy bundles, compiled logic artifacts, and mediation receipts.

## HAO-007 Implement strict-template natural-language rule compilation

- Status: completed
- Completion: manual
- Priority: P0
- Track: logic
- Depends on: HAO-005, HAO-006
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_policy.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_templates.py
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_templates.py; rg -n "ignore my \\{surface\\}|require confirmation before \\{method\\}|TemporalGuard|ControlSurfaceNorm" hallucinate_app/python/hallucinate_app/control_surface_policy.py hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_templates.py
- Acceptance: Deterministic templates compile high-confidence rules such as "ignore my wrist gestures at night" and "require confirmation before sending messages" into the formal IR without calling an LLM.

## HAO-008 Add the general `ipfs_datasets_py` NL policy compiler adapter

- Status: completed
- Completion: manual
- Priority: P0
- Track: logic
- Depends on: HAO-004, HAO-005, HAO-007
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_policy.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py
- Validation: PYTHONPATH=external/ipfs_datasets:hallucinate_app/python python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py; rg -n "compile_nl_to_policy|evaluate_nl_policy|NLUCANPolicyCompiler|clarification|compiler_lane" hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Acceptance: Freeform user rules route through `ipfs_datasets_py.logic.api` when available, produce explanations, and fall back to clarification or strict-template rejection when confidence is too low.

## HAO-009 Build context and event-calculus fact extraction

- Status: completed
- Completion: manual
- Priority: P0
- Track: logic
- Depends on: HAO-005, HAO-007
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_context.py, hallucinate_app/python/hallucinate_app/control_surface_logic_ir.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_event_context.py
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_event_context.py; rg -n "quiet_hours|sleeping|at_night|initiates|terminates|holds_at|state_frames" hallucinate_app/python/hallucinate_app
- Acceptance: Runtime context is converted into explicit event-calculus/frame facts so time windows, sleep state, driving state, meeting state, and device mode can gate interactions.

## HAO-010 Implement policy bundle persistence and CID references

- Status: completed
- Completion: manual
- Priority: P0
- Track: data
- Depends on: HAO-007, HAO-008
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_store.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_store.py, data/hallucinate_multimodal_control/policies
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_store.py; rg -n "policy_cid|compiled_policy|policy_bundle|stable_cid|explanation" hallucinate_app/python/hallucinate_app/control_surface_store.py hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Acceptance: Natural-language source rules, compiled IR, optional `ipfs_datasets_py` artifacts, user/profile attachment, and explanation text are persisted with stable content references.

## HAO-011 Implement the runtime mediation evaluator

- Status: completed
- Completion: manual
- Priority: P0
- Track: backend
- Depends on: HAO-005, HAO-009, HAO-010
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_mediator.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_mediator.py
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_mediator.py; rg -n "allow|deny|require_confirmation|defer|rewrite|fallback_surface|rate_limit|deny_over_permit" hallucinate_app/python/hallucinate_app/control_surface_mediator.py
- Acceptance: Every normalized interaction can be evaluated against active policy bundles and returns a rich decision before the target interface method can execute.

## HAO-012 Emit structured decision receipts and explanations

- Status: completed
- Completion: manual
- Priority: P0
- Track: backend
- Depends on: HAO-010, HAO-011
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_receipts.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_receipts.py, data/hallucinate_multimodal_control/receipts
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_receipts.py; rg -n "mediation_receipt|decision_id|policy_refs|explanation|surface|normalized_intent|context" hallucinate_app/python/hallucinate_app/control_surface_receipts.py
- Acceptance: Each mediation decision produces an auditable receipt that records the raw surface, normalized intent, actor, context facts, policies considered, outcome, and human-readable explanation.

## HAO-013 Validate descriptor conformance and policy hook compatibility

- Status: completed
- Completion: manual
- Priority: P0
- Track: quality
- Depends on: HAO-006, HAO-011, HAO-012
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_schema.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_descriptor_validation.py
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_descriptor_validation.py; rg -n "validate_control_surface_contract|intent_bindings|policy_hooks|allowed_surfaces|logic_bindings" hallucinate_app/python/hallucinate_app/control_surface_schema.py
- Acceptance: Invalid descriptors are rejected before runtime, including missing methods, unmapped surfaces, invalid policy hooks, unsupported event types, and unsafe conflict-resolution rules.

## HAO-014 Bind Swissknife descriptor and ORB surfaces to the control contract

- Status: completed
- Completion: manual
- Priority: P0
- Track: ui
- Depends on: HAO-011, HAO-013
- Outputs: hallucinate_app/swissknife, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Validation: rg -n "control_surface_contract|interaction_envelope|policy_decision|mediation_receipt|control_surface_mediator" hallucinate_app/swissknife hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Acceptance: Swissknife-backed descriptors and ORB/UI surfaces route voice, gesture, mouse, and agent intents through the same policy-aware mediation path before invoking interface methods.

## HAO-015 Implement voice-command intent resolver integration

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-011, HAO-014
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_voice.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_voice.py
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_voice.py; rg -n "voice|utterance|wake|confirm|cancel|min_confidence|clarify_below" hallucinate_app/python/hallucinate_app/control_surface_voice.py
- Acceptance: Voice utterances normalize into the canonical envelope, honor confidence policies, request clarification when needed, and evaluate through the same mediation engine as other surfaces.

## HAO-016 Implement gesture and wearable event resolver integration

- Status: completed
- Completion: manual
- Priority: P1
- Track: mobile
- Depends on: HAO-011, HAO-014
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_gesture.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_gesture.py
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_gesture.py; rg -n "gesture|wrist_raise|tap|swipe|hold|quiet_hours|sleeping" hallucinate_app/python/hallucinate_app/control_surface_gesture.py
- Acceptance: Gesture and wearable events normalize into the canonical envelope and rules such as "ignore my wrist gestures at night, because I'm sleeping" deny execution before method invocation.

## HAO-017 Implement mouse, touch, and pointer resolver integration

- Status: completed
- Completion: manual
- Priority: P1
- Track: ui
- Depends on: HAO-011, HAO-014
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_pointer.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_pointer.py
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_pointer.py; rg -n "mouse|pointer|click|double_click|hover|focus|target_ref" hallucinate_app/python/hallucinate_app/control_surface_pointer.py
- Acceptance: Pointer interactions produce the same intent envelope and policy decision path as voice, gesture, and agent actions, including destructive-action confirmation gates.

## HAO-018 Route AI-agent actions through delegation-aware mediation

- Status: completed
- Completion: manual
- Priority: P1
- Track: agents
- Depends on: HAO-008, HAO-011, HAO-012
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_agents.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_agents.py
- Validation: PYTHONPATH=external/ipfs_datasets:hallucinate_app/python python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_agents.py; rg -n "agent|delegation_chain|UCAN|autonomous_invoke|proposal|scheduled_action|requires_confirmation" hallucinate_app/python/hallucinate_app/control_surface_agents.py
- Acceptance: Agent proposals and autonomous invocations carry delegation metadata and cannot expand authority beyond the compiled policy/delegation chain.

## HAO-019 Add operator-console policy controls and diagnostics

- Status: completed
- Completion: manual
- Priority: P1
- Track: ui
- Depends on: HAO-012, HAO-014, HAO-018
- Outputs: hallucinate_app/index.js, hallucinate_app/preload.js, hallucinate_app/docs/MCP_DAEMON_ARCHITECTURE.md
- Validation: rg -n "policy|confirmation|multimodal|mediation|receipt|control_surface" hallucinate_app/index.js hallucinate_app/preload.js hallucinate_app/docs/MCP_DAEMON_ARCHITECTURE.md
- Acceptance: Operators can create rules, inspect compiled policy artifacts, approve confirmation-gated actions, and view receipts from the Hallucinate App shell.

## HAO-020 Integrate mediation with MCP daemon and service invocation paths

- Status: completed
- Completion: manual
- Priority: P1
- Track: backend
- Depends on: HAO-011, HAO-014, HAO-019
- Outputs: hallucinate_app/hallucinate_app/node, hallucinate_app/docs/MCP_DAEMON_ARCHITECTURE.md, hallucinate_app/python/hallucinate_app
- Validation: rg -n "control_surface|mediation|policy_decision|before invoke|MCP" hallucinate_app/hallucinate_app/node hallucinate_app/docs/MCP_DAEMON_ARCHITECTURE.md hallucinate_app/python/hallucinate_app
- Acceptance: MCP-managed services and ORB invocation paths expose a single pre-invocation mediation hook and cannot bypass policy decisions via daemon-managed transports.

## HAO-021 Integrate Meta-glasses, mobile, and simulator clients as remote surfaces

- Status: completed
- Completion: manual
- Priority: P1
- Track: mobile
- Depends on: HAO-014, HAO-016, HAO-020
- Outputs: hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md, implementation_plan/docs/20-meta-rayban-display-interface-simulator.md, implementation_plan/docs/22-multimodal-control-surface-logic-idl.md
- Validation: rg -n "Meta-glasses|remote interaction surface|interaction envelope|control contract|simulator|mobile" hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md implementation_plan/docs/20-meta-rayban-display-interface-simulator.md implementation_plan/docs/22-multimodal-control-surface-logic-idl.md
- Acceptance: Meta-glasses, mobile, and simulator paths publish normalized remote events into Hallucinate App rather than defining separate policy or control contracts.

## HAO-022 Build the multimodal policy corpus and unit regression harness

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: HAO-007, HAO-008, HAO-009, HAO-011, HAO-018
- Outputs: hallucinate_app/python/hallucinate_app/test/fixtures/control_surface_policy_corpus.json, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_corpus.py, data/hallucinate_multimodal_control/discovery
- Validation: python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_corpus.py; rg -n "Ignore my wrist gestures at night|Never let agents|Require confirmation|display.activate|display.focus_next" hallucinate_app/python/hallucinate_app/test/fixtures/control_surface_policy_corpus.json
- Acceptance: A curated corpus validates normalization, strict compilation, NL compiler fallback, conflict precedence, and explanation stability across equivalent voice/gesture/mouse/agent intents.

## HAO-023 Add end-to-end multimodal control-surface tests

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: HAO-014, HAO-015, HAO-016, HAO-017, HAO-018, HAO-019, HAO-020
- Outputs: hallucinate_app/test, hallucinate_app/test-results
- Validation: cd hallucinate_app && npm run test:e2e; rg -n "multimodal|control_surface|policy_decision|mediation_receipt" hallucinate_app/test hallucinate_app/test-results
- Acceptance: E2E tests prove the same canonical intent from voice, gesture, mouse, agent, and remote clients reaches the same method gate and receives a consistent policy decision.

## HAO-024 Add observability, security review, rollout flags, and rollback controls

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-012, HAO-019, HAO-020, HAO-023
- Outputs: hallucinate_app/docs/ARCHITECTURE.md, hallucinate_app/docs/MCP_DAEMON_ARCHITECTURE.md, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Validation: rg -n "observability|rollback|feature flag|policy decision|metrics|audit|security" hallucinate_app/docs/ARCHITECTURE.md hallucinate_app/docs/MCP_DAEMON_ARCHITECTURE.md hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Acceptance: The multimodal control plane has rollout-safe feature flags, audit metrics, privacy boundaries for raw payloads, and documented rollback steps for schema, policy, and runtime mediation changes.

## HAO-025 Investigate implementation unknowns and expand the backlog

- Status: completed
- Completion: manual
- Priority: P2
- Track: ops
- Depends on: HAO-004, HAO-005, HAO-006, HAO-007, HAO-008, HAO-009, HAO-010, HAO-011, HAO-012, HAO-013, HAO-014, HAO-015, HAO-016, HAO-017, HAO-018, HAO-019, HAO-020, HAO-021, HAO-022, HAO-023, HAO-024
- Outputs: hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md, data/hallucinate_multimodal_control/discovery
- Validation: PYTHONPATH=external/ipfs_datasets python3 scripts/hallucinate_multimodal_control_todo_supervisor.py --once; rg -n "HAO-025|unknowns|discovery|multimodal" hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md data/hallucinate_multimodal_control/discovery
- Acceptance: After the initial implementation queue completes, inspect Hallucinate App, Swissknife, `ipfs_datasets_py`, and remote clients for missed work; append new daemon-parseable HAO tasks or record a dated no-new-unknowns discovery report with evidence.

## HAO-026 Resolve merge retry-budget failure for HAO-005

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-004
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_logic_ir.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_logic_ir.py, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md, data/hallucinate_multimodal_control/discovery
- Validation: python3 -c 'exec("import json, pathlib\nstrategy = json.loads(pathlib.Path('"'"'/home/barberb/lift_coding/data/hallucinate_multimodal_control/state/hallucinate_multimodal_control_strategy.json'"'"').read_text(encoding='"'"'utf-8'"'"'))\nassert '"'"'HAO-005'"'"' not in strategy.get('"'"'blocked_tasks'"'"', [])")'
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-005. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-23-hao-026-hao-005-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are actually committed in their owning repository or submodule, then remove HAO-005 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-027 Resolve merge retry-budget failure for HAO-006

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-005
- Outputs: hallucinate_app/swissknife/contracts/control_surface_contract.schema.json, hallucinate_app/swissknife/contracts/interaction_envelope.schema.json, hallucinate_app/swissknife/contracts/policy_decision.schema.json, hallucinate_app/swissknife/contracts/mediation_receipt.schema.json, hallucinate_app/python/hallucinate_app/test/test_control_surface_schemas.py, data/hallucinate_multimodal_control/discovery
- Validation: python3 -c 'exec("import json, pathlib\nstrategy = json.loads(pathlib.Path('"'"'/home/barberb/lift_coding/data/hallucinate_multimodal_control/state/hallucinate_multimodal_control_strategy.json'"'"').read_text(encoding='"'"'utf-8'"'"'))\nassert '"'"'HAO-006'"'"' not in strategy.get('"'"'blocked_tasks'"'"', [])")'
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-006. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-23-hao-027-hao-006-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are actually committed in their owning repository or submodule, then remove HAO-006 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-028 Resolve merge retry-budget failure for HAO-009

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-005, HAO-007
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_context.py, hallucinate_app/python/hallucinate_app/control_surface_logic_ir.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_event_context.py, data/hallucinate_multimodal_control/discovery
- Validation: python3 -c 'exec("import json, pathlib\nstrategy = json.loads(pathlib.Path('"'"'/home/barberb/lift_coding/data/hallucinate_multimodal_control/state/hallucinate_multimodal_control_strategy.json'"'"').read_text(encoding='"'"'utf-8'"'"'))\nassert '"'"'HAO-009'"'"' not in strategy.get('"'"'blocked_tasks'"'"', [])")'
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-009. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-23-hao-028-hao-009-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are actually committed in their owning repository or submodule, then remove HAO-009 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-029 Resolve merge retry-budget failure for HAO-008

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-004, HAO-005, HAO-007
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_policy.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py, data/hallucinate_multimodal_control/discovery
- Validation: python3 -c 'exec("import json, pathlib\nstrategy = json.loads(pathlib.Path('"'"'/home/barberb/lift_coding/data/hallucinate_multimodal_control/state/hallucinate_multimodal_control_strategy.json'"'"').read_text(encoding='"'"'utf-8'"'"'))\nassert '"'"'HAO-008'"'"' not in strategy.get('"'"'blocked_tasks'"'"', [])")'
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-008. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-23-hao-029-hao-008-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are actually committed in their owning repository or submodule, then remove HAO-008 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-030 Resolve merge retry-budget failure for HAO-029

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-004, HAO-005, HAO-007
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_policy.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py, data/hallucinate_multimodal_control/discovery
- Validation: python3 -c 'exec("import json, pathlib\nstrategy = json.loads(pathlib.Path('"'"'/home/barberb/lift_coding/data/hallucinate_multimodal_control/state/hallucinate_multimodal_control_strategy.json'"'"').read_text(encoding='"'"'utf-8'"'"'))\nassert '"'"'HAO-029'"'"' not in strategy.get('"'"'blocked_tasks'"'"', [])")'
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-029. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-23-hao-030-hao-029-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are actually committed in their owning repository or submodule, then remove HAO-029 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-031 Resolve code annotation in data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md:9

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md
- Validation: test -f data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md
- Acceptance: Codebase scan filed this finding from data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md:9. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-031-codebase-scan-451e3aa78952.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-032 Resolve code annotation in data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md:14

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md
- Validation: test -f data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md
- Acceptance: Codebase scan filed this finding from data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md:14. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-032-codebase-scan-7c7b0a1f028e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-033 Resolve code annotation in data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md:63

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md
- Validation: test -f data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md
- Acceptance: Codebase scan filed this finding from data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md:63. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-033-codebase-scan-80aafe473bd6.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-034 Resolve code annotation in data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md:79

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md
- Validation: test -f data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md
- Acceptance: Codebase scan filed this finding from data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-013-discovery-expansion.md:79. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-034-codebase-scan-6dd7c88ccde8.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-035 Resolve code annotation in data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-014-validation-guardrails.md:25

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-014-validation-guardrails.md
- Validation: test -f data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-014-validation-guardrails.md
- Acceptance: Codebase scan filed this finding from data/meta_glasses_display_widgets/discovery/2026-05-22-mgw-014-validation-guardrails.md:25. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-035-codebase-scan-9e82839eb89c.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-036 Normalize remote client artifacts to the canonical control-surface envelope

- Status: completed
- Completion: manual
- Priority: P1
- Track: integration
- Depends on: HAO-014, HAO-020, HAO-021
- Outputs: spec/meta_glasses_mobile_orb_bridge_interface.json, src/handsfree/meta_glasses_mobile_orb_artifacts.py, src/handsfree/meta_glasses_mobile_orb_adapter.py, mobile, hallucinate_app/swissknife/src/services/meta-glasses-mobile-orb-bridge.ts, data/hallucinate_multimodal_control/discovery
- Validation: rg -n "control_surface_contract|interaction_envelope|normalized_intent|mediation_receipt" spec/meta_glasses_mobile_orb_bridge_interface.json src/handsfree/meta_glasses_mobile_orb_artifacts.py src/handsfree/meta_glasses_mobile_orb_adapter.py mobile hallucinate_app/swissknife/src/services/meta-glasses-mobile-orb-bridge.ts
- Acceptance: Use evidence in data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md to replace remote-client local permit/accepted artifacts with canonical Hallucinate App `interaction_envelope`, `normalized_intent`, `policy_decision`, and `mediation_receipt` payloads for Meta-glasses, mobile, and simulator paths. Remote clients may transport receipts, but they must not define or authorize a separate policy contract.

## HAO-037 Close fail-open JavaScript and Swissknife mediation gates

- Status: completed
- Completion: manual
- Priority: P0
- Track: security
- Depends on: HAO-008, HAO-009, HAO-011, HAO-014, HAO-020
- Outputs: hallucinate_app/hallucinate_app/node/control_surface_invocation.js, hallucinate_app/hallucinate_app/node/mcp_daemon_manager.js, hallucinate_app/swissknife/src/services/control-surface-mediator.ts, hallucinate_app/swissknife/src/services/mcp-orb-capability-router.ts, hallucinate_app/test, data/hallucinate_multimodal_control/discovery
- Validation: rg -n "policyHook|evaluate_control_surface_interaction|fail_closed|Default daemon-managed service mediation|control_surface_mediator" hallucinate_app/hallucinate_app/node hallucinate_app/swissknife/src/services hallucinate_app/test; cd hallucinate_app && npm run test:e2e
- Acceptance: Use evidence in data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md to ensure daemon-managed service invocation and Swissknife ORB mediation fail closed or require confirmation when no runtime policy evaluator is registered, and route descriptor-built envelopes through the Hallucinate App policy bundle evaluator before any transport invocation.

## HAO-038 Add a real `ipfs_datasets_py` policy-evaluation compatibility regression

- Status: completed
- Completion: manual
- Priority: P1
- Track: logic
- Depends on: HAO-004, HAO-008
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_policy.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py, data/hallucinate_multimodal_control/discovery
- Validation: PYTHONPATH=external/ipfs_datasets:hallucinate_app/python python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py && PYTHONPATH=external/ipfs_datasets:hallucinate_app/python python3 -c 'exec("from hallucinate_app.control_surface_policy import evaluate_ipfs_nl_policy\nresult = evaluate_ipfs_nl_policy(\"Alice may use display.activate\", tool=\"display.activate\", actor=\"Alice\")\nassert result.get(\"decision\") in {\"allow\", \"permit\", \"deny\", \"require_confirmation\"}\nassert \"unexpected keyword argument\" not in str(result.get(\"reason\", \"\"))")'
- Acceptance: Use evidence in data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md and logic-api-inventory.md to add a non-fake upstream `ipfs_datasets_py.logic.api` evaluation regression, shim or adapt the `at_time`/`now` compatibility mismatch, and prove Hallucinate App fails closed for evaluator errors without permanently treating the real upstream lane as unusable.

## HAO-039 Expand E2E coverage to exercise persisted policies and remote receipts

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: HAO-022, HAO-023, HAO-036, HAO-037
- Outputs: hallucinate_app/test/e2e/multimodal-control-surface.spec.ts, hallucinate_app/test-results, data/hallucinate_multimodal_control/discovery
- Validation: cd hallucinate_app && npm run test:e2e; rg -n "policy_bundle|PolicyBundleStore|require_confirmation|remote-meta-glasses|mediation_receipt" hallucinate_app/test/e2e/multimodal-control-surface.spec.ts hallucinate_app/test-results data/hallucinate_multimodal_control/discovery
- Acceptance: Use evidence in data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md to extend the multimodal E2E test beyond a test-only `setControlSurfacePolicyHook` callback. The test must seed or load real policy bundles, exercise allow/deny/require-confirmation outcomes, and assert that voice, gesture, mouse, agent, and remote-client receipts come from the same Hallucinate App mediation path.

## HAO-040 Resolve validation retry-budget failure for HAO-037

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: hallucinate_app/hallucinate_app/node/control_surface_invocation.js, hallucinate_app/hallucinate_app/node/mcp_daemon_manager.js, hallucinate_app/swissknife/src/services/control-surface-mediator.ts, hallucinate_app/swissknife/src/services/mcp-orb-capability-router.ts, hallucinate_app/test, data/hallucinate_multimodal_control/discovery
- Validation: cd hallucinate_app && npm run test:e2e
- Acceptance: Retry-budget guardrail filed this from repeated validation failures in HAO-037. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-040-hao-037-retry-budget.md to fix the validation blocker, then remove HAO-037 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-041 Resolve validation retry-budget failure for HAO-038

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_policy.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py, data/hallucinate_multimodal_control/discovery
- Validation: PYTHONPATH=external/ipfs_datasets:hallucinate_app/python python3 -c 'from hallucinate_app.control_surface_policy import evaluate_ipfs_nl_policy'
- Acceptance: Retry-budget guardrail filed this from repeated validation failures in HAO-038. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-041-hao-038-retry-budget.md to fix the validation blocker, then remove HAO-038 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-042 Resolve validation retry-budget failure for HAO-041

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_policy.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py, data/hallucinate_multimodal_control/discovery
- Validation: PYTHONPATH=external/ipfs_datasets:hallucinate_app/python python3 -c 'from hallucinate_app.control_surface_policy import evaluate_ipfs_nl_policy'
- Acceptance: Retry-budget guardrail filed this from repeated validation failures in HAO-041. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-042-hao-041-retry-budget.md to fix the validation blocker, then remove HAO-041 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-043 Resolve merge retry-budget failure for HAO-041

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_policy.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py, data/hallucinate_multimodal_control/discovery
- Validation: python3 -c 'exec("import json, pathlib\nstrategy = json.loads(pathlib.Path('"'"'/home/barberb/lift_coding/data/hallucinate_multimodal_control/state/hallucinate_multimodal_control_strategy.json'"'"').read_text(encoding='"'"'utf-8'"'"'))\nassert '"'"'HAO-041'"'"' not in strategy.get('"'"'blocked_tasks'"'"', [])")'
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-041. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-043-hao-041-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are actually committed in their owning repository or submodule, then remove HAO-041 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-044 Resolve merge retry-budget failure for HAO-042

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_policy.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py, data/hallucinate_multimodal_control/discovery
- Validation: python3 -c 'exec("import json, pathlib\nstrategy = json.loads(pathlib.Path('"'"'/home/barberb/lift_coding/data/hallucinate_multimodal_control/state/hallucinate_multimodal_control_strategy.json'"'"').read_text(encoding='"'"'utf-8'"'"'))\nassert '"'"'HAO-042'"'"' not in strategy.get('"'"'blocked_tasks'"'"', [])")'
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-042. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-044-hao-042-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are actually committed in their owning repository or submodule, then remove HAO-042 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-045 Resolve code annotation in data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md:11

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md
- Validation: test -f data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md
- Acceptance: Codebase scan filed this finding from data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md:11. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-045-codebase-scan-d128d628cc64.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-046 Resolve code annotation in data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md:22

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md
- Validation: test -f data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md
- Acceptance: Codebase scan filed this finding from data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md:22. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-046-codebase-scan-09a5288b833b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-047 Resolve code annotation in data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md:29

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md
- Validation: test -f data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md
- Acceptance: Codebase scan filed this finding from data/hallucinate_multimodal_control/discovery/2026-05-25-hao-025-implementation-unknowns.md:29. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-047-codebase-scan-c3c221c70d38.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-048 Resolve code annotation in data/hallucinate_multimodal_control/discovery/2026-05-25-hao-041-validation-unblock.md:24

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, data/hallucinate_multimodal_control/discovery/2026-05-25-hao-041-validation-unblock.md
- Validation: test -f data/hallucinate_multimodal_control/discovery/2026-05-25-hao-041-validation-unblock.md
- Acceptance: Codebase scan filed this finding from data/hallucinate_multimodal_control/discovery/2026-05-25-hao-041-validation-unblock.md:24. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-048-codebase-scan-55c0165aa8e2.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-049 Resolve code annotation in data/hallucinate_multimodal_control/discovery/2026-05-25-hao-044-hao-042-merge-unblock.md:25

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, data/hallucinate_multimodal_control/discovery/2026-05-25-hao-044-hao-042-merge-unblock.md
- Validation: test -f data/hallucinate_multimodal_control/discovery/2026-05-25-hao-044-hao-042-merge-unblock.md
- Acceptance: Codebase scan filed this finding from data/hallucinate_multimodal_control/discovery/2026-05-25-hao-044-hao-042-merge-unblock.md:25. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-049-codebase-scan-894285209757.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-050 Resolve code annotation in docs/CONFIGURATION.md:334

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, docs/CONFIGURATION.md
- Validation: test -f docs/CONFIGURATION.md
- Acceptance: Codebase scan filed this finding from docs/CONFIGURATION.md:334. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-050-codebase-scan-b76ea7345dc3.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-051 Resolve code annotation in docs/observability_metrics.md:223

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, docs/observability_metrics.md
- Validation: test -f docs/observability_metrics.md
- Acceptance: Codebase scan filed this finding from docs/observability_metrics.md:223. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-051-codebase-scan-adf0461bee8e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-052 Resolve code annotation in implementation_plan/docs/18-swissknife-meta-glasses-display-widgets.md:170

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/18-swissknife-meta-glasses-display-widgets.md
- Validation: test -f implementation_plan/docs/18-swissknife-meta-glasses-display-widgets.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/18-swissknife-meta-glasses-display-widgets.md:170. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-052-codebase-scan-d55a5adb5bda.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-053 Resolve code annotation in implementation_plan/docs/18-swissknife-meta-glasses-display-widgets.md:176

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/18-swissknife-meta-glasses-display-widgets.md
- Validation: test -f implementation_plan/docs/18-swissknife-meta-glasses-display-widgets.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/18-swissknife-meta-glasses-display-widgets.md:176. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-053-codebase-scan-5c0fa117f860.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-054 Resolve code annotation in implementation_plan/docs/19-virtual-ai-os-submodule-integration.md:14

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/19-virtual-ai-os-submodule-integration.md
- Validation: test -f implementation_plan/docs/19-virtual-ai-os-submodule-integration.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/19-virtual-ai-os-submodule-integration.md:14. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-054-codebase-scan-b56201c89923.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-055 Resolve code annotation in docs/CONFIGURATION.md:336

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, docs/CONFIGURATION.md
- Validation: test -f docs/CONFIGURATION.md
- Acceptance: Codebase scan filed this finding from docs/CONFIGURATION.md:336. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-055-codebase-scan-3af4e7253197.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-056 Resolve code annotation in implementation_plan/docs/19-virtual-ai-os-submodule-integration.md:194

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/19-virtual-ai-os-submodule-integration.md
- Validation: test -f implementation_plan/docs/19-virtual-ai-os-submodule-integration.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/19-virtual-ai-os-submodule-integration.md:194. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-056-codebase-scan-6d7a4a142c62.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-057 Resolve code annotation in implementation_plan/docs/19-virtual-ai-os-submodule-integration.md:338

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/19-virtual-ai-os-submodule-integration.md
- Validation: test -f implementation_plan/docs/19-virtual-ai-os-submodule-integration.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/19-virtual-ai-os-submodule-integration.md:338. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-057-codebase-scan-5ec44ca5bc8b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-058 Resolve code annotation in implementation_plan/docs/19-virtual-ai-os-submodule-integration.md:350

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/19-virtual-ai-os-submodule-integration.md
- Validation: test -f implementation_plan/docs/19-virtual-ai-os-submodule-integration.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/19-virtual-ai-os-submodule-integration.md:350. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-058-codebase-scan-7fec46831f17.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-059 Resolve code annotation in mobile/BUILD_AND_TEST_GLASSES_PLAYER.md:289

- Status: completed
- Completion: manual
- Priority: P3
- Track: quality
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/BUILD_AND_TEST_GLASSES_PLAYER.md
- Validation: test -f mobile/BUILD_AND_TEST_GLASSES_PLAYER.md
- Acceptance: Codebase scan filed this finding from mobile/BUILD_AND_TEST_GLASSES_PLAYER.md:289. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-059-codebase-scan-4599d851a66d.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-060 Close virtual AI OS objective gap: Virtual AI OS outcome

- Status: completed
- Completion: manual
- Priority: P0
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md, docs, tests
- Validation: test -f docs/observability_metrics.md && test -f implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Acceptance: Objective scan filed this gap for VAIOS-G000. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-060-objective-gap-8e0fb6e29f18.md, add code/tests/docs or child goals that prove the missing evidence terms are covered (Meta glasses remote terminal), and keep the supervisor-fed backlog aligned with the virtual AI OS objective heap. Add child goals when a missing proof cannot be closed by one focused task.

## HAO-061 Close virtual AI OS objective gap: Objective-driven supervisor loop

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md, scripts/hallucinate_multimodal_control_todo_daemon.py, tests/test_hallucinate_multimodal_control_todo_queue.py
- Validation: test -f scripts/hallucinate_multimodal_control_todo_daemon.py && test -f implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Acceptance: Objective scan filed this gap for VAIOS-G010. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-061-objective-gap-6e4124a265a4.md, add code/tests/docs or child goals that prove the missing evidence terms are covered (implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md), and keep the supervisor-fed backlog aligned with the virtual AI OS objective heap. Split into scoring, evidence indexing, and task-generation children if the scanner becomes too broad.

## HAO-062 Close virtual AI OS objective gap: Capability routing kernel

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md, src/handsfree, tests
- Validation: test -f tests/test_virtual_ai_os_capability_registry.py && test -f tests/test_virtual_ai_os_runtime_router.py
- Acceptance: Objective scan filed this gap for VAIOS-G020. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-062-objective-gap-4f0e11db46cf.md, add code/tests/docs or child goals that prove the missing evidence terms are covered (src/handsfree/capability_registry.py), and keep the supervisor-fed backlog aligned with the virtual AI OS objective heap. Add child goals for scheduler policy, fallback routing, and normalized error contracts.

## HAO-063 Close virtual AI OS objective gap: IDL, ORB, and MCP++ bridge

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md, swissknife, external/ipfs_datasets
- Validation: test -f hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Acceptance: Objective scan filed this gap for VAIOS-G030. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-063-objective-gap-5eadd5fc2d80.md, add code/tests/docs or child goals that prove the missing evidence terms are covered (interface descriptor language), and keep the supervisor-fed backlog aligned with the virtual AI OS objective heap. Add child goals for each control modality when a modality lacks descriptor, policy, and dispatch evidence.

## HAO-064 Close virtual AI OS objective gap: Operator shell and virtual desktop

- Status: completed
- Completion: manual
- Priority: P1
- Track: ui
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md, swissknife, hallucinate_app, tests
- Validation: test -f hallucinate_app/docs/SWISSKNIFE_VIRTUAL_DESKTOP_MOCKUP.md
- Acceptance: Objective scan filed this gap for VAIOS-G040. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-064-objective-gap-a149b1734e9a.md, add code/tests/docs or child goals that prove the missing evidence terms are covered (Hallucinate App operator console, ORB display harness), and keep the supervisor-fed backlog aligned with the virtual AI OS objective heap. Add child goals for task monitor, app launcher, ORB inspector, and session replay.

## HAO-065 Resolve merge retry-budget failure for HAO-063

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md, swissknife, external/ipfs_datasets
- Validation: python3 -c 'exec("import json, pathlib\nstrategy = json.loads(pathlib.Path('"'"'/home/barberb/lift_coding/data/hallucinate_multimodal_control/state/hallucinate_multimodal_control_strategy.json'"'"').read_text(encoding='"'"'utf-8'"'"'))\nassert '"'"'HAO-063'"'"' not in strategy.get('"'"'blocked_tasks'"'"', [])")'
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-063. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-065-hao-063-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are actually committed in their owning repository or submodule, run `python3 scripts/hallucinate_multimodal_control_merge_conflict_resolver.py --task-id HAO-063 --apply` when the conflict is semantic, then remove HAO-063 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-066 Resolve merge retry-budget failure for HAO-057

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/19-virtual-ai-os-submodule-integration.md
- Validation: python3 -c 'exec("import json, pathlib\nstrategy = json.loads(pathlib.Path('"'"'/home/barberb/lift_coding/data/hallucinate_multimodal_control/state/hallucinate_multimodal_control_strategy.json'"'"').read_text(encoding='"'"'utf-8'"'"'))\nassert '"'"'HAO-057'"'"' not in strategy.get('"'"'blocked_tasks'"'"', [])")'
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-057. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-066-hao-057-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are committed in their owning repository or submodule, run `ipfs-accelerate-agent-merge-resolver --events-path ... --apply` when the conflict is semantic, then remove HAO-057 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-067 Resolve merge retry-budget failure for HAO-058

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/19-virtual-ai-os-submodule-integration.md
- Validation: python3 -c 'exec("import json, pathlib\nstrategy = json.loads(pathlib.Path('"'"'/home/barberb/lift_coding/data/hallucinate_multimodal_control/state/hallucinate_multimodal_control_strategy.json'"'"').read_text(encoding='"'"'utf-8'"'"'))\nassert '"'"'HAO-058'"'"' not in strategy.get('"'"'blocked_tasks'"'"', [])")'
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-058. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-067-hao-058-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are committed in their owning repository or submodule, run `ipfs-accelerate-agent-merge-resolver --events-path ... --apply` when the conflict is semantic, then remove HAO-058 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-068 Resolve code annotation in implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:7

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Validation: test -f implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:7. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-068-codebase-scan-d3426e09a20d.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-069 Resolve code annotation in implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:25

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Validation: test -f implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:25. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-069-codebase-scan-4be4901209a8.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-070 Resolve code annotation in implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:27

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Validation: test -f implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:27. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-070-codebase-scan-f4c215bdd593.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-071 Resolve code annotation in implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:64

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Validation: test -f implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:64. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-071-codebase-scan-cfa685310a9f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-072 Resolve code annotation in implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:66

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Validation: test -f implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:66. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-072-codebase-scan-8c3aa5c5ef3e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-073 Resolve code annotation in implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:67

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Validation: test -f implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md
- Acceptance: Codebase scan filed this finding from implementation_plan/docs/23-virtual-ai-os-objective-goal-heap.md:67. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-073-codebase-scan-584cb35c884b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-074 Resolve code annotation in mobile/IMPLEMENTATION_SUMMARY.md:34

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/IMPLEMENTATION_SUMMARY.md
- Validation: test -f mobile/IMPLEMENTATION_SUMMARY.md
- Acceptance: Codebase scan filed this finding from mobile/IMPLEMENTATION_SUMMARY.md:34. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-074-codebase-scan-84e339e19c10.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-075 Resolve code annotation in mobile/IMPLEMENTATION_SUMMARY.md:151

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/IMPLEMENTATION_SUMMARY.md
- Validation: test -f mobile/IMPLEMENTATION_SUMMARY.md
- Acceptance: Codebase scan filed this finding from mobile/IMPLEMENTATION_SUMMARY.md:151. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-075-codebase-scan-e706f07eec5a.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-076 Resolve code annotation in mobile/IMPLEMENTATION_SUMMARY.md:158

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/IMPLEMENTATION_SUMMARY.md
- Validation: test -f mobile/IMPLEMENTATION_SUMMARY.md
- Acceptance: Codebase scan filed this finding from mobile/IMPLEMENTATION_SUMMARY.md:158. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-076-codebase-scan-acbc6d9e6c02.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-077 Resolve code annotation in mobile/PR-049-IMPLEMENTATION-SUMMARY.md:53

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/PR-049-IMPLEMENTATION-SUMMARY.md
- Validation: test -f mobile/PR-049-IMPLEMENTATION-SUMMARY.md
- Acceptance: Codebase scan filed this finding from mobile/PR-049-IMPLEMENTATION-SUMMARY.md:53. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-077-codebase-scan-06a10ba3b69c.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-078 Resolve code annotation in mobile/PR-049-IMPLEMENTATION-SUMMARY.md:76

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/PR-049-IMPLEMENTATION-SUMMARY.md
- Validation: test -f mobile/PR-049-IMPLEMENTATION-SUMMARY.md
- Acceptance: Codebase scan filed this finding from mobile/PR-049-IMPLEMENTATION-SUMMARY.md:76. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-078-codebase-scan-7422b5e07c0a.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-079 Resolve code annotation in mobile/glasses/IMPLEMENTATION_STATUS.md:255

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/glasses/IMPLEMENTATION_STATUS.md
- Validation: test -f mobile/glasses/IMPLEMENTATION_STATUS.md
- Acceptance: Codebase scan filed this finding from mobile/glasses/IMPLEMENTATION_STATUS.md:255. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-079-codebase-scan-2e0a15bdcce1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-080 Resolve code annotation in mobile/glasses/IMPLEMENTATION_STATUS_PR051.md:502

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/glasses/IMPLEMENTATION_STATUS_PR051.md
- Validation: test -f mobile/glasses/IMPLEMENTATION_STATUS_PR051.md
- Acceptance: Codebase scan filed this finding from mobile/glasses/IMPLEMENTATION_STATUS_PR051.md:502. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-080-codebase-scan-6baa51ecb406.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-081 Resolve code annotation in mobile/glasses/README.md:24

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/glasses/README.md
- Validation: test -f mobile/glasses/README.md
- Acceptance: Codebase scan filed this finding from mobile/glasses/README.md:24. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-081-codebase-scan-9fd50ccc053b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-082 Resolve code annotation in mobile/modules/glasses-audio/README.md:388

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/modules/glasses-audio/README.md
- Validation: test -f mobile/modules/glasses-audio/README.md
- Acceptance: Codebase scan filed this finding from mobile/modules/glasses-audio/README.md:388. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-082-codebase-scan-d01559e10610.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-083 Resolve code annotation in mobile/modules/glasses-audio/SETUP.md:314

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/modules/glasses-audio/SETUP.md
- Validation: test -f mobile/modules/glasses-audio/SETUP.md
- Acceptance: Codebase scan filed this finding from mobile/modules/glasses-audio/SETUP.md:314. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-083-codebase-scan-615ee8c7bd20.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-084 Resolve code annotation in mobile/src/screens/GlassesDiagnosticsScreen.original.js:183

- Status: completed
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/src/screens/GlassesDiagnosticsScreen.original.js
- Validation: test -f mobile/src/screens/GlassesDiagnosticsScreen.original.js
- Acceptance: Codebase scan filed this finding from mobile/src/screens/GlassesDiagnosticsScreen.original.js:183. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-084-codebase-scan-ebf2e488b403.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-085 Resolve code annotation in mobile/src/screens/GlassesDiagnosticsScreen.original.js:459

- Status: completed
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, mobile/src/screens/GlassesDiagnosticsScreen.original.js
- Validation: test -f mobile/src/screens/GlassesDiagnosticsScreen.original.js
- Acceptance: Codebase scan filed this finding from mobile/src/screens/GlassesDiagnosticsScreen.original.js:459. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-085-codebase-scan-21b32c23b1c8.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-086 Resolve code annotation in scripts/README.md:103

- Status: completed
- Completion: manual
- Priority: P2
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/README.md
- Validation: test -f scripts/README.md
- Acceptance: Codebase scan filed this finding from scripts/README.md:103. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-086-codebase-scan-fa5ee4831033.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-087 Resolve code annotation in scripts/README.md:139

- Status: completed
- Completion: manual
- Priority: P2
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/README.md
- Validation: test -f scripts/README.md
- Acceptance: Codebase scan filed this finding from scripts/README.md:139. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-087-codebase-scan-53d4fd79c853.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-088 Resolve code annotation in scripts/agent-runner.py:134

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/agent-runner.py
- Validation: python3 -m py_compile scripts/agent-runner.py
- Acceptance: Codebase scan filed this finding from scripts/agent-runner.py:134. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-088-codebase-scan-da57d9256ef3.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-089 Resolve code annotation in scripts/hallucinate_multimodal_control_llm_router.py:16

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_llm_router.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_llm_router.py:16. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-089-codebase-scan-46cf052213ba.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-090 Resolve code annotation in scripts/hallucinate_multimodal_control_llm_router.py:35

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_llm_router.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_llm_router.py:35. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-090-codebase-scan-a59310d0d681.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-091 Resolve code annotation in scripts/hallucinate_multimodal_control_llm_router.py:38

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_llm_router.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_llm_router.py:38. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-091-codebase-scan-f9d8d381447f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-092 Resolve code annotation in scripts/hallucinate_multimodal_control_llm_router.py:58

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_llm_router.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_llm_router.py:58. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-092-codebase-scan-d5c7d3fa56ea.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-093 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_daemon.py:2

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_daemon.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_daemon.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_daemon.py:2. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-093-codebase-scan-2e1e939bab5f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-094 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_daemon.py:16

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_daemon.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_daemon.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_daemon.py:16. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-094-codebase-scan-41452d0208e1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-095 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_daemon.py:259

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_daemon.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_daemon.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_daemon.py:259. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-095-codebase-scan-11f9bd56c269.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-096 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:2

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:2. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-096-codebase-scan-6f993aa3a890.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-097 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:250

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:250. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-097-codebase-scan-ad769814862c.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-098 Resolve code annotation in scripts/meta_glasses_display_llm_router.py:16

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_llm_router.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_llm_router.py:16. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-098-codebase-scan-df931db026fa.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-099 Resolve code annotation in scripts/meta_glasses_display_llm_router.py:35

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_llm_router.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_llm_router.py:35. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-099-codebase-scan-ee7817b82f17.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-100 Resolve code annotation in scripts/meta_glasses_display_llm_router.py:38

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_llm_router.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_llm_router.py:38. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-100-codebase-scan-6e4fbd36e646.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-101 Resolve code annotation in scripts/meta_glasses_display_llm_router.py:57

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_llm_router.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_llm_router.py:57. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-101-codebase-scan-51cfbb7d0bb1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-102 Resolve code annotation in scripts/meta_glasses_display_llm_router.py:59

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_llm_router.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_llm_router.py:59. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-102-codebase-scan-4a4abdc17147.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-103 Resolve code annotation in scripts/meta_glasses_display_todo_daemon.py:2

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_daemon.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_todo_daemon.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_todo_daemon.py:2. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-103-codebase-scan-05d6e89b8950.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-104 Resolve code annotation in scripts/meta_glasses_display_todo_daemon.py:17

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_daemon.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_todo_daemon.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_todo_daemon.py:17. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-104-codebase-scan-57a2558e6570.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-105 Resolve code annotation in scripts/meta_glasses_display_todo_daemon.py:252

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_daemon.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_todo_daemon.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_todo_daemon.py:252. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-105-codebase-scan-6a22c9965816.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-106 Resolve code annotation in scripts/meta_glasses_display_todo_supervisor.py:2

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_todo_supervisor.py:2. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-106-codebase-scan-39dd2b5fc368.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-107 Resolve code annotation in scripts/meta_glasses_display_todo_supervisor.py:15

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_todo_supervisor.py:15. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-107-codebase-scan-8dd3d77addd7.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-108 Resolve code annotation in scripts/meta_glasses_display_todo_supervisor.py:49

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_todo_supervisor.py:49. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-108-codebase-scan-0c2d12cab0f2.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-109 Resolve code annotation in scripts/meta_glasses_display_todo_supervisor.py:54

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_todo_supervisor.py:54. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-109-codebase-scan-b84ae96504a1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-110 Resolve code annotation in scripts/meta_glasses_display_todo_supervisor.py:55

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_todo_supervisor.py:55. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-110-codebase-scan-abfa25633460.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-111 Resolve code annotation in scripts/meta_glasses_display_todo_supervisor.py:61

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_todo_supervisor.py:61. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-111-codebase-scan-ce8a8683b537.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-112 Review swallowed exception path in scripts/smoke_demo.py:141

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/smoke_demo.py
- Validation: python3 -m py_compile scripts/smoke_demo.py
- Acceptance: Codebase scan filed this finding from scripts/smoke_demo.py:141. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-112-codebase-scan-d3346a231149.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-113 Resolve code annotation in scripts/virtual_ai_os_llm_router.py:16

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_llm_router.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_llm_router.py:16. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-113-codebase-scan-fb79eb5bbbd9.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-114 Resolve code annotation in scripts/virtual_ai_os_llm_router.py:35

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_llm_router.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_llm_router.py:35. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-114-codebase-scan-d5df2e3d34b5.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-115 Resolve code annotation in scripts/virtual_ai_os_llm_router.py:38

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_llm_router.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_llm_router.py:38. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-115-codebase-scan-691b11a0fbc1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-116 Resolve code annotation in scripts/virtual_ai_os_llm_router.py:57

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_llm_router.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_llm_router.py:57. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-116-codebase-scan-9060525af485.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-117 Resolve code annotation in scripts/virtual_ai_os_llm_router.py:59

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_llm_router.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_llm_router.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_llm_router.py:59. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-117-codebase-scan-08f229ba3bff.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-118 Resolve code annotation in scripts/virtual_ai_os_todo_daemon.py:2

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_daemon.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_daemon.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_daemon.py:2. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-118-codebase-scan-7c716ec97e88.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-119 Resolve code annotation in scripts/virtual_ai_os_todo_daemon.py:14

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_daemon.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_daemon.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_daemon.py:14. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-119-codebase-scan-f697f62fb190.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-120 Resolve code annotation in scripts/virtual_ai_os_todo_daemon.py:58

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_daemon.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_daemon.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_daemon.py:58. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-120-codebase-scan-dbc172236611.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-121 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:2

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:2. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-121-codebase-scan-fe5f63acad30.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-122 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:16

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:16. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-122-codebase-scan-dd1ee54d31b3.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-123 Resolve code annotation in src/handsfree/agent_providers.py:1824

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/agent_providers.py
- Validation: python3 -m py_compile src/handsfree/agent_providers.py
- Acceptance: Codebase scan filed this finding from src/handsfree/agent_providers.py:1824. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-123-codebase-scan-d137a2e48353.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-124 Resolve code annotation in src/handsfree/agent_providers.py:1843

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/agent_providers.py
- Validation: python3 -m py_compile src/handsfree/agent_providers.py
- Acceptance: Codebase scan filed this finding from src/handsfree/agent_providers.py:1843. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-124-codebase-scan-cc5b9143fd73.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-125 Resolve code annotation in src/handsfree/agent_providers.py:1845

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/agent_providers.py
- Validation: python3 -m py_compile src/handsfree/agent_providers.py
- Acceptance: Codebase scan filed this finding from src/handsfree/agent_providers.py:1845. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-125-codebase-scan-8acbfb19a443.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-126 Replace placeholder runtime path in src/handsfree/ai/capabilities.py:376

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ai/capabilities.py
- Validation: python3 -m py_compile src/handsfree/ai/capabilities.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ai/capabilities.py:376. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-126-codebase-scan-a70cd0bd27d0.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-127 Resolve code annotation in src/handsfree/config.py:53

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/config.py
- Validation: python3 -m py_compile src/handsfree/config.py
- Acceptance: Codebase scan filed this finding from src/handsfree/config.py:53. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-127-codebase-scan-2ce439753ef3.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-128 Review swallowed exception path in src/handsfree/github/auth.py:408

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/github/auth.py
- Validation: python3 -m py_compile src/handsfree/github/auth.py
- Acceptance: Codebase scan filed this finding from src/handsfree/github/auth.py:408. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-128-codebase-scan-98853974dbe3.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-129 Replace placeholder runtime path in src/handsfree/ipfs_accelerate_adapters.py:34

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_accelerate_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_accelerate_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_accelerate_adapters.py:34. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-129-codebase-scan-72757877b5f7.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-130 Replace placeholder runtime path in src/handsfree/ipfs_accelerate_adapters.py:59

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_accelerate_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_accelerate_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_accelerate_adapters.py:59. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-130-codebase-scan-5fce1886e75a.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-131 Review swallowed exception path in src/handsfree/ipfs_accelerate_adapters.py:85

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_accelerate_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_accelerate_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_accelerate_adapters.py:85. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-131-codebase-scan-47d452b8d421.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-132 Replace placeholder runtime path in src/handsfree/ipfs_datasets_routers.py:58

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_datasets_routers.py
- Validation: python3 -m py_compile src/handsfree/ipfs_datasets_routers.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_datasets_routers.py:58. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-132-codebase-scan-b34f88cc13d5.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-133 Review swallowed exception path in src/handsfree/ipfs_datasets_routers.py:130

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_datasets_routers.py
- Validation: python3 -m py_compile src/handsfree/ipfs_datasets_routers.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_datasets_routers.py:130. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-133-codebase-scan-b0ce9c04c82b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-134 Replace placeholder runtime path in src/handsfree/ipfs_kit_adapters.py:50

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_kit_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_kit_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_kit_adapters.py:50. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-134-codebase-scan-ce17f5d67a65.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-135 Replace placeholder runtime path in src/handsfree/ipfs_kit_adapters.py:84

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_kit_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_kit_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_kit_adapters.py:84. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-135-codebase-scan-9853192d204a.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-136 Review swallowed exception path in src/handsfree/ipfs_kit_adapters.py:94

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_kit_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_kit_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_kit_adapters.py:94. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-136-codebase-scan-6df4c25ab5e6.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-137 Replace placeholder runtime path in src/handsfree/ipfs_kit_adapters.py:96

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_kit_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_kit_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_kit_adapters.py:96. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-137-codebase-scan-32fdf750a8a1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-138 Review swallowed exception path in src/handsfree/ipfs_kit_adapters.py:88

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_kit_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_kit_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_kit_adapters.py:88. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-138-codebase-scan-5f5930d75f21.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-139 Replace placeholder runtime path in src/handsfree/ipfs_kit_adapters.py:122

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_kit_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_kit_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_kit_adapters.py:122. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-139-codebase-scan-7cdc6c25a5e1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-140 Replace placeholder runtime path in src/handsfree/ipfs_kit_adapters.py:137

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_kit_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_kit_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_kit_adapters.py:137. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-140-codebase-scan-1ea0adf2e36a.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-141 Replace placeholder runtime path in src/handsfree/ipfs_kit_adapters.py:168

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_kit_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_kit_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_kit_adapters.py:168. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-141-codebase-scan-feb489a0c62a.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-142 Replace placeholder runtime path in src/handsfree/ipfs_kit_adapters.py:176

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ipfs_kit_adapters.py
- Validation: python3 -m py_compile src/handsfree/ipfs_kit_adapters.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ipfs_kit_adapters.py:176. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-142-codebase-scan-958091124cbd.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-143 Replace placeholder runtime path in src/handsfree/ocr/stub_provider.py:38

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/ocr/stub_provider.py
- Validation: python3 -m py_compile src/handsfree/ocr/stub_provider.py
- Acceptance: Codebase scan filed this finding from src/handsfree/ocr/stub_provider.py:38. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-143-codebase-scan-914627da8285.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-144 Review swallowed exception path in src/handsfree/peer_chat.py:122

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/peer_chat.py
- Validation: python3 -m py_compile src/handsfree/peer_chat.py
- Acceptance: Codebase scan filed this finding from src/handsfree/peer_chat.py:122. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-144-codebase-scan-e0404f01baad.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-145 Review swallowed exception path in src/handsfree/peer_chat.py:143

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/peer_chat.py
- Validation: python3 -m py_compile src/handsfree/peer_chat.py
- Acceptance: Codebase scan filed this finding from src/handsfree/peer_chat.py:143. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-145-codebase-scan-ab48ea3fcc0c.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-146 Review swallowed exception path in src/handsfree/peer_chat.py:164

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/peer_chat.py
- Validation: python3 -m py_compile src/handsfree/peer_chat.py
- Acceptance: Codebase scan filed this finding from src/handsfree/peer_chat.py:164. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-146-codebase-scan-87a17f74176c.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-147 Review swallowed exception path in src/handsfree/redis_client.py:77

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/redis_client.py
- Validation: python3 -m py_compile src/handsfree/redis_client.py
- Acceptance: Codebase scan filed this finding from src/handsfree/redis_client.py:77. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-147-codebase-scan-7a1ac1883655.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-148 Review swallowed exception path in src/handsfree/transport/libp2p_bluetooth.py:1244

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, src/handsfree/transport/libp2p_bluetooth.py
- Validation: python3 -m py_compile src/handsfree/transport/libp2p_bluetooth.py
- Acceptance: Codebase scan filed this finding from src/handsfree/transport/libp2p_bluetooth.py:1244. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-148-codebase-scan-74ff113b87c6.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-149 Resolve code annotation in tests/test_hallucinate_multimodal_control_todo_queue.py:13

- Status: todo
- Completion: manual
- Priority: P3
- Track: quality
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tests/test_hallucinate_multimodal_control_todo_queue.py
- Validation: python3 -m py_compile tests/test_hallucinate_multimodal_control_todo_queue.py
- Acceptance: Codebase scan filed this finding from tests/test_hallucinate_multimodal_control_todo_queue.py:13. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-149-codebase-scan-cfe0d4fe2a26.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-150 Resolve code annotation in tests/test_hallucinate_multimodal_control_todo_queue.py:109

- Status: todo
- Completion: manual
- Priority: P3
- Track: quality
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tests/test_hallucinate_multimodal_control_todo_queue.py
- Validation: python3 -m py_compile tests/test_hallucinate_multimodal_control_todo_queue.py
- Acceptance: Codebase scan filed this finding from tests/test_hallucinate_multimodal_control_todo_queue.py:109. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-150-codebase-scan-f6dd69e1a884.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-151 Resolve code annotation in tests/test_hallucinate_multimodal_control_todo_queue.py:148

- Status: todo
- Completion: manual
- Priority: P3
- Track: quality
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tests/test_hallucinate_multimodal_control_todo_queue.py
- Validation: python3 -m py_compile tests/test_hallucinate_multimodal_control_todo_queue.py
- Acceptance: Codebase scan filed this finding from tests/test_hallucinate_multimodal_control_todo_queue.py:148. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-151-codebase-scan-67874c7c5cd5.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-152 Resolve code annotation in tests/test_hallucinate_multimodal_control_todo_queue.py:158

- Status: todo
- Completion: manual
- Priority: P3
- Track: quality
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tests/test_hallucinate_multimodal_control_todo_queue.py
- Validation: python3 -m py_compile tests/test_hallucinate_multimodal_control_todo_queue.py
- Acceptance: Codebase scan filed this finding from tests/test_hallucinate_multimodal_control_todo_queue.py:158. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-152-codebase-scan-6b53f1200587.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-153 Resolve code annotation in tests/test_hallucinate_multimodal_control_todo_queue.py:198

- Status: todo
- Completion: manual
- Priority: P3
- Track: quality
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tests/test_hallucinate_multimodal_control_todo_queue.py
- Validation: python3 -m py_compile tests/test_hallucinate_multimodal_control_todo_queue.py
- Acceptance: Codebase scan filed this finding from tests/test_hallucinate_multimodal_control_todo_queue.py:198. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-153-codebase-scan-5b0e88b287b1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-154 Resolve code annotation in tests/test_hallucinate_multimodal_control_todo_queue.py:255

- Status: completed
- Completion: manual
- Priority: P3
- Track: quality
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tests/test_hallucinate_multimodal_control_todo_queue.py
- Validation: python3 -m py_compile tests/test_hallucinate_multimodal_control_todo_queue.py
- Acceptance: Codebase scan filed this finding from tests/test_hallucinate_multimodal_control_todo_queue.py:255. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-154-codebase-scan-321fb2654d97.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-155 Resolve code annotation in tests/test_hallucinate_multimodal_control_todo_queue.py:264

- Status: todo
- Completion: manual
- Priority: P3
- Track: quality
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tests/test_hallucinate_multimodal_control_todo_queue.py
- Validation: python3 -m py_compile tests/test_hallucinate_multimodal_control_todo_queue.py
- Acceptance: Codebase scan filed this finding from tests/test_hallucinate_multimodal_control_todo_queue.py:264. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-155-codebase-scan-5ecb74a41392.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-156 Resolve code annotation in tests/test_hallucinate_multimodal_control_todo_queue.py:352

- Status: todo
- Completion: manual
- Priority: P3
- Track: quality
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tests/test_hallucinate_multimodal_control_todo_queue.py
- Validation: python3 -m py_compile tests/test_hallucinate_multimodal_control_todo_queue.py
- Acceptance: Codebase scan filed this finding from tests/test_hallucinate_multimodal_control_todo_queue.py:352. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-156-codebase-scan-b3755e8b3f3c.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-157 Resolve code annotation in tests/test_hallucinate_multimodal_control_todo_queue.py:372

- Status: completed
- Completion: manual
- Priority: P3
- Track: quality
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tests/test_hallucinate_multimodal_control_todo_queue.py
- Validation: python3 -m py_compile tests/test_hallucinate_multimodal_control_todo_queue.py
- Acceptance: Codebase scan filed this finding from tests/test_hallucinate_multimodal_control_todo_queue.py:372. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-26-hao-157-codebase-scan-f10169de2a93.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-158 Resolve code annotation in tracking/PR-051-android-glasses-recorder-player.md:21

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tracking/PR-051-android-glasses-recorder-player.md
- Validation: test -f tracking/PR-051-android-glasses-recorder-player.md
- Acceptance: Codebase scan filed this finding from tracking/PR-051-android-glasses-recorder-player.md:21. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-158-codebase-scan-d61ca3057077.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-159 Resolve code annotation in tracking/PR-052-glasses-js-integration-tts.md:26

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tracking/PR-052-glasses-js-integration-tts.md
- Validation: test -f tracking/PR-052-glasses-js-integration-tts.md
- Acceptance: Codebase scan filed this finding from tracking/PR-052-glasses-js-integration-tts.md:26. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-159-codebase-scan-27b8b4431606.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-160 Resolve code annotation in tracking/PR-079-agent-runner-minimal.md:7

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tracking/PR-079-agent-runner-minimal.md
- Validation: test -f tracking/PR-079-agent-runner-minimal.md
- Acceptance: Codebase scan filed this finding from tracking/PR-079-agent-runner-minimal.md:7. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-160-codebase-scan-e84a8c85ab29.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-161 Resolve code annotation in tracking/PR-079-agent-runner-minimal.md:16

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tracking/PR-079-agent-runner-minimal.md
- Validation: test -f tracking/PR-079-agent-runner-minimal.md
- Acceptance: Codebase scan filed this finding from tracking/PR-079-agent-runner-minimal.md:16. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-161-codebase-scan-d65e6d946f62.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-162 Resolve code annotation in tracking/PR-079-agent-runner-minimal.md:35

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tracking/PR-079-agent-runner-minimal.md
- Validation: test -f tracking/PR-079-agent-runner-minimal.md
- Acceptance: Codebase scan filed this finding from tracking/PR-079-agent-runner-minimal.md:35. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-162-codebase-scan-13883aa045ec.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-163 Resolve code annotation in tracking/PR-083-android-expo-glasses-audio-wav-playback.md:7

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tracking/PR-083-android-expo-glasses-audio-wav-playback.md
- Validation: test -f tracking/PR-083-android-expo-glasses-audio-wav-playback.md
- Acceptance: Codebase scan filed this finding from tracking/PR-083-android-expo-glasses-audio-wav-playback.md:7. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-163-codebase-scan-587ddb056b2b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-164 Resolve code annotation in tracking/PR-090-agent-runner-docs-sync.md:1

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tracking/PR-090-agent-runner-docs-sync.md
- Validation: test -f tracking/PR-090-agent-runner-docs-sync.md
- Acceptance: Codebase scan filed this finding from tracking/PR-090-agent-runner-docs-sync.md:1. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-164-codebase-scan-2c46fb58c8a1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-165 Resolve code annotation in tracking/PR-090-agent-runner-docs-sync.md:29

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, tracking/PR-090-agent-runner-docs-sync.md
- Validation: test -f tracking/PR-090-agent-runner-docs-sync.md
- Acceptance: Codebase scan filed this finding from tracking/PR-090-agent-runner-docs-sync.md:29. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-165-codebase-scan-015415cbcb23.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-166 Resolve code annotation in work/PR-046-expo-dev-client-native-glasses.md:14

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, work/PR-046-expo-dev-client-native-glasses.md
- Validation: test -f work/PR-046-expo-dev-client-native-glasses.md
- Acceptance: Codebase scan filed this finding from work/PR-046-expo-dev-client-native-glasses.md:14. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-166-codebase-scan-b5f5365b1aef.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-167 Resolve code annotation in work/PR-047-ios-audio-route-monitor.md:14

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, work/PR-047-ios-audio-route-monitor.md
- Validation: test -f work/PR-047-ios-audio-route-monitor.md
- Acceptance: Codebase scan filed this finding from work/PR-047-ios-audio-route-monitor.md:14. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-167-codebase-scan-98ff09f42056.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-168 Resolve code annotation in work/PR-081-privacy-mode-per-profile.md:18

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, work/PR-081-privacy-mode-per-profile.md
- Validation: test -f work/PR-081-privacy-mode-per-profile.md
- Acceptance: Codebase scan filed this finding from work/PR-081-privacy-mode-per-profile.md:18. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-168-codebase-scan-6dfbe572b893.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-169 Resolve code annotation in work/PR-090-agent-runner-docs-sync.md:1

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, work/PR-090-agent-runner-docs-sync.md
- Validation: test -f work/PR-090-agent-runner-docs-sync.md
- Acceptance: Codebase scan filed this finding from work/PR-090-agent-runner-docs-sync.md:1. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-169-codebase-scan-9b624a3cfffc.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-170 Resolve code annotation in hallucinate_app/MENU_STRUCTURE.md:11

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/MENU_STRUCTURE.md
- Validation: test -f hallucinate_app/MENU_STRUCTURE.md
- Acceptance: Codebase scan filed this finding from hallucinate_app/MENU_STRUCTURE.md:11. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-170-codebase-scan-adf5c0aa0a20.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-171 Resolve code annotation in hallucinate_app/docs/INDEX.md:24

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/docs/INDEX.md
- Validation: test -f hallucinate_app/docs/INDEX.md
- Acceptance: Codebase scan filed this finding from hallucinate_app/docs/INDEX.md:24. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-171-codebase-scan-58d2ea49839a.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-172 Resolve code annotation in hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md:3

- Status: todo
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Validation: test -f hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md
- Acceptance: Codebase scan filed this finding from hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.md:3. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-172-codebase-scan-b52e44553a92.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-173 Resolve code annotation in hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/SUPPORT.md:1

- Status: completed
- Completion: manual
- Priority: P3
- Track: docs
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/SUPPORT.md
- Validation: test -f hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/SUPPORT.md
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/SUPPORT.md:1. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-173-codebase-scan-b9a9faa1f210.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-174 Resolve code annotation in hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/webnn/mobilenet-v2/config.json:490

- Status: completed
- Completion: manual
- Priority: P2
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/webnn/mobilenet-v2/config.json
- Validation: python3 -m json.tool hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/webnn/mobilenet-v2/config.json >/dev/null
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/webnn/mobilenet-v2/config.json:490. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-174-codebase-scan-4c6bdcbe7ae9.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-175 Resolve code annotation in hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/webnn/mobilenet-v2/config.json:1265

- Status: todo
- Completion: manual
- Priority: P2
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/webnn/mobilenet-v2/config.json
- Validation: python3 -m json.tool hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/webnn/mobilenet-v2/config.json >/dev/null
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/webnn/mobilenet-v2/config.json:1265. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-175-codebase-scan-46c57a0d2580.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-176 Resolve code annotation in hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/xenova/resnet-50/config.json:490

- Status: completed
- Completion: manual
- Priority: P2
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/xenova/resnet-50/config.json
- Validation: python3 -m json.tool hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/xenova/resnet-50/config.json >/dev/null
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/xenova/resnet-50/config.json:490. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-176-codebase-scan-f8f1a727b0f0.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-177 Resolve code annotation in hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/xenova/resnet-50/config.json:1265

- Status: completed
- Completion: manual
- Priority: P2
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/xenova/resnet-50/config.json
- Validation: python3 -m json.tool hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/xenova/resnet-50/config.json >/dev/null
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/image-classification/models/xenova/resnet-50/config.json:1265. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-177-codebase-scan-c4e9cdcba420.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-178 Resolve code annotation in hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/stable-diffusion-1.5/index.js:874

- Status: completed
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/stable-diffusion-1.5/index.js
- Validation: test -f hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/stable-diffusion-1.5/index.js
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/stable-diffusion-1.5/index.js:874. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-178-codebase-scan-a73074e556ec.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-179 Resolve code annotation in hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/generation_utils.js:52

- Status: completed
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/generation_utils.js
- Validation: test -f hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/generation_utils.js
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/generation_utils.js:52. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-179-codebase-scan-af1c8f84f823.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-180 Resolve code annotation in hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/static/js/audioMotion-analyzer.js:1257

- Status: completed
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/static/js/audioMotion-analyzer.js
- Validation: test -f hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/static/js/audioMotion-analyzer.js
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/static/js/audioMotion-analyzer.js:1257. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-180-codebase-scan-fbaaa894a103.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-181 Resolve code annotation in hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/whisper.js:232

- Status: todo
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/whisper.js
- Validation: test -f hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/whisper.js
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/whisper.js:232. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-181-codebase-scan-249bb3d996f7.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-182 Resolve code annotation in hallucinate_app/hallucinate_app/node/daemon_manager.js:228

- Status: completed
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/node/daemon_manager.js
- Validation: test -f hallucinate_app/hallucinate_app/node/daemon_manager.js
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/node/daemon_manager.js:228. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-182-codebase-scan-f2932e5d08ca.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-183 Resolve merge retry-budget failure for HAO-181

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/experiments/webnn-developer-preview/demos/whisper-base/whisper.js
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-183-hao-181-merge-retry-budget.md
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-181. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-27-hao-183-hao-181-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are committed in their owning repository or submodule, run `ipfs-accelerate-agent-merge-resolver --events-path ... --apply` when the conflict is semantic, then mark this repair task completed so the supervisor can release HAO-181 from strategy blocked_tasks.

## HAO-184 Resolve code annotation in hallucinate_app/hallucinate_app/node/menu_generator.js:421

- Status: completed
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/node/menu_generator.js
- Validation: test -f hallucinate_app/hallucinate_app/node/menu_generator.js
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/node/menu_generator.js:421. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-184-codebase-scan-dc01283308ea.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-185 Resolve code annotation in hallucinate_app/hallucinate_app/node/menu_generator.js:433

- Status: todo
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/node/menu_generator.js
- Validation: test -f hallucinate_app/hallucinate_app/node/menu_generator.js
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/node/menu_generator.js:433. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-185-codebase-scan-616298b7fd51.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-186 Resolve code annotation in hallucinate_app/hallucinate_app/node/menu_generator.js:439

- Status: todo
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/node/menu_generator.js
- Validation: test -f hallucinate_app/hallucinate_app/node/menu_generator.js
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/node/menu_generator.js:439. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-186-codebase-scan-8b095211ac35.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-187 Resolve code annotation in hallucinate_app/hallucinate_app/node/menu_generator.js:444

- Status: done
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/node/menu_generator.js
- Validation: test -f hallucinate_app/hallucinate_app/node/menu_generator.js
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/node/menu_generator.js:444. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-187-codebase-scan-049d1ee62326.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-188 Resolve code annotation in hallucinate_app/hallucinate_app/node/menu_generator.js:449

- Status: completed
- Completion: manual
- Priority: P3
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/node/menu_generator.js
- Validation: test -f hallucinate_app/hallucinate_app/node/menu_generator.js
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/node/menu_generator.js:449. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-188-codebase-scan-924df9ad9af7.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-189 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:301

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:301. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-189-codebase-scan-7d52a8f929c8.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-190 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:303

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:303. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-190-codebase-scan-fbd7ce184cdf.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-191 Resolve code annotation in scripts/meta_glasses_display_todo_supervisor.py:302

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_todo_supervisor.py:302. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-191-codebase-scan-e0ee641647d4.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-192 Resolve code annotation in scripts/meta_glasses_display_todo_supervisor.py:304

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: python3 -m py_compile scripts/meta_glasses_display_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/meta_glasses_display_todo_supervisor.py:304. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-192-codebase-scan-8461e40bbb4a.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-193 Resolve code annotation in scripts/run_vai_mgw_hao_supervisors.sh:92

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/run_vai_mgw_hao_supervisors.sh
- Validation: test -f scripts/run_vai_mgw_hao_supervisors.sh
- Acceptance: Codebase scan filed this finding from scripts/run_vai_mgw_hao_supervisors.sh:92. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-193-codebase-scan-167e512adcc4.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-194 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:301

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:301. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-194-codebase-scan-f1f1d24fab6e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-195 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:302

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:302. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-195-codebase-scan-d560bccc2eec.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-196 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:304

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:304. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-196-codebase-scan-56c456b3af6b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-197 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:305

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:305. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-197-codebase-scan-5e4f836c3e48.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-198 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:161

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:161. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-198-codebase-scan-e7db865dfae5.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-199 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:301

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:301. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-199-codebase-scan-6a08fa66da0b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-200 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/advanced_thread_pool_manager.py:1171

- Status: todo
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/advanced_thread_pool_manager.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/advanced_thread_pool_manager.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/advanced_thread_pool_manager.py:1171. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-200-codebase-scan-74c66b0a97e9.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-201 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py:150

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py:150. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-201-codebase-scan-befeb053e24b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-202 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py:254

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py:254. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-202-codebase-scan-12771f5b880f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-203 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py:288

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py:288. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-203-codebase-scan-6c366e445285.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-204 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py:376

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/auth_keystore_integration.py:376. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-204-codebase-scan-90f09626ab01.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-205 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py:704

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py:704. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-205-codebase-scan-64f0b11ab70e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-206 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py:796

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py:796. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-206-codebase-scan-98082188a185.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-207 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1095

- Status: completed
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1095. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-207-codebase-scan-a5c282416212.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-208 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1096

- Status: completed
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1096. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-208-codebase-scan-9d8857a282a3.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-209 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py:810

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/duckdb_ipld_kit.py:810. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-209-codebase-scan-82006c12019b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-210 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1102

- Status: todo
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1102. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-210-codebase-scan-d54c9e83a2ed.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-211 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1103

- Status: completed
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1103. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-211-codebase-scan-d5b71515219e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-212 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/github_issue_reporter.py:369

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/github_issue_reporter.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/github_issue_reporter.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/github_issue_reporter.py:369. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-212-codebase-scan-b701b80bf41c.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-213 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py:102

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py:102. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-213-codebase-scan-adf00600c6b3.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-214 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1110

- Status: completed
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1110. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-214-codebase-scan-e115a28cef8a.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-215 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1111

- Status: completed
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1111. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-215-codebase-scan-a2d26a7117fd.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-216 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1118

- Status: todo
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1118. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-216-codebase-scan-32cf556b56c9.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-217 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py:175

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py:175. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-217-codebase-scan-8a2d973b6b52.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-218 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py:198

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_accelerate_server_mp.py:198. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-218-codebase-scan-bd5d75fcd4e5.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-219 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1111

- Status: todo
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1111. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-219-codebase-scan-17515b2de8e9.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-220 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1112

- Status: todo
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1112. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-220-codebase-scan-4de5dd15d666.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-221 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1119

- Status: completed
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1119. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-221-codebase-scan-1cb37fc590f2.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-222 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_embeddings_py/ipfs_embeddings_py.py:611

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_embeddings_py/ipfs_embeddings_py.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_embeddings_py/ipfs_embeddings_py.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_embeddings_py/ipfs_embeddings_py.py:611. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-222-codebase-scan-cbf158a57c00.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-223 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_embeddings_py/ipfs_faiss_py.py:589

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_embeddings_py/ipfs_faiss_py.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_embeddings_py/ipfs_faiss_py.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_embeddings_py/ipfs_faiss_py.py:589. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-28-hao-223-codebase-scan-0c17756fc821.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-224 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1114

- Status: completed
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1114. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-224-codebase-scan-a443e9f0cf9d.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-225 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1115

- Status: completed
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1115. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-225-codebase-scan-476c9d2eeaea.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-226 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1118

- Status: todo
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1118. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-226-codebase-scan-cfe01394b5b6.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-227 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1121

- Status: completed
- Completion: manual
- Priority: P2
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py:1121. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-227-codebase-scan-f2f5d5fa5a3e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-228 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_kit.py:336

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_kit.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_kit.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_kit.py:336. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-228-codebase-scan-bc14c3b9ed8c.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-229 Resolve implementation retry-budget failure for HAO-216

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-229-hao-216-implementation-retry-budget.md
- Acceptance: Implementation retry-budget guardrail filed this from repeated implementation failures in HAO-216. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-229-hao-216-implementation-retry-budget.md to fix the setup, runtime, or timeout blocker, then mark this repair task completed so the supervisor can release HAO-216 from strategy blocked_tasks.

## HAO-230 Resolve implementation retry-budget failure for HAO-225

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/error_monitor.py
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-230-hao-225-implementation-retry-budget.md
- Acceptance: Implementation retry-budget guardrail filed this from repeated implementation failures in HAO-225. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-230-hao-225-implementation-retry-budget.md to fix the setup, runtime, or timeout blocker, then mark this repair task completed so the supervisor can release HAO-225 from strategy blocked_tasks.

## HAO-231 Resolve implementation retry-budget failure for HAO-192

- Status: todo
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-231-hao-192-implementation-retry-budget.md
- Acceptance: Implementation retry-budget guardrail filed this from repeated implementation failures in HAO-192. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-231-hao-192-implementation-retry-budget.md to fix the setup, runtime, or timeout blocker, then mark this repair task completed so the supervisor can release HAO-192 from strategy blocked_tasks.

## HAO-232 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:304

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:304. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-232-codebase-scan-817d59137a83.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-233 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:17

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:17. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-233-codebase-scan-199c9802cce0.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-234 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:19

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:19. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-234-codebase-scan-94c3b95fdec8.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-235 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:159

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:159. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-235-codebase-scan-ed54ac82ae36.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-236 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_model_manager.py:463

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_model_manager.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_model_manager.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_model_manager.py:463. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-236-codebase-scan-7d70e6a388f4.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-237 Resolve implementation retry-budget failure for HAO-231

- Status: todo
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-237-hao-231-implementation-retry-budget.md
- Acceptance: Implementation retry-budget guardrail filed this from repeated implementation failures in HAO-231. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-237-hao-231-implementation-retry-budget.md to fix the setup, runtime, or timeout blocker, then mark this repair task completed so the supervisor can release HAO-231 from strategy blocked_tasks.

## HAO-238 Resolve implementation retry-budget failure for HAO-237

- Status: todo
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-238-hao-237-implementation-retry-budget.md
- Acceptance: Implementation retry-budget guardrail filed this from repeated implementation failures in HAO-237. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-238-hao-237-implementation-retry-budget.md to fix the setup, runtime, or timeout blocker, then mark this repair task completed so the supervisor can release HAO-237 from strategy blocked_tasks.

## HAO-239 Resolve implementation retry-budget failure for HAO-238

- Status: todo
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-239-hao-238-implementation-retry-budget.md
- Acceptance: Implementation retry-budget guardrail filed this from repeated implementation failures in HAO-238. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-239-hao-238-implementation-retry-budget.md to fix the setup, runtime, or timeout blocker, then mark this repair task completed so the supervisor can release HAO-238 from strategy blocked_tasks.

## HAO-240 Resolve implementation retry-budget failure for HAO-239

- Status: todo
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-240-hao-239-implementation-retry-budget.md
- Acceptance: Implementation retry-budget guardrail filed this from repeated implementation failures in HAO-239. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-240-hao-239-implementation-retry-budget.md to fix the setup, runtime, or timeout blocker, then mark this repair task completed so the supervisor can release HAO-239 from strategy blocked_tasks.

## HAO-241 Resolve implementation retry-budget failure for HAO-240

- Status: todo
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/meta_glasses_display_todo_supervisor.py
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-241-hao-240-implementation-retry-budget.md
- Acceptance: Implementation retry-budget guardrail filed this from repeated implementation failures in HAO-240. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-30-hao-241-hao-240-implementation-retry-budget.md to fix the setup, runtime, or timeout blocker, then mark this repair task completed so the supervisor can release HAO-240 from strategy blocked_tasks.

## HAO-242 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:304

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:304. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-242-codebase-scan-9f8f16918698.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-243 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:305

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:305. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-243-codebase-scan-969bf9b8ee48.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-244 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:307

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:307. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-244-codebase-scan-40a76d752077.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-245 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:166

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:166. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-245-codebase-scan-771cf546eea1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-246 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:168

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:168. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-246-codebase-scan-327341fc876a.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-247 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:304

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:304. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-247-codebase-scan-9b295a13298f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-248 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:307

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:307. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-248-codebase-scan-5473dc5ddeb3.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-249 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:308

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:308. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-249-codebase-scan-c0b8d370e688.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-250 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:44

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:44. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-250-codebase-scan-8164d3ed24f1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-251 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:167

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:167. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-251-codebase-scan-35bd5e6b300e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-252 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_daemon.py:47

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_daemon.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_daemon.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_daemon.py:47. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-252-codebase-scan-c4894982f031.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-253 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:304

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:304. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-253-codebase-scan-5c4a0f935809.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-254 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:307

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:307. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-254-codebase-scan-b4a281bbedf2.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-255 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:168

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:168. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-255-codebase-scan-dd842b42da6e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-256 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:170

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:170. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-256-codebase-scan-cef5165bc6bd.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-257 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:304

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:304. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-257-codebase-scan-587479ca3454.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-258 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:307

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:307. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-258-codebase-scan-5a514d5efa1f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-259 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:19

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:19. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-259-codebase-scan-c264d0ec0538.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-260 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:20

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:20. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-260-codebase-scan-153d93e5a828.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-261 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:168

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:168. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-261-codebase-scan-7b3d8a1bbd72.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-262 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:304

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:304. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-262-codebase-scan-c6a047779577.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-263 Resolve code annotation in scripts/hallucinate_multimodal_control_todo_supervisor.py:307

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/hallucinate_multimodal_control_todo_supervisor.py
- Validation: python3 -m py_compile scripts/hallucinate_multimodal_control_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/hallucinate_multimodal_control_todo_supervisor.py:307. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-263-codebase-scan-776efef6a92f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-264 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:19

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:19. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-264-codebase-scan-c22071473443.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-265 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:168

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:168. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-265-codebase-scan-07de3bf977f1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-266 Resolve code annotation in scripts/virtual_ai_os_todo_supervisor.py:169

- Status: completed
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: python3 -m py_compile scripts/virtual_ai_os_todo_supervisor.py
- Acceptance: Codebase scan filed this finding from scripts/virtual_ai_os_todo_supervisor.py:169. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-266-codebase-scan-bdaa854064ba.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-267 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_model_manager.py:283

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_model_manager.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_model_manager.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/ipfs_model_manager.py:283. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-267-codebase-scan-c14f51d2c277.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-268 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/js_bridge/pyarrow_content_index_bridge.py:752

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/js_bridge/pyarrow_content_index_bridge.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/js_bridge/pyarrow_content_index_bridge.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/js_bridge/pyarrow_content_index_bridge.py:752. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-268-codebase-scan-e481dd8596ca.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-269 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/secure_duckdb_ipld_manager.py:1249

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/secure_duckdb_ipld_manager.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/secure_duckdb_ipld_manager.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/secure_duckdb_ipld_manager.py:1249. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-269-codebase-scan-cdfcf34f4b38.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-270 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test.py:374

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test.py:374. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-270-codebase-scan-0a7038674197.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-271 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_database_sync_manager_integration.py:229

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_database_sync_manager_integration.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_database_sync_manager_integration.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_database_sync_manager_integration.py:229. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-271-codebase-scan-355e82beb5ad.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-272 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/pyarrow_content_index.py:2572

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/pyarrow_content_index.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/pyarrow_content_index.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/pyarrow_content_index.py:2572. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-272-codebase-scan-5b83ca7aecf0.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-273 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/secure_duckdb_ipld_manager.py:1250

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/secure_duckdb_ipld_manager.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/secure_duckdb_ipld_manager.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/secure_duckdb_ipld_manager.py:1250. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-273-codebase-scan-6211ceb94042.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-274 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:269

- Status: completed
- Completion: manual
- Priority: P2
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:269. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-274-codebase-scan-44221032650b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-275 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:270

- Status: completed
- Completion: manual
- Priority: P2
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:270. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-275-codebase-scan-e5642628d285.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-276 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:375

- Status: completed
- Completion: manual
- Priority: P2
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:375. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-276-codebase-scan-786ae5f09257.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-277 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:400

- Status: completed
- Completion: manual
- Priority: P2
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:400. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-277-codebase-scan-3ab525dee4a4.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-278 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:462

- Status: completed
- Completion: manual
- Priority: P2
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:462. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-278-codebase-scan-851ad878de18.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-279 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_graphrag.py:49

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_graphrag.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_graphrag.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_graphrag.py:49. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-279-codebase-scan-1a4201168690.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-280 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_model_manager.py:111

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_model_manager.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_model_manager.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_model_manager.py:111. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-280-codebase-scan-d1896c885a98.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-281 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager.py:525

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager.py:525. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-281-codebase-scan-98e8b6840819.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-282 Resolve code annotation in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:388

- Status: completed
- Completion: manual
- Priority: P2
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_error_monitor.py:388. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-282-codebase-scan-5bfe62da24dd.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-283 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager.py:525

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager.py:525. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-283-codebase-scan-fa4d6e61690f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-284 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager_integration.py:124

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager_integration.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager_integration.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager_integration.py:124. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-284-codebase-scan-682619f97604.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-285 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager_integration.py:129

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager_integration.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager_integration.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_secure_pyarrow_index_manager_integration.py:129. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-285-codebase-scan-5c3bc9335211.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-286 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_thread_pool_monitor.py:324

- Status: todo
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_thread_pool_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_thread_pool_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_thread_pool_monitor.py:324. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-286-codebase-scan-ccb16b8cf977.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-287 Review swallowed exception path in hallucinate_app/hallucinate_app/python/ucan_auth_py/ucan_auth_py/crypto/did.py:51

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/ucan_auth_py/ucan_auth_py/crypto/did.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/ucan_auth_py/ucan_auth_py/crypto/did.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/ucan_auth_py/ucan_auth_py/crypto/did.py:51. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-287-codebase-scan-de16da175a5b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-288 Review swallowed exception path in hallucinate_app/hallucinate_app/python/worker.py:89

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/worker.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/worker.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/worker.py:89. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-288-codebase-scan-61251be19e93.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-289 Review swallowed exception path in hallucinate_app/python/hallucinate_app/control_surface_policy.py:409

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Validation: python3 -m py_compile hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/python/hallucinate_app/control_surface_policy.py:409. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-289-codebase-scan-723086103552.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-290 Review swallowed exception path in hallucinate_app/python/hallucinate_app/control_surface_policy.py:473

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Validation: python3 -m py_compile hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/python/hallucinate_app/control_surface_policy.py:473. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-290-codebase-scan-40b1d7ecd06c.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-291 Review swallowed exception path in hallucinate_app/python/hallucinate_app/control_surface_policy.py:768

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Validation: python3 -m py_compile hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/python/hallucinate_app/control_surface_policy.py:768. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-31-hao-291-codebase-scan-03445a3ae516.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-292 Resolve merge retry-budget failure for HAO-286

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_thread_pool_monitor.py
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-292-hao-286-merge-retry-budget.md
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-286. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-292-hao-286-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are committed in their owning repository or submodule, run `ipfs-accelerate-agent-merge-resolver --events-path ... --apply` when the conflict is semantic, then mark this repair task completed so the supervisor can release HAO-286 from strategy blocked_tasks.

## HAO-293 Review swallowed exception path in hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_thread_pool_monitor.py:324

- Status: todo
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_thread_pool_monitor.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_thread_pool_monitor.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/hallucinate_app/test/test_thread_pool_monitor.py:324. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-293-codebase-scan-a1956a8b9a85.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-294 Review swallowed exception path in hallucinate_app/python/hallucinate_app/control_surface_policy.py:779

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Validation: python3 -m py_compile hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/python/hallucinate_app/control_surface_policy.py:779. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-294-codebase-scan-ad7f61446de8.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-295 Review swallowed exception path in hallucinate_app/python/hallucinate_app/control_surface_policy.py:1015

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Validation: python3 -m py_compile hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/python/hallucinate_app/control_surface_policy.py:1015. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-295-codebase-scan-a5551cedaa03.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-296 Review swallowed exception path in hallucinate_app/python/hallucinate_app/control_surface_policy.py:1020

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Validation: python3 -m py_compile hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/python/hallucinate_app/control_surface_policy.py:1020. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-296-codebase-scan-a71af3b6f995.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-297 Review swallowed exception path in hallucinate_app/python/hallucinate_app/control_surface_policy.py:1025

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Validation: python3 -m py_compile hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/python/hallucinate_app/control_surface_policy.py:1025. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-297-codebase-scan-702ac0beaa18.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-298 Review swallowed exception path in hallucinate_app/python/hallucinate_app/control_surface_receipts.py:566

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/control_surface_receipts.py
- Validation: python3 -m py_compile hallucinate_app/python/hallucinate_app/control_surface_receipts.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/python/hallucinate_app/control_surface_receipts.py:566. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-298-codebase-scan-4186d777ba98.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-299 Review swallowed exception path in hallucinate_app/python/hallucinate_app/control_surface_store.py:508

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/control_surface_store.py
- Validation: python3 -m py_compile hallucinate_app/python/hallucinate_app/control_surface_store.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/python/hallucinate_app/control_surface_store.py:508. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-299-codebase-scan-546c38fc798a.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-300 Review swallowed exception path in hallucinate_app/python/hallucinate_app/control_surface_store.py:513

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/control_surface_store.py
- Validation: python3 -m py_compile hallucinate_app/python/hallucinate_app/control_surface_store.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/python/hallucinate_app/control_surface_store.py:513. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-300-codebase-scan-565bd308c1dc.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-301 Resolve code annotation in hallucinate_app/python/hallucinate_app/ipfs_kit_bridge.py:793

- Status: todo
- Completion: manual
- Priority: P3
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/ipfs_kit_bridge.py
- Validation: python3 -m py_compile hallucinate_app/python/hallucinate_app/ipfs_kit_bridge.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/python/hallucinate_app/ipfs_kit_bridge.py:793. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-301-codebase-scan-35009422e1fa.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-302 Review swallowed exception path in hallucinate_app/test/python/test_graphrag.py:118

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/test/python/test_graphrag.py
- Validation: python3 -m py_compile hallucinate_app/test/python/test_graphrag.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/test/python/test_graphrag.py:118. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-302-codebase-scan-94bc2b69153d.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-303 Resolve implementation retry-budget failure for HAO-300

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/python/hallucinate_app/control_surface_store.py
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-303-hao-300-implementation-retry-budget.md
- Acceptance: Implementation retry-budget guardrail filed this from repeated implementation failures in HAO-300. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-06-hao-303-hao-300-implementation-retry-budget.md to fix the setup, runtime, or timeout blocker, then mark this repair task completed so the supervisor can release HAO-300 from strategy blocked_tasks.

## HAO-304 Review swallowed exception path in hallucinate_app/hallucinate_app/python/ucan_auth_py/ucan_auth_py/core/token.py:226

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/hallucinate_app/python/ucan_auth_py/ucan_auth_py/core/token.py
- Validation: python3 -m py_compile hallucinate_app/hallucinate_app/python/ucan_auth_py/ucan_auth_py/core/token.py
- Acceptance: Codebase scan filed this finding from hallucinate_app/hallucinate_app/python/ucan_auth_py/ucan_auth_py/core/token.py:226. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-304-codebase-scan-acad0c8439c6.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-305 Review swallowed exception path in external/ipfs_kit/.github/scripts/generate_workflow_list.py:36

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/.github/scripts/generate_workflow_list.py
- Validation: python3 -m py_compile external/ipfs_kit/.github/scripts/generate_workflow_list.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/.github/scripts/generate_workflow_list.py:36. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-305-codebase-scan-67e750fa2595.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-306 Review swallowed exception path in external/ipfs_kit/.github/workflows/auto-doc-maintenance.yml:120

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/.github/workflows/auto-doc-maintenance.yml
- Validation: test -s external/ipfs_kit/.github/workflows/auto-doc-maintenance.yml
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/.github/workflows/auto-doc-maintenance.yml:120. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-306-codebase-scan-f5c0089e31da.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-307 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/add_pins_monkey_patch.py:39

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/add_pins_monkey_patch.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/add_pins_monkey_patch.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/add_pins_monkey_patch.py:39. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-307-codebase-scan-7e74c27a365d.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-308 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/advanced_filecoin.py:984

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/advanced_filecoin.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/advanced_filecoin.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/advanced_filecoin.py:984. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-308-codebase-scan-f223d9e5d048.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-309 Resolve dirty main checkout blocking 20 worktree merges

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Fingerprint: cc1db0bf17a090ca994431b565bc38c06816e6e4
- Dedupe key: reconciliation_guardrail:main_checkout_dirty
- Depends on:
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-309-reconciliation-c05f71151a70.md
- Acceptance: Reconciliation guardrail filed this because 20 branch or worktree cleanup candidates are blocked by main_checkout_dirty. Use evidence and the machine-readable reconciliation plan in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-309-reconciliation-c05f71151a70.md, reconcile the dirty checkout or dirty worktree group deliberately, then rerun the supervisor cleanup/reconciliation pass and confirm that the blocked candidate count decreases.

## HAO-310 Resolve 1 dirty backlogged worktrees blocked by unsupported_status

- Status: todo
- Completion: manual
- Priority: P1
- Track: ops
- Fingerprint: 4be543b68e7dd3d4e830d4e83089e5046602d128
- Dedupe key: reconciliation_guardrail:dirty_backlogged_worktree:unsupported_status
- Depends on:
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-310-reconciliation-ab689090ed4d.md
- Acceptance: Reconciliation guardrail filed this because 1 branch or worktree cleanup candidates are blocked by unsupported_status. Use evidence and the machine-readable reconciliation plan in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-310-reconciliation-ab689090ed4d.md, reconcile the dirty checkout or dirty worktree group deliberately, then rerun the supervisor cleanup/reconciliation pass and confirm that the blocked candidate count decreases.

## HAO-311 Resolve 20 preflight-conflicting backlogged worktree merges

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Fingerprint: fd1b527134319746e4d639332f2916bbce8ab480
- Dedupe key: reconciliation_guardrail:preflight_merge_conflict
- Depends on:
- Outputs: data/hallucinate_multimodal_control/discovery, hallucinate_app/docs/MULTIMODAL_CONTROL_SURFACE_LOGIC_IDL.todo.md
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-311-reconciliation-534cc45af3d6.md
- Acceptance: Reconciliation guardrail filed this because 20 branch or worktree cleanup candidates are blocked by preflight_merge_conflict. Use evidence and the machine-readable reconciliation plan in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-311-reconciliation-534cc45af3d6.md, reconcile the dirty checkout or dirty worktree group deliberately, then rerun the supervisor cleanup/reconciliation pass and confirm that the blocked candidate count decreases.

## HAO-312 Resolve validation retry-budget failure for HAO-306

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/.github/workflows/auto-doc-maintenance.yml
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-312-hao-306-retry-budget.md
- Acceptance: Retry-budget guardrail filed this from repeated validation failures in HAO-306. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-312-hao-306-retry-budget.md to fix the validation blocker, then mark this repair task completed so the supervisor can release HAO-306 from strategy blocked_tasks.

## HAO-313 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/advanced_filecoin.py:1245

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/advanced_filecoin.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/advanced_filecoin.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/advanced_filecoin.py:1245. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-313-codebase-scan-d700867b5fc4.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-314 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/direct_mcp_server.py:159

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/direct_mcp_server.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/direct_mcp_server.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/direct_mcp_server.py:159. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-314-codebase-scan-e0e818ca7fce.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-315 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/direct_mcp_server.py:217

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/direct_mcp_server.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/direct_mcp_server.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/direct_mcp_server.py:217. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-315-codebase-scan-95256901e972.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-316 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/enhanced_mcp_server_with_ai_ml.py:44

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/enhanced_mcp_server_with_ai_ml.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/enhanced_mcp_server_with_ai_ml.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/enhanced_mcp_server_with_ai_ml.py:44. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-316-codebase-scan-00aa8a4f9593.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-317 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py:430

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py:430. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-317-codebase-scan-e52c17f7507d.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-318 Resolve merge retry-budget failure for HAO-235

- Status: completed
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, scripts/virtual_ai_os_todo_supervisor.py
- Validation: test -f /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-318-hao-235-merge-retry-budget.md
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-235. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-07-hao-318-hao-235-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are committed in their owning repository or submodule, run `ipfs-accelerate-agent-merge-resolver --events-path ... --apply` when the conflict is semantic, then mark this repair task completed so the supervisor can release HAO-235 from strategy blocked_tasks.

## HAO-319 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/direct_mcp_server.py:255

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/direct_mcp_server.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/direct_mcp_server.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/direct_mcp_server.py:255. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-319-codebase-scan-a66dbc016ac0.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-320 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py:919

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py:919. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-320-codebase-scan-372c9f0bf55f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-321 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py:981

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py:981. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-321-codebase-scan-e125d70761f9.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-322 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py:1037

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/enhanced_storacha_storage.py:1037. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-322-codebase-scan-065a828223f1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-323 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_all_code_issues.sh:236

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_all_code_issues.sh
- Validation: test -f external/ipfs_kit/archive/applied_patches/fix_all_code_issues.sh
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_all_code_issues.sh:236. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-323-codebase-scan-50b0117535ab.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-324 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_all_remaining_issues.sh:204

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_all_remaining_issues.sh
- Validation: test -f external/ipfs_kit/archive/applied_patches/fix_all_remaining_issues.sh
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_all_remaining_issues.sh:204. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-324-codebase-scan-1e9236e8f40d.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-325 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_all_remaining_issues.sh:228

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_all_remaining_issues.sh
- Validation: test -f external/ipfs_kit/archive/applied_patches/fix_all_remaining_issues.sh
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_all_remaining_issues.sh:228. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-325-codebase-scan-3224f703d80e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-326 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_all_storacha.py:55

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_all_storacha.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_all_storacha.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_all_storacha.py:55. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-326-codebase-scan-42900ccea863.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-327 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_all_storacha.py:292

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_all_storacha.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_all_storacha.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_all_storacha.py:292. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-327-codebase-scan-3108d5b69a22.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-328 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_code_issues.sh:229

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_code_issues.sh
- Validation: test -f external/ipfs_kit/archive/applied_patches/fix_code_issues.sh
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_code_issues.sh:229. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-328-codebase-scan-0ba993b31c87.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-329 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_huggingface_integration.py:58

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_huggingface_integration.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_huggingface_integration.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_huggingface_integration.py:58. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-329-codebase-scan-24cc769c050b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-330 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_huggingface_integration.py:318

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_huggingface_integration.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_huggingface_integration.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_huggingface_integration.py:318. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-330-codebase-scan-483ae5ddf6cd.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-331 Replace placeholder runtime path in external/ipfs_kit/archive/applied_patches/fix_ipfs_model.py:210

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_ipfs_model.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_ipfs_model.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_ipfs_model.py:210. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-331-codebase-scan-8835ea6867fd.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-332 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_lassie_integration.py:59

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_lassie_integration.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_lassie_integration.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_lassie_integration.py:59. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-332-codebase-scan-bfaeda2fbacc.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-333 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_lassie_integration.py:273

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_lassie_integration.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_lassie_integration.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_lassie_integration.py:273. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-333-codebase-scan-9451e9cbd0ad.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-334 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_s3_backend.py:236

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_s3_backend.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_s3_backend.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_s3_backend.py:236. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-334-codebase-scan-5e21764d35b6.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-335 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_s3_backend.py:698

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_s3_backend.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_s3_backend.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_s3_backend.py:698. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-335-codebase-scan-7b425b8a660e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-336 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_s3_backend_complete.py:232

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_s3_backend_complete.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_s3_backend_complete.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_s3_backend_complete.py:232. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-336-codebase-scan-8088ea61f67f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-337 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_s3_backend_complete.py:845

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_s3_backend_complete.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_s3_backend_complete.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_s3_backend_complete.py:845. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-337-codebase-scan-e13172ffcfa8.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-338 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py:472

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py:472. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-338-codebase-scan-bdb55de0fb60.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-339 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py:1070

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py:1070. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-339-codebase-scan-e733dbf57b07.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-340 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py:1549

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/fix_storacha_backend.py:1549. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-340-codebase-scan-070deff5a913.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-341 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/huggingface_real_init.py:44

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/huggingface_real_init.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/huggingface_real_init.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/huggingface_real_init.py:44. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-341-codebase-scan-0f06020302cc.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-342 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/ipfs_dht_operations.py:279

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/ipfs_dht_operations.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/ipfs_dht_operations.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/ipfs_dht_operations.py:279. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-342-codebase-scan-7621188cf0a5.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-343 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/ipfs_ipns_operations.py:1501

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/ipfs_ipns_operations.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/ipfs_ipns_operations.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/ipfs_ipns_operations.py:1501. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-343-codebase-scan-d768e8bb62e5.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-344 Review swallowed exception path in external/ipfs_kit/archive/applied_patches/lassie_mock_server.py:59

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/applied_patches/lassie_mock_server.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/applied_patches/lassie_mock_server.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/applied_patches/lassie_mock_server.py:59. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-344-codebase-scan-3ea0f0198aff.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-345 Resolve code annotation in external/ipfs_kit/archive/archive_clutter/documentation_drafts/CONTRIBUTING.md:213

- Status: completed
- Completion: manual
- Priority: P2
- Track: docs
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/archive_clutter/documentation_drafts/CONTRIBUTING.md
- Validation: test -f external/ipfs_kit/archive/archive_clutter/documentation_drafts/CONTRIBUTING.md
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/archive_clutter/documentation_drafts/CONTRIBUTING.md:213. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-345-codebase-scan-dcf58d1b0ac8.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-346 Resolve code annotation in external/ipfs_kit/archive/archive_clutter/documentation_drafts/CONTRIBUTING.md:214

- Status: todo
- Completion: manual
- Priority: P2
- Track: docs
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/archive_clutter/documentation_drafts/CONTRIBUTING.md
- Validation: test -f external/ipfs_kit/archive/archive_clutter/documentation_drafts/CONTRIBUTING.md
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/archive_clutter/documentation_drafts/CONTRIBUTING.md:214. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-346-codebase-scan-584bb5fe6ed1.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-347 Review swallowed exception path in external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_fix_resource_handlers.py:249

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_fix_resource_handlers.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_fix_resource_handlers.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_fix_resource_handlers.py:249. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-347-codebase-scan-84c70ed539d3.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-348 Review swallowed exception path in external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server.py:251

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server.py:251. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-348-codebase-scan-0991e13de35f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-349 Review swallowed exception path in external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server.py:322

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server.py:322. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-349-codebase-scan-47af7af5473e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-350 Review swallowed exception path in external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server_with_tools.py:185

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server_with_tools.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server_with_tools.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server_with_tools.py:185. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-350-codebase-scan-79b6d699fa77.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-351 Review swallowed exception path in external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server_with_tools.py:243

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server_with_tools.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server_with_tools.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/archive_clutter/fix_scripts/direct_mcp_server_with_tools.py:243. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-351-codebase-scan-a285fb9a681e.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-352 Review swallowed exception path in external/ipfs_kit/archive/archive_clutter/fix_scripts/fixed_mcp_test_runner.py:587

- Status: completed
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/archive_clutter/fix_scripts/fixed_mcp_test_runner.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/archive_clutter/fix_scripts/fixed_mcp_test_runner.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/archive_clutter/fix_scripts/fixed_mcp_test_runner.py:587. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-352-codebase-scan-dccb28691ff3.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-353 Review swallowed exception path in external/ipfs_kit/archive/archive_clutter/fix_scripts/fixed_runner.py:58

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/archive_clutter/fix_scripts/fixed_runner.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/archive_clutter/fix_scripts/fixed_runner.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/archive_clutter/fix_scripts/fixed_runner.py:58. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-353-codebase-scan-ec600ae38de4.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-354 Review swallowed exception path in external/ipfs_kit/archive/archive_clutter/fix_scripts/patch_direct_mcp.py:31

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/archive_clutter/fix_scripts/patch_direct_mcp.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/archive_clutter/fix_scripts/patch_direct_mcp.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/archive_clutter/fix_scripts/patch_direct_mcp.py:31. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-354-codebase-scan-061d436e7a3b.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-355 Review swallowed exception path in external/ipfs_kit/archive/archive_clutter/temp_files/working_example.py:83

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/archive_clutter/temp_files/working_example.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/archive_clutter/temp_files/working_example.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/archive_clutter/temp_files/working_example.py:83. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-355-codebase-scan-6c7e8402d6c4.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-356 Review swallowed exception path in external/ipfs_kit/archive/backup_patches/fix_storage_backends.py:288

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/backup_patches/fix_storage_backends.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/backup_patches/fix_storage_backends.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/backup_patches/fix_storage_backends.py:288. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-356-codebase-scan-3874608ea0cf.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-357 Review swallowed exception path in external/ipfs_kit/archive/cli_drafts/ipfs_kit_cli_jit_optimized.py:112

- Status: completed
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/cli_drafts/ipfs_kit_cli_jit_optimized.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/cli_drafts/ipfs_kit_cli_jit_optimized.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/cli_drafts/ipfs_kit_cli_jit_optimized.py:112. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-357-codebase-scan-a6288d2e61a8.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-358 Review swallowed exception path in external/ipfs_kit/archive/cli_drafts/ipfs_kit_cli_ultra_fast.py:78

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/cli_drafts/ipfs_kit_cli_ultra_fast.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/cli_drafts/ipfs_kit_cli_ultra_fast.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/cli_drafts/ipfs_kit_cli_ultra_fast.py:78. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-358-codebase-scan-331fb598d446.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-359 Review swallowed exception path in external/ipfs_kit/archive/legacy_servers/enhanced_mcp_server_phase2.py:1667

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/legacy_servers/enhanced_mcp_server_phase2.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/legacy_servers/enhanced_mcp_server_phase2.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/legacy_servers/enhanced_mcp_server_phase2.py:1667. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-359-codebase-scan-8b2e8ed6b503.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-360 Review swallowed exception path in external/ipfs_kit/archive/legacy_servers/vscode_mcp_server.py:304

- Status: todo
- Completion: manual
- Priority: P1
- Track: runtime
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/legacy_servers/vscode_mcp_server.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/legacy_servers/vscode_mcp_server.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/legacy_servers/vscode_mcp_server.py:304. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-360-codebase-scan-c7842a8943c2.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-361 Review swallowed exception path in external/ipfs_kit/archive/mcp_development/mcp_test_suite.py:91

- Status: todo
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/mcp_development/mcp_test_suite.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/mcp_development/mcp_test_suite.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/mcp_development/mcp_test_suite.py:91. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-361-codebase-scan-ec33a1f25fe8.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-362 Review swallowed exception path in external/ipfs_kit/archive/mcp_development/mcp_test_suite.py:109

- Status: todo
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/mcp_development/mcp_test_suite.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/mcp_development/mcp_test_suite.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/mcp_development/mcp_test_suite.py:109. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-362-codebase-scan-72ef7c0c07dd.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.

## HAO-363 Review swallowed exception path in external/ipfs_kit/archive/mcp_development/mcp_test_suite.py:111

- Status: todo
- Completion: manual
- Priority: P1
- Track: quality
- Depends on: 
- Outputs: data/hallucinate_multimodal_control/discovery, external/ipfs_kit/archive/mcp_development/mcp_test_suite.py
- Validation: python3 -m py_compile external/ipfs_kit/archive/mcp_development/mcp_test_suite.py
- Acceptance: Codebase scan filed this finding from external/ipfs_kit/archive/mcp_development/mcp_test_suite.py:111. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-06-08-hao-363-codebase-scan-823d164df44f.md, fix the bug or improvement, add or update focused validation when appropriate, and keep the supervisor-fed backlog parseable.
