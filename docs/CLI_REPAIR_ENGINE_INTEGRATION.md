# CLI Repair Engine integration

Studio is a model and user-interface client of the Workspai CLI Repair Engine.
It does not own source mutation, approval state, checkpoints, dependency
reconciliation, canonical verification, rollback, or closure.

```text
model proposal / governed card action
                 |
                 v
Workspai CLI: plan -> preconditions -> approval -> checkpoint -> execute
              -> reconcile -> audit/test/build -> canonical verify
              -> closed | rolled-back | decision-required
                 |
                 v
VS Code: progress, diff, evidence, and exact user decisions
```

## Runtime boundary

- Studio resolves an already installed or workspace-linked compatible `workspai`
  package. It never downloads a CLI during a repair.
- Model file changes are submitted through
  `workspace repair propose`; card-authored actions use
  `workspace repair plan`.
- `Start repair`, `Apply change`, a governed remediation command, and accepted
  patch review all compile or resume the same CLI-owned transaction. Auto-fix
  only starts the model loop; it does not grant the extension a second mutation
  path.
- Every target must have been inspected and carries its expected SHA-256 hash.
- The CLI returns the durable
  `workspai.workspace-repair-transaction.v1` artifact. Studio renders that
  artifact and never infers transaction state from prose.
- Studio ships and consumes `workspace-repair-capabilities.v1.json`. Adapter
  support, missing-tool preconditions, and unsupported-runtime decisions come
  from the CLI contract; the extension does not maintain a competing runtime
  matrix.
- An interrupted matching transaction is resumed; Studio does not silently
  create a competing plan.
- A `decision-required` result stops the model loop. `Review options` presents
  only the options declared by that transaction and submits the selected value
  through `workspace repair decide`.
- A risk decision supersedes the old transaction. The CLI creates a new
  immutable plan and requires a fresh approval before execution.
- Transactions may expose `adapterEvaluations` for every affected ecosystem.
  Studio treats `partial` and `unsupported` as actionable CLI decisions, never
  as permission for the model to bypass the engine.
- Missing installed dependency trees use the CLI's typed
  `dependency-materialization` transaction. Studio accepts a closed install or
  restore even when no manifest or lockfile diff was produced; declared
  validation and canonical Doctor evidence are the proof.
- A workspace-scoped incident with multiple projects is submitted as one card
  scope. Studio never selects the first project implicitly. The CLI orders
  eligible actions and may close safe work before returning an explicit
  decision for a different project.

## Mutation invariant

The model may inspect, search, diagnose, test, and build. All source edits,
deletions, formatting changes, dependency repairs, and governed remediation
steps must cross the CLI transaction boundary. The extension can display a
diff after execution, but the diff is not evidence of completion. Only the
CLI-owned canonical verification can close the transaction. Its durable
receipt separates the selected `targetStatus` from the full
`workspaceStatus`, so Studio can close proven work and advance to an unrelated
remaining blocker without concealing the blocked workspace gate.

This invariant is source-guarded in tests: the active model-tool bindings,
manual Studio mutation actions, and Auto-fix entry point must not call legacy
patch, Doctor-remediation, bootstrap-remediation, or inline-command executors.
The older extension-local dependency transaction helper is not imported by a
production surface; package-manager execution authority remains in the CLI.

## Failure and rollback

When a required stage fails, the CLI validates the complete checkpoint before
restoring the first file. It restores files atomically, preserves file modes,
and reconciles the installed dependency tree against restored manifests and
lockfiles. A conflict, invalid backup, or failed rollback reconciliation is
reported as `decision-required`; Studio must not label it rolled back or fixed.
