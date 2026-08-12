<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Truthful Evidence and Typed Repair Decisions",
  "summary": "Workspai for VS Code now consumes explicit CLI evidence posture, routes repairs through typed decisions, refreshes selected-workspace artifacts live, and presents a calmer Dashboard and Studio review experience.",
  "highlights": [
    {
      "icon": "🧭",
      "text": "Healthy, attention, and blocked states now follow canonical evidence instead of UI guesswork"
    },
    {
      "icon": "🧩",
      "text": "Studio routes non-closed repairs from typed CLI causes rather than blocker prose"
    },
    {
      "icon": "🪟",
      "text": "Selected managed workspaces refresh live even outside the open VS Code folders"
    },
    {
      "icon": "📝",
      "text": "Changed files expose bounded previews and exact checkpoint-backed diffs"
    },
    {
      "icon": "🗂️",
      "text": "Library shows the complete runnable-example and workspace-profile catalog"
    }
  ]
}
-->

# Workspai VS Code v0.38.0

Released August 8, 2026.

## Truthful Evidence and Typed Repair Decisions

Workspai 0.38.0 is validated against Workspai CLI 0.56.0 and tightens the
consumer boundary between canonical Workspace Intelligence evidence and its IDE
presentation. The CLI remains the source of truth for release posture and
repair decisions; the extension presents that truth, runs the selected flow,
shows reviewable changes, and gathers decisions from the user.

## Evidence posture is explicit

Dashboard cards now separate the producer's raw result from the user-facing
posture:

- **Healthy** means current evidence passed and is not blocking.
- **Needs attention** means evidence is advisory, stale, pending, missing, or
  otherwise worth reviewing without blocking release.
- **Blocked** is reserved for an explicit active governance blocker.

Workspace Explain consumes `releaseVerdict`, `evidenceFreshness`, and
`blocking` from the CLI. A `needs-attention` report with high risk and zero
blocking reasons no longer becomes a false red blocker.

The same posture mapping now drives Dashboard card labels, metrics, guided
steps, next actions, incident handoff, and compact state icons.

Doctor cards now consume the canonical 0.56.0 diagnosis, summary, receipt,
freshness, applicability, validation, and capability contracts. Workspace and
project cards preserve their exact scope, advisories no longer masquerade as
release blockers, and Studio receives stable finding, causal, and repair
capability identifiers instead of depending on display text.

Assistant and Studio now derive their offline artifact inventory directly from
the CLI runtime command-surface contract, then reconcile it with the live
`INDEX.json` manifest. Ask, Plan, Agent, Dashboard artifacts, and blocker repair
therefore share one evidence vocabulary even when the live index is missing or
malformed. Freshness is included explicitly in every general Assistant session;
read-only modes disclose stale evidence, while Agent refreshes the governed
producer before relying on it.

Module actions in Dashboard, Library, and the primary project surface now use
the CLI's project-scoped capability lane. `diff`, `rollback`, `uninstall`,
`upgrade`, and `checkpoint` are no longer mistaken for missing top-level
commands when the installed CLI correctly advertises them for project scope.

## Studio follows structured repair decisions

The extension no longer parses English reasons to decide whether a CLI repair
needs source work, a tool installation, a policy choice, or user approval.
Typed causes cover:

- missing executables;
- unsupported runtime adapters;
- failed preconditions;
- guarded risk approval;
- policy exceptions;
- source repair requirements.

Repeated attempts to invoke a controller-owned evidence producer during source
repair are bounded. Identical rejected actions are consolidated in the
timeline, and Studio transitions to an explicit review-required outcome instead
of spending the remaining model budget on the same forbidden command.

## File changes are easier to review

Studio gives changed files their own review section. Each file exposes added
and removed line counts, a bounded inline preview when safe, and an **Open
diff** action when the CLI transaction has an exact before/after checkpoint.

Rejected policy commands are no longer rendered as if they were executed. This
keeps model intent, runtime activity, changed files, and verification outcomes
visually distinct.

## Dashboard evidence updates from the selected workspace

Workspai watches canonical report and foundation artifacts in both open editor
folders and the explicitly selected workspace. Managed workspaces outside the
current VS Code folder therefore refresh their Dashboard cards when reports,
contracts, registries, policies, or toolchain state change.

Refreshes are debounced and routed through the same evidence projection used by
manual Dashboard refresh, so filesystem events do not create a parallel status
model.

## Library and Dashboard are quieter

The Library now projects the complete examples metadata:

- runnable multi-project examples;
- published workspace-profile foundations;
- FastAPI, NestJS, Go, Spring Boot, and .NET projects.

Stale caches are invalidated when the projection contract changes. Recent
Workspaces stays on Home, and the Library no longer duplicates the project
module browser already available in its canonical project context.

Dashboard actions, artifacts, guided paths, and repair outcomes use a calmer
enterprise-minimal hierarchy with less repeated status text and clearer current
scope.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.56.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

There are no intentional breaking changes to existing workspaces, evidence
artifacts, Create history, or durable Studio sessions.

## Upgrade

Install or update from the Marketplace:

```bash
code --install-extension rapidkit.rapidkit-vscode --force
```

Then reload VS Code. Open **Workspai: Open Setup & Recovery** if the installed
CLI needs verification.

## Validation

- Host and Webview type checking, source formatting, and linting passed with
  zero errors.
- 373 test files passed; 2,709 tests passed and 4 remained explicitly skipped.
- Exact CLI/extension contract parity passed against Workspai CLI 0.56.0; all
  172 palette commands remained synchronized.
- All 22 enterprise validation scenarios and the Discord release-document gate
  passed.
- Dependency audit reported zero high or critical vulnerabilities.
- Production build and VSIX artifact smoke passed for a 160-file, 5.97 MB
  `rapidkit-vscode-0.38.0.vsix` package.
