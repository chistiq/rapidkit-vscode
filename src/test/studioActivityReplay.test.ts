import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '../../webview-ui/src/sidebar/sidebarSessions';

const saved = vi.hoisted(() => ({ value: {} as Record<string, unknown>, post: vi.fn() }));
vi.mock('@/vscode', () => ({
  vscode: {
    getState: () => saved.value,
    setState: (value: Record<string, unknown>) => {
      saved.value = value;
    },
    postMessage: saved.post,
  },
}));
import { SecondarySidebar } from '../../webview-ui/src/sidebar/SecondarySidebar';
import { StudioActivityTranscript } from '../../webview-ui/src/sidebar/StudioActivityTranscript';
import { isStudioAgentSessionActive } from '../core/studioAgentEvents.js';

describe('Assistant activity event replay', () => {
  it.each(['event', 'state'])(
    'shows an exact dashboard Fix approval in an empty incident session and settles Stop through %s',
    async (terminal) => {
      saved.post.mockClear();
      saved.value = {
        workspaiStudio: {
          activeId: 'doctor-fix',
          sessions: [
            {
              sessionId: 'doctor-fix',
              title: 'Fix Workspace Doctor',
              status: 'streaming',
              mode: 'investigate',
              incident: {
                key: 'doctor',
                cardId: 'doctor',
                workspaceName: 'starter',
                repairStatus: 'running',
                firstSeenAt: new Date().toISOString(),
                lastSeenAt: new Date().toISOString(),
              },
              messages: [],
            },
          ],
        },
      };
      const dom = new JSDOM('<div id="root"></div>');
      vi.stubGlobal('window', dom.window);
      vi.stubGlobal('document', dom.window.document);
      vi.stubGlobal('navigator', dom.window.navigator);
      vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      const root = createRoot(dom.window.document.getElementById('root')!);
      const send = async (type: string, data: object, toolCallId?: string) =>
        act(async () => {
          dom.window.dispatchEvent(
            new dom.window.MessageEvent('message', {
              data: {
                command: 'sidebarStudioAgentEvent',
                data: {
                  event: { type, sessionId: 'doctor-fix', requestId: 'repair', toolCallId, data },
                },
              },
            })
          );
        });
      try {
        await act(async () => root.render(createElement(SecondarySidebar)));
        await act(async () =>
          dom.window.dispatchEvent(
            new dom.window.MessageEvent('message', {
              data: { command: 'sidebarActivateTab', data: { tab: 'studio' } },
            })
          )
        );
        await send('request.started', { objective: 'Fix the selected Doctor finding' });
        const approval = {
          toolName: 'execute-remediation-step',
          fingerprint: 'a'.repeat(64),
          scope: 'workspace',
          execution: 'once',
          allowedExecutions: ['once'],
          displayCommand: 'Workspai remediation action: doctor.web.materialize',
          summary: 'Install missing web dependencies',
        };
        await send('tool.approval.requested', approval, 'install');
        const document = dom.window.document;
        const run = [
          ...document.querySelectorAll<HTMLButtonElement>('.ws-sidebar__approval-dock button'),
        ].find((button) => button.textContent === 'Run once');
        expect(run).toBeDefined();
        expect(document.querySelector('.ws-sidebar__approval-dock')?.textContent).toContain(
          'Install missing web dependencies'
        );
        await act(async () => run!.click());
        expect(saved.post).toHaveBeenCalledWith(
          'sidebarStudioToolApprovalDecision',
          expect.objectContaining({
            sessionId: 'doctor-fix',
            toolCallId: 'install',
            fingerprint: approval.fingerprint,
            approved: true,
            execution: 'once',
          }),
          expect.anything()
        );
        await send(
          'tool.approval.approved',
          { toolName: 'execute-remediation-step', execution: 'once' },
          'install'
        );
        await send('tool.approval.requested', approval, 'install-second');
        const stop = document.querySelector<HTMLButtonElement>('button[aria-label="Stop"]');
        expect(stop).not.toBeNull();
        await act(async () => stop!.click());
        expect(saved.post).toHaveBeenCalledWith(
          'sidebarStudioAction',
          expect.objectContaining({ action: 'agent-cancel', sessionId: 'doctor-fix' }),
          expect.anything()
        );
        if (terminal === 'event') {
          await send('session.cancelled', {
            reason: 'cancelled',
            answer: 'Stopped before installing dependencies.',
          });
        } else {
          await act(async () =>
            dom.window.dispatchEvent(
              new dom.window.MessageEvent('message', {
                data: {
                  command: 'sidebarStudioSessionState',
                  data: {
                    sessionId: 'doctor-fix',
                    active: false,
                    status: 'cancelled',
                    terminalReason: 'cancelled',
                    answer: 'Stopped before installing dependencies.',
                  },
                },
              })
            )
          );
        }
        expect(document.querySelector('button[aria-label="Stop"]')).toBeNull();
        expect(document.querySelector('.ws-sidebar__approval-dock')).toBeNull();
        expect(document.body.textContent).toContain('Stopped before installing dependencies.');
        const session = (saved.value.workspaiStudio as { sessions: ChatSession[] }).sessions[0];
        expect(session).toMatchObject({
          status: 'error',
          terminalReason: 'cancelled',
          activityLabel: undefined,
        });
        expect(session.messages[0].requestIds).toEqual(['repair']);
      } finally {
        await act(async () => root.unmount());
        dom.window.close();
        vi.unstubAllGlobals();
      }
    }
  );

  it('keeps exact approval docked across repeated steering turns and removes it when the host decides', async () => {
    saved.post.mockClear();
    const approval = {
      sessionId: 'pending',
      fingerprint: 'a'.repeat(64),
      toolCallId: 'terminal',
      scope: 'workspace' as const,
      command: 'npm install',
      commandLabel: 'npm install',
      summary: 'Install dependencies for the requested application.',
      reasons: ['Project dependencies'],
      allowedExecutions: ['once' as const],
    };
    saved.value = {
      workspaiStudio: {
        activeId: 'pending',
        sessions: [
          {
            sessionId: 'pending',
            title: 'Create project',
            status: 'streaming',
            assistantMode: 'agent',
            messages: [
              { role: 'user', content: 'Create project' },
              {
                role: 'assistant',
                content: '',
                requestIds: ['r'],
                activity: [
                  {
                    action: 'start-terminal',
                    status: 'review',
                    title: 'Approval required',
                    summary: 'Awaiting decision',
                    invocationId: 'terminal',
                    requestId: 'r',
                    approvalRequest: approval,
                  },
                ],
              },
              { role: 'user', content: '\u0686\u06cc \u0634\u062f \u0627\u0633\u062a\u0627\u062f' },
              { role: 'assistant', content: '', requestIds: ['r'] },
              { role: 'user', content: '\u0686\u06cc \u0634\u062f \u0628\u06cc\u0628\u06cc' },
              { role: 'assistant', content: '', requestIds: ['r'] },
            ],
          },
        ],
      },
    };
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(dom.window.document.getElementById('root')!);
    try {
      await act(async () => root.render(createElement(SecondarySidebar)));
      const document = dom.window.document;
      await act(async () =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: { command: 'sidebarActivateTab', data: { tab: 'studio' } },
          })
        )
      );
      const panel = document.querySelector('.ws-sidebar__tabpanel--chat:not([hidden])')!;
      expect(
        [...document.querySelectorAll('.ws-session-bar')].some((bar) =>
          bar.textContent?.includes('Waiting for command approval')
        )
      ).toBe(true);
      const button = [
        ...document.querySelectorAll<HTMLButtonElement>('.ws-sidebar__approval-dock button'),
      ].find((entry) => entry.textContent === 'Run once');
      expect(button).toBeDefined();
      expect(panel.querySelector('.ws-sidebar__stream')?.getAttribute('aria-busy')).toBe('false');
      await act(async () =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: {
              command: 'sidebarStudioSessionState',
              data: {
                sessionId: 'pending',
                active: isStudioAgentSessionActive('waiting-permission'),
                status: 'waiting-permission',
              },
            },
          })
        )
      );
      expect(document.querySelector('button[aria-label="Stop"]')).not.toBeNull();
      await act(async () => button!.click());
      expect(saved.post).toHaveBeenCalledWith(
        'sidebarStudioToolApprovalDecision',
        expect.objectContaining({
          sessionId: 'pending',
          toolCallId: 'terminal',
          fingerprint: approval.fingerprint,
          approved: true,
          execution: 'once',
        }),
        expect.anything()
      );
      await act(async () =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: {
              command: 'sidebarStudioAgentEvent',
              data: {
                event: {
                  type: 'tool.approval.approved',
                  sessionId: 'pending',
                  requestId: 'r',
                  toolCallId: 'terminal',
                  data: { toolName: 'start-terminal', execution: 'once' },
                },
              },
            },
          })
        )
      );
      expect(document.querySelector('.ws-sidebar__approval-dock')).toBeNull();
      expect(document.querySelector('button[aria-label="Stop"]')).not.toBeNull();
      await act(async () =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: {
              command: 'sidebarStudioAgentEvent',
              data: {
                event: {
                  type: 'tool.approval.requested',
                  sessionId: 'pending',
                  requestId: 'r',
                  toolCallId: 'second',
                  data: {
                    ...approval,
                    toolCallId: 'second',
                    displayCommand: 'npm test',
                    toolName: 'start-terminal',
                    execution: 'once',
                  },
                },
              },
            },
          })
        )
      );
      expect(document.querySelector('.ws-sidebar__approval-dock')).not.toBeNull();
      await act(async () =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: {
              command: 'sidebarStudioToolApprovalUnavailable',
              data: {
                sessionId: 'pending',
                toolCallId: 'second',
                fingerprint: approval.fingerprint,
                summary: 'This exact request expired.',
              },
            },
          })
        )
      );
      expect(document.querySelector('.ws-sidebar__approval-dock')).toBeNull();
      expect(saved.post).toHaveBeenCalledWith(
        'sidebarStudioAction',
        { action: 'agent-status', sessionId: 'pending' },
        expect.anything()
      );
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });
  it('keeps a historical failure out of a resumed response and preserves Stop until the current request ends', async () => {
    saved.post.mockClear();
    saved.value = {
      workspaiStudio: {
        activeId: 'resume',
        sessions: [
          {
            sessionId: 'resume',
            title: 'Create app',
            status: 'streaming',
            assistantMode: 'agent',
            executionTarget: { ref: 'target', name: 'sample' },
            messages: [
              { role: 'user', content: 'Create app' },
              { role: 'assistant', content: 'First network failure', requestIds: ['first'] },
              { role: 'user', content: 'Continue' },
              { role: 'assistant', content: '', requestIds: ['second'] },
            ],
          },
        ],
      },
    };
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(dom.window.document.getElementById('root')!);
    const send = async (type: string, data: object, replay = false, requestId = 'first') =>
      act(async () => {
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: {
              command: 'sidebarStudioAgentEvent',
              data: { replay, event: { type, sessionId: 'resume', requestId, data } },
            },
          })
        );
      });
    const session = () => (saved.value.workspaiStudio as { sessions: ChatSession[] }).sessions[0];
    try {
      await act(async () => root.render(createElement(SecondarySidebar)));
      await send('tool.requested', { toolName: 'inspect-source' }, false, 'second');
      await send(
        'session.failed',
        {
          answer: 'First network failure',
          error: 'network request aborted',
          terminalReason: 'ai-provider-unavailable',
        },
        true
      );
      await send('model.message', { text: 'Old narration', inputRequired: true }, true);
      await send('workspace.target.bound', { ref: 'old', name: 'wrong-workspace' }, true);
      await send(
        'tool.completed',
        {
          toolName: 'start-terminal',
          ok: true,
          input: { command: 'build' },
          output: { terminalId: 'old-terminal', state: 'running' },
        },
        true
      );
      await act(async () =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: {
              command: 'sidebarStudioSessionReconciliation',
              data: {
                activeSessionIds: [],
                terminalSessions: [
                  {
                    sessionId: 'resume',
                    requestId: 'first',
                    status: 'failed',
                    answer: 'First network failure',
                    error: 'network request aborted',
                    terminalReason: 'ai-provider-unavailable',
                  },
                ],
              },
            },
          })
        )
      );
      expect(session().status).toBe('streaming');
      expect(session().messages.at(-1)?.content).toBe('');
      expect(session().executionTarget?.name).toBe('sample');
      expect(session().messages[1].activity?.some((entry) => entry.status === 'running')).toBe(
        false
      );
      // A late live terminal result also belongs to its original request.
      await send('session.failed', {
        answer: 'First network failure',
        error: 'network request aborted',
      });
      expect(session().status).toBe('streaming');
      await send(
        'session.failed',
        {
          answer: 'Second failure: lint missing',
          error: 'network request aborted',
          terminalReason: 'ai-provider-unavailable',
        },
        false,
        'second'
      );
      expect(session().status).toBe('error');
      expect(session().messages[1].content).toBe('First network failure');
      expect(session().messages.at(-1)?.content).toBe('Second failure: lint missing');
      expect(dom.window.document.body.textContent).toContain('AI connection needed');
      expect(session().terminalReason).toBe('ai-provider-unavailable');
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });
  it('routes the request checkpoint controls and persists a successful restoration', async () => {
    saved.value = {
      workspaiStudio: {
        activeId: 'checkpoint',
        sessions: [
          {
            sessionId: 'checkpoint',
            executionTarget: { ref: 'blog-owned', name: 'blog' },
            title: 'Add tests',
            status: 'done',
            assistantMode: 'agent',
            messages: [
              { role: 'user', content: 'Add tests' },
              {
                role: 'assistant',
                content: 'Tests passed.',
                requestIds: ['request'],
                activity: [
                  {
                    action: 'apply-workspace-patch',
                    status: 'done',
                    title: 'Edited',
                    summary: '',
                    requestId: 'request',
                    invocationId: 'edit',
                    transactionId: 'native-11111111-1111-1111-1111-111111111111',
                    transactionState: 'applied',
                    fileChanges: [
                      {
                        relativePath: 'test.cjs',
                        status: 'added',
                        addedLines: 20,
                        removedLines: 0,
                        diffLines: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(dom.window.document.getElementById('root')!);
    try {
      await act(async () => root.render(createElement(SecondarySidebar)));
      const editStep = dom.window.document.querySelector<HTMLDetailsElement>('.ws-activity__step')!;
      await act(async () => {
        editStep.open = true;
        editStep.dispatchEvent(new dom.window.Event('toggle'));
      });
      const file = dom.window.document.querySelector<HTMLButtonElement>('button[title="test.cjs"]');
      expect(file).not.toBeNull();
      await act(async () => file!.click());
      expect(saved.post).toHaveBeenCalledWith(
        'sidebarOpenWorkspaceFile',
        expect.objectContaining({
          sessionId: 'checkpoint',
          targetRef: 'blog-owned',
          relativePath: 'test.cjs',
        }),
        expect.anything()
      );
      const button = [...dom.window.document.querySelectorAll('button')].find(
        (entry) => entry.textContent === 'Restore'
      );
      expect(button).toBeDefined();
      const dock = dom.window.document.querySelector('.ws-sidebar__review-dock');
      expect(dock?.querySelector('.ws-sidebar__studio-changeset')).not.toBeNull();
      expect(dock?.contains(button!)).toBe(true);
      expect(dock?.closest('.ws-sidebar__stream')).toBeNull();
      await act(async () => button!.click());
      expect(button!.disabled).toBe(true);
      await act(async () => button!.click());
      expect(
        saved.post.mock.calls.filter((args) => args[1]?.action === 'checkpoint-restore')
      ).toHaveLength(1);
      expect(saved.post).toHaveBeenCalledWith(
        'sidebarStudioAction',
        expect.objectContaining({
          action: 'checkpoint-restore',
          sessionId: 'checkpoint',
          requestIds: ['request'],
        }),
        expect.anything()
      );
      await act(async () =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: {
              command: 'sidebarStudioCheckpoint',
              data: {
                sessionId: 'checkpoint',
                requestIds: ['request'],
                transactionIds: ['native-11111111-1111-1111-1111-111111111111'],
                state: 'restored',
              },
            },
          })
        )
      );
      expect(dom.window.document.body.textContent).toContain('Files restored.');
      const state = saved.value.workspaiStudio as {
        sessions: Array<{ messages: Array<{ checkpointReview?: string }> }>;
      };
      expect(state.sessions[0].messages[1].checkpointReview).toBe('restored');
      const redo = [...dom.window.document.querySelectorAll('button')].find(
        (entry) => entry.textContent === 'Redo changes'
      );
      expect(redo).toBeDefined();
      await act(async () => redo!.click());
      expect(saved.post).toHaveBeenCalledWith(
        'sidebarStudioAction',
        expect.objectContaining({ action: 'checkpoint-redo', sessionId: 'checkpoint' }),
        expect.anything()
      );
      await act(async () =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: {
              command: 'sidebarStudioCheckpoint',
              data: {
                sessionId: 'checkpoint',
                requestIds: ['request'],
                transactionIds: ['native-11111111-1111-1111-1111-111111111111'],
                state: 'reapplied',
              },
            },
          })
        )
      );
      expect(dom.window.document.body.textContent).toContain('Changes reapplied. Run checks again');
      expect(
        (saved.value.workspaiStudio as { sessions: ChatSession[] }).sessions[0].messages[1]
          .checkpointReview
      ).toBe('reapplied');
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });

  it('carries scaffold totals through live events into a dock without offering a fake checkpoint', async () => {
    saved.post.mockClear();
    saved.value = {
      workspaiStudio: {
        activeId: 'scaffold',
        sessions: [
          {
            sessionId: 'scaffold',
            title: 'Create app',
            status: 'streaming',
            assistantMode: 'agent',
            messages: [
              { role: 'user', content: 'Create a workspace' },
              { role: 'assistant', content: '', requestIds: ['create-request'] },
            ],
          },
        ],
      },
    };
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(dom.window.document.getElementById('root')!);
    try {
      await act(async () => root.render(createElement(SecondarySidebar)));
      await act(async () =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: {
              command: 'sidebarStudioAgentEvent',
              data: {
                event: {
                  type: 'tool.completed',
                  sessionId: 'scaffold',
                  requestId: 'create-request',
                  toolCallId: 'create-tool',
                  sequence: 12,
                  data: {
                    toolName: 'create-workspace',
                    ok: true,
                    changed: true,
                    output: {
                      transactionId: 'scaffold-11111111-1111-1111-1111-111111111111',
                      transaction: {
                        transactionId: 'scaffold-11111111-1111-1111-1111-111111111111',
                        state: 'observed',
                      },
                      changedPaths: ['app/page.tsx'],
                      fileChanges: [
                        {
                          relativePath: 'app/page.tsx',
                          status: 'added',
                          addedLines: 3001,
                          removedLines: 0,
                          diffLines: [],
                        },
                      ],
                    },
                  },
                },
              },
            },
          })
        )
      );
      const dock = dom.window.document.querySelector('.ws-sidebar__review-dock');
      expect(dock?.textContent).toContain('Created 1 file');
      expect(dock?.textContent).toContain('+3001');
      expect(dock?.textContent).not.toContain('Restore checkpoint');
      expect(dock?.textContent).not.toContain('Undo');
      const file = dock?.querySelector<HTMLButtonElement>('button[title="Open app/page.tsx"]');
      await act(async () => file!.click());
      expect(saved.post).toHaveBeenCalledWith(
        'sidebarOpenWorkspaceFile',
        expect.objectContaining({
          sessionId: 'scaffold',
          requestId: 'create-request',
          relativePath: 'app/page.tsx',
        }),
        expect.anything()
      );
      await act(async () =>
        dom.window.dispatchEvent(
          new dom.window.MessageEvent('message', {
            data: {
              command: 'sidebarStudioDone',
              data: { sessionId: 'scaffold', answer: 'Created files; checks remain.' },
            },
          })
        )
      );
      const review = [...dock!.querySelectorAll('button')].find(
        (button) => button.textContent === 'Review all'
      );
      await act(async () => review!.click());
      expect(saved.post).toHaveBeenCalledWith(
        'sidebarReviewWorkspaceChanges',
        expect.objectContaining({
          sessionId: 'scaffold',
          requestId: 'create-request',
          files: [
            {
              relativePath: 'app/page.tsx',
              transactionId: 'scaffold-11111111-1111-1111-1111-111111111111',
            },
          ],
        }),
        expect.anything()
      );
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });

  it('uses authoritative line totals and never displays unknown counts as +0 -0', () => {
    const entry = {
      action: 'apply-workspace-patch',
      status: 'done' as const,
      title: 'Edited',
      summary: '',
      fileChanges: [{ relativePath: 'article-blog/test.cjs', status: 'applied', diffLines: [] }],
    };
    const unknown = renderToStaticMarkup(
      createElement(StudioActivityTranscript, { entries: [entry] })
    );
    expect(unknown).not.toContain('+0');
    const known = renderToStaticMarkup(
      createElement(StudioActivityTranscript, {
        entries: [
          { ...entry, fileChanges: [{ ...entry.fileChanges[0], addedLines: 20, removedLines: 0 }] },
        ],
      })
    );
    expect(known).toContain('+20');
  });

  it.each([0, 1])(
    'correlates approvals and distinguishes process exit %s from tool completion',
    async (exitCode) => {
      saved.value = {
        workspaiStudio: {
          activeId: 'session',
          sessions: [
            {
              sessionId: 'session',
              title: 'Create workspace',
              status: 'streaming',
              messages: [
                { role: 'user', content: 'Create a workspace' },
                { role: 'assistant', content: '', requestIds: ['request'] },
              ],
            },
          ],
        },
      };
      const dom = new JSDOM('<div id="root"></div>', { url: 'https://webview.local' });
      vi.stubGlobal('window', dom.window);
      vi.stubGlobal('document', dom.window.document);
      vi.stubGlobal('navigator', dom.window.navigator);
      vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      const root = createRoot(dom.window.document.getElementById('root')!);
      const errors: unknown[] = [];
      dom.window.addEventListener('error', (event) => {
        errors.push(event.error);
      });
      try {
        await act(async () => root.render(createElement(SecondarySidebar)));
        const events = [
          [
            'tool.permission',
            { toolName: 'start-terminal', allowed: false, requiresUserConfirmation: true },
          ],
          ['tool.approval.approved', { toolName: 'start-terminal', execution: 'once' }],
          [
            'tool.started',
            {
              toolName: 'start-terminal',
              input: { command: 'npx workspai create workspace demo' },
            },
          ],
          [
            'tool.completed',
            {
              toolName: 'start-terminal',
              input: { command: 'npx workspai create workspace demo' },
              ok: true,
              output: { terminalId: 'terminal', state: 'running' },
            },
          ],
          [
            'tool.completed',
            {
              toolName: 'read-terminal',
              ok: true,
              output: { terminalId: 'terminal', state: 'exited', exitCode },
            },
          ],
        ] as const;
        for (const [index, [type, data]] of events.entries()) {
          await act(async () =>
            dom.window.dispatchEvent(
              new dom.window.MessageEvent('message', {
                data: {
                  command: 'sidebarStudioAgentEvent',
                  data: {
                    event: {
                      sessionId: 'session',
                      requestId: 'request',
                      toolCallId: index === 4 ? 'read-call' : 'call',
                      sequence: index + 1,
                      type,
                      data,
                    },
                  },
                },
              })
            )
          );
        }
        expect(errors).toEqual([]);
        const activity = (saved.value.workspaiStudio as { sessions: ChatSession[] }).sessions[0]
          .messages[1].activity!;
        expect(activity.filter((entry) => entry.invocationId === 'call')).toHaveLength(1);
        expect(activity.find((entry) => entry.invocationId === 'call')).toMatchObject({
          status: 'done',
          eventType: 'tool.completed',
        });
        expect(activity.find((entry) => entry.invocationId === 'terminal:terminal')).toMatchObject({
          status: exitCode === 0 ? 'done' : 'failed',
          title: exitCode === 0 ? 'Command finished' : 'Command failed',
          commandText: 'npx workspai create workspace demo',
        });
        expect(activity.some((entry) => entry.status === 'running')).toBe(false);
        await act(async () =>
          dom.window.dispatchEvent(
            new dom.window.MessageEvent('message', {
              data: {
                command: 'sidebarStudioAgentEvent',
                data: {
                  event: {
                    sessionId: 'session',
                    requestId: 'request',
                    type: 'workspace.target.bound',
                    data: { ref: 'owned-shop', name: 'shop-workspace' },
                  },
                },
              },
            })
          )
        );
        expect(
          (saved.value.workspaiStudio as { sessions: ChatSession[] }).sessions[0].executionTarget
        ).toEqual({ ref: 'owned-shop', name: 'shop-workspace' });
        expect(
          (saved.value.workspaiStudio as { sessions: ChatSession[] }).sessions[0].messages[1]
            .executionTarget
        ).toEqual({ ref: 'owned-shop', name: 'shop-workspace' });
        expect(dom.window.document.body.textContent).toContain('shop-workspace');
      } finally {
        await act(async () => root.unmount());
        dom.window.close();
        vi.unstubAllGlobals();
      }
    }
  );

  it('renders old approved rows without false failures, stale approval prompts or historical spinners', async () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = dom.window.document.getElementById('root')!;
    const root = createRoot(container);
    const shared = {
      action: 'start-terminal',
      requestId: 'request',
      invocationId: 'call',
      summary: 'Exact command',
    };
    try {
      await act(async () =>
        root.render(
          createElement(StudioActivityTranscript, {
            active: false,
            entries: [
              { ...shared, title: 'Approval required', phase: 'tool-permission', status: 'review' },
              {
                ...shared,
                title: 'Approved for once',
                phase: 'command-approved',
                status: 'failed',
                eventType: 'tool.approval.approved',
              },
              { ...shared, invocationId: 'other', title: 'Reading files', status: 'running' },
            ],
          })
        )
      );
      expect(container.textContent).toContain('Approved for once');
      expect(container.textContent).not.toContain('Approval required');
      expect(container.querySelector('.ws-activity__spinner')).toBeNull();
      expect(container.querySelector('[data-status="failed"]')).toBeNull();
      const unfinished = container.querySelector<HTMLDetailsElement>('[data-status="review"]')!;
      expect(unfinished.querySelector('.ws-sidebar__sr-only')?.textContent).toBe('Needs review');
      await act(async () => {
        unfinished.open = true;
        unfinished.dispatchEvent(new dom.window.Event('toggle'));
      });
      expect(container.textContent).toContain('without a recorded final result');
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });
});
