<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Canonical Intelligence from CLI Evidence to IDE Action",
  "summary": "Workspai for VS Code now consumes the complete CLI 0.56.0 Doctor and graph contracts, keeps proof paths private, grounds every Assistant mode in the same artifact catalog, and gives Studio stable evidence identifiers for governed repair.",
  "highlights": [
    {
      "icon": "🩺",
      "text": "Doctor cards preserve canonical scope, applicability, freshness, and repair disposition"
    },
    {
      "icon": "🕸️",
      "text": "Graph Explorer exposes polyglot topology, providers, semantic bindings, scopes, and diagnostics"
    },
    {
      "icon": "🔒",
      "text": "Portable proof identities replace absolute local paths before Webview delivery"
    },
    {
      "icon": "🧭",
      "text": "Ask, Plan, Agent, Dashboard, and Studio share one governed artifact inventory"
    },
    {
      "icon": "🛠️",
      "text": "Studio repairs use stable finding, causal, capability, scope, and verification identifiers"
    }
  ]
}
-->

# Workspai VS Code v0.39.0

Released August 11, 2026.

## Canonical Intelligence from CLI Evidence to IDE Action

Workspai 0.39.0 is validated against Workspai CLI 0.56.0. It completes the
consumer boundary introduced in the previous release: the CLI owns canonical
Workspace Intelligence, Doctor diagnosis, graph generation, freshness, and
repair capability; the extension projects that evidence into reviewable IDE
surfaces without inventing a second truth model.

The result is a deeper Graph Explorer, more exact Doctor and Studio behavior,
and a single governed evidence vocabulary for Dashboard and Assistant flows.

Incident Studio also adopts a calmer conversation-first layout. Workspace,
project, blocker, and repair state share one compact context header; the active
Workspace Intelligence stage appears as inline activity; completed steps stay
available behind a concise worked-step disclosure; and canonical CLI decisions
render in the conversation rather than in a disconnected dashboard control.

The same governed repair boundary is now available from VS Code's native Chat
surface through `@workspai /repair`. Native Chat selects a canonical blocking
evidence card, streams CLI Repair Engine progress, exposes only portable changed
paths, and reports success only for a closed verification receipt. When the CLI
requires an explicit decision, the exact transaction options appear as native
Chat actions and continue against that immutable transaction.

Typed `source-repair-required` outcomes now continue in native Chat through the
shared durable `StudioAgentSession`. The selected model can discover, inspect,
and search source, inspect diagnostics and Git changes, run bounded read-only
commands, and propose source patches. Tool lifecycle events are projected into
native Chat activity, cancellation stops the shared session, and every patch is
authorized against inspected content before entering a CLI-owned checkpoint,
validation, verification, closure, or rollback transaction.

Repair state projection is now terminal-state aware. A fresh verified receipt
overrides stale `Awaiting verify` chrome and closes the intelligence rail at
`11/11`; a rolled-back transaction is presented as a restored checkpoint rather
than an applied file change. Review controls are fail-closed and appear only
when the CLI supplies both an immutable transaction id and explicit options, so
an internal model-policy stop cannot be mistaken for a user decision.

## Doctor preserves canonical diagnosis and scope

Doctor cards now understand the CLI's diagnosis, summary, capability,
validation, receipt, freshness, applicability, and repair-disposition
contracts. The extension retains stable finding and causal identifiers and
keeps workspace and project findings in their declared scope.

This means:

- advisory findings remain advisory;
- non-applicable findings do not become blockers;
- unknown evidence is presented as unknown rather than healthy;
- repairable findings retain their exact capability and verification command;
- Studio receives structured evidence instead of reverse-engineering UI prose.

Legacy Doctor envelopes remain readable through a bounded compatibility
projection, but canonical CLI 0.56.0 fields take precedence whenever present.

## Graph Explorer represents the polyglot architecture

The Dashboard Graph tab now projects a broader architecture vocabulary across
languages and runtimes, including services, APIs, endpoints, schemas,
protocols, packages, runtime units, lifecycle stages, databases, queues,
containers, deployments, pipelines, environments, decisions, test suites, and
owners.

The bounded projection samples architecture entities across project and kind
buckets before filling the remaining entity budget. A large generated-code or
single-language cluster can no longer consume the complete Webview payload and
hide the workspace's architectural spine.

New Graph Explorer evidence includes:

- discovered languages and runtime topology;
- provider status, versions, permissions, entity/relation counts, and
  diagnostics;
- semantic binding eligible, bound, unknown, and coverage values;
- source fingerprint strategy, scope file counts, limits, and truncation;
- graph conflicts, unknown facts, and actionable diagnostics;
- entity attributes and readable neighboring entity labels;
- relation derivation, trust, confidence, and proof identifiers;
- proof provider, pointer, line, column, observation time, freshness, and
  detail.

Persisted graph metadata is reconciled with streamed graph data so live Canvas
and WebGL rendering retain workspace identity and input-scope context.

## Proof paths are portable and privacy bounded

Absolute filesystem paths never need to reach a Webview to prove a graph
relationship. Before projection, path-bearing entity attributes, proof
artifacts, and graph source artifacts are normalized into one of three forms:

- a workspace-relative artifact path;
- `external/<project-id>/...` for linked projects;
- `redacted/<basename>` when no safe portable identity can be established.

The Graph Explorer presents portable paths as readable project-relative
breadcrumbs. Redacted locations remain visible as evidence records but cannot
be opened. This keeps proof useful without exposing usernames, home
directories, drive roots, or unrelated local directory structure.

## Assistant modes share one evidence objective

Ask, Plan, and Agent now receive the same CLI-authored Workspace Intelligence
artifact inventory used by Dashboard and Studio. The inventory is built from
the runtime command-surface contract and reconciled with the live `INDEX.json`
manifest when available.

Each Assistant objective states the current freshness verdict, available
artifacts, missing required evidence, and the smallest-evidence inspection
rule. Ask and Plan disclose stale evidence without presenting it as current;
Agent refreshes the governed producer before relying on stale or missing
evidence.

## Studio repair handoff is stable and machine readable

Studio blocker handoff now carries canonical finding, causal, issue-class,
project, capability, freshness, and verification fields. Repair prompts use
those identifiers and the CLI's declared action rather than display labels or
English reason matching.

Dashboard and sidebar actions share the same command-capability requirements.
Project module operations such as `diff`, `checkpoint`, `rollback`,
`uninstall`, and `upgrade` are checked through the project-scoped lane exposed
by CLI 0.56.0 instead of being mistaken for absent top-level commands.

## Analytics consent UI is retired

The extension no longer asks users to authorize anonymous retention analytics
and no longer contributes analytics opt-in settings to VS Code. The retention
analytics gate is hard-disabled, including when an older installation still
has an opt-in value in user settings, and activation does not build a retention
snapshot or register a telemetry listener.

Local operational evidence used by Dashboard summaries, Incident Studio, and
repair workflows is unchanged. It remains an on-device product capability and
is not an outbound analytics transport.

## Workspace terminals are one click away

Every Workspace row in the primary sidebar now includes a terminal action. It
opens a new integrated terminal whose working directory is the selected
Workspace root. The existing Open Workspace action remains available from the
context menu, so the faster terminal affordance does not remove navigation.

## Studio repair decisions stay in the conversation

Studio now preserves the complete canonical CLI transaction while a model-led
recovery passes through deterministic remediation. A rolled-back or otherwise
stopped transaction is no longer mislabeled as `Decision required`. When the
CLI genuinely emits a decision gate, Studio renders the valid options inline
and submits the selected option against that exact transaction id.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.56.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

There are no intentional breaking changes to existing workspaces, canonical
artifacts, Create history, or durable Studio sessions.

## Upgrade

Install or update from the Marketplace:

```bash
code --install-extension rapidkit.rapidkit-vscode --force
```

Then reload VS Code. Open **Workspai: Open Setup & Recovery** if CLI 0.56.0
capability or contract verification needs attention.

## Validation

- Host and Webview type checking and source formatting passed. Lint completed
  with zero errors and 46 pre-existing warnings.
- 377 test files passed; 2,723 tests passed and 4 remained explicitly skipped.
- Exact CLI/extension contract parity passed against Workspai CLI 0.56.0; all
  172 palette commands remained synchronized.
- All 22 enterprise validation scenarios, 162 release Stop Gate tests, and the
  Discord release-document contract passed.
- Dependency audit reported zero vulnerabilities across 845 dependencies.
- Production build and VSIX artifact inspection passed for a 164-file, 6.0 MB
  `rapidkit-vscode-0.39.0.vsix` package.
