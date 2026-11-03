import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateMessage, CreateSession } from '../../webview-ui/src/sidebar/createTypes';

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
import { CreateTab } from '../../webview-ui/src/sidebar/CreateTab';
import { SecondarySidebar } from '../../webview-ui/src/sidebar/SecondarySidebar';

const workspacePath = '/fixture/workspaces/focusboard';
const projectPath = `${workspacePath}/apps/web`;
const user: CreateMessage = {
  id: 'user',
  role: 'user',
  kind: 'text',
  text: 'Build Focusboard with React and Vite',
};
const done: CreateMessage = {
  id: 'done',
  role: 'ai',
  kind: 'done',
  workspacePath,
  projects: [{ name: 'web', path: projectPath, framework: 'vite-react' }],
};
const plan: Extract<CreateMessage, { kind: 'plan' }> = {
  id: 'plan',
  role: 'ai',
  kind: 'plan',
  plan: {
    workspaceName: 'focusboard',
    projectName: 'web',
    framework: 'vite-react',
    kit: 'frontend.vite-react',
    profile: 'node-only',
    suggestedModules: [],
  },
};
function session(messages: CreateMessage[]): CreateSession {
  return {
    sessionId: 'create-fixture',
    title: 'Focusboard',
    target: 'workspace',
    method: 'ai',
    status: 'done',
    messages,
    createdAt: '2026-11-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
  };
}

describe('Create continuation and transcript behavior', () => {
  let dom: JSDOM;
  let root: Root;
  beforeEach(() => {
    saved.value = {};
    saved.post.mockClear();
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(dom.window.document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });
  const button = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === label
    )!;
  const send = async (command: string, data: object) =>
    act(async () => {
      dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { command, data } }));
    });
  function props(messages: CreateMessage[]): ComponentProps<typeof CreateTab> {
    return {
      active: true,
      busy: false,
      messages,
      sessions: [session(messages)],
      activeSessionId: 'create-fixture',
      activeOperationSessionId: null,
      scope: { workspaceName: 'unrelated', workspacePath: '/fixture/unrelated' },
      models: [],
      selectedModelId: null,
      onSelectModel: vi.fn(),
      onSubmitPrompt: vi.fn(),
      onApprovePlan: vi.fn(),
      onRevisePlan: vi.fn(),
      onManualCreate: vi.fn(),
      onAdoptProject: vi.fn(),
      onImportProject: vi.fn(),
      onImportWorkspace: vi.fn(),
      onContinueInAgent: vi.fn(),
      onBootstrapWorkspace: vi.fn(),
      onFocusView: vi.fn(),
      onOpenSetup: vi.fn(),
      onCancelPlanning: vi.fn(),
      onNewSession: vi.fn(),
      onSelectSession: vi.fn(),
      onDeleteSession: vi.fn(),
    };
  }

  it('opens searchable creation history in the header, protects the live operation, and closes after switching', async () => {
    const p = props([user, done]);
    p.activeOperationSessionId = 'create-fixture';
    p.sessions = [
      ...p.sessions,
      { ...session([]), sessionId: 'other', title: 'Another project', target: 'project' },
    ];
    await act(async () => root.render(createElement(CreateTab, p)));
    const trigger = document.querySelector<HTMLButtonElement>('.ws-session-bar__context')!;
    await act(async () => {
      trigger.focus();
      trigger.click();
    });
    const picker = document.querySelector('#workspai-create-history')!;
    expect(picker.closest('.ws-chat-header')).not.toBeNull();
    expect(picker.closest('.ws-composer-dock')).toBeNull();
    expect(trigger.getAttribute('aria-controls')).toBe(picker.id);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Search recent creations');
    const remove = document.querySelector<HTMLButtonElement>(
      '[aria-label="Delete creation: Focusboard"]'
    )!;
    expect(remove.disabled).toBe(true);
    await act(async () => remove.click());
    expect(p.onDeleteSession).not.toHaveBeenCalled();
    const other = [...picker.querySelectorAll<HTMLButtonElement>('.ws-chat-history__select')].find(
      (row) => row.textContent?.includes('Another project')
    )!;
    await act(async () => other.click());
    expect(p.onSelectSession).toHaveBeenCalledWith('other');
    expect(document.querySelector('#workspai-create-history')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await act(async () => trigger.click());
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.ws-chat-history__head button')!.click()
    );
    expect(p.onNewSession).toHaveBeenCalledOnce();
    expect(document.querySelector('#workspai-create-history')).toBeNull();
  });

  it('updates the persisted destination and selector from a workspace plan without starting a command', async () => {
    saved.value = {
      workspaiCreate: {
        activeId: 'create-fixture',
        sessions: [{ ...session([user]), target: 'project' }],
      },
    };
    await act(async () => root.render(createElement(SecondarySidebar)));
    await send('sidebarAiScope', {
      workspace: { name: 'focusboard-wsp', path: '/fixture/focusboard-wsp' },
    });
    const target = document.querySelector<HTMLButtonElement>(
      '[aria-label="Create target: Project"]'
    )!;
    await act(async () => target.click());
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
        .find((row) => row.textContent?.startsWith('Project'))!
        .click()
    );
    const newPlan = { ...plan.plan, type: 'workspace', workspaceName: 'personal-site-wsp' };
    await send('sidebarAiCreatePlan', {
      sessionId: 'create-fixture',
      plan: newPlan,
      planSource: 'llm',
    });
    expect(document.querySelector('[aria-label="Create target: Workspace"]')).not.toBeNull();
    const persisted = saved.value.workspaiCreate as { sessions: CreateSession[] };
    expect(persisted.sessions[0].target).toBe('workspace');
    expect(persisted.sessions[0].status).toBe('ready');
    expect(document.querySelector('.ws-sidebar__create-plan')?.textContent).toContain(
      'personal-site-wsp'
    );
    expect(document.querySelector('.ws-sidebar__create-plan')?.textContent).not.toContain(
      'active workspace'
    );
    expect(saved.post.mock.calls.some(([command]) => command === 'sidebarAiCreateConfirm')).toBe(
      false
    );
  });

  it('continues the original request at the created project, independently of the selected workspace', async () => {
    const p = props([user, done, { ...user, id: 'later', text: 'An unrelated later request' }]);
    await act(async () => root.render(createElement(CreateTab, p)));
    await act(async () => button('Continue in Agent').click());
    expect(p.onContinueInAgent).toHaveBeenCalledWith(expect.stringContaining(user.text), {
      workspacePath,
      workspaceName: 'focusboard',
      projectPath,
      projectName: 'web',
    });
    expect(vi.mocked(p.onContinueInAgent).mock.calls[0][0]).not.toContain(
      'An unrelated later request'
    );
    expect(p.onSubmitPrompt).not.toHaveBeenCalled();
    expect(p.onApprovePlan).not.toHaveBeenCalled();
  });

  it('keeps multiple created projects at workspace scope instead of selecting the first', async () => {
    const p = props([
      user,
      { ...done, projects: [{ path: projectPath }, { path: `${workspacePath}/apps/api` }] },
    ]);
    await act(async () => root.render(createElement(CreateTab, p)));
    await act(async () => button('Continue in Agent').click());
    expect(p.onContinueInAgent).toHaveBeenCalledWith(expect.any(String), {
      workspacePath,
      workspaceName: 'focusboard',
    });
  });

  it('continues manual creation without requiring a user chat message', async () => {
    const p = props([
      {
        id: 'manual',
        role: 'ai',
        kind: 'manual-done',
        mode: 'project',
        workspacePath,
        projectPath,
        name: 'web',
      },
    ]);
    await act(async () => root.render(createElement(CreateTab, p)));
    await act(async () => button('Continue in Agent').click());
    expect(p.onContinueInAgent).toHaveBeenCalledWith(
      expect.stringContaining('run applicable project checks'),
      { workspacePath, workspaceName: 'focusboard', projectPath, projectName: 'web' }
    );
  });

  it('offers full Agent tools for a non-native stack without approving a fallback scaffold', async () => {
    const p = props([
      user,
      {
        id: 'unsupported',
        role: 'ai',
        kind: 'error',
        error: 'Use the project-native toolchain',
        unsupportedStack: true,
      },
    ]);
    await act(async () => root.render(createElement(CreateTab, p)));
    await act(async () => button('Continue in Agent').click());
    expect(p.onContinueInAgent).toHaveBeenCalledWith(user.text, null);
    expect(p.onApprovePlan).not.toHaveBeenCalled();
  });

  it('keeps a pending plan expanded, requires approval, and makes resolved plans expandable', async () => {
    const p = props([user, plan]);
    await act(async () => root.render(createElement(CreateTab, p)));
    expect(document.querySelector('details.ws-sidebar__create-plan')?.hasAttribute('open')).toBe(
      true
    );
    expect(p.onApprovePlan).not.toHaveBeenCalled();
    await act(async () => button('Approve and continue').click());
    expect(p.onApprovePlan).toHaveBeenCalledWith(plan.plan, 'create-fixture');
    await act(async () =>
      root.render(
        createElement(CreateTab, { ...p, messages: [user, { ...plan, resolved: true }, done] })
      )
    );
    const details = document.querySelector<HTMLDetailsElement>('details.ws-sidebar__create-plan')!;
    expect(details.open).toBe(false);
    expect(button('Approve and continue')).toBeUndefined();
    await act(async () => details.querySelector('summary')!.click());
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('frontend.vite-react');
  });

  it('follows new progress without pulling users away from earlier messages', async () => {
    const p = props([user]);
    await act(async () => root.render(createElement(CreateTab, p)));
    const stream = document.querySelector<HTMLDivElement>('.ws-sidebar__stream')!;
    Object.defineProperties(stream, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 200 },
    });
    await act(async () => root.render(createElement(CreateTab, { ...p, messages: [user, plan] })));
    expect(stream.scrollTop).toBe(1000);
    stream.scrollTop = 100;
    await act(async () => stream.dispatchEvent(new dom.window.Event('scroll', { bubbles: true })));
    await act(async () =>
      root.render(createElement(CreateTab, { ...p, messages: [user, plan, done] }))
    );
    expect(stream.scrollTop).toBe(100);
    const jump = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Scroll to latest"]'
    )!;
    expect(jump.textContent).toBe('');
    await act(async () => jump.click());
    expect(stream.scrollTop).toBe(1000);
    expect(document.querySelector('button[aria-label="Scroll to latest"]')).toBeNull();
  });

  it.each([true, false])(
    'posts the created scope and selected model with a fresh history (completed=%s)',
    async (completed) => {
      saved.value = {
        workspaiAssistantMode: 'ask',
        workspaiAssistantModels: { ask: 'create-model', agent: 'old-agent-model' },
        workspaiCreate: {
          sessions: [
            session([
              user,
              completed
                ? done
                : {
                    id: 'error',
                    role: 'ai',
                    kind: 'error',
                    unsupportedStack: true,
                    error: 'Not native',
                  },
            ]),
          ],
          activeId: 'create-fixture',
        },
        workspaiStudio: {
          activeId: 'old-editor',
          sessions: [
            {
              sessionId: 'old-editor',
              title: 'Old repair',
              status: 'done',
              mode: 'investigate',
              editorIssue: { key: 'old', filePath: '/fixture/unrelated/source.ts' },
              messages: [{ role: 'user', content: 'Fix unrelated file' }],
            },
          ],
        },
      };
      await act(async () => root.render(createElement(SecondarySidebar)));
      await send('sidebarAiScope', {
        workspace: { name: 'unrelated', path: '/fixture/unrelated' },
        project: { name: 'old', path: '/fixture/unrelated/old' },
      });
      await act(async () => button('Continue in Agent').click());
      const [, payload] = saved.post.mock.calls.find(
        ([command]) => command === 'sidebarStudioQuery'
      )!;
      expect(payload).toMatchObject({
        assistantMode: 'agent',
        modelId: 'create-model',
        history: [],
        task: expect.stringContaining(user.text),
        scopeMode: completed ? 'scoped' : 'none',
        scope: completed
          ? {
              workspace: { name: 'focusboard', path: workspacePath },
              project: { name: 'web', path: projectPath },
            }
          : { workspace: null, project: null },
      });
      expect(payload.sessionId).not.toBe('old-editor');
      expect(payload.editorIssue).toBeUndefined();
      expect(payload.blockerHandoff).toBeUndefined();
      const persisted = saved.value.workspaiStudio as {
        sessions: Array<{ sessionId: string; scope?: unknown }>;
      };
      expect(
        persisted.sessions.find((s) => s.sessionId === payload.sessionId)?.scope
      ).toMatchObject(completed ? { workspacePath, projectPath } : undefined);
      expect(document.querySelector('button[aria-label="Stop"]')).not.toBeNull();
    }
  );
});
