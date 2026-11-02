<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "A more capable, reviewable Assistant",
  "summary": "Workspai for VS Code 0.49.0 improves conversational coding, project scope, durable file review, and activity visibility, aligned with Workspai CLI 0.80.0.",
  "highlights": [
    {
      "icon": "💬",
      "text": "Conversational coding across sidebar and native chat with the configured model"
    },
    {
      "icon": "📁",
      "text": "Existing-project workflows with optional approved adoption or import"
    },
    {
      "icon": "📝",
      "text": "Request-owned file review, Keep/Restore, and accurate change totals"
    },
    {
      "icon": "🖼️",
      "text": "Image previews, compact chat history, and persistent activity"
    },
    {
      "icon": "📦",
      "text": "Pinned Workspai CLI 0.80.0 and admitted agent starter kits"
    }
  ]
}
-->

# Workspai VS Code v0.49.0

Release date: November 2, 2026.

## Conversational coding with evidence

Ask questions, prepare a read-only plan, or let Agent inspect source, make changes,
run commands, and report results. Sidebar and native chat share the conversational
runtime. Greetings and general questions answer directly without unrelated repair
or Goal verification. The selected model remains in use across tool-driven turns;
provider and tool availability determine which capabilities can run.

The Assistant can combine scoped Workspai Graph and Intelligence evidence with
source reads, project commands, public web research, and enabled VS Code/MCP tools.
Research and focused execution delegation retain the parent request's scope and
permissions. Existing Intelligence can reduce repeated source inspection; missing
Intelligence does not force an unrelated setup or repair workflow.

## Work in the right project

Existing repositories can be selected across opened IDE folders without requiring
Workspai membership. Explicit destinations remain attached to the request through
continuation, Resume, and file review. A new workspace is distinct from its member
projects; asking for a separate workspace preserves that destination.

The Assistant can offer in-place adoption or import of a copy into Workspai's
managed location or a custom workspace. Registration requires approval. Declining
it leaves ordinary source work available at the original project location.

## See and review the work

- Activity belongs to each response, with stable expanded output, command results,
  progress, durations, and accurate edited/generated file and line totals.
- A compact, searchable history picker replaces the Sessions/Questions drawer.
- Attached images have thumbnails in the composer and sent messages, with a
  keyboard-accessible full-size preview. Owned attachments and tool images can
  survive reload within storage and retention limits.
- File review stays above the composer. Open changed files or exact comparisons,
  Keep changes, or Restore the request checkpoint. Concurrent changes are checked
  before restoration; unsupported or conflicting restoration is reported.
- Interactive terminals support approved execution, output, input, and Stop when
  VS Code shell integration is available.
- Inline edit proposals and **Suggest Next Edit (Preview)** offer a diff before
  acceptance. Next Edit is explicitly requested, not automatic completion.

## Clearer outcomes and recovery

Provider interruptions, cancellation, and command startup failures have distinct
outcomes. Recorded commands and edits remain available for continuation. Transient
model retries do not replay successful tools. Long transcripts use paged history
and bounded model context while retaining request-owned receipts and approvals.
Structured plans support the user's language; keyboard navigation, focus,
bidirectional content, and high-contrast presentation are improved.

Checks are reported with their actual outcomes. A successful tool call or clean
editor diagnostics alone does not prove build, test, or semantic correctness.
Incomplete work remains explicit; model-generated changes still need the relevant
project checks and review.

## Workspai CLI 0.80.0 alignment

This release is validated against Workspai CLI 0.80.0.

Creation and architecture guidance include six admitted Microsoft Agent Framework,
OpenAI Agents SDK, and Google ADK kits. Google ADK Python requires Python 3.11+.
Microsoft Agent Framework and Google ADK are stable upstream frameworks, while
these Workspai integrations remain preview. The OpenAI Agents SDK integration is
stable. OpenRouter gateways remain source-ready, not release-qualified; Attach
remains unsupported.

The extension pins the official `workspai@0.80.0` runtime and its production
closure. First use downloads the exact packages into extension storage and checks
their integrity. Later use reuses the cache offline. A global CLI install is
optional and is not substituted silently for the verified runtime.

## Compatibility

- VS Code 1.106.0 or newer.
- Workspai CLI 0.80.0 or newer; verified runtime: 0.80.0.
- Internet access for first-run runtime download and remote model/web features.
- Git for remote repository analysis; project-specific language tools for checks.
- RapidKit Core 0.6.0 for Python-backed kits/modules only; Google ADK Python
  requires Python 3.11 or newer.
- Task, debug, notebook, browser, and host tools depend on installed providers.

For terminal access outside extension-owned operations, optionally install:

```bash
npm install -g workspai@0.80.0
```
