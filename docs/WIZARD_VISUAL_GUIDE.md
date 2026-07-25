# Setup Wizard & UI Visual Guide

> Extension v0.27.0 · CLI v0.27.3

This guide describes the visual layout and behavior of every interactive surface in the RapidKit extension — from the first-run setup wizard through the AI Incident Studio and fleet run commands.

---

## 1. Welcome Page Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                      🚀 RapidKit Logo                            │
│                      RapidKit v0.27.0                            │
│           Build production-ready APIs at warp speed              │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                   🚀 Setup Wizard                                │
│         Complete installation to unlock all features             │
│                                                                  │
│  ┌───────────────────────┬───────────────────────────────────┐  │
│  │  📦 npm Package       │  🐍 Python Core                   │  │
│  │  Status: ✓ Installed  │  Status: ⚠ Not installed          │  │
│  │  ───────────────────  │  ───────────────────────────────  │  │
│  │  v0.27.3 installed    │  Python 3.13.2 detected           │  │
│  │  /usr/local/bin/npm   │  but rapidkit-core not installed  │  │
│  │                       │                                   │  │
│  │                       │  [⚡ Install Core]  [🐍 PyPI]     │  │
│  └───────────────────────┴───────────────────────────────────┘  │
│                                                                  │
│  ⚡ 1/2 components installed. Install the missing one.           │
│  [🔄 Refresh]  [✕ Hide]  [✓ Finish Setup] (disabled)            │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                🚀 Create Your First Workspace            │   │
│  │      Organize multiple microservices in one environment  │   │
│  │                   [GET STARTED]                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Quick Actions:                                                  │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐       │
│  │ FastAPI  │ NestJS   │ Modules  │ Doctor   │ AI Hub   │       │
│  │ Python   │TypeScript│ 27+ Free │ Workspace│ Commands │       │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘       │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                   🌐 RapidKit Ecosystem                          │
│                                                                  │
│  ┌──────────────┬──────────────┬──────────────┐                 │
│  │ 🎨 VS Code   │ 📦 npm CLI   │ 🐍 Python    │                 │
│  │ Extension    │ Package      │ Core Engine  │                 │
│  │ THIS         │ CLI          │ ENGINE       │                 │
│  │ Visual UI    │ Automation   │ Generator    │                 │
│  │ [Marketplace]│ [Install CLI]│ [PyPI Page]  │                 │
│  │              │ [View Docs]  │ [Install]    │                 │
│  └──────────────┴──────────────┴──────────────┘                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Setup Wizard States

### Both Installed (All Green)
```
┌────────────────────────────────────────┐
│ 📦 npm Package          ✓              │  ← Green border
│ v0.27.3 installed                      │  ← Green background tint
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ 🐍 Python Core          ✓              │  ← Green border
│ v0.27.x (Python 3.13.2)                │  ← Green background tint
└────────────────────────────────────────┘

Progress: "🎉 All components installed! Ready to create workspaces."
Button: [✓ Finish Setup] (enabled, green)
```

### Partially Installed (Mixed)
```
┌────────────────────────────────────────┐
│ 📦 npm Package          ✓              │  ← Green border
│ v0.27.3 installed                      │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ 🐍 Python Core          ⚠              │  ← Orange border
│ Python 3.13.2 detected                 │  ← Orange background tint
│ but rapidkit-core not installed        │
│ [⚡ Install Core] [🐍 PyPI]            │
└────────────────────────────────────────┘

Progress: "⚡ 1/2 components installed. Install the missing one."
Button: [✓ Finish Setup] (disabled, gray)
```

### Nothing Installed (All Orange)
```
┌────────────────────────────────────────┐
│ 📦 npm Package          ⚠              │  ← Orange border
│ CLI not installed                      │  ← Orange background tint
│ [⚡ Install CLI] [📄 Docs]             │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ 🐍 Python Core          ⚠              │  ← Orange border
│ Python not detected                    │  ← Orange background tint
│ Install Python 3.10+ first             │
│ [🔧 Install Core] [🐍 PyPI]           │
└────────────────────────────────────────┘

Progress: "⏳ 0/2 components installed. Click install buttons above."
Button: [✓ Finish Setup] (disabled, gray)
```

### Checking Status (Loading)
```
┌────────────────────────────────────────┐
│ 📦 npm Package          ⏳             │  ← Gray border
│ Checking installation status...        │  ← Spinning loader
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ 🐍 Python Core          ⏳             │  ← Gray border
│ Checking installation status...        │  ← Spinning loader
└────────────────────────────────────────┘

Progress: "Checking installation status..."
```

---

## 3. Wizard Button Actions

| Button | Visible when | What happens |
|--------|-------------|--------------|
| `[⚡ Install CLI]` | npm not found | Opens terminal, runs `npm install -g workspai` |
| `[⚡ Install Core]` | Python found, core missing | Opens terminal, runs Poetry install inside workspace |
| `[🔧 Install Core]` | Python not found | Shows install guide for Python 3.10+ |
| `[🔄 Refresh]` | Always | Re-runs 4-method detection, updates status cards |
| `[✕ Hide]` | Always | Collapses wizard, saves state, won't reshow on next launch |
| `[✓ Finish Setup]` | Both components ready | Marks setup as complete in the welcome flow and hides the wizard |

---

## 4. Workspace Run — Flag Picker

When you trigger a fleet stage command (Init / Test / Build / Start) from the Command Palette or the sidebar context menu, a **flag picker QuickPick** appears.

```
┌─────────────────────────────────────────────────────────┐
│  Select flags for: workspace run test                    │
│  ─────────────────────────────────────────────────────  │
│  ☐  --affected           Only projects changed vs HEAD  │
│  ☐  --blast-radius       Include downstream dependents  │
│  ☐  --parallel           Run projects concurrently      │
│  ☐  --continue-on-error  Keep going if one project fails│
│  ☐  --strict             Warnings treated as errors     │
│  ☐  --no-gates           Skip quality gates             │
│  ☐  --json               Machine-readable JSON output   │
│  ─────────────────────────────────────────────────────  │
│  ✎  --since <git-ref>    (guided input)                 │
│  ✎  --max-workers <n>    (guided input)                 │
│                                                          │
│  [OK — Run with selected flags]                          │
└─────────────────────────────────────────────────────────┘
```

**Guided inputs** (appear after you check them):

`--since`:
```
┌──────────────────────────────────────────────┐
│  Enter git ref for --since                   │
│  e.g. HEAD~5, main, v0.26.0, abc1234         │
│  ────────────────────────────────────────── │
│  > main                                      │
└──────────────────────────────────────────────┘
```

`--max-workers`:
```
┌──────────────────────────────────────────────┐
│  Enter max parallel workers (positive int)   │
│  Limits concurrency when --parallel is set   │
│  ────────────────────────────────────────── │
│  > 4                                         │
└──────────────────────────────────────────────┘
```

Equivalent CLI commands:
```bash
npx workspai workspace run test --affected --parallel --since main --max-workers 4
npx workspai workspace run build --strict --no-gates
npx workspai workspace run start --continue-on-error --json
```

---

## 4.1 CLI Workspace Creation Wizard (Interactive)

The extension can drive these flows, but the underlying CLI interactive wizard looks like this:

```bash
npx workspai create workspace my-workspace
# or shortcut
npx workspai my-workspace
```

Wizard prompts sequence:

```
✔ Author name: rapidx
? Select workspace profile:
        1) minimal
        2) java-only
        3) python-only
        4) node-only
        5) go-only
        6) polyglot
        7) enterprise

? Select Python version for RapidKit:
        1) 3.13
        2) 3.12
        3) 3.11
        4) 3.10

? How would you like to manage the workspace environment?
        1) Poetry
        2) pip with venv
        3) pipx
```

Then setup runs in phases (environment detection, virtual environment setup, RapidKit installation, git init).

---

## 4.2 CLI Project Creation Wizard (Inside Workspace)

After workspace creation:

```bash
cd my-workspace
npx workspai create project
```

For direct non-interactive kit creation:

```bash
npx workspai create project fastapi.standard my-api --yes --skip-install
npx workspai create project nestjs.standard my-nest --yes --skip-install
npx workspai create project springboot.standard my-spring --yes --skip-install
npx workspai create project gofiber.standard my-fiber --yes --skip-install
```

---

## 5. AI Workspace Command Center

Open with: `Ctrl+Shift+P → Workspai: AI Workspace Command Center`

```
┌───────────────────────────────────────────────────────────┐
│  AI Workspace Command Center                              │
│  ─────────────────────────────────────────────────────── │
│  Type to filter 24 commands…                              │
│                                                           │
│  ── Navigation ────────────────────────────────────────   │
│    Jump to workspace root                                 │
│    Open workspace in new window                           │
│    Switch active project                                  │
│    …                                                      │
│                                                           │
│  ── Health ────────────────────────────────────────────   │
│    Run doctor — workspace scope                           │
│    Run doctor — project scope                             │
│    View last doctor report                                │
│    Compliance check                                       │
│    Drift detection                                        │
│    …                                                      │
│                                                           │
│  ── Governance ────────────────────────────────────────   │
│    Workspace run — init                                   │
│    Workspace run — test                                   │
│    Workspace run — build                                  │
│    Workspace run — start                                  │
│    Affected project analysis                              │
│    Audit trail                                            │
│    …                                                      │
└───────────────────────────────────────────────────────────┘
```

All 24 commands are filterable by name. Selecting a command executes the corresponding extension action directly — no need to remember exact command IDs.

---

## 6. Project Health Check (Doctor)

Separate from workspace-level doctor. Targets a single project folder.

**Command Palette entry**: `Workspai: Project Health Check (Doctor)`

First shows a scope picker:
```
┌──────────────────────────────────────────────┐
│  Project Health Check (Doctor) — choose action │
│  ─────────────────────────────────────────  │
│  ○  Check   Read-only health report         │
│  ○  Fix     Auto-remediate detected issues  │
└──────────────────────────────────────────────┘
```

After selection, output appears in the **RapidKit** output channel. Sensitive paths in `File:` and `Path:` lines are automatically redacted to `<project>/.workspai/reports/<filename>` format before display.

Evidence file: `.workspai/reports/doctor-project-last-run.json`

**Doctor Treatment Timeline** in the AI Incident Studio reads this file and displays:
```
┌──────────────────────────────────────────────────┐
│  Doctor Treatment Timeline                        │
│  ───────────────────────────────────────────────  │
│  Trend:     ▲ Improving                           │
│  Scope:     project                               │
│  Signals:   2 improvements · 0 regressions        │
│  Coverage:  87% traceability                      │
└──────────────────────────────────────────────────┘
```

Trend badges: **Improving** / **Regressing** / **Stable** / **Unknown**

---

## 7. AI Incident Studio — Doctor Panel

Accessible from the Welcome panel → **AI Features** tab.

```
┌──────────────────────────────────────────────────────────┐
│  AI Incident Studio                                       │
│  ──────────────────────────────────────────────────────  │
│                                                           │
│  [Run Doctor Checks]  [Run Doctor Fix]  [View Report]     │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Doctor Treatment Timeline                          │  │
│  │                                                     │  │
│  │  Trend badge:   ▲ Improving                        │  │
│  │  Scope badge:   workspace                          │  │
│  │                                                     │  │
│  │  ✅ 3 improvements detected                        │  │
│  │  ❌ 0 regressions                                  │  │
│  │  Traceability: 91%                                 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Incident Analysis (cross-project health summary)  │  │
│  │  …                                                 │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

- **Run Doctor Checks** → routes to `workspai.projectDoctor` (check) if a project is selected, else `workspai.checkWorkspaceHealth`
- **Run Doctor Fix** → routes to `workspai.projectDoctor` (fix) or workspace health fix
- **View Report** → reads last evidence file and opens in panel

---

## 8. Animation & UX Details

### Loading Spinner
```css
@keyframes spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```
Used on status cards while detection runs.

### Hover Effects
- Cards lift 2px on hover
- Border transitions to accent color
- Drop shadow appears (0.2 s transition)
- Buttons scale to 1.02× on hover

### Status Transitions
- Fade in/out on state change
- Border color transitions smoothly
- All transitions: 200–300 ms

---

## 9. Accessibility

- **Keyboard navigation** — all buttons reachable via Tab / Enter
- **Screen readers** — ARIA labels on all status indicators
- **High contrast** — tested against all VS Code built-in themes
- **Color-blind safe** — icons + text labels, never color alone

---

## 10. Responsive Layout

**Wide (> 600 px)**:
- 2-column grid: npm card | Python card side by side
- 5-column Quick Actions row

**Narrow (< 600 px)**:
- Single column stack
- npm card → Python card → Quick Actions (vertical)
- Full-width buttons

---

## 11. Technical: Status Check Flow

```
User opens Welcome Page
        │
        ▼
JS → { command: 'checkInstallStatus' }
        │
        ▼
Extension: _checkInstallationStatus()
        ├─ Check npm / npx (which / PATH)
        └─ Check Python Core (4 methods: which, py -0, pyenv, npx cache)
        │
        ▼
Extension → { command: 'installStatusUpdate', data: { npm, pythonCore } }
        │
        ▼
JS: updateWizardUI(data)  →  UI renders status cards
```

### Fleet Stage Command Flow

```
User: Command Palette → Workspai: Workspace Run: Test
        │
        ▼
Extension: pickWorkspaceRunFlags('test', workspaceName)
        │
        ▼
QuickPick: user selects flags + enters --since / --max-workers
        │
        ▼
Extension: resolveWorkspaceTarget()  →  gets workspacePath
        │
        ▼
Terminal: npx workspai workspace run test [selected flags]
        │
        ▼
Output channel: live progress (paths redacted)
```

### Doctor Treatment Timeline Flow

```
AI Incident Studio renders
        │
        ▼
Extension: reads doctor-last-run.json  (or doctor-project-last-run.json)
        │
        ▼
buildDoctorTreatmentStatus(doctorSummary)
        ├─ parse driftDelta / scopeProvenance / scoreBreakdown / probes
        ├─ compute trend badge (Improving / Regressing / Stable)
        └─ compute traceability coverage rate
        │
        ▼
Webview: AIIncidentStudio renders doctorTreatmentStatus prop
```

---

## 12. Edge Cases Handled

| Situation | Extension behavior |
|-----------|--------------------|
| Python not installed | Warning card; shows OS-specific install instructions |
| pip not available | Tries pip → pip3 → python -m pip → pyenv |
| npm in npx cache only | Shows "npx cache" instead of binary path |
| Partial install | Mixed status cards; selective install buttons enabled |
| Install in progress | User refreshes manually when done |
| Network error during install | Terminal shows error; user can retry |
| No project selected for Project Health Check (Doctor) | `showErrorMessage` (no silent fail) |
| `--max-workers` not a positive integer | Input rejected inline with validation message |
| Private paths in output channel | Auto-redacted to `<dir>/.workspai/reports/<file>` |

---
> See also: [GETTING_STARTED.md](./GETTING_STARTED.md) · [WHY_PYTHON_REQUIRED.md](./WHY_PYTHON_REQUIRED.md)
