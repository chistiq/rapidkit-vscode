# Workspai for VS Code 0.35.0

## Workspace Intelligence, verified goals, and a dependable Studio Agent

This release aligns the extension with Workspai CLI 0.52.0 and makes the same
workspace contracts available across the primary sidebar, Dashboard, Create,
and Assistant surfaces.

## What users get

### One current workspace view

- Canonical model, graph, Doctor, impact, skills, agent context, and evidence
  artifacts are resolved from the owning workspace.
- Dashboard sections are now Home, Run, Repair, Artifacts, Graph, Project, and
  Library.
- Missing and stale evidence remain visible instead of being presented as
  successful results.
- External adopted projects retain their workspace identity and project scope.

### Create, adopt, and import from one place

- Create supports all 23 currently available canonical backend, frontend,
  desktop, and extension kits. Planned entries remain hidden until executable.
- Manual and model-assisted creation resolve the same create-planner contract.
- Existing local projects, Git repositories, projects, workspaces, and Workspai
  archives can enter through explicit adopt/import actions.
- Workspace consumers are synchronized after create, adopt, or import.
- Python and RapidKit Core remain optional unless the selected capability is
  Python-backed.

### Ask, Plan, and Agent

- Ask explains bounded workspace evidence without changing source.
- Plan investigates and returns a grounded implementation plan.
- Agent handles ordinary engineering goals and blocker cards.
- Verified goals support requests such as release preparation, non-breaking
  dependency remediation, and test coverage targets.

### Repair through verification

Studio now treats repair as a transaction:

```text
inspect → change → reconcile → audit/test/build → intelligence loop → verify
```

- A successful command is not counted as a source mutation.
- Dependency manifest edits do not close a repair until lock/install state and
  focused validation are reconciled.
- CLI-authored Doctor strategies, typed repair operations, project scope, and
  verification commands reach Studio without being discarded.
- The current `workspai:doctor:repair` token and legacy
  `rapidkit:doctor:repair` token are both understood.
- Repeated model inspection is bounded, while real source changes reopen the
  causal repair path.
- Only fresh non-blocking evidence can complete the session.

### Clearer workspace and project navigation

- Project Explorer recognizes Rust/Axum, Laravel, Tauri, Electron, and VS Code
  Extension projects in addition to existing stacks.
- Workspace/project menus preserve explicit scope.
- Runtime, kind, health, and selected-state labels no longer imply readiness
  without evidence.

### Setup and recovery

- CLI discovery supports direct PATH, global npm, NVM/FNM/asdf, and npx-compatible
  installations.
- The minimum compatible CLI version comes from the synced compatibility
  contract.
- Core upgrades target the installation that owns the detected version.
- Recovery-mode workspace creation writes the canonical
  `.workspai-workspace` marker and gives a concise CLI synchronization path.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.52.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit/module requires it

## Validation

- Contract parity: passed
- Palette surface: 172 commands synchronized
- Test files: 356 passed
- Tests: 2510 passed, 2 skipped
- TypeScript host and webview checks: passed
- Production host/webview build: passed

## Upgrade

```bash
npm install -g workspai@latest
```

Then reload VS Code and run **Workspai: Open Setup & Recovery**.
