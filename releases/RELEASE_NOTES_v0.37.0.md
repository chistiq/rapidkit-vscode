<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Governed, Target-Aware Repair",
  "summary": "Workspai for VS Code now delegates blocker mutation and target-aware verification to the CLI-owned Repair Engine while Studio keeps the user in control with durable progress, commands, changed files, bounded diffs, and explicit decisions.",
  "highlights": [
    {
      "icon": "🛠️",
      "text": "Studio consumes the Workspai CLI Repair Engine instead of maintaining a competing executor"
    },
    {
      "icon": "🧾",
      "text": "Commands, changed files, and bounded unified diffs stay visible inside the active repair"
    },
    {
      "icon": "🎯",
      "text": "The selected repair can close while unrelated workspace blockers remain visible"
    },
    {
      "icon": "🛡️",
      "text": "Every Dashboard blocker maps to its producer, artifact, scope, and canonical Stop Gate"
    },
    {
      "icon": "⏯️",
      "text": "Durable sessions preserve progress while start, stop, resume, and guarded decisions remain explicit"
    }
  ]
}
-->

# Workspai VS Code v0.37.0

Released August 7, 2026.

## Governed, target-aware repair with live change review

Workspai 0.37.0 aligns the extension with Workspai CLI 0.55.0 and gives the
canonical Repair Engine ownership of blocker mutation, reconciliation,
verification, rollback, and closure.

The extension remains responsible for the product experience: it selects the
active workspace and project, presents evidence, streams model and command
activity, shows changed files and bounded diffs, and collects explicit user
decisions. It does not maintain a second repair state machine beside the CLI.

## One repair transaction from card to verification

Studio now consumes the durable CLI transaction:

```text
plan → preconditions → approval → checkpoint → execute
     → reconcile → audit → test → build → canonical verify
     → closed | rolled-back | decision-required
```

- Every supported Dashboard card is mapped to its exact producer, artifact,
  scope, repair capability, and Stop Gate.
- Source changes retain inspected-file hashes and the CLI transaction receipt.
- Dependency edits remain incomplete until install/lockfile reconciliation,
  audit, declared tests, declared build, and canonical verification agree.
- Missing installed dependency trees use the same transaction without requiring
  an artificial manifest or lockfile edit before reconciliation can begin.
- A single project named by blocker evidence remains the canonical repair
  target even when it is linked from outside the workspace or its registry
  alias differs from its directory basename.
- Target status and workspace status remain separate: closing the selected
  blocker does not hide other findings, and unrelated blockers do not undo the
  completed repair.
- A reload restores durable events and passed stages without pretending a model
  or subprocess is still running.
- Start, stop, resume, rollback, and guarded choices remain explicit user or
  CLI-owned transitions.

## Studio shows the work, not only the verdict

The Assistant now preserves provider call identity across tool rounds and
renders the corresponding command, outcome, changed paths, and bounded unified
diff. Untracked text files can be reviewed before completion, while binary,
oversized, or unsafe paths remain outside inline review.

The model can reason over Workspai evidence and propose bounded work, but a
completion request is accepted only after the exact card verification contract
and canonical post-mutation loop pass.

Bounded conversation history retains complete native tool-call/result pairs.
Orphaned results are discarded instead of being sent to an OpenAI-compatible
provider as invalid causal history.

## Workspace scope stays visible

Repair sessions retain the owning workspace, project scope, affected projects,
card identity, and latest verification boundary. Similar blocker names from
different workspaces no longer depend on the surrounding editor state for
identity.

Opening Assistant restores an idle session; it does not silently restart a
provider call. A persisted session without a live process is shown as paused or
stopped, leaving the next action with the user.

## Primary sidebar and Dashboard are calmer

- Workspace and project rows keep only the highest-frequency inline actions;
  discovery, import/export, terminals, tests, and lifecycle operations remain
  available in grouped overflow menus.
- Setup, Create, Dashboard, and Assistant use Workspai product language and the
  same workspace/project identity.
- Create history locks only the operation currently owned by the live Webview;
  interrupted historical sessions remain removable.
- Dashboard project creation is not blocked by an unrelated missing Python
  engine.

## Setup follows the actual runtime boundary

The Workspai CLI is the universal requirement. Python and RapidKit Core remain
optional until a Python-backed kit or module needs them.

When Core belongs to a workspace `.venv`, upgrade and recovery operate on that
environment. If the owning workspace cannot be resolved, the extension fails
closed instead of mutating a global `pipx` installation. CLI discovery also
rebuilds stale Extension Host paths from local npm and Node-version-manager
installations without requiring a registry-backed version probe.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.55.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

There are no intentional breaking changes to existing workspaces, Create
history, or Studio sessions.

## Upgrade

Install or update from the Marketplace:

```bash
code --install-extension rapidkit.rapidkit-vscode --force
```

Then reload VS Code. Open **Workspai: Open Setup & Recovery** if the installed
CLI needs verification.

## Validation

- Host and Webview type checking, formatting, and linting passed.
- 370 test files passed; 2,683 tests passed and 4 remained explicitly skipped.
- Exact CLI/extension contract parity and all 22 enterprise validation scenarios
  passed against the local Workspai CLI source.
- Real local CLI integration passed both repair-boundary scenarios: executable
  protocol verification and a complete checkpointed repair through canonical
  closure.
- Production VSIX packaging and artifact-content smoke passed.
- Dependency audit reported zero known vulnerabilities.
