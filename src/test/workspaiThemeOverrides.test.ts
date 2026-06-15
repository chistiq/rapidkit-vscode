import { describe, expect, it } from 'vitest';

import {
  buildWorkspaiThemeOverrideVars,
  resolveWorkspaiThemeOverrideStyle,
} from '../../webview-ui/src/lib/workspaiThemeOverrides';

describe('workspaiThemeOverrides', () => {
  it('returns override CSS variables for light and dark modes', () => {
    const lightVars = buildWorkspaiThemeOverrideVars('light');
    const darkVars = buildWorkspaiThemeOverrideVars('dark');

    expect(lightVars['--ws-surface']).toBe('#ffffff');
    expect(lightVars['--vscode-editor-background']).toBe('#ffffff');
    expect(lightVars['--ws-text']).toContain('51, 51, 51');

    expect(darkVars['--ws-surface']).toBe('#1e1e1e');
    expect(darkVars['--vscode-editor-background']).toBe('#1e1e1e');
    expect(darkVars['--ws-text']).toContain('204, 204, 204');
  });

  it('skips override styles in auto mode', () => {
    expect(resolveWorkspaiThemeOverrideStyle('auto', 'dark')).toBeUndefined();
    expect(resolveWorkspaiThemeOverrideStyle('light', 'light')).toMatchObject({
      '--ws-surface': '#ffffff',
    });
  });
});
