import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioIsolatedTasks } from '../core/studioIsolatedTasks.js';
import {
  StudioAgentSession,
  type StudioAgentModelAdapter,
  type StudioAgentSessionStore,
} from '../core/studioAgentSession.js';
import type { StudioAgentPersistedSession } from '../core/studioAgentEvents.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';
import {
  configureStudioNativeStorage,
  createStudioNativeWorkspaceCapabilities,
  reviewStudioNativeCheckpoint,
} from '../core/studioNativeWorkspace.js';
import { inspectStudioAgentFiles } from '../core/sidebarStudioAgentRuntime.js';
import type { StudioAgentToolContext } from '../core/studioAgentToolRegistry.js';
import { deleteStudioIsolatedTaskData } from '../core/studioIsolatedTaskStorage.js';
import { markStudioSessionDeleted } from '../core/studioSessionDeletion.js';

let root: string, source: string, storage: string;
let saved: Map<string, StudioAgentPersistedSession>;
let store: StudioAgentSessionStore;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-isolated-'));
  source = path.join(root, 'project');
  storage = path.join(root, 'storage');
  await fs.outputFile(path.join(source, 'a.ts'), 'export const a = 1;\n');
  await fs.outputFile(path.join(source, 'b.ts'), 'export const b = 1;\n');
  saved = new Map();
  store = {
    save: async (state) => {
      saved.set(state.id, structuredClone(state));
    },
    load: async (id) => saved.get(id),
  };
  configureStudioNativeStorage(storage);
});
afterEach(async () => {
  await fs.remove(root);
});
const context = (): StudioAgentToolContext => ({
  sessionId: 'parent',
  requestId: 'request',
  toolCallId: 'isolation',
  workspacePath: source,
  signal: new AbortController().signal,
  delegate: {
    tools: [],
    remainingProviderRequests: 40,
    remainingTokens: 200000,
    parentContext: 'Implement two independent changes; preserve user edits.',
    invoke: vi.fn(),
  },
});
const tasks = [
  { objective: 'Update a', writePaths: ['a.ts'] },
  { objective: 'Update b', writePaths: ['b.ts'] },
];
function children(onFirst?: (root: string) => Promise<void>) {
  return (objective: string): StudioAgentModelAdapter => {
    let step = 0;
    const file = objective.includes('Your segment: Update a') ? 'a.ts' : 'b.ts';
    return {
      next: async (context) => {
        const current = step++;
        if (current === 0) {
          await onFirst?.(context.session.workspacePath);
          return {
            type: 'tool',
            toolName: 'inspect-source',
            input: { paths: [file] },
            reason: 'Inspect claimed source',
          };
        }
        if (current === 1)
          return {
            type: 'tool',
            toolName: 'apply-isolated-edits',
            input: { path: file, content: `export const ${file[0]} = 2;\n` },
            reason: 'Prepare isolated change',
          };
        return {
          type: 'complete',
          summary: 'Prepared private proposal; parent checks are still required.',
        };
      },
      consumeResolution: () => ({
        provider: 'fixture',
        modelId: 'same-configured-model',
        fallback: false,
        attempts: 1,
        inputTokens: 10,
        outputTokens: 5,
        tokenUsageSource: 'provider',
      }),
    };
  };
}
describe('Parallel isolated editable source forks', () => {
  it('retains mandatory repository instructions even when generated instruction files are ignored', async () => {
    await fs.outputFile(path.join(source, 'AGENTS.md'), 'Preserve this root rule.');
    await fs.outputFile(
      path.join(source, '.github/copilot-instructions.md'),
      'Preserve this provider rule.'
    );
    await fs.outputFile(path.join(source, '.gitignore'), 'AGENTS.md\n.github/\n');
    const tool = new StudioIsolatedTasks({
      storageRoot: storage,
      store,
      createModel: children(async (fork) => {
        expect(await fs.readFile(path.join(fork, 'AGENTS.md'), 'utf8')).toBe(
          'Preserve this root rule.'
        );
        expect(await fs.readFile(path.join(fork, '.github/copilot-instructions.md'), 'utf8')).toBe(
          'Preserve this provider rule.'
        );
      }),
    }).tools()[0];
    expect((await tool.execute({ tasks: [tasks[0]] }, context())).ok).toBe(true);
  });
  it('can create a proposed file in an empty source fork and never exposes command tools to children', async () => {
    await fs.emptyDir(source);
    const model = children();
    const tool = new StudioIsolatedTasks({
      storageRoot: storage,
      store,
      createModel: (objective) => {
        const child = model(objective);
        return {
          ...child,
          next: async (context) => {
            expect(context.tools.map((entry) => entry.name)).not.toContain('run-workspace-command');
            return child.next(context);
          },
        };
      },
    }).tools()[0];
    const result = await tool.execute({ tasks: [tasks[0]] }, context());
    expect(result).toMatchObject({
      ok: true,
      output: { state: 'ready', segments: [{ files: [{ path: 'a.ts', created: true }] }] },
    });
    expect(await fs.readdir(source)).toEqual([]);
  });
  it('refuses unknown inputs or an exhausted parent allowance before copying source', async () => {
    const createModel = vi.fn(children());
    const tool = new StudioIsolatedTasks({ storageRoot: storage, store, createModel }).tools()[0];
    await expect(tool.execute({ tasks, surprise: true }, context())).rejects.toThrow('Invalid');
    const scope = context();
    scope.delegate!.remainingTokens = 10;
    expect(await tool.execute({ tasks }, scope)).toMatchObject({
      ok: false,
      error: expect.stringContaining('allowance'),
    });
    expect(createModel).not.toHaveBeenCalled();
  });
  it.each(['together', 'separately'])(
    'runs children concurrently and integrates %s through real parent checkpoints with Undo and final review',
    async (integration) => {
      const roots: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const isolated = new StudioIsolatedTasks({
        storageRoot: storage,
        store,
        createModel: children(async (fork) => {
          roots.push(fork);
          if (roots.length === 2) release();
          await gate;
        }),
      });
      const inspected = new Map<string, string | null>();
      const native = createStudioNativeWorkspaceCapabilities({
        workspacePath: source,
        inspectedSource: inspected,
        diagnostics: async () => ({ ok: true, output: { diagnostics: [] } }),
        inspectChanges: async () => ({ ok: true, output: {} }),
      });
      const host = {
        ...native,
        inspect: async (request: Parameters<typeof inspectStudioAgentFiles>[0]) => {
          const observations = await inspectStudioAgentFiles(request);
          observations.forEach((entry) => inspected.set(entry.path, entry.sha256));
          return { ok: true, output: observations };
        },
      } as unknown as StudioAgentWorkspaiToolHost;
      const registry = createStudioAgentWorkspaiToolRegistry({
        host,
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
      });
      isolated.tools().forEach((tool) => registry.register(tool));
      let step = 0;
      let remaining: { jobId: string; segmentIds: string[] } | undefined;
      const parent: StudioAgentModelAdapter = {
        next: async (context) => {
          switch (step++) {
            case 0:
              return {
                type: 'tool',
                toolName: 'delegate-isolated-tasks',
                input: { tasks },
                reason: 'Two disjoint implementation tasks',
              };
            case 1: {
              expect(await fs.readFile(path.join(source, 'a.ts'), 'utf8')).toContain('= 1');
              expect(await fs.readFile(path.join(source, 'b.ts'), 'utf8')).toContain('= 1');
              const output = context.latestObservation!.output as {
                jobId: string;
                segments: Array<{ id: string }>;
              };
              if (integration === 'separately')
                remaining = { jobId: output.jobId, segmentIds: [output.segments[1].id] };
              return {
                type: 'tool',
                toolName: 'integrate-isolated-task',
                input: {
                  jobId: output.jobId,
                  segmentIds: (integration === 'separately'
                    ? output.segments.slice(0, 1)
                    : output.segments
                  ).map((segment) => segment.id),
                },
                reason: 'Review and integrate both proposals',
              };
            }
            case 2:
              expect(context.latestObservation?.ok, JSON.stringify(context.latestObservation)).toBe(
                true
              );
              if (remaining) {
                expect(context.latestObservation!.output).toMatchObject({
                  state: 'partial-integration',
                });
                const input = remaining;
                remaining = undefined;
                step--;
                return {
                  type: 'tool',
                  toolName: 'integrate-isolated-task',
                  input,
                  reason: 'Integrate the remaining independent proposal',
                };
              }
              return {
                type: 'tool',
                toolName: 'inspect-workspace-changes',
                input: {},
                reason: 'Review parent diff',
              };
            case 3:
              return {
                type: 'tool',
                toolName: 'verify-blocker',
                input: {},
                reason: 'Inspect combined workspace evidence',
              };
            default:
              return {
                type: 'complete',
                summary:
                  'Integrated both proposals; this fixture checks transactions, not application behavior.',
              };
          }
        },
      };
      const session = new StudioAgentSession(
        {
          id: 'parent',
          workspacePath: source,
          cardId: 'assistant:agent',
          assistantMode: 'agent',
          executionAuthority: 'workspace',
          permissionLevel: 'autopilot',
          workspaceTrusted: true,
          providerRequestBudget: 50,
          tokenBudget: 500000,
          maxTurns: 20,
        },
        parent,
        registry,
        store
      );
      const state = await session.run(
        'Update a and b independently, then review the combined changes.'
      );
      expect(
        state.status,
        JSON.stringify(state.events.filter((event) => event.type === 'tool.failed'))
      ).toBe('completed');
      expect(roots).toHaveLength(2);
      expect(new Set(roots).size).toBe(2);
      expect(roots.every((fork) => fork !== source)).toBe(true);
      expect(await fs.readFile(path.join(source, 'a.ts'), 'utf8')).toContain('= 2');
      expect(await fs.readFile(path.join(source, 'b.ts'), 'utf8')).toContain('= 2');
      expect(
        state.events.filter(
          (event) =>
            event.type === 'tool.completed' && event.data.toolName === 'apply-workspace-patch'
        )
      ).toHaveLength(integration === 'separately' ? 2 : 1);
      expect(state.budgetLedger!.totalProviderRequests).toBeGreaterThanOrEqual(6);
      const requestId = state.events.find((event) => event.type === 'request.started')!.requestId!;
      await reviewStudioNativeCheckpoint({
        sessionId: 'parent',
        requestIds: [requestId],
        transactionIds: [],
        action: 'restore',
        workspaceTrusted: true,
      });
      expect(await fs.readFile(path.join(source, 'a.ts'), 'utf8')).toContain('= 1');
      expect(await fs.readFile(path.join(source, 'b.ts'), 'utf8')).toContain('= 1');
    }
  );
  it('rejects overlapping claims before invoking a model or creating a source fork', async () => {
    const createModel = vi.fn(children());
    const tool = new StudioIsolatedTasks({ storageRoot: storage, store, createModel }).tools()[0];
    await expect(
      tool.execute(
        { tasks: [tasks[0], { objective: 'conflict', writePaths: ['a.ts'] }] },
        context()
      )
    ).rejects.toThrow('disjoint');
    expect(createModel).not.toHaveBeenCalled();
    expect(await fs.pathExists(path.join(storage, 'assistant-isolated-tasks'))).toBe(false);
  });
  it('preserves concurrent user changes and refuses integration before any parent invocation', async () => {
    const instance = new StudioIsolatedTasks({
      storageRoot: storage,
      store,
      createModel: children(),
    });
    const [run, integrate] = instance.tools(),
      ctx = context();
    const result = await run.execute({ tasks: [tasks[0]] }, ctx),
      output = result.output as { jobId: string; segments: Array<{ id: string }> };
    expect(result.ok).toBe(true);
    await fs.writeFile(path.join(source, 'a.ts'), 'user change\n');
    expect(
      await integrate.execute({ jobId: output.jobId, segmentIds: [output.segments[0].id] }, ctx)
    ).toMatchObject({ ok: false, error: expect.stringContaining('Parent source changed') });
    expect(ctx.delegate!.invoke).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(source, 'a.ts'), 'utf8')).toBe('user change\n');
    const create = vi.fn(children());
    const reloaded = new StudioIsolatedTasks({
      storageRoot: storage,
      store,
      createModel: create,
    }).tools()[0];
    expect(await reloaded.execute({ operation: 'resume', jobId: output.jobId }, ctx)).toMatchObject(
      { ok: true, output: { state: 'ready' } }
    );
    expect(create).not.toHaveBeenCalled();
    await expect(
      reloaded.execute(
        { operation: 'status', jobId: output.jobId },
        { ...ctx, sessionId: 'other-owner' }
      )
    ).rejects.toThrow();
  });
  it('does not integrate proposals prepared before new repository instructions were added', async () => {
    const instance = new StudioIsolatedTasks({
      storageRoot: storage,
      store,
      createModel: children(),
    });
    const [run, integrate] = instance.tools(),
      ctx = context();
    const prepared = await run.execute({ tasks: [tasks[0]] }, ctx);
    const job = prepared.output as { jobId: string; segments: Array<{ id: string }> };
    await fs.writeFile(path.join(source, 'AGENTS.md'), 'New rule: preserve public exports.');
    expect(
      await integrate.execute({ jobId: job.jobId, segmentIds: [job.segments[0].id] }, ctx)
    ).toMatchObject({ ok: false, error: expect.stringContaining('instructions changed') });
    expect(ctx.delegate!.invoke).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(source, 'a.ts'), 'utf8')).toContain('= 1');
  });
  it('stops non-cooperative children, retains a meaningful cancelled receipt and deletes private data with the chat', async () => {
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const instance = new StudioIsolatedTasks({
      storageRoot: storage,
      store,
      createModel: () => ({
        next: async () => {
          entered();
          return new Promise(() => undefined);
        },
      }),
    });
    const controller = new AbortController(),
      ctx = { ...context(), signal: controller.signal };
    const pending = instance.tools()[0].execute({ tasks: [tasks[0]] }, ctx);
    await started;
    controller.abort();
    const result = await pending,
      output = result.output as { jobId: string };
    expect(result).toMatchObject({ ok: false, output: { state: 'cancelled' } });
    expect(await fs.readFile(path.join(source, 'a.ts'), 'utf8')).toContain('= 1');
    await markStudioSessionDeleted(storage, 'parent');
    await deleteStudioIsolatedTaskData(storage, 'parent');
    await expect(
      instance.tools()[0].execute({ operation: 'status', jobId: output.jobId }, context())
    ).rejects.toThrow();
    expect(await fs.readdir(path.join(storage, 'assistant-isolated-tasks'))).toEqual([]);
  });
});
