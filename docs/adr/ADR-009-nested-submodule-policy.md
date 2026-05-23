# ADR-009: Nested Submodule Policy

- Status: accepted
- Date: 2026-05-22
- Task: OS-030

## Context

ADR-001 treats the repository submodules as Virtual AI OS components. ADR-002
uses the nested MCP++ reference implementation under
`ipfs_accelerate_py/ipfs_accelerate_py/mcplusplus` as reference material for the
repository-owned service mesh profile.

The top-level repository also has a baseline manifest in
`config/submodule_integration_baseline.json`. That manifest is used for staged
integration rollout and rollback of the submodules declared directly in the
root `.gitmodules` file. Several component submodules carry their own nested
`.gitmodules` files for documentation, test fixtures, optional tooling, or
reference implementations. Recursing through those files without a policy makes
it unclear which repository owns a pin and which pins should block top-level
rollout.

## Decision

This policy distinguishes top-level integration pins from nested reference pins.

Classify Git submodule pins by the `.gitmodules` file that declares them:

- A submodule declared in the root `.gitmodules` file is a top-level integration
  pin. It must be listed in `config/submodule_integration_baseline.json` with a
  `currentSha` and `rollbackSha`.
- A submodule declared by a `.gitmodules` file below a top-level submodule is a
  nested reference pin. It is owned by the parent submodule repository and must
  not be added to the top-level integration baseline.
- Nested reference pins may be surfaced in the Virtual AI OS component inventory
  only when this repository intentionally depends on their contract for tests or
  adapter behavior.

MCP++ is the current nested reference exception. The allowed path is:

- `ipfs_accelerate_py/ipfs_accelerate_py/mcplusplus`

The MCP++ exception must be declared as the `mcp_plus_plus` component in
`config/virtual_ai_os_components.json`, must carry a 40-character SHA there, and
must be backed by a nested `.gitmodules` entry whose URL resolves to the
accessible `endomorphosis/Mcp-Plus-Plus` repository family. It still must not be
listed in `config/submodule_integration_baseline.json`.

## Verification

`scripts/check_nested_submodules.py` is the repository-owned verifier for this
policy. It parses the root `.gitmodules`, nested `.gitmodules` files under the
worktree, the baseline manifest, and the Virtual AI OS component inventory. The
verifier fails when:

- A root `.gitmodules` entry is missing from the top-level baseline.
- A nested reference pin is listed in the top-level baseline.
- The baseline contains an unknown submodule path.
- The MCP++ exception path is missing, points at an unexpected URL, is absent
  from the component inventory, or lacks a valid SHA.

The verifier emits JSON so CI and local daemon checks can show actionable
failures without parsing human-oriented text.

## Consequences

Top-level rollout and rollback remain limited to the four integration submodules
owned by this repository baseline. Nested pins remain reproducible through their
own parent repositories without creating duplicate ownership in the top-level
baseline.

The MCP++ reference can still be tested as a Virtual AI OS component, but its
exception is explicit and path-checked. Future nested references must either
remain parent-owned implementation detail or add a new ADR-backed exception
before appearing in repository-owned component policy.
