<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Better context, less repetition, clearer outcomes",
  "summary": "Workspai for VS Code 0.50.0 adds optional semantic retrieval, parallel private source proposals, native inline suggestions, and workspace Agent improvements that reduce repeated context and retain requested outcomes and verification limits.",
  "highlights": [
    {
      "icon": "🔎",
      "text": "Hybrid code context and optional incremental semantic search"
    },
    {
      "icon": "🧩",
      "text": "Parallel private source proposals with parent-owned review and integration"
    },
    {
      "icon": "✏️",
      "text": "Native inline suggestions and language-provider symbol renames"
    },
    {
      "icon": "📋",
      "text": "Scoped onboarding context, compact activity and explicit verification limits"
    },
    {
      "icon": "🔁",
      "text": "Less repeated Agent context, durable read coverage and multi-part outcome tracking"
    }
  ]
}
-->

# Workspai VS Code v0.50.0

Release date: November 7, 2026.

This release is validated against Workspai CLI 0.80.0.

## Keep the full task in view with less repeated context

Workspace Agent retains distinct requested outcomes from its initial intent
decision for multi-part tasks without another model request. A single focused
fix does not require a separate planning ceremony. Long logs retain their
beginning and end during routing; execution retains the original request.

Source reads record observed hashes and returned line ranges, while instruction
pages retain exact byte offsets. Bounded previews provide continuation locations
instead of silently presenting a prefix as the entire file. Coverage metadata
survives Resume and recognizes overlap across differently named batches. It is
an observation record, not a source cache or authority to skip a fresh check.

Identical source previews can reference bytes already present in the same model
request. Current scope, outstanding effects and relevant receipts remain in
context, and all registered tools remain discoverable. Changed inputs, missing
details or freshness requirements still justify reading or checking again.

Before workspace Agent completion, an evidence-linked review accounts for
requested outcomes and identifies unresolved work. Successful tool references
identify observations; they are not mathematical proof of semantic correctness.
Unresolved reviews feed back into execution rather than counting as transport
errors. Read-loop recovery provides guidance without forcing a verifier or
automatically declaring the task complete. Existing session budgets, approval
rules and canonical CLI verification contracts remain in force.

Valid JSON tool envelopes from text transports are normalized against the
provided tool catalog before normal controller validation. This avoids an extra
model request solely to repair a supported transport shape; it does not authorize
an unregistered tool or bypass approval.

ShellCheck and Hadolint are recognized as analysis commands rather than unclassified
external effects. Terminal activity preserves read history and flags uncertain
freshness for another observation. Nested batch metadata survives storage without
source bodies or patch hunks; shortened evidence is labeled explicitly.

Onboarding receipts remain separate from source-edit receipts and other Git
observations. Change badges preserve the final net comparison through live events
and chat reloads, including workspace identity and binary metadata. If execution
reaches its allowance, the unfinished response retains that reason and labels
estimated usage rather than presenting it as provider billing. A process signal
does not identify a failing child merely because its name appeared last in stdout.

## Find relevant context with the appropriate tool

The Assistant can retrieve bounded current-source snippets through lexical search,
Workspai Graph and installed language providers. Results include source locations,
hashes and coverage information. Ordinary repositories remain usable without
Workspai registration, embeddings or an intelligence build.

Optional semantic search adds an incremental embedding index. Enable it explicitly
in User Settings and choose a local embedding provider or the configured supported
API provider. Embeddings send selected source chunks to that provider and have
separate usage and costs. Indexing observes ignore rules and excludes sensitive
and generated paths; bounded coverage and current-source hash checks are reported.
The private index retains vectors, hashes and locators rather than raw source.
It can be cleared without changing project files. Search results are navigation
evidence, not proof of exhaustive recall or code correctness.

## Delegate independent work and review the combined result

Agent can assign up to three disjoint sets of exact writable paths to parallel
private source forks. Children receive bounded text source, current unsaved buffers
and applicable instructions. Their sessions and proposals can be retained for
status and continuation.

The parent reviews completed proposals and integrates selected changes through
its normal permissions, inspected-source checks and request checkpoint. Concurrent
user edits are protected; the parent still runs the relevant checks on the
combined result. Discarding a job removes its private proposals.

These are source forks, not Git worktrees or an operating-system sandbox. Private
children have no terminal, external host-tool, adoption or scope-switch capability.
Direct and sequential parent workflows remain available for work requiring those
tools, unsupported files or a larger source tree.

## Edit with native editor and language tools

- Trigger inline suggestions to preview insertions as editor ghost text with the
  configured provider. Explicit suggestions are available by default; automatic
  suggestions after typing pauses are off by default and can increase model usage.
- Optionally enable exact current-line replacement previews. Arbitrary multi-line
  next edits use **Suggest Next Edit (Preview)** and its reviewed acceptance flow.
- Reuse a cached insertion while typing its exact prefix. Reviewed next-edit
  proposals can survive unrelated typing only when the target and surrounding
  anchors still match uniquely.
- Rename symbols using installed language providers, protected edit transactions
  and existing review/checkpoint controls. This is a text refactor, not a file-move
  operation; language-provider availability and project checks still matter.

Stale, cancelled and unresponsive provider requests are handled without applying
outdated proposals. Suggested code still needs review and relevant tests.

## Onboard an existing project without losing its task

Project selection recognizes paths copied from terminal prompts, including paths
immediately following non-English prose. The Assistant checks the selected source's
Workspai signature and ownership before offering registration.

In-place adoption and copied import require exact consent covering source,
destination and operation. Existing metadata or ownership suppresses repeated
optional offers; declining keeps the original source task available.

Successful onboarding returns verified membership, compact project context and
refreshed root instructions. Only unread instruction pages and relevant nested
rules need further inspection. Successful command receipts no longer repeat large
CLI stdout. Task-scoped Graph retrieval can help find dependencies, owners, tests
and proofs, while source, language and command tools remain available when
intelligence evidence is missing or stale. Registration and bootstrap do not
verify the requested implementation.

## Follow progress and understand what was verified

Compatible OpenAI-style and Anthropic providers can stream response progress.
Tools execute only after the complete response passes validation. Incomplete
streams are discarded; endpoints without streaming support can use the JSON
response path. Model choice and actual alternate-model fallback remain visible.

Successful model transport, permission waits, session states and checkpoints stay
under their owning action's **Execution details**. Public receipts and distinct
tool invocations remain inspectable. File inspection says **Observed** or
**Reviewed changes** rather than attributing unrelated files to the Assistant.

Native workspace responses use **Response ready**. The answer must report which
checks ran and what remains untested; a local diagnostics/diff review does not
become canonical Workspai CLI verification. Setup, fallback and error-handling
changes call for relevant behavioral success/failure checks, not static checks
alone. Bounded references to prior successful observations and checks help avoid
unnecessary repetition without disabling tools or assuming unchanged external
state.

## More reliable context, tools and source boundaries

- Conversation compaction retains bounded, labeled historical excerpts alongside
  current execution scope, approvals and outstanding verification.
- Compatible VS Code agents can use read-only **Workspai Workspace Inventory**
  and **Workspai Graph Search** when enabled in their host's tool picker.
- Owned browser sessions can expose bounded console/network observations, hover
  elements, send supported keys and handle dialogs through approved interactions.
  Network observations exclude headers, bodies, credentials and query strings.
- Source and language tools reject sensitive environment files and escaped aliases.
  Embedding configuration cannot be enabled or redirected by repository settings.
- Regenerable Python analysis caches stay outside source checkpoints; oversized
  actual source remains protected. Project checks are no longer blocked merely by
  a large mypy cache database.
- Task discovery preserves selected-project boundaries and actual working
  directories. Expired retained tool output is removed durably.

## Compatibility and verification scope

- VS Code 1.106.0 or newer.
- Workspai CLI 0.80.0 or newer; verified runtime: 0.80.0.
- The published extension downloads and integrity-checks its pinned official CLI
  runtime on first use and reuses the cache offline. A global install is optional.
- Model, host, browser, language extension and runtime availability affect
  individual tools. Semantic indexing and automatic inline suggestions are opt-in.
- Local automated tests and production builds passed. These checks do not certify
  every provider, live IDE interaction or end-to-end application workflow.
- No fixed token-saving percentage, complete codebase recall, competitor parity
  or untested application success is claimed.

For optional terminal use outside extension-owned operations:

```bash
npm install -g workspai@0.80.0
```

[Compare with v0.49.1](https://github.com/chistiq/rapidkit-vscode/compare/v0.49.1...v0.50.0)
