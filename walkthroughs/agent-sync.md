# Sync agent grounding

Workspai prepares a bounded entry point so supported AI tools can discover the
owning workspace and query current evidence without loading every file into a
prompt.

The synchronization refreshes:

- `AGENTS.md` — generated workspace instructions for people and agents;
- `.workspai/reports/INDEX.json` — the canonical report index;
- `.workspai/reports/workspace-context-agent.json` — bounded agent context;
- `.workspai/reports/workspace-skills-index.json` — available workspace skills.

The step completes only when the current workspace owns those artifacts. An
adopted external project can still use them through its project-to-workspace
link.
