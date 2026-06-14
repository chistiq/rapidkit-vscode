# Release Notes v0.35.0

## v0.35.0 (unreleased)

### Enterprise Dashboard, Incident Studio, and npm Governance Pipeline

Extension **`0.35.0`** is the next marketplace release after **`0.34.0`** (CLI parity: infra, foundation, lifecycle, modules). It is **not** the same version line as RapidKit **npm** `0.34.0`; this release closes the UX and evidence loop on the extension side and adds parity for npm governance features such as `rapidkit pipeline`.

This note covers **nine local commits** ahead of `origin/main` plus the in-progress governance-pipeline wiring (uncommitted at time of writing).

---

## Highlights

### Enterprise dashboard and evidence loop

- **Command → Evidence → Next Step** closed loop with host-side bridges:
  - `dashboardActivityBridge`, `dashboardEvidenceBridge`, `dashboardOpsChainBridge`, `dashboardReportRegistry`
  - Contract-aware dispatch via `dashboardCommandContracts` and webview `dashboardCommandRegistry`
- **Dashboard sections** (Overview, Operate, Evidence, Workspaces, Console) with `DashboardSubNav`, pending-command reconciliation, and project-scoped payload guards.
- **Evidence UX**: `CommandActivityPanel`, `EvidenceOutcomePanel`, `ReleaseHub`, `DashboardEvidenceSection`, `DashboardNextStepRail`, sparse/missing evidence empty states.
- **Governance onboarding**: `FreshInstallOnboarding`, `OpsChainBanner`, automatic ops chain (`bootstrap → doctor → analyze`) after create / clone / import / add workspace.
- **Operate surface**: `EnterpriseDashboardFlow`, `WorkspaceGovernancePanel`, `ActionTile` / `SectionHeader` / `FrameworkIcon`, `CommandCheatsheet` (replaces removed `CommandReference`).
- **Settings bridge**: `WorkspaiSettingsPanel` + `workspaiSettingsBridge` for embedded settings aligned with dashboard tokens.
- **Handoff**: open Incident Studio directly from evidence cards with scoped doctor / analyze / readiness / release targets.
- **Explorer integration**: workspace and project treeviews notify governance chain and respect dashboard workspace payloads.

### Incident Studio enterprise redesign

- **Retired monolith**: removed legacy `AIIncidentStudio.tsx` (~7.5k lines); **`IncidentStudioVNext`** is the primary studio surface.
- **Studio regions**: `ChatSurface`, `ContextPanel`, `WorkspaceSidebar`, `CommandRibbon`, `CliSurfaceSection`, `ShipLoopSection`, `ActionOutcomePanel`, `MissionControlHeader`, `ActivityBar`, `PhaseStepper`, `CollapsibleSection`.
- **Ship loop**: analyze → verify-gates → readiness → archive → autopilot-release with host bridges (`incidentStudioShipLoopBridge`, ship evidence refresh, stabilization loop).
- **Session persistence**: reload-safe studio state via `incidentStudioSessionPersistenceBridge` and webview session stores (ship loop, CLI surface, chat brain).
- **AI action framework** (host): `aiActionContract`, `aiActionRegistry`, `aiActionExecutor`, `aiActionSafety`, `aiActionRedaction`, `aiActionCommandPolicy`, `aiProviderService`.
- **Policy and mutation gates**: telemetry policy core, policy gate mapper parity (host + webview), guided-mode blocks for advanced CLI, mutation gate before fix/archive/autopilot paths.
- **CLI surface**: `incidentCliActionMatrix`, `CliSurfaceSection`, inline command bridge with pinned npm wrapper, doctor evidence bridge, repro pack and enterprise export bridges.
- **Studio actions**: `studioActionCommands` registry (analyze, impact, fix, verify-gates, terminal-bridge) with audit trail and approval posture.
- **Guided / lite / responsive polish** (Wave Y): denser guided conversation, action outcome essentials, enterprise empty states, collapsible sections, responsive studio chrome.

### Workspai design system migration

- Token layers: `workspai-tokens.css`, `workspai-primitives.css`, `workspai-studio.css`, `workspai-studio-chrome.css`, `workspai-analyze-report.css`.
- `WorkspaiThemeProvider`, `WorkspaiEmptyState`, `WorkspaiBanner`; `DESIGN_SYSTEM.md` for contributors.
- CI drift guards: `designSystemDrift.test.ts`, `scripts/extract-studio-chrome-css.mjs`, `scripts/verify-studio-chrome-css.mjs`, `scripts/check-website-extension-parity.mjs`.
- Extension smoke matrix expanded for studio/dashboard stabilization paths.

### AI creation, analyze, and wiring fixes

- **Creation intent**: `aiCreationHeuristic` + `languageModelResponse` parsing; safer module suggestions and project-type boundaries in create flows.
- **Analyze scope**: `analyzeReportBridge` and scoped keys so dashboard/studio analyze viewers respect workspace vs project context.
- **Stable wiring**: doctor scope payload tests, sync graph bridge, telemetry refresh alignment, `ContextAssistPanel` stop-generation contract.

### Setup, Settings, and npm CLI verify

- Embedded **Setup & Settings** synced with dashboard tokens; full-width embedded host; theme-safe loading skeletons (light + dark).
- Setup **command-center** layout: `ToolRow` matrix, collapsible Optional Runtimes and Advanced Configuration, compact AI copilot sidebar.
- **npm CLI verify fix**: version probe uses developer-style `npx rapidkit --version` (not pinned `--package`) so terminal output matches the Setup card; orchestration commands remain pinned via `platformCapabilities`.
- **Typing**: `UserMode` includes `standard`; `WorkspaiShellView` covers `setup` for lifecycle and conversation-close guards.

### npm governance pipeline parity (npm `0.34.0` CLI → extension `0.35.0`)

Aligns with RapidKit npm governance shipped in **npm `0.34.0`** (independent version):

- **`workspai.workspacePipeline`** → `pipeline --json --strict`
- Evidence card **`pipeline`** from `.rapidkit/reports/pipeline-last-run.json` (`pipeline-last-run.v1`: verdict, stages, blockers)
- UI: Governance Pipeline tile (Operate), Release hub orchestrator banner, Enterprise flow primary action, sidebar Run & Release (`release@0`) and Governance submenu
- Incident Studio CLI matrix entry; command cheatsheet; dashboard next steps when release evidence is sparse or blocked
- Doctor `--strict` / `--ci`, readiness 5-gate model, and autopilot analyze stage are consumed via existing stage evidence refreshed by the pipeline run

---

## Removed / replaced (breaking for contributors)

- `AIIncidentStudio.tsx`, `CommandReference.tsx`, `QuickLinks.tsx`, `HeroAction.tsx`, `AIActions.tsx` — superseded by redesign surfaces above.
- Legacy `AIIncidentStudio` component/interaction tests archived or replaced by `studioRedesignContracts` and presentation contract suites.

---

## Test and validation posture

New or expanded suites include:

- `dashboardCommandRegistry.test.ts`, `dashboardEvidenceBridge.test.ts`, `dashboardOpsChainBridge.test.ts`, `dashboardActivityBridge.test.ts`
- `studioRedesignContracts.test.ts`, `designSystemDrift.test.ts`, `smokeStabilization.test.ts`
- `incidentStudioShipLoopBridge.integration.test.ts`, `incidentStudioPolicyGateParity.test.ts`, `actionOutcomePanel.presentation.test.ts`
- `aiActionContract.test.ts`, `aiProviderService.test.ts`, `platformCapabilities.test.ts` (npm verify probe)
- `workspaiSettingsBridge.test.ts`, `welcomePanelTelemetryWorkspace.test.ts`

```bash
npm run compile
npm run lint
vitest run
```

Release posture: `enterprise-dashboard-studio-and-npm-governance-pipeline`

---

## Included commits (local, ahead of origin/main)

| Commit | Summary |
|--------|---------|
| `bb332fa` | fix(ai): close stable incident studio wiring gaps |
| `6d0e8d8` | fix(ai): repair creation intent planning and module suggestions |
| `4147583` | feat(dashboard): enterprise evidence loop and governance onboarding |
| `d6fe7ee` | feat(studio): complete Workspai design system migration |
| `4974bca` | feat(studio): polish enterprise UX for guided empty state and lite view |
| `861fcc8` | feat(studio): enterprise UX polish for guided, lite, and responsive layout |
| `6cae69d` | feat(studio): Wave Y guided conversation density and action outcome essentials |
| `1e1afd7` | feat(studio): enterprise loops with policy parity, session persistence, responsive layout |
| `03512c7` | feat: Setup embedded UX, npm CLI verify, studio session loops, dashboard evidence wiring |

Uncommitted follow-up: governance pipeline command, evidence card, and release-note corrections (extension `0.35.0` vs npm `0.34.0` versioning).
