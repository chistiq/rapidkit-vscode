import { describe, expect, it, vi } from 'vitest';
import { StudioAgentSession, type StudioAgentModelAction } from '../core/studioAgentSession.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';

describe('Effectful host-tool completion evidence', () => {
  it.each([false, true])(
    'requires review and verification after an approved host operation (throws=%s)',
    async (throws) => {
      const invoke = vi.fn(async () => {
        if (throws) {
          throw new Error('Connection lost after submitting the external operation');
        }
        return { ok: true, output: { text: 'Operation returned.' } };
      });
      const inspect = vi.fn(async () => ({ ok: true }));
      const verify = vi.fn(async () => ({ ok: true, cardBlocking: false }));
      const host = {
        listHostTools: () => ({
          ok: true,
          output: { tools: [{ name: 'mcp.effect', readLike: false }] },
        }),
        invokeHostTool: invoke,
        inspectChanges: inspect,
        verify,
      } as unknown as StudioAgentWorkspaiToolHost;
      const registry = createStudioAgentWorkspaiToolRegistry({
        host,
        assistantMode: 'agent',
        cardId: 'assistant:agent',
        executionAuthority: 'workspace',
      });
      const actions: StudioAgentModelAction[] = [
        {
          type: 'tool',
          toolName: 'invoke-host-tool',
          input: { name: 'mcp.effect' },
          reason: 'Run the user-authorized operation',
        },
        {
          type: 'complete',
          summary: 'The operation returned; external effects require their own acceptance.',
        },
        {
          type: 'tool',
          toolName: 'inspect-workspace-changes',
          input: {},
          reason: 'Review workspace effects',
        },
        {
          type: 'tool',
          toolName: 'verify-blocker',
          input: {},
          reason: 'Check workspace diagnostics',
        },
        throws
          ? {
              type: 'report',
              summary:
                'The external outcome is unknown after a connection failure. Workspace diagnostics alone cannot prove it. Do not repeat the operation without checking the external state.',
              nextSteps: [],
            }
          : {
              type: 'complete',
              summary:
                'The host tool returned. Workspace changes and diagnostics were inspected. External outcome acceptance was not independently tested.',
            },
      ];
      const result = await new StudioAgentSession(
        {
          workspacePath: '/workspace',
          id: 'parent',
          assistantMode: 'agent',
          cardId: 'assistant:agent',
          executionAuthority: 'workspace',
          permissionLevel: 'autopilot',
          workspaceTrusted: true,
          requiresVerifiedCompletion: true,
          maxTurns: 8,
          requestToolApproval: async (request) => ({
            approved: true,
            fingerprint: request.fingerprint,
          }),
        },
        { next: async () => actions.shift()! },
        registry,
        { save: async () => {} }
      ).run('Perform the external operation');
      expect(result.status).toBe(throws ? 'failed' : 'completed');
      expect(invoke).toHaveBeenCalledOnce();
      expect(inspect).toHaveBeenCalledOnce();
      expect(verify).toHaveBeenCalledOnce();
      expect(
        result.events.some(
          (event) => event.type === 'model.checkpoint' && event.data.blocker === 'source-review'
        )
      ).toBe(true);
      const observation = result.events.find(
        (event) =>
          ['tool.completed', 'tool.failed'].includes(event.type) &&
          event.data.toolName === 'invoke-host-tool'
      );
      expect(observation?.data.output).toMatchObject({
        hostToolExecution: {
          effectful: true,
          verificationLimit: expect.stringContaining('cannot verify external effects'),
        },
      });
      expect(result.nativeTransactionIds).toBeUndefined();
    }
  );
});
