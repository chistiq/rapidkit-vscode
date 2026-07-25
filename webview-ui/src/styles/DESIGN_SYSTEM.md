# Workspai Enterprise Design Contract

This webview follows VS Code first theming with Workspai shape and identity.

## Non-negotiables

- Product UI follows the active VS Code theme automatically.
- Theme override controls do not live inside product surfaces. If an override is needed later, it belongs in Settings.
- Surface, text, border, input, focus, and status colors use semantic `--ws-*` variables.
- New component styles should prefer `ws-*` / `workspai-*` vocabulary. Legacy prefixes such as `spc-*`, `studio-*`, and `dashboard-*` are migration targets, not expansion points.
- New hardcoded hex or rgba colors are not allowed in React component files. Token files are the exception.
- New standalone webview entries must import `workspai-tokens.css`. Dashboard-style entries
  render under `WorkspaiThemeProvider`; sidebar entries must use the same semantic tokens and
  VS Code theme variables with no local theme override controls.

## Theme Spine

VS Code owns background and foreground colors. Workspai owns accent, radius, spacing, and component rhythm.

```text
VS Code theme -> data-workspai-theme-kind/source -> --ws-* semantic vars -> surfaces
```

Required root attributes:

- `data-workspai-theme-kind="light|dark"`
- `data-workspai-theme-source="vscode"`

## Token Layer

The shared semantic layer starts in `workspai-tokens.css`.

Core variables:

- `--ws-surface`
- `--ws-surface-raised`
- `--ws-surface-input`
- `--ws-text`
- `--ws-text-muted`
- `--ws-border`
- `--ws-focus`
- `--ws-accent`
- `--ws-primary`
- `--ws-success`
- `--ws-warn`
- `--ws-error`

## Component Primitives

Canonical vocabulary lives in `workspai-primitives.css`. Prefer these classes in new UI:

| Primitive      | Class                                                                | Notes                                |
| -------------- | -------------------------------------------------------------------- | ------------------------------------ |
| Button         | `ws-btn`, `ws-btn--primary`, `ws-btn--ghost`, `ws-btn--danger`       | No gradient fills                    |
| Card           | `ws-card`, `ws-card--raised`                                         | Transparent / raised surfaces        |
| Chip           | `ws-chip`, `ws-chip--success`, `ws-chip--warn`, `ws-chip--error`     | Status badges                        |
| Field          | `ws-field`, `ws-field__label`, `ws-field__hint`, `ws-field__error`   | Forms                                |
| Empty          | `ws-empty`, `ws-empty__title`, `ws-empty__desc`, `ws-empty__actions` | Zero-data states                     |
| Kicker         | `ws-kicker`                                                          | Section eyebrows                     |
| Embedded shell | `ws-embedded-host`                                                   | Setup / Settings / Studio tab bodies |

Legacy aliases (migration only, do not extend):

- `spc-btn` / `spc-btn.primary` → `ws-btn` / `ws-btn--primary`
- `spc-panel-card` → `ws-card`
- `modal-field` → `ws-field`
- `workspai-empty-state` → `ws-empty`
- `setup-embedded-host` / `studio-embedded-host` → `ws-embedded-host`
- `spc-shell` → `ws-setup-shell`
- `workspai-settings-*` → `ws-settings-*` + `ws-card` / `ws-field` / `ws-btn`

### Legacy Prefix Budget

Legacy prefixes are allowed only as tracked migration debt. They must not grow.

| Prefix               | Current budget                                 | Rule                                                                                    |
| -------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| legacy `dashboard-*` | 104 occurrences across 19 product source files | New dashboard chrome should add `ws-dashboard-*` aliases or replace old selectors.      |
| `spc-*` | 294 occurrences across 3 product source files | Setup surfaces should migrate toward `ws-setup-*`, `ws-card`, `ws-field`, and `ws-btn`. |

`designSystemDrift.test.ts` enforces this budget so touched UI can move toward
the shared system without silently expanding legacy vocabulary.

Import order for every webview entry:

```text
workspai-tokens.css → styles-tailwind.css → workspai-primitives.css
→ workspai-studio.css → workspai-studio-chrome.css
```

Product-specific bundles (import only when the surface is mounted):

- `workspai-analyze-report.css` — Analyze report viewer

## Workspai Studio (Secondary Sidebar)

Production path: secondary sidebar React bundle → `SidebarApp` → `SecondarySidebar` →
`StudioBlockerChrome` / `StudioPatchReview` / `StudioShipLoopStepper`.

Studio is no longer a dashboard-embedded surface. Dashboard cards build typed blocker
handoff payloads and open the sidebar Studio with the exact blocker, artifact, source
command, verify command, and audit context. Release-path guidance is not default
Studio chrome; it only appears for explicit readiness / verify-gate handoffs with a
known workspace scope.

| Layer                   | File                                               | Role                                                           |
| ----------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Tokens                  | `workspai-tokens.css`                              | Semantic `--ws-*` variables                                    |
| Sidebar entry           | `webview-ui/src/sidebar/index.tsx`                 | Imports token spine, primitives, sidebar CSS, and a11y styles  |
| Sidebar app             | `webview-ui/src/sidebar/SidebarApp.tsx`            | Secondary-sidebar shell                                        |
| Assistant orchestration | `webview-ui/src/sidebar/SecondarySidebar.tsx`      | Create plus unified Agent / Ask / Plan modes and host protocol |
| Blocker chrome          | `webview-ui/src/sidebar/StudioBlockerChrome.tsx`   | Mode, phase, blockers, verify, and visible failure state       |
| Patch review            | `webview-ui/src/sidebar/StudioPatchReview.tsx`     | Human review before patch apply                                |
| Release path            | `webview-ui/src/sidebar/StudioShipLoopStepper.tsx` | Scoped analyze, verify-gates, readiness, archive loop          |

Rules for Studio and sidebar surfaces:

1. Prefer shared primitives (`ws-btn`, `ws-chip`, `ws-card`, `ws-kicker`) for touched controls.
2. Keep one primary action per Studio phase; move secondary actions to compact controls or overflow.
3. Use `currentColor` for Lucide icons and semantic tone classes; avoid hardcoded icon colors.
4. Surface action failures inside Studio chrome instead of relying on `console.warn`.
5. Keep Advisor read-only; mutation belongs in Studio.
6. Preserve typed blocker handoff fields: card id, status, artifact, source command, verify command, mode, and audit state.

## Historical Studio Assets

`webview-ui/src/components/StudioRedesign/` still contains state and style utilities from
the earlier dashboard Studio migration. Those files are compatibility and test assets, not
the shipped production Studio entry. New work should extend the secondary sidebar Studio
unless a product decision explicitly reintroduces a dashboard Studio surface.

## Migration Rule

Each surface migration should:

1. Replace touched hardcoded colors with `var(--ws-*)`.
2. Reuse or alias shared primitives.
3. Preserve behavior.
4. Pass dark, light, and high-contrast sanity checks when applicable.
