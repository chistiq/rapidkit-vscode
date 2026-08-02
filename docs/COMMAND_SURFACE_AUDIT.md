# Workspai Command Surface Audit

This document records the extension command surface that must stay aligned with
the canonical Workspai CLI live inventory, its contracts and artifacts, the
dashboard, and the secondary Workspai sidebar.

## Surfaces

| Surface         | Owner                                | Role                                                                          |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| Dashboard       | `WelcomePanel` + dashboard React app | Home, Run, Repair, Artifacts, Graph, Project, and Library                     |
| Create          | secondary sidebar Create tab         | Create/adopt/import through model-assisted or manual contract paths           |
| Assistant       | secondary sidebar Assistant tab      | Ask, Plan, and Agent sessions over explicit workspace/project scope           |
| Studio repair   | Assistant Agent mode                 | Goal/card repair, safe commands, patch review, transactions, verify, rollback |
| Primary sidebar | workspace/project/tree providers     | Workspace and project selection, artifact access, module/library navigation   |

## Inbound Webview Commands

All secondary-sidebar inbound commands are routed through
`actionsWebviewMessageDispatcher.ts`. The host must explicitly handle each of
these messages:

| Command                            | Purpose                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `sidebarAiCreatePlan`              | Plan workspace/project creation from Create chat                            |
| `sidebarAiCreateConfirm`           | Execute an approved Create plan                                             |
| `sidebarManualCreate`              | Execute manual workspace/project creation                                   |
| `sidebarCreatedWorkspaceBootstrap` | Bootstrap the workspace just created, not the previously selected workspace |
| `sidebarImpactQuery`               | Advisor impact/explain question                                             |
| `sidebarAdvisorAction`             | Advisor action such as handoff to Studio                                    |
| `sidebarStudioQuery`               | Studio chat question                                                        |
| `sidebarStudioAction`              | Studio repair, verify, copy, audit, and ship-loop actions                   |
| `sidebarFocusView`                 | Focus the primary workspace/project tree                                    |
| `sidebarOpenDashboard`             | Open the Dashboard to a specific section after Studio closure               |
| `sidebarRefreshScope`              | Refresh active workspace/project scope in the sidebar                       |
| `sidebarRefreshModels`             | Refresh available AI models                                                 |
| `setPreferredModel`                | Persist selected model                                                      |

## Safety Rules

- Dashboard detects and routes; Agent diagnoses, plans, fixes, verifies, and
  records the outcome; Ask explains; Plan investigates; Create builds or adds software.
- `Fix by Workspai` starts or resumes one card-scoped Studio session.
- Sending a fail/warn card to Studio is repair intent. Studio must consume the
  card handoff, exact artifact paths, resolution hints, project scope, and
  verify command before asking the user for more context.
- Fresh npm-authored operations may continue automatically only when they are
  `safe`, `ready`, approval-free, and not low-confidence. Automatic continuation
  is bounded and must stop if the same failure repeats.
- AI patches may apply automatically only when every file is an exact CLI hint
  target, remains inside scope, is non-sensitive, meets file/size limits, and
  has a verify command. Every other mutation pauses at one focused review step.
- Guarded, review-required, invasive, destructive, external, or ambiguous
  actions always remain explicit authorization boundaries.
- Editor `Fix with Workspai` starts an editor-issue Studio session independent
  of the active workspace/project selection.
- Editor `Explain with Workspai` routes to read-only Assistant context, not a
  mutation-capable Agent session.
- Studio command execution must use approved Workspai/npm command routing and
  must not execute shell-chained commands as trusted remediation.
- Create workspace/project commands must use the explicit target workspace path
  returned by the creation flow.
- Manual and model-assisted Create must resolve the same available canonical kit
  inventory; planned entries must not be presented as runnable.
- RapidKit Core remains optional unless the active workspace declares a
  Python-backed kit or module.
- User-facing sidebar copy should show workspace/project names, not full local
  paths, unless the user explicitly opens or copies a path.

## Release Audit

Before publishing the extension:

- Run `npm run typecheck`.
- Run focused protocol tests: `actionsWebviewProvider.test.ts`,
  `sidebarCreateTabParity.test.ts`, `sidebarSessionContract.test.ts`,
  `sidebarStudioTabParity.test.ts`, and `dashboardMinimalUx.test.ts`.
- Confirm `src/contracts/*command-surface*` and shared npm contracts are synced.
- Confirm `REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS` exactly equals the
  canonical `workspaceIntelligenceSubcommands` contract, including contract,
  graph, watch, feedback, and MCP capabilities.
- Run the autonomous remediation policy and AI patch-boundary tests; verify that
  safe operations continue without clicks and guarded writes pause for review.
- Confirm every fail/warn dashboard card has a visible primary action and no
  critical command is hidden behind overflow-only UI.
- Confirm CLI/extension parity, palette parity, typecheck, full tests, and the
  production host/webview build are green.
