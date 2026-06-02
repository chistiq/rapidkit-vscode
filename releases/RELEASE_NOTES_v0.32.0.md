# Release Notes v0.32.0

## v0.32.0 (June 2, 2026)

### ✦ Enterprise Workspai Dashboard and Workspace Contract Release

Summary:
- Redesigns the Workspai dashboard into a governed command center for backend workspaces.
- Introduces a clearer operational model across workspace, project, build, share, archive, and module workflows.
- Documents the Workspace Contract Registry with a dedicated README screenshot and media inventory entry.
- Aligns the extension UX with npm-level workspace archive/import/export verification concepts.

Notable changes:
- `webview-ui/src/components/EnterpriseDashboardFlow.tsx` adds the dashboard command-center flow.
- `webview-ui/src/components/EnterpriseModal.tsx` centralizes the new enterprise modal shell.
- `webview-ui/src/components/CreateWorkspaceModal.tsx`, `CreateProjectModal.tsx`, `InstallModuleModal.tsx`, and `ModuleDetailsModal.tsx` now use the redesigned modal language and layout.
- `webview-ui/src/components/ModuleBrowser.tsx` now presents project/workspace context without leaking local absolute paths into user-facing module surfaces.
- `webview-ui/src/components/WebviewErrorBoundary.tsx` adds a recoverable dashboard failure boundary.
- `README.md` and `media/README.md` now cover the updated dashboard, module browser, modal flow, and Workspace Contract Registry screenshots.
- `package.json` now includes targeted npm overrides for vulnerable transitive test dependencies while avoiding force-based downgrades of the VS Code test CLI.

Validation:
- `./node_modules/.bin/tsc --noEmit` passed during the release preparation window.
- `node esbuild.js` passed in `webview-ui`.
- `npm audit --json` reports 0 vulnerabilities.
- `git diff --check` passed.

Release posture: `enterprise-ui-and-contract-stabilization`
