import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTools, mockInvokeTool } = vi.hoisted(() => ({
  mockTools: [] as Array<{
    name: string;
    description: string;
    tags: string[];
    inputSchema?: Record<string, unknown>;
  }>,
  mockInvokeTool: vi.fn(),
}));

vi.mock('vscode', () => {
  class LanguageModelTextPart {
    constructor(readonly value: string) {}
  }
  class CancellationTokenSource {
    readonly token = { isCancellationRequested: false };
    cancel() {
      (this.token as { isCancellationRequested: boolean }).isCancellationRequested = true;
    }
    dispose() {
      return undefined;
    }
  }
  return {
    lm: {
      get tools() {
        return mockTools;
      },
      invokeTool: mockInvokeTool,
    },
    LanguageModelTextPart,
    CancellationTokenSource,
  };
});

import {
  isReadLikeHostLanguageModelTool,
  listStudioHostLanguageModelTools,
  studioHostLanguageModelToolAdapters,
} from '../core/studioHostLanguageModelTools.js';
import { studioToolImageRetention } from '../core/studioHostToolOutputStore.js';
import { StudioAgentSession, type StudioAgentModelAction } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import { VSCodeStudioAgentSessionStore } from '../core/studioAgentSessionStore.js';

describe('Studio host language-model tools', () => {
  it('reports unsupported rich output without exposing bytes or failing an executed tool', async () => {
    mockTools.push({ name: 'read.rich-result', description: '', tags: ['read'] });
    mockInvokeTool.mockResolvedValue({
      content: [
        { mimeType: 'application/vnd.test.notebook', data: Buffer.from('opaque-notebook') },
        { mimeType: 'image/svg+xml', data: Buffer.from('<svg>not-embedded</svg>') },
      ],
    });
    const result = await studioHostLanguageModelToolAdapters().invokeHostTool({
      name: 'read.rich-result',
    });
    expect(result).toMatchObject({
      ok: true,
      output: {
        contentParts: [
          { kind: 'data', mimeType: 'application/vnd.test.notebook', supported: false },
          { kind: 'image', mimeType: 'image/svg+xml', supported: false },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/opaque-notebook|not-embedded/);
    expect(mockInvokeTool).toHaveBeenCalledOnce();
  });
  it('revokes in-memory output and rejects new invocations after a chat is deleted', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'host-output-deleted-'));
    try {
      mockTools.push({ name: 'create.report', description: '', tags: ['write'] });
      mockInvokeTool.mockResolvedValue({ content: [{ value: 'entry '.repeat(6000) }] });
      const adapter = studioHostLanguageModelToolAdapters(undefined, undefined, { root });
      const first = await adapter.invokeHostTool({ name: 'create.report', sessionId: 'parent' });
      const ref = (first.output as { outputRef: string }).outputRef;
      await new VSCodeStudioAgentSessionStore({
        storageUri: { fsPath: root },
        workspaceState: { get: () => undefined, update: async () => {} },
      } as never).delete('parent');
      expect((await adapter.readHostToolOutput({ sessionId: 'parent', outputRef: ref })).ok).toBe(
        false
      );
      expect(await adapter.listRetainedHostToolOutputs({ sessionId: 'parent' })).toMatchObject({
        ok: true,
        output: { outputs: [] },
      });
      expect(
        (await adapter.invokeHostTool({ name: 'create.report', sessionId: 'parent' })).ok
      ).toBe(false);
      expect(mockInvokeTool).toHaveBeenCalledOnce();
    } finally {
      await fs.remove(root);
    }
  });

  it('does not retain a late result after deletion or turn its executed effect into a retryable failure', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'host-output-late-'));
    try {
      mockTools.push({ name: 'create.report', description: '', tags: ['write'] });
      let finish!: (value: unknown) => void;
      let started!: () => void;
      const began = new Promise<void>((resolve) => {
        started = resolve;
      });
      mockInvokeTool.mockImplementation(() => {
        started();
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      const adapter = studioHostLanguageModelToolAdapters(undefined, undefined, { root });
      const running = adapter.invokeHostTool({ name: 'create.report', sessionId: 'parent' });
      await began;
      await new VSCodeStudioAgentSessionStore({
        storageUri: { fsPath: root },
        workspaceState: { get: () => undefined, update: async () => {} },
      } as never).delete('parent');
      finish({ content: [{ value: 'entry '.repeat(6000) }] });
      expect(await running).toMatchObject({
        ok: true,
        output: { retentionError: expect.stringContaining('deleted') },
      });
      expect(await adapter.listRetainedHostToolOutputs({ sessionId: 'parent' })).toMatchObject({
        ok: true,
        output: { outputs: [] },
      });
      expect(mockInvokeTool).toHaveBeenCalledOnce();
    } finally {
      await fs.remove(root);
    }
  });
  beforeEach(() => {
    mockTools.splice(0, mockTools.length);
    mockInvokeTool.mockReset();
  });

  it('recovers an image-only host result after reload without repeating its operation', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'host-image-reload-'));
    try {
      mockTools.push({ name: 'create.image', description: 'Create image', tags: ['write'] });
      const bytes = Buffer.from('host image fixture');
      mockInvokeTool.mockResolvedValue({ content: [{ mimeType: 'image/png', data: bytes }] });
      const first = studioHostLanguageModelToolAdapters(undefined, undefined, { root });
      const result = await first.invokeHostTool({ name: 'create.image', sessionId: 'owner' });
      expect(result).toMatchObject({
        ok: true,
        output: { durable: true, imageCount: 1, totalChars: 0, nextOffset: null },
      });
      const ref = (result.output as { outputRef: string }).outputRef;
      const second = studioHostLanguageModelToolAdapters(undefined, undefined, { root });
      expect(await second.readHostToolOutput({ outputRef: ref, sessionId: 'owner' })).toMatchObject(
        {
          ok: true,
          images: [{ mimeType: 'image/png', base64: bytes.toString('base64') }],
          output: { nextOffset: null, imageCount: 1 },
        }
      );
      expect((await second.readHostToolOutput({ outputRef: ref, sessionId: 'another' })).ok).toBe(
        false
      );
      expect(mockInvokeTool).toHaveBeenCalledOnce();
    } finally {
      await fs.remove(root);
    }
  });
  it('reports oversized image observations without reporting the executed operation as failed', async () => {
    mockTools.push({ name: 'create.large-image', description: '', tags: ['write'] });
    mockInvokeTool.mockResolvedValue({
      content: [{ mimeType: 'image/png', data: Buffer.alloc(5 * 1024 * 1024 + 1) }],
    });
    const result = await studioHostLanguageModelToolAdapters().invokeHostTool({
      name: 'create.large-image',
      sessionId: 'owner',
    });
    expect(result).toMatchObject({
      ok: true,
      output: { imageCount: 0, imageError: expect.stringContaining('image budget') },
    });
    expect(mockInvokeTool).toHaveBeenCalledOnce();
  });

  it('retains non-host tool images outside session events and discovers them from a fresh adapter', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'session-image-reload-'));
    try {
      const image = {
        mimeType: 'image/png',
        base64: Buffer.from('browser screenshot fixture').toString('base64'),
      };
      const registry = new StudioAgentToolRegistry();
      const capture = vi.fn(async () => ({
        ok: true,
        output: ['Screen'],
        images: [image],
      }));
      registry.register({
        name: 'capture-image',
        title: 'Capture',
        description: '',
        inputSchema: {},
        risk: 'read',
        activity: 'inspect',
        execute: capture,
      });
      const actions: StudioAgentModelAction[] = [
        { type: 'tool', toolName: 'capture-image', input: {}, reason: 'Inspect screen' },
        { type: 'complete', summary: 'Screen inspected.' },
      ];
      const result = await new StudioAgentSession(
        {
          id: 'owner',
          workspacePath: '/workspace',
          cardId: 'assistant:ask',
          assistantMode: 'ask',
          workspaceTrusted: true,
          permissionLevel: 'default',
          requiresVerifiedCompletion: false,
          retainToolImages: studioToolImageRetention(root),
        },
        { next: async () => actions.shift()! },
        registry,
        { save: async () => {} }
      ).run('Inspect screen');
      expect(result.status).toBe('completed');
      const output = result.events.find((event) => event.type === 'tool.completed')!.data
        .output as { retainedImages: { outputRef: string } };
      expect(output).toMatchObject({ originalOutput: ['Screen'] });
      expect(JSON.stringify(result)).not.toContain(image.base64);
      const adapter = studioHostLanguageModelToolAdapters(undefined, undefined, { root });
      expect(await adapter.listRetainedHostToolOutputs({ sessionId: 'owner' })).toMatchObject({
        ok: true,
        output: { outputs: [{ imageCount: 1 }] },
      });
      expect(
        await adapter.readHostToolOutput({
          outputRef: output.retainedImages.outputRef,
          sessionId: 'owner',
        })
      ).toMatchObject({ ok: true, images: [image] });
      expect(capture).toHaveBeenCalledOnce();
    } finally {
      await fs.remove(root);
    }
  });

  it('reads a complete long result across pages without repeating an effectful tool', async () => {
    mockTools.push({ name: 'create.report', description: 'Create report', tags: ['write'] });
    const text = 'Report entry. '.repeat(4000) + 'END-OF-REPORT';
    mockInvokeTool.mockResolvedValue({ content: [{ value: text }] });
    const adapter = studioHostLanguageModelToolAdapters();
    const result = await adapter.invokeHostTool({ name: 'create.report' });
    const output = result.output as {
      text: string;
      outputRef: string;
      nextOffset: number;
      totalChars: number;
    };
    expect(output.totalChars).toBe(text.length);
    let collected = output.text;
    let offset: number | null = output.nextOffset;
    while (offset !== null) {
      const page = await adapter.readHostToolOutput({
        outputRef: output.outputRef,
        offset,
        limit: 8000,
      });
      expect(page.ok).toBe(true);
      const data = page.output as { text: string; nextOffset: number | null };
      collected += data.text;
      offset = data.nextOffset;
    }
    expect(collected).toBe(text);
    expect(mockInvokeTool).toHaveBeenCalledOnce();
    expect(
      (
        await studioHostLanguageModelToolAdapters().readHostToolOutput({
          outputRef: output.outputRef,
        })
      ).ok
    ).toBe(false);
    expect((await adapter.readHostToolOutput({ outputRef: output.outputRef, offset: -1 })).ok).toBe(
      false
    );
    expect(
      (await adapter.readHostToolOutput({ outputRef: output.outputRef, offset: text.length + 1 }))
        .ok
    ).toBe(false);
  });

  it('recovers paged output after adapter recreation without repeating the effect', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'output-reload-'));
    try {
      mockTools.push({ name: 'create.report', description: 'Create report', tags: ['write'] });
      const text = 'entry '.repeat(8000) + 'REPORT-END';
      mockInvokeTool.mockResolvedValue({ content: [{ value: text }] });
      const first = studioHostLanguageModelToolAdapters(undefined, undefined, { root });
      const result = await first.invokeHostTool({ name: 'create.report', sessionId: 'owner' });
      const output = result.output as { outputRef: string; text: string };
      expect(result).toMatchObject({ ok: true, output: { durable: true } });
      const second = studioHostLanguageModelToolAdapters(undefined, undefined, { root });
      expect(await second.listRetainedHostToolOutputs({ sessionId: 'owner' })).toMatchObject({
        ok: true,
        output: { outputs: [{ outputRef: output.outputRef, totalChars: text.length }] },
      });
      expect(await second.listRetainedHostToolOutputs({ sessionId: 'other' })).toMatchObject({
        ok: true,
        output: { outputs: [] },
      });
      let collected = output.text;
      let offset: number | null = 24000;
      while (offset !== null) {
        const page = await second.readHostToolOutput({
          outputRef: output.outputRef,
          sessionId: 'owner',
          offset,
          limit: 24000,
        });
        expect(page.ok).toBe(true);
        collected += (page.output as { text: string }).text;
        offset = (page.output as { nextOffset: number | null }).nextOffset;
      }
      expect(collected).toBe(text);
      expect(
        (await second.readHostToolOutput({ outputRef: output.outputRef, sessionId: 'other' })).ok
      ).toBe(false);
      expect(
        (await first.readHostToolOutput({ outputRef: output.outputRef, sessionId: 'other' })).ok
      ).toBe(false);
      expect(mockInvokeTool).toHaveBeenCalledOnce();
    } finally {
      await fs.remove(root);
    }
  });

  it('reports storage failure without describing an executed operation as failed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'output-storage-failure-'));
    try {
      const badRoot = path.join(root, 'file');
      await fs.writeFile(badRoot, 'not a directory');
      mockTools.push({ name: 'create.report', description: 'Create report', tags: ['write'] });
      mockInvokeTool.mockResolvedValue({ content: [{ value: 'x'.repeat(25000) }] });
      const adapter = studioHostLanguageModelToolAdapters(undefined, undefined, { root: badRoot });
      const result = await adapter.invokeHostTool({ name: 'create.report', sessionId: 'owner' });
      expect(result).toMatchObject({
        ok: true,
        output: { durable: false, retentionError: expect.any(String) },
      });
      expect(mockInvokeTool).toHaveBeenCalledOnce();
    } finally {
      await fs.remove(root);
    }
  });

  it('reports retention limits explicitly instead of claiming an oversized output is complete', async () => {
    mockTools.push({ name: 'read.report', description: 'Read report', tags: ['read'] });
    mockInvokeTool.mockResolvedValue({ content: [{ value: 'x'.repeat(2_000_001) }] });
    const adapter = studioHostLanguageModelToolAdapters();
    const result = await adapter.invokeHostTool({ name: 'read.report' });
    expect(result).toMatchObject({
      output: {
        totalChars: 2_000_001,
        retainedChars: 2_000_000,
        completeOutputRetained: false,
        truncated: true,
      },
    });
    const { outputRef } = result.output as { outputRef: string };
    expect(await adapter.readHostToolOutput({ outputRef, offset: 1_999_999 })).toMatchObject({
      output: { text: 'x', nextOffset: null, completeOutputRetained: false },
    });
    for (let at = 0; at < 8; at++) await adapter.invokeHostTool({ name: 'read.report' });
    expect((await adapter.readHostToolOutput({ outputRef })).ok).toBe(false);
  });

  it('preserves native Chat tool ownership when invoking a registered tool', async () => {
    mockTools.push({ name: 'read', description: 'Read', tags: ['read'] });
    mockInvokeTool.mockResolvedValue({ content: [{ value: 'Result' }] });
    const ownership = {} as import('vscode').ChatParticipantToolToken;
    await studioHostLanguageModelToolAdapters(undefined, ownership).invokeHostTool({
      name: 'read',
    });
    expect(mockInvokeTool.mock.calls[0][1].toolInvocationToken).toBe(ownership);
  });

  it('never invokes host tools for already cancelled requests', async () => {
    mockTools.push({ name: 'read', description: 'Read', tags: ['read'] });
    const controller = new AbortController();
    controller.abort();
    const adapter = studioHostLanguageModelToolAdapters();
    await expect(
      adapter.invokeHostTool({ name: 'read', signal: controller.signal })
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('cancelled before execution'),
    });
    const token = { isCancellationRequested: true, onCancellationRequested: vi.fn() };
    await expect(
      studioHostLanguageModelToolAdapters(token).invokeHostTool({ name: 'read' })
    ).resolves.toMatchObject({ ok: false });
    expect(mockInvokeTool).not.toHaveBeenCalled();
  });

  it('does not report success if the host ignores cancellation and returns late', async () => {
    mockTools.push({ name: 'read', description: 'Read', tags: ['read'] });
    const controller = new AbortController();
    mockInvokeTool.mockImplementation(async () => {
      controller.abort();
      return { content: [{ value: 'late result' }] };
    });
    await expect(
      studioHostLanguageModelToolAdapters().invokeHostTool({
        name: 'read',
        signal: controller.signal,
      })
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('effects may need review'),
    });
  });

  it('retains binary image results and the host input schema instead of dropping them', async () => {
    mockTools.push({
      name: 'mcp_screenshot',
      description: 'Read screenshot',
      tags: ['read'],
      inputSchema: { type: 'object', properties: { page: { type: 'string' } } },
    });
    const bytes = new Uint8Array([137, 80, 78, 71]);
    mockInvokeTool.mockResolvedValue({ content: [{ mimeType: 'image/png', data: bytes }] });
    const adapter = studioHostLanguageModelToolAdapters();
    expect(adapter.listHostTools()).toMatchObject({
      output: { tools: [{ inputSchema: { type: 'object' } }] },
    });
    expect(await adapter.invokeHostTool({ name: 'mcp_screenshot' })).toMatchObject({
      ok: true,
      images: [{ mimeType: 'image/png', base64: Buffer.from(bytes).toString('base64') }],
    });
  });

  it('classifies read-like host tools and lists the VS Code catalog', () => {
    expect(isReadLikeHostLanguageModelTool(['search'])).toBe(true);
    expect(isReadLikeHostLanguageModelTool(['edit'])).toBe(false);
    expect(isReadLikeHostLanguageModelTool(['web'])).toBe(false);
    expect(isReadLikeHostLanguageModelTool(['read', 'write'])).toBe(false);
    mockTools.push(
      {
        name: 'mcp_browser_snapshot',
        description: 'Capture the current page',
        tags: ['read'],
      },
      {
        name: 'mcp_issues_create',
        description: 'Create an issue',
        tags: ['write'],
      }
    );
    expect(listStudioHostLanguageModelTools()).toEqual([
      expect.objectContaining({ name: 'mcp_browser_snapshot', readLike: true }),
      expect.objectContaining({ name: 'mcp_issues_create', readLike: false }),
    ]);
  });

  it('invokes a registered host tool and returns bounded text', async () => {
    mockTools.push({
      name: 'mcp_browser_snapshot',
      description: 'Capture the current page',
      tags: ['read'],
    });
    mockInvokeTool.mockResolvedValue({
      content: [{ value: 'Dashboard loaded' }],
    });
    const adapters = studioHostLanguageModelToolAdapters();
    await expect(
      adapters.invokeHostTool({ name: 'mcp_browser_snapshot', arguments: { fullPage: true } })
    ).resolves.toMatchObject({
      ok: true,
      output: {
        name: 'mcp_browser_snapshot',
        readLike: true,
        text: 'Dashboard loaded',
      },
    });
    expect(mockInvokeTool).toHaveBeenCalledWith(
      'mcp_browser_snapshot',
      { input: { fullPage: true }, toolInvocationToken: undefined },
      expect.anything()
    );
  });
});
