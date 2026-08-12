# Changelog

All notable changes to the **Workspai** extension (formerly RapidKit) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No unreleased changes yet.

## [0.39.0] - 2026-08-11

### Added

- Native `@workspai /repair` support in VS Code Chat, including canonical
  blocker selection, streamed CLI Repair Engine progress, portable changed-file
  receipts, and transaction-bound decision buttons.
- Native source-repair continuation backed by the shared durable
  `StudioAgentSession`, selected-model tool calling, inspected-source
  authorization, CLI-owned patch transactions, cancellation, and tool activity.
- Canonical Doctor evidence projection for diagnosis, summary, receipt,
  validation, capability, freshness, applicability, and repair disposition.
- One CLI-authored Workspace Intelligence artifact catalog shared by
  Assistant, Dashboard, Studio, and blocker handoff.
- Explicit Assistant evidence objectives that disclose freshness and bound
  Ask, Plan, and Agent behavior to available governed artifacts.
- Graph coverage panels for languages, runtime units, providers, source scopes,
  semantic binding coverage, conflicts, unknowns, and diagnostics.
- Rich graph detail for entity attributes, relation derivation/trust/confidence,
  proof pointer, column, observation time, and provider metadata.
- Privacy-bounded graph artifact navigation and focused regression coverage for
  portable proof paths.

### Changed

- Removed the analytics consent notification and public opt-in settings;
  retention analytics are hard-disabled, including for legacy stored opt-ins,
  while local Dashboard and Incident Studio operational evidence remains.
- Added a terminal action directly beside every primary-sidebar workspace name;
  it opens an integrated terminal with that workspace as its working directory.
- Made Studio distinguish rolled-back repairs from genuine decision gates,
  preserve the CLI transaction receipt through the agent recovery loop, and
  present valid repair decisions inline against the exact transaction.
- Reworked Incident Studio into a conversation-first repair surface with a
  compact workspace header, inline CLI activity, collapsed history, and less
  duplicated dashboard chrome around the composer.
- Aligned mirrored contracts, command inventory, compatibility metadata, and
  enterprise validation with Workspai CLI 0.56.0.
- Balanced bounded graph projections across projects and architecture entity
  kinds instead of allowing one large language/runtime bucket to dominate.
- Reconciled persisted and streamed graph metadata so live rendering retains
  canonical workspace and source-scope context.
- Made Studio handoff and repair prompts consume stable canonical finding,
  causal, capability, scope, and verification identifiers.
- Made module lifecycle actions use the CLI project-scoped capability lane.
- Expanded graph Canvas and WebGL presentations for the broader polyglot entity
  and relation vocabulary.

### Fixed

- Removed the legacy inline-command branch from `RUN_ONCE` blocker recovery so
  missing-evidence producers remain inside the CLI Repair Engine transaction.
- Made governed Agent command output capture reliable for direct Node.js tools
  without enabling a shell, with bounded temporary output, timeout enforcement,
  secret-stripped environments, and guaranteed cleanup.
- Hardened the release open-issues gate against transient GitHub transport and
  retryable API failures with bounded retries, per-attempt timeouts, actionable
  transport diagnostics, explicit read permissions, and fail-closed behavior.
- Made verified repair receipts override stale `Awaiting verify` phase chrome,
  made completed intelligence rails close at `11/11`, and stopped restored
  rollback checkpoints from appearing as live file changes.
- Prevented internal source-repair policy loops or malformed persisted review
  state from creating a `Decision required` action without a CLI transaction
  and explicit decision options.
- Prevented absolute local filesystem paths and traversal-based proof paths
  from crossing the Extension Host/Webview trust boundary.
- Prevented advisory, non-applicable, unknown, or project-scoped Doctor findings
  from being promoted into incorrect workspace blockers.
- Prevented Assistant and Studio artifact inventories from drifting when the
  live report index is absent, stale, or malformed.
- Prevented architecture-significant entities from disappearing behind the
  fixed graph projection budget in large polyglot workspaces.
- Prevented supported project module commands from being blocked because they
  were not advertised as top-level CLI commands.

### Compatibility

- VS Code 1.106.0+
- Workspai CLI 0.56.0+
- RapidKit Core 0.6.0 only for Python-backed kits and modules

### Verification

- Host/Webview type checking and formatting passed; lint completed with zero
  errors and 46 pre-existing warnings.
- 377 test files passed; 2,723 tests passed and 4 were explicitly skipped.
- Exact CLI contract parity, all 172 palette commands, all 22 enterprise
  scenarios, and 162 release Stop Gate tests passed.
- Production build and VSIX inspection passed for a 164-file, 6.0 MB
  `rapidkit-vscode-0.39.0.vsix` package.
- Dependency audit reported zero vulnerabilities across 845 dependencies.

See [`releases/RELEASE_NOTES_v0.39.0.md`](releases/RELEASE_NOTES_v0.39.0.md).

## [0.38.0] - 2026-08-08

### Added

- Canonical Dashboard evidence posture with separate producer status and
  user-facing `healthy`, `attention`, and `blocked` states.
- Explicit posture icons and compact status copy shared across Dashboard
  cards, workflows, governance, repair, and artifact surfaces.
- Typed CLI repair-decision handling for missing executables, unsupported
  adapters, failed preconditions, guarded policy choices, and source repair.
- Selected-workspace file watchers for report and foundation artifacts outside
  the editor's currently open folders.
- Complete example-catalog projection for runnable workspaces and published
  profile foundations across FastAPI, NestJS, Go, Spring Boot, and .NET.
- Exact transaction diff actions beside bounded inline previews in Studio.

### Changed

- Aligned all mirrored contracts, minimum CLI policy, release baseline, and
  active user guides with Workspai CLI 0.55.1.
- Made Workspace Explain consume canonical release verdict, evidence freshness,
  and blocking state rather than inferring a blocker from high risk alone.
- Made Studio classify non-closed CLI transactions from structured decision
  causes rather than English blocker text.
- Consolidated repeated policy-rejected actions and hid rejected commands from
  the executed-command presentation.
- Kept Recent Workspaces on Home and reduced the Library to the complete
  workspace-template catalog instead of duplicating the module browser.
- Simplified Dashboard navigation, artifact presentation, action density, and
  Studio change review around one current workspace and one current outcome.

### Fixed

- Fixed `needs-attention` Workspace Explain evidence with zero blocking reasons
  appearing as a red release-blocking card.
- Fixed managed workspaces outside the open VS Code folder failing to refresh
  Dashboard cards when canonical evidence changed.
- Fixed profile workspaces and non-FastAPI/NestJS examples being omitted from
  the Library even when published by the examples repository.
- Fixed repeated forbidden evidence-producer calls flooding Studio until the
  model decision circuit breaker stopped the session.
- Fixed changed paths and inline previews competing with each other instead of
  presenting one coherent file-review surface.

### Compatibility

- VS Code 1.106.0+
- Workspai CLI 0.55.1+
- RapidKit Core 0.6.0 only for Python-backed kits and modules

### Verification

- 372 test files passed; 2,705 tests passed and 4 were explicitly skipped.
- Host/Webview type checking, formatting, linting, exact CLI contract parity,
  172-command palette parity, and all 22 enterprise scenarios passed.
- Production build, zero-high/critical dependency audit, VSIX packaging, and
  artifact smoke passed.

See [`releases/RELEASE_NOTES_v0.38.0.md`](releases/RELEASE_NOTES_v0.38.0.md).

## [0.37.0] - 2026-08-07

### Added

- CLI-owned Repair Engine integration with durable plan, precondition,
  approval, checkpoint, execution, reconciliation, verification, rollback, and
  decision-required states.
- Synchronized card-repair, repair-capabilities, proposal, transaction,
  runtime-command, and artifact contracts from Workspai CLI 0.55.0.
- Target-aware CLI transaction receipts that distinguish the selected repair
  result from unrelated blockers elsewhere in the workspace.
- Typed dependency-materialization recovery for declared projects whose local
  installed dependency tree is absent or incomplete.
- Exact repair-capability and Stop Gate coverage for every Dashboard evidence
  card.
- Live command, changed-file, and bounded unified-diff review inside Studio
  sessions, including safe review of untracked text files.
- Durable native tool-call correlation across model requests, execution events,
  observations, reloads, and resumed sessions.
- Contract and scenario coverage for sidebar density, optional Core behavior,
  public product links, card repair, dependency transactions, and live change
  review.

### Changed

- Made Workspai CLI the sole owner of mutation, reconciliation, canonical
  verification, closure, and rollback for blocker repair.
- Made Studio responsible for workspace/project scope, model interaction,
  progress, diff presentation, and explicit user decisions instead of owning a
  competing repair executor.
- Made canonical repairs preserve exact project scope and avoid guessing the
  first affected project in multi-project incidents.
- Made registered evidence names authoritative over directory basenames so
  linked projects and registry aliases reach the exact CLI repair target.
- Made bounded model history retain only coherent tool-call/result pairs so a
  restored or truncated session remains valid for OpenAI-compatible providers.
- Made Setup require only Workspai CLI; Python and RapidKit Core remain optional
  until a Python-backed capability needs them.
- Made workspace-local Core upgrades use the owning `.venv` and fail closed when
  that workspace cannot be resolved.
- Rebuilt Studio subprocess PATH from local npm and Node-version-manager
  discovery so stale Extension Host environments can still run governed CLI
  transactions.
- Reduced primary sidebar inline actions to the most frequent commands while
  retaining workspace, project, terminal, lifecycle, import, and export actions
  in grouped menus.
- Updated Getting Started and UI surface documentation for extension 0.37.0 and
  Workspai CLI 0.55.0.

### Fixed

- Fixed Studio accepting model completion before the exact card verification
  contract and canonical post-mutation chain had closed.
- Fixed a successful dependency installation being rejected merely because it
  did not require a manifest or lockfile edit.
- Fixed an unrelated workspace blocker causing a completed target repair to be
  shown as failed or repeatedly resumed.
- Fixed stale manual-only decisions trapping Resume instead of producing a
  fresh CLI-owned plan.
- Fixed repaired or restored sessions losing provider call identity and
  reviewable command/change evidence across native tool rounds.
- Fixed Dashboard creation and next-step guidance treating missing optional
  RapidKit Core as a universal blocker.
- Fixed workspace-local Core recovery falling through to an unrelated global
  `pipx` upgrade.
- Fixed stale NVM/FNM/asdf/Volta PATH state preventing Studio subprocesses from
  resolving the installed Workspai CLI and package manager.
- Fixed over-dense workspace and project rows obscuring the primary actions.
- Fixed remaining user-facing RapidKit command and workspace terminology on
  active Workspai surfaces.

### Compatibility

- VS Code 1.106.0+
- Workspai CLI 0.55.0+
- RapidKit Core 0.6.0 only for Python-backed kits and modules

### Verification

- 370 test files passed; 2,683 tests passed and 4 were explicitly skipped.
- Host/Webview type checking, formatting, linting, production build, exact
  CLI-contract parity, 22 enterprise scenarios, 2 local CLI integration
  scenarios, VSIX packaging, artifact smoke, and dependency audit passed.

See [`releases/RELEASE_NOTES_v0.37.0.md`](releases/RELEASE_NOTES_v0.37.0.md).

## [0.36.0] - 2026-08-03

### Added

- Durable Create-session recovery that turns orphaned planning/running records
  into explicit, removable stopped sessions after a Webview reload.
- First-install-safe managed workspace creation, including parent-directory
  creation, concurrent-request deduplication, marker verification, and useful
  subprocess diagnostics.
- Cross-runtime remediation-plan detail for dependency resolution paths that
  require guarded project-native investigation rather than an unsafe automatic
  fix.

### Changed

- Studio now distinguishes a persisted repair record from a live provider-owned
  process and returns control to the user when no active process owns the session.
- The Create history locks only the operation currently owned by the live
  Webview; historical interrupted sessions can be removed normally.
- CLI discovery now recognizes direct, global npm, NVM, FNM, asdf, Volta, and
  package-metadata installations without using a network-backed `npx` probe at
  activation time.
- The managed default workspace uses the CLI-aligned `minimal` profile and does
  not install the optional Python engine for unrelated project kits.

### Fixed

- Fixed fresh-install project creation failing with `unknown error` when
  `~/.workspai/workspaces` did not exist yet.
- Fixed stale Create sessions remaining permanently labelled `Creating` and
  blocking deletion after reload or an interrupted host operation.
- Fixed false CLI-missing notifications when Workspai was installed under a
  Node version manager but absent from the Extension Host's stale `PATH`.
- Fixed Studio repair recovery loops that could imply an active repair after
  the owning process had already stopped.

### Compatibility

- VS Code 1.106.0+
- Workspai CLI 0.52.3+
- RapidKit Core 0.6.0 only for Python-backed kits and modules

See [`releases/RELEASE_NOTES_v0.36.0.md`](releases/RELEASE_NOTES_v0.36.0.md).

## [0.35.0] - 2026-08-02

The implementation ledger below records the development history of this
release and may retain legacy internal command IDs or names for traceability;
it is not current usage guidance.

### Added

- **Native Studio Agent runtime**: durable Agent / Ask / Plan sessions, governed Workspai tools, causal blocker traversal, source patch transactions, dependency-security repair, and evidence-derived completion.
- **Callable model selector contract**: provider-qualified model identities with session-only transports excluded and retryable model failover for native Studio tool calls.
- **Enterprise dashboard evidence loop**: Command → Evidence → Next Step with activity trail, outcome review, next-step rail, and contract-aware command dispatch (`dashboardCommandContracts`, `dashboardCommandRegistry`).
- **Dashboard UX polish (v0.35)**: Studio Command Center handoff strip (Evidence · Run · Project · Home); Home Workspace Advisor entry and clickable health metrics; navigation telemetry dedup on re-selected tabs; responsive Run sub-nav scroll on narrow widths.
- **Enterprise-minimal stabilization pass**: Evidence Guided mode now renders one current path instead of duplicating attention cards; Evidence view controls use compact `Guided / Workflows / All` labels; Studio uses a calmer panel workspace with carded chat/context/sidebar surfaces; Workspai now contributes a standard VS Code Secondary Sidebar tab plus Activity Bar fallback, with `Create with AI / Workspace Advisor / Studio` as the minimal AI surface and a live creation timeline.
- **Evidence surfaces**: `CommandActivityPanel`, `EvidenceOutcomePanel`, `ReleaseHub`, `DashboardEvidenceSection`, governance/sparse empty states, and Incident Studio handoff from evidence cards.
- **Governance onboarding**: fresh-install onboarding, ops-chain banner, and automatic `bootstrap → doctor → analyze` chain after workspace create, clone, import, or add.
- **Operate & governance UI**: `EnterpriseDashboardFlow`, `WorkspaceGovernancePanel`, `ActionTile`, `SectionHeader`, `FrameworkIcon`, and `CommandCheatsheet`.
- **Settings bridge**: embedded `WorkspaiSettingsPanel` aligned with dashboard design tokens via `workspaiSettingsBridge`.
- **Incident Studio VNext**: primary studio surface replacing the legacy monolith, with `ChatSurface`, `ContextPanel`, `WorkspaceSidebar`, `CommandRibbon`, `CliSurfaceSection`, `ShipLoopSection`, `ActionOutcomePanel`, and `MissionControlHeader`.
- **Ship loop**: analyze → verify-gates → readiness → archive → autopilot-release with host bridges, ship evidence refresh, and stabilization loop.
- **Studio session persistence**: reload-safe state for ship loop, CLI surface, and chat brain sessions.
- **AI action framework** (host): action contract, registry, executor, safety/redaction layers, command policy, and `aiProviderService` for LLM routing.
- **Studio policy gates**: telemetry policy core, policy gate mapper parity (host + webview), guided-mode blocks for advanced CLI, and mutation gate before fix/archive/autopilot paths.
- **Studio CLI surface**: `incidentCliActionMatrix`, inline command bridge (pinned npm wrapper), doctor evidence bridge, repro pack and enterprise export bridges.
- **Studio action registry**: analyze, workspace advisor, governed fix, verify-gates, and terminal-bridge actions with audit trail.
- **Workspai design system**: token layers (`workspai-tokens`, `workspai-primitives`, studio chrome, analyze report CSS), `WorkspaiThemeProvider`, `WorkspaiEmptyState`, `WorkspaiBanner`, and contributor `DESIGN_SYSTEM.md`.
- **Design-system CI**: drift guard tests, studio chrome CSS extract/verify scripts, and website/extension parity check script.
- **AI creation intent**: `aiCreationHeuristic` and structured `languageModelResponse` parsing for safer create flows and module suggestions.
- **Analyze scoping**: `analyzeReportBridge` so dashboard and studio analyze viewers respect workspace vs project context.
- **Setup command-center**: embedded Setup & Settings with full-width host, theme-safe loading skeletons, `ToolRow` matrix, and collapsible optional/advanced sections.
- **npm governance pipeline parity** (npm `0.34.0` CLI): `workspai.workspacePipeline` (`pipeline --json --strict`), `pipeline` evidence card from `pipeline-last-run.json`, Release hub orchestrator banner, and sidebar Run & Release / Governance menu entries.
- **Vitest expansion**: dashboard bridges, studio redesign contracts, design-system drift, ship-loop integration, AI action framework, presentation contracts, and smoke stabilization suites.
- **Enterprise hardening modules**: `workspacePathBoundary`, `incidentInlineCommandRunner`, `incidentStudioStabilizationPolicy`, `dashboardEvidencePending`, and `dashboardEvidenceRefreshSchedule` (webview).
- **Workspace adoption parity**: extension adoption now delegates to canonical `rapidkit adopt --json` first, with a schema-aligned local fallback for offline or unavailable npm CLI scenarios.
- **Multi-stack adopted project discovery**: adopted frontend and backend projects can be registered outside the workspace tree and still appear in Dashboard, Evidence, Sidebar, and project discovery flows.

### Changed

- Assistant Agent mode now owns the complete card incident graph and may finish only after a fresh, non-blocking verify observation; generated reports are refreshed through canonical producers rather than edited.
- Studio turn limits are now explicit host/test boundaries only. Production Agent sessions compact into durable checkpoints and retain ownership until verified completion, cancellation, or a real provider/protocol failure.
- Native tool execution is causal-generation aware: duplicate inspections, audits, remediations, and verifies are suppressed until source or governed evidence advances; source patch results refresh the generation before the next repair step.
- Long-running Agent prompts retain causal tool and verify events while dropping duplicate request/status chatter, keeping repair sessions within provider context budgets.
- Retired legacy **`AIIncidentStudio.tsx`** (~7.5k lines) in favor of **`IncidentStudioVNext`** and modular studio regions.
- Replaced **`CommandReference`** with **`CommandCheatsheet`**; removed **`QuickLinks`**, **`HeroAction`**, and **`AIActions`** from the dashboard shell.
- Reworked **`welcomePanel`** and **`App.tsx`** for dashboard dispatch, evidence refresh, and studio integration at scale.
- Expanded workspace and project treeviews to notify governance ops chain and honor dashboard workspace payloads.
- **npm CLI verify**: Setup version probe uses developer-style `npx rapidkit --version` so terminal output matches the card; orchestration commands remain pinned.
- Guided/lite/responsive studio polish (Wave Y): denser guided conversation, action outcome essentials, collapsible sections, and responsive studio chrome.
- **Evidence refresh**: replaced multi-timer refresh storm (0 / 1.8s / 5s / 12s) with debounced coalescing (750ms + one 5s follow-up); refresh only when commands opt in via `refreshEvidence: true`.
- **Project adoption UX**: “convert generic project” is now “adopt project into Workspai workspace”; known stacks are no longer skipped and are adopted through the same governance contract.
- **Package build contract**: VSIX prepublish now builds webview assets in production mode so dev source maps do not enter the release package.

### Fixed

- Fixed dependency incidents stopping at an unsafe npm downgrade even when a compatible owner upgrade, transitive constraint, or runtime-native source transaction remained available. Studio now preserves CLI-authored resolution candidates, respects the Doctor-selected ecosystem in polyglot projects, and reaches a user decision only after bounded compatibility investigation.
- Fixed every multi-tool VS Code LM request failing before its first model turn because `LanguageModelChatToolMode.Required` was used with more than one tool.
- Fixed `copilotcli` and other session-only providers appearing as runnable Workspai models even though they cannot answer extension LM requests.
- Fixed missing/retired models and empty provider streams terminating Studio without trying another callable model.
- Fixed Readiness repairs exhausting an arbitrary 80-turn budget after repeatedly auditing the same dependency advisory; duplicate observations now remain in the model ledger but are omitted from the user-facing timeline.
- Fixed dependency repair retry state surviving a successful source patch, which could prevent the Agent from regenerating the lockfile after applying an evidence-supported manifest override.
- Fixed underspecified native patch-tool input: models now receive the exact workspace-relative full-file replacement and source-hash contract.
- Updated `adm-zip` and `axios` to patched releases and made security audit / VSIX packaging use the pinned Corepack package manager path instead of relying on a globally installed `npm` binary.
- Raised the VS Code engine floor to `1.106.0`, where contributed Secondary Sidebar containers became stable, preventing Workspai from silently falling back into Explorer or requiring a proposed API.
- Hardened Electron smoke so proposed-API rejection and missing Workspai view-container diagnostics fail the release even when the extension host exits with code zero.
- Incident Studio stable wiring gaps (doctor scope payloads, sync graph, telemetry refresh).
- AI creation intent planning and module suggestion boundaries for supported project types.
- `UserMode` typing (`standard`) and shell-view lifecycle guards for Settings/Setup tabs.
- Doctor telemetry refresh alignment with scoped workspace/project evidence.
- **Security (P0)**: user-supplied paths cannot escape the active workspace; shell metacharacters rejected; Studio inline CLI restricted to an allowlisted RapidKit surface executed without a shell.
- **Dashboard ops chain (P0)**: cross-workspace chain bleed in the webview; bootstrap step stall without timeout; silent no-op when contract dispatch fails (now warns + `dashboardCommandFailed`).
- **Evidence (P0)**: workspace-level project-doctor artifacts without project identity no longer attach to the wrong selected project; missing bootstrap card always shown.
- **Studio (P1)**: mutation gate parity via shared stabilization policy; standalone panel `incomingMessage` merge and project path/name injection.
- **Reliability (P1)**: pending evidence cards reconcile from resolved cards and activity `completed`/`failed`; removed blind 15s pending timeout.
- **Incident Studio stabilization (0.35.0)**: resync analyze-backed VNext state after report reload; project scope for standalone chat brain and palette open; CLI mutation detection without `cliActionId`; session persistence queue before load; scope selector disabled without project; ContextPanel AI/verify gate parity; chat-brain error banner; mission-control ErrorBoundary; coalesced App embed host-handler refs for CLI/ship loop.
- **Adopted project visibility**: external adopted projects written to `.rapidkit/imported-projects.json` are now resolved by workspace manager, project explorer, and welcome-panel project discovery instead of disappearing after refresh.
- **Fallback adoption drift**: if npm CLI adoption is unavailable, the extension writes aligned `project.json`, `adopt.json`, `adopt-readiness.json`, `context.json`, and workspace registry metadata instead of legacy partial markers.

### Removed

- Legacy `AIIncidentStudio` component and interaction tests (superseded by `studioRedesignContracts` and presentation contract suites).
- Dashboard **`CommandReference.tsx`**, **`QuickLinks.tsx`**, **`HeroAction.tsx`**, **`AIActions.tsx`**.

### Verification

- `./node_modules/.bin/tsc --noEmit`
- `corepack npm test` (321 files / 2282 passed / 2 skipped)
- `node scripts/release-stop-gate.mjs --skip-kpi`
- `env PATH=/tmp:$PATH ./node_modules/.bin/vsce package --no-dependencies --out /tmp/workspai-0.35.0.vsix`

See also: [`releases/RELEASE_NOTES_v0.35.0.md`](releases/RELEASE_NOTES_v0.35.0.md)

## [0.34.0] - 2026-06-10

### Added

- Workspace **Infrastructure** commands: plan, up, down, status, and open compose file, with Docker pre-flight checks, optional flags, and a dedicated workspace sidebar submenu.
- **Workspace Foundation: Ensure** command with non-destructive and force re-sync modes plus modal confirmation before rewriting foundation files.
- Project lifecycle commands for **Build**, **Start (production)**, **Lint**, and **Format** from the Projects tree, including running-server conflict handling on start.
- **Module Maintenance** commands: upgrade, diff, checkpoint, rollback, and uninstall, with registry-backed module selection, dry-run modes, and guarded confirmations for destructive actions.
- Vitest coverage for infra, foundation, project lifecycle stage, and module maintenance terminal dispatch paths.

### Changed

- Expanded `package.json` command palette, workspace context menus, and project context menus to expose the new CLI parity surfaces.

### Verification

- `npm run compile`
- `npm run lint`
- `vitest run` (1094 tests)

## [0.33.0] - 2026-06-08

### Added

- Full `.NET` setup-runtime support across the command palette setup flow and the dashboard setup experience.
- `dotnet-only` workspace bootstrap profile across schemas, completion, hover help, AI create flows, command reference, and workspace creation UI.
- Drift guard coverage that keeps `.NET` and `dotnet-only` surfaced in setup/runtime/profile experiences.

### Changed

- Updated marketplace/package metadata to include `.NET Web API` and C# discovery terms.
- Expanded polyglot and enterprise workspace profile copy to include `.NET` alongside Python, Node.js, Go, and Java.
- Hardened release-stop-gate tests so script subprocesses run with a clean Node CLI environment instead of inheriting Vitest worker hooks.
- Reset RapidKit CLI test mocks between tests and aligned fallback expectations with the actual direct-binary-to-npx execution path.

### Fixed

- Fixed setup/runtime UI drift where `.NET` projects were supported by project creation but missing from runtime verification flows.
- Fixed dashboard setup guidance so `.NET SDK 8+` install, verify, path detection, and AI setup suggestions are visible.
- Fixed profile parity gaps where `dotnet-only` could be accepted by the CLI surface but omitted from extension schemas or UI helpers.

### Verification

- `./node_modules/.bin/tsc --noEmit`
- `./node_modules/.bin/vitest run`
- `./node_modules/.bin/eslint src --ext ts --max-warnings 100`
- `node scripts/sync-import-stack-parity-snapshot.mjs --check`
- `node esbuild.js --production`
- `node esbuild.js` from `webview-ui`

## [0.32.1] - 2026-06-08

### Added

- Shared runtime command surface contract for extension/npm parity covering scaffold kits, module-support boundaries, lifecycle commands, and runtime tiers.
- Runtime command surface parity tests to keep dashboard, AI creation, module suggestions, and CLI snippets aligned with the npm wrapper.
- .NET project creation and dashboard surfaces alongside the existing FastAPI, NestJS, Go, and Spring Boot flows.

### Changed

- Updated extension-host RapidKit calls to use the pinned npm wrapper form: `npx --yes --package rapidkit rapidkit ...`.
- Aligned dashboard command reference, quick links, setup flows, project creation, and module browser copy with the latest RapidKit npm command surface.
- Restricted AI module suggestions to FastAPI and NestJS, with explicit native package ecosystem guidance for Go, Spring Boot, and .NET.
- Hardened AI prompt guidance so generated recommendations use current doctor/project/module command scopes.

### Fixed

- Fixed `.NET` AI creation messaging that could incorrectly describe Spring Boot module behavior.
- Fixed user-facing module install snippets that used unpinned `rapidkit add module` commands.
- Fixed stale doctor command examples such as `rapidkit doctor --scope=workspace` in Studio surfaces.
- Fixed module details and browser command previews so they copy the same supported CLI form documented by npm.

### Verification

- `npm run typecheck`
- `npm run check:parity-snapshot`
- `vitest run src/test/runtimeCommandSurfaceParity.test.ts src/test/driftGuard.test.ts src/test/platformCapabilities.test.ts src/test/springSupportContracts.test.ts src/test/aiService.test.ts`
- `npm run lint:stabilization` (passes with existing warning budget)
- `npm run build`
- `git diff --check`

## [0.32.0] - 2026-06-02

### Added

- Enterprise Workspai dashboard flow with clearer workspace operations, project build, share/handoff, recent workspace, template, and module browsing sections.
- Workspace Contract Registry documentation surface with screenshot coverage for sidebar Contract Graph and `workspace.contract.json` inspection.
- Shared enterprise modal foundation for workspace creation, project creation, module installation, module details, and AI creation flows.
- Webview error boundary support so dashboard rendering failures can surface recoverable errors instead of blank screens.
- Updated screenshot inventory, README tour, and media documentation for Marketplace/readme preparation.

### Changed

- Reworked dashboard IA so workspace-level actions, project-level actions, and share/archive flows sit in their correct scopes.
- Refined Project Actions and Module Browser copy to show selected project/workspace context without exposing local absolute paths.
- Simplified onboarding and setup entry points around Workspai command-center language.
- Refreshed modal interaction design with denser enterprise layout, command previews, clearer targets, and consistent footer actions.
- Updated package metadata version to `0.32.0` across `package.json` and `package-lock.json`.
- Added safe npm overrides for vulnerable transitive test dependencies while keeping the VS Code test CLI on the current release line.

### Fixed

- Fixed dashboard switch/selection refresh behavior paths covered by the redesigned workspace overview flow.
- Fixed module install/details surfaces that previously showed workspace paths where project context was expected.
- Fixed duplicate webview message-case behavior encountered during dashboard/modal integration.
- Cleared npm audit findings for the release package without using `npm audit fix --force`.

### Verification

- `./node_modules/.bin/tsc --noEmit`
- `node esbuild.js` from `webview-ui`
- `npm audit --json` reports 0 vulnerabilities
- `git diff --check`

## [0.31.0] - 2026-05-31

### Added

- Modular workspace analyze helper with stable `runAnalyze`, `loadReport`, and `revealEvidence` message handlers.
- Dedicated `Workspace Live Diagnosis` analyze card for stable incident workflows.

### Changed

- Moved analyze lifecycle from the redesign-only Incident Studio path into the stable WelcomePanel / AIIncidentStudio experience.
- Added clearer guidance for missing analyze output and prompt users to run `rapidkit analyze`.

### Fixed

- Fixed missing analyze output flow so users are guided to rerun analysis instead of seeing an empty state.

### Other

- Recommended validation: `npm run compile` and `npm run test`.

## [0.30.0] - 2026-05-27

### New

- Structured AI response cards in Studio were refined with clearer semantics and improved presentation for better readability.
- Modal evidence contract is now surfaced across AI incident and debugging workflows, improving traceability and diagnostic transparency.
- AI output quality gate introduced to strengthen response consistency before downstream execution.
- Workspace snapshot recovery added to improve resilience during failed imports or workspace restoration scenarios.

### Changed

- AI chat interaction clarity improved, including stronger stream timeout handling for more reliable conversational flows.
- Editor debugging surfaces expanded with richer AI debug actions and enhanced architecture lens visibility.
- Incident verification workflows hardened with stricter verify-first release gating behavior.
- Workspace import pipeline strengthened with additional hardening safeguards.
- Organization and documentation domain references migrated to `rapidkitlabs` / `www.workspai.com`.

### Fix

- Stream timeout instability and chat clarity regressions addressed in AI interaction flows.
- Verification gate edge cases in incident release workflows resolved to reduce release validation failures.
- Workspace import robustness issues mitigated through recovery and defensive import handling.

### Other

- This release primarily focuses on platform stabilization, reliability improvements, and operational hardening across AI, Editor, Incident, and Workspace flows.
- Recommended release verification steps remain: `npm run compile` and `npm run build` prior to VSIX publishing or marketplace release creation.
- Commit scope included in this release covers the latest delivery set through `v0.30.0`.

Commit-level audit (recent 8 commits):

- `ce4ee8b` — feat(studio): clarify structured AI response cards
- `e1daab1` — fix(ai): improve chat clarity and stream timeout
- `d630705` — feat(ai): surface modal evidence contract
- `aeebc0b` — feat(editor): enrich AI debug actions and architecture lens
- `262f407` — fix(incident): harden verify-first release gates
- `551a9d1` — feat(ai): add output quality gate
- `6709580` — feat(workspace): add snapshot recovery and import hardening
- `59aa208` — chore: migrate organization and domain references

## [0.29.1] - 2026-05-23

### Added / Changed / Fixed (Consolidation)

- Consolidated a significant set of stabilization and governance improvements since v0.29.0 including AI runtime lifecycle hardening, memory-policy contract exposure and enforcement, provenance/export reliability improvements, and Incident Studio (vNext) delivery as an opt-in webview.
- Removed an embedded non-English string in `src/commands/aiFreeFeatures.ts` and sanitized generated artifacts.
- Made a deterministic textual ordering alignment in `src/ui/panels/welcomePanel.ts` to keep contract-based tests stable (no runtime behavior change).
- Validated full source with `npm run compile`, `npm run typecheck`, and `npx vitest run` (all tests green).

Commit-level audit (v0.29.0..HEAD):

- `2ff3a50` — chore: commit rapidkit-vscode stable extension changes; preserve current stable AI feature base
  - touched: `README.md`, `src/commands/aiFreeFeatures.ts`, `src/commands/chatParticipant.ts`, `src/commands/incidentStudioNext.ts`, `src/ui/panels/welcomePanel.ts`, `src/ui/panels/incidentStudioPanel.ts`, webview redesign files under `webview-ui/src/components/StudioRedesign/`, `webview-ui/src/lib/studioFeatureFlags.ts`, `webview-ui/esbuild.js`
  - notes: localization cleanup, deterministic textual-order alignment to satisfy contract tests, and in-tree Studio redesign (opt-in).

- `ead47c2` — feat(workspace): add autopilot release command integration
  - touched: `package.json`, `src/commands/workspaceOperations.ts`, `src/test/driftGuard.test.ts`, `src/ui/panels/welcomePanel.ts`

- `05c2c3d` — stabilization: extract creation/report lanes in welcome panel
  - touched: `src/ui/panels/welcomePanel.ts`

- `19af650` — stabilization: isolate activation and incident lanes (wave 2)
  - touched: `src/extension.ts`, `src/ui/panels/welcomePanel.ts`

- `96a6fab` — fix(stabilization): harden polyglot watchers and AI stream reliability
  - touched: `src/core/aiModelSelection.ts`, `src/core/aiService.ts`, `src/extension.ts`, `src/ui/panels/welcomePanel.shared.ts`, `src/ui/panels/welcomePanel.ts`

## [0.29.0] - 2026-05-19

### Added

- **Welcome panel chat brain tracking support** via new panel helper module:
  - `src/ui/panels/welcomePanelChatBrainTracking.ts`

### Changed

- **AI stream/runtime stabilization finalized** across host and panel paths:
  - deterministic model alias matching and safer model fallback behavior
  - request timeout and cancellation lifecycle hardening in stream execution
  - stream done signaling tightened to avoid duplicate terminal events
  - module suggestion parsing and AI response handling made more defensive
- **Command path typing hardening (enterprise consistency)**:
  - legacy command handlers migrated from unsafe `any` usage to guarded typed/unknown flows
  - workspace/project selection command contracts aligned with provider models
  - project creation command imports normalized to static imports and strict error narrowing
- **Doctor and provenance command reliability** improved through strict typing and safer contract parsing.

### Fixed

- **Type contract regressions blocking compile** in workspace/project selection integration (`workspaceSelection` <-> `extension` wiring).
- **Add module command type-safety bug** in slug resolution and selected-project payload narrowing.
- **AI service test parity** updated to match cancellation semantics and prevent stale done-event assumptions.

### Verification

- Full validation run for this release window passed:
  - `npm run compile`
  - `npm run test` (all test files passing)
- Lint remains warning-only for known non-blocking debt outside this release scope.
- Commit scope included in this release is the full range from tag `v0.28.0` to current `HEAD`:
  - `e68f54e` refactor(stabilization): inline ui preference workspace path resolver
  - `8c3bd0b` refactor(stabilization): inline workspace project discovery deps wrapper
  - `1c65c59` refactor(stabilization): inline incident primary cta experiment variant wrapper
  - `f275da1` refactor(stabilization): extract telemetry workspace path resolver helper
  - `25f6410` refactor(stabilization): inline nonce generation helper
  - `4283cbd` refactor(stabilization): inline prediction confidence band helper
  - `ea32346` refactor(stabilization): inline incident rollback protected path helper
  - `e8c9162` refactor(stabilization): inline incident rollback approval/protection helpers
  - `6ec502a` refactor(stabilization): inline chatbrain fallback helper calls
  - `2e7526c` refactor(stabilization): inline sandbox verify helper calls
  - `396efbe` refactor(stabilization): inline ui preference helper calls
  - `1a65fca` refactor(stabilization): extract chatbrain request tracking helpers
  - `4a92cbd` refactor(stabilization): extract sandbox verify parsing helpers
  - `c1013c7` refactor(stabilization): extract chatbrain fallback helpers
  - `db82945` refactor(stabilization): extract ui preference helpers from welcome panel
  - `a03b363` refactor(stabilization): extract telemetry experiment helpers from welcome panel
  - `7d725cb` refactor(stabilization): split incident policy helpers from welcome panel
  - `7df368e` refactor(stabilization): reduce any debt in extension lifecycle and setup panel
  - `423f4a1` refactor(stabilization): enforce lint budget and harden workspace operations
  - `0ea490d` refactor(stabilization): tighten command item typing in workspace selection
  - `d8ec173` refactor(stabilization): harden createWorkspace typing contracts
  - `ef7602d` fix(stabilization): harden gates typing and observability
  - `5d83228` chore: harden release gate, memory policy, and repro-pack safety

## [0.28.0] - 2026-05-13

### Added

- **Enterprise E1/E2 execution slice** shipped across Incident Studio contracts:
  - **E1 baseline hardening** with versioned cross-service impact score contract (`v1`) and execution-complete confidence/scope safeguards.
  - **E2.1** local-processing memory policy profile exposure (`policyProfile`, `sensitivity`, `localProcessingMode`) in host and payload contracts.
  - **E2.2** memory write-access contract enforcement for workspace memory write paths.
  - **E2.3** repro-pack sensitivity labels end-to-end (host evidence, payload normalization, UI rendering, and export bundle contract).
  - **E2.4** memory influence audit timeline linked to decision artifacts across host -> payload -> UI -> export flow.
  - **E2.5** security review hardening coverage for memory/export paths (contract/drift/test enforcement).
- **Release governance tooling**:
  - `scripts/export-open-issues-report.mjs` added for release issue-severity evidence export.
  - release-stop gate integration and workflow usage for open-issue severity blocking.

### Changed

- **CI release gate enforcement** strengthened:
  - `.github/workflows/extension-smoke-matrix.yml` now enforces release-stop checks with open-issue severity inputs.
  - `scripts/release-stop-gate.mjs` and package scripts aligned to stricter stop-gate behavior.
- **Incident Studio host/webview contracts** updated for memory-policy governance, repro-pack security labels, and artifact-linked audit timeline evidence.
- **Impact and architecture reasoning safety** strengthened through updated system graph and lens contracts, with expanded scenario and fixture coverage.

### Fixed

- **Fail-closed mutation safety regressions prevented** with expanded drift guard and flow-level assertions for unknown-scope and policy-bound routes.
- **Memory/export redaction consistency** tightened so sensitive fields remain sanitized in normalized payloads and link-safe bundle exports.

### Verification

- Core enterprise stabilization suites for E1/E2 slices pass in the release range:
  - `src/test/impactScoreScenarioMatrix.test.ts`
  - `src/test/systemGraphIndexer.test.ts`
  - `src/test/workspaceMemoryService.test.ts`
  - `src/test/incidentReproPackUtils.test.ts`
  - `src/test/incidentStudioPayload.test.ts`
  - `src/test/AIIncidentStudio.interaction.test.ts`
  - `src/test/driftGuard.test.ts`
- Commit scope included in this release is the full range from tag `v0.27.3` to current `HEAD`.

## [0.27.3] - 2026-05-12

### Added

- **Incident Studio policy modules** — added new policy/evidence helper modules under `src/ui/panels/`:
  - `incidentStudioPolicyGates.ts`
  - `incidentStudioResponseValidator.ts`
  - `incidentStudioVerifyRerun.ts`
  - `incidentStudioVerifyDiff.ts`
  - `incidentStudioEvidenceMapping.ts`
  - `incidentStudioEvidenceProvenance.ts`
  - `incidentStudioConfidenceUI.ts`
  - `incidentStudioExportProvenance.ts`
- **Core backend contract modules**:
  - `src/core/backendFrameworkContract.ts` (framework/runtime -> stack contract)
  - `src/core/verifyPackContractExporter.ts` (export verify-pack contract to `.rapidkit/reports`)
  - `src/core/workspaceHygieneProbes.ts` (duplicate-deps, SCM hygiene, README framework alignment)
- **Parity snapshot automation** — added deterministic shared snapshot sync/check commands:
  - `sync:parity-snapshot`
  - `check:parity-snapshot`
  - `contracts/backend-import-stack-parity.snapshot.json`
  - `scripts/sync-import-stack-parity-snapshot.mjs`
- **Release notes artifact** — added `releases/RELEASE_NOTES_v0.27.3.md`.
- **Regression suites** — added focused test coverage for policy gates, verifier rerun/diff, evidence provenance/export, response contract validation, workspace boundary matching, and parity snapshot checks.

### Changed

- **Incident Studio claim coherence (webview)** — `webview-ui/src/components/AIIncidentStudio.tsx` now enforces NO-GO/verify-gate truth in UI claims:
  - blocks success messaging when verify/release gates are unsatisfied
  - downgrades GO to gated HOLD when verify completion gates are not met
  - surfaces explicit scope-truth and flow-vs-telemetry labels
  - guided mode now renders deterministic next+verify intent chips and hides dense action board panel
- **Command transport + display separation**:
  - execution path normalized to portable `npx --yes --package rapidkit rapidkit ...`
  - user-facing command rendering simplified to `rapidkit ...`
  - applied across Incident Studio, command reference, and welcome panel pathways
- **Workspace stabilization telemetry model** (`src/utils/workspaceUsageTracker.ts`):
  - added thresholds/metrics/gates for:
    - `routeFallbackNonSuccessShare`
    - `verifyIncompleteWarningRate`
    - `topVerifyPathMissReasonShare`
  - propagated to payload contract types and Incident Studio KPI cards/exports
- **Welcome panel runtime hardening** (`src/ui/panels/welcomePanel.ts`):
  - explicit shell dispatch per OS for terminal-bridge execution
  - incident telemetry refresh wrapped with safe fallback postMessage
  - command scope detection expanded for workspace-level rapidkit actions
- **Release gate enforcement in CI** — removed KPI bypass from smoke matrix release gate and switched to fixture-backed inputs (`wave3-kpi-marker`, claim checklist, enterprise gate, release posture label).
- **Formatting gate in CI** — added `format:check` to smoke workflow (non-Windows) for local/CI parity.

### Fixed

- **Workspace path prefix-collision bug** — `src/utils/findWorkspace.ts` now uses normalized boundary-safe containment checks, so sibling paths like `workspace-other` are no longer treated as nested under `workspace`.
- **Doctor command messaging parity** — doctor evidence tooltips/context hints now use the portable canonical invocation.
- **Formatting consistency in release branch** — normalized prettier formatting on high-churn files used by validation.

## [0.27.2] - 2026-05-10

### Fixed

- **Webview disposal safety** — prevented `Webview is disposed` uncaught errors in the Setup panel:
  - All `postMessage` calls are now guarded by a `_safePostMessage()` helper that checks disposal state before sending
  - Added `_isDisposing` flag set immediately on `onDidDispose` to stop any in-flight async callbacks
  - Registered message listener via `this._disposables` for proper cleanup lifecycle
  - Eliminated three uncaught errors (`Webview is disposed`) visible in the extension host output when closing the Setup panel

## [0.27.1] - 2026-05-10

### Added

- **Workspace Run command suite** — added first-class workspace stage commands and picker flow:
  - `workspai.workspaceRunStage`
  - `workspai.workspaceRunInit`
  - `workspai.workspaceRunTest`
  - `workspai.workspaceRunBuild`
  - `workspai.workspaceRunStart`

- **AI Workspace Command Center** — added `workspai.aiWorkspaceCommandCenter` with a categorized operation launcher for workspace navigation, health, and governance commands.

- **Project-scoped Doctor command** — added `workspai.projectDoctor` with explicit Check/Fix selection and project-aware routing from Incident Studio.

- **Doctor treatment telemetry envelope** — Incident Studio telemetry now includes `doctorTreatmentStatus` (trend, drift deltas, scope provenance, traceability coverage, probe failures/warnings) and corresponding UI rendering.

### Changed

- **Workspace init execution path** — `workspai.workspaceInit` now runs canonical `workspace run init` flow for consistent fleet-stage semantics.

- **Workspace operations targeting** — normalized workspace target resolution from command payloads and selection context across workspace operations and selection commands.

- **Incident Studio command wiring** — doctor actions route to workspace/project-aware commands, adds project doctor report access, and improves scope-aware labels in telemetry UI.

- **AI command catalog** — expanded AI action surface with workspace governance and command-center integration; command documentation aligned to `npx rapidkit ...` syntax.

### Fixed

- **Sensitive path exposure in doctor/compliance surfaces** — outputs now use link-safe/sanitized path hints instead of leaking full absolute report directories.

- **Command docs and hints parity** — corrected stale command hints such as `npx workspai.doctor workspace` to canonical `npx rapidkit doctor workspace`.

- **Drift guard/test alignment** — updated drift assertions and Incident Studio telemetry tests to match current command contracts and doctor treatment payload shape.

## [0.27.0] - 2026-05-08

### Added

- **Incident routing shared module** — extracted all action-type routing logic into `incidentRouting.ts` (`routeIncidentActionTypeFromMessage`). Eliminates drift between panel implementation and tests; tests now import the real function directly rather than asserting on source text. `RoutingResult` type is exported and shared across routing consumers.

- **Specialist intent routing** — four new deterministic routing branches in the incident router:
  - **DevOps/CI-CD** (`ci/cd`, `pipeline`, `kubernetes`, `helm`, `dockerfile`, `docker compose`) → `doctor-fix`
  - **Database/schema** (`schema`, `migration`, `sql`, `postgres`, `mysql`, `mongodb`) → `change-impact-lite`
  - **Docs/runbook/ADR** (`documentation`, `readme`, `runbook`, `adr`) → `workspace-memory-wizard`
  - **Architecture/risk** (`architecture`, `risk`, `blast radius`, `refactor plan`) → `change-impact-lite`

- **Scope-aware suggested questions** — `_buildSuggestedQuestions` accepts `scopeIntent: 'workspace' | 'project'` and returns deterministic, non-generic questions per specialist intent and standard action type. Workspace scope surfaces topology/governance questions; project scope surfaces per-service execution questions.

- **Phase-gate UI alignment** — `phaseContext` in `AIIncidentStudio.tsx` aligned with backend telemetry gates:
  - `diagnosisReady`: `telemetryHardGatePass` as corroborating signal
  - `planReady`: blocked when `telemetryRoutePrecisionPass` is false and telemetry data exists
  - `verifyReady`: requires `qualityScore >= 60` for verify-pack path; `telemetryVerifyPathPass` as alternative pass signal
  - `priorResolutionAvailable`: extended with `verifiedOutcomeLoopStatus.verifiedOutcomes > 0`

- **Data-driven Action Matrix** — `incidentCliActionMatrix.ts` refactored to a canonical source: stable matrix-prefixed IDs, explicit workspace/project scope per entry, `actionTypes` array for routing resolution, and two resolver functions (`resolveIncidentCliActionByActionType`, `resolveIncidentCliActionIdByActionType`) for end-to-end routing alignment.

- **Module Graph Tree in Incident Studio** — doctor evidence payload enriched with `installedModules` from registry manifests; `AIIncidentStudio.tsx` renders framework-grouped module graph with interactive filters (framework dropdown, severity: healthy/warning/critical, module search) and a stability guard that auto-resets the framework filter when the selected framework is no longer present in the dataset.

- **BYOP stack expansion** — `detectProjectStack` extended with BYOP-first detection for six additional stacks: `django`, `flask`, `express`, `koa`, `rails`, `dotnet`. Discovery uses framework-specific file markers (`manage.py`, `wsgi.py`, `app.py`, `app.js`/`server.js`, `Gemfile`/`config/routes.rb`, `*.csproj`/`*.sln`).

- **Enterprise gate fixtures** — `releases/fixtures/wave2-enterprise-gate.json` and `wave3-enterprise-gate.json` provide deterministic gate snapshots with `consecutiveWindowsPass: 2` for regression protection. `releases/fixtures/release-posture-label.md` labels current posture as `stabilization-only`.

- **Incident conversation metrics** — new `incidentConversationMetrics.ts` module: `buildIncidentLifecycleMetrics(input, nowMs)` sanitizes malformed numbers/timestamps before telemetry emission, preventing NaN or negative values from corrupting KPI windows.

- **Incident resume snapshot hardening** — `incidentStudioResume.ts` adds `toNonNegativeInteger`, `toNonNegativeTimestamp`, and `toValidTurns` sanitizers to `buildIncidentResumeSnapshot`; malformed turn counts and timestamps are clamped to safe values.

### Changed

- **Doctor telemetry refresh** — `doctorTelemetryRefresh.ts` adds `onError` hook and async catch in the refresh executor, preventing unhandled promise rejections from crashing the extension host on telemetry refresh failures.

- **Release gate workflows** — `release-gate-wave2.yml` and `release-gate-wave3.yml` hardened: severity parser extracted to shared helper, paginated GitHub issue fetch replaces single-page query, fixture fallback paths removed (hard-fail when KPI marker is missing).

- **Test regression coverage** — three `incidentStudioPromptPolicy.test.ts` route-precision tests updated to read from `incidentRouting.ts` (the real implementation) rather than `welcomePanel.ts`. Test suite: **731/731 tests passing** (66 files).

### Fixed

- **Prompt policy route-precision test source paths** — `route precision: doctor-fix and recipe-pack`, `terminal-bridge requires explicit terminal signal`, and `fix-preview-lite requires patch context` tests were asserting on `welcomePanel.ts` source after routing logic was extracted to `incidentRouting.ts`. Tests now correctly reference the live routing module.

## [0.26.0] - 2026-05-08

### Added

- **Browser smoke test action** — new `browser-smoke-test` action type in Incident Studio, aligned with VS Code 1.119 browser agent tools. The action enables AI-guided smoke testing of web applications by opening the project's running dev server in VS Code's simple browser and asking the AI to verify key UI surfaces, endpoints, and HTTP status codes. Fully integrated across all four contract layers: action matrix, prompt policy, payload contracts, and routing logic.

- **Smart rate-limit fallback** — implements one-shot intelligent fallback on retryable model errors (429, rate limit, quota, service unavailable, overloaded). Fallback only triggers before first chunk is streamed (prevents duplicate partial responses), includes automatic model selection cache reset via `resetModelSelectionCache()`, and falls back to raw model registry if auto-selection picks the same model again. Adds `emittedFromPrimary` guard and returns updated `modelId` on successful fallback.

- **Regression test for fallback** — new test in `aiService.test.ts`: `"falls back to another model when initial request fails with retryable rate-limit error"`. Validates that when autoModel throws 429, fallbackModel is called and streamed response is returned with correct fallback modelId.

### Changed

- **Model selection normalization semantics** — fixes v0.25.0 regression where literal string `'auto'` was being converted to null/undefined. All three normalize helpers (`normalizeSelectedModelId` in App.tsx, `normalizeRequestedModelId` in welcomePanel.ts, `normalizePreferredModelId` in aiService.ts) now preserve `'auto'` as a real model value and only convert truly empty strings/whitespace to null/undefined. This ensures the Auto model selection UI state doesn't collapse when users explicitly request Auto model.

- **Incident Studio View controls styling** — improved readability of Maximize and Lite/Full view toggle buttons by increasing font-size to 10.2px for labels, 12px for icon symbols, adding letter-spacing 0.01em, and setting font-weight 800 for bold emphasis. Used dedicated `.incident-header-group--view` CSS context selector to isolate sizing to View toggles only, preventing impact on other header chips.

### Fixed

- **driftGuard test assertion** — updated `keeps AI modal stop-generation contract aligned across webview and panel` test to split the assertion for `context: ctx, requestId` into two separate checks (`context: ctx,` and `requestId,`) matching the actual multi-line object formatting in `App.tsx`. This was a pre-existing formatting drift from earlier refactoring with no functional impact to the modal stop-generation contract itself.

## [0.25.0] - 2026-05-07

### Added

- **S01 fallback-reason breakdown** — `fallbackReasonBreakdown` now classified into 5 categories (`success`, `bare_keyword_only`, `fix_preview_fallback`, `orchestrate_default`, `other`) for every `next_action_clicked` event; visible in Stabilization KPI snapshot and card UI. Prevents false-positive route-precision claims by exposing fallback mix distribution.
- **S02 verify-path miss reasons (top offenders)** — `verifyPathReasonTop` tracks top-5 miss reasons by frequency; included in snapshot Markdown export and Stabilization KPI card. Drives weekly remediation backlog for verify-path gaps.
- **S04 recovery class breakdown** — `recoveryClassBreakdown` segments rollback events into `auto_rollback`, `manual_recovery`, `unspecified`; included in snapshot export and card stats row. Prevents aggregate recovery rate hiding manual-burden shifts.
- **S05 cohort validation** — `repeatVerifiedWithArtifactReady` and `repeatVerifiedWithArtifactRate` track repeated incidents that have both `repeatedIncident=true` and `replayReady=true` on the `verified_outcome_ready_for_artifact` event. New S05-Cohort metric card added to Stabilization KPI gate UI.
- **False-positive risk mitigation docs** — KPI map, weekly dashboard template, 6-week plan, and canonical story updated with S01–S05 operational playbooks, thresholds, remediation owners, and weekly runbook.

### Changed

- **Stabilization KPI snapshot** — Markdown export now includes S01 fallback mix, S02 top miss reasons, S04 recovery class mix, and S05 cohort stats in addition to S01–S05 gate table.
- **`StudioStabilizationKpiStatus` metrics contract** — extended with `fallbackReasonBreakdown`, `verifyPathReasonTop`, `recoveryClassBreakdown`, `repeatVerifiedWithArtifactReady`, and `repeatVerifiedWithArtifactRate` fields (all optional, backward-compatible).
- **KPI Dictionary status** — S05 promoted from `Partial` to `Available` (cohort validation via artifact/replay ID linking now instrumented).

## [0.24.1] - 2026-05-06

### Added

- **AI-first dashboard spotlighting** - added compact AI Features cards, a featured Incident Studio entry point, a Quick Links "build with AI" cue, and editor quick-fixes README coverage with screenshot 8.
- **Project kit recovery affordance** - added an on-demand kit retry path when the project modal opens before available kits have loaded.

### Changed

- **Incident Studio control-surface polish** - reworked header controls, mode/view layout, maximize behavior, active-scope presentation, and removed the redundant project/workspace context bar.
- **Navigation and setup affordances** - updated dashboard/Incident Studio tabs, setup entry points, and scope syncing between host and webview so users land in the right surface with the right context.
- **README and product messaging refresh** - streamlined README copy, aligned screenshots 1-8, and reinforced backend AI workflow positioning including Spring Boot support.

### Fixed

- **Project Explorer add-module routing** - fixed right-click add-module payload serialization so project actions no longer fail on circular command arguments.
- **Analyze/test visual ambiguity** - separated Analyze visuals from Run Tests with AI-themed icons and corrected tab/button alignment regressions.
- **Incident Studio state and first-open races** - fixed stale scope synchronization, first-open kit loading gaps, and the header regression introduced during layout compaction.

## [0.24.0] - 2026-05-05

### Added

- **CLC1 decision clarity contract** — added a single structured decision clarity payload for Incident Studio actionable outputs with situation, reason, scope, risk, next step, verify plan, rollback plan, and evidence links.
- **CLC5 outcome KPI model** — added `incidentOutcomeKpi` computation and marker telemetry records for first-action success, reopen, override, verify completion, rollback success, and time-to-first-confident-action.
- **Artifact criteria and mode adapters** — added `incidentArtifactCriteria` and `incidentUxModeAdapter` modules with dedicated acceptance and regression test coverage.

### Changed

- **CLC2 mutation safety enforcement** — moved decision field validation to pre-execution and block completion/mutation-ready language whenever required clarity fields are missing.
- **CLC3 deterministic phase policy wiring** — connected phase rail and next-action behavior to deterministic policy evaluation instead of heuristic progression.
- **CLC6 UX mode behavior hardening** — applied Guided/Standard/Expert policy consistently to primary and secondary CTAs, including multi-CTA paths.
- **CLC7 evidence rendering coverage** — completed UI wiring for all artifact kinds (verify, diagnosis, sandbox, rollback, repro) with explicit per-criterion status display and styles.
- **Release stop gate integration** — made outcome KPI checks part of mandatory release gate `overallPass` evaluation.

### Fixed

- **Decision clarity dead path** — fixed host-to-webview contract so decision clarity is emitted in `aiChatActionResult` and no longer remains an unused card path.
- **Mode bypass and criteria styling gaps** — fixed Expert-mode action filtering bypass and missing criteria/card status classes in Incident Studio styles.

## [0.23.0] - 2026-05-05

### Added

- 🧭 **Enterprise import and BYOP readiness surfaces** — expanded import command flow, workspace/project integration points, and extension wiring for safer multi-workspace onboarding and drift control.
- 📈 **W07/W08 validation instrumentation** — added release-readiness decision outcome tracking (`GO`/`NO-GO`) and artifact-linked validation telemetry to support decision accuracy and incident-prevention KPIs.
- 🌙 **Nightly Incident Studio soak workflow** — introduced dedicated soak automation workflow to continuously exercise Incident Studio stability paths.
- 🧪 **Contract runtime and stress regression coverage** — added `workspaiContractRuntime` module and tests plus broader release-stop/stress validation suites.

### Changed

- 🚦 **Wave 3 release-stop gate visibility** — gate output now includes release-readiness validation metrics and clearer KPI evidence blocks alongside existing hard-gate signals.
- 🧩 **Incident Studio host/webview contract parity** — synchronized payload normalization, prompt policy, telemetry typing, and panel behavior across extension and webview layers.
- ⚙️ **Core command and workspace orchestration** — refined command routing and workspace operations for stronger enterprise reliability in cross-project flows.

### Fixed

- 🛡️ **Claim and scope safety alignment** — tightened shipped-scope wording and evidence alignment to avoid over-claiming behavior outside verified release boundaries.
- 🔧 **Telemetry type and gate regression mismatches** — resolved time-window compatibility and stabilized targeted release-gate regressions for newly added KPIs.

## [0.22.0] - 2026-04-29

### Added

- 🚨 **Incident Studio foundation** — shipped the core AI Incident Studio experience with lifecycle-aware payload contracts, graph-backed action handling, protocol fixtures, support panels for memory/resume/telemetry/prompt policy, and end-to-end regression coverage.
- 🧭 **System graph + Architecture Lens baseline** — added the workspace system graph indexer, deterministic blast-radius scoring, Incident Studio Architecture Lens, editor CodeLens surface, and inline architecture warnings for supported source files.
- 🔁 **Release gate and rollback baseline** — added wave-2 stop-gate automation, release gate manifest/KPI wiring, verify-first policy enforcement, hard-gate telemetry, and verify-fail auto-rollback evidence plumbing.
- 🧰 **Setup and workspace operations upgrade** — replaced the old setup panel with the new setup experience, added workspace share bundle import/export flows in the dashboard, restored module browser responsiveness, and expanded workspace/project command coverage.
- 🩺 **Doctor and telemetry surfaces** — added doctor telemetry refresh views and richer project context/log reporting for release gating and runtime observability.
- 🧪 **Deep regression coverage** — added contract, flow, graph, telemetry, release-gate, workspace-share, and A08-specific tests across the extension and webview layers.

### Changed

- 🧠 **AI context pipeline hardening** — introduced a formal AI context contract and resolver, expanded project-context extraction, refreshed system prompt/prompt message shaping, and aligned AI/debug/chat flows on the same context-rich path.
- 🖥️ **UI and webview modernization** — refreshed large parts of the dashboard, Actions, setup, project creation, and incident surfaces to support the new Workspai workflows and responsive layouts.
- 🧩 **Command/provider/schema alignment** — updated command handlers, config-file completion/hover support, schemas, tree views, wizards, and extension activation wiring so the new surfaces work coherently in-editor and in-webview.
- 📦 **Dependency security refresh** — lockfile dependencies were refreshed through `npm audit fix`, clearing current production dependency findings for the release line.

### Fixed

- 🔒 **Prompt and mutation safety** — tightened prompt sanitization, adversarial-input guards, verify-readiness enforcement, and unknown-scope blocking so risky actions degrade safely.
- 🔄 **Workspace flow stability** — fixed workspace detection, project switching, sync cache invalidation, partial-failure normalization, webview readiness races, and module browser responsiveness.
- 🧩 **Architecture evidence fragmentation** — impact, predictive, and release-gate signals are now presented as one coherent architecture review surface instead of several loosely related cards.
- 🛡️ **Production dependency audit findings** — runtime npm audit findings are resolved for the current shipped dependency tree; only upstream dev-tooling issues without an available fix remain.

## [0.21.0] - 2026-04-23

### Added

- ✦ **AI action surface expansion** — added AI flow commands to the extension command palette and menus: `workspai.aiQuickActions`, `workspai.aiOrchestrate`, `workspai.aiFixPreviewLite`, `workspai.aiChangeImpactLite`, `workspai.aiTerminalBridge`, `workspai.aiWorkspaceMemoryWizard`, and `workspai.aiRecipePacks`.
- 📊 **Telemetry commands + onboarding experiment analytics** — new commands `workspai.showTelemetrySummary`, `workspai.resetTelemetry`, `workspai.showAIFeatureOnboarding`, and `workspai.showOnboardingExperimentStats` with workspace-scoped summaries and experiment CTR analysis.
- 🧭 **AI onboarding tour** — in-product AI onboarding messages with follow-up toast variants and command telemetry events for onboarding flows.

### Changed

- 🧱 **Sidebar and webview quick-action alignment** — WORKSPACES / PROJECTS inline action ordering now matches the expanded AI flow model; Actions webview now exposes AI Flows, telemetry, and onboarding shortcuts.
- 🧠 **Telemetry instrumentation coverage** — both `@workspai` chat participant and AI modal now emit structured success/error/cancel outcome telemetry with context-safe guards.
- 🎛️ **Project context insights panel** — new workspace telemetry and onboarding experiment summary views in `projectContextAndLogs` with copyable quick summaries.

### Fixed

- 🩺 **Doctor network safety** — version metadata fetch now enforces timeout, redirect bounds, and same-host redirect checks to reduce hangs and unsafe redirect behavior.
- 🚀 **Dev server port probing resilience** — project start flow now uses bounded port scan attempts with warning fallback instead of unbounded recursive probing.
- 📁 **Workspace registry initialization race** — config directory creation is now synchronous at startup to avoid first-run path timing issues.

## [0.20.0] - 2026-04-20

### Added

- 🤖 **`@workspai` Chat Participant** — register `@workspai` in the VS Code Chat panel with two slash commands: `/ask` (full-context Q&A scoped to the active project) and `/debug` (structured debug flow: root cause + fix + prevention). Reuses the same `prepareAIConversation → streamAIResponse` pipeline as the Workspai modal for identical AI quality.
- ✦ **AI Create presets** — the AI Create modal now ships with categorised quick-fill prompt options (SaaS & commerce, core backend, microservices, data & ML, internal tools). Smart scoring surfaces the most relevant presets based on partial user input.
- 📊 **"Which backend next?" poll** — in-sidebar quick poll lets users vote for the next supported framework (Django / Express / Spring); result is acknowledged inline.
- 🔧 **Workspace bootstrap, setup, init, policy, cache, mirror commands** — new `workspai.workspaceBootstrap`, `workspai.workspaceSetup`, `workspai.workspaceInit`, `workspai.workspacePolicyShow/Set`, `workspai.cacheStatus/Clear/Prune/Repair`, `workspai.mirrorStatus/Sync/Verify/Rotate`, and `workspai.checkForUpdates` commands registered and palette-accessible.
- 🧪 **WorkspaceMemoryService unit tests** — new `src/test/workspaceMemoryService.test.ts` covering read/write, sanitisation, timestamp validation, and concurrent-access paths.

### Changed

- 🧠 **Workspace memory hardening** — `WorkspaceMemoryService` now validates and sanitises all `context`, `conventions`, `decisions`, and `lastUpdated` fields on every read, auto-corrects corrupt entries, and writes back only the cleaned structure.
- ⚡ **Live module list in AI context** — `aiService` now fetches the available module catalogue directly from the CLI (`rapidkit modules list --json-schema 1`) with a 60-second in-process TTL cache, so AI responses reference the real current module set rather than a static snapshot.
- 🔁 **Idempotent workspace creation** — `createWorkspace` now detects partial directories (directory exists, no `.rapidkit-workspace` marker) and offers a "Replace (delete & recreate)" prompt; if the workspace marker already exists the CLI call is skipped entirely for a silent success.
- 🎨 **Brand icons updated** — `workspai.png` and `workspai.svg` updated to current Workspai identity; stale `rapidkits.svg` removed.

### Fixed

- 🛡️ **AI module slug validation** — module slugs returned by AI are validated against the live module list and the `vendor/category/slug` regex before being applied, preventing hallucinated module names from reaching the CLI.
- 📐 **AI project context enrichment** — context payload now includes `python_version`, `rapidkit_cli_version`, `rapidkit_core_version`, `installed_modules`, `workspace_health`, `runtime`, and `engine` fields so the model has complete environment awareness.

### Changed

- 🧭 **Workspai positioning sync** across the extension README, Marketplace description, and webview header so public-facing messaging consistently uses the canonical product line: "The AI workspace for backend teams"
- 🐹 **Go AI guidance** in `aiService` now explains the current Go support boundary more clearly: supported kits are `gofiber.standard` and `gogin.standard`, and Go projects should be extended with native Go packages and internal adapters rather than RapidKit marketplace modules
- 🏷️ **Go kit metadata cleanup** — removed misleading `modular` tags from Go/Fiber and Go/Gin kit descriptors

### Fixed

- 🧠 **Workspace memory action icon restored** — `rapidkit.editWorkspaceMemory` now uses a valid codicon so the inline edit-memory action renders visibly in the WORKSPACES sidebar instead of leaving only an empty clickable area
- 🪟 **Platform-safe npm wrapper execution** — `buildRapidkitCommand()` now forces package resolution through `npx --yes --package rapidkit rapidkit ...`, preventing local launcher shadowing from the current working directory
- 🐹 **Go framework detection** — `workspaceDetector` now detects `gofiber.standard` and `gogin.standard` from real `go.mod` dependencies instead of RapidKit-specific package strings, with regression tests added for both frameworks
- 🩺 **`rapidkit-core` verification reliability** — setup panel checks now use `pip show` / `pipx list` based verification paths that are more stable across Windows and Linux environments
- 🎼 **Poetry verification robustness** — setup panel now probes real Poetry executable candidates only when they actually exist, reducing noisy or misleading verification failures

## [0.19.0] - 2026-04-18

### Added

- 🤖 **AI model selector** in the AI modal header — users can choose any Copilot-registered language model (Claude, GPT, Gemini, etc.) from a compact inline dropdown before sending a query. Premium users see their full model list; free-tier users see what's available to them.
- 🧠 **Thinking indicator** while the AI context-scan phase runs — animated bouncing dots replace the blank waiting state so users have clear feedback before the first token arrives.
- 📝 **MarkdownRenderer component** (`webview-ui/src/components/MarkdownRenderer.tsx`) — lightweight zero-dependency markdown renderer for AI responses supporting headings, bold/italic, inline code, fenced code blocks, ordered/unordered lists, and HR rules.

### Changed

- ⚡ **Real-time AI streaming** — fixed the "all at once" delivery problem. Extension host now flushes chunk batches every 50 ms via `setInterval`, breaking VS Code IPC batching that was holding tokens until stream completion.
- 🎨 **Streaming render path** — `MarkdownRenderer` no longer runs `parseBlocks` on every animation frame during streaming. Raw text is displayed instantly during the stream; a single parse pass runs after completion for formatted output.
- 🗂️ **Quick-prompt chips** hidden while streaming/thinking to reduce visual noise.
- 🔧 **`collapseAll` tree view** switched to native `showCollapseAll: true` on the `rapidkitProjects` view contribution — removes the invalid `workbench.actions.treeView.rapidkitProjects.collapseAll` menu entry warning.

### Fixed

- 🐛 **Menu item warning** — `workbench.actions.treeView.rapidkitProjects.collapseAll` was referenced in `menus` but not registered in `commands`; resolved by using VS Code's built-in `showCollapseAll` view property.

## [0.18.0] - 2026-04-17

### Added

- 🧠 **Deep AI project context** in `aiService` for FastAPI/NestJS/Go workspaces with richer framework and file-signal extraction before generation and debugging.
- ✅ **New AI regression coverage** with dedicated tests for alias/model handling and AI debugger command flow.

### Changed

- 🤖 **Model selection hardening** for GitHub Models/Copilot chat models, including robust alias resolution and safer fallback ordering.
- 🧵 **Workspace memory I/O migrated to async flow** to avoid blocking extension interactions.
- 🎛️ **AI interaction consistency** by routing legacy debug/brain entry points through the shared Workspai AI modal pipeline.

### Fixed

- 🛡️ **Prompt budget safeguards** to prevent oversized AI prompts and reduce timeout/failure risk on large repositories.
- 🧩 **Module slug typo auto-correction** with conservative matching to reduce failed module operations from minor naming mistakes.
- 🔁 **Webview AI request lifecycle stability** with stronger request correlation/cancel behavior across panel and modal flows.

## [0.17.1] - 2026-04-17

### Performance

- **WORKSPACES sidebar — two-phase rendering** (`workspaceExplorer`) — `getChildren()` previously blocked on three per-workspace async ops: `versionService.getVersionInfo()` (subprocess + pip network call, 5 s timeout), `getBootstrapProfile()` (disk read), and `_countInstalledModules()` (recursive registry.json scan). Items now render instantly from cache; metadata (version badge, profile, module count) loads in background via `_scheduleBackgroundMetadataLoad` and fills in without user action.
- **PROJECTS sidebar — two-phase rendering** (`projectExplorer`) — `getChildren()` now returns items immediately from `this.projects` cache and schedules `_scheduleProjectLoad()` in background; `loadProjects()` uses `Promise.all` for parallel `pathExists` checks per project instead of a sequential if/else chain.
- **AVAILABLE MODULES — two-phase rendering** (`moduleExplorer`) — `getChildren()` immediately returns a `loading~spin` spinner item and fires `_scheduleBackgroundCatalogLoad()` instead of `await`-ing `_ensureCatalogLoaded()` (which ran a subprocess on cache miss). Catalog fills in when background load completes.
- **Extension activation** — `workspaceDetector.detectRapidKitProjects()` is no longer `await`-ed at activation; fires in background with `.catch()` — extension activates without blocking on workspace detection.
- **`coreVersionService` TTL** — version cache TTL extended from 5 min → 30 min. Python package version changes rarely; the subprocess version check runs far less often.
- **`examplesService` timeout** — axios request timeout reduced from 10 s → 5 s.

### Fixed

- **AVAILABLE MODULES empty state** — `getChildren()` now returns `[]` when no project is selected, allowing the VS Code `viewsWelcome` rich empty state to show (icon + heading + description + button) instead of a bare placeholder tree item.
- **Removed fragile `setTimeout` for doctor refresh** — two `setTimeout(5000)` / `setTimeout(8000)` calls after doctor re-run and autofix have been removed. The file watcher on `doctor-last-run.json` already handles refresh automatically.
- **`HeroAction.tsx` badge alignment** — `$(sparkle)` icon inside `.hero-badge` span now aligns inline with text (`inline-flex items-center gap-1` / `display: inline-flex`).
- **Dead code removed** — `_ensureCatalogLoaded()` in `moduleExplorer` deleted; it was no longer called after two-phase refactor.

### Changed

- `package.json` — `viewsWelcome` for `rapidkitModules` updated with icon `$(package)`, heading, description, and an "Open Projects" link button (shown when `!rapidkit:projectSelected`).
- `package.json` — `concurrently` added to `devDependencies` (was used in `dev` script but missing from declared deps).

### Added

- ✦ **AI Debug Actions (Code Actions)** — `✦ Debug with Workspai AI` and `✦ Explain error with AI` quick-fix actions appear in the editor lightbulb for Python, TypeScript, JavaScript, and Go files that have diagnostics or a text selection; opens the AI modal with the error/selection pre-filled in Debug mode
- ✦ **Doctor Fix with AI** — each issue in the **Workspace Health** sidebar panel now has a ✨ inline button; clicking it opens the AI modal with the full issue context pre-filled, ready for analysis
- ✦ **AI Module Suggestions** — the Create Project modal now has a "Suggest modules with AI" button that recommends the top modules for your chosen framework and project description
- **Minimizable AI Create modal** — a `−` minimize button appears during `thinking` and `creating` steps; the modal collapses to a floating pill in the bottom-left corner so the dashboard stays usable; auto-restores when creation completes

### Changed

- **Quick Actions sidebar** — consolidated to a single `✦ AI Assistant` button (`$(sparkle)` icon) that opens the AI modal; redundant "Workspace Brain" button removed
- **`rapidkit.debugWithAI` command** — now opens the main Workspai panel AI modal instead of a separate HTML tab; context (editor selection or diagnostics) is passed as `prefillQuestion`
- **`rapidkit.workspaceBrain` command** — now focuses the main Workspai panel instead of opening a separate HTML tab
- **Doctor Fix with AI** — removed scratch-doc workaround; issue text is now passed directly as `prefillQuestion` to the AI modal

### Fixed

- `AIModal.tsx` — added `context` to `useEffect` dependency array so that `prefillQuestion` is correctly applied even when the modal is already mounted with a previous context

### Added

- ✦ **AI actions on workspace cards** — each workspace in the Recent Workspaces list now has a `✦` button (visible on hover) that opens the AI modal pre-loaded with that workspace's context
- ✦ **AI actions on module cards** — each module card in the Module Browser now has a `✦` button that opens the AI modal with the module's context (Module Advisor)
- **`aiForWorkspace` / `aiForModule` webview messages** handled in `WelcomePanel` — routes to `showAIModal()` with correct context type

### Fixed

- **Critical: `command 'rapidkit.workspaceSelected' already exists`** — removed duplicate `registerCommand` call from `ProjectExplorer` constructor; command is now registered only once in `extension.ts`
- `projectExplorer.setWorkspace()` is now correctly called when `rapidkit.workspaceSelected` fires (previously only `doctorEvidenceExplorer.refresh()` was called)

## [0.16.0] - 2026-03-22

### Added

- 🩺 **Doctor Evidence Viewer** (`DoctorEvidenceProvider` tree view)
  - New `WORKSPACE HEALTH` panel in the RapidKit sidebar activity bar
  - Reads `.rapidkit/reports/doctor-last-run.json` — zero extra CLI calls
  - Tree structure: summary score bar → timestamp → System Tools → Projects → per-project issues
  - File watcher auto-refreshes on CLI evidence write
  - Three `view/title` toolbar commands: `rapidkit.doctorEvidence.rerun`, `.autofix`, `.refresh`
  - Syncs to active workspace via live getter (`workspaceExplorer.getSelectedWorkspace()`)
  - Hooks into `workspaceExplorer.onDidChangeTreeData` for automatic workspace-switch refresh

- 📦 **Module install modal from Available Modules sidebar**
  - New command `rapidkit.showModuleInstallModal`
  - Clicking a module in the sidebar opens the `InstallModuleModal` (same as welcome page cards)
  - New webview message `openModuleInstallModal` handled in `App.tsx`
  - `WelcomePanel.showModuleInstallModal()` static method + `_pendingModuleModal` queue

### Changed

- 🧩 `WelcomePanel` gains `setExtensionContext()` static method so sidebar components can open the panel without passing context
- 🔄 Initial workspace path sync: after `workspaceExplorer.refresh()` on activation, health panel is immediately seeded with the auto-selected workspace

## [0.15.0] - 2026-02-27

### Added

- 🧩 **Modular command registration architecture**
  - Split extension command wiring into focused modules (`coreCommands`, `workspaceSelection`, `workspaceOperations`, `projectLifecycle`, `fileManagement`, `projectContextAndLogs`)
  - Reduced activation-file complexity and improved command maintainability

- 🧪 **Cross-platform command contract coverage**
  - Added dedicated tests for platform command building and workspace detection/selection flows
  - Expanded drift-guard checks for terminal execution centralization and command-array contracts

### Changed

- 🪟 **Create Workspace modal UX (tool-aware flow)**
  - Tool availability (Python / venv / Poetry / pipx) is checked when modal opens
  - Install methods are auto-selected when possible and unavailable options are disabled with inline reasons
  - Removed duplicate Poetry prompt in modal-driven create flow

- ⚡ **Workspace sidebar loading performance**
  - Added caching in `coreVersionService` for global installed version and latest version lookups
  - Parallelized workspace item enrichment in `workspaceExplorer` for faster list rendering

- 🖥️ **Terminal execution + platform abstraction**
  - Centralized terminal execution in `terminalExecutor`
  - Added `platformCapabilities` utilities for safe cross-platform shell command building

### Fixed

- 🩺 **Doctor workspace path output clarity**
  - `doctor workspace` no longer shows launcher path entries
  - Real installation paths remain visible and are rendered in deterministic order

- 🧭 **Setup and requirement checks consistency**
  - Improved alignment between setup checks, update flows, and workspace health diagnostics

## [0.14.0] - 2026-02-25

### Added

- 🧭 **Workspace-profile aware command reference in Welcome page**
  - Command list now adapts to the active workspace profile
  - Clear no-workspace guidance tied to sidebar `WORKSPACES` selection

- 👁️ **Persistent Setup Status visibility control**
  - Added user hide/show control for Setup Status card
  - Visibility preference persists across panel reopen and VS Code restarts

- 🏷️ **Workspace profile tags across UI surfaces**
  - Profile tag shown in Welcome `Recent Workspaces`
  - Profile marker shown in sidebar `WORKSPACES` entries

### Changed

- 🎨 **Quick Actions theme adaptation**
  - Sidebar and Welcome quick actions aligned to VS Code theme tokens
  - Improved contrast and focus states for dark/light themes

- 🌐 **Example workspaces behavior**
  - External links are opened via extension host (not direct webview popups)
  - Browsing and cloning URLs are separated (`repoUrl` vs `cloneUrl`)

- 🧠 **Workspace vs project state handling in modules UI**
  - Module cards/install actions now require selected **project** (not just workspace)
  - Module install/update gating aligned with project selection semantics

### Fixed

- 🐛 **Example cards link/clone regressions**
  - Fixed broken external open behavior from webview
  - Fixed clone failures caused by non-root repository URLs

- 🐛 **Incorrect state source for profile-based UX**
  - Profile context is derived from sidebar `WORKSPACES` selection (not recent-workspace clicks)

- 🧪 **Drift protection enhancements**
  - Added/extended drift guard checks for command/profile contract consistency

## [0.13.0] - 2026-02-21

### Added

- 🐹 **Go Framework Support in Sidebar Quick Actions**
  - FastAPI / NestJS / Go buttons in a compact 3-column row (smaller icons, reduced padding)
  - Go project detection via `go.mod` in project explorer and type system
  - Go icon (`go.svg`) in sidebar and Welcome Page Quick Links

- 🪟 **Workspace Button Opens Welcome Modal**
  - Sidebar Workspace button now navigates to Welcome Panel and opens Create Workspace modal
  - `WelcomePanel.openWorkspaceModal()` static method with `__workspace__` pending-modal token
  - `rapidkit.openWorkspaceModal` command registered in extension

- 🚫 **Modules Disabled for Go Projects**
  - Sidebar AVAILABLE MODULES shows info banner instead of module list when Go project selected
  - Welcome Page ModuleBrowser renders Go-specific banner; search/filters hidden
  - `ModuleExplorerProvider.setProjectPath(path, type?)` accepts optional project type
  - `ModuleBrowser` accepts `modulesDisabled` prop

### Fixed

- 🔧 **Removed `@latest` from All npx Calls**
  - Fixed in `rapidkitCLI.ts`, `kitsService.ts`, `firstTimeSetup.ts`, `updateChecker.ts`, `doctor.ts`, `checkSystem.ts`
  - Prevents npm registry version (stale) from overriding local version and breaking `create workspace` / `create project`

- 🔧 **Go Project Init Detection**
  - `rapidkit.projectDev` now checks `go.sum` (not `node_modules`) for Go projects
  - Default port for Go projects set to `3000`; uses `npx rapidkit dev` instead of `npm run start:dev`

- 🔧 **openWorkspaceModal Wrong State**
  - Was calling `setIsCreatingWorkspace(true)` (loading card) instead of `setShowCreateModal(true)` (modal open)

### Changed

- 🎨 **Framework Button Sizing** — Icons reduced to 16px, min-height 44px, padding 5px 2px, label font 9.5px
- 🧭 **WorkspaceStatus Type** — Added `projectType?: 'fastapi' | 'nestjs' | 'go'`
- 🧭 **Project Type Propagation** — `updateWithProject` sends `projectType`; `_detectProjectTypeStatic` shared static helper

## [0.12.0] - 2026-02-15

### Added

- 🪟 **In-App Module Details Modal**
  - Added `ModuleDetailsModal` with tabbed sections (overview, dependencies, configuration, profiles, features, docs)
  - Extended `ModuleData` typing for richer metadata rendering (runtime deps, profiles, docs, compatibility, support, changelog)
  - Wired module details flow to React modal in Welcome webview instead of spawning a separate HTML panel

- 🔄 **Post-Install Workspace Status Refresh**
  - Added `WelcomePanel.refreshWorkspaceStatus()`
  - Auto-refreshes installed modules and module catalog immediately after `rapidkit add module`

### Changed

- 🧭 **CLI Binary Resolution Reliability**
  - Improved `rapidkit` command resolution to search `.venv/bin/rapidkit` by walking up directories from project path
  - Better behavior for nested project paths inside workspaces
  - Added explicit warning when falling back to `npx rapidkit`

- 📡 **Module Details Data Source**
  - Switched module info retrieval to `rapidkit modules info <module> --json`
  - Merges fresh CLI metadata with catalog data for accurate details and versions

- 🎨 **Webview UI Polish**
  - Updated styles and component integration for modal-based details flow
  - Minor UX cleanup in example workspace cards and shared styles

## [0.11.0] - 2026-02-14

### Added

- 🌐 **Dynamic Example Workspaces** - Load example workspaces from GitHub repository
  - Real-time fetching from `rapidkitlabs/rapidkit-examples` repository
  - Clone tracking with local state management (`~/.rapidkit/cloned-examples.json`)
  - Update detection for already-cloned examples
  - 1-hour cache with TTL for optimal performance
  - Smart caching strategy (5-minute stale-while-revalidate)
  - Example metadata with icons, descriptions, and framework tags
  - Interactive clone and update buttons with loading states

- 🎨 **Dynamic Kit Selection** - Enhanced project creation with kit dropdown
  - Kit selection dropdown in CreateProjectModal
  - Dynamic kit loading from `rapidkit list --json` via KitsService
  - 24-hour cache for kit catalog
  - Fallback to hardcoded kits when Python Core unavailable
  - Kit descriptions and tags displayed in UI
  - Framework-based filtering (FastAPI/NestJS)
  - Auto-select first available kit per framework

- 📦 **Full Workspace Export/Import** - Complete backup and restore functionality
  - Export workspace as ZIP archive with all files (~MB sized)
  - Smart exclusion patterns (node_modules, **pycache**, .venv, .git, etc.)
  - Import from ZIP archive with extraction and validation
  - Import existing workspace folder (register only)
  - Progress tracking with detailed status messages
  - File size display after export
  - Overwrite protection with user confirmation
  - "Open Folder" and "Open Workspace" actions after import
  - Archive using `archiver` library with maximum compression
  - ZIP extraction using `adm-zip` library

- 🆕 **New Services** - Core infrastructure services added
  - **ExamplesService**: GitHub API integration with caching and clone state
  - **KitsService**: Dynamic kit catalog from CLI with fallback support
  - Cache management with configurable TTL
  - State persistence in `~/.rapidkit/` directory

### Changed

- ✨ **UX Improvements** - Better visual hierarchy and usability
  - Section headers enlarged (font-size: 1rem → 1.1rem)
  - Icons increased (16px → 24px) for better visibility
  - Added subtle border-bottom to section titles
  - Features section moved to page footer
  - Export icon changed from Download (↓) to Upload (↑)

- 🎯 **Project Creation Flow** - Streamlined workflow
  - Kit selection moved to modal (no more separate QuickPick)
  - Framework cards now open modal with pre-filtered kits
  - Skip kit selection in wizard if pre-selected
  - Pass kit_name to generateDemoKit for npm fallback

- 📋 **Workspace Context** - Fixed workspace selection bug
  - Added WorkspaceExplorerProvider reference to WelcomePanel
  - Fixed undefined workspace path in createProjectWithKit
  - Workspace selection now properly maintained across panels

### Technical

- **New Dependencies**:
  - `archiver@^7.0.1` - ZIP archive creation
  - `@types/archiver@^7.0.0` - TypeScript types
  - `adm-zip@^0.5.16` - ZIP extraction
  - `@types/adm-zip@^0.5.5` - TypeScript types

- **Package Updates**:
  - Various transitive dependencies updated via package-lock.json

- **Code Changes**:
  - 3,111 lines added, 701 lines removed
  - 20 files modified
  - 2 new service files added

### Removed

- ❌ **Config-Only Export/Import** - Simplified to Full Archive only
  - Removed exportConfigOnly() and importFromConfig() methods
  - Removed JSON-only export option from QuickPick
  - Focus on practical Full Archive export/import workflow

## [0.10.0] - 2026-02-12

### Added

- 🚀 **Project Actions Panel** - Unified action panel in Welcome Page with 6 lifecycle buttons
  - **Terminal** - Open terminal in project directory
  - **Init** - Install dependencies (npm/poetry)
  - **Dev/Stop** - Smart toggle button (green Play or red Stop based on server state)
  - **Test** - Run project tests
  - **Browser** - Open running server in browser (smart enabled/disabled based on server state)
  - **Build** - Build project with npx rapidkit build
  - All actions integrated with existing commands and terminal management

- ⬆️ **Workspace Upgrade Button** - Smart upgrade detection for rapidkit-core
  - Orange upgrade button appears next to workspace name when update available
  - Detects workspace venv vs global/pipx installation
  - Runs appropriate upgrade command (poetry update or pipx upgrade)
  - Real-time version comparison with latest from npm registry

- 🎯 **Smart Browser Button** - Context-aware browser opening
  - Browser button only enabled when dev server is running
  - Automatically detects and displays running port in tooltip
  - Port extracted from terminal name and tracked in state
  - Tooltip shows "Open in Browser (port 8001)" or "Start server first"

- 📡 **Running Port Detection** - Intelligent port tracking
  - Extracts port from terminal names (e.g., "🚀 project [:8001]")
  - Stores `runningPort` in workspace status
  - Displays port in sidebar project description (e.g., "FastAPI 🟢 :8001")
  - Updates automatically when server starts/stops

### Improved

- 🎨 **Enhanced Sidebar Icons** - Better visual feedback for running projects
  - Browser icon only shows for projects with running servers
  - Port number displayed next to project name in sidebar
  - Tooltip includes port information: "🚀 Server running on port 8001!"
  - Updated `package.json` menus to show Browser only for `project-running` context

- 🔄 **State Synchronization** - Real-time UI updates
  - Welcome panel automatically refreshes when server starts/stops
  - Browser button state syncs immediately with Dev/Stop actions
  - Port detection works for all start scenarios (Dev, Init & Start, Start Anyway)
  - Tree view and webview stay in sync with terminal state

- 💅 **Disabled Button Styling** - Professional disabled state
  - Semi-transparent disabled buttons (40% opacity)
  - Not-allowed cursor for disabled actions
  - No hover effects on disabled buttons
  - Clear visual distinction between enabled/disabled states

### Technical

- **New Component:** `ProjectActions.tsx` - Unified action panel with conditional rendering
- **Type Updates:** Added `runningPort?: number` to `WorkspaceStatus` interface
- **Extension Integration:** Import `runningServers` Map in `welcomePanel.ts`
- **Port Extraction:** Regex-based port detection from terminal names
- **CSS Enhancements:** Disabled button states and hover effect improvements

## [0.9.0] - 2026-02-10

### Added

- 🎭 **Modal System** - Comprehensive modal-based workflows for core actions
  - **CreateWorkspaceModal** - Interactive workspace creation with validation
  - **CreateProjectModal** - Framework-specific project creation (FastAPI/NestJS)
  - **InstallModuleModal** - Module installation with metadata and documentation links
  - Each modal includes validation, error handling, and keyboard shortcuts
  - All modals feature framework-appropriate icons and color schemes

- ⚡ **Requirement Cache** - Smart caching system for installation prerequisites
  - Caches Python availability checks (version, venv support, rapidkit-core)
  - Caches Poetry installation status
  - 5-minute TTL (Time To Live) for cache entries
  - Automatic cache invalidation on expiry
  - Significantly speeds up repeated workspace creation
  - Reduces redundant system calls and checks

- 📱 **Responsive Design** - Mobile-friendly and adaptive layouts
  - New `responsive.css` stylesheet with breakpoints
  - Optimized for tablets and smaller screens
  - Improved touch targets and spacing
  - Better content reflow on narrow viewports

### Improved

- 🎨 **Updated Screenshots** - All extension gallery images refreshed
  - Screenshot 1: Welcome panel with modal system
  - Screenshot 2: Module browser with install modal
  - Screenshot 3: Workspace management interface
  - Higher quality images with current UI state

- 🔧 **Enhanced Commands** - Better user experience for core operations
  - Improved `createWorkspace` with validation and feedback
  - Enhanced `createProject` with template selection
  - Refined `addModule` with better error messages
  - All commands now use modal system for consistency

- 🎯 **UI/UX Polish** - Refined user interface components
  - **HeroAction** - Updated for modal integration
  - **QuickLinks** - Direct modal triggers for common actions
  - **ModuleBrowser** - Inline install with modal confirmation
  - Better visual feedback during operations
  - Loading states and progress indicators

- 🐍 **Python/Poetry Integration** - More robust environment detection
  - Enhanced `pythonChecker` with detailed version parsing
  - Improved `poetryHelper` with better error recovery
  - Requirements now cached for performance
  - Better recommendations for missing dependencies

### Changed

- 🏗️ **Architecture** - Modernized component structure
  - Modals extracted as standalone components
  - Better separation of concerns
  - Improved state management
  - More reusable UI components

### Technical

- 📦 **New Files**
  - `src/utils/requirementCache.ts` - Caching layer for system checks
  - `webview-ui/src/components/CreateProjectModal.tsx` - Project creation modal
  - `webview-ui/src/components/CreateWorkspaceModal.tsx` - Workspace creation modal
  - `webview-ui/src/components/InstallModuleModal.tsx` - Module installation modal
  - `webview-ui/src/styles/responsive.css` - Responsive design styles

- 🔄 **Modified Files**
  - `src/commands/addModule.ts` - Modal integration
  - `src/commands/createProject.ts` - Enhanced validation
  - `src/commands/createWorkspace.ts` - Cache utilization
  - `src/extension.ts` - Command registration updates
  - `src/ui/panels/setupPanel.ts` - Modal coordination
  - `src/ui/panels/welcomePanel.ts` - UI updates
  - `src/ui/wizards/projectWizard.ts` - Workflow improvements
  - `src/utils/poetryHelper.ts` - Cache integration
  - `src/utils/pythonChecker.ts` - Enhanced checks with caching
  - `webview-ui/src/App.tsx` - Modal state management
  - `webview-ui/src/components/HeroAction.tsx` - Modal triggers
  - `webview-ui/src/components/ModuleBrowser.tsx` - Install modal integration
  - `webview-ui/src/components/QuickLinks.tsx` - Quick action modals
  - `webview-ui/src/index.tsx` - Style imports

### Performance

- ⚡ **Faster Workspace Creation** - 30-50% speed improvement
  - Python checks cached for 5 minutes
  - Poetry detection cached
  - Reduced system calls during repeated operations
  - Better perceived performance with loading states

## [0.8.0] - 2026-02-09

### Added

- 🔄 **Dynamic Version Display** - Welcome page now shows extension version dynamically
  - Version is now fetched from `package.json` automatically
  - No need to manually update version string in React app
  - Ensures version consistency across extension and UI

- 📊 **Project Statistics** - Enhanced workspace tracking with detailed project counts
  - Replaced simple project type array with detailed statistics object
  - Shows individual counts for FastAPI and NestJS projects
  - Separate badges for each project type with counts
  - Empty workspace indicator (0 projects badge)

### Improved

- 🎨 **Redesigned Workspace Cards** - Completely revamped workspace list UI
  - Compact horizontal layout with improved information density
  - Clean badge system for project types (⚡ FastAPI, 🐱 NestJS)
  - Project count badges with individual framework counts
  - Better visual hierarchy with color-coded tags
  - Last modified time displayed inline
  - Improved hover effects and status icons
  - Close button only visible on hover
  - Better path display with RTL direction for long paths

- 🔍 **Enhanced Project Detection** - More accurate workspace scanning
  - Projects now detected directly in workspace root (not `projects/` subfolder)
  - Better RapidKit project marker detection (`.rapidkit/project.json`, `.rapidkit/context.json`)
  - Fallback detection for FastAPI (pyproject.toml) and NestJS (package.json)
  - Separate counters for each project type

### Changed

- 📐 **Workspace Data Structure** - Updated type definitions
  - `projectTypes: string[]` → `projectStats: { fastapi?: number; nestjs?: number }`
  - More granular and flexible project information
  - Compatible with future project type additions

### Technical

- Refactored workspace card components with new class naming (`ws-*` prefix)
- Added VS Code theme-aware color utility classes
- Improved TypeScript type safety for workspace data
- Code formatting improvements (consistent indentation)

## [0.7.0] - 2026-02-06

### Added

- 🏥 **Workspace Health Check** - Quick diagnostics for workspaces
  - New inline button (pulse icon 🩺) next to each workspace in sidebar
  - Runs `rapidkit doctor` command to check workspace health
  - Shows comprehensive diagnostics in terminal
  - Available via inline button or right-click context menu
  - Progress notifications during health check

- 🎯 **Standalone Setup Status Panel** - Dedicated setup verification
  - Separate webview panel for setup status (accessible via "Setup" button)
  - Real-time status checking for all RapidKit tools
  - Three-tier hierarchy: Required → Recommended → Optional
  - Clean minimal design with colored borders
  - Install and Verify buttons for each tool
  - Auto-refresh after installations
  - Professional tooltips explaining each tool's purpose

### Improved

- 🎨 **Setup UI/UX** - Enhanced visual design
  - Minimal button design with transparent backgrounds
  - Colored borders for visual hierarchy (cyan for primary, blue for verify)
  - Smooth hover effects and transitions
  - Better status indicators (✓ for installed, ⏳ for checking, ⚠ for missing)
  - Installation progress bars with time estimates

- 🔧 **Welcome Panel** - Streamlined quick actions
  - Added "Setup" button linking to new standalone setup panel
  - Reorganized quick actions for better workflow
  - Cleaner layout with improved spacing

### Changed

- 📋 **Setup Status Architecture** - Separated from Welcome panel
  - Setup status now in dedicated panel for better focus
  - Improved modularity and maintainability
  - Better state management for real-time updates

### Technical

- Created new `SetupPanel` class for standalone setup management
- Added `rapidkit.openSetup` command
- Added `rapidkit.checkWorkspaceHealth` command
- Enhanced workspace context menu with health check option
- Improved terminal integration for diagnostic commands

## [0.6.1] - 2026-02-03

### Added

- 📋 **Copy install commands** on Setup Wizard and Module cards (single-click copy of `rapidkit add module <slug>` and relevant install commands)
- 🖥️ **Manual install** button with terminal-style icon for module cards

### Fixed

- 🛠️ **Setup Status stuck on "Checking..."** — removed interval-based polling and added debounced updates to avoid continuous rechecks and UI flicker
- 🔍 **npm vs pipx detection** — improved detection logic to distinguish npm CLI from pipx-installed RapidKit to prevent false positives
- 📋 **Copy-to-clipboard UX** — unified copy button behavior and added visual feedback for modules and install actions

### Changed

- 🧩 Module Browser: added copy-to-clipboard for module install commands; improved actions layout and consistent button styling
- 🏷️ Header shows current extension version alongside update status (e.g., `v0.6.1 — Up to date`)

## [0.6.0] - 2026-02-03

### Added

- 🎯 **Interactive Module Browser** - Complete module management system
  - Browse 27+ modules with grid/list views
  - Search and category filtering
  - Real-time installation status (installed/update/not-installed)
  - One-click install/update from extension
  - Module details with descriptions and versions
  - Sidebar explorer with module categories
  - Auto-sync status with system environment

- 🔧 **Intelligent Setup Wizard** - Pre-flight validation system
  - Python 3.10+ version checking
  - venv support validation
  - RapidKit Core installation detection
  - npm package verification
  - Package manager (Poetry/pip/pipx) selection
  - Auto-detecting installed environments
  - Platform-specific error messages and guidance

- 📦 **Package Manager Selection** - Multi-method installation
  - Poetry (Recommended) - Automatic virtual environment + dependencies
  - pip (Optional) - Standard Python package manager
  - pipx (Optional) - Isolated tool installation
  - Real-time status detection for each method
  - One-click installation with progress feedback
  - Beginner-friendly explanations for why each is needed

- 📚 **Enhanced Documentation**
  - Updated README with new feature screenshots
  - Simplified setup wizard text for junior developers
  - Visual "RECOMMENDED" badge on Poetry card
  - Better error guidance with platform-specific fixes

### Improved

- Python environment detection now uses 8 different methods
- Auto-closing progress notifications (800ms)
- Module state synchronization across all UI components
- Better error messages with actionable guidance
- Workspace creation properly blocks on missing prerequisites
- Installation method cards with visual feedback

## [0.5.2] - 2026-02-02

### Fixed

- 🔧 **NPM Package Caching Issue** - Always use latest rapidkit npm package
  - Added `--yes` and `@latest` flags to all `npx rapidkit` commands
  - Prevents using cached outdated versions of rapidkit CLI
  - Ensures workspace/project creation always uses latest available version
  - Fixes "Invalid project name" errors caused by old cached CLI versions
  - Updated 15 files: rapidkitCLI.ts, doctor.ts, firstTimeSetup.ts, updateChecker.ts, and more

- 🩺 **Doctor Command Accuracy** - Fixed false positive "All checks passed"
  - RapidKit Core changed from optional (warning) to required (fail)
  - npm package now required for full functionality
  - Command properly fails when critical components missing
  - Aligned with Setup Wizard behavior
  - Now shows accurate system status

- 💬 **Notification Polish** - All notifications now have "OK" button
  - Fixed notifications that couldn't be closed
  - Updated 9 files with proper button handling
  - Removed duplicate "Creating workspace..." notification
  - Better user experience with dismissible messages

### Added

- 📦 **Standalone Project Mode** - Create projects without workspace
  - When creating a project without an existing workspace, users now get 3 options:
    1. Create Workspace First (Recommended) - Full workspace setup then project
    2. Create Standalone Project - Direct project creation without workspace
    3. Cancel
  - Standalone projects are created at `~/RapidKit/rapidkits/` by default
  - Seamless workflow: Creating workspace first automatically prompts for project creation
  - Clear labeling of projects as "standalone" or "workspace" in success messages

- 📋 **Command Reference** - Added to Welcome Page
  - 4 collapsible categories with 14 commands total
  - Workspace Commands (2): Create workspace with various options
  - Project Commands (4): FastAPI/NestJS project creation and dev server
  - Module Commands (5): Real module slugs (auth_core, db_postgres, redis, email, storage)
  - Development & Utilities (3): doctor, version, help commands
  - Copy-to-clipboard functionality with visual feedback (✓ Copied!)
  - Expandable/collapsible categories with ▼ toggle
  - Professional code blocks with hover effects

- 📂 **Recent Workspaces** - Dynamic list in Welcome Page
  - Shows up to 5 most recent workspaces
  - Displays project count and path for each workspace
  - Click to open workspace directly
  - Manual refresh button (↻) for updating list
  - Auto-refreshes after creating workspace or project
  - Empty state with helpful message
  - Sorted by last accessed time

- ⚡ **Workspace Explorer Enhancements**
  - **Project Count**: Shows in label format "workspace-name (3)"
  - **Last Opened Time**: Smart time formatting
    - "Just now" (< 1 minute)
    - "15m ago" (< 1 hour)
    - "3h ago" (< 24 hours)
    - "2d ago" (< 7 days)
    - Hidden after 7 days
  - **Status Icons**: Visual indicators for workspace state
    - Active: 🟢 with green folder-opened icon
    - Inactive: purple folder-library icon
  - **Time Tracking**: Automatic lastAccessed timestamp
    - Updates when workspace selected
    - Persists to workspaces.json
    - Used for sorting in Recent Workspaces

### Changed

- Updated all CLI invocations to use `npx --yes rapidkit@latest` instead of `npx rapidkit`
- Improved reliability of workspace and project creation commands
- Welcome Page icons updated for professionalism:
  - 💻 VS Code Extension (was 🎨)
  - 🔍 System Check (was 🩺)
  - ⚡ Key Features (was ✨)
- Refresh icons changed from 🔄 to ↻ (minimal and clear)
- Welcome Panel now auto-refreshes after workspace/project creation
- Stored extension context globally for cross-file access
- Enhanced tooltips in workspace explorer with more details

## [0.5.1] - 2026-02-02

### Added

- 🔍 **Comprehensive Python Detection** - 8-method detection for rapidkit-core package
  - Method 1: Python import check
  - Method 2: `python -m pip show`
  - Method 3: Direct pip/pip3 commands
  - Method 4: pyenv versions checking (solves pyenv issue!)
  - Method 5: User site-packages detection
  - Method 6: pipx list checking
  - Method 7: poetry show checking
  - Method 8: conda list checking
  - Handles complex Python environments (pyenv, virtualenv, poetry, conda, pipx)
  - Falls back gracefully when one method fails

- 🧙 **Interactive Setup Wizard** - Integrated into Welcome page
  - Real-time detection of npm and Python Core packages
  - Visual status indicators (✓ installed, ⚠ missing, ⏳ checking)
  - One-click installation with proper npm/pip commands
  - Refresh button to recheck status after installation
  - Progress tracking (X/2 components installed)
  - Persistent state (remembers if user dismissed wizard)
  - Enabled "Finish Setup" button only when both ready
  - Runs doctor command on completion

- 📋 **Comprehensive Doctor Command** - Enhanced system diagnostics
  - Checks Python version and availability
  - Detects rapidkit-core with version checking
  - Verifies venv support
  - Checks Node.js availability
  - Detects Poetry installation and version
  - Checks Git availability
  - Detects npm package (global vs npx cache)
  - Fetches latest versions from registries
  - Shows available updates with version comparisons

- 🎯 **New checkSystem Command** - Quick system status check
  - Shows package installation status
  - Displays version information
  - Checks for available updates
  - Shows installation location
  - Provides installation suggestions

- 📚 **Extensive Documentation** - 5 new comprehensive guides
  - `PYTHON_DETECTION_METHODS.md` - All 8 detection methods explained with scenarios
  - `SETUP_WIZARD_UPDATE.md` - Complete wizard implementation details
  - `WIZARD_TESTING.md` - 10 test cases with step-by-step instructions
  - `WIZARD_VISUAL_GUIDE.md` - UI mockups and interaction flows
  - `WORKSPACE_COMPARISON.md` - Fallback workspace structure documentation

### Changed

- 🧹 **Removed auto-create default workspace** - User must manually create workspace now
  - Prevents unnecessary folder creation
  - Cleaner first-time experience
  - User explicitly chooses workspace location

- 🎨 **Redesigned Actions Panel** - More compact button layout
  - Changed from single-row to 3-column grid
  - Added "Welcome" button for easy access
  - Smaller icons and labels for better space usage
  - Added tooltips for clarity
  - Added new "Check" button for system diagnostics

- 📖 **Welcome Page Styling** - Responsive and compact design
  - Reduced padding and margins for tighter layout
  - Smaller header and logo sizes
  - Improved responsive grid for mobile
  - Better visual hierarchy
  - Enhanced button hover states

### Fixed

- 🐛 **pyenv Python detection** - Now properly detects rapidkit-core in pyenv versions
  - Checks all pyenv Python versions, not just system
  - Uses both `pyenv exec` and direct path methods
  - Solves issue where package in v3.10.19 wasn't detected when global=3.13.5

- 🐛 **Workspace already exists handling** - Returns existing workspace instead of error
  - Silently skips duplicate workspace additions
  - Prevents duplicate notifications
  - Better user experience when adding same workspace twice

- 🐛 **Extension activation flow** - Removed async initialization race conditions
  - Fixed timing issues with context key setup
  - Improved command registration reliability
  - Better error handling during activation

### Documentation

- PYTHON_DETECTION_METHODS.md now fully English
- Improved clarity for international users
- Better maintainability

### Technical Details

**New Files:**

- `src/commands/checkSystem.ts` — Quick system status check
- `src/utils/errorParser.ts` — Error parsing and suggestions
- `docs/PYTHON_DETECTION_METHODS.md` — Detection methods documentation
- `docs/SETUP_WIZARD_UPDATE.md` — Setup wizard implementation guide
- `docs/WIZARD_TESTING.md` — Comprehensive test cases
- `docs/WIZARD_VISUAL_GUIDE.md` — UI/UX documentation
- `docs/WORKSPACE_COMPARISON.md` — Workspace structure reference
- `releases/RELEASE_NOTES_v0.5.1.md` — Release notes

**Modified Files:**

- `src/commands/doctor.ts` — Added version checking and npm detection
- `src/utils/pythonChecker.ts` — Added 8-method detection (4 more methods)
- `src/ui/panels/welcomePanel.ts` — Complete wizard integration
- `src/ui/webviews/actionsWebviewProvider.ts` — 3-column layout
- `src/extension.ts` — Removed auto-workspace, added checkSystem command
- `src/core/workspaceManager.ts` — Better duplicate handling
- `package.json` — Updated to v0.5.1
- `README.md` — Updated for new features
- `CHANGELOG.md` — This entry
- `RELEASE_NOTES.md` — Updated latest release

## [0.5.0] - 2026-02-01

### Added

- 📋 **Shared Workspace Registry** - Cross-tool workspace discovery with npm package
  - Registry stored at `~/.rapidkit/workspaces.json`
  - Extension auto-detects workspaces created via npm package
  - npm package can list workspaces created by Extension
  - Workspace detection from any subdirectory using registry fallback

### Changed

- 🏷️ **Unified Workspace Signature** - Changed from `RAPIDKIT_VSCODE_WORKSPACE` to `RAPIDKIT_WORKSPACE`
  - Improves cross-tool compatibility with npm package
  - Constants centralized in `constants.ts` (no hardcoded strings)
  - Workspace markers include `createdBy: 'rapidkit-vscode'` for attribution
  - Backward compatible: Both old and new signatures are recognized

- 🔍 **Enhanced Workspace Detection** - Multi-layer workspace discovery
  - Primary: `.rapidkit-workspace` marker file with signature validation
  - Fallback: Structure detection (pyproject.toml + .venv + rapidkit script)
  - Last resort: Shared registry lookup (`~/.rapidkit/workspaces.json`)

- 🎯 **Project Selection UX** - Visual indicators for selected project
  - Checkmark (✓) shows currently selected project
  - Blue color highlight for active selection
  - Tooltip displays selection status
  - Better guidance when project selection required

### Fixed

- ✅ **Workspace Creation** - Removed unnecessary Python validation
  - Workspace creation no longer requires Python pre-flight checks
  - Python only needed for project creation (not workspace structure)
  - Clearer error messages distinguish workspace vs project requirements

- ✅ **Module Addition** - Robust workspace detection
  - Uses `findWorkspace` utility with registry fallback
  - Clear messages showing installation target
  - Better error handling when workspace not found

- ✅ **Attribution Consistency** - All workspace markers use correct constants
  - Fixed hardcoded strings in `extension.ts`, `createWorkspace.ts`, `createProject.ts`
  - Centralized constants prevent attribution mismatches
  - Proper `createdBy` tracking (Extension vs npm package)

### Documentation

- 📝 Added workspace registry documentation to README
- 📝 Documented cross-tool compatibility workflow
- 📝 Added examples for npm/Extension interoperability

- **🐍 Python Core Bridge** - Direct integration with `rapidkit-core` Python engine
  - Smart Python detection with 3 resolution scenarios (System Python with core, System Python without core, No Python)
  - Cached venv management in `~/.cache/rapidkit/` (prevents repeated setup)
  - JSON result protocol aligned with npm package for reliable interop
  - Auto-fallback chain: System → Cached Venv → Workspace Venv
  - Zero-configuration: Works out of the box across platforms

- **🔗 Cross-platform Exec Utilities** - Stable command execution
  - Transparent handling of `python3` (Unix) vs `python` (Windows)
  - Proper stdout/stderr capture and exit code handling
  - Timeout management to prevent hanging commands
  - Process isolation with automatic cleanup

- **🎯 Project Context Tracking** - Enhanced project/workspace awareness
  - Tracks selected project in workspace
  - Provides context for module commands
  - Better command routing based on project type (FastAPI vs NestJS)

- **📦 Bridge-Aware Doctor Command** - System diagnostics include Python engine
  - Checks Python availability
  - Verifies `rapidkit-core` installation
  - Detects cached bridge environments
  - npm integration status

### Changed

- **🔄 All commands delegate to Python Core** - Extension is now a smart UX bridge
  - `createWorkspace` → Python engine via bridge
  - `createProject` → Python engine via bridge
  - `addModule` → Python engine via bridge
  - `doctor` → Includes Python/core diagnostics
  - Single source of truth: Python engine handles all generation logic

- **🔄 Workspace Detection Enhanced**
  - Auto-discovers RapidKit workspaces in standard locations
  - Better marker file handling (npm-compatible `RAPIDKIT_VSCODE_WORKSPACE`)
  - Remembers last-selected workspace per project
  - Supports custom workspace paths

- **🔄 Module Explorer Refactored** - Using Python bridge
  - Queries modules from Python engine
  - Better module search and filtering
  - Aligned with npm package module catalog

- **🔄 Aligned with rapidkit-npm v0.15.1**
  - Marker format: `RAPIDKIT_VSCODE_WORKSPACE`, `createdBy: rapidkit-npm`
  - Do not overwrite marker when npm already wrote it
  - Constants: `MARKERS.WORKSPACE_SIGNATURE` = `RAPIDKIT_VSCODE_WORKSPACE`
  - API alignment: `RapidkitJsonResult<T>` protocol

### Fixed

- 🐛 Workspace context lost when quick-switching between projects
- 🐛 Module commands failing due to missing project context
- 🐛 Cross-platform Python inconsistencies (hardcoded `python3` paths)
- 🐛 Process cleanup on command timeout

### Technical Details

**New Files:**

- `src/core/bridge/pythonRapidkit.ts` — Python bridge with Scenario A/B/C resolution
- `src/utils/exec.ts` — Cross-platform command execution wrapper
- `src/core/selectedProject.ts` — Project context management

**Refactored Files:**

- `src/core/rapidkitCLI.ts` — Bridge integration
- `src/commands/{addModule,createProject,createWorkspace,doctor}.ts` — Bridge delegation
- `src/core/{workspaceDetector,workspaceManager}.ts` — Enhanced detection
- `src/ui/treeviews/moduleExplorer.ts` — Python bridge backend
- `src/utils/constants.ts` — Marker alignment

---

## [0.4.7] - 2026-01-23

### Fixed

- **🐛 Missing workspace directory handling** - Fixed crash when selected workspace no longer exists
  - Extension now detects when workspace directory has been deleted
  - Shows helpful options: "Recreate Workspace", "Choose New Location", or "Cancel"
  - Automatically recreates workspace if user chooses to do so
  - Prevents `ENOENT: no such file or directory` error when creating projects
  - No need to restart VS Code if workspace is accidentally deleted

### Changed

- **📦 Updated dependencies** - Updated 11 packages to latest stable versions
  - @types/node: 20.19.24 → 20.19.30
  - @types/vscode: 1.106.1 → 1.108.1
  - @typescript-eslint/\*: 8.48.1 → 8.53.1
  - vitest: 4.0.15 → 4.0.18
  - @vitest/coverage-v8: 4.0.15 → 4.0.18
  - prettier: 3.7.4 → 3.8.1
  - fs-extra: 11.3.2 → 11.3.3
  - @vscode/test-cli: 0.0.4 → 0.0.12
  - Fixed 3 security vulnerabilities (1 low, 2 moderate)
- **🔄 Compatibility** - Synced with rapidkit-npm v0.14.2
  - Compatible with latest npm package features
  - Aligned documentation and messaging

## [0.4.6] - 2026-01-01

### Added

- **🐍 Smart Poetry virtualenv detection** - Extension now detects Poetry virtualenvs in cache
  - Checks both `.venv` in project directory and Poetry cache (`~/.cache/pypoetry/virtualenvs/`)
  - Uses `poetry env info --path` to find virtualenv location
  - Eliminates false "not initialized" warnings for Poetry projects
  - Synced with rapidkit-npm v0.14.1 Poetry detection improvements
- **🔔 Update notification system** - Automatic checks for rapidkit npm package updates
  - Checks NPM registry every 24 hours for new versions
  - Shows notification with update, release notes, and dismiss options
  - Manual check command: `RapidKit: Check for Updates`
  - Respects user preferences (can dismiss specific versions)
- **📦 Enhanced Doctor command** - Better Poetry detection in system check
  - Shows exact Poetry version instead of raw output
  - Improved error messages and recommendations

### Changed

- **🧹 Removed redundant activationEvents** - Cleaned up package.json
  - VS Code auto-generates activation events from contributes
  - Removed 26 lines of deprecated configuration
  - No functional changes, just cleaner code

### Fixed

- **🐛 Poetry cache virtualenv support** - FastAPI projects no longer show false initialization warnings
  - Before: Extension only checked for `.venv` folder
  - After: Checks Poetry cache, `.venv`, and Poetry config
  - Aligns with rapidkit-npm v0.14.1 behavior

## [0.4.5] - 2025-12-23

### Added

- **🖼️ rapidkit.svg** - Official RapidKit brand icon in SVG format
  - 3-layer design: shadow (#1C1C1C), main R (#00CFC1), crown (#1C1C1C)
  - 24x24 viewBox, scalable to any size
- **🎨 ACTIONS WebviewView** - Completely redesigned sidebar with professional buttons
  - Replaced TreeView with WebviewView for rich UI
  - Minimal, compact design (GitLens-style)
  - Inline SVG icons (codicons don't work in webviews)
  - Framework badges: `PY` for FastAPI, `TS` for NestJS
  - Smooth hover effects with brand colors
  - Organized sections: Create, Tools, Resources
- **⚡ Project Quick Actions** - 5 inline action buttons on each project in PROJECTS panel
  - `$(terminal)` **Open Terminal** - Opens terminal in project directory
  - `$(package)` **Install Dependencies** - Runs `npx rapidkit init`
  - `$(play)` **Start Dev Server** - Runs `npx rapidkit dev`
  - `$(beaker)` **Run Tests** - Runs `npx rapidkit test` ✨ NEW
  - `$(globe)` **Open Browser** - Opens `localhost:8000/docs` with options ✨ NEW
- **📂 Project File Tree** - Expand project to see key files
  - Shows `src/`, `tests/`, config files, README
  - Click any file to open it in editor
  - Smart detection based on framework (FastAPI vs NestJS)

### Changed

- **🎨 Welcome Panel SVG Logo** - Upgraded from PNG to SVG for better quality
  - Uses `rapidkit.svg` instead of `icon.png`
  - Crisp rendering at any size
  - Official brand colors: #00CFC1 (cyan) + #1C1C1C (shadow)
- **📝 Better Description** - Updated marketplace description to match website
  - New: "Scaffold production-ready FastAPI & NestJS APIs with clean architecture"
- **🎨 Improved Project Icons** - Framework-specific icons and colors
  - 🐍 Python icon (green) for FastAPI projects
  - 🟢 Class icon (red) for NestJS projects
- **📖 README Sync** - Aligned with npm package documentation
  - Commands now show `npx rapidkit` prefix
  - Python requirement updated to 3.11+
  - Added 27+ modules link

### Fixed

- **🐛 Remove annoying workspace switch** - Clicking project no longer switches VS Code workspace
  - Before: Click = reload entire VS Code with new workspace 😱
  - After: Click = expand/collapse, use action icons instead ✅
- **🐛 rapidkitTemplates error** - Removed orphan TreeView registration
  - Fixed "No view is registered with id: rapidkitTemplates" notification

### Requirements

- **VS Code** 1.100+ (updated from 1.85)

## [0.4.4] - 2025-12-22

### Added

- **🩺 RapidKit npm check in Doctor** - System check now verifies `npx rapidkit --version`
  - Shows installed version or "Not cached" status
  - Helps diagnose npm package availability

### Changed

- **🔄 Dynamic version markers** - Marker files now use extension version from package.json
  - New `getExtensionVersion()` utility function
  - Centralized constants in `utils/constants.ts`
  - No more hardcoded version strings

### Fixed

- **🐛 TypeScript error** - Added `'preview'` to `RapidKitModule.status` type
  - Fixed 30 compilation errors in `moduleExplorer.ts`
- **📝 CHANGELOG links** - Updated version links to include all releases (0.4.0-0.4.3)

## [0.4.3] - 2025-12-12

### Added

- **🧩 Enhanced Module Explorer** - Complete module catalog with 27 modules across 12 categories
  - 🌟 AI (1 module)
  - 🛡️ Authentication (5 modules)
  - 💳 Billing (3 modules)
  - 💼 Business (1 module)
  - ⚡ Cache (1 module)
  - 📧 Communication (2 modules)
  - 🗄️ Database (3 modules)
  - 🔧 Essentials (4 modules)
  - 📊 Observability (1 module)
  - 🔒 Security (3 modules)
  - ✅ Tasks (1 module)
  - 👤 Users (2 modules)
  - All modules marked with "🔜 Coming Soon" preview status

### Changed

- **🎨 UI/UX Improvements**
  - Removed TEMPLATES tab (redundant, simplified sidebar)
  - Enhanced ACTIONS panel with categorized links (Quick Start, Resources, Feedback)
  - Optimized context menus - moved dangerous operations (Delete, Remove) to bottom using `z_danger@99` group
  - Upgraded status bar to show project count: `🚀 RapidKit | X Projects | Ready`
- **📢 Enhanced Notifications** - Added action buttons for better workflow
  - After project creation: `📂 Open in Editor`, `⚡ Open Terminal`, `🧩 Add Modules`, `📖 View Docs`
  - After adding module: `📖 View Module Docs`, `➕ Add Another Module`
  - System check results: `📊 View Full Report` or `🔧 View Issues`
- **📝 Welcome Page** - Updated version reference to `v0.4.x` for consistency

### Fixed

- Doctor command async/await handling for notification action buttons
- Terminal integration for post-creation workflows

## [0.4.2] - 2025-12-05

### Added

- **🪵 Logging Commands** - New command palette options for log management
  - `rapidkit.showLogs` - Display RapidKit logs output panel
  - `rapidkit.closeLogs` - Close the logs panel
  - `rapidkit.clearLogs` - Clear all logs output
- **Logger Enhancements**
  - Added `clear()` method to Logger class
  - Added `getOutputChannel()` method for direct OutputChannel access

### Changed

- **📺 Marketplace Presentation**
  - Replaced static PNG screenshot with animated GIF (1200×642px)
  - Removed duplicate icon from README
  - Optimized README layout for marketplace gallery

## [0.4.1] - 2025-12-04

### Changed

- 📝 **Updated notification messages** for rapidkit npm v0.12.3 smart CLI delegation
  - Project success: Shows `rapidkit init && rapidkit dev` (no source activate needed)
  - Workspace success: Shows `rapidkit create` command tip
- 📚 **New README** - Completely rewritten for clarity and quick reference
  - Added screenshot for marketplace gallery
  - Simplified structure with project commands and keyboard shortcuts
  - Clear requirements table

### Documentation

- 📁 Moved all release notes to `releases/` folder for cleaner root
- Created main `RELEASE_NOTES.md` with links to history
- Removed `.vsix` files from git tracking
- Added `preview` and `qna` fields to package.json for marketplace

## [0.4.0] - 2025-12-03

### 🚀 **MAJOR REFACTORING: Complete Migration to npm Package**

This is a **breaking change** that completely refactors the extension to use the RapidKit npm package instead of Python CLI.

### Changed

- 🔄 **Complete architecture overhaul** - Migrated from Python-based CLI to npm package
  - **RapidKitCLI Class**: Completely rewritten to use `npx rapidkit` commands
  - Removed Python/Poetry dependencies - no longer required
  - Workspace creation: `npx rapidkit <workspace-name>`
  - Project creation: `npx rapidkit <project> --template <fastapi|nestjs>`
  - Workspace projects: `rapidkit create <project> --template <template>`
  - All CLI commands use `--yes` flag for non-interactive mode

- 📦 **Smart Location Detection** - Intelligent workspace and project location management
  - **3-Scenario Detection**: Selected workspace → Current RapidKit workspace → Ask user
  - **Default Workspace**: `~/RapidKit/rapidkits/` (automatically created if needed)
  - **Custom Locations**: Full support for user-selected directories outside RapidKit
  - **Auto-Registration**: Workspaces automatically added to manager after creation
  - **Marker Files**: `.rapidkit-workspace` created for custom locations to enable extension recognition

- 🎯 **Simplified wizards**
  - **WorkspaceWizard**: Only asks for workspace name (location always `~/RapidKit/`)
  - **ProjectWizard**: Accepts preselected framework for direct FastAPI/NestJS creation
  - Removed package manager selection (always uses npm)
  - Removed git initialization prompt (always enabled)
  - Streamlined user experience with fewer prompts

- ⚡ **Updated commands**
  - `createWorkspace`: Uses `npx rapidkit` to create workspace containers
  - `createProject`: Smart location detection with default/custom choice
  - `createFastAPIProject`: Direct FastAPI project creation (NEW)
  - `createNestJSProject`: Direct NestJS project creation (NEW)
  - `openDocs`: Open RapidKit documentation (NEW)

- 🎨 **Button-Style Actions UI** - Professional action buttons in sidebar
  - Removed traditional tree view items
  - Added button-style actions similar to Source Control view
  - Proper newline formatting for better UX
  - Quick access to Create Workspace, FastAPI, and NestJS projects

- 🔧 **Type system updates**
  - Simplified `WorkspaceConfig`: Removed `mode`, `installMethod`, `pythonVersion`
  - Simplified `ProjectConfig`: Removed `kit`, `modules`, `author`, `license`, `description`
  - Focused on essential configuration only

- ✅ **Enhanced Workspace Validation** - No more annoying confirmation dialogs
  - Accepts workspaces with `.rapidkit/` directory (npm CLI created)
  - Accepts workspaces with `.rapidkit-workspace` marker (extension created)
  - Supports both old (`RAPIDKIT_VSCODE_WORKSPACE`) and new (`rapidkit-vscode`) signatures
  - Silently skips invalid folders instead of prompting user

### Removed

- ❌ **Python CLI dependencies**: No longer depends on Python RapidKit CLI
- ❌ **Generate Demo feature**: Removed (unnecessary with only 2 templates)
- ❌ **Demo workspace mode**: Workspaces are now standard npm package workspaces
- ❌ **Kit selection**: Templates are managed by npm package
- ❌ **Module wizard step**: Module installation moved to post-creation workflow
- ❌ **Poetry integration**: Not needed anymore
- ❌ **Annoying confirmation dialogs**: "Add it anyway?" removed

### Added

- ✨ **npm package integration**: Full integration with `rapidkit` npm package (v0.12.1+)
- ✨ **Smart location choice**: Default workspace vs Custom location with intelligent detection
- ✨ **Marker file system**: `.rapidkit-workspace` files for custom location recognition
- ✨ **Auto-registration**: Workspaces automatically appear in list after creation
- ✨ **Direct framework commands**: Separate commands for FastAPI and NestJS
- ✨ **Better error handling**: Contextual help links to documentation
- ✨ **Improved progress reporting**: More accurate progress indicators
- ✨ **Verification steps**: Automatic project/workspace verification after creation
- ✨ **Parent directory creation**: `fs.ensureDir()` before all CLI calls to prevent ENOENT errors

### Fixed

- 🐛 **Fixed interactive prompts blocking**: Added `--yes` flag to all CLI commands
- 🐛 **Fixed custom location not showing in list**: Auto-registration after project creation
- 🐛 **Fixed workspace validation**: Enhanced to accept npm CLI created workspaces
- 🐛 **Fixed directory creation errors**: Parent directories created before CLI execution
- 🐛 **Fixed import order conflict**: Moved path import inside function to avoid variable shadowing

### Benefits

- 🎯 **Simpler**: No Python/Poetry installation required
- ⚡ **5-6x Faster**: Direct npm execution vs Python environment setup
- 🔄 **Consistent**: Single source of truth (npm package) for templates
- 🐛 **Fewer bugs**: Less complexity = fewer edge cases
- 📦 **Smaller**: Removed bundled templates (managed by npm package)
- 🎨 **Better UX**: Smart defaults, no annoying dialogs, professional UI

### Migration Notes

- **For Users**: Extension now requires Node.js/npm (already available in VS Code)
- **For Developers**: Python RapidKit CLI no longer needed for development
- **Workspaces**: Existing workspaces continue to work, new API for creation
- **Templates**: Managed by npm package, always up-to-date
- **Custom Locations**: Now fully supported with marker files

### Technical Details

- Updated `RapidKitCLI` class with new methods:
  - `createWorkspace(options)`: Workspace creation with `--yes` flag
  - `createProject(options)`: Standalone project creation with `--yes` flag
  - `createProjectInWorkspace(options)`: Project inside workspace with `--yes` flag
- Enhanced `WorkspaceManager.isRapidKitWorkspace()` to check both `.rapidkit/` and marker files
- Refactored all command handlers to use new CLI API
- Updated TypeScript types to match new simplified workflow
- Removed legacy Python CLI integration code
- Added marker file creation for custom locations

## [0.3.2] - 2025-12-03

### Changed

- 🌐 **Updated domain references** - Migrated all URLs from `rapidkit.top` to `www.workspai.com`
  - Updated package.json viewsWelcome contents
  - Updated README.md documentation links and support email
  - Updated source files (createWorkspace.ts, welcomePanel.ts)
  - Updated CONTRIBUTING.md contact information
  - Updated schema URLs to use new domain
- ⚡ **Enhanced development workflow** - Added comprehensive developer tools
  - Added `husky` for Git hooks management
  - Added `lint-staged` for pre-commit code quality checks
  - Added `typecheck` script for TypeScript validation
  - Added `validate` script combining typecheck, lint, format check, and tests
  - Configured pre-commit hook to run lint-staged automatically
- 📦 **Updated dependencies** - Upgraded to latest stable versions
  - Updated `@types/vscode` to 1.106.1
  - Updated `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` to 8.48.1
  - Updated `@vitest/coverage-v8` and `vitest` to 4.0.15
  - Updated `@vscode/vsce` to 3.7.1
  - Updated `execa` to 9.6.1
  - Updated `prettier` to 3.7.4
  - Updated `yaml` to 2.8.2
  - Updated `lint-staged` to 16.2.7

### Fixed

- 🔒 **Security improvements** - Fixed npm audit vulnerabilities
  - Fixed glob vulnerability (GHSA-5j98-mcp5-4vw2)
  - Fixed js-yaml prototype pollution (GHSA-mh29-5h37-fv8m)
  - Resolved all moderate and high severity vulnerabilities
- 🐛 **Code quality fixes** - Cleaned up ESLint warnings
  - Fixed empty catch blocks in generateDemo.ts
  - Added meaningful comments to intentionally empty catch blocks
  - Reduced ESLint warnings from 13 to 9 (errors eliminated)

### Documentation

- 📚 Updated all documentation links to point to www.workspai.com
- 📧 Updated support email to support@rapidkitlabs.com
- 🔗 Updated schema references to use new domain

## [0.3.1] - 2025-11-15

### Fixed

- 🐛 **Fixed code quality warnings** - Addressed 9 ESLint warnings related to unused error variables
  - Prefixed unused error variables with underscore (`_error`) per ESLint rules in:
    - `src/commands/doctor.ts` (4 warnings fixed)
    - `src/core/workspaceManager.ts` (4 warnings fixed)
    - `src/ui/treeviews/projectExplorer.ts` (1 warning fixed)
  - Improved error handling patterns for consistency

### Changed

- Modified test infrastructure to disable Vitest tests until VS Code mocking is properly configured
- Updated npm test script to focus on compilation and linting verification
- Updated vitest.config.ts to exclude test files requiring VS Code API

## [0.3.0] - 2025-11-10

### Fixed

- 🐛 **CRITICAL FIX: Fixed Generate Demo Project hanging issue** - The command was using `stdio: 'pipe'` which prevented output from being shown to users, making it appear frozen
  - Changed `stdio: 'pipe'` to `stdio: 'inherit'` in `RapidKitCLI.generateDemo()`
  - Changed `stdio: 'inherit'` in `RapidKitCLI.createWorkspace()` for consistent output streaming
  - Progress indicator now updates every 500ms so users can see the operation is running
- Fixed Generate Demo Project button to work correctly with demo workspaces
- Fixed command to automatically detect and use `generate-demo.js` script in demo workspaces
- Added automatic workspace context retrieval when Generate Demo button is clicked
- Demo workspaces now properly generate projects without requiring folder selection

### Changed

- Improved `generateDemoCommand` to accept workspace parameter and retrieve selected workspace from context
- Added progress interval tracking during demo project generation
- Added `rapidkit.getSelectedWorkspace` command to ProjectExplorer for getting current workspace
- Enhanced demo workspace detection logic to check for `generate-demo.js` file

## [0.2.0] - 2025-11-08

### Changed

- ⚡ **Bundle Optimization**: Reduced extension bundle size by 55% (464KB → 209KB)
- Enabled aggressive tree-shaking to remove unused code
- Removed console.log statements and debugger calls in production builds
- Removed legal comments from bundled output
- Improved extension load time and performance

### Fixed

- Fixed production mode detection in esbuild configuration (now supports both `--production` flag and `NODE_ENV=production`)

## [0.1.3] - 2025-11-07

### Fixed

- Fixed NestJS projects not appearing in Projects view
- Project explorer now correctly detects both FastAPI (pyproject.toml) and NestJS (package.json) projects

### Changed

- Simplified kit selection to show only `standard` kit for both frameworks
- Removed incomplete kits (advanced, ddd) from project creation wizard until they are fully ready

## [0.1.2] - 2025-11-07

### Fixed

- 🔥 **CRITICAL FIX**: Fixed commands not being registered when installed from VSIX package
- Fixed missing runtime dependencies in packaged extension causing activation failures
- Fixed "command 'rapidkit.createWorkspace' not found" errors
- Fixed "command 'rapidkit.addWorkspace' not found" errors
- Fixed "command 'rapidkit.refreshWorkspaces' not found" errors
- Updated `.vscodeignore` to include all necessary `node_modules` dependencies
- All buttons and commands now work correctly in installed VSIX

### Changed

- Improved dependency packaging to ensure runtime libraries are available
- Updated build configuration to prevent pruning of required dependencies
- Updated Vitest to v4.0.7 to align with @vitest/coverage-v8 peer requirements

## [0.1.1] - 2025-11-07

### Fixed

- 🔧 Fixed workspace and project selection context keys not being set properly
- Fixed buttons in workspace explorer not becoming enabled after selecting workspace
- Fixed project creation button not working in Projects view
- Fixed context menu items not appearing due to context key timing issues
- Improved async handling of context key updates to ensure proper UI state

## [0.1.0] - 2025-11-07

### Added

- 🎉 Initial pre-release version
- Workspace creation wizard with interactive prompts
- Project generation for FastAPI and NestJS frameworks
- Module browser with 100+ modules organized by category
- Template preview with syntax highlighting
- Project explorer tree view
- Module explorer tree view
- Template explorer tree view
- Workspace explorer tree view
- Status bar integration with real-time updates
- System doctor for checking requirements (Python, Node.js, Poetry, Git)
- IntelliSense providers:
  - Code actions for quick fixes
  - Completion provider for configuration files
  - Hover provider for inline documentation
- Code snippets:
  - 6 Python snippets (FastAPI routes, services, repositories, tests)
  - 6 TypeScript snippets (NestJS modules, controllers, services, DTOs)
  - 5 YAML snippets (module configs, profiles, workspace definitions)
- JSON schema validation:
  - `.rapidkitrc.json` schema
  - `rapidkit.json` schema
  - `module.yaml` schema
- Commands:
  - `rapidkit.createWorkspace` - Create new RapidKit workspace
  - `rapidkit.createProject` - Create new project
  - `rapidkit.addModule` - Add module to project
  - `rapidkit.generateDemo` - Generate demo project
  - `rapidkit.previewTemplate` - Preview template
  - `rapidkit.doctor` - Check system requirements
  - `rapidkit.showWelcome` - Show welcome panel
  - `rapidkit.refreshProjects` - Refresh project list
  - `rapidkit.refreshWorkspaces` - Refresh workspace list
- Keyboard shortcuts:
  - `Ctrl+Shift+R Ctrl+Shift+W` - Create workspace
  - `Ctrl+Shift+R Ctrl+Shift+P` - Create project
  - `Ctrl+Shift+R Ctrl+Shift+M` - Add module
- Welcome webview panel with quick actions
- Template preview webview panel
- File watchers for auto-refresh on changes
- Configuration options:
  - `rapidkit.pythonVersion` - Python version requirement
  - `rapidkit.nodeVersion` - Node.js version requirement
  - `rapidkit.defaultFramework` - Default framework selection
  - `rapidkit.showWelcomeOnStartup` - Show welcome on startup
  - `rapidkit.autoRefresh` - Auto-refresh on file changes
  - `rapidkit.debug` - Enable debug logging
- Context menu integration
- Activity bar integration with RapidKit icon
- Output channel for detailed logging
- Demo mode for quick workspace creation
- Package manager selection for NestJS projects (npm, yarn, pnpm)

### Fixed

- NestJS project creation package manager parameter handling
- Extension activation on startup
- Command registration order for reliable button functionality

---

## Release Notes

### 0.1.0

🎉 **First Pre-Release**

Welcome to RapidKit for Visual Studio Code! This is the first pre-release of the official VS Code extension for RapidKit.

**Key Features:**

- 🚀 Create workspaces and projects with interactive wizards
- 🧩 Browse and install 100+ modules
- 📦 Preview templates before generation
- 💡 IntelliSense support for configuration files
- 📝 Code snippets for FastAPI and NestJS
- 🔧 System doctor for troubleshooting

**Getting Started:**

1. Click the RapidKit icon in the Activity Bar
2. Click "Create New Workspace" to get started
3. Follow the wizard to create your first project
4. Add modules from the Module Explorer
5. Start coding!

**Important Notes:**

- This is a pre-release version - please report any issues
- Demo mode is enabled by default for easy testing
- Full mode will be available in future stable releases

**Feedback:**
We'd love to hear your feedback! Please report issues or suggestions on our [GitHub repository](https://github.com/chistiq/rapidkit-vscode/issues).

Thank you for using RapidKit! 🚀

---

[Unreleased]: https://github.com/chistiq/rapidkit-vscode/compare/v0.32.0...HEAD
[0.32.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.32.0
[0.31.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.31.0
[0.30.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.30.0
[0.29.1]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.29.1
[0.29.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.29.0
[0.28.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.28.0
[0.27.3]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.27.3
[0.24.1]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.24.1
[0.24.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.24.0
[0.18.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.18.0
[0.12.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.12.0
[0.6.1]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.6.1
[0.4.5]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.4.5
[0.4.4]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.4.4
[0.4.3]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.4.3
[0.4.2]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.4.2
[0.4.1]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.4.1
[0.4.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.4.0
[0.3.2]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.3.2
[0.3.1]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.3.1
[0.3.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.3.0
[0.2.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.2.0
[0.1.3]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.1.3
[0.1.2]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.1.2
[0.1.1]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.1.1
[0.1.0]: https://github.com/chistiq/rapidkit-vscode/releases/tag/v0.1.0
