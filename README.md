# Workspai for VS Code

<div align="center">

### Workspace Intelligence for VS Code

One workspace. One truth. Humans and AI aligned.

Workspai is the VS Code surface for RapidKit, making shared workspace understanding visible and actionable inside the IDE.

[![Version](https://img.shields.io/visual-studio-marketplace/v/rapidkit.rapidkit-vscode?style=flat-square\&color=6C5CE7)](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/rapidkit.rapidkit-vscode?style=flat-square\&color=00CFC1)](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
[![npm](https://img.shields.io/npm/v/rapidkit?style=flat-square\&color=CB3837\&label=rapidkit)](https://www.npmjs.com/package/rapidkit)

[Install](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode) · [Docs](https://www.workspai.com/) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/rapidkitlabs/rapidkit-vscode/issues)

</div>

---

## At a glance

Workspai is the VS Code surface for RapidKit workspace intelligence.

The name comes from Workspace + Intelligence: the IDE surface where RapidKit's shared workspace understanding becomes visible and actionable.

Instead of treating AI as a file-level assistant, Workspai operates on the workspace itself — projects, dependencies, architecture, operational context, evidence, and release readiness.

Developers, CI pipelines, IDEs, and AI agents all work from the same workspace model and shared source of truth.

Workspai supports:

* Backend services
* Frontend applications
* Imported repositories
* Polyglot workspaces
* Workspace-aware AI workflows

| You get                    | Why it matters                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| **Workspace intelligence** | Model, context, diff, impact, and verification operate on the entire workspace               |
| **Enterprise dashboard**   | Home, Run, Repair, Artifacts, Project, and Library surfaces with contextual actions          |
| **Incident evidence loop** | Commands generate evidence, Studio resolves blockers, and verify refreshes the dashboard     |
| **Sidebar control plane**  | Workspaces, projects, modules, health, contracts, and operational state                      |
| **Workspai Studio**        | Sidebar-first diagnosis, repair workflows, patch review, verify, and audit visibility        |
| **Canonical CLI bridge**   | Delegates to `rapidkit` npm CLI for adoption, creation, lifecycle, governance, and CI operations |

### What this is not

Workspai is **not** another AI coding assistant.

It is **not** another agent framework.

It is **not** another context window.

Workspai is the VS Code surface for **Workspace Intelligence for software systems**: a shared operating model where humans, CI, IDEs, and AI agents see the same workspace truth before making changes.

### The operating loop

The main workflow is intentionally simple:

```mermaid
flowchart LR
  Dashboard["Dashboard evidence"]
  Studio["Studio fix"]
  Verify["Verify"]
  Refresh["Artifact refresh"]
  Context["Agent context"]

  Dashboard --> Studio
  Studio --> Verify
  Verify --> Refresh
  Refresh --> Context
  Context --> Dashboard
```

Run generates or refreshes evidence. Repair routes blockers into Studio. Verify proves whether the fix worked. Refreshed artifacts update the dashboard and the context agents receive.



### The two-layer model

RapidKit does **not** pretend every framework is a native kit. The product strategy is:

```text
First-class engine kits  →  FastAPI and NestJS (modules + deep generation)
Workspace Intelligence   →  every stack in the workspace
```

That means FastAPI, NestJS, Next.js, Vite, Angular, Go, Spring Boot, .NET, and adopted repos are **first-class workspace citizens** — observable, governable, and agent-ready. The difference is generation depth: FastAPI and NestJS have deep RapidKit module generation; other stacks use native ecosystem workflows while still receiving workspace intelligence, governance, artifacts, and agent grounding.

```mermaid
flowchart TB
  subgraph Consumers["Consumers"]
    Dev["Developer in VS Code"]
    CI["CI / release gates"]
    Agents["AI agents"]
  end

  subgraph Workspai["Workspai VS Code Extension"]
    Sidebar["Sidebar: Workspaces · Projects · Modules · Health · Graph"]
    Dashboard["Dashboard: Home · Run · Repair · Artifacts · Project · Library"]
    Studio["Secondary sidebar: Create · Advisor · Studio"]
  end

  subgraph CLI["RapidKit npm CLI"]
    Gov["Governance: sync · doctor · analyze · pipeline · readiness"]
    Intel["Intelligence: model · context · diff · impact"]
    Ops["Project ops: adopt · import · project commands"]
  end

  subgraph Artifacts["Shared workspace artifacts"]
    Reports[".rapidkit/reports/*"]
    Contract["workspace.contract.json"]
    Markers["workspace + project markers"]
  end

  subgraph Policy["Two-layer stack policy"]
    Kits["Engine kits: FastAPI · NestJS + modules"]
    Polyglot["Intelligence: frontend · Go · Java · .NET · adopted repos"]
  end

  Dev --> Workspai
  Workspai --> CLI
  CLI --> Artifacts
  Artifacts --> CI
  Artifacts --> Agents
  Kits -.-> Ops
  Polyglot -.-> Ops
```

---

## Product surfaces

### Enterprise dashboard

<p align="center">
  <img src="media/readme/dashboard.png" alt="Workspai enterprise dashboard" width="92%" />
</p>

The dashboard is the primary operating surface for v0.35+:

- **Home** — workspace summary, onboarding, and quick orientation
- **Run** — generate and refresh governance, intelligence, and release evidence
- **Repair** — one safe path through active blockers, Studio handoff, verify, and audit
- **Artifacts** — doctor, analyze, pipeline, readiness, and release records
- **Project** — project actions, module browser, and capability-aware controls
- **Library** — recent workspaces, starter templates, and module catalog browse

Commands dispatch through contract-aware bridges so the UI only offers actions the active workspace or project actually supports.

### Incident evidence loop

<p align="center">
  <img src="media/readme/evidence-loop.png" alt="Command to evidence to next step loop" width="88%" />
</p>

Workspai closes the ops loop inside the IDE:

1. Run a governed command (`doctor`, `analyze`, `pipeline`, archive, release, …)
2. Read structured evidence from `.rapidkit/reports/*`
3. Open Repair or Studio with the exact blocker, artifact, and verify context
4. Apply or guide the smallest safe fix, then run verify
5. Return the refreshed truth to the dashboard and agent context

### Sidebar control plane

<p align="center">
  <img src="media/readme/sidebar.png" alt="Workspai sidebar control plane" width="52%" />
</p>

Everyday operations stay one click away:

| Panel | Purpose |
|-------|---------|
| **Quick Actions** | Minimal command launcher for `Dashboard / Create / Advisor / Studio / Doctor` |
| **Workspai** | AI sidebar with `Create with AI / Workspace Advisor / Studio` tabs, including a live creation timeline, architecture prompts, and Studio handoff |
| **Workspaces** | Switch and manage RapidKit workspaces |
| **Projects** | Select a project; lifecycle menus respect CLI capabilities |
| **Available Modules** | Browse and install modules for supported backends |
| **Workspace Health** | Doctor evidence without an extra CLI call |
| **Contract Graph** | Services, ports, dependencies, events, and ownership |

### Workspai Studio

<p align="center">
  <img src="media/readme/incident-studio.png" alt="Workspai Studio sidebar incident workflow" width="92%" />
</p>

Workspai Studio is the sidebar-first workspace-aware repair environment:

- Root-cause analysis with scoped workspace/project context
- Handoff from dashboard cards with blocker, artifact, and verify context
- Run-once, fix, explain, and verify-only modes based on the active blocker
- Patch review and rollback hints before mutating code
- Ship loop: analyze → verify-gates → readiness → archive
- CLI surface with allowlisted RapidKit commands and mutation gates
- Visible failure, verify, and audit states without relying on developer console output

---

## Stacks, kits, and module policy

Workspai supports the same polyglot surface as the RapidKit CLI:

| Layer | Stacks | What you get |
|-------|--------|--------------|
| **Engine kits + modules** | FastAPI, NestJS | Scaffold, lifecycle, RapidKit module marketplace |
| **Backend intelligence** | Spring Boot, Go (Fiber/Gin), .NET, Express, Django, and more | Adopt, import, detect, lifecycle, evidence, agent context |
| **Frontend intelligence** | Next.js, Remix, Vite (React/Vue/Svelte/Solid), Nuxt, Angular, Astro, SvelteKit | Official generators, adopt/import, workspace model, evidence, agent context |

RapidKit modules remain Core-backed templates for **FastAPI** and **NestJS** only. Frontend and extended backend stacks are fully supported through **Workspace Intelligence** — not through pretending they share the same module runtime.

Capability gating is driven by the canonical CLI:

```bash
npx rapidkit project commands --json
npx rapidkit workspace model --json
npx rapidkit workspace context --for-agent --json
```

The extension uses those surfaces for dashboard buttons, sidebar menus, module install guards, and AI context.

---

## Quick start

### 1. Install

[Install from the Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode), then reload VS Code.

### 2. Verify the RapidKit CLI bridge

Workspai uses the canonical RapidKit npm CLI for enterprise workflows. Install or update it before running create, adopt, governance, Repair, or Studio actions:

```bash
npm install -g rapidkit@latest
rapidkit --version --json
rapidkit commands --json
```

Workspai checks the linked RapidKit CLI capability surface before enterprise workflows run.

### 3. Open the dashboard

```text
Workspai: Open Dashboard
```

### 4. Create or import a workspace

```text
Workspai: Create Workspace
Workspai: Import Workspace
```

### 5. Add a project

```text
Workspai: Create Project
```

Or adopt an existing repo into the active workspace:

```text
Workspai: Adopt Project
```

### 6. Verify the environment

```text
Workspai: Run System Check
```

### CLI equivalents

```bash
npx rapidkit doctor workspace
npx rapidkit init
npx rapidkit dev
npx rapidkit test
npx rapidkit pipeline --json --strict
npx rapidkit add module <module-slug>   # FastAPI / NestJS only
```

---

## AI tools

Workspai AI features use the language models available in your VS Code environment (for example GitHub Copilot models where enabled).

| Tool | Purpose |
|------|---------|
| **Create with AI** | Plan and create a workspace from intent |
| **AI Project Builder** | Scaffold a project inside the active workspace |
| **Incident Studio** | Diagnose, explain, and repair with scoped evidence |
| **Fix Preview** | Review the smallest safe patch before applying changes |
| **Change Impact** | Understand blast radius and rollout risk |
| **Terminal Bridge** | Turn terminal failures into structured next steps |
| **Workspace Memory** | Keep local conventions aligned across AI answers |

---

## Workspace operations

| Surface | What it does |
|---------|--------------|
| **Doctor** | Workspace and project readiness checks |
| **Graph** | Service, dependency, event, and port topology |
| **Analyze** | Architecture and health analysis with scoped reports |
| **Pipeline** | Governance pipeline with strict JSON verdict |
| **Test** | Run the selected workspace/project test path |
| **Archive / Export** | Package a workspace for handoff |
| **Verify Archive** | Integrity check before sharing |
| **Release** | Autopilot release gate and readiness evidence |
| **Terminal** | Open a terminal at workspace or project root |

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+R Ctrl+Shift+W` | Create Workspace |
| `Ctrl+Shift+R Ctrl+Shift+P` | Create Project |
| `Ctrl+Shift+R Ctrl+Shift+M` | Add Module |
| `Ctrl+Shift+R Ctrl+Shift+D` | Debug with AI |

---

## Requirements

| Tool | Version |
|------|---------|
| VS Code | 1.100+ |
| Node.js | 18+ |
| RapidKit npm CLI | Latest recommended for enterprise Dashboard, Repair, Studio, create, and adopt workflows |
| Python | 3.10+ for FastAPI projects |
| Go | 1.21+ for Go projects |
| Java | 17+ for Spring Boot projects |

Run `Workspai: Run System Check` to verify local tooling.

---

## Ecosystem

| Component | Role |
|-----------|------|
| [rapidkit-vscode](https://github.com/rapidkitlabs/rapidkit-vscode) | Workspai VS Code extension |
| [rapidkit npm CLI](https://www.npmjs.com/package/rapidkit) | Workspace and project CLI bridge |
| [rapidkit-core](https://pypi.org/project/rapidkit-core/) | Python generation engine and module runtime |
| [rapidkit-examples](https://github.com/rapidkitlabs/rapidkit-examples) | Starter and reference workspaces |

---

## Troubleshooting

**Extension sidebar is empty or a panel says “no data provider”**

Run `npm run compile` if you are developing locally, then `Developer: Reload Window`. Check `Output → Log (Extension Host)` for activation errors.

**Project list flickers or selection resets after choosing a workspace**

Update to the latest build — workspace selection now deduplicates refresh and preserves project selection state.

**Dashboard does not refresh after changing workspace**

Run `Developer: Reload Window`, then `Workspai: Open Dashboard`.

**Module install is disabled**

Select a FastAPI or NestJS project in the Projects panel. Frontend and extended backend kits do not use the RapidKit module marketplace.

**Project creation or adopt fails**

Open `View → Output → Workspai`, inspect the command output, then run `Workspai: Run System Check`. Create and adopt workflows require a compatible `rapidkit` npm CLI; update with `npm install -g rapidkit@latest` when the CLI gate reports an older or missing version.

---

## Media assets

README illustrations live in [`media/readme/`](media/readme/). Marketplace capture guidance and real screenshot rules live in [`media/README.md`](media/README.md).

- README images are **current product mockups** aligned with the v0.35 design system.
- Marketplace hero screenshots should still be **real VS Code captures** once you recapture the latest dashboard and sidebar after local smoke testing.

---

## Links

[Documentation](https://www.workspai.com/) · [Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode) · [npm](https://www.npmjs.com/package/rapidkit) · [PyPI](https://pypi.org/project/rapidkit-core/) · [Issues](https://github.com/rapidkitlabs/rapidkit-vscode/issues) · [Changelog](CHANGELOG.md)

---

MIT © [Workspai](https://www.workspai.com)
