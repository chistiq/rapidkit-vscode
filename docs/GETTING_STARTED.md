# Getting Started with RapidKit Extension

> Extension v0.27.0 · CLI v0.27.3

## Prerequisites

### Required
- **Python 3.10 – 3.13** with venv support
- **Node.js 20.19.6+** (required by rapidkit CLI)
- **Git** (required for `--since` flag in workspace run)

### Auto-installed by the extension
- **rapidkit-core** – Python generation engine (installed in an isolated workspace environment)
- **Workspace Python environment** – configured through the selected strategy (Poetry / pip+venv / pipx)

---

## Step 1 — Install Python

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install python3.13 python3.13-venv
```

**macOS:**
```bash
brew install python@3.13
```

**Windows:** Download from [python.org/downloads](https://python.org/downloads) — choose "Add to PATH" during install.

Verify:
```bash
python3 --version   # must be 3.10 or higher
python3 -m venv --help
```

---

## Step 2 — Install the Extension

1. Open VS Code → Extensions (`Ctrl+Shift+X`)
2. Search **Workspai** (publisher: RapidKit)
3. Click **Install**

After install the Welcome panel opens automatically. It shows the **Setup Wizard** — two cards that track whether the npm CLI and Python Core are ready.

---

## Step 3 — Create Your First Workspace

```
Ctrl+Shift+P → Workspai: Create Workspace
```

Fill in: workspace name, location, author. Then wait 30–60 s for first-time setup:

```
⬇  Downloading rapidkit CLI (npm)
🐍  Creating Python virtual environment (Poetry)
📦  Installing rapidkit-core
✅  Validating workspace
```

Subsequent runs take ~5–10 s (npm cache + venv reuse).

CLI equivalents (both are valid):
```bash
# Explicit command
npx workspai create workspace my-workspace

# Direct workspace shortcut
npx workspai my-workspace
```

Interactive wizard flow during workspace creation:
- Profile selection: `minimal`, `java-only`, `python-only`, `node-only`, `go-only`, `polyglot`, `enterprise`
- Python version selection (3.10+)
- Environment strategy selection: Poetry / pip with venv / pipx

---

## Step 4 — Create Your First Project

```
Ctrl+Shift+P → Workspai: Create Project
```

Choose a framework:
- **FastAPI** (Python) — REST APIs, async, OpenAPI auto-docs
- **NestJS** (TypeScript) — modular Node.js backend
- **Spring Boot** (Java) — REST + JPA + Maven
- **Go/Fiber** (Go) — high-performance HTTP services
- **Go/Gin** (Go) — minimal routing-focused services

The extension generates the project, installs its dependencies, and opens the folder.

CLI interactive flow after entering workspace:
```bash
cd my-workspace
npx workspai create project
```

CLI direct kit flow (non-interactive):
```bash
npx workspai create project fastapi.standard my-api --yes --skip-install
npx workspai create project fastapi.ddd my-api --yes --skip-install
npx workspai create project nestjs.standard my-nest --yes --skip-install
npx workspai create project springboot.standard my-spring --yes --skip-install
npx workspai create project gofiber.standard my-fiber --yes --skip-install
```

---

## Step 5 — Run the Doctor

Verify everything is healthy after setup:

```
Ctrl+Shift+P → Workspai: Check Health (Doctor)
```

Or from the terminal:

```bash
# Full workspace-level health check
npx workspai doctor workspace

# Project-level health check (run inside a project folder)
npx workspai doctor project
```

The extension surfaces both scopes. In the sidebar, right-click any workspace → **Check Health (Doctor)**, or right-click a project → **Project Health Check (Doctor)**.

---

## Key Features (v0.27.0)

### Workspace Run — Fleet Stage Execution

Run lifecycle stages across all projects in a workspace fleet:

```bash
npx workspai workspace run init    # set up all projects
npx workspai workspace run test    # run all test suites
npx workspai workspace run build   # build all projects
npx workspai workspace run start   # start all services
```

From the extension, use the Command Palette or right-click the workspace tree:
```
Workspai: Workspace Run: Init
Workspai: Workspace Run: Test
Workspai: Workspace Run: Build
Workspai: Workspace Run: Start
```

A **flag picker** appears for each run command. Available flags:

| Flag | Purpose |
|------|---------|
| `--affected` | Run only projects changed since last run |
| `--blast-radius` | Include downstream dependents of changed projects |
| `--parallel` | Execute projects concurrently |
| `--since <git-ref>` | Limit affected detection to commits after this ref |
| `--max-workers <n>` | Cap parallel workers (positive integer) |
| `--continue-on-error` | Don't stop fleet on first failure |
| `--strict` | Treat warnings as errors |
| `--no-gates` | Skip quality gates |
| `--json` | Machine-readable output |

### AI Workspace Command Center

A single hub for every AI-powered operation. Open it from:
```
Ctrl+Shift+P → Workspai: AI Workspace Command Center
```

24 commands organized in three categories:
- **Workspace Navigation** – open/copy/export workspace actions
- **Workspace Health** – workspace and project doctor entry points
- **Workspace Governance** – bootstrap/setup, workspace run, policy, cache, mirror

### AI Incident Studio

Available in the Welcome panel under **AI Features**. Shows live telemetry from the last doctor run, including:
- **Doctor Treatment Timeline** – trend badge (improving / regressing / stable), scope badge, regression and improvement signals, traceability coverage rate
- **Incident analysis** – cross-project health summary

### Project Health Check (Doctor)

Scoped health check for a single project (separate from workspace-level doctor):

```bash
# inside project root
npx workspai doctor project
```

From the extension:
```
Ctrl+Shift+P → Workspai: Project Health Check (Doctor)
```

Choose **Check** (read-only report) or **Fix** (auto-remediation). Evidence file is written to `.workspai/reports/doctor-project-last-run.json` inside the project.

---

## Architecture Overview

```
VS Code Extension  (UI, commands, tree views)
       │
       ▼
npx workspai       (auto-downloaded via npx cache)
       │
       ▼
Poetry / venv      (isolated per workspace)
       │
       ▼
rapidkit-core      (Python engine, installs inside venv)
       │
       ▼
Your Projects      (FastAPI, NestJS, …)
```

- The **extension** provides VS Code integration and surfaces all commands visually.
- The **npm package** is the cross-platform CLI; installed once in npx cache or globally.
- **Python Core** lives inside each workspace's venv — zero system pollution.

---

## CLI Quick Reference

```bash
# Root usage / quick shortcut
npx workspai <workspace-name> [options]

# Guided create flow (prompts: workspace | project)
npx workspai create

# Workspace management
npx workspai create workspace <name> [--profile <profile>] [--yes]
npx workspai bootstrap [--profile <profile>] [--json]
npx workspai setup <python|node|go|java> [--warm-deps]
npx workspai readiness [--json] [--strict]
npx workspai workspace list
npx workspai workspace share [--output <file>] [--include-paths] [--no-doctor]
npx workspai workspace policy show
npx workspai workspace policy set <key> <value>
npx workspai workspace init

# Doctor (health checks)
npx workspai doctor
npx workspai doctor workspace
npx workspai doctor project

# Fleet stage execution
npx workspai workspace run init   [flags]
npx workspai workspace run test   [flags]
npx workspai workspace run build  [flags]
npx workspai workspace run start  [flags]

# Project scaffolding
npx workspai create project
npx workspai create project fastapi.standard <name> [--yes] [--skip-install]
npx workspai create project nestjs.standard <name> [--yes] [--skip-install]
npx workspai create project springboot.standard <name> [--yes] [--skip-install]
npx workspai create project gofiber.standard <name> [--yes] [--skip-install]
```

Useful workspace creation options:
```bash
-y, --yes
--author <name>
--skip-git
--debug
--dry-run
--create-workspace
--no-workspace
--no-update-check
```

Pre-install globally to skip npx download overhead:
```bash
npm install -g workspai
```

---

## Troubleshooting

### "Python not found"
```bash
sudo apt install python3.13 python3.13-venv  # Ubuntu/Debian
brew install python@3.13                      # macOS
# Windows: download from python.org
```

### "python3-venv not available"
```bash
sudo apt install python3.13-venv   # match your Python version
python3 -m venv --help             # verify
```

### "RapidKit CLI download failed"
- Check internet connection, try again (npx retries automatically)
- Or pre-install globally: `npm install -g workspai`

### "Workspace validation failed"
```
Ctrl+Shift+P → Workspai: Check Health (Doctor)
```
Run this to get a detailed report. Fix any flagged items, then recreate the workspace if needed.

### Doctor returns stale results
Delete the evidence file and re-run:
```bash
rm .workspai/reports/doctor-last-run.json
npx workspai doctor workspace
```

---

## File Layout

```
<workspace-root>/
  .rapidkit/
    reports/
      doctor-last-run.json          ← workspace doctor evidence
  .rapidkit-workspace               ← workspace marker
  .venv/                            ← Poetry-managed Python env
  <project-name>/
    .rapidkit/
      reports/
        doctor-project-last-run.json ← project doctor evidence
    src/
    tests/
    pyproject.toml
```

---

> See also: [WHY_PYTHON_REQUIRED.md](./WHY_PYTHON_REQUIRED.md) · [WIZARD_VISUAL_GUIDE.md](./WIZARD_VISUAL_GUIDE.md)

## Understanding the Workspace Model

### Why Workspaces?

```
Workspace (dev environment)
  ├── Project 1 (FastAPI)
  ├── Project 2 (NestJS)
  └── Project 3 (FastAPI)
```

Benefits:
- Share RapidKit Core installation
- Organize related projects
- Consistent Python environment
- Easy to manage

### Alternative: Direct Project Creation

You can also create a project directly from the Command Palette:
```text
Workspai: Create Project
```
For CLI-first flows, use:
```bash
npx workspai create project <kit> <name> [--yes] [--skip-install]
```

## Next Steps After Setup

1. ✅ Workspace created
2. ✅ First project created
3. 📖 Read [Project Documentation](https://www.workspai.com/docs)
4. 🧩 Add modules: `Workspai: Add Module`
5. 🚀 Start dev server: `npx workspai dev`
6. 🎨 Customize your project

## Support

- 📚 [Documentation](https://www.workspai.com/docs)
- 💬 [GitHub Discussions](https://github.com/chistiq/rapidkit-vscode/discussions)
- 🐛 [Report Issues](https://github.com/chistiq/rapidkit-vscode/issues)
- 💡 [Feature Requests](https://github.com/chistiq/rapidkit-vscode/issues)

---

**Welcome to the RapidKit family! Happy coding! 🎉**
