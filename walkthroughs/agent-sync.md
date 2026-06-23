# Sync agent grounding

Agent grounding sync writes the shared handoff so every AI tool works from the same evidence as you:

- `AGENTS.md` — the human + agent grounding document at the workspace root.
- `.rapidkit/reports/INDEX.json` — the index of evidence reports.

It also refreshes the agent context report used by the Workspai chat participant and the **Send to Copilot** handoff.

This final step completes once `AGENTS.md` and the reports index both exist. Your workspace is now fully grounded for humans and AI.
