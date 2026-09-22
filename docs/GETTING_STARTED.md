# Getting started with Workspai for VS Code

<!-- WORKSPAI:CLI-RELEASE-POLICY:START -->

> Extension 0.48.0 · verified with Workspai CLI 0.77.0 · minimum compatible CLI 0.77.0

<!-- WORKSPAI:CLI-RELEASE-POLICY:END -->

Workspai helps people and AI tools understand and change the same workspace
using a shared model, graph, health evidence, and verification loop.

## What you need

- VS Code 1.106.0 or newer
- Git when you want change, impact, or `--since` evidence

The extension executes the Workspai CLI selected by its canonical release
policy. The first run downloads that exact npm package into extension storage,
checks its integrity, and reuses the cached copy offline. A global CLI and a
separate Node.js installation are not required for Create, adopt, Doctor,
Graph, Agent, or Goal flows.

Python is **not required** for the extension, Workspace Intelligence, or
non-Python projects. RapidKit Core and Python 3.10+ are optional and only needed
for Python-backed kits or modules.

## Install

1. Install **Workspai** from the VS Code Marketplace.
2. Run **Workspai: Open Setup & Recovery**. The runtime row should confirm the
   CLI version verified for this extension. Optional language runtimes are
   evaluated against the active workspace, not treated as universal
   requirements.

3. Optional: install the CLI when you also want terminal access:

   ```bash
   npm install -g workspai@0.77.0
   workspai --version
   ```

The global install is a separate download for your terminal. Extension
commands stay on the verified package cached in extension storage.

## Understand a public repository first

Open **Analyze Repo**, paste a public GitHub, GitLab, or Bitbucket repository
URL, and select **Analyze**. Workspai creates an isolated shallow copy and
projects canonical Model, Graph, readiness, connected-surface, and bounded
retrieval evidence without installing dependencies or running repository code.

See [Analyze Repo](./REPOSITORY_ANALYSIS.md) for the evidence, cache, and safety
boundaries.

To assess a local working tree before handing it to an agent, open **Review
Changes**. It combines the Git comparison with CLI-authored impact, freshness,
and verification evidence without running project scripts automatically. See
[Review Changes](./REVIEW_CHANGES.md) for its scope and evidence boundaries.

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

The adopted repository receives portable consumer artifacts under `.workspai/`
and generated agent Skills under `.agents/skills/` when repository state permits
that mirror. The project entry records readiness and points to a bounded
project-owned Graph artifact whose hash and source freshness are validated by
the extension. The owning workspace keeps the complete aggregate Model and
Graph; project artifacts are scoped projections, not competing canonical
graphs. Existing authored `.agents` content is preserved and unsafe symlink or
path escapes are rejected.

## Create a project

From **Create**, choose manual creation or describe the project to a model. Both
paths resolve the same canonical kit contract.

Free-form Create messages pass through an intent router before planning. It is
grounded in the selected target and canonical workspace architecture, so it can
answer Create questions, request one focused clarification, open adopt/import,
or offer an explicit handoff to governed Agent for changes to existing source.
Only a high-confidence creation request reaches the plan preview, and no
filesystem mutation occurs until that plan is approved.

For model-driven creation, Workspai exposes a bounded capability lifecycle:

1. inspect the portable Create context;
2. read the canonical executable framework and kit contract;
3. evaluate architecture choices when the user delegates them;
4. submit one non-mutating plan proposal;
5. bind approval to the immutable plan, session, and selected scope;
6. execute workspace/project creation through one controller-owned operation;
7. synchronize Workspace Intelligence and refresh the project surface.

The model decides what should be proposed. It cannot call raw filesystem,
package-manager, workspace, project, or synchronization mutations. After the
user approves the visible plan, the extension executes the deterministic
sequence through its verified Workspai runtime. Failed retryable operations can
reuse only that same authorized plan; changing the scope or plan requires a new
proposal and approval.

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

Create intentionally stops at that synchronized foundation. It does not
silently run host dependency initialization or claim that Doctor, Analyze,
Readiness, and strict verification passed. Use **Initialize dependencies** on a
created workspace when you want the explicit `workspai bootstrap --profile ...`
operation. Node-, Go-, Java-, and .NET-only profiles never install the optional
workspace Python engine. The extension derives these profile, kit, runtime, and
lifecycle decisions from the CLI-published Create capability contract rather
than maintaining a second execution matrix.

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
agent instructions and evidence-selected Skills tell the model how to query
bounded Graph evidence and which operational workflows the repository can
actually justify. Users do not need to paste the entire Graph into prompts, and
irrelevant Skills are recorded as suppressed rather than presented as valid.

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
