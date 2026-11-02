import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createChatParticipantMock,
  collectDebugPrefillQuestionMock,
  prepareAIConversationMock,
  resolvePreferredAIModalContextMock,
  streamAIResponseMock,
  trackCommandEventMock,
  runNativeChatRepairMock,
  runNativeAssistantQuestionMock,
} = vi.hoisted(() => ({
  createChatParticipantMock: vi.fn(),
  collectDebugPrefillQuestionMock: vi.fn(),
  prepareAIConversationMock: vi.fn(),
  resolvePreferredAIModalContextMock: vi.fn(),
  streamAIResponseMock: vi.fn(),
  trackCommandEventMock: vi.fn(),
  runNativeChatRepairMock: vi.fn(),
  runNativeAssistantQuestionMock: vi.fn(),
}));

vi.mock('vscode', () => {
  class ThemeIcon {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
  }

  class ChatRequestTurn {
    prompt: string;
    constructor(prompt: string) {
      this.prompt = prompt;
    }
  }

  class ChatResponseMarkdownPart {
    value: { value: string };
    constructor(value: string) {
      this.value = { value };
    }
  }

  class ChatResponseTurn {
    response: unknown[];
    constructor(
      response: unknown[],
      readonly result: { metadata?: Record<string, unknown> } = {},
      readonly participant = 'workspai.assistant'
    ) {
      this.response = response;
    }
  }

  return {
    chat: {
      createChatParticipant: createChatParticipantMock,
    },
    window: {
      activeTextEditor: undefined,
      createOutputChannel: () => ({
        appendLine: () => undefined,
        show: () => undefined,
        clear: () => undefined,
        dispose: () => undefined,
      }),
    },
    workspace: {
      isTrusted: true,
      workspaceFolders: [{ name: 'demo-workspace', uri: { fsPath: '/tmp/demo-workspace' } }],
    },
    ThemeIcon,
    ChatRequestTurn,
    ChatResponseTurn,
    ChatResponseMarkdownPart,
  };
});

vi.mock('../core/aiService', () => ({
  prepareAIConversation: prepareAIConversationMock,
  streamAIResponse: streamAIResponseMock,
}));

vi.mock('../core/aiContextResolver', () => ({
  resolvePreferredAIModalContext: resolvePreferredAIModalContextMock,
}));

vi.mock('../commands/aiDebugger', () => ({
  collectDebugPrefillQuestion: collectDebugPrefillQuestionMock,
}));

vi.mock('../utils/workspaceUsageTracker', () => ({
  WorkspaceUsageTracker: {
    getInstance: () => ({
      trackCommandEvent: trackCommandEventMock,
    }),
  },
}));

vi.mock('../core/nativeChatRepair', () => ({
  runNativeChatRepair: runNativeChatRepairMock,
}));

vi.mock('../core/nativeAssistantQuestion', () => ({
  runNativeAssistantQuestion: runNativeAssistantQuestionMock,
}));

import { registerWorkspaiChatParticipant } from '../commands/chatParticipant';

describe('chatParticipant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runNativeAssistantQuestionMock.mockResolvedValue({
      status: 'completed',
      sessionId: 'native-question',
    });

    createChatParticipantMock.mockImplementation((_id: string, handler: unknown) => ({
      handler,
      iconPath: undefined,
      followupProvider: undefined,
      commands: [],
      dispose: vi.fn(),
    }));

    collectDebugPrefillQuestionMock.mockReturnValue('Error: db connection refused');
    resolvePreferredAIModalContextMock.mockResolvedValue({
      type: 'workspace',
      name: 'demo-workspace',
      path: '/tmp/demo-workspace',
      workspaceRootPath: '/tmp/demo-workspace',
    });

    prepareAIConversationMock.mockResolvedValue({
      messages: [{ role: 'user', content: 'test' }],
      scanned: { projectRoot: '/tmp/demo-workspace' },
      projectBootstrap: { status: 'not-applicable', adopted: false },
      contract: {
        contract_version: 1,
        persona: 'midlevel',
        evidence_confidence: 'strong',
        workspace: {
          path: '/tmp/demo-workspace',
          name: 'demo-workspace',
          doctorLastRunAt: '2026-04-22T12:00:00.000Z',
          healthPercent: 100,
          projectCount: 1,
          knownProjects: [],
        },
        project: undefined,
        commandScope: 'workspace',
        safetyFlags: {
          projectAlreadyExists: false,
          moduleSupportDisabled: false,
          doctorEvidenceStale: false,
          safeActionsOnly: false,
        },
      },
      validation: {
        valid: true,
        missing: [],
        clarificationNeeded: false,
      },
    });

    streamAIResponseMock.mockImplementation(
      async (_messages: unknown, onChunk: (chunk: { text?: string }) => void) => {
        onChunk({ text: 'AI answer' });
      }
    );
    runNativeChatRepairMock.mockResolvedValue({
      cardId: 'workspaceVerify',
      transactionId: 'repair_native1',
      state: 'closed',
    });
  });

  it('registers participant with expected id and icon', () => {
    const context = { subscriptions: [] as { dispose: () => void }[] };

    registerWorkspaiChatParticipant(context as any);

    expect(createChatParticipantMock).toHaveBeenCalledWith(
      'workspai.assistant',
      expect.any(Function)
    );
    expect(context.subscriptions).toHaveLength(1);

    const participant = context.subscriptions[0] as unknown as { iconPath: { id: string } };
    expect(participant.iconPath.id).toBe('sparkle');
  });

  it('returns empty ask guidance for blank prompt', async () => {
    const context = { subscriptions: [] as { dispose: () => void }[] };
    registerWorkspaiChatParticipant(context as any);

    const participant = context.subscriptions[0] as unknown as {
      handler: Function;
    };

    const markdown = vi.fn();
    const stream = {
      markdown,
      progress: vi.fn(),
      button: vi.fn(),
    };

    await participant.handler({ prompt: '   ', command: 'ask' }, { history: [] }, stream, {
      isCancellationRequested: false,
    });

    expect(markdown).toHaveBeenCalledWith(
      'Ask me anything about your Workspai project — architecture, modules, configuration, best practices.'
    );
    expect(prepareAIConversationMock).not.toHaveBeenCalled();
  });

  it('routes repair requests through the native governed repair surface', async () => {
    const context = { subscriptions: [] as { dispose: () => void }[] };
    registerWorkspaiChatParticipant(context as any);
    const participant = context.subscriptions[0] as unknown as {
      handler: Function;
      commands: Array<{ name: string }>;
    };
    const stream = { markdown: vi.fn(), progress: vi.fn(), button: vi.fn() };

    const result = await participant.handler(
      { prompt: 'Workspace Verify', command: 'repair' },
      { history: [] },
      stream,
      { isCancellationRequested: false }
    );

    expect(runNativeChatRepairMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Workspace Verify',
        context: expect.objectContaining({ workspaceRootPath: '/tmp/demo-workspace' }),
        stream,
      })
    );
    expect(result.metadata).toMatchObject({
      command: 'repair',
      repair: { transactionId: 'repair_native1', state: 'closed' },
    });
    expect(participant.commands).toContainEqual(expect.objectContaining({ name: 'repair' }));
    expect(prepareAIConversationMock).not.toHaveBeenCalled();
  });

  it('uses debug mode and appends editor context prefill', async () => {
    const context = { subscriptions: [] as { dispose: () => void }[] };
    registerWorkspaiChatParticipant(context as any);

    const participant = context.subscriptions[0] as unknown as {
      handler: Function;
    };

    const stream = {
      markdown: vi.fn(),
      progress: vi.fn(),
      button: vi.fn(),
    };

    await participant.handler(
      { prompt: 'why failing?', command: 'debug' },
      { history: [] },
      stream,
      { isCancellationRequested: false }
    );

    expect(runNativeAssistantQuestionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining(
          'why failing?\n\n<editor_context>\nError: db connection refused\n</editor_context>'
        ),
        scope: expect.objectContaining({ type: 'workspace', name: 'demo-workspace' }),
      })
    );
    expect(prepareAIConversationMock).not.toHaveBeenCalled();
  });

  it('takes continuation identity only from this participant response metadata', async () => {
    const context = { subscriptions: [] as { dispose(): void }[] };
    registerWorkspaiChatParticipant(context as any);
    const participant = context.subscriptions[0] as unknown as { handler: Function };
    const own = new vscode.ChatResponseTurn([], {
      metadata: { command: 'ask', sessionId: 'own-chat' },
    } as any);
    const foreign = new vscode.ChatResponseTurn(
      [],
      { metadata: { command: 'ask', sessionId: 'foreign-chat' } } as any,
      'another.participant'
    );
    await participant.handler(
      { prompt: 'Continue', command: 'ask' },
      { history: [own, foreign] },
      { markdown: vi.fn(), progress: vi.fn(), button: vi.fn() },
      { isCancellationRequested: false }
    );
    expect(runNativeAssistantQuestionMock).toHaveBeenCalledWith(
      expect.objectContaining({ previousSessionId: 'own-chat' })
    );
  });

  it('maps followups based on result command metadata', () => {
    const context = { subscriptions: [] as { dispose: () => void }[] };
    registerWorkspaiChatParticipant(context as any);

    const participant = context.subscriptions[0] as unknown as {
      followupProvider: {
        provideFollowups: Function;
      };
    };

    const debugFollowups = participant.followupProvider.provideFollowups(
      { metadata: { command: 'debug' } },
      { history: [] },
      { isCancellationRequested: false }
    );

    const askFollowups = participant.followupProvider.provideFollowups(
      { metadata: { command: 'ask' } },
      { history: [] },
      { isCancellationRequested: false }
    );

    expect(
      debugFollowups.some((f: { label: string }) => f.label === 'Show full corrected file')
    ).toBe(true);
    expect(askFollowups.some((f: { label: string }) => f.label === 'Suggest a module')).toBe(true);
  });

  it('routes questions through the shared runtime without forcing CLI bootstrap or evidence generation', async () => {
    const context = { subscriptions: [] as { dispose: () => void }[] };
    registerWorkspaiChatParticipant(context as any);
    const participant = context.subscriptions[0] as unknown as { handler: Function };
    const stream = { markdown: vi.fn(), progress: vi.fn(), button: vi.fn() };
    const ownership = { opaque: true };
    await participant.handler(
      { prompt: 'Explain the architecture', command: 'ask', toolInvocationToken: ownership },
      { history: [] },
      stream,
      { isCancellationRequested: false }
    );
    expect(runNativeAssistantQuestionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'Explain the architecture',
        toolInvocationToken: ownership,
        stream,
      })
    );
    expect(prepareAIConversationMock).not.toHaveBeenCalled();
    expect(streamAIResponseMock).not.toHaveBeenCalled();
  });
});
