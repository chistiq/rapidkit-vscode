import {
  darkTheme,
  lightTheme,
  type ThemeMode,
} from '@/components/StudioRedesign/styles/themeSystem';

type WorkspaiThemeKind = 'light' | 'dark';

type ThemePalette = typeof lightTheme;

function resolveOverridePalette(kind: WorkspaiThemeKind): ThemePalette {
  return kind === 'light' ? lightTheme : darkTheme;
}

/**
 * Maps Workspai light/dark palettes onto semantic `--ws-*` tokens and the
 * VS Code CSS variables dashboard legacy styles still read directly.
 * Used only when theme source is `override` (Settings Light/Dark).
 */
export function buildWorkspaiThemeOverrideVars(kind: WorkspaiThemeKind): Record<string, string> {
  const theme = resolveOverridePalette(kind);

  return {
    '--ws-surface': theme.canvas,
    '--ws-surface-raised': theme.surface2,
    '--ws-surface-input': theme.surface4,
    '--ws-surface-hover': `color-mix(in srgb, ${theme.primary} 10%, transparent)`,
    '--ws-text': theme.text.primary,
    '--ws-text-muted': theme.text.tertiary,
    '--ws-text-subtle': theme.text.quaternary,
    '--ws-border': theme.border.strong,
    '--ws-border-subtle': theme.border.subtle,
    '--ws-focus': theme.primary,
    '--ws-accent': theme.teal,
    '--ws-primary': theme.accent,
    '--ws-success': theme.success,
    '--ws-warn': theme.warning,
    '--ws-error': theme.error,
    '--vscode-editor-background': theme.canvas,
    '--vscode-sideBar-background': theme.surface2,
    '--vscode-editorWidget-background': theme.surface3,
    '--vscode-input-background': theme.surface4,
    '--vscode-foreground': theme.text.primary,
    '--vscode-editor-foreground': theme.text.primary,
    '--vscode-input-foreground': theme.text.primary,
    '--vscode-descriptionForeground': theme.text.tertiary,
    '--vscode-panel-border': theme.border.strong,
    '--vscode-focusBorder': theme.primary,
    '--vscode-list-hoverBackground': `color-mix(in srgb, ${theme.primary} 10%, transparent)`,
  };
}

export function resolveWorkspaiThemeOverrideStyle(
  themeMode: ThemeMode,
  themeKind: WorkspaiThemeKind
): Record<string, string> | undefined {
  if (themeMode === 'auto') {
    return undefined;
  }

  return buildWorkspaiThemeOverrideVars(themeKind);
}
