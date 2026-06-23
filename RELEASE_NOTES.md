# Release Notes

## v0.35.0 (unreleased)

### ✦ Enterprise Dashboard, Incident Studio Redesign, and npm Governance Pipeline

Summary:
- Ship the next extension release after marketplace **`0.34.0`**, covering nine local commits of deep dashboard, studio, design-system, and AI wiring work — plus npm **`0.34.0`** governance pipeline parity (`rapidkit pipeline`). Extension and npm version lines remain independent.

Highlights:

**Enterprise dashboard**
- Close **Command → Evidence → Next Step** with host bridges, activity trail, ops chain after workspace create/clone/import, fresh-install onboarding, and Incident Studio handoff from evidence cards.
- New surfaces: Operate/Evidence sections, `ReleaseHub`, `WorkspaceGovernancePanel`, `CommandCheatsheet`, pending-command UX across governance tiles.
- Enterprise-minimal UX pass: Guided Evidence shows one current path, view controls use compact `Guided / Workflows / All` labels, and secondary Run commands stay collapsed behind focused primary actions.
- **Workspai sidebar**: Workspai now contributes a standard VS Code Secondary Sidebar tab, with the Activity Bar Workspai view still available as fallback. The AI surface is intentionally minimal: `Create with AI / Workspace Advisor / Studio`, with a live vertical creation timeline for workspace/project planning, architecture questions, and deep Studio handoff.

**Incident Studio**
- Retire legacy `AIIncidentStudio` monolith; **`IncidentStudioVNext`** with ship loop, CLI surface, session persistence, AI action framework, policy/mutation gates, guided/lite/responsive Wave Y polish.
- Studio first view is lighter: Command Ribbon is the default entry point, sidebar toolboxes are collapsed by default, audit details open only after user selection, and chat/context/sidebar regions use calmer panel chrome.

**Design system**
- Workspai token layers (`workspai-primitives`, studio chrome, analyze report CSS), theme provider, drift-guard tests, and studio CSS extraction/verify scripts.

**AI & Setup**
- Creation intent heuristic, analyze report scoping, stable doctor/telemetry wiring; embedded Setup command-center with theme-safe loading; unpinned npx for npm CLI version verify.

**npm governance pipeline** (npm `0.34.0` CLI → extension `0.35.0`)
- `workspai.workspacePipeline`, `pipeline-last-run.json` evidence card, sidebar/dashboard/studio surfaces.

**Workspace adoption and multi-stack discovery**
- Extension adoption now calls the canonical npm contract first: `rapidkit adopt --json`.
- If npm is unavailable, the extension writes schema-aligned fallback metadata (`project.json`, `adopt.json`, `adopt-readiness.json`, `context.json`) and updates the workspace imported/adopted project registry.
- Adopted frontend/backend projects outside the workspace tree now remain visible across Dashboard, Sidebar, Evidence, and project-scope discovery after refresh.

**Enterprise hardening** (post-audit remediation)
- **Security**: workspace path boundary enforcement; Incident Studio inline CLI allowlist + `execa` without shell (no free `sh -c`).
- **Dashboard**: ops chain scoped per workspace; 120s step timeout; contract dispatch failures surface `dashboardCommandFailed` instead of silent no-ops.
- **Evidence**: strict project-doctor identity for workspace-level reports; bootstrap card always emitted.
- **Studio**: shared stabilization policy for mutation gates; `incomingMessage` merge and project scope in standalone panel.
- **Reliability**: coalesced evidence refresh (debounce + single follow-up); pending cards reconcile from activity completion/failure.
- **Studio stabilization (0.35.0)**: analyze evidence resync in VNext; project-scoped chat brain + command palette open; CLI mutation gate parity for guided commands; session save queue; scope selector guards; ContextPanel AI gate parity; chat error banner; stale host-handler refs fixed.
- **Release packaging**: `vscode:prepublish` now builds webview assets in production mode; VSIX package verified at `/tmp/workspai-0.35.0.vsix`.

Full detail: [`releases/RELEASE_NOTES_v0.35.0.md`](releases/RELEASE_NOTES_v0.35.0.md) (includes per-commit table).

Validation:
- `./node_modules/.bin/tsc --noEmit`
- `./node_modules/.bin/vitest run` (208 files / 1639 tests)
- `node scripts/release-stop-gate.mjs --skip-kpi`
- `env PATH=/tmp:$PATH ./node_modules/.bin/vsce package --no-dependencies --out /tmp/workspai-0.35.0.vsix`

Release posture: `enterprise-dashboard-studio-and-npm-governance-pipeline`

## v0.34.0 (June 10, 2026)

### ✦ CLI Parity: Infra, Foundation, Project Lifecycle, and Module Maintenance

Summary:
- Close major RapidKit npm CLI gaps inside the Workspai VS Code extension.
- Add workspace infrastructure orchestration (`infra plan/up/down/status`) with Docker readiness checks and compose file access.
- Add workspace foundation ensure with safe and force re-sync modes.
- Expose project build/start/lint/format and module upgrade/diff/checkpoint/rollback/uninstall from the sidebar with guarded UX.

Highlights:
- New **Infrastructure** workspace submenu wraps `rapidkit infra` with optional plan flags, volume-removal confirmation, and compose file open flow.
- **Foundation Ensure** sits in Run & Release and dispatches `workspace foundation ensure [--force]` with modal guardrails.
- Project tree now includes build, production start, lint, and format commands aligned with npm lifecycle adapters.
- **Module Maintenance** submenu reads installed modules from `registry.json`, supports dry-run previews, and requires confirmation before upgrade/rollback/uninstall.
- Added focused vitest suites asserting exact terminal command arrays for all new surfaces.

Validation:
- `npm run compile`
- `npm run lint`
- `vitest run`

Release posture: `cli-parity-and-workspace-command-surface`

## v0.33.0 (June 8, 2026)

### ✦ .NET Setup Runtime and Enterprise Profile Parity

Summary:
- Promote the extension release to `0.33.0` because `0.32.1` was pushed but not published to the marketplace.
- Complete `.NET` runtime setup coverage across the VS Code command palette and dashboard setup experience.
- Add `dotnet-only` profile parity across schemas, completions, hover help, AI creation, command reference, and workspace creation UI.
- Harden subprocess-based release gate tests and RapidKit CLI fallback tests so CI remains deterministic across operating systems.

Highlights:
- Setup Runtime now includes `.NET` alongside Python, Node.js, Go, and Java.
- The setup dashboard can detect, verify, and guide installation for `.NET SDK 8+`.
- Workspace bootstrap profiles now include `dotnet-only`, and polyglot/enterprise copy clearly includes `.NET`.
- Extension metadata now advertises `.NET Web API` and C# support for marketplace discovery.
- Drift guards now protect `.NET` and profile parity from silently regressing.

Validation:
- `./node_modules/.bin/tsc --noEmit`
- `./node_modules/.bin/vitest run`
- `./node_modules/.bin/eslint src --ext ts --max-warnings 100`
- `node scripts/sync-import-stack-parity-snapshot.mjs --check`
- `node esbuild.js --production`
- `node esbuild.js` from `webview-ui`

Release posture: `runtime-profile-parity-and-extension-stabilization`

## v0.32.1 (June 8, 2026)

### ✦ Runtime Command Surface Parity and Module Boundary Hardening

Summary:
- Align the Workspai extension with RapidKit npm `0.32.1` command contracts.
- Add a shared runtime command surface contract so scaffold kits, lifecycle commands, runtime tiers, and module-support boundaries cannot drift silently.
- Restrict AI module suggestions to FastAPI and NestJS, while clearly guiding Go, Spring Boot, and .NET users toward their native package ecosystems.
- Update dashboard, setup, command reference, module browser, module details, and AI creation surfaces to the pinned npm wrapper form.

Highlights:
- Extension-host calls now use `npx --yes --package rapidkit rapidkit ...` instead of relying on ambiguous local/global command resolution.
- FastAPI and NestJS remain module-capable; Go, Spring Boot, and .NET are scaffold/import/runtime-supported but do not expose RapidKit module marketplace suggestions.
- `.NET` AI creation copy now correctly explains NuGet/native adapter extension paths instead of reusing Spring Boot module text.
- Studio and README command snippets now use current `doctor workspace/project` scopes and pinned npm commands.
- Runtime parity tests cover scaffold kit exposure, AI module suggestion boundaries, command snippets, and npm wrapper usage.

Validation:
- `npm run typecheck`
- `npm run check:parity-snapshot`
- `vitest run src/test/runtimeCommandSurfaceParity.test.ts src/test/driftGuard.test.ts src/test/platformCapabilities.test.ts src/test/springSupportContracts.test.ts src/test/aiService.test.ts`
- `npm run lint:stabilization`
- `npm run build`
- `git diff --check`

Release posture: `contract-parity-and-extension-stabilization`

## v0.32.0 (June 2, 2026)

### ✦ Enterprise Workspai Dashboard and Workspace Contract Release

Summary:
- Redesign the Workspai dashboard as an enterprise command center for governed workspace operations.
- Add a contract-first workspace graph surface covering services, ports, dependencies, events, and contract file inspection.
- Align workspace archive, import, export, verify, and handoff flows with the npm workspace archive contract.
- Redesign core workspace, project, module install, module details, and AI creation modals with a consistent enterprise modal system.
- Refresh README and media documentation with the new dashboard, modal, module, and contract registry screenshots.

Highlights:
- Dashboard now separates workspace operations, project build actions, share/handoff actions, recent workspaces, templates, and module browsing with clearer scope boundaries.
- Project actions now focus on project-level operations and avoid showing workspace-local absolute paths in user-facing module surfaces.
- Added resilient webview error handling to prevent blank dashboard failures from hiding actionable recovery paths.
- Added updated screenshot set including `workspai-screenshot-9.png` for the Workspace Contract Registry documentation.
- Cleared npm audit findings with safe dependency updates and targeted transitive overrides for vulnerable test-cli dependencies.

Validation:
- `./node_modules/.bin/tsc --noEmit` passed during the release preparation window.
- `node esbuild.js` passed in `webview-ui`.
- `npm audit --json` reports 0 vulnerabilities.
- `git diff --check` passed.

## v0.31.0 (May 31, 2026)

### ✦ Stable Analyze Integration and Incident Studio Reuse

Summary:
- Move analyze lifecycle out of the redesign-only Incident Studio path and into the stable WelcomePanel / AIIncidentStudio experience.
- Add a reusable modular analyze helper with stable message handlers: `runAnalyze`, `loadReport`, and `revealEvidence`.
- Surface a dedicated `Workspace Live Diagnosis` analyze card with run-analyze guidance and retry support when analysis output is missing.
- Improve user flow so missing analyze data now prompts the user to run `rapidkit analyze` rather than leaving an empty state.

Highlights:
- Commit range included in this release (recent commits): `59aa208..HEAD` (see releases/RELEASE_NOTES_v0.31.0.md for details)

## v0.30.0 (May 27, 2026)

### ✦ Studio, AI, Incident & Workspace Hardening

Summary:
- Clarify structured AI response cards in Studio and improve card semantics.
- Improve chat clarity, stream timeout handling, and add an output quality gate.
- Surface a modal evidence contract used by incident/debug flows.
- Enrich AI debug actions and the architecture lens in editor surfaces.
- Harden verify-first release gates and verification flows for incidents.
- Add snapshot recovery and import hardening for workspace imports.
- Migrate organization and documentation domain references to rapidkitlabs / www.workspai.com.

Highlights:
- Commit range included in this release (recent 8 commits): `ce4ee8b..59aa208` (see releases/RELEASE_NOTES_v0.30.0.md for details)


## v0.29.0 (May 19, 2026)

### ✦ AI Stability And Enterprise Typing Hardening Release

Summary:
- This release packages the full git range from `v0.28.0` to current `HEAD` for publication as `0.29.0`.
- Focus is strict runtime reliability and enterprise typing consistency across AI and command execution paths.
- No expansion-oriented feature risk accepted in this release window.

Highlights:
- **Range included in this release** (`v0.28.0..HEAD`):
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
- **AI runtime hardening**:
  - stream lifecycle cleanup and timeout/cancellation safeguards in host AI execution
  - deterministic model matching and safer fallback behavior under model errors
  - duplicate stream-done emission prevention and robust message parsing in welcome panel flows
- **Command reliability and type safety**:
  - command-layer typing cleanup in module/project/workspace flows (`addModule`, `createProject`, `workspaceSelection`, and related command wiring)
  - doctor command and incident export provenance paths tightened for strict TypeScript contracts
  - legacy unsafe casts reduced via guarded unknown-narrowing patterns
- **Stabilization support module**:
  - added `src/ui/panels/welcomePanelChatBrainTracking.ts` for panel-level tracking support

Quality and validation:
- `npm run compile` passed.
- `npm run test` passed with all test files green.
- Lint remains warning-only for known backlog debt outside this release scope.

Release posture: `stabilization-only`

## v0.29.1 (May 23, 2026)

### ✦ Consolidated Stabilization & Feature Consolidation Release

Summary:
- This release consolidates a broad set of important stabilization, safety, and integration changes applied since `v0.29.0`. These are not "minor" editorial tweaks — they are deliberate stabilizations, safeguards, contract hardenings, and host/webview integrations that materially improve AI behavior, reliability, and governance.
- Notable surface areas include AI runtime lifecycle hardening, memory-policy contract enforcement, doctor/provenance reliability, incident verification gates, and the new opt-in Incident Studio integration (kept opt-in to avoid impacting the stable AI baseline).
- Also includes a localization cleanup and one deterministic textual ordering alignment to preserve contract tests (no functional change to runtime behavior).

Highlights:
- AI runtime and streaming hardening: deterministic model selection, safer fallback behaviors, stricter timeout and cancellation handling, duplicate stream-done prevention, and more defensive message parsing across host and webview flows.
- Memory and governance: local-processing memory policy profile surfaced and write-access contracts enforced end-to-end, memory influence audit timeline linked to decision artifacts.
- Incident Studio: new fullscreen redesign implemented as an opt-in webview (feature-flagged via `localStorage`). The redesign is shipped in-tree but does not alter existing AI command routing unless explicitly invoked.
- Doctor, provenance, and verify flows: stronger verify gates, provenance/export improvements, and deterministic verify/claim behavior to reduce false-positive success claims.
- CI & release governance: release-stop gate integration, parity snapshot checks, and smoke-matrix validation tightened for enterprise release posture.

Audit & validation:
- Full source-level audit: `npm run compile` and `tsc --noEmit` passed.
- Full test suite: `npx vitest run` — all tests passed (1013/1013) after a single safe textual ordering fix to satisfy a contract test.
- ESLint: warnings only (no blocking errors).

Release posture: `stabilization-only` (but consolidates many important stabilization and governance improvements)

Commit-level audit (v0.29.0..HEAD):

- `2ff3a50` — 2026-05-23 — chore: commit rapidkit-vscode stable extension changes; preserve current stable AI feature base
  - Files: `README.md`, `src/commands/aiFreeFeatures.ts`, `src/commands/chatParticipant.ts`, `src/commands/incidentStudioNext.ts`, `src/ui/panels/welcomePanel.ts`, `src/ui/panels/incidentStudioPanel.ts`, webview redesign files under `webview-ui/src/components/StudioRedesign/`, `webview-ui/src/lib/studioFeatureFlags.ts`, `webview-ui/esbuild.js`
  - Impact: High — contains the localization cleanup, a deterministic textual-order alignment in `welcomePanel.ts` to satisfy contract tests (no runtime behavioral change), and delivery of the Studio redesign files (opt-in).

- `ead47c2` — 2026-05-22 — feat(workspace): add autopilot release command integration
  - Files: `package.json`, `src/commands/workspaceOperations.ts`, `src/test/driftGuard.test.ts`, `src/ui/panels/welcomePanel.ts`
  - Impact: Low — release/autopilot infra; drift guard test and welcome panel adjusted for integration.

- `05c2c3d` — 2026-05-19 — stabilization: extract creation/report lanes in welcome panel
  - Files: `src/ui/panels/welcomePanel.ts`
  - Impact: Medium — refactors lanes in welcome panel, improving lifecycle clarity for creation/report flows.

- `19af650` — 2026-05-19 — stabilization: isolate activation and incident lanes (wave 2)
  - Files: `src/extension.ts`, `src/ui/panels/welcomePanel.ts`
  - Impact: Medium — isolates activation/incident lanes to reduce cross-effect during startup and incident handling.

- `96a6fab` — 2026-05-19 — fix(stabilization): harden polyglot watchers and AI stream reliability
  - Files: `src/core/aiModelSelection.ts`, `src/core/aiService.ts`, `src/extension.ts`, `src/ui/panels/welcomePanel.shared.ts`, `src/ui/panels/welcomePanel.ts`
  - Impact: High — core AI runtime and model-selection reliability fixes; important for streaming stability and fallback behavior.

Please review these commit-level notes; let me know if you want these committed (git commit + tag) and the autopilot release `--mode audit` run next.

## v0.28.0 (May 13, 2026)

### ✦ Enterprise E1/E2 Stabilization and Policy Boundaries Release

Summary:
- This release includes the entire commit range from `v0.27.3` to current `HEAD`.
- Delivers E1 execution hardening and E2.1-E2.5 private-brain and policy-boundary slices.
- Strengthens release governance with open-issue severity enforcement in CI release-stop flows.

Highlights:
- **Range included in this release** (`v0.27.3..HEAD`):
  - `7ebe77c` chore(ci): harden release gate with open-issue severity enforcement
  - `7111314` feat(e1): add versioned cross-service impact score contract v1
  - `33aa978` feat(stabilization): complete E1.3 E1.4 E1.5 execution
  - `31a1c5d` feat(e2.1): expose local-processing memory policy profile
  - `7b828b7` feat(e2.2): enforce workspace memory write access contract
  - `be68e00` feat(e2.3): add repro-pack sensitivity labeling end-to-end
  - `6969017` feat(e2.4): link memory influence timeline to decision artifacts
  - `80ebb71` feat(e2.5): harden memory-export security review coverage

- **E1 hardening delivered**:
  - versioned impact score contract (`v1`) wired and tested
  - confidence/scope safety behaviors and unknown-scope guardrails reinforced
  - expanded impact/architecture scenario coverage

- **E2 private-brain and policy boundaries delivered**:
  - E2.1: local-processing memory policy profile surfaced in host and payload
  - E2.2: memory write access contract enforced in write paths
  - E2.3: repro-pack sensitivity labels across host -> payload -> UI -> export
  - E2.4: memory influence audit timeline linked to decision artifacts (action/repro/release artifacts)
  - E2.5: security hardening coverage for memory/export redaction and policy-bound behavior

- **CI and release governance**:
  - release-stop automation strengthened with open-issue severity checks
  - issue-report export script added and used by release workflow checks

- **Code areas touched in this release window**:
  - Host orchestration and policy: `src/ui/panels/welcomePanel.ts`, `src/core/workspaceMemoryService.ts`
  - Impact/graph contracts: `src/core/systemGraphIndexer.ts`, `webview-ui/src/lib/incidentArchitectureLens.ts`
  - Repro/export safety: `src/ui/panels/incidentReproPackUtils.ts`, `webview-ui/src/lib/incidentStudioPayload.ts`, `webview-ui/src/components/AIIncidentStudio.tsx`
  - Governance and CI: `.github/workflows/extension-smoke-matrix.yml`, `scripts/release-stop-gate.mjs`, `scripts/export-open-issues-report.mjs`
  - Regression/drift coverage: `src/test/*` (impact, memory, payload, interaction, drift)

Release posture: `stabilization-only`

## v0.27.3 (May 12, 2026)

### ✦ Enterprise Stability Hardening Patch

Summary:
- Hardens Incident Studio trust semantics: no false "verification passed" claims under NO-GO or blocked verify gates.
- Makes guided flow deterministic and lower-noise (next + verify focus, dense action board hidden in guided mode).
- Expands stabilization KPI model with actionable anti-false-positive signals.
- Adds policy/evidence/provenance modules with dedicated unit regression suites.
- Enforces CI release-stop and formatting gates with deterministic fixture inputs.
- Adds parity snapshot sync/check automation and workspace boundary-safe registry fallback.

Highlights:
- **Incident Studio behavior and policy (webview + host)**
  - `webview-ui/src/components/AIIncidentStudio.tsx`:
    - verify-claim guard (`verificationClaimGuardReason`) added and enforced
    - GO decision downgraded to HOLD if verify gates block completion
    - explicit scope-truth and telemetry-truth labels rendered
    - guided mode now shows deterministic intent chips and hides dense action board
  - `src/ui/panels/incidentStudioPolicyGates.ts`: deterministic verify-completion gate enforcement
  - `src/ui/panels/incidentStudioResponseValidator.ts`: response contract validator (length/sections/commands/assumptions)
  - `src/ui/panels/incidentStudioVerifyRerun.ts`: one-click rerun state model
  - `src/ui/panels/incidentStudioVerifyDiff.ts`: failed vs passed output diff utilities
  - `src/ui/panels/incidentStudioEvidenceMapping.ts`, `incidentStudioEvidenceProvenance.ts`, `incidentStudioConfidenceUI.ts`, `incidentStudioExportProvenance.ts`: provenance-aware confidence and export surfaces

- **Command transport and scope reliability**
  - Portable execution command normalized to `npx --yes --package rapidkit rapidkit ...`
  - Display layer simplified to `rapidkit ...` for readability
  - Scope-aware execution routing and shell dispatch strengthened in `src/ui/panels/welcomePanel.ts`

- **Stabilization KPI expansion**
  - `src/utils/workspaceUsageTracker.ts` + payload contracts now include:
    - `routeFallbackNonSuccessShare`
    - `verifyIncompleteWarningRate`
    - `topVerifyPathMissReasonShare`
  - new threshold and gate fields propagated to Incident Studio card/snapshot logic

- **Core contracts and tooling**
  - New core modules:
    - `src/core/backendFrameworkContract.ts`
    - `src/core/verifyPackContractExporter.ts`
    - `src/core/workspaceHygieneProbes.ts`
  - Parity snapshot support:
    - `contracts/backend-import-stack-parity.snapshot.json`
    - `scripts/sync-import-stack-parity-snapshot.mjs`
    - `npm run sync:parity-snapshot`
    - `npm run check:parity-snapshot`

- **CI and release governance**
  - smoke matrix release gate now enforced without KPI bypass
  - smoke matrix includes `format:check` (non-Windows)
  - release-stop-gate uses deterministic fixture inputs:
  - `releases/wave3-kpi-marker.json`
  - `releases/wave3-claim-checklist.md`
  - `releases/wave3-enterprise-gate.json`
  - `releases/release-posture-label.md`

- **Regression coverage added**
  - New tests: `AIIncidentStudio.component`, `AIIncidentStudio.interaction`, `findWorkspace`, `importStackParity.snapshot`, `verifyPackContractExporter`, `workspaceHygieneProbes`
  - New Incident Studio policy/evidence/provenance test suites for confidence, export, policy gates, response validation, verify diff/rerun

Release posture: `stabilization-only`

## v0.27.2 (May 10, 2026)

### ✦ Webview Disposal Safety Patch

**Summary:** Eliminates `Webview is disposed` uncaught errors in the Setup & Installation panel that fired when the panel was closed mid-check.

- Added `_isDisposing` flag set immediately on `onDidDispose` to stop in-flight async callbacks
- Introduced `_safePostMessage()` guard method wrapping all `postMessage` calls with disposal check + try-catch
- Replaced all 20+ direct `postMessage` calls in `setupExperiencePanel.ts` with `_safePostMessage()`
- Moved `onDidReceiveMessage` listener into disposables with early-exit guard

**Scope:** `setupExperiencePanel.ts` only — no behavior changes, no new commands.

Release posture: `stabilization-only`

## v0.27.1 (May 10, 2026)

### ✦ Workspace Operations And Incident Reliability Patch

Summary:
- Ships workspace stage-run command suite and AI Workspace Command Center.
- Introduces project-scoped doctor command and incident wiring for project/workspace doctor actions.
- Hardens doctor telemetry envelope and timeline rendering in Incident Studio.
- Redacts path-sensitive report outputs and aligns command references to canonical `npx rapidkit` syntax.

Highlights:
- Added commands:
  - `Workspai: Workspace Run: Select Stage`
  - `Workspai: Workspace Run: Init`
  - `Workspai: Workspace Run: Test`
  - `Workspai: Workspace Run: Build`
  - `Workspai: Workspace Run: Start`
  - `Workspai: Project Health Check (Doctor)`
  - `Workspai: AI Workspace Command Center`
- `Workspai: Initialize Workspace (...)` now runs `npx rapidkit workspace run init` for consistent stage semantics.
- Incident Studio now routes doctor actions by scope (workspace vs selected project), and supports project doctor report viewing.
- `doctorTreatmentStatus` telemetry now includes trend, drift delta, scope provenance, traceability coverage, and probe severity counters.
- Command references and doctor tooltips standardized to `npx rapidkit doctor ...` forms.

Release posture: `stabilization-only`

## v0.27.0 (May 8, 2026)

### ✦ Stabilization Hardening Release

**Summary:** Enterprise-grade stabilization across routing, UI, telemetry, and test reliability. Extracts incident routing to a shared module, adds specialist intents, aligns phase-gate UI with backend telemetry gates, delivers data-driven action matrix, module graph tree, BYOP stack expansion, and enterprise gate fixtures.

**Quality gates:** typecheck ✓ | build ✓ | package ✓ | **731/731 tests ✓** (66 files)

**Release posture:** `stabilization-only` — expansion frozen until E1/E2/E3 enterprise epics green.

---

### Key Changes

- **`incidentRouting.ts`** — new shared routing module; specialist intents (DevOps/DB/Docs/Arch) with deterministic routing; tests import real implementation
- **Scope-aware suggested questions** — workspace vs project scope branching per specialist intent
- **Phase-gate UI** — `phaseContext` aligned with `telemetryRoutePrecisionPass`, `telemetryVerifyPathPass`, quality score ≥ 60, `verifiedOutcomes > 0`
- **Action Matrix** — stable matrix-prefixed IDs, resolver functions, canonical CLI action source
- **Module Graph Tree** — framework-grouped with severity filter + auto-reset stability guard
- **BYOP stacks** — django, flask, express, koa, rails, dotnet detection
- **Enterprise gate fixtures** — `consecutiveWindowsPass: 2` snapshots + posture label
- **Incident metrics + resume hardening** — NaN/negative sanitizers in telemetry and resume paths
- **Doctor telemetry** — `onError` hook + async catch for unhandled rejections
- **Release gate workflows** — paginated issue fetch, no fixture fallbacks, severity parser hardened
- **Test fixes** — 3 prompt policy route-precision tests corrected to reference `incidentRouting.ts`

### ✦ Stability & Strategic Alignment Release

**Summary:** Completes four independent hardening initiatives from the v0.25.0 session:
1. Browser smoke test action — new Incident Studio action type for AI-guided web application verification, aligned with VS Code 1.119 browser agent tools
2. Auto model selection regression fix — preserves literal `'auto'` string through all normalize helpers so Auto model UI state doesn't collapse
3. Smart rate-limit fallback — one-shot intelligent fallback on 429/quota/overloaded errors with cache reset before first streamed chunk
4. View controls UI polish — improved header button readability with larger icons/labels and dedicated CSS context

**Quality gates:** typecheck ✓ | build ✓ | 736/736 tests ✓

---

### Added

#### Browser Smoke Test Action (VS Code 1.119 Alignment)

New `browser-smoke-test` action type in Incident Studio enables AI-guided smoke testing of web applications. Opens project's dev server in VS Code simple browser and generates structured verification checklist:

**User trigger keywords:**
- `browser smoke`, `smoke test`, `ui smoke`
- `browser test`, `browser check`
- `verify ui`, `verify browser`, `open browser`

**AI generates report with:**
1. Smoke result (PASS/FAIL)
2. Verified endpoints (URL → HTTP status → pass/fail)
3. Detected issues
4. Recommended next step

**Implementation across four contract layers:**

1. **Action Matrix** (`incidentCliActionMatrix.ts`):
   - Entry ID: `project-browser-smoke-test`
   - Scope: `project` (project-scoped incidents only)
   - Stability: `advanced`
   - Command: `rapidkit dev`

2. **Prompt Policy** (`incidentStudioPromptPolicy.ts`):
   - Added to `INCIDENT_ACTION_ALLOWLIST`
   - Risk class: `non-mutating-executable` (read-only, no mutations)
   - Risk level: `low` (safe to execute automatically)
   - No impact review required
   - No verify-path required
   - Can complete incident without external verification

3. **Payload Contracts** (`incidentStudioPayload.ts`):
   - Integrated into `buildIncidentActionExecutionMetadata` non-mutating branch
   - Consistent risk classification across all layers

4. **Action Routing** (`welcomePanel.ts`):
   - New `RoutingResult` type variant: `'browser-smoke-test'`
   - Keyword matching for natural-language routing
   - Inline query builder that:
     - Detects running dev server port from `runningServers` registry
     - Opens VS Code simple browser with detected URL (graceful fallback if unavailable)
     - Generates AI-driven endpoint verification checklist

#### Model Selection Regression Fix

Fixed v0.25.0 regression where literal string `'auto'` was being normalized to null/undefined, breaking Auto model selection flow. All three normalize helpers now preserve `'auto'` as a real model value:

- `normalizeSelectedModelId(raw)` in `App.tsx`: converts only empty string → null; `'auto'` preserved
- `normalizeRequestedModelId(raw)` in `welcomePanel.ts`: converts only non-string or empty → undefined; `'auto'` preserved
- `normalizePreferredModelId(raw)` in `aiService.ts`: converts only empty string → undefined; any other string (including `'auto'`) preserved

**Impact:** Auto model selection now flows correctly through all three layers without collapsing to no-selection state.

#### Smart Rate-Limit Fallback

Implements intelligent one-shot fallback on retryable model errors (429, rate limit, quota, service unavailable, overloaded, busy):

**Error detection:**
- `isRetryableModelRequestError(err)`: regex matches 429, rate limit, quota, unavailable, overloaded, busy, service unavailable, model unavailable

**Fallback flow:**
1. `selectFallbackModelForFailure(failedModel)`: resets model selection cache and calls `selectModelAuto()` for alternative
2. If auto-select picks same model, falls back to raw model registry for different option
3. `emittedFromPrimary` guard: only retries if zero chunks streamed from primary (prevents duplicate partial responses)
4. Returns updated `modelId` if fallback succeeds

**Regression test:** new test validates that when autoModel throws 429, fallbackModel is called and full response is returned with correct fallback modelId. All 15 tests in aiService.test.ts passing.

#### Incident Studio View Controls UI

Improved readability of Maximize and Lite/Full view toggle buttons in header:

- Font-size: 10.2px for labels, 12px for icon symbols
- Font-weight: 800 (bold)
- Letter-spacing: 0.01em for visual clarity
- Min-height: 24px, padding: 4px 10px, gap: 6px
- CSS context `.incident-header-group--view` isolates sizing to View toggles only

---

### Fixed

- **driftGuard test assertion:** Updated `context: ctx, requestId` check to match multi-line object formatting in `App.tsx` (split into two separate assertions). Pre-existing formatting drift from earlier refactoring, no behavioral change to stop-generation contract.

---

### Quality Gates

- ✓ `npm run typecheck`: 0 TypeScript errors
- ✓ `npm run build`: esbuild main + webview build clean
- ✓ `npm run test`: **736/736 tests passing**
  - aiService.test.ts: 15/15 (includes new fallback test)
  - driftGuard.test.ts: 11/11 (updated assertion)
  - incidentStudioPromptPolicy.test.ts: policy checks passing

---

### Files Changed

**v0.25.0 hot-fixes + browser-smoke-test action:**
- src/core/aiService.ts — smart fallback + normalize helper
- src/ui/panels/incidentStudioPromptPolicy.ts — browser-smoke-test allowlist + policy
- src/ui/panels/welcomePanel.ts — model normalization + routing + inline query builder
- webview-ui/src/App.tsx — model normalization + View controls styles
- webview-ui/src/components/AIIncidentStudio.tsx — View controls UI
- webview-ui/src/lib/incidentCliActionMatrix.ts — browser-smoke-test action entry
- webview-ui/src/lib/incidentStudioPayload.ts — browser-smoke-test payload contracts
- webview-ui/src/styles-tailwind.css — View controls CSS
- src/test/aiService.test.ts — new fallback test
- src/test/driftGuard.test.ts — assertion fix
- package.json — version 0.25.0 → 0.26.0
- CHANGELOG.md, RELEASE_NOTES.md — documentation updates

---

### Compatibility

- ✓ No breaking changes (all changes backward-compatible)
- ✓ VS Code 1.119+ recommended for full browser agent tools integration
- ✓ Graceful fallback if VS Code simple browser unavailable
- ✓ Model normalization preserves existing behavior (only converts truly empty values)

---

## v0.25.0 (May 7, 2026)

### ✦ S01–S05 Full Stabilization Loop — Telemetry Breakdowns + Cohort Validation

**Summary:** Completes the full 5-KPI stabilization loop with false-positive protections. Every KPI now has an operational breakdown (S01 fallback mix, S02 miss reasons, S04 recovery class, S05 artifact cohort) that prevents aggregate metrics from masking degradation. Snapshot exports, UI cards, and operational docs updated end-to-end.

#### Added

- **S01 Fallback-reason breakdown**
  5-category classification (`success`, `bare_keyword_only`, `fix_preview_fallback`, `orchestrate_default`, `other`) computed from `next_action_clicked` events; visible in snapshot Markdown and card stats row.

- **S02 Verify-path miss reasons (top offenders)**
  Top-5 miss reasons by frequency extracted from `verify_passed`/`verify_failed` events where `verifyPathPresent=false`; included in snapshot and card.

- **S04 Recovery class breakdown**
  `auto_rollback` / `manual_recovery` / `unspecified` counts from rollback events; snapshot line `S04 recovery class mix` and card stats row added.

- **S05 Cohort validation**
  `repeatVerifiedWithArtifactReady` and `repeatVerifiedWithArtifactRate` metrics from `verified_outcome_ready_for_artifact` events with `repeatedIncident=true` and `replayReady=true`; new S05-Cohort card in Stabilization KPI gate UI.

- **Operational docs (KPI map, weekly template, 6-week plan, canonical story)**
  S01–S05 false-positive risk mitigation playbooks, threshold rules, weekly runbook steps, and False-Positive Prevention Checklist added to all four operational documents.

#### Changed

- Stabilization snapshot Markdown extended with S01 mix, S02 top misses, S04 class, S05 cohort lines.
- `StudioStabilizationKpiStatus` contract extended (optional fields, backward-compatible).
- S05 promoted from `Partial` to `Available` in KPI dictionary.

#### Validation Snapshot

- `npm run compile` → pass (no TS errors, webview esbuild clean)
- `npm run lint` → pass (no ESLint violations)
- `npm test -- --run` → 701/701 tests pass

---

### 🩺 Workspace Health Sidebar + Module Install Modal

**Summary:** Introduces the **Doctor Evidence Viewer** — a persistent sidebar panel that reads `.rapidkit/reports/doctor-last-run.json` and renders an inline health dashboard (score bar, system tool status, per-project issues) without any extra CLI call. Also wires the **Available Modules** sidebar item click directly into the same install confirmation modal used on the welcome page, so users see exactly what will be installed and where before confirming.

#### Added

- 🩺 **`WORKSPACE HEALTH` sidebar panel** (`DoctorEvidenceProvider`)
  - Reads `.rapidkit/reports/doctor-last-run.json` from the active workspace — zero CLI overhead
  - **Summary row:** health score bar (e.g. `70%  ███████░░░`) with `✅ passed  ⚠️ warnings  ❌ errors` counts
  - **Timestamp row:** `Last checked: Xm ago` with `(cached scan)` badge when CLI reused cache
  - **System Tools** (collapsible): per-tool status row — `✅ Python`, `⚠️ pipx`, `❌ ...` with message detail
  - **Projects** (collapsible): each project with health icon; unhealthy projects expand to show individual issues
  - **No-data state:** single click-to-run item (`No health data — run doctor to scan`)
  - **No-workspace state:** placeholder until workspace is selected
  - Three `view/title` toolbar icon buttons:
    - `$(run)` **Re-run Doctor** — opens terminal at workspace CWD, runs `npx rapidkit doctor workspace`
    - `$(wrench)` **Auto-fix Issues** — opens terminal, runs `npx rapidkit doctor workspace --fix`
    - `$(refresh)` **Refresh** — re-reads evidence file from disk immediately
  - **File watcher:** auto-refreshes the panel the moment the CLI writes new evidence (no manual refresh needed)
  - **Live workspace sync:** uses a live getter `() => workspaceExplorer.getSelectedWorkspace()` so the correct workspace is always used, regardless of initialization timing
  - **`onDidChangeTreeData` subscription:** workspace switch immediately triggers a panel reload

- 📦 **Module install modal from `AVAILABLE MODULES` sidebar**
  - New command `rapidkit.showModuleInstallModal`
  - Clicking any installable module in the sidebar now opens the **`InstallModuleModal`** — the same confirmation modal used by welcome page module cards
  - Modal shows: module name, version, description, category tags, installation target (workspace name + path), and exact CLI command (`npx rapidkit add module <slug>`)
  - User must explicitly click **Install Module** to proceed — no silent execution
  - Module data is normalized with `display_name` field to match the webview `ModuleData` interface

#### Changed

- 🔄 **Workspace-switch health refresh** now hooks directly into `workspaceExplorer.onDidChangeTreeData` — fires immediately after `selectedWorkspace` is updated, before any command event chain
- 🧩 **`WelcomePanel`** gains two new static methods:
  - `setExtensionContext(context)` — stores context so sidebar-triggered flows can open the panel without passing context through the call chain
  - `showModuleInstallModal(moduleData)` — opens the panel (if needed) and posts `openModuleInstallModal` to the React webview
- 🪟 **`App.tsx`** handles new `openModuleInstallModal` message — sets `selectedModule` and opens `showInstallModal`, identical to the welcome page card click flow

#### Fixed

- ⏱️ **Workspace Health not showing on reload** — fixed initial workspace path not being passed to the provider because `workspaceSelected` event only fires when workspace *changes*, not on first load. Now explicitly seeded after `workspaceExplorer.refresh()` completes.
- 🗂️ **Stale health data after workspace switch** — fixed by always re-reading evidence from disk in `getChildren` instead of relying on in-memory cache

### 🧪 Contract Regression Log (v0.16.0)

| Area | Expected Contract | Status | Notes |
|------|-------------------|--------|-------|
| doctor workspace | `npx rapidkit doctor workspace` | ✅ | Rerun button uses terminal at workspace CWD |
| doctor fix | `npx rapidkit doctor workspace --fix` | ✅ | Auto-fix button aligned |
| add module | `npx rapidkit add module <slug>` | ✅ | Shown in modal before execution |
| evidence file path | `<workspace>/.rapidkit/reports/doctor-last-run.json` | ✅ | Provider reads this exact path |


## 📋 Version History

| Version | Release Date | Highlights |
|---------|--------------|-----------|
| [v0.28.0](releases/RELEASE_NOTES_v0.28.0.md) | May 13, 2026 | ✦ E1/E2 enterprise stabilization (E2.1-E2.5), memory-policy boundaries, audit timeline linkage, release-gate hardening |
| [v0.27.3](releases/RELEASE_NOTES_v0.27.3.md) | May 12, 2026 | ✦ Incident Studio trust hardening, deterministic verify/release gating, parity snapshot and CI guardrails |
| [v0.27.2](releases/RELEASE_NOTES_v0.27.2.md) | May 10, 2026 | ✦ Setup panel disposal safety, guarded postMessage flow, webview lifecycle stability |
| [v0.27.1](releases/RELEASE_NOTES_v0.27.1.md) | May 10, 2026 | ✦ Workspace run suite, AI command center, project-scoped doctor routing and telemetry hardening |
| [v0.27.0](releases/RELEASE_NOTES_v0.27.0.md) | May 8, 2026 | ✦ Routing/module-graph/BYOP stabilization, phase-gate alignment, enterprise gate fixture hardening |
| [v0.26.0](releases/RELEASE_NOTES_v0.26.0.md) | May 8, 2026 | ✦ Browser smoke-test action, model-selection regression fix, smart rate-limit fallback |
| [v0.25.0](releases/RELEASE_NOTES_v0.25.0.md) | May 7, 2026 | ✦ S01-S05 stabilization loop completion with false-positive prevention telemetry breakdowns |
| [v0.24.1](releases/RELEASE_NOTES_v0.24.1.md) | May 6, 2026 | ✦ Incident Studio UX polish, 🎛️ AI dashboard refresh, 📚 README + quick-fixes sync |
| [v0.24.0](releases/RELEASE_NOTES_v0.24.0.md) | May 5, 2026 | ✦ decision clarity loop closure, ✅ enterprise readiness gates, 🧪 artifact criteria coverage |
| [v0.19.1](releases/RELEASE_NOTES_v0.19.1.md) | Apr 19, 2026 | ✦ toolchain reliability, 🐹 Go context clarity, 🧭 Workspai positioning sync |
| [v0.18.0](releases/RELEASE_NOTES_v0.18.0.md) | Apr 17, 2026 | ✦ AI stability hardening, richer context extraction, stronger prompt safety |
| [v0.17.1](releases/RELEASE_NOTES_v0.17.1.md) | Apr 17, 2026 | ⚡ Instant sidebar render — two-phase async loading for WORKSPACES panel |
| [v0.17.0](releases/RELEASE_NOTES_v0.17.0.md) | Apr 16, 2026 | ✦ AI Assistant, Doctor Fix with AI, Code Actions, minimizable modal |
| [v0.15.0](releases/RELEASE_NOTES_v0.15.0.md) | Feb 27, 2026 | 🚀 platform-safe command layer, 🪟 tool-aware workspace modal, ⚡ workspace list performance, 🩺 doctor path clarity |
| [v0.14.0](releases/RELEASE_NOTES_v0.14.0.md) | Feb 25, 2026 | 🎯 Workspace-vs-project correctness, 👁️ persisted setup toggle, 🌐 example link/clone fixes, 🏷️ profile tags |
| [v0.13.0](releases/RELEASE_NOTES_v0.13.0.md) | Feb 21, 2026 | 🐹 Go framework support, 🪟 Workspace modal routing, 🔧 @latest fix, 🚫 Modules disabled for Go |
| [v0.12.0](releases/RELEASE_NOTES_v0.12.0.md) | Feb 15, 2026 | 🪟 Module details modal, 🧭 workspace-first CLI resolution, 🔄 post-install refresh |
| [v0.11.0](releases/RELEASE_NOTES_v0.11.0.md) | Feb 14, 2026 | 🌐 Dynamic Examples, 🎨 Kit Selection, 📦 Workspace Export/Import |
| [v0.10.0](releases/RELEASE_NOTES_v0.10.0.md) | Feb 12, 2026 | 🚀 Project Actions, 🎯 Smart Browser, 📡 Port Detection |
| [v0.9.0](releases/RELEASE_NOTES_v0.9.0.md) | Feb 10, 2026 | 🎭 Modal system, ⚡ Smart caching, 📱 Responsive design |
| [v0.8.0](releases/RELEASE_NOTES_v0.8.0.md) | Feb 9, 2026 | 🎨 Workspace cards redesign, Dynamic version display, Project statistics |
| [v0.7.0](releases/RELEASE_NOTES_v0.7.0.md) | Feb 6, 2026 | 🩺 Workspace health check, Setup status panel, Diagnostics integration |
| [v0.6.1](releases/RELEASE_NOTES_v0.6.1.md) | Feb 3, 2026 | 🛠️ Fixes & polish: setup stability, module copy commands, detection improvements |
| [v0.6.0](releases/RELEASE_NOTES_v0.6.0.md) | Feb 3, 2026 | 🎯 Module Browser, Setup Wizard, Package Manager Selection |
| [v0.5.2](releases/RELEASE_NOTES_v0.5.2.md) | Feb 2, 2026 | 🔧 NPM caching fix, Standalone mode, Recent workspaces |
| [v0.5.1](releases/RELEASE_NOTES_v0.5.1.md) | Feb 2, 2026 | 📝 Documentation translation, Consistency improvements |
| [v0.5.0](releases/RELEASE_NOTES_v0.5.0.md) | Feb 1, 2026 | 🐍 Python Core bridge, Workspace registry integration |
| [v0.4.7](releases/RELEASE_NOTES_v0.4.7.md) | Jan 23, 2026 | 🐛 Bug fixes, Dependency updates, Security patches |
| [v0.4.6](releases/RELEASE_NOTES_v0.4.6.md) | Jan 1, 2026 | 🎯 Poetry smart detection, Update notifications |
| [v0.4.5](releases/RELEASE_NOTES_v0.4.5.md) | Dec 23, 2025 | ⚡ Project quick actions, No workspace switching |
| [v0.4.4](releases/RELEASE_NOTES_v0.4.4.md) | Dec 22, 2025 | 🩺 Doctor npm check, Dynamic versions |
| [v0.4.3](releases/RELEASE_NOTES_v0.4.3.md) | Dec 12, 2025 | 📚 Module explorer, UI enhancements |
| [v0.4.2](releases/RELEASE_NOTES_v0.4.2.md) | Dec 5, 2025 | 📝 Logging commands, Marketplace improvements |
| [v0.4.1](releases/RELEASE_NOTES_v0.4.1.md) | Dec 4, 2025 | 📖 Documentation update, README rewrite |
| [v0.4.0](releases/RELEASE_NOTES_v0.4.0.md) | Dec 3, 2025 | 🎯 Smart location detection, npm migration |
| [v0.3.1](releases/RELEASE_NOTES_v0.3.1.md) | Dec 3, 2025 | 🐛 Bug fixes |
| [v0.3.0](releases/RELEASE_NOTES_v0.3.0.md) | Dec 2, 2025 | ✨ New features |
| [v0.1.3](releases/RELEASE_NOTES_v0.1.3.md) | Nov 2025 | 🔧 Improvements |
| [v0.1.2](releases/RELEASE_NOTES_v0.1.2.md) | Nov 2025 | 🐛 Bug fixes |
| [v0.1.1](releases/RELEASE_NOTES_v0.1.1.md) | Nov 2025 | ✏️ Minor updates |
| [v0.1.0](releases/RELEASE_NOTES_v0.1.0.md) | Nov 2025 | 🎉 Initial release |

---

## Links

- 📦 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
- 🐙 [GitHub Repository](https://github.com/rapidkitlabs/rapidkit-vscode)
- 📚 [Documentation](https://www.workspai.com/)
- 🚀 [npm Package](https://www.npmjs.com/package/rapidkit)
