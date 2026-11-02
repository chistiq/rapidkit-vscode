import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  endProcess: undefined as undefined | ((event: unknown) => void),
  endTask: undefined as undefined | ((event: unknown) => void),
  startDebug: undefined as undefined | ((session: unknown) => void),
  fetchTasks: vi.fn(),
  executeTask: vi.fn(),
  startDebugging: vi.fn(),
  stopDebugging: vi.fn(),
  openNotebook: vi.fn(),
  command: vi.fn(),
}));
vi.mock('vscode', () => ({
  TaskScope: { Workspace: 2 },
  Uri: { file: (file: string) => ({ fsPath: file, toString: () => file }) },
  tasks: {
    fetchTasks: fake.fetchTasks,
    executeTask: fake.executeTask,
    onDidEndTaskProcess: (listener: (event: unknown) => void) => {
      fake.endProcess = listener;
      return { dispose() {} };
    },
    onDidEndTask: (listener: (event: unknown) => void) => {
      fake.endTask = listener;
      return { dispose() {} };
    },
  },
  debug: {
    startDebugging: fake.startDebugging,
    stopDebugging: fake.stopDebugging,
    onDidStartDebugSession: (listener: (session: unknown) => void) => {
      fake.startDebug = listener;
      return {
        dispose() {
          fake.startDebug = undefined;
        },
      };
    },
    onDidTerminateDebugSession: () => ({ dispose() {} }),
  },
  workspace: {
    getWorkspaceFolder: (uri: unknown) => ({ uri }),
    getConfiguration: () => ({ get: () => [{ name: 'Launch API' }] }),
    openNotebookDocument: fake.openNotebook,
  },
  window: { showNotebookDocument: vi.fn(async () => {}) },
  commands: { executeCommand: fake.command },
}));
import { StudioEditorTools } from '../core/studioEditorTools.js';
import type {
  StudioAgentToolContext,
  StudioAgentToolDefinition,
} from '../core/studioAgentToolRegistry.js';

describe('Native editor capability adapters', () => {
  let manager: StudioEditorTools;
  let root: string;
  const context = (): StudioAgentToolContext => ({
    sessionId: 'owner',
    requestId: 'r',
    toolCallId: 't',
    workspacePath: root,
    signal: new AbortController().signal,
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-editor-'));
    fake.fetchTasks.mockResolvedValue([]);
    fake.stopDebugging.mockResolvedValue(undefined);
    fake.command.mockResolvedValue(undefined);
    manager = new StudioEditorTools();
  });
  afterEach(async () => {
    manager.dispose();
    await fs.remove(root);
  });
  const output = (result: { output?: unknown }) => result.output as Record<string, unknown>;
  async function approved(tool: StudioAgentToolDefinition, request: unknown, scope = context()) {
    const auth = await tool.authorize!(request, scope);
    return tool.execute(request, {
      ...scope,
      approval: auth.approval
        ? {
            fingerprint: auth.approval.fingerprint,
            approvedBy: 'user',
            approvedAt: new Date().toISOString(),
          }
        : undefined,
    });
  }

  it('uses live task ids, captures a fast exit before executeTask resolves and rejects stale definitions', async () => {
    const task = {
      name: 'Build',
      source: 'workspace',
      scope: { uri: { fsPath: root, toString: () => root } },
      definition: { type: 'shell', command: 'npm run build' },
      execution: { options: { env: { SECRET: 'do-not-publish' } } },
    };
    fake.fetchTasks.mockResolvedValue([task]);
    const execution = { terminate: vi.fn() };
    fake.executeTask.mockImplementation(async () => {
      fake.endProcess?.({ execution, exitCode: 0 });
      return execution;
    });
    const tool = manager.tools(false).find((entry) => entry.name === 'editor-task')!;
    const listed = await tool.execute({ operation: 'list' }, context());
    expect(JSON.stringify(listed)).not.toContain('do-not-publish');
    const id = (output(listed).tasks as Array<{ id: string }>)[0].id;
    await expect(tool.execute({ operation: 'run', id }, context())).rejects.toThrow('approval');
    const started = await approved(tool, { operation: 'run', id });
    const runId = output(started).id;
    expect(output(await tool.execute({ operation: 'status', id: runId }, context()))).toMatchObject(
      { state: 'ended', exitCode: 0, observationScopes: [`editor-task:${runId}`] }
    );
    await expect(
      tool.execute({ operation: 'status', id: runId }, { ...context(), sessionId: 'other' })
    ).rejects.toThrow('owned');
    task.definition.command = 'npm publish';
    await expect(approved(tool, { operation: 'run', id })).rejects.toThrow('Refresh');
    expect(fake.executeTask).toHaveBeenCalledOnce();
  });

  it('does not grant execution in a read-only tool set and terminates only owned active tasks', async () => {
    const tool = manager.tools(true).find((entry) => entry.name === 'editor-task')!;
    await expect(tool.authorize!({ operation: 'run', id: 'x' }, context())).rejects.toThrow(
      'Agent'
    );
    await expect(tool.execute({ operation: 'run', id: 'x' }, context())).rejects.toThrow(
      'approval'
    );
    expect(fake.executeTask).not.toHaveBeenCalled();
  });

  it('releases cancellation during a slow task launch and terminates a late execution', async () => {
    fake.fetchTasks.mockResolvedValue([
      { name: 'Slow', source: 'workspace', scope: 2, definition: { type: 'shell' } },
    ]);
    let finish: ((run: unknown) => void) | undefined;
    let began: (() => void) | undefined;
    const launching = new Promise<void>((resolve) => {
      began = resolve;
    });
    fake.executeTask.mockImplementation(() => {
      began!();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const tool = manager.tools(false).find((entry) => entry.name === 'editor-task')!;
    const id = (
      output(await tool.execute({ operation: 'list' }, context())).tasks as Array<{ id: string }>
    )[0].id;
    const controller = new AbortController();
    const promise = approved(
      tool,
      { operation: 'run', id },
      { ...context(), signal: controller.signal }
    );
    await launching;
    controller.abort();
    await expect(promise).rejects.toThrow('cancelled');
    const execution = { terminate: vi.fn() };
    finish!(execution);
    await vi.waitFor(() => expect(execution.terminate).toHaveBeenCalled());
  });

  it('launches and inspects an owned debugger but keeps evaluation behind exact approval', async () => {
    const session = {
      id: 'debug-1',
      name: 'Launch API',
      type: 'node',
      workspaceFolder: { uri: { fsPath: root } },
      customRequest: vi.fn(async () => ({ threads: [{ id: 1 }] })),
    };
    fake.startDebugging.mockImplementation(async () => {
      fake.startDebug?.(session);
      return true;
    });
    const tool = manager.tools(false).find((entry) => entry.name === 'editor-debug')!;
    const started = await approved(tool, { operation: 'start', configuration: 'Launch API' });
    expect(output(started).id).toBe('debug-1');
    expect(
      output(
        await tool.execute({ operation: 'inspect', id: 'debug-1', request: 'threads' }, context())
      )
    ).toMatchObject({ response: { threads: [{ id: 1 }] } });
    await expect(
      tool.execute({ operation: 'inspect', id: 'debug-1', request: 'evaluate' }, context())
    ).rejects.toThrow('Unsupported');
    await expect(
      tool.execute({ operation: 'request', id: 'debug-1', request: 'evaluate' }, context())
    ).rejects.toThrow('approval');
    await expect(
      tool.execute(
        { operation: 'request', id: 'debug-1', request: 'next' },
        { ...context(), sessionId: 'other' }
      )
    ).rejects.toThrow('approval');
    manager.cancelSession('other');
    expect(fake.stopDebugging).not.toHaveBeenCalled();
    manager.cancelSession('owner');
    expect(fake.stopDebugging).toHaveBeenCalledWith(session);
  });

  it('inspects notebook content and verifies an observed execution instead of treating dispatch as completion', async () => {
    const file = path.join(root, 'example.ipynb');
    await fs.writeJSON(file, {});
    const cell = {
      kind: 2,
      document: { languageId: 'python', getText: () => 'print(1)' },
      executionSummary: undefined as
        | undefined
        | { success: boolean; timing: { startTime: number; endTime: number } },
      outputs: [{ items: [{ mime: 'text/plain', data: new TextEncoder().encode('1') }] }],
    };
    fake.openNotebook.mockResolvedValue({
      uri: { fsPath: file },
      cellCount: 1,
      cellAt: () => cell,
    });
    const tool = manager.tools(false).find((entry) => entry.name === 'editor-notebook')!;
    expect(
      JSON.stringify(await tool.execute({ operation: 'inspect', path: 'example.ipynb' }, context()))
    ).toContain('print(1)');
    const started = await approved(tool, { operation: 'run', path: 'example.ipynb', cells: [0] });
    const id = output(started).id;
    expect(output(await tool.execute({ operation: 'status', id }, context()))).toMatchObject({
      state: 'pending',
      observationScopes: [],
    });
    cell.executionSummary = {
      success: true,
      timing: { startTime: Date.now(), endTime: Date.now() + 1 },
    };
    expect(output(await tool.execute({ operation: 'status', id }, context()))).toMatchObject({
      state: 'ended',
      observationScopes: [`editor-notebook:${id}`],
    });
    await expect(
      tool.execute({ operation: 'inspect', path: '../outside.ipynb' }, context())
    ).rejects.toThrow();
  });

  it('skips markdown cells and reports a kernel failure through observable run status', async () => {
    const file = path.join(root, 'mixed.ipynb');
    await fs.writeJSON(file, {});
    const cells = [{ kind: 1 }, { kind: 2 }];
    fake.openNotebook.mockResolvedValue({
      uri: { fsPath: file },
      cellCount: 2,
      cellAt: (index: number) => cells[index],
    });
    fake.command.mockRejectedValueOnce(new Error('No notebook kernel is installed'));
    const tool = manager.tools(false).find((entry) => entry.name === 'editor-notebook')!;
    const result = await approved(tool, { operation: 'run', path: 'mixed.ipynb' });
    expect(output(result).selectedCells).toEqual([1]);
    const status = await tool.execute({ operation: 'status', id: output(result).id }, context());
    expect(output(status)).toMatchObject({
      state: 'failed',
      error: expect.stringContaining('kernel'),
    });
  });
});
