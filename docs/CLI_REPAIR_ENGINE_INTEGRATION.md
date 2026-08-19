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

- Before broad source discovery, every adopted project session runs
  `workspai agent bootstrap --for-agent generic --json` from the project root.
  The extension validates `workspai.agent-bootstrap-receipt.v1`, including
  project/workspace identity, evidence freshness, active Goal binding, required
  read order, claim posture, integrity hashes, and path portability. Workspace
  resolution remains runtime-private; only the portable workspace identity and
  `workspace:` artifact references enter prompts or receipts.
- A `ready` receipt permits the bounded source capability plane. A `degraded`
  receipt may ground read-only answers but disables broad source scanning and
  mutation. A `blocked`, missing, incompatible, or non-portable receipt stops
  governed mutation before a model turn is spent. A project with no adoption
  markers and no canonical workspace relationship remains usable as raw source
  and is never mislabeled as canonically grounded.
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
- A durable session identity is the tuple of workspace, selected linked-project
  source root, card, and mode. A session from another project cannot be restored
  or steered merely because its workspace and card names match.
- Linked-project source mutation additionally requires the runtime capability
  flags `registeredLinkedProjectMutationBoundary`,
  `sourceProposalIntegrity=project-bound-hash-pinned`, and
  `completionAuthority=cli-verification-receipt`. The extension keeps older
  compatible CLIs usable for in-workspace repairs but refuses to widen an
  external boundary when these proofs are absent.

## One controller across Sidebar and native Chat

Incident Studio and `@workspai /repair` use the same durable
`StudioAgentSession`, model protocol, tool registry, source-inspection rules,
CLI transaction client, Stop Gate, and receipt builder. Native Chat is a second
presentation surface, not a second repair engine.

Each card declares one repair policy in the mirrored CLI contract. The policy
selects the safest first action; it is never a source-mutation authorization
boundary. Every policy converges on the same model-driven causal repair loop
when its first action leaves the exact card blocked:

- `refresh-producer`: run the exact producer deterministically without a model
  call. If the fresh result remains blocked, pass that observation to the
  governed general source-repair capability plane.
- `diagnose-and-repair`: run the deterministic CLI repair prelude, then expose
  the general capability plane when the typed result requests source repair or
  the bounded accelerator cannot close the target.
- `source-repair-then-produce`: diagnose and permit a bounded source repair,
  then require the exact card producer and canonical verification before
  completion.

The shared loop is `observe -> diagnose -> inspect -> act -> verify -> continue
or decide`. Graph retrieval, governed evidence, source search, diagnostics,
structured project-native commands, exact edits, complete-file replacement,
file creation/deletion, and final diff review are capabilities inside that
loop. Card-specific tools accelerate common cases but never define the limit
of what the model may diagnose or propose.

## Assistant mode closure contracts

Agent, Ask, Plan, and Goal share one model protocol and one bounded tool plane,
but they do not share completion authority:

- **Ask** is read-only. It must inspect relevant source, diagnostics, evidence,
  graph results, or current changes before answering. A confident answer with
  no inspected evidence is rejected.
- **Plan** is read-only. It must inspect evidence and return explicit `Scope`,
  `Evidence`, `Steps`, `Verification`, `Rollback`, and `Assumptions` sections.
  It cannot claim that a proposed change was applied.
- **Agent** may propose inspected source edits. Every proposal crosses the CLI
  Repair Engine, and a closed transaction is still insufficient by itself:
  the model must inspect the resulting workspace changes and the controller
  must run the final canonical CLI verification before reporting completion.
- **Goal** accepts every bounded engineering category compiled by the CLI:
  feature work, defect repair, refactoring, performance, documentation, system
  understanding, coverage, dependency security, and release readiness. The
  extension validates the immutable Goal Pack and execution policy and binds
  every transaction to its fingerprint. Coverage, dependency-security, and
  release-readiness Goals call their exact CLI verifier after each candidate
  repair. Other Goals use evidence review: the model must inspect the final
  worktree against the complete objective and the controller must pass
  canonical workspace verification. That outcome is reported as reviewed, not
  machine-verified. In both modes, a post-repair Goal binding is accepted only
  from a linked, approved, closed transaction whose plan, proposal, checkpoint
  output, closure hash, and fresh Model/Graph input state remain current.

Goal attempt budgets are durable CLI state. The extension restores the verified
attempt count from the active Goal status and enforces the immutable
`maxAttempts` value before spending another model turn; the CLI independently
enforces the same limit. A Goal whose baseline already satisfies its target is
verified before model invocation and closes without a source mutation. An
exhausted, cancelled, superseded, or otherwise terminal Goal cannot be resumed
as an active mutation session.

Deterministic Goal mutation capability is intentionally narrower than general
Agent or general Goal repair. Deletion is unavailable to those exact metric
contracts. A test-coverage Goal can change only test-owned source, fixtures, or
snapshots, preventing the model from improving the metric by removing
production source or changing coverage configuration. General Goal Packs may
create, replace, or delete inspected source only through the same CLI-owned
checkpoint, validation, verification, and rollback transaction.

Before the first Goal mutation, the extension requires the runtime capability
invariants `goalSourceTransition=closed-integrity-bound-v1` and
`goalAttemptBudget=durable-serialized-v1`. A CLI version string cannot replace
this handshake; a runtime without either invariant receives an actionable
upgrade error before proposal publication.

General source work exposes graph query, bounded source-range inspection,
exact-context edits, diagnostics, changed-file inspection, and approved
non-mutating test/build commands. Commands advertised as diagnostic are
fingerprinted before and after execution. If they modify tracked or untracked
source state, Studio rejects the result and requires review rather than treating
the side effect as a governed edit.

A native source continuation starts inside the source-only capability plane.
Doctor, Readiness, Workspace Verify, remediation-plan, and Workspace
Intelligence producers are withheld until a real source transaction advances
the causal epoch. If exact target verification fails, the CLI rolls the change
back and the typed receipt returns the model to another bounded source attempt;
it is not presented as success or as a fabricated user decision. Repeated
actions against the same evidence generation are rejected without stopping the
session. The controller verifies once, transfers control to general source
diagnosis, and finally constrains the next model turn to causal inspection or a
governed mutation. Only an exhausted bounded model-recovery budget pauses the
durable session; it never manufactures a CLI approval decision.

The model owns diagnosis and source reasoning. The CLI owns evidence producers,
mutation transactions, validation, rollback, and the final truth verdict. Real
external boundaries remain explicit: missing toolchains, credentials, untrusted
workspaces, destructive or invasive choices, incompatible protocols, and model
provider failure cannot be bypassed by either layer.

Model-correctable proposal failures never become operator decisions. When the
CLI rejects a no-op, stale hash, protected target, duplicate target, or scope
escape before checkpoint, Studio keeps the session active, exposes only causal
evidence/source inspection tools, and withholds mutation until a fresh source
inspection authorizes a materially different proposal. Aggregate cards are
traced through their exact producer to a project-scoped finding before source
selection; the aggregate Readiness or Verify message is never treated as a
file target.

A missing or unlaunchable runtime executable is different: Studio pauses once
with setup guidance and a durable transaction id. It does not start an
identical plan while the toolchain fingerprint is unchanged. Cancel and manual
takeover release ownership terminally; neither decision silently restarts the
agent loop.

Provider control context uses `$WORKSPACE` and `$PROJECT` identities. Absolute
host paths, traversal-based CLI execution identity, checkpoint internals, and
adapter filesystem metadata do not enter model control prompts, Webview
messages, repair cards, or exported receipts. Exact inspected source bodies
remain transient in memory and are not persisted in the durable session.
Project-relative and workspace-relative patch inputs are canonicalized once
against the selected project root before the proposal is written; sibling
traversal and absolute targets outside that root fail before CLI execution.
Source candidates use one cross-platform policy that excludes canonical
`.workspai`/`.rapidkit` state and package-manager lockfiles from every model
continuation and durable replay path.

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
