<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Workspai CLI 0.77.0 alignment",
  "summary": "Workspai for VS Code 0.48.0 is validated against Workspai CLI 0.77.0, adds OpenAI agent kits and source-ready OpenRouter gateway kits, and runs the official CLI package from extension storage.",
  "highlights": [
    {
      "icon": "📦",
      "text": "Download the pinned Workspai CLI once, verify it, and reuse that copy offline"
    },
    {
      "icon": "🤖",
      "text": "Create admitted OpenAI Agents SDK projects for Python and TypeScript"
    },
    {
      "icon": "🌐",
      "text": "Create source-ready OpenRouter AI Gateway projects without calling them qualified"
    }
  ]
}
-->

# Workspai VS Code v0.48.0

Prepared September 22, 2026.

## Workspai CLI 0.77.0 alignment

Workspai for VS Code 0.48.0 is validated against Workspai CLI 0.77.0. This
release follows the CLI contracts for admitted OpenAI Agents SDK kits and the
source-ready OpenRouter AI Gateway kits.

Gateway kits are source-ready. They are not qualified, stable, or
release-ready. Attach is unsupported, and Go is not a gateway runtime. Agent
and gateway dev commands do not reserve a synthetic HTTP port.

The published extension does not embed a second copy of the CLI. On first use
it downloads the pinned `workspai@0.77.0` tarball and the pinned production
dependency closure into extension storage, verifies each integrity, and
executes that copy. Later runs use the cache without network access. If the
cache is missing and the network is unavailable, the extension reports that
the CLI could not be downloaded and does not substitute another version.

An optional terminal install remains a separate, explicit download:

```bash
npm install -g workspai@0.77.0
```

## Assistant / Studio control plane

Studio now has one completion authority for model-driven and deterministic
paths. A session cannot report completion while a CLI-selected action, external
effect observation, final source review, Workspace Intelligence closure, fresh
verification, or durable task-ledger step remains open. These obligations are
stored outside the bounded event transcript, so provider failure, Resume, and
event compaction do not erase them.

Exact actions selected by the CLI Repair Engine execute under controller-owned
approval and transaction policy without another model turn. Other governed
tools remain visible to the model, including when a recovery path is active;
exhausted accelerators are annotated and rejected until causal state advances
instead of silently disappearing.

The session records the actual provider and model that served each decision,
including fallback identity and provider-request count. OpenAI-compatible and
Anthropic tool requests retry transient transport, overload, and server failures
up to three times with bounded backoff. Authentication, authorization, billing,
and explicit quota failures are not retried. Provider token usage is recorded
when available and otherwise estimated; each autonomous attempt also has
separate model-turn, provider-request, and token boundaries.

Multi-step work can use a durable task ledger that survives compacted context
and Resume. Completion remains blocked until every declared step is complete.

Studio can fetch public HTTPS pages for vendor docs, issues, and status pages
when the error is not covered by Workspai evidence. Local, private, and
credentialed URLs are blocked, and fetched text is not treated as workspace
proof. Studio can also list and invoke Language Model tools registered in the
current VS Code window, including MCP servers the user enabled. Read-like tools
run without extra approval; other host tools require one-run approval because
they sit outside the CLI source checkpoint. Studio does not add an unrestricted
browser or an ungoverned MCP executor of its own.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.77.0 or newer
- Git for remote repository analysis
- RapidKit Core 0.6.0 only for Python-backed kits or modules
