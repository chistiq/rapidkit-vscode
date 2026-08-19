<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Intelligent Agent Preflight and Enriched Repair Loop",
  "summary": "Workspai for VS Code 0.41.0 is verified against CLI 0.61.0 and introduces intent-first agent sessions, a replan repair decision, enriched workspace context, and a minimal enterprise chat UI.",
  "highlights": [
    {
      "icon": "🧠",
      "text": "Free-form agent sessions understand user intent before executing tools"
    },
    {
      "icon": "🔄",
      "text": "Replan repair decision lets the model discard a failed plan and retry"
    },
    {
      "icon": "📊",
      "text": "Enriched workspace context with impact, doctor, readiness, and verify summaries"
    },
    {
      "icon": "🎨",
      "text": "Minimal, enterprise-level chat UI redesign with refined typography and spacing"
    },
    {
      "icon": "✅",
      "text": "CLI 0.61.0 contract alignment across repair transaction, capabilities, and compatibility"
    }
  ]
}
-->

# Workspai VS Code v0.41.0

Published.

## Intelligent Agent Preflight and Enriched Repair Loop

Workspai for VS Code 0.41.0 is validated against Workspai CLI 0.61.0. This
release makes free-form agent sessions intent-aware, adds a replan decision
to the repair loop, enriches the workspace context consumed by all agent modes,
and applies a minimal, enterprise-level visual redesign to the chat experience.

The extension continues to consume the CLI's published schemas, capability
inventory, repair transaction, and verification artifacts. Missing, stale,
incompatible, or unsafe evidence blocks the relevant operation with an
actionable explanation.

## Free-form agent sessions understand intent first

When a user sends a message outside a governed repair or Goal path, the
agent session now runs a preflight turn without tools. The model reads the
user's message, determines whether it contains a clear engineering request,
and responds accordingly. Vague or off-topic messages receive a clarification
response and the session pauses, waiting for the user to clarify. Clear
requests proceed to tool execution through the intelligent loop.

This prevents the model from blindly executing workspace inspection on every
message regardless of content or intent.

## Replan joins the repair decision surface

When the CLI repair engine pauses for a decision, the user now sees three
options: Manual Repair, Replan, and Cancel. Replan discards the current plan
and lets the model generate a fresh proposal for the same target, without
requiring the user to cancel and restart the entire session.

The replan option is available in all repair decision contexts, including
Sidebar, native Chat, and Incident Studio.

## Enriched workspace context

Agent sessions now receive richer context from the CLI intelligence chain.
Impact summaries, doctor diagnostics, analyze results, readiness assessments,
verification status, explain narratives, and diff observations are included
in the workspace context document when their artifacts exist. This gives the
model a broader operational picture without requiring additional tool calls.

## Minimal enterprise chat UI

The chat experience received a visual redesign focused on professional
minimalism. Typography, colors, spacing, empty states, and error displays
follow enterprise product conventions. Dashboard cards and the artifacts tab
use responsive container queries for clean layout at any panel width.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.61.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

The 0.61.0 CLI floor is capability-driven. Enriched workspace context
summaries, the replan repair decision, and updated agent-sync outputs are
runtime requirements for 0.41.0, not optional display metadata.

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
