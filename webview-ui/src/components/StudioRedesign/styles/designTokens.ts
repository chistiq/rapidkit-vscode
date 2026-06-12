/**
 * Design Tokens — Studio surfaces read the shared Workspai `--ws-*` spine.
 *
 * Bridge-only: consumed by `themeSystem.ts` for legacy theme resolution tests.
 * Region components must use CSS `--ws-*` tokens via `studioUi.ts` / static CSS — not this module.
 */

export const colorTokens = {
  root: 'var(--ws-surface)',
  surface1: 'var(--ws-surface)',
  surface2: 'var(--ws-surface-raised)',
  surface3: 'color-mix(in srgb, var(--ws-surface-raised) 88%, transparent)',
  surface4: 'var(--ws-surface-input)',
  canvas: 'var(--ws-surface)',
  heroGlow: 'none',

  border: {
    subtle: 'var(--ws-border-subtle)',
    medium: 'var(--ws-border)',
    strong: 'var(--ws-focus)',
  },

  text: {
    primary: 'var(--ws-text)',
    secondary: 'var(--ws-text)',
    tertiary: 'var(--ws-text-muted)',
    quaternary: 'var(--ws-text-subtle)',
    high: 'var(--ws-text)',
    medium: 'var(--ws-text)',
    muted: 'var(--ws-text-muted)',
    subtle: 'var(--ws-text-subtle)',
  },

  primary: 'var(--ws-accent)',
  primaryHover: 'color-mix(in srgb, var(--ws-accent) 78%, var(--ws-text))',
  primaryActive: 'color-mix(in srgb, var(--ws-accent) 62%, var(--ws-text))',
  primaryInverse: 'color-mix(in srgb, var(--ws-accent) 11%, transparent)',
  accent: 'var(--ws-primary)',
  accentHover: 'color-mix(in srgb, var(--ws-primary) 78%, var(--ws-text))',
  teal: 'var(--ws-accent)',
  tealHover: 'color-mix(in srgb, var(--ws-accent) 78%, var(--ws-text))',

  success: 'var(--ws-success)',
  successBg: 'color-mix(in srgb, var(--ws-success) 14%, transparent)',
  warning: 'var(--ws-warn)',
  warningBg: 'color-mix(in srgb, var(--ws-warn) 16%, transparent)',
  error: 'var(--ws-error)',
  errorBg: 'color-mix(in srgb, var(--ws-error) 14%, transparent)',

  health: {
    ok: 'var(--ws-success)',
    warning: 'var(--ws-warn)',
    error: 'var(--ws-error)',
    unknown: 'var(--ws-text-muted)',
  },
};

export const fontTokens = {
  ui: 'var(--ws-font-ui, var(--vscode-font-family, "Segoe UI", system-ui, sans-serif))',
  mono: 'var(--vscode-editor-font-family, "Consolas", "Courier New", monospace)',
};

export const spacing = {
  xs: 'var(--ws-space-xs, 4px)',
  sm: 'var(--ws-space-sm, 8px)',
  md: 'var(--ws-space-md, 12px)',
  lg: 'var(--ws-space-lg, 16px)',
  xl: 'var(--ws-space-xl, 24px)',
  xxl: '32px',
  xxxl: '40px',
};

export const typography = {
  display: {
    fontSize: '22px',
    fontWeight: 850,
    lineHeight: '1.15',
    letterSpacing: '-0.4px',
  },
  h1: {
    fontSize: '18px',
    fontWeight: 850,
    lineHeight: '1.25',
    letterSpacing: '-0.3px',
  },
  h2: {
    fontSize: '14px',
    fontWeight: 850,
    lineHeight: '1.35',
    letterSpacing: '-0.1px',
  },
  h3: {
    fontSize: '13px',
    fontWeight: 700,
    lineHeight: '1.4',
    letterSpacing: '0px',
  },
  labelSmall: {
    fontSize: '10px',
    fontWeight: 850,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  label: {
    fontSize: '10.5px',
    fontWeight: 750,
    letterSpacing: '0.02em',
  },
  bodySmall: {
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: '1.45',
  },
  body: {
    fontSize: '13px',
    fontWeight: 400,
    lineHeight: '1.55',
  },
  bodyLarge: {
    fontSize: '13px',
    fontWeight: 400,
    lineHeight: '1.6',
  },
  code: {
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '1.5',
    fontFamily: fontTokens.mono,
  },
  caption: {
    fontSize: '10.5px',
    fontWeight: 400,
    lineHeight: '1.4',
  },
  captionSmall: {
    fontSize: '10.5px',
    fontWeight: 700,
    lineHeight: '1.35',
    letterSpacing: '0.02em',
  },
  headingSmall: {
    fontSize: '11px',
    fontWeight: 750,
    lineHeight: '1.4',
  },
  heading: {
    fontSize: '12px',
    fontWeight: 750,
    lineHeight: '1.45',
  },
};

export const borderRadius = {
  xs: 'var(--ws-radius-sm, 2px)',
  sm: 'var(--ws-radius-sm, 5px)',
  md: 'var(--ws-radius-md, 7px)',
  lg: 'var(--ws-radius-lg, 10px)',
  xl: '12px',
  full: '999px',
};

export const layout = {
  activityBar: '42px',
  contextPanel: '280px',
};

export const breakpoints = {
  wide: '1440px',
  normal: '1240px',
  compact: '1024px',
  mobile: '760px',
};

export const shadows = {
  xs: 'none',
  sm: 'none',
  md: 'none',
  lg: 'none',
  xl: 'none',
  elevation1: 'none',
  elevation2: 'none',
};

export const gridBaseline = 8;

export const transitions = {
  microInteraction:
    'color 120ms cubic-bezier(0.4, 0, 0.2, 1), background-color 120ms cubic-bezier(0.4, 0, 0.2, 1), border-color 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  standard: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
  emphasized: 'all 260ms cubic-bezier(0.22, 1, 0.36, 1)',
};

export const motionTokens = {
  easing: {
    emphasized: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  durations: {
    headerEnter: 280,
    stepperEnter: 320,
    surfaceEnter: 360,
    deckEnter: 320,
    chipFade: 260,
    pulse: 1500,
  },
  delays: {
    stepperAfterHeader: 40,
    surfaceAfterHeader: 80,
    deckAfterSurface: 120,
    chipsBase: 90,
    chipsStep: 30,
  },
};

/** Shared panel chrome — reads live colorTokens (theme-aware via Object.assign) */
export const panelChrome = {
  divider: `1px solid ${colorTokens.border.subtle}`,
  rail: `1px solid ${colorTokens.border.subtle}`,
  inset: `1px solid ${colorTokens.border.subtle}`,
};
