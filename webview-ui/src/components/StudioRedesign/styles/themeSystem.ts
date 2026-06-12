/**
 * Theme System for Incident Studio
 * Supports light/dark/auto with persistent user preference
 */

export type ThemeMode = 'light' | 'dark' | 'auto';

type ThemeKind = 'light' | 'dark';

// ─── Dark Theme (default, current system) ──────────────────────────────────

export const darkTheme = {
  root: '#1e1e1e',
  surface1: 'color-mix(in srgb, #1e1e1e 98%, transparent)',
  surface2: 'color-mix(in srgb, #252526 92%, transparent)',
  surface3: 'color-mix(in srgb, #252526 88%, transparent)',
  surface4: 'color-mix(in srgb, #3c3c3c 82%, transparent)',
  canvas: '#1e1e1e',
  heroGlow: 'none',

  border: {
    subtle: 'color-mix(in srgb, #3c3c3c 55%, transparent)',
    medium: 'color-mix(in srgb, #3c3c3c 78%, transparent)',
    strong: '#3c3c3c',
  },

  text: {
    primary: 'rgba(204, 204, 204, 0.96)',
    secondary: 'rgba(204, 204, 204, 0.82)',
    tertiary: 'rgba(133, 133, 133, 0.92)',
    quaternary: 'rgba(133, 133, 133, 0.78)',
    high: 'rgba(204, 204, 204, 0.96)',
    medium: 'rgba(204, 204, 204, 0.82)',
    muted: 'rgba(133, 133, 133, 0.92)',
    subtle: 'rgba(133, 133, 133, 0.78)',
  },

  primary: '#00cfc1',
  primaryHover: '#68e3d7',
  primaryActive: '#00b3a8',
  primaryInverse: 'color-mix(in srgb, #00cfc1 11%, transparent)',
  accent: '#6c5ce7',
  accentHover: '#8b7cf8',
  teal: '#00cfc1',
  tealHover: '#68e3d7',

  success: '#13c659',
  successBg: 'color-mix(in srgb, #13c659 14%, transparent)',
  warning: '#dba617',
  warningBg: 'color-mix(in srgb, #dba617 16%, transparent)',
  error: '#f14c4c',
  errorBg: 'color-mix(in srgb, #f14c4c 14%, transparent)',

  health: {
    ok: '#13c659',
    warning: '#dba617',
    error: '#f14c4c',
    unknown: 'rgba(133, 133, 133, 0.65)',
  },
};

// ─── Light Theme ───────────────────────────────────────────────────────────

export const lightTheme = {
  root: '#ffffff',
  surface1: 'color-mix(in srgb, #ffffff 98%, transparent)',
  surface2: 'color-mix(in srgb, #f3f3f3 94%, transparent)',
  surface3: 'color-mix(in srgb, #ececec 90%, transparent)',
  surface4: 'color-mix(in srgb, #e0e0e0 86%, transparent)',
  canvas: '#ffffff',
  heroGlow: 'none',

  border: {
    subtle: 'color-mix(in srgb, #cccccc 45%, transparent)',
    medium: 'color-mix(in srgb, #cccccc 68%, transparent)',
    strong: '#cccccc',
  },

  text: {
    primary: 'rgba(51, 51, 51, 0.96)',
    secondary: 'rgba(51, 51, 51, 0.82)',
    tertiary: 'rgba(106, 106, 106, 0.88)',
    quaternary: 'rgba(106, 106, 106, 0.72)',
    high: 'rgba(51, 51, 51, 0.96)',
    medium: 'rgba(51, 51, 51, 0.82)',
    muted: 'rgba(106, 106, 106, 0.88)',
    subtle: 'rgba(106, 106, 106, 0.72)',
  },

  primary: '#00a89d',
  primaryHover: '#008f86',
  primaryActive: '#007870',
  primaryInverse: 'color-mix(in srgb, #00a89d 10%, transparent)',
  accent: '#6c5ce7',
  accentHover: '#4a3dc4',
  teal: '#00a89d',
  tealHover: '#008f86',

  success: '#107c10',
  successBg: 'color-mix(in srgb, #107c10 12%, transparent)',
  warning: '#9d5d00',
  warningBg: 'color-mix(in srgb, #9d5d00 12%, transparent)',
  error: '#a1260d',
  errorBg: 'color-mix(in srgb, #a1260d 12%, transparent)',

  health: {
    ok: '#107c10',
    warning: '#9d5d00',
    error: '#a1260d',
    unknown: 'rgba(106, 106, 106, 0.60)',
  },
};

export type ColorTokens = typeof darkTheme;

function expandHex(value: string): string {
  const hex = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return '';
}

function rgbToHex(value: string): string {
  const match = value
    .trim()
    .match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (!match) {
    return '';
  }

  const r = Math.max(0, Math.min(255, Number(match[1])))
    .toString(16)
    .padStart(2, '0');
  const g = Math.max(0, Math.min(255, Number(match[2])))
    .toString(16)
    .padStart(2, '0');
  const b = Math.max(0, Math.min(255, Number(match[3])))
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

function toHexColor(value: string, fallbackHex: string): string {
  return expandHex(value) || rgbToHex(value) || fallbackHex;
}

function readVSCodeVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }

  const computed = window.getComputedStyle(document.documentElement);
  const value = computed.getPropertyValue(name).trim();
  return value || fallback;
}

function readVSCodeHexVar(name: string, fallbackHex: string): string {
  return toHexColor(readVSCodeVar(name, fallbackHex), fallbackHex);
}

function withAlpha(hexColor: string, alphaPercent: number): string {
  return `color-mix(in srgb, ${hexColor} ${alphaPercent}%, transparent)`;
}

function buildAutoThemeFromVSCode(kind: ThemeKind): ColorTokens {
  const editorBg = readVSCodeHexVar(
    '--vscode-editor-background',
    kind === 'light' ? '#FFFFFF' : '#0B1118'
  );
  const panelBg = readVSCodeHexVar(
    '--vscode-sideBar-background',
    kind === 'light' ? '#F5F7FB' : '#0F1621'
  );
  const inputBg = readVSCodeHexVar(
    '--vscode-input-background',
    kind === 'light' ? '#FFFFFF' : '#111C28'
  );
  const foreground = readVSCodeHexVar(
    '--vscode-foreground',
    kind === 'light' ? '#0F172A' : '#E5EDF5'
  );
  const description = readVSCodeHexVar(
    '--vscode-descriptionForeground',
    kind === 'light' ? '#64748B' : '#9BAFC0'
  );
  const border = readVSCodeHexVar(
    '--vscode-panel-border',
    kind === 'light' ? '#cccccc' : '#3c3c3c'
  );
  const brandAccent = readVSCodeHexVar(
    '--workspai-accent',
    readVSCodeHexVar('--rapidkit-accent', kind === 'light' ? '#00a89d' : '#00cfc1')
  );
  const brandPrimary = readVSCodeHexVar(
    '--rapidkit-primary',
    kind === 'light' ? '#6c5ce7' : '#6c5ce7'
  );
  const focusBorder = readVSCodeHexVar('--vscode-focusBorder', brandAccent);
  const link = readVSCodeHexVar('--vscode-textLink-foreground', brandAccent);
  const error = readVSCodeHexVar(
    '--vscode-errorForeground',
    kind === 'light' ? '#D13438' : '#F48771'
  );
  const warning = readVSCodeHexVar(
    '--vscode-editorWarning-foreground',
    kind === 'light' ? '#B36200' : '#CCA700'
  );
  const success = readVSCodeHexVar(
    '--vscode-terminal-ansiGreen',
    kind === 'light' ? '#0F8A5F' : '#33E199'
  );

  return {
    root: editorBg,
    surface1: withAlpha(editorBg, kind === 'light' ? 98 : 90),
    surface2: withAlpha(panelBg, kind === 'light' ? 96 : 92),
    surface3: withAlpha(inputBg, kind === 'light' ? 95 : 94),
    surface4: withAlpha(panelBg, kind === 'light' ? 92 : 97),
    canvas: editorBg,
    heroGlow: 'none',
    border: {
      subtle: withAlpha(border, kind === 'light' ? 34 : 46),
      medium: withAlpha(border, kind === 'light' ? 52 : 64),
      strong: withAlpha(border, kind === 'light' ? 70 : 80),
    },
    text: {
      primary: withAlpha(foreground, 96),
      secondary: withAlpha(foreground, kind === 'light' ? 82 : 88),
      tertiary: withAlpha(description, kind === 'light' ? 86 : 82),
      quaternary: withAlpha(description, kind === 'light' ? 72 : 70),
      high: withAlpha(foreground, 96),
      medium: withAlpha(foreground, kind === 'light' ? 82 : 88),
      muted: withAlpha(description, kind === 'light' ? 86 : 82),
      subtle: withAlpha(description, kind === 'light' ? 72 : 70),
    },
    primary: brandAccent,
    primaryHover: focusBorder,
    primaryActive: brandAccent,
    primaryInverse: withAlpha(brandAccent, kind === 'light' ? 10 : 12),
    accent: brandPrimary,
    accentHover: focusBorder,
    teal: brandAccent,
    tealHover: focusBorder,
    success,
    successBg: withAlpha(success, kind === 'light' ? 14 : 18),
    warning,
    warningBg: withAlpha(warning, 18),
    error,
    errorBg: withAlpha(error, 16),
    health: {
      ok: success,
      warning,
      error,
      unknown: withAlpha(description, 65),
    },
  };
}

function hasThemeClass(target: Element | null, themeClass: string): boolean {
  return Boolean(target?.classList.contains(themeClass));
}

export function detectVSCodeThemeKind(): ThemeKind {
  if (typeof document === 'undefined') {
    return 'dark';
  }

  const html = document.documentElement;
  const body = document.body;

  if (
    hasThemeClass(html, 'vscode-light') ||
    hasThemeClass(html, 'vscode-high-contrast-light') ||
    hasThemeClass(body, 'vscode-light') ||
    hasThemeClass(body, 'vscode-high-contrast-light')
  ) {
    return 'light';
  }

  if (
    hasThemeClass(html, 'vscode-dark') ||
    hasThemeClass(html, 'vscode-high-contrast') ||
    hasThemeClass(body, 'vscode-dark') ||
    hasThemeClass(body, 'vscode-high-contrast')
  ) {
    return 'dark';
  }

  // Fallback for environments that expose theme kind via dataset attributes.
  const htmlTheme = html?.getAttribute('data-vscode-theme-kind');
  const bodyTheme = body?.getAttribute('data-vscode-theme-kind');
  const themeHint = `${htmlTheme || ''} ${bodyTheme || ''}`.toLowerCase();
  if (themeHint.includes('light')) {
    return 'light';
  }
  if (themeHint.includes('dark') || themeHint.includes('hc')) {
    return 'dark';
  }

  return 'dark';
}

export function resolveThemeKind(userMode: ThemeMode): ThemeKind {
  if (userMode === 'light') {
    return 'light';
  }
  if (userMode === 'dark') {
    return 'dark';
  }
  return detectVSCodeThemeKind();
}

/**
 * Get theme based on user preference + system preference
 */
export function getActiveTheme(userMode: ThemeMode): ColorTokens {
  if (userMode === 'dark') {
    return darkTheme;
  }
  if (userMode === 'light') {
    return lightTheme;
  }

  // 'auto' mode: derive tokens from active VS Code webview theme variables
  return buildAutoThemeFromVSCode(detectVSCodeThemeKind());
}

/**
 * Persist theme preference to localStorage
 */
export function saveThemePreference(mode: ThemeMode): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('studio-theme', mode);
  }
}

/**
 * Load theme preference from localStorage
 */
export function loadThemePreference(): ThemeMode {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('studio-theme') as ThemeMode | null;
    if (saved && ['light', 'dark', 'auto'].includes(saved)) {
      return saved;
    }
  }
  return 'auto'; // default
}
