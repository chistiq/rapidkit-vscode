import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { File } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioActivityTranscript } from '../../webview-ui/src/sidebar/StudioActivityTranscript';
import {
  readChatAttachments,
  requestWithAttachments,
} from '../../webview-ui/src/lib/chatAttachments';
import { appendStudioRepairTimelineEntry } from '../../webview-ui/src/lib/studioRepairTimeline';
import { parseAttachedImages } from '../core/aiImageContent.js';
import { ContractStudioAgentModelAdapter } from '../core/studioAgentModelProtocol.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';

afterEach(() => vi.unstubAllGlobals());
describe('Compact assistant transcript and attachments', () => {
  it('keeps an older live approval actionable when newer background activity arrives', async () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = dom.window.document.getElementById('root')!;
    const root = createRoot(container);
    const onApprovalDecision = vi.fn();
    const approvalRequest = {
      sessionId: 'session',
      fingerprint: 'exact-command',
      toolCallId: 'pending',
      scope: 'workspace' as const,
      command: 'npm test',
      commandLabel: 'Run project tests',
      summary: 'Run the requested checks.',
      reasons: ['Execute project scripts'],
      allowedExecutions: ['once' as const],
    };
    const entries = [
      {
        action: 'run-workspace-command',
        status: 'review' as const,
        title: 'Approval required',
        summary: 'Awaiting approval',
        approvalRequest,
      },
      {
        action: 'inspect-source',
        status: 'running' as const,
        title: 'Read source',
        summary: 'Still running',
      },
      ...Array.from({ length: 200 }, (_, index) => ({
        action: 'inspect-source',
        status: 'done' as const,
        title: `Read ${index}`,
        summary: 'Read',
        invocationId: `read-${index}`,
      })),
    ];
    try {
      await act(async () =>
        root.render(
          createElement(StudioActivityTranscript, {
            entries,
            active: true,
            onApprovalDecision,
          })
        )
      );
      expect(container.querySelectorAll('.ws-activity__step')).toHaveLength(101);
      expect(container.querySelectorAll('.ws-activity__spinner')).toHaveLength(1);
      const run = [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'Run once'
      );
      expect(run).toBeDefined();
      await act(async () => run!.click());
      expect(onApprovalDecision).toHaveBeenCalledExactlyOnceWith(approvalRequest, 'once');
      await act(async () =>
        root.render(
          createElement(StudioActivityTranscript, {
            entries,
            active: false,
            onApprovalDecision,
          })
        )
      );
      expect(container.querySelector('[aria-label="Command approval"]')).toBeNull();
      expect(container.querySelectorAll('.ws-activity__spinner')).toHaveLength(0);
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
    }
  });
  it("opens only the expanded delegation's owning request and invocation", async () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = dom.window.document.getElementById('root')!;
    const root = createRoot(container);
    const onOpenSubagentActivity = vi.fn();
    const entries = ['delegate-research', 'delegate-task', 'inspect-source'].map((action, at) => ({
      action,
      status: 'done' as const,
      title: action,
      summary: 'Recorded activity',
      requestId: `request-${at}`,
      invocationId: `call-${at}`,
    }));
    try {
      await act(async () =>
        root.render(createElement(StudioActivityTranscript, { entries, onOpenSubagentActivity }))
      );
      expect(container.querySelectorAll('button')).toHaveLength(0);
      for (const row of container.querySelectorAll<HTMLDetailsElement>('details')) {
        await act(async () => {
          row.open = true;
          row.dispatchEvent(new dom.window.Event('toggle'));
        });
      }
      const buttons = [...container.querySelectorAll('button')].filter(
        (button) => button.textContent === 'Open subagent activity'
      );
      expect(buttons).toHaveLength(2);
      await act(async () => buttons[1].click());
      expect(onOpenSubagentActivity).toHaveBeenCalledExactlyOnceWith('request-1', 'call-1');
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
    }
  });
  it('retains the user image through long model conversations without duplicating image parts', async () => {
    const image = { mimeType: 'image/png', base64: 'iVBORw==' };
    const model = new ContractStudioAgentModelAdapter(
      'Describe the screenshot',
      async (_prompt, request) => {
        const imageMessages = request.messages.filter(
          (message) => 'content' in message && message.images?.length
        );
        expect(imageMessages).toHaveLength(1);
        expect(imageMessages[0]).toMatchObject({ images: [image] });
        return { type: 'text', text: 'A button is visible.' };
      },
      undefined,
      [{ role: 'user', content: 'Reference screenshot', images: [image] }]
    );
    const session = new StudioAgentSession(
      {
        workspacePath: '/workspace',
        cardId: 'assistant:question',
        assistantMode: 'ask',
        permissionLevel: 'default',
        workspaceTrusted: true,
        requiresVerifiedCompletion: false,
      },
      { next: async () => ({ type: 'complete', summary: 'unused' }) },
      new StudioAgentToolRegistry(),
      { save: async () => {} }
    ).snapshot();
    for (let index = 0; index < 14; index++) await model.next({ session, tools: [], steering: [] });
  });
  it('retains every activity, exposes file links and uses authoritative diff totals', async () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = dom.window.document.getElementById('root')!;
    const root = createRoot(container);
    const onOpenFile = vi.fn();
    const onOpenDiff = vi.fn();
    const entries = Array.from({ length: 10 }, (_, index) => ({
      action: 'inspect-source',
      status: 'done' as const,
      title: `Read source ${index}`,
      summary: 'Inspected source',
      invocationId: String(index),
      activityPaths: [`src/file-${index}.ts`],
    }));
    const edit = {
      action: 'apply-workspace-patch',
      status: 'done' as const,
      title: 'Edited service',
      summary: 'Updated service',
      transactionId: 'tx',
      fileChanges: [
        {
          relativePath: 'src/service.ts',
          status: 'modified',
          addedLines: 21,
          removedLines: 9,
          diffLines: [{ type: 'added' as const, content: 'a' }],
        },
      ],
    };
    try {
      await act(async () =>
        root.render(
          createElement(StudioActivityTranscript, {
            entries: [...entries, edit],
            onOpenFile,
            onOpenDiff,
          })
        )
      );
      expect(container.querySelectorAll('.ws-activity__step')).toHaveLength(11);
      expect(container.querySelector('.ws-activity__step')?.hasAttribute('open')).toBe(false);
      expect(container.textContent).toContain('+21');
      expect(container.textContent).toContain('−9');
      expect(container.querySelectorAll('.ws-activity__body')).toHaveLength(0);
      for (const step of container.querySelectorAll<HTMLDetailsElement>('.ws-activity__step')) {
        await act(async () => {
          step.open = true;
          step.dispatchEvent(new dom.window.Event('toggle'));
        });
      }
      const buttons = [...container.querySelectorAll('button')];
      await act(async () => buttons.find((button) => button.title === 'src/file-0.ts')!.click());
      await act(async () => buttons.find((button) => button.title === 'src/service.ts')!.click());
      expect(onOpenFile).toHaveBeenCalledWith('src/file-0.ts');
      expect(onOpenFile).toHaveBeenCalledWith('src/service.ts', 'tx');
      expect(onOpenDiff).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
    }
  });

  it('preserves paths across coalesced reads rather than retaining only the final file', () => {
    const base = {
      action: 'inspect-source',
      status: 'done' as const,
      title: 'Read source',
      summary: 'Read',
    };
    const result = appendStudioRepairTimelineEntry(
      [{ ...base, invocationId: 'first', activityPaths: ['a.ts'] }],
      { ...base, invocationId: 'second', activityPaths: ['b.ts'] }
    );
    expect(result[0].activityPaths).toEqual(['a.ts', 'b.ts']);
  });

  it('mounts long outputs only when expanded, preserves expansion on updates and disables unavailable deleted-file actions', async () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = dom.window.document.getElementById('root')!;
    const root = createRoot(container);
    const entries = Array.from({ length: 400 }, (_, index) => ({
      invocationId: `call-${index}`,
      action: 'run-workspace-command',
      status: 'done' as const,
      title: `Command ${index}`,
      summary: 'Completed command',
      outputText: 'retained-output '.repeat(300),
      fileChanges: [{ relativePath: 'deleted.ts', status: 'deleted' }],
    }));
    try {
      await act(async () =>
        root.render(createElement(StudioActivityTranscript, { entries, onOpenFile: vi.fn() }))
      );
      expect(container.querySelectorAll('.ws-activity__step')).toHaveLength(100);
      expect(container.textContent).toContain('300 hidden');
      expect(container.querySelectorAll('.ws-activity__output')).toHaveLength(0);
      expect(container.textContent).not.toContain('retained-output');
      const step = container.querySelector<HTMLDetailsElement>('details')!;
      await act(async () => {
        step.open = true;
        step.dispatchEvent(new dom.window.Event('toggle'));
      });
      expect(container.querySelectorAll('.ws-activity__output')).toHaveLength(1);
      expect(step.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
      expect(step.querySelector('.ws-sidebar__sr-only')?.textContent).toBe('Completed');
      await act(async () =>
        root.render(
          createElement(StudioActivityTranscript, {
            entries: [...entries, { ...entries[0], invocationId: 'next' }],
            onOpenFile: vi.fn(),
          })
        )
      );
      expect([...container.querySelectorAll('details')].includes(step)).toBe(true);
      expect(step.open).toBe(true);
      expect(container.querySelectorAll('.ws-activity__output')).toHaveLength(1);
      await act(async () =>
        container.querySelector<HTMLButtonElement>('.ws-activity__history')!.click()
      );
      expect(container.querySelectorAll('.ws-activity__step')).toHaveLength(200);
      await act(async () =>
        container.querySelector<HTMLButtonElement>('.ws-activity__history')!.click()
      );
      await act(async () =>
        container.querySelector<HTMLButtonElement>('.ws-activity__history')!.click()
      );
      expect(container.querySelectorAll('.ws-activity__step')).toHaveLength(400);
      await act(async () =>
        container.querySelector<HTMLButtonElement>('.ws-activity__history')!.click()
      );
      expect(container.querySelectorAll('.ws-activity__step')).toHaveLength(401);
      expect(container.querySelector('.ws-activity__history')).toBeNull();
      expect(container.querySelectorAll('.ws-activity__output')).toHaveLength(1);
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
    }
  });

  it('reads text attachments and rejects binary/oversized inputs with an actionable error', async () => {
    const attachments = await readChatAttachments([
      new File(['hello'], 'notes.txt') as unknown as globalThis.File,
    ]);
    expect(requestWithAttachments('Use these notes', attachments)).toContain('hello');
    await expect(
      readChatAttachments([new File(['\0binary'], 'binary.bin') as unknown as globalThis.File])
    ).rejects.toThrow('text');
    await expect(
      readChatAttachments([
        new File(['a'.repeat(33 * 1024)], 'large.txt') as unknown as globalThis.File,
      ])
    ).rejects.toThrow('32 KiB');
    expect(parseAttachedImages([{ mimeType: 'image/png', base64: 'iVBORw==' }])).toEqual([
      { mimeType: 'image/png', base64: 'iVBORw==' },
    ]);
    expect(() => parseAttachedImages([{ mimeType: 'image/png', base64: 'not base64' }])).toThrow(
      'Invalid'
    );
  });
});
