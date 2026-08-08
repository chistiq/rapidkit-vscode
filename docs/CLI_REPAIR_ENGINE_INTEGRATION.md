# CLI Repair Engine integration

Studio is a model and user-interface client of the Workspai CLI Repair Engine.
It does not own source mutation, approval state, checkpoints, dependency
reconciliation, canonical verification, rollback, or closure.

```text
model proposal / governed card action
                 |
                 v
Workspai CLI: plan -> preconditions -> approval -> exact-target preflight
              -> checkpoint -> execute -> reconcile -> audit/test/build
              -> exact card producer -> canonical verify
              -> closed | rolled-back | decision-required
                 |
                 v
VS Code: progress, diff, evidence, and exact user decisions
```

## Runtime boundary

- Studio resolves an already installed or workspace-linked compatible `workspai`
  package. It never downloads a CLI during a repair.
- Package metadata is discovery only. Before proposal creation or any mutation,
  Studio executes the selected binary with `--version --json` and
  `workspace repair capabilities --json`, then verifies the reported version,
  consumer protocol, operation/proposal/transaction schemas, required actions,
  and process-working-directory workspace resolution. A stale link or a
  manifest/runtime mismatch is rejected before a model turn is spent.
- Repair subcommands execute with the canonical workspace as process `cwd`.
  Studio does not add redundant workspace-routing flags, so the transport is
  stable across compatible CLI releases and operating systems.
- Model file changes are submitted through
  `workspace repair propose`; card-authored actions use
  `workspace repair plan`.
- `Start repair`, `Apply change`, a governed remediation command, and accepted
  patch review all compile or resume the same CLI-owned transaction. Auto-fix
  only starts the model loop; it does not grant the extension a second mutation
  path.
- Every target must have been inspected and carries its expected SHA-256 hash.
  Inspecting an optional file that does not exist returns a typed
  `exists: false` observation; it is not a tool failure and must not be retried.
- Immediately before checkpoint and mutation, the CLI reruns the exact producer
  registered for the selected card and proves that every approved causal action
  id is still current. Drift expires approval without changing source. The same
  producer runs again after mutation and focused validation. Studio renders
  these durable stages as `Target recheck`, `Card evidence`, and
  `Workspace verify`; it never substitutes an aggregate gate for card evidence.
- The CLI returns the durable
  `workspai.workspace-repair-transaction.v1` artifact. Studio renders that
  artifact and never infers transaction state from prose.
- The CLI is the only mutation authority. Studio does not retain a package-
  manager, file-write, delete, formatting, or remediation-command escape hatch.
  Model-authored changes are inspected proposals; only the CLI can turn them
  into a checkpointed mutation.
- Studio ships and consumes `workspace-repair-capabilities.v1.json`. Adapter
  support, missing-tool preconditions, and unsupported-runtime decisions come
  from the CLI contract; the extension does not maintain a competing runtime
  matrix.
- An interrupted matching transaction is resumed; Studio does not silently
  create a competing plan.
- A `decision-required` result stops the model loop. `Review options` presents
  only the options declared by that transaction and submits the selected value
  through `workspace repair decide`.
- A consumer-protocol mismatch is terminal for that session. Studio reports the
  exact selected executable and mismatch instead of retrying Doctor, Verify, or
  patch application with the same incompatible binary.
- A risk decision supersedes the old transaction. The CLI creates a new
  immutable plan and requires a fresh approval before execution.
- Transactions may expose `adapterEvaluations` for every affected ecosystem.
  Studio treats `partial` and `unsupported` as actionable CLI decisions, never
  as permission for the model to bypass the engine.
- Missing installed dependency trees use the CLI's typed
  `dependency-materialization` transaction. Studio accepts a closed install or
  restore even when no manifest or lockfile diff was produced; declared
  validation and canonical Doctor evidence are the proof.
- Python materialization is CLI-selected from project evidence: Poetry, uv, or
  a standard project-local `.venv`. Studio never substitutes a global Python
  environment and never rejects the future `.venv` interpreter before the
  approved environment-creation stage has produced it.
- A workspace-scoped incident with multiple projects is submitted as one card
  scope. Studio never selects the first project implicitly. The CLI orders
  eligible actions and may close safe work before returning an explicit
  decision for a different project.
- Closure is scoped to the selected causal action set. A selected blocker can
  be proven closed while unrelated workspace findings remain blocked. Studio
  reports those findings as separate next work and never reopens, renames, or
  absorbs them into the verified card session.

## Progress, receipts, and review

Studio projects the transaction event sequence into the chat timeline. A tool
request, approval, checkpoint, stage failure, decision, verification, rollback,
and closure are distinct states; a failed tool is never rendered as a completed
step and a UI refresh cannot invent progress.

Changed files come from checkpoint `beforeHash`/`afterHash` deltas, not from a
workspace-wide `git diff` and not from the list of files planned for a future
checkpoint. For each changed text file Studio verifies the original backup hash
and current post-repair hash before showing an inline receipt. Opening a change
uses VS Code's native two-document diff for that exact transaction. If the file
changed again, the backup is unavailable, or the content is binary/oversized,
Studio refuses an exact diff and reports the reason instead of mixing user work
with the repair.

The final assistant message is derived from the closed transaction and
canonical verification events. It identifies the transaction, changed files,
selected target outcome, and any remaining workspace findings. Prose cannot
turn `decision-required`, `failed`, `rolled-back`, or an unverified mutation
into a success receipt.

The visible validation checklist is projected from `transaction.stages`; it is
not reconstructed from spinner state or model narration. Internal model
checkpoints and tool-request envelopes update the current activity label but do
not create repetitive chat messages. Started/completed/failed tools, CLI stage
progress, exact file changes, decisions, rollback, and target verification are
the user-visible causal record.

## Mutation invariant

The model may inspect, search, diagnose, test, and build. All source edits,
deletions, formatting changes, dependency repairs, and governed remediation
steps must cross the CLI transaction boundary. The extension can display a
diff after execution, but the diff is not evidence of completion. Only the
CLI-owned canonical verification can close the transaction. Its durable
receipt separates the selected `targetStatus` from the full
`workspaceStatus`, so Studio can close proven work and advance to an unrelated
remaining blocker without concealing the blocked workspace gate.

Proposal inbox files and the repair engine lock are transient coordination
state, not governed evidence. Their creation or deletion cannot advance the
evidence generation, reset retry budgets, or produce an "Evidence refreshed"
timeline entry.

This invariant is source-guarded in tests: the active model-tool bindings,
manual Studio mutation actions, and Auto-fix entry point must not call legacy
patch, Doctor-remediation, bootstrap-remediation, or inline-command executors.
The older extension-local dependency transaction helper is not imported by a
production surface; package-manager execution authority remains in the CLI.
The cross-repository CI gate also builds the canonical CLI and performs the
same runtime handshake used by Studio, so JSON parity cannot pass while the
actual executable protocol is broken.

## Failure and rollback

When a required stage fails, the CLI validates the complete checkpoint before
restoring the first file. It restores files atomically, preserves file modes,
and reconciles the installed dependency tree against restored manifests and
lockfiles. A conflict, invalid backup, or failed rollback reconciliation is
reported as `decision-required`; Studio must not label it rolled back or fixed.

Workspai guarantees deterministic closure for repairs supported by the
available runtime, tools, policy, and upstream dependency graph. It does not
claim that every arbitrary blocker has a safe automatic fix: missing credentials,
unavailable upstream releases, incompatible requirements, external outages, or
an explicitly breaking-only path terminate as a durable, resumable user
decision. This boundary is part of the enterprise contract, not a model retry.
