# Getting started with Workspai for VS Code

> Extension 0.35.0 · compatible with Workspai CLI 0.52.2+

Workspai helps people and AI tools understand and change the same workspace
using a shared model, graph, health evidence, and verification loop.

## What you need

- VS Code 1.106.0 or newer
- Workspai CLI 0.52.2 or newer
- Node.js supported by the installed Workspai CLI
- Git when you want change, impact, or `--since` evidence

Python is **not required** for the extension, Workspace Intelligence, or
non-Python projects. RapidKit Core and Python 3.10+ are optional and only needed
for Python-backed kits or modules.

## Install

1. Install **Workspai** from the VS Code Marketplace.
2. Install or update the CLI:

   ```bash
   npm install -g workspai@latest
   workspai --version
   ```

3. Run **Workspai: Open Setup & Recovery**. The CLI row should show the detected
   version. Optional runtimes are evaluated against the active workspace, not
   treated as universal requirements.

## Start with a workspace

Open the Workspai secondary sidebar and select **Create**.

You can:

- create a workspace;
- create a project from the canonical kit catalog;
- add an existing local project or Git repository;
- import a Workspai workspace or archive.

The same flow is available from the terminal:

```bash
workspai create
```

If you are already inside an existing project and want the managed default
workspace, the shortest path is:

```bash
npx workspai adopt .
```

Workspai creates or resolves the workspace, registers the project, writes the
project-to-workspace link, and synchronizes consumer context. You can continue
working from the project directory; the CLI resolves the owning workspace
without requiring you to remember its path.

## Create a project

From **Create**, choose manual creation or describe the project to a model. Both
paths resolve the same canonical kit contract.

The current catalog covers backend, frontend, desktop, and extension projects,
including FastAPI, NestJS, Spring Boot, Go, .NET, Next.js, React, Vue, Angular,
Nuxt, Astro, SvelteKit, Rust Axum, Laravel, Electron, Tauri, and VS Code
extensions.

Terminal examples:

```bash
npx workspai create project nextjs my-web
npx workspai create project nestjs.standard my-api
npx workspai create project desktop.tauri my-desktop
```

After create, adopt, or import, Workspai refreshes the workspace model, graph,
agent context, and related consumer surfaces.

## Use the Dashboard

Run **Workspai: Open Dashboard**. Its sections have explicit scope:

- **Home** — current workspace summary and next useful action
- **Run** — project and workspace lifecycle commands
- **Repair** — blockers, Doctor findings, and governed remediation
- **Artifacts** — reports, contracts, receipts, and evidence
- **Graph** — relationships, proof paths, changes, and impact
- **Project** — selected-project actions and evidence
- **Library** — kits, modules, workspaces, and reusable resources

A missing artifact is shown as missing or stale. It is never presented as a
successful result.

## Use the Assistant

The secondary sidebar Assistant supports three modes:

| Mode      | What it does                                                                    |
| --------- | ------------------------------------------------------------------------------- |
| **Ask**   | Reads bounded workspace context and explains without changing source.           |
| **Plan**  | Investigates the task and produces a grounded implementation plan.              |
| **Agent** | Changes source, runs scoped checks, reviews the diff, and verifies the outcome. |

Agent mode works for ordinary requests and blocker cards. Examples:

- “Prepare this workspace for release.”
- “Fix dependency vulnerabilities without a breaking upgrade.”
- “Raise test coverage to 75% and keep the build green.”

For dependency changes, Studio does not treat a manifest edit as completion. It
must reconcile the lockfile and installed tree, rerun the focused audit, run
declared tests/build, refresh Workspace Intelligence, and verify current
evidence. “No direct automatic fix” moves Agent mode into guarded source
investigation; it does not immediately stop the session. Studio first inspects
the runtime-owned manifest, lock/baseline, transitive advisory path, and
compatible owner or constraint options. Breaking, forced, downgrade,
destructive, external, or policy-exception choices remain explicit review
boundaries.

## The governed loop

The canonical loop is:

```text
Understand → Change → Evidence → Gate → Ground → Distribute → Explain
```

Run it directly when you need a machine-readable receipt:

```bash
npx workspai workspace intelligence run \
  --for-agent generic \
  --strict \
  --json
```

Use a supported agent identifier when targeting a specific consumer. Generated
agent instructions tell the model how to query bounded graph evidence; users do
not need to paste the entire graph into prompts.

## Health and verification

```bash
# Workspace health
npx workspai doctor workspace

# Project health, from the project directory
npx workspai doctor project

# Lifecycle stages
npx workspai workspace run test --strict
npx workspai workspace run build --strict
```

Doctor reports live under the owning workspace's `.workspai/reports/`
directory. Project-scoped evidence retains project identity even when the
project is external to the workspace directory.

## Troubleshooting

### CLI is installed but Setup cannot find it

Run **Workspai: Open Setup & Recovery** and choose **Verify**. The extension
checks direct, global npm, NVM/FNM/asdf, and npx-compatible discovery paths.
Reload the window after changing your Node version manager.

### RapidKit Core shows an upgrade in a non-Python workspace

Core is optional. Minimal and non-Python workspaces should not show an upgrade
action unless they declare a Python-backed kit/module or a valid workspace-local
Core environment.

### A repair remains blocked

Open the session activity. A blocked result means current evidence still rejects
completion, a required runtime tool is missing, or the remaining change crosses
a review boundary. Studio must not replace that state with a success message.

## Learn more

- [Workspai Learn](https://www.workspai.dev/)
- [CLI documentation](https://www.workspai.dev/learn/cli)
- [GitHub](https://github.com/chistiq/rapidkit-vscode)
- [Issues](https://github.com/chistiq/rapidkit-vscode/issues)
