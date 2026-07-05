# Workspai Command Surface Audit

This document records the extension command surface that must stay aligned with
RapidKit npm, the dashboard, and the secondary Workspai sidebar.

## Surfaces

| Surface | Owner | Role |
| --- | --- | --- |
| Dashboard | `WelcomePanel` + dashboard React app | Workspace status, run/repair/artifact navigation, evidence refresh |
| Create | secondary sidebar Create tab | Workspace/project creation and bootstrap handoff |
| Advisor | secondary sidebar Advisor tab | Explain, clarify, and route context to Studio when a fix is needed |
| Studio | secondary sidebar Studio tab | Card/editor repair sessions, safe commands, patch review, verify, rollback |
| Primary sidebar | workspace/project/tree providers | Workspace and project selection, artifact access, module/library navigation |

## Inbound Webview Commands

All secondary-sidebar inbound commands are routed through
`actionsWebviewMessageDispatcher.ts`. The host must explicitly handle each of
these messages:

| Command | Purpose |
| --- | --- |
| `sidebarAiCreatePlan` | Plan workspace/project creation from Create chat |
| `sidebarAiCreateConfirm` | Execute an approved Create plan |
| `sidebarManualCreate` | Execute manual workspace/project creation |
| `sidebarCreatedWorkspaceBootstrap` | Bootstrap the workspace just created, not the previously selected workspace |
| `sidebarImpactQuery` | Advisor impact/explain question |
| `sidebarAdvisorAction` | Advisor action such as handoff to Studio |
| `sidebarStudioQuery` | Studio chat question |
| `sidebarStudioAction` | Studio repair, verify, copy, audit, and ship-loop actions |
| `sidebarFocusView` | Focus the primary workspace/project tree |
| `sidebarOpenDashboard` | Open the Dashboard to a specific section after Studio closure |
| `sidebarRefreshScope` | Refresh active workspace/project scope in the sidebar |
| `sidebarRefreshModels` | Refresh available AI models |
| `setPreferredModel` | Persist selected model |

## Safety Rules

- Dashboard diagnoses and routes; Studio fixes; Advisor explains; Create builds.
- `Fix by Workspai` starts or resumes one card-scoped Studio session.
- Editor `Fix with Workspai` starts an editor-issue Studio session independent
  of the active workspace/project selection.
- Editor `Explain with Workspai` routes to Advisor, not Studio.
- Studio command execution must use approved RapidKit/npm command routing and
  must not execute shell-chained commands as trusted remediation.
- Create workspace/project commands must use the explicit target workspace path
  returned by the creation flow.
- User-facing sidebar copy should show workspace/project names, not full local
  paths, unless the user explicitly opens or copies a path.

## Release Audit

Before publishing the extension:

- Run `npm run typecheck`.
- Run focused protocol tests: `actionsWebviewProvider.test.ts`,
  `sidebarCreateTabParity.test.ts`, `sidebarSessionContract.test.ts`,
  `sidebarStudioTabParity.test.ts`, and `dashboardMinimalUx.test.ts`.
- Confirm `src/contracts/*command-surface*` and shared npm contracts are synced.
- Confirm every fail/warn dashboard card has a visible primary action and no
  critical command is hidden behind overflow-only UI.
