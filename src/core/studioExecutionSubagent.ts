import crypto from 'node:crypto';
import { studioToolSearchTool } from './studioToolDiscovery.js';
import {
  StudioAgentSession,
  type StudioAgentModelAdapter,
  type StudioAgentSessionStore,
} from './studioAgentSession.js';
import {
  StudioAgentToolRegistry,
  type StudioAgentToolDefinition,
} from './studioAgentToolRegistry.js';

/** A child chooses actions; the parent owns every authorization, effect and checkpoint. */
export function studioExecutionSubagentTool(input: {
  createModel(objective: string): StudioAgentModelAdapter;
  store: StudioAgentSessionStore;
}): StudioAgentToolDefinition {
  return {
    name: 'delegate-task',
    title: 'Delegate a focused implementation task',
    description:
      'Delegate one substantial, bounded implementation or investigation in the current scope to a child agent. Include the required outcome, relevant context and constraints. The child can edit and run tools through this parent request: permissions, Stop, file changes and Undo remain owned by the parent. Execution is sequential; the child cannot recursively delegate, switch workspaces, or mark the parent objective verified. Review the findings and verify the final combined result yourself. Use direct tools for small tasks.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['objective'],
      properties: { objective: { type: 'string', minLength: 1, maxLength: 8_000 } },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const objective =
        raw && typeof raw === 'object' ? (raw as { objective?: unknown }).objective : undefined;
      if (typeof objective !== 'string' || !objective.trim() || objective.length > 8_000) {
        throw new Error('Supply one complete, bounded implementation objective.');
      }
      const bridge = context.delegate;
      if (!bridge || bridge.remainingProviderRequests < 2 || bridge.remainingTokens < 1_000) {
        return {
          ok: false,
          error:
            'Delegation is unavailable or the parent has insufficient remaining allowance. Continue directly with the available tools.',
        };
      }
      const registry = new StudioAgentToolRegistry();
      for (const tool of bridge.tools) {
        if (tool.name === 'search-studio-tools') {
          continue;
        }
        registry.register({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          // These proxies do not execute effects themselves. Parent admission uses the real risk.
          activity: 'inspect',
          risk: 'read',
          scopeIndependent: true,
          async execute(value) {
            const result = await bridge.invoke(
              tool.name,
              value,
              `Delegated task: ${objective.slice(0, 300)}`
            );
            // Only the parent tracks mutation/verification obligations, effects and target changes.
            const output =
              result.output && typeof result.output === 'object' && !Array.isArray(result.output)
                ? Object.fromEntries(
                    Object.entries(result.output).filter(
                      ([key]) => !['effects', 'observationScopes'].includes(key)
                    )
                  )
                : result.output;
            return {
              ok: result.ok,
              error: result.error,
              output,
              images: result.images,
              terminalReason: result.terminalReason,
              requiresUserDecision: result.requiresUserDecision,
            };
          },
        });
      }
      registry.register(studioToolSearchTool(registry));
      const task = [
        `Parent request and constraints (your segment covers only part of this request; preserve the user's constraints):\n${bridge.parentContext}`,
        objective,
        'This is a delegated segment of a parent request. Work only in the supplied scope and constraints. Tool calls are authorized and recorded by the parent. Do not adopt/import existing software without the original user authorization. Do not change workspace target. Report the actual result, checks, blockers and unfinished work; your summary does not verify the parent outcome. Ask for essential missing information through structured input, which will return to the parent.',
      ].join('\n\n');
      const child = new StudioAgentSession(
        {
          id: crypto.randomUUID(),
          parent: {
            sessionId: context.sessionId,
            requestId: context.requestId,
            toolCallId: context.toolCallId,
            kind: 'execution',
            objective,
          },
          workspacePath: context.workspacePath,
          projectPath: context.projectPath,
          cardId: 'assistant:execution-subagent',
          assistantMode: 'agent',
          executionAuthority: 'workspace',
          permissionLevel: 'default',
          workspaceTrusted: true,
          requiresVerifiedCompletion: false,
          effectsManagedByParent: true,
          returnOnInput: true,
          maxTurns: Math.min(40, bridge.remainingProviderRequests),
          providerRequestBudget: bridge.remainingProviderRequests,
          tokenBudget: bridge.remainingTokens,
        },
        input.createModel(task),
        registry,
        input.store
      );
      const cancel = () => child.cancel();
      const stopSteering = bridge.subscribeToSteering?.((message, images) =>
        child.steer(message, images)
      );
      context.signal.addEventListener('abort', cancel, { once: true });
      try {
        if (context.signal.aborted) {
          return { ok: false, error: 'Delegation was cancelled before execution.' };
        }
        await context.reportProgress?.({
          childSessionId: child.id,
          summary: `Working on: ${objective.slice(0, 200)}`,
        });
        const result = await child.run(task, { userRequest: '' });
        const terminal = [...result.events]
          .reverse()
          .find((event) =>
            ['session.completed', 'session.failed', 'session.cancelled'].includes(event.type)
          );
        const question = [...result.events]
          .reverse()
          .find((event) => event.type === 'model.message' && event.data.inputRequired === true);
        return {
          ok: result.status === 'completed',
          output: {
            childSessionId: child.id,
            status: result.status,
            answer: String(
              terminal?.data.summary ??
                terminal?.data.answer ??
                question?.data.text ??
                'No final result was produced.'
            ).slice(0, 8_000),
            budgetUsage: {
              providerRequests: result.budgetLedger?.totalProviderRequests ?? 0,
              inputTokens: result.budgetLedger?.totalInputTokens ?? 0,
              outputTokens: result.budgetLedger?.totalOutputTokens ?? 0,
              estimatedTokenMeasurements: result.budgetLedger?.estimatedTokenMeasurements ?? 0,
            },
            verificationAuthority:
              'parent-owned effects; parent must review and verify the combined result',
          },
        };
      } finally {
        stopSteering?.();
        context.signal.removeEventListener('abort', cancel);
      }
    },
  };
}
