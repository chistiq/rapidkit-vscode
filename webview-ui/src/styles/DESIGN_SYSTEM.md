# Workspai Enterprise Design Contract

This webview follows VS Code first theming with Workspai shape and identity.

## Non-negotiables

- Product UI follows the active VS Code theme automatically.
- Theme override controls do not live inside product surfaces. If an override is needed later, it belongs in Settings.
- Surface, text, border, input, focus, and status colors use semantic `--ws-*` variables.
- New component styles should prefer `ws-*` / `workspai-*` vocabulary. Legacy prefixes such as `spc-*`, `studio-*`, and `dashboard-*` are migration targets, not expansion points.
- New hardcoded hex or rgba colors are not allowed in React component files. Token files are the exception.
- New standalone webview entries must import `workspai-tokens.css` and render under `WorkspaiThemeProvider`.

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

| Primitive | Class | Notes |
|-----------|-------|-------|
| Button | `ws-btn`, `ws-btn--primary`, `ws-btn--ghost`, `ws-btn--danger` | No gradient fills |
| Card | `ws-card`, `ws-card--raised` | Transparent / raised surfaces |
| Chip | `ws-chip`, `ws-chip--success`, `ws-chip--warn`, `ws-chip--error` | Status badges |
| Field | `ws-field`, `ws-field__label`, `ws-field__hint`, `ws-field__error` | Forms |
| Empty | `ws-empty`, `ws-empty__title`, `ws-empty__desc`, `ws-empty__actions` | Zero-data states |
| Kicker | `ws-kicker` | Section eyebrows |
| Embedded shell | `ws-embedded-host` | Setup / Settings / Studio tab bodies |

Legacy aliases (migration only, do not extend):

- `spc-btn` / `spc-btn.primary` → `ws-btn` / `ws-btn--primary`
- `spc-panel-card` → `ws-card`
- `modal-field` → `ws-field`
- `workspai-empty-state` → `ws-empty`
- `setup-embedded-host` / `studio-embedded-host` → `ws-embedded-host`
- `spc-shell` → `ws-setup-shell`
- `workspai-settings-*` → `ws-settings-*` + `ws-card` / `ws-field` / `ws-btn`

Import order for every webview entry:

```text
workspai-tokens.css → styles-tailwind.css → workspai-primitives.css
→ workspai-studio.css → workspai-studio-chrome.css
```

Product-specific bundles (import only when the surface is mounted):

- `workspai-analyze-report.css` — Analyze report viewer

## Incident Studio (vNext)

Production path: `IncidentStudioVNext` → region components under `StudioRedesign/regions/`.

| Layer | File | Role |
|-------|------|------|
| Tokens | `workspai-tokens.css` | Semantic `--ws-*` variables |
| Layout + tone utilities | `workspai-studio.css` | Region layout, tone modifiers, enter animations |
| Component chrome | `workspai-studio-chrome.css` | Legacy `studio-*` shell extracted from GlobalStyles |
| Class registry | `styles/studioUi.ts` | `studioClass.*` keys + tone helpers |
| Theme bridge (internal) | `styles/designTokens.ts` | `--ws-*` aliases for `themeSystem.ts` only — not exported from barrel |

Rules for studio regions:

1. Prefer `studioClass` + tone helpers (`postureToneClass`, `releasePostureToneClass`, …) over inline `style={{}}`.
2. Do not import `colorTokens` / `motionTokens` in token-ready region components.
3. Lucide icons inherit tone via `currentColor` + tone classes — avoid `color={…}` props.
4. `globalStyles.tsx` is a stub; chrome lives in static CSS (`scripts/verify-studio-chrome-css.mjs` guards CI).
5. `IncidentStudioVNext` syncs `data-studio-theme-kind` from VS Code — do not mutate runtime `colorTokens`.

Legacy monolith removed in Wave S — presentation contracts live in `webview-ui/src/lib/` and `incidentStudioPresentationContracts.test.ts`.

Wave T wires action-outcome presentation into production Studio: `buildActionOutcomePresentation` → `ActionOutcomePanel` in `ChatSurface`, fed by `incomingActionResult` from `App.tsx`.

## Integration Waves (post design migration)

| Wave | Status | Focus |
|------|--------|-------|
| J–Y | Complete | Design system, vNext regions, guided/lite UX |
| Z1 | In progress | Workspace path navigation — source files open in editor; `.rapidkit/reports/*` reveal in OS |
| Z2 | Complete | Persistent chat history + approval audit per workspace (`incidentStudioSessionPersistenceBridge`) |
| Z3 | Complete | Live policy gates from telemetry — shared host/webview policy core + parity tests |
| Z4 | In progress | Confidence UI + observability surfaces (release readiness KPI, command telemetry, repro pack) |

## Migration Rule

Each surface migration should:

1. Replace touched hardcoded colors with `var(--ws-*)`.
2. Reuse or alias shared primitives.
3. Preserve behavior.
4. Pass dark, light, and high-contrast sanity checks when applicable.
