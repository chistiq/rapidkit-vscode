import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioAgentSession, type StudioAgentModelAction } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import { studioExecutionSubagentTool } from '../core/studioExecutionSubagent.js';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_COMPLETE_TOOL_NAME,
} from '../core/studioAgentModelProtocol.js';
import { parseJsonToolEnvelope } from '../core/aiToolTransport.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';
import {
  configureStudioNativeStorage,
  createStudioNativeWorkspaceCapabilities,
  reviewStudioNativeCheckpoint,
} from '../core/studioNativeWorkspace.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
const next = (actions: StudioAgentModelAction[]) => ({
  next: async () => {
    const action = actions.shift();
    if (!action) throw new Error('Unexpected model decision');
    return action;
  },
});
const call = (toolName: string, input: unknown = {}): StudioAgentModelAction => ({
  type: 'tool',
  toolName,
  input,
  reason: 'Required delegated work',
});
const complete: StudioAgentModelAction = {
  type: 'complete',
  summary: 'The scoped task was performed.',
};
const options = {
  workspacePath: '/workspace',
  cardId: 'assistant:agent',
  assistantMode: 'agent' as const,
  executionAuthority: 'workspace' as const,
  permissionLevel: 'autopilot' as const,
  workspaceTrusted: true,
  requiresVerifiedCompletion: false,
  maxTurns: 8,
};
const store = { save: async () => {} };

describe('Parent-owned execution delegation', () => {
  it.each(['native', 'json'] as const)(
    'uses the shared tool protocol across parent and child with %s transport and accounts for estimated child usage',
    async (transport) => {
      const adapter = (
        objective: string,
        actions: Array<{ toolName: string; input: Record<string, unknown> }>
      ) =>
        new ContractStudioAgentModelAdapter(objective, async (_prompt, request) => {
          const action = actions.shift();
          if (!action) {
            throw new Error('Unexpected provider call');
          }
          const resolution = {
            provider: 'scripted',
            modelId: 'same-model',
            fallback: false,
            attempts: 1,
            inputTokens: 100,
            outputTokens: 20,
            tokenUsageSource: 'estimated' as const,
          };
          if (transport === 'native') {
            return { ...action, resolution };
          }
          const decoded = parseJsonToolEnvelope(JSON.stringify(action), request.tools);
          if (!decoded) {
            throw new Error('Invalid JSON tool action');
          }
          return { ...decoded, resolution };
        });
      const registry = new StudioAgentToolRegistry();
      const inspect = vi.fn(async (_value, context) => {
        expect(context.sessionId).toBe('parent');
        return { ok: true, output: { text: 'Current source inspected' } };
      });
      registry.register({
        name: 'inspect-source',
        title: 'Read',
        description: '',
        inputSchema: { type: 'object' },
        activity: 'inspect',
        risk: 'read',
        execute: inspect,
      });
      registry.register(
        studioExecutionSubagentTool({
          store,
          createModel: (objective) =>
            adapter(objective, [
              { toolName: 'inspect-source', input: {} },
              {
                toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
                input: { summary: 'Source inspected.' },
              },
            ]),
        })
      );
      const result = await new StudioAgentSession(
        { ...options, id: 'parent' },
        adapter('Inspect source', [
          { toolName: 'delegate-task', input: { objective: 'Inspect current source' } },
          {
            toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
            input: { summary: 'The child inspected current source.' },
          },
        ]),
        registry,
        store
      ).run('Inspect source');
      expect(result.status).toBe('completed');
      expect(inspect).toHaveBeenCalledOnce();
      expect(result.budgetLedger).toMatchObject({
        totalProviderRequests: 4,
        totalInputTokens: 400,
        totalOutputTokens: 80,
        estimatedTokenMeasurements: 4,
      });
    }
  );
  it('records real child edits against the parent request, requires parent review and restores the request checkpoint', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'delegated-edit-'));
    roots.push(root);
    const workspacePath = path.join(root, 'source');
    await fs.outputFile(path.join(workspacePath, 'service.ts'), 'before\n');
    configureStudioNativeStorage(path.join(root, 'storage'));
    const native = createStudioNativeWorkspaceCapabilities({
      workspacePath,
      inspectedSource: new Map([
        ['service.ts', crypto.createHash('sha256').update('before\n').digest('hex')],
      ]),
      diagnostics: async () => ({ ok: true, output: { diagnostics: [] } }),
      inspectChanges: async () => ({ ok: true }),
    });
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: native as StudioAgentWorkspaiToolHost,
      assistantMode: 'agent',
      cardId: 'assistant:agent',
      executionAuthority: 'workspace',
    });
    const childSave = vi.fn(async () => {});
    registry.register(
      studioExecutionSubagentTool({
        store: { save: childSave },
        createModel: () =>
          next([
            call('apply-workspace-patch', {
              patches: [
                {
                  relativePath: 'service.ts',
                  patchedContent: 'after\n',
                  isNewFile: false,
                  hunks: [],
                  status: 'pending',
                },
              ],
            }),
            call('inspect-workspace-changes'),
            call('verify-blocker'),
            complete,
          ]),
      })
    );
    const result = await new StudioAgentSession(
      { ...options, workspacePath, id: 'parent', requiresVerifiedCompletion: true },
      next([
        call('delegate-task', {
          objective: 'Change service.ts, inspect the result and check diagnostics.',
        }),
        // The child verifier cannot satisfy the parent's combined-result review.
        complete,
        call('inspect-workspace-changes'),
        call('verify-blocker'),
        complete,
      ]),
      registry,
      store
    ).run('Update service');
    expect(result.status).toBe('completed');
    const edit = result.events.find(
      (event) => event.type === 'tool.completed' && event.data.toolName === 'apply-workspace-patch'
    )!;
    const delegation = result.events.find(
      (event) => event.type === 'tool.completed' && event.data.toolName === 'delegate-task'
    )!;
    expect(edit.sessionId).toBe('parent');
    expect(edit.requestId).toBe(delegation.requestId);
    expect(JSON.stringify(edit.data)).toContain('service.ts');
    expect(result.nativeTransactionIds).toHaveLength(1);
    expect(
      result.events.some(
        (event) =>
          event.type === 'model.checkpoint' &&
          event.sequence > delegation.sequence &&
          event.data.blocker === 'source-review'
      )
    ).toBe(true);
    expect(result.budgetLedger!.totalProviderRequests).toBeGreaterThanOrEqual(8);
    await fs.writeFile(path.join(workspacePath, 'user.txt'), 'unrelated change');
    await reviewStudioNativeCheckpoint({
      workspaceTrusted: true,
      sessionId: 'parent',
      requestIds: [edit.requestId!],
      transactionIds: result.nativeTransactionIds!,
      action: 'restore',
    });
    expect(await fs.readFile(path.join(workspacePath, 'service.ts'), 'utf8')).toBe('before\n');
    expect(await fs.readFile(path.join(workspacePath, 'user.txt'), 'utf8')).toBe(
      'unrelated change'
    );
  });

  it.each([true, false])(
    'keeps exact invasive approval in the parent controller (approved=%s)',
    async (approved) => {
      const execute = vi.fn(async () => ({ ok: true }));
      const approval = vi.fn(async (request) => ({ approved, fingerprint: request.fingerprint }));
      const registry = new StudioAgentToolRegistry();
      registry.register({
        name: 'external-action',
        title: 'External action',
        description: '',
        inputSchema: {},
        activity: 'inspect',
        risk: 'invasive',
        authorize: () => ({
          risk: 'invasive',
          approval: {
            fingerprint: 'exact-fingerprint',
            title: 'Confirm action',
            summary: 'One action',
            scope: 'workspace',
            reasons: [],
            execution: 'once',
          },
        }),
        execute,
      });
      registry.register(
        studioExecutionSubagentTool({
          store,
          createModel: () =>
            next([
              call('external-action'),
              approved
                ? complete
                : {
                    type: 'report',
                    summary: 'The action was declined and was not run.',
                    nextSteps: [],
                  },
            ]),
        })
      );
      const result = await new StudioAgentSession(
        { ...options, id: 'parent', requestToolApproval: approval },
        next([
          call('delegate-task', { objective: 'Perform the external action' }),
          approved
            ? complete
            : { type: 'complete', summary: 'The action was declined and was not run.' },
        ]),
        registry,
        store
      ).run('Perform the external action');
      expect(result.status).toBe('completed');
      if (!approved) {
        expect(
          result.events.find(
            (event) => event.type === 'tool.failed' && event.data.toolName === 'delegate-task'
          )?.data.output
        ).toMatchObject({ status: 'failed' });
      }
      expect(approval).toHaveBeenCalledOnce();
      expect(approval.mock.calls[0][0]).toMatchObject({
        sessionId: 'parent',
        toolName: 'external-action',
        fingerprint: 'exact-fingerprint',
      });
      expect(execute).toHaveBeenCalledTimes(approved ? 1 : 0);
    }
  );

  it('does not expose recursive delegation, parent ledger changes or target switches', async () => {
    const registry = new StudioAgentToolRegistry();
    for (const name of [
      'create-workspace',
      'bind-workspace',
      'update-task-ledger',
      'delegate-research',
    ]) {
      registry.register({
        name,
        title: name,
        description: '',
        inputSchema: {},
        activity: 'inspect',
        risk: 'read',
        execute: async () => ({ ok: true }),
      });
    }
    registry.register(
      studioExecutionSubagentTool({
        store,
        createModel: () => ({
          next: async (context) => {
            expect(context.tools).toEqual([]);
            return complete;
          },
        }),
      })
    );
    const result = await new StudioAgentSession(
      options,
      next([call('delegate-task', { objective: 'Investigate' }), complete]),
      registry,
      store
    ).run('Investigate');
    expect(result.status).toBe('completed');
  });

  it('leaves child-started effects in the parent until observed and verified there', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'start-terminal',
      title: '',
      description: '',
      inputSchema: {},
      activity: 'change',
      risk: 'safe-write',
      execute: async () => ({ ok: true, output: { terminalId: 'owned', state: 'running' } }),
    });
    registry.register({
      name: 'read-terminal',
      title: '',
      description: '',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute: async () => ({
        ok: true,
        output: { terminalId: 'owned', state: 'exited', exitCode: 0 },
      }),
    });
    registry.register({
      name: 'inspect-workspace-changes',
      title: '',
      description: '',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute: async () => ({ ok: true }),
    });
    registry.register({
      name: 'verify-blocker',
      title: '',
      description: '',
      inputSchema: {},
      activity: 'verify',
      risk: 'read',
      execute: async () => ({ ok: true, cardBlocking: false }),
    });
    registry.register(
      studioExecutionSubagentTool({
        store,
        createModel: () => next([call('start-terminal'), complete]),
      })
    );
    const result = await new StudioAgentSession(
      options,
      next([
        call('delegate-task', { objective: 'Start the required terminal process' }),
        complete,
        call('read-terminal'),
        call('inspect-workspace-changes'),
        call('verify-blocker'),
        complete,
      ]),
      registry,
      store
    ).run('Run and check the task');
    expect(result.status).toBe('completed');
    const delegated = result.events.find(
      (event) => event.type === 'tool.completed' && event.data.toolName === 'delegate-task'
    )!;
    expect(delegated.data.output).toMatchObject({ status: 'completed', delegatedEffects: true });
    expect(
      result.events.some(
        (event) =>
          event.type === 'model.checkpoint' &&
          event.sequence > delegated.sequence &&
          event.data.blocker === 'pending-effects'
      )
    ).toBe(true);
    expect(result.pendingEffectVerificationScopes).toBeUndefined();
  });

  it('keeps delegated tools in the parent Goal project scope', async () => {
    const registry = new StudioAgentToolRegistry();
    const inspect = vi.fn(async (_raw, context) => {
      expect(context).toMatchObject({
        sessionId: 'parent-goal',
        workspacePath: '/workspace',
        projectPath: '/registered-external/project',
      });
      expect(context.delegate).toBeUndefined();
      return { ok: true };
    });
    registry.register({
      name: 'inspect-source',
      title: '',
      description: '',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute: inspect,
    });
    registry.register(
      studioExecutionSubagentTool({
        store,
        createModel: () => next([call('inspect-source'), complete]),
      })
    );
    const result = await new StudioAgentSession(
      {
        ...options,
        id: 'parent-goal',
        assistantMode: 'goal',
        projectPath: '/registered-external/project',
      },
      next([call('delegate-task', { objective: 'Inspect this project' }), complete]),
      registry,
      store
    ).run('Inspect this project');
    expect(result.status).toBe('completed');
    expect(inspect).toHaveBeenCalledOnce();
  });
  it('does not consume the immutable Goal verification allowance for a child action declined before execution', async () => {
    const registry = new StudioAgentToolRegistry();
    const execute = vi.fn(async () => ({ ok: true, cardBlocking: false }));
    registry.register({
      name: 'verify-goal',
      title: 'Verify',
      description: '',
      inputSchema: {},
      activity: 'verify',
      risk: 'invasive',
      authorize: () => ({
        risk: 'invasive',
        approval: {
          fingerprint: 'exact-goal',
          title: 'Verify',
          summary: 'Verify the Goal',
          scope: 'workspace',
          reasons: [],
          execution: 'once',
        },
      }),
      execute,
    });
    registry.register(
      studioExecutionSubagentTool({
        store,
        createModel: () =>
          next([
            call('verify-goal'),
            { type: 'report', summary: 'Verification was declined.', nextSteps: [] },
          ]),
      })
    );
    let approvals = 0;
    const result = await new StudioAgentSession(
      {
        ...options,
        assistantMode: 'goal',
        requiresVerifiedCompletion: true,
        goalMaxAttempts: 1,
        requestToolApproval: async (request) => ({
          approved: ++approvals === 2,
          fingerprint: request.fingerprint,
        }),
      },
      next([call('delegate-task', { objective: 'Check the Goal' }), call('verify-goal'), complete]),
      registry,
      store
    ).run('Check the Goal');
    expect(result.status).toBe('completed');
    expect(approvals).toBe(2);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('returns essential missing information instead of keeping a child waiting', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register(
      studioExecutionSubagentTool({
        store,
        createModel: () =>
          next([{ type: 'input', question: 'Which account?', reason: 'Missing user information' }]),
      })
    );
    const result = await new StudioAgentSession(
      options,
      next([call('delegate-task', { objective: 'Inspect the account' }), complete]),
      registry,
      store
    ).run('Inspect account');
    const output = result.events.find(
      (event) => event.type === 'tool.failed' && event.data.toolName === 'delegate-task'
    )?.data.output;
    expect(output).toMatchObject({ status: 'waiting-input', answer: 'Which account?' });
  });
  it('propagates a tool review boundary instead of letting a child hide it in a success summary', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'needs-review',
      title: '',
      description: '',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute: async () => ({
        ok: false,
        terminalReason: 'review-required',
        requiresUserDecision: true,
        error: 'Review the failed transaction.',
      }),
    });
    registry.register(
      studioExecutionSubagentTool({
        store,
        createModel: () => next([call('needs-review'), complete]),
      })
    );
    const result = await new StudioAgentSession(
      options,
      next([call('delegate-task', { objective: 'Inspect the transaction' }), complete]),
      registry,
      store
    ).run('Inspect the transaction');
    expect(result.status).toBe('failed');
    expect(result.events.find((event) => event.type === 'session.failed')?.data).toMatchObject({
      terminalReason: 'review-required',
      requiresUserDecision: true,
    });
  });

  it('cancels an unresponsive child model and prevents a late tool from running', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'late-action',
      title: '',
      description: '',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute,
    });
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    let late!: (value: StudioAgentModelAction) => void;
    registry.register(
      studioExecutionSubagentTool({
        store,
        createModel: () => ({
          next: async () => {
            started();
            return new Promise((resolve) => {
              late = resolve;
            });
          },
        }),
      })
    );
    const session = new StudioAgentSession(
      options,
      next([call('delegate-task', { objective: 'Inspect' })]),
      registry,
      store
    );
    const running = session.run('Inspect');
    await began;
    session.cancel();
    expect((await running).status).toBe('cancelled');
    late(call('late-action'));
    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();
  });
  it('preserves parent constraints and delivers live steering to the child and the parent continuation', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-source',
      title: '',
      description: '',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute: async () => ({ ok: true }),
    });
    let began!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    let continueDecision!: (action: StudioAgentModelAction) => void;
    let childTurn = 0;
    registry.register(
      studioExecutionSubagentTool({
        store,
        createModel: (objective) => {
          expect(objective).toContain('Use Python; do not adopt or import existing software.');
          return {
            next: async (context) => {
              if (childTurn++ === 0) {
                began();
                return new Promise((resolve) => {
                  continueDecision = resolve;
                });
              }
              expect(context.steering).toContain('Inspect configuration only; do not edit.');
              return complete;
            },
          };
        },
      })
    );
    let parentTurn = 0;
    const session = new StudioAgentSession(
      options,
      {
        next: async (context) => {
          if (parentTurn++ === 0) {
            return call('delegate-task', { objective: 'Investigate the configuration' });
          }
          expect(context.steering).toContain('Inspect configuration only; do not edit.');
          return complete;
        },
      },
      registry,
      store
    );
    const running = session.run(
      'Use Python; do not adopt or import existing software. Inspect the configuration.'
    );
    await started;
    session.steer('Inspect configuration only; do not edit.');
    continueDecision(call('inspect-source'));
    expect((await running).status).toBe('completed');
    expect(childTurn).toBe(2);
  });

  it('does not grant a delegation bridge to read-only sessions and preserves allowance for the parent', async () => {
    const createModel = vi.fn(() => next([complete]));
    const tool = studioExecutionSubagentTool({ store, createModel });
    for (const testOptions of [
      { ...options, assistantMode: 'ask' as const },
      { ...options, providerRequestBudget: 5 },
    ]) {
      const registry = new StudioAgentToolRegistry();
      registry.register(tool);
      const result = await new StudioAgentSession(
        testOptions,
        next([call('delegate-task', { objective: 'Implement' }), complete]),
        registry,
        store
      ).run('Implement');
      expect(result.events.find((event) => event.type === 'tool.failed')?.data.error).toContain(
        'Delegation is unavailable'
      );
    }
    expect(createModel).not.toHaveBeenCalled();
  });
});
