# Release Notes v0.34.0

## v0.34.0 (June 10, 2026)

### CLI Parity: Infra, Foundation, Project Lifecycle, and Module Maintenance

This release closes the largest remaining gaps between RapidKit npm CLI capabilities and the Workspai VS Code extension. Users can now run infrastructure, foundation, extended project lifecycle, and module maintenance workflows directly from the workspace and project sidebars without hand-typing terminal commands.

## Highlights

- **Workspace Infrastructure**
  - Added `Infra: Plan`, `Infra: Up`, `Infra: Down`, `Infra: Status`, and `Infra: Open Compose File`.
  - Docker availability is checked before up/down/status operations.
  - Volume removal requires an explicit modal confirmation.
  - Optional plan flags include dry-run, verbose output, rebuild, and skip-plan refresh.

- **Workspace Foundation Ensure**
  - Added `Workspace Foundation: Ensure` under Run & Release.
  - Supports safe ensure and force re-sync modes with confirmation before rewriting foundation artifacts.

- **Project lifecycle parity**
  - Added project commands for `build`, `start`, `lint`, and `format`.
  - Production start tracks existing server terminals and asks before replacing a running dev session.

- **Module maintenance parity**
  - Added upgrade, diff, checkpoint, rollback, and uninstall flows.
  - Module selection reads from project `registry.json` with manual slug fallback.
  - Destructive actions support dry-run first and modal confirmation before apply.

- **Test coverage**
  - Added vitest suites for infra, foundation, project lifecycle stages, and module maintenance command dispatch.

## Validation

```bash
npm run compile
npm run lint
vitest run
```

Release posture: `cli-parity-and-workspace-command-surface`
