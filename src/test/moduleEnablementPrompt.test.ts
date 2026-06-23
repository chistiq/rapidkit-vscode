import { describe, expect, it, vi } from 'vitest';

const { showQuickPickMock } = vi.hoisted(() => ({
  showQuickPickMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showQuickPick: showQuickPickMock,
  },
}));

import {
  promptEnableModulesOption,
  resolveEnableModulesPreference,
} from '../core/moduleEnablementPrompt';

describe('moduleEnablementPrompt', () => {
  it('returns preset without opening QuickPick', async () => {
    showQuickPickMock.mockReset();
    await expect(resolveEnableModulesPreference('Import', false)).resolves.toBe(false);
    await expect(resolveEnableModulesPreference('Adopt', true)).resolves.toBe(true);
    expect(showQuickPickMock).not.toHaveBeenCalled();
  });

  it('delegates to QuickPick when preset is absent', async () => {
    showQuickPickMock.mockResolvedValueOnce({ value: true });
    await expect(resolveEnableModulesPreference('Import')).resolves.toBe(true);
    expect(showQuickPickMock).toHaveBeenCalledOnce();
  });

  it('returns undefined when QuickPick is dismissed', async () => {
    showQuickPickMock.mockResolvedValueOnce(undefined);
    await expect(promptEnableModulesOption('Import')).resolves.toBeUndefined();
  });
});
