<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Governed Goals and Canonical Agent Entry",
  "summary": "Workspai for VS Code 0.40.0 is verified against CLI 0.59.1 so Goal, Agent, native Chat, and Incident Studio enter adopted projects through one portable contract and accept source changes only through governed repair and verification.",
  "highlights": [
    {
      "icon": "🎯",
      "text": "Goal turns arbitrary bounded engineering outcomes into durable CLI-authored Goal Packs"
    },
    {
      "icon": "🧭",
      "text": "Canonical project entry and bootstrap receipts gate broad discovery and mutation"
    },
    {
      "icon": "🛠️",
      "text": "Sidebar and native Chat share one project-bound source repair and verification loop"
    },
    {
      "icon": "🔒",
      "text": "Portable identities prevent machine-local paths from crossing consumer boundaries"
    },
    {
      "icon": "✅",
      "text": "CLI 0.59 contract parity, capability gates, and packaged-artifact inspection fail closed"
    }
  ]
}
-->

# Workspai VS Code v0.40.0

Released August 17, 2026.

## Governed Goals and Canonical Agent Entry

Workspai for VS Code 0.40.0 is validated against Workspai CLI 0.59.1. This
release gives Goal, Agent, native Chat, and Incident Studio one governed route
from an adopted project to canonical evidence, bounded source work, a CLI-owned
repair transaction, changed-file review, and exact verification.

The extension does not infer a second workspace truth from UI labels or model
prose. It consumes the CLI's published schemas, capability inventory, project
entry receipt, Goal Pack, repair plan, transaction, and verification artifacts.
Missing, stale, incompatible, or unsafe evidence blocks the relevant operation
with an actionable explanation.

## Goal is a native, governed Assistant mode

Users can describe any bounded engineering outcome in Goal mode, Dashboard,
the Command Palette, a workspace context menu, or `@workspai /goal`. Coverage,
dependency-security, and release-readiness objectives use exact CLI verifiers.
Other objectives keep the same scope, evidence, attempt, transaction, rollback,
and workspace-safety controls and close through an explicit outcome review
instead of a false machine-verification claim.

An active Goal is projected from the CLI-authored Goal Pack and handoff. It is
available consistently to Ask, Plan, Agent, Studio, and native Chat, survives
extension reloads, and remains tied to the selected workspace and project.
Attempt budgets are immutable and durable; a retry cannot silently reset them.

## Adopted projects have one canonical first entry

Before broad source discovery or mutation, the extension resolves the selected
project through Workspai CLI 0.59.1 and validates its portable entry contract
and agent-bootstrap receipt. This proves workspace resolution, project identity,
freshness, compatibility, and agent grounding without exposing the user's
machine-local canonical workspace path.

Raw, non-adopted folders remain usable. Adopted projects fail closed when their
entry contract is missing, blocked, degraded, stale, schema-incompatible, or
contains an unsafe absolute path. Source inspection can deepen canonical
evidence; it cannot silently replace it.

## One repair controller serves Sidebar and native Chat

Sidebar and native Chat now continue through the same durable, project-bound
controller. The selected model can query the bounded graph, read exact source
ranges, inspect diagnostics and Git state, and propose edits only against
content it actually inspected. Ask and Plan remain read-only.

Every accepted source proposal enters the CLI Repair Engine. The CLI owns the
checkpoint, mutation, reconciliation, audit, tests, build, exact producer
refresh, verification, closure, and rollback. A model completion request cannot
bypass verification, and a rolled-back or cancelled transaction cannot be
presented as a successful change or fabricated user decision.

Producer-owned evidence cards refresh their declared producer without spending
a model call. Source-repair cards use bounded causal attempts and return to the
model only when a real source transition remains possible. Changed files are
reviewed after the transaction and before final completion.

## Linked projects keep their real repair boundary

Workspace cards resolve to the single affected registered project whenever the
CLI provides that scope. Linked projects retain their external source boundary
for host-side authorization while all model, Webview, history, diff, and receipt
identities stay portable and project-relative. Sibling traversal, cross-project
session replay, and unregistered-root mutation fail closed.

## Privacy is enforced before every consumer boundary

Absolute workspace, project, checkpoint, temporary, proof, and transaction
paths are converted to `$WORKSPACE`, `$PROJECT`, or safe relative artifacts
before reaching a model provider, Webview message, conversation history, tool
result, test fixture, release note, or packaged VSIX. Centralized guards scan
the complete repository and staged changes so a developer-specific path cannot
be published accidentally.

The same release gates enforce authored English text across source, Webviews,
tests, fixtures, documentation, release material, and filenames.

The development dependency graph pins PostCSS's Nano ID dependency to 3.3.18,
closing the zero-size custom-generator denial-of-service advisory before
packaging.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.59.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

The 0.59.0 CLI floor is capability-driven. Goal integrity transitions, durable
attempt budgets, project entry, agent bootstrap, and the repair consumer
protocol are runtime requirements for 0.40.0, not optional display metadata.
Older or capability-incomplete CLIs receive an actionable gate before the
extension begins an enterprise workflow.

Compatibility ownership is intentionally split: the CLI owns the generated
schema and capability inventory, while this extension release owns its minimum
and verified CLI versions. A future extension can raise its floor to an already
published CLI without modifying or republishing that CLI, and a newer
backward-compatible CLI remains valid without forcing another extension release.

## Upgrade

Install or update from the Marketplace:

```bash
code --install-extension rapidkit.rapidkit-vscode --force
```

Then reload VS Code. If setup reports a compatibility gate, update the CLI:

```bash
npm install -g workspai@latest
```

## Validation

- CLI generation and both canonical contract mirrors match Workspai CLI 0.59.1.
- Host and Webview type checks passed; 389 test files and 2,849 tests passed,
  with one file and five tests explicitly skipped.
- All 22 enterprise scenarios passed. Production build and VSIX inspection
  passed for a 173-file, 6.05 MB `rapidkit-vscode-0.40.0.vsix` artifact.
- The high-severity dependency audit gate passed with zero high or critical
  findings.
- English-only and local-path publication guards cover authored and packaged
  extension surfaces.
