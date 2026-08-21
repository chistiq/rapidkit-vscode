<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Intent-aware modes, causal repair queues, and native change review",
  "summary": "Workspai for VS Code 0.42.0 is verified against CLI 0.63.0 and unifies intent-aware Assistant modes, deterministic aggregate repair, and transaction-bound change review.",
  "highlights": [
    {
      "icon": "🧭",
      "text": "Intent-aware Agent, Ask, Plan, and Goal routing without silent authority escalation"
    },
    {
      "icon": "🧩",
      "text": "Aggregate workspace blockers become a deterministic queue of exact causal repairs"
    },
    {
      "icon": "🔍",
      "text": "Native multi-file review uses checkpoint-backed before and live after documents"
    },
    {
      "icon": "↩️",
      "text": "Authoritative change summaries and Undo remain bound to the owning CLI transaction"
    },
    {
      "icon": "✅",
      "text": "CLI 0.63.0 contracts govern project scope, mutation, rollback, and verification"
    }
  ]
}
-->

# Workspai VS Code v0.42.0

Published.

## Intent-aware modes, causal repair queues, and native change review

Workspai for VS Code 0.42.0 is validated against Workspai CLI 0.63.0. The
release brings conversational requests, durable Goals, card handoffs, source
mutation, and final review under one bounded Assistant architecture.

The model can still reason and choose the next engineering step. Authority does
not come from model confidence, however. The selected mode, classified intent,
canonical project boundary, CLI evidence, and closed repair transaction decide
which tools may run and which result may be called verified.

## One intent contract for every Assistant mode

Casual messages and clarification stay ordinary chat. Ask remains read-only.
Plan can inspect evidence and prepare a rollback-aware approach without changing
files. Agent handles one governed engineering task. Goal binds a durable outcome
to the CLI Goal Pack lifecycle.

A model-driven router classifies free-form requests before project bootstrap or
mutation. It may safely reduce authority, but it cannot silently promote a
request into Agent or Goal. Suggestions such as **Run with Agent** and **Track
as Goal** require the user to opt into stronger authority. The resulting
execution policy is immutable, persisted across resume, and revalidated before
tools are exposed.

## Aggregate cards now repair causal findings, not summaries

Workspace-level cards can represent multiple findings across multiple projects.
In 0.42.0, that presentation boundary no longer becomes a mutation boundary.
Doctor, Analyze, Readiness, Workspace Verify, Workspace Run, and Workspace
Intelligence handoffs carry structured causal targets from CLI 0.63.0.

Studio selects one blocking causal family in one canonical project, opens one
CLI-owned transaction, repairs and verifies that exact target, refreshes its
owning producer, and only then selects the next remaining target. Advisory
findings cannot widen the queue. Unrelated workspace blockers are reported
separately and do not turn a resolved selected card back into a failure.

Linked projects retain their canonical source boundary throughout this loop.
Project-relative evidence is portable, while machine-local workspace and source
paths remain outside model prompts, Webviews, release assets, and generated
consumer output.

## Governed source work remains model-capable

Agent and card handoff can inspect bounded source, apply multi-file patches,
delete inspected files, run approved project commands, and request exact
verification. These capabilities are shared across Sidebar Studio and native
Chat and remain protected by project normalization, protected-path policy,
symlink refusal, SHA revalidation, source-mutation detection, CLI checkpoints,
rollback, and post-transaction verification.

Scaffold, initialization, generation, migration, wrapper, and creation commands
are treated as potentially mutating. They cannot pass through the diagnostic
command plane simply because their executable name is unfamiliar.

## Review the real change set

The Assistant transcript now contains one compact change summary with
authoritative `+added -removed` totals and per-file counts. Large sets disclose
progressively instead of flooding the conversation.

**Review** opens all comparable files in native VS Code comparisons. The before
side is a read-only `workspai-repair` document backed by the owning transaction
checkpoint; the after side is the actual workspace file. Binary, missing, or
otherwise non-comparable files are reported explicitly rather than rendered as
misleading text. Inline previews include old and new line-number gutters.

**Undo** is bound to the transaction that produced the change. Once rollback
completes, the transaction is retired across session and incident surfaces so a
reverted file cannot remain presented as an active edit.

## Bounded context for models and agents

Studio, native Chat, Copilot handoff, and Webview context follow the same
CLI-authored read order: report index, active Goal and immutable Goal Pack,
bounded workspace and project context, relevant operational Skills, and bounded
proof-backed Graph search.

At most three task-relevant Skills are preloaded. Every validated canonical
Skill remains available through a bounded tool read. Complete Workspace Model
and Knowledge Graph exports are reserved for explicit audit flows rather than
inserted into normal prompts.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.63.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

CLI 0.63.0 is a runtime floor for this release. Its causal finding targets,
sequential aggregate-repair policy, and updated consumer contracts directly
govern mutation and verification; they are not optional display metadata.

## Upgrade

Install or update the extension from the Marketplace:

```bash
code --install-extension rapidkit.rapidkit-vscode --force
```

Then reload VS Code and install the compatible CLI:

```bash
npm install -g workspai@0.63.0
```
