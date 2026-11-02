import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { persistedState } = vi.hoisted(() => ({
  persistedState: { value: undefined as unknown },
}));

vi.mock('@/vscode', () => ({
  vscode: {
    getState: () => persistedState.value,
    setState: (value: unknown) => {
      persistedState.value = value;
    },
  },
}));

import { useChatSessions } from '../../webview-ui/src/sidebar/useChatSessions';
import { chatResponseDisplayParts } from '../../webview-ui/src/sidebar/chatResponseParts';
import { ChatSessionBar } from '../../webview-ui/src/sidebar/composer/ChatSessionBar';
import { pendingChatApprovals } from '../../webview-ui/src/sidebar/sidebarSessions';

describe('useChatSessions behavior', () => {
  let dom: JSDOM | undefined;
  let root: Root | undefined;
  let container: HTMLElement | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    dom?.window.close();
    dom = undefined;
    container = null;
    persistedState.value = undefined;
    vi.unstubAllGlobals();
  });

  function mount(node: ReactNode): void {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = dom.window.document.getElementById('root');
    if (!container) {
      throw new Error('Chat session test root element was not created.');
    }
    root = createRoot(container);
    act(() => root?.render(node));
  }

  it('owns dashboard repair approvals and cancellation even without an initial chat message', async () => {
    let state!: ReturnType<typeof useChatSessions>;
    function Harness() {
      state = useChatSessions('workspaiStudio', 'studio');
      return null;
    }
    mount(createElement(Harness));
    let id = '';
    await act(async () => {
      id = state.openIncidentSession({
        title: 'Fix Doctor',
        incident: { key: 'doctor', cardId: 'doctor' },
      });
    });
    expect(state.sessions[0].messages).toEqual([]);
    await act(async () => state.bindRequest(id, 'repair'));
    await act(async () =>
      state.recordActivity(id, {
        action: 'execute-remediation-step',
        status: 'review',
        title: 'Approval required',
        summary: 'Install project dependencies',
        requestId: 'repair',
        invocationId: 'install',
        approvalRequest: {
          sessionId: id,
          toolCallId: 'install',
          fingerprint: 'a'.repeat(64),
          scope: 'workspace',
          command: 'Workspai remediation action: doctor.web.materialize',
          commandLabel: 'Install dependencies',
          summary: 'Install project dependencies',
          reasons: [],
          allowedExecutions: ['once'],
        },
      })
    );
    expect(pendingChatApprovals(state.sessions[0])).toHaveLength(1);
    await act(async () => state.setActivity(id, 'Waiting for command approval…'));
    await act(async () =>
      state.failSession(
        id,
        'Stopped',
        'Stopped before installing dependencies.',
        'repair',
        'cancelled'
      )
    );
    expect(state.sessions[0]).toMatchObject({
      status: 'error',
      terminalReason: 'cancelled',
      activityLabel: undefined,
    });
    expect(state.sessions[0].messages[0].content).toBe('Stopped before installing dependencies.');
    expect(pendingChatApprovals(state.sessions[0])).toHaveLength(0);
    await act(async () => state.bindRequest(id, 'resumed'));
    expect(state.sessions[0].messages).toHaveLength(2);
    expect(state.sessions[0].messages[0].requestIds).toEqual(['repair']);
    expect(state.sessions[0].messages[1].requestIds).toEqual(['resumed']);
  });

  it.each(['finish', 'fail', 'approval', 'replay'] as const)(
    'recovers an empty legacy repair through %s without losing request ownership',
    async (event) => {
      let state!: ReturnType<typeof useChatSessions>;
      function Harness() {
        state = useChatSessions('workspaiStudio', 'studio');
        return null;
      }
      mount(createElement(Harness));
      let id = '';
      await act(async () => {
        id = state.openIncidentSession({
          title: 'Fix Doctor',
          incident: { key: 'doctor', cardId: 'doctor' },
        });
      });
      await act(async () => state.setActivity(id, 'Working'));
      await act(async () => {
        if (event === 'finish') state.finishStreaming(id, undefined, 'Verified repair.', 'repair');
        if (event === 'fail')
          state.failSession(id, 'Stopped', 'Repair stopped.', 'repair', 'cancelled');
        if (event === 'approval')
          state.recordActivity(id, {
            action: 'execute-remediation-step',
            status: 'review',
            title: 'Approval required',
            summary: '',
            requestId: 'repair',
            invocationId: 'install',
          });
        if (event === 'replay') state.bindRequest(id, 'repair', true);
      });
      expect(state.sessions[0].messages[0].requestIds).toEqual(['repair']);
      if (event === 'finish' || event === 'fail')
        expect(state.sessions[0].status).not.toBe('streaming');
    }
  );

  it('does not bind replayed repair requests to a newer ordinary response', async () => {
    let state!: ReturnType<typeof useChatSessions>;
    function Harness() {
      state = useChatSessions('workspaiStudio', 'studio');
      return null;
    }
    mount(createElement(Harness));
    let id = '';
    await act(async () => {
      id = state.startQuery('New request').sessionId;
    });
    await act(async () => state.bindRequest(id, 'old-repair', true));
    expect(state.sessions[0].messages.at(-1)?.requestIds).toBeUndefined();
  });

  it('delivers the terminal result to the latest steered response sharing the running request', async () => {
    let state!: ReturnType<typeof useChatSessions>;
    function Harness() {
      state = useChatSessions('workspaiStudio', 'studio');
      return null;
    }
    mount(createElement(Harness));
    let id = '';
    await act(async () => {
      id = state.startQuery('Inspect the service').sessionId;
    });
    await act(async () => {
      state.bindRequest(id, 'running');
      state.appendChunk(id, 'Initial findings.');
    });
    await act(async () => {
      state.steerSession(id, 'Use staging');
    });
    await act(async () =>
      state.failSession(
        id,
        'Connection interrupted',
        'Staging findings retained.',
        'running',
        'ai-provider-unavailable'
      )
    );
    expect(state.sessions[0].status).toBe('error');
    expect(state.sessions[0].messages[1].content).toBe('Initial findings.');
    expect(state.sessions[0].messages.at(-1)?.content).toBe('Staging findings retained.');
    await act(async () =>
      state.finishStreaming(id, 'auto', 'Staging inspection complete.', 'running')
    );
    expect(state.sessions[0].status).toBe('done');
    expect(state.sessions[0].messages[1].content).toBe('Initial findings.');
    expect(state.sessions[0].messages.at(-1)?.content).toBe('Staging inspection complete.');
  });

  it('keeps distinct reads beyond the old forty-row activity window and updates calls in place', async () => {
    let state!: ReturnType<typeof useChatSessions>;
    function Harness() {
      state = useChatSessions('workspaiStudio', 'studio');
      return null;
    }
    mount(createElement(Harness));
    let id = '';
    await act(async () => {
      id = state.startQuery('Review the project').sessionId;
    });
    await act(async () => state.bindRequest(id, 'r'));
    for (let at = 0; at < 45; at++) {
      await act(async () =>
        state.recordActivity(id, {
          action: 'inspect-source',
          status: 'running',
          title: `Read ${at}`,
          summary: '',
          requestId: 'r',
          invocationId: `call-${at}`,
          activityPaths: [`file-${at}.ts`],
        })
      );
      await act(async () =>
        state.recordActivity(id, {
          action: 'inspect-source',
          status: 'done',
          title: `Read ${at}`,
          summary: 'Read source',
          requestId: 'r',
          invocationId: `call-${at}`,
          activityPaths: [`file-${at}.ts`],
        })
      );
    }
    const entries = state.sessions[0].messages.at(-1)!.activity!;
    expect(entries).toHaveLength(45);
    expect(entries[0].invocationId).toBe('call-0');
    expect(entries.every((entry) => entry.status === 'done')).toBe(true);
    expect(new Set(entries.map((entry) => entry.transcriptId)).size).toBe(45);
  });

  it('retains attachment identities across reload and restores bytes only to the owning user turn', async () => {
    let state!: ReturnType<typeof useChatSessions>;
    function Harness() {
      state = useChatSessions('workspaiStudio', 'studio');
      return null;
    }
    mount(createElement(Harness));
    let sessionId = '';
    const images = [{ mimeType: 'image/png', base64: 'aW1hZ2U=' }];
    await act(async () => {
      sessionId = state.startQuery('Inspect the image', undefined, { images }).sessionId;
    });
    const turnId = state.sessions[0].messages[0].id!;
    await act(async () => state.restoreAttachments(sessionId, turnId, true));
    await act(async () => root?.unmount());
    root = undefined;
    mount(createElement(Harness));
    expect(state.sessions[0].messages[0]).toMatchObject({
      id: turnId,
      attachmentStored: true,
      hasImage: true,
    });
    expect(state.sessions[0].messages[0].images).toBeUndefined();
    await act(async () => state.restoreAttachments(sessionId, turnId, true, images));
    expect(state.sessions[0].messages[0].images).toEqual(images);
    expect(state.sessions[0].messages[1].images).toBeUndefined();
  });

  it('keeps text between separate tool calls and updates a late result in its original position', async () => {
    let state!: ReturnType<typeof useChatSessions>;
    function Harness() {
      state = useChatSessions('workspaiStudio', 'studio');
      return null;
    }
    mount(createElement(Harness));
    let id = '';
    await act(async () => {
      id = state.startQuery('Inspect two files').sessionId;
    });
    await act(async () => state.bindRequest(id, 'request'));
    const tool = (
      invocationId: string,
      title: string,
      eventSequence: number,
      status = 'done' as 'done' | 'running'
    ) => ({
      requestId: 'request',
      invocationId,
      eventSequence,
      action: 'inspect-source',
      title,
      summary: '',
      status,
    });
    await act(async () => state.appendChunk(id, 'First explanation.'));
    await act(async () => state.recordActivity(id, tool('first', 'Reading first', 1, 'running')));
    await act(async () => state.appendChunk(id, 'Second explanation.'));
    await act(async () => state.recordActivity(id, tool('second', 'Read second', 2)));
    await act(async () => state.recordActivity(id, tool('first', 'Read first', 3)));
    await act(async () => state.finishStreaming(id, undefined, 'Both files inspected.'));
    const turn = state.sessions[0].messages.at(-1)!;
    expect(
      chatResponseDisplayParts(turn).map((part) =>
        part.kind === 'text' ? part.text : part.entries.map((entry) => entry.title).join(',')
      )
    ).toEqual([
      'First explanation.',
      'Read first',
      'Second explanation.',
      'Read second',
      'Both files inspected.',
    ]);
    await act(async () => root?.unmount());
    root = undefined;
    mount(createElement(Harness));
    expect(chatResponseDisplayParts(state.sessions[0].messages.at(-1)!)).toEqual(
      chatResponseDisplayParts(turn)
    );
  });
  it('shows suspended input separately from model work and resumes the same conversation', async () => {
    let state!: ReturnType<typeof useChatSessions>;
    function Harness() {
      state = useChatSessions('workspaiStudio', 'studio');
      return createElement(ChatSessionBar, {
        activeSession:
          state.sessions.find((session) => session.sessionId === state.activeId) ?? null,
        sessionCount: state.sessions.length,
        onNewSession: state.newSession,
        onOpenHistory: () => {},
      });
    }
    mount(createElement(Harness));
    let id = '';
    await act(async () => {
      id = state.startQuery('Investigate a failure').sessionId;
    });
    await act(async () => {
      state.appendChunk(id, 'Which environment should I inspect?');
      state.setWaitingForInput(id, true);
    });
    expect(container?.textContent).toContain('Waiting for your input…');
    expect(container?.textContent).not.toContain('Working…');
    expect(state.sessions[0]).toMatchObject({ status: 'streaming', waitingForInput: true });
    await act(async () => state.steerSession(id, 'Use staging'));
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].messages.at(-2)?.content).toBe('Use staging');
    expect(state.sessions[0].messages.at(-1)).toMatchObject({ role: 'assistant', content: '' });
    expect(state.sessions[0].waitingForInput).toBe(false);
    expect(container?.textContent).toContain('Working…');
    await act(async () => state.setWaitingForInput(id, true));
    await act(async () => state.failSession(id, 'Request cancelled.'));
    expect(state.sessions[0]).toMatchObject({ status: 'error', waitingForInput: false });
    expect(container?.textContent).not.toContain('Waiting for your input…');
  });

  it('keeps tool histories beside their own responses through later turns, late events and reloads', async () => {
    let state!: ReturnType<typeof useChatSessions>;
    function Harness() {
      state = useChatSessions('workspaiStudio', 'studio');
      return createElement(
        'div',
        null,
        state.sessions[0]?.messages.map((turn, index) =>
          createElement(
            'section',
            { key: index, 'data-role': turn.role },
            turn.activity?.map((entry) => entry.title).join(' '),
            turn.content
          )
        )
      );
    }
    mount(createElement(Harness));
    let id = '';
    await act(async () => {
      id = state.startQuery('List commands').sessionId;
    });
    await act(async () => {
      state.bindRequest(id, 'request-one');
      state.recordActivity(id, {
        action: 'inspect-cli-commands',
        status: 'done',
        title: 'First catalog read',
        requestId: 'request-one',
        invocationId: 'one',
      });
      state.finishStreaming(id, 'auto', 'First command list');
    });
    await act(async () => {
      state.startQuery('Explain project');
    });
    await act(async () => {
      state.bindRequest(id, 'request-two');
      state.recordActivity(id, {
        action: 'inspect-source',
        status: 'done',
        title: 'Second source read',
        requestId: 'request-two',
        invocationId: 'two',
      });
      state.recordActivity(id, {
        action: 'session-completed',
        status: 'done',
        title: 'Late first event',
        requestId: 'request-one',
      });
      state.recordActivity(id, {
        action: 'inspect-source',
        status: 'done',
        title: 'Unmatched historical event',
        requestId: 'unknown',
      });
      state.finishStreaming(id, 'auto', 'Second explanation');
    });
    const responses = [...container!.querySelectorAll('[data-role="assistant"]')];
    expect(responses[0].textContent).toContain('First catalog read');
    expect(responses[0].textContent).toContain('Late first event');
    expect(responses[0].textContent).not.toContain('Second source read');
    expect(responses[1].textContent).toContain('Second source read');
    expect(responses[1].textContent).not.toContain('First catalog read');
    expect(container!.textContent).not.toContain('Unmatched historical event');
    await act(async () => root?.unmount());
    root = undefined;
    mount(createElement(Harness));
    expect(state.sessions[0].messages[1].activity?.[0].title).toBe('First catalog read');
    expect(state.sessions[0].messages[3].activity?.[0].title).toBe('Second source read');
  });

  it('renders and persists an incomplete answer, and preserves it on duplicate error messages', async () => {
    persistedState.value = {
      workspaiStudio: {
        activeId: 'failed',
        sessions: [
          {
            sessionId: 'failed',
            title: 'Update service',
            status: 'streaming',
            messages: [
              { role: 'user', content: 'Update service' },
              { role: 'assistant', content: '' },
            ],
          },
        ],
      },
    };
    let sessions: ReturnType<typeof useChatSessions>;
    function Harness() {
      sessions = useChatSessions('workspaiStudio', 'studio');
      return createElement(
        'div',
        null,
        sessions.sessions
          .find((session) => session.sessionId === sessions.activeId)
          ?.messages.map((message) => message.content)
          .join(' ')
      );
    }
    mount(createElement(Harness));
    await act(async () =>
      sessions.failSession(
        'failed',
        'Some work remains.',
        'I updated the service. The integration check needs a credential. Configure it, then resume.'
      )
    );
    expect(container?.textContent).toContain('integration check needs a credential');
    await act(async () => sessions.failSession('failed', 'Some work remains.'));
    expect(container?.textContent).toContain('integration check needs a credential');
    const saved = persistedState.value as {
      workspaiStudio: { sessions: Array<{ status: string; messages: Array<{ content: string }> }> };
    };
    expect(saved.workspaiStudio.sessions[0].status).toBe('error');
    expect(saved.workspaiStudio.sessions[0].messages.at(-1)?.content).toContain(
      'Configure it, then resume'
    );
  });

  it('keeps the final answer after a user replies to a clarification', async () => {
    persistedState.value = {
      workspaiStudio: {
        activeId: 'clarify',
        sessions: [
          {
            sessionId: 'clarify',
            title: 'Update service',
            status: 'streaming',
            messages: [
              { role: 'user', content: 'Update service' },
              { role: 'assistant', content: 'Which environment?' },
            ],
          },
        ],
      },
    };
    let sessions: ReturnType<typeof useChatSessions>;
    function Harness() {
      sessions = useChatSessions('workspaiStudio', 'studio');
      return createElement(
        'div',
        null,
        sessions.sessions
          .find((session) => session.sessionId === sessions.activeId)
          ?.messages.map((message) => message.content)
          .join(' ')
      );
    }
    mount(createElement(Harness));
    await act(async () => sessions.steerSession('clarify', 'Use staging.'));
    await act(async () =>
      sessions.finishStreaming('clarify', 'model', 'Updated staging and verified the result.')
    );
    expect(container?.textContent).toContain('Use staging.');
    expect(container?.textContent).toContain('Updated staging and verified');
    expect(sessions!.sessions[0].status).toBe('done');
  });

  it('retains image previews across final answer settlement without persisting binary data in webview state', async () => {
    persistedState.value = {
      workspaiStudio: {
        activeId: 'images',
        sessions: [
          {
            sessionId: 'images',
            title: 'Screenshot',
            status: 'streaming',
            messages: [{ role: 'assistant', content: '' }],
          },
        ],
      },
    };
    let sessions: ReturnType<typeof useChatSessions>;
    function Harness() {
      sessions = useChatSessions('workspaiStudio', 'studio');
      return createElement(
        'div',
        null,
        sessions.sessions[0]?.messages[0]?.images?.map((image) =>
          createElement('img', {
            key: image.base64,
            src: `data:${image.mimeType};base64,${image.base64}`,
            alt: 'Screenshot',
          })
        )
      );
    }
    mount(createElement(Harness));
    await act(async () =>
      sessions.appendToolImages('images', [{ mimeType: 'image/png', base64: 'iVBORw==' }])
    );
    await act(async () =>
      sessions.finishStreaming('images', 'vision-model', 'The page contains a button.')
    );
    expect(container?.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,iVBORw=='
    );
    expect(sessions!.sessions[0].messages[0].content).toContain('contains a button');
    expect(JSON.stringify(persistedState.value)).not.toContain('iVBORw==');
  });

  it('fills an empty assistant turn when an early error has no model answer', async () => {
    persistedState.value = {
      workspaiStudio: {
        activeId: 'early',
        sessions: [
          {
            sessionId: 'early',
            title: 'Inspect service',
            status: 'streaming',
            messages: [
              { role: 'user', content: 'Inspect service' },
              { role: 'assistant', content: '' },
            ],
          },
        ],
      },
    };
    let sessions: ReturnType<typeof useChatSessions>;
    function Harness() {
      sessions = useChatSessions('workspaiStudio', 'studio');
      return createElement(
        'div',
        null,
        sessions.sessions
          .find((session) => session.sessionId === sessions.activeId)
          ?.messages.map((message) => message.content)
          .join(' ')
      );
    }
    mount(createElement(Harness));
    await act(async () => sessions.failSession('early', 'Provider authentication failed.'));
    expect(container?.textContent).toContain('Provider authentication failed');
    expect(container?.textContent).toContain('No verified completion is claimed');
  });

  it('keeps an existing chat bound to its original workspace after selection changes', async () => {
    persistedState.value = {
      workspaiImpact: {
        activeId: 'impact-a',
        sessions: [
          {
            sessionId: 'impact-a',
            title: 'Workspace A',
            status: 'done',
            messages: [{ role: 'user', content: 'Inspect A' }],
            scope: {
              workspaceName: 'A',
              workspacePath: '/workspaces/a',
              projectName: 'api-a',
              projectPath: '/workspaces/a/api',
              firstSeenAt: '2026-01-01T00:00:00.000Z',
              lastSeenAt: '2026-01-01T00:00:00.000Z',
            },
          },
        ],
      },
    };
    let result: ReturnType<ReturnType<typeof useChatSessions>['startQuery']> | undefined;

    function Harness() {
      const sessions = useChatSessions('workspaiStudio', 'studio');
      return createElement(
        'button',
        {
          onClick: () => {
            result = sessions.startQuery('Continue the review', 'investigate', {
              assistantMode: 'ask',
              scope: {
                workspaceName: 'B',
                workspacePath: '/workspaces/b',
                projectName: 'api-b',
                projectPath: '/workspaces/b/api',
              },
            });
          },
        },
        'submit'
      );
    }

    mount(createElement(Harness));
    const button = container?.querySelector('button');
    if (!button) {
      throw new Error('Chat session submit button was not rendered.');
    }
    await act(async () => {
      button.click();
    });

    expect(result?.sessionId).toBe('impact-a');
    expect(result?.session.scope?.workspacePath).toBe('/workspaces/a');
    expect(result?.session.scope?.projectPath).toBe('/workspaces/a/api');
  });

  it('keeps Explain editor diagnostics attached to the Ask session', async () => {
    let result: ReturnType<ReturnType<typeof useChatSessions>['startQuery']> | undefined;

    function Harness() {
      const sessions = useChatSessions('workspaiStudio', 'studio');
      return createElement(
        'button',
        {
          onClick: () => {
            sessions.openEditorSession({
              title: 'Explain a.ts',
              assistantMode: 'ask',
              editorIssue: {
                key: 'file:/workspace/a.ts',
                filePath: '/workspace/a.ts',
                fileName: 'a.ts',
                languageId: 'typescript',
              },
            });
            result = sessions.startQuery('Explain this diagnostic', 'investigate', {
              assistantMode: 'ask',
              scope: {
                workspaceName: 'Other',
                workspacePath: '/workspace/other',
              },
            });
          },
        },
        'explain'
      );
    }

    mount(createElement(Harness));
    const button = container?.querySelector('button');
    if (!button) {
      throw new Error('Explain button was not rendered.');
    }
    await act(async () => {
      button.click();
    });

    expect(result?.session.editorIssue?.filePath).toBe('/workspace/a.ts');
    expect(result?.session.scope).toBeUndefined();
  });

  it.each([
    { existingMode: 'agent' as const, requestedMode: 'ask' as const },
    { existingMode: 'ask' as const, requestedMode: 'agent' as const },
    { existingMode: undefined, requestedMode: 'ask' as const },
  ])(
    'does not reuse an editor session across $existingMode and $requestedMode modes',
    async ({ existingMode, requestedMode }) => {
      persistedState.value = {
        workspaiStudio: {
          activeId: 'existing-editor-session',
          sessions: [
            {
              sessionId: 'existing-editor-session',
              title: 'Existing file session',
              status: 'done',
              assistantMode: existingMode,
              messages: [{ role: 'user', content: 'Prior work' }],
              editorIssue: {
                key: 'file:/workspace/a.ts',
                filePath: '/workspace/a.ts',
                fileName: 'a.ts',
                languageId: 'typescript',
                firstSeenAt: '2026-01-01T00:00:00.000Z',
                lastSeenAt: '2026-01-01T00:00:00.000Z',
              },
            },
          ],
        },
      };
      let result: ReturnType<ReturnType<typeof useChatSessions>['startQuery']> | undefined;

      function Harness() {
        const sessions = useChatSessions('workspaiStudio', 'studio');
        return createElement(
          'button',
          {
            onClick: () => {
              sessions.openEditorSession({
                title: 'Current file session',
                assistantMode: requestedMode,
                editorIssue: {
                  key: 'file:/workspace/a.ts',
                  filePath: '/workspace/a.ts',
                  fileName: 'a.ts',
                  languageId: 'typescript',
                },
              });
              result = sessions.startQuery('Continue in the selected mode', 'investigate', {
                assistantMode: requestedMode,
                scope: {
                  workspaceName: 'Other',
                  workspacePath: '/workspace/other',
                },
              });
            },
          },
          'open'
        );
      }

      mount(createElement(Harness));
      const button = container?.querySelector('button');
      if (!button) {
        throw new Error('Editor session button was not rendered.');
      }
      await act(async () => {
        button.click();
      });

      expect(result?.sessionId).not.toBe('existing-editor-session');
      expect(result?.session.assistantMode).toBe(requestedMode);
      expect(result?.session.editorIssue?.filePath).toBe('/workspace/a.ts');
    }
  );
});
