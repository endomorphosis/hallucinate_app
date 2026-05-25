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

- Status: todo
- Completion: manual
- Priority: P0
- Track: logic
- Depends on: HAO-004, HAO-005, HAO-007
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_policy.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py
- Validation: PYTHONPATH=external/ipfs_datasets:hallucinate_app/python python3 hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py; rg -n "compile_nl_to_policy|evaluate_nl_policy|NLUCANPolicyCompiler|clarification|compiler_lane" hallucinate_app/python/hallucinate_app/control_surface_policy.py
- Acceptance: Freeform user rules route through `ipfs_datasets_py.logic.api` when available, produce explanations, and fall back to clarification or strict-template rejection when confidence is too low.

## HAO-009 Build context and event-calculus fact extraction

- Status: todo
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

- Status: todo
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-005, HAO-007
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_context.py, hallucinate_app/python/hallucinate_app/control_surface_logic_ir.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_event_context.py, data/hallucinate_multimodal_control/discovery
- Validation: python3 -c 'exec("import json, pathlib\nstrategy = json.loads(pathlib.Path('"'"'/home/barberb/lift_coding/data/hallucinate_multimodal_control/state/hallucinate_multimodal_control_strategy.json'"'"').read_text(encoding='"'"'utf-8'"'"'))\nassert '"'"'HAO-009'"'"' not in strategy.get('"'"'blocked_tasks'"'"', [])")'
- Acceptance: Merge retry-budget guardrail filed this from repeated merge failures in HAO-009. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-23-hao-028-hao-009-merge-retry-budget.md to fix the merge blocker, verify the intended implementation changes are actually committed in their owning repository or submodule, then remove HAO-009 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-029 Resolve merge retry-budget failure for HAO-008

- Status: todo
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

- Status: todo
- Completion: manual
- Priority: P1
- Track: ops
- Depends on: HAO-013
- Outputs: hallucinate_app/python/hallucinate_app/control_surface_policy.py, hallucinate_app/python/hallucinate_app/test/test_control_surface_policy_ipfs_logic.py, data/hallucinate_multimodal_control/discovery
- Validation: PYTHONPATH=external/ipfs_datasets:hallucinate_app/python python3 -c 'from hallucinate_app.control_surface_policy import evaluate_ipfs_nl_policy'
- Acceptance: Retry-budget guardrail filed this from repeated validation failures in HAO-038. Use evidence in /home/barberb/lift_coding/data/hallucinate_multimodal_control/discovery/2026-05-25-hao-041-hao-038-retry-budget.md to fix the validation blocker, then remove HAO-038 from the strategy blocked_tasks list so the original backlog item can continue without an indefinite retry loop.

## HAO-042 Resolve validation retry-budget failure for HAO-041

- Status: todo
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
