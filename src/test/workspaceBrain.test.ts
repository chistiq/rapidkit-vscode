import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  registerCommandMock,
  resolvePreferredAIModalContextMock,
  showAIModalMock,
  createOrShowMock,
} = vi.hoisted(() => ({
  registerCommandMock: vi.fn(),
  resolvePreferredAIModalContextMock: vi.fn(),
  showAIModalMock: vi.fn(),
  createOrShowMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: registerCommandMock,
  },
}));

vi.mock('../core/aiContextResolver', () => ({
  resolvePreferredAIModalContext: resolvePreferredAIModalContextMock,
}));

vi.mock('../ui/panels/welcomePanel', () => ({
  WelcomePanel: {
    showAIModal: showAIModalMock,
    createOrShow: createOrShowMock,
  },
}));

import { registerWorkspaceBrainCommand } from '../commands/workspaceBrain';

describe('workspaceBrain command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerCommandMock.mockImplementation((_command: string, handler: Function) => ({ handler }));
    resolvePreferredAIModalContextMock.mockResolvedValue({
      type: 'workspace',
      name: 'shared-governance-platform-wsp',
      path: '/workspace',
    });
  });

  it('opens the shared AI modal with a Workspace Advisor prefill question', async () => {
    const context = { subscriptions: [] };
    const disposable = registerWorkspaceBrainCommand(context as any) as unknown as {
      handler: Function;
    };

    await disposable.handler({
      source: 'workspai-secondary-sidebar',
      trigger: 'impact-lens-share-code',
      prefillQuestion: 'What is the best way to share code between projects in this workspace?',
    });

    expect(registerCommandMock).toHaveBeenCalledWith(
      'workspai.workspaceBrain',
      expect.any(Function)
    );
    expect(showAIModalMock).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        type: 'workspace',
        name: 'shared-governance-platform-wsp',
        path: '/workspace',
        prefillMode: 'ask',
        prefillQuestion: 'What is the best way to share code between projects in this workspace?',
      })
    );
  });

  it('falls back to dashboard when no workspace context is available', async () => {
    resolvePreferredAIModalContextMock.mockResolvedValue({
      type: 'workspace',
      name: 'No workspace',
      path: undefined,
    });
    const context = { subscriptions: [] };
    const disposable = registerWorkspaceBrainCommand(context as any) as unknown as {
      handler: Function;
    };

    await disposable.handler({
      prefillQuestion: 'How should I set up a shared database for all projects?',
    });

    expect(showAIModalMock).not.toHaveBeenCalled();
    expect(createOrShowMock).toHaveBeenCalledWith(context);
  });
});
