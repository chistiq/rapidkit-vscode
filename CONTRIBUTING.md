# Contributing to Workspai for VS Code

Thank you for helping improve Workspai. This repository owns the VS Code user
experience; the Workspai CLI remains the source of truth for commands,
contracts, artifacts, and Workspace Intelligence semantics.

## Before you start

- Use Node.js 20.19 or newer.
- Use the package manager declared by the repository through Corepack.
- Use VS Code 1.106 or newer for extension-host testing.
- Discuss broad product or contract changes before implementation.
- Never include secrets, private workspace evidence, or local absolute paths in
  fixtures, screenshots, logs, or pull requests.

## Set up the repository

```bash
git clone https://github.com/chistiq/rapidkit-vscode.git
cd rapidkit-vscode
corepack npm install
code .
```

Press `F5` to open an Extension Development Host. Use a disposable Workspai
workspace when testing create, adopt, import, repair, or mutation flows.

## Architecture boundaries

```text
Workspai CLI contracts and artifacts
                ↓
extension host services and command routing
                ↓
primary sidebar · Dashboard · Create · Assistant/Studio
```

- `contracts/` and `src/contracts/` mirror canonical CLI/extension contracts.
- `src/core/` owns host-side orchestration, evidence readers, AI routing, and
  safety boundaries.
- `src/ui/treeviews/` owns primary sidebar workspace/project navigation.
- `src/ui/panels/` and `src/ui/webviews/` own Dashboard and webview bridges.
- `webview-ui/src/` owns Dashboard and secondary-sidebar presentation.
- `src/test/` protects command parity, scope, contracts, and repair behavior.

Do not invent a second command, artifact, project taxonomy, or repair contract
inside the extension. Change the canonical CLI contract first, synchronize it,
then update the consuming UI and tests.

## Make a focused change

1. Create a branch:

   ```bash
   git switch -c feat/short-description
   ```

2. Keep workspace and project scope explicit in commands and messages.
3. Preserve missing/stale/blocked evidence instead of rendering it as success.
4. Add or update focused tests with every behavioral change.
5. Update user documentation only when the public workflow changes.

For Agent or Studio changes, preserve these boundaries:

- a command exit code is not proof that source changed;
- dependency edits are incomplete until lock/install and focused checks close;
- generated evidence is refreshed through CLI producers, never patched by the
  model;
- only fresh non-blocking verification can complete a repair;
- guarded, destructive, external, or ambiguous actions require explicit review.

## Validate

Run the checks relevant to your change, then the full release path when the
change affects shared contracts or user-facing behavior:

```bash
corepack npm run validate:contracts
corepack npm run typecheck
corepack npm test
corepack npm run lint
corepack npm run build
```

Use `corepack npm run sync:shared-contracts` or
`corepack npm run sync:palette-surface` only when the canonical source changed;
review the generated diff before committing it.

## Pull requests

Include:

- the user problem and intended outcome;
- affected workspace/project scope;
- contract or artifact changes;
- tests and commands run;
- screenshots or recordings for visible UI changes;
- compatibility, migration, and rollback notes when relevant.

Keep pull requests focused. Do not combine unrelated refactors, generated
artifacts, or formatting churn with a product change.

## Documentation

- [`README.md`](README.md) is the concise Marketplace story.
- [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) is the current user flow.
- [`docs/COMMAND_SURFACE_AUDIT.md`](docs/COMMAND_SURFACE_AUDIT.md) records
  extension/CLI command boundaries.
- [`RELEASE_NOTES.md`](RELEASE_NOTES.md) and `releases/` preserve version history.

Historical release documents may contain old product names and commands. Mark
archival files clearly; do not copy their instructions into current docs.

## Community and support

- [Discord](https://www.workspai.com/discord)
- [GitHub Discussions](https://github.com/chistiq/rapidkit-vscode/discussions)
- [Issues](https://github.com/chistiq/rapidkit-vscode/issues)

Be respectful, provide reproducible context, and redact private workspace data.
