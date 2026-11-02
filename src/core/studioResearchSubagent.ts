import crypto from 'node:crypto';
import {
  StudioAgentSession,
  type StudioAgentModelAdapter,
  type StudioAgentSessionStore,
} from './studioAgentSession.js';
import type { StudioAgentToolDefinition } from './studioAgentToolRegistry.js';
import type { StudioAgentToolRegistry } from './studioAgentToolRegistry.js';

/** Isolated read-only investigations share findings, never a mutable parent session. */
export function studioResearchSubagentTool(input: {
  createModel(objective: string): StudioAgentModelAdapter;
  createRegistry(): StudioAgentToolRegistry;
  store: StudioAgentSessionStore;
  workspaceTrusted?: () => boolean;
  retainToolImages?: import('./studioAgentSession.js').StudioAgentSessionOptions['retainToolImages'];
}): StudioAgentToolDefinition {
  return {
    name: 'delegate-research',
    title: 'Delegate independent research',
    description:
      'Run up to three independent read-only investigations concurrently in isolated child sessions. Supply complete objectives and relevant scope/context. Children can inspect source, documentation and diagnostics, cannot mutate, cannot delegate recursively, and cannot satisfy parent verification obligations. Returns findings, child session ids and decision counts. Use for substantial independent investigations, not greetings or simple questions.',
    inputSchema: {
      type: 'object',
      required: ['objectives'],
      additionalProperties: false,
      properties: {
        objectives: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string', minLength: 1, maxLength: 4_000 },
        },
      },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const objectives =
        raw && typeof raw === 'object' ? (raw as { objectives?: unknown }).objectives : undefined;
      if (
        !Array.isArray(objectives) ||
        !objectives.length ||
        objectives.length > 3 ||
        objectives.some(
          (objective) =>
            typeof objective !== 'string' || !objective.trim() || objective.length > 4_000
        )
      ) {
        throw new Error('Supply one to three complete research objectives.');
      }
      const requests = Math.floor(
        (context.delegate?.remainingProviderRequests ?? 36) / objectives.length
      );
      const tokens = Math.floor((context.delegate?.remainingTokens ?? 300_000) / objectives.length);
      if (requests < 2 || tokens < 1_000) {
        return {
          ok: false,
          error:
            'Insufficient remaining allowance for research delegation. Answer from existing evidence or continue directly.',
        };
      }
      const results = await Promise.all(
        objectives.map(async (objective: string) => {
          const child = new StudioAgentSession(
            {
              id: crypto.randomUUID(),
              parent: {
                sessionId: context.sessionId,
                requestId: context.requestId,
                toolCallId: context.toolCallId,
                kind: 'research',
                objective,
              },
              retainToolImages: input.retainToolImages,
              workspacePath: context.workspacePath,
              projectPath: context.projectPath,
              cardId: 'assistant:subagent',
              assistantMode: 'ask',
              executionPolicy: {
                schemaVersion: 'workspai.assistant-execution-policy.v1',
                selectedMode: 'ask',
                requestIntent: 'question',
                routeConfidence: 'high',
                profile: 'evidence-answer',
                toolMode: 'ask',
              },
              requiresVerifiedCompletion: false,
              permissionLevel: 'default',
              workspaceTrusted: input.workspaceTrusted?.() ?? true,
              returnOnInput: true,
              executionAuthority: 'workspace',
              providerRequestBudget: Math.min(120, requests),
              tokenBudget: Math.min(1_000_000, tokens),
              maxTurns: Math.min(12, requests),
            },
            input.createModel(objective),
            input.createRegistry(),
            input.store
          );
          const abort = () => child.cancel();
          context.signal.addEventListener('abort', abort, { once: true });
          try {
            if (context.signal.aborted) {
              return {
                objective: objective.slice(0, 500),
                status: 'cancelled',
                answer: 'Research was cancelled before execution.',
              };
            }
            await context.reportProgress?.({
              childSessionId: child.id,
              summary: `Investigating: ${objective.slice(0, 200)}`,
            });
            const result = await child.run(objective, { userRequest: '' });
            const terminal = [...result.events]
              .reverse()
              .find((event) =>
                ['session.completed', 'session.failed', 'session.cancelled'].includes(event.type)
              );
            return {
              objective: objective.slice(0, 500),
              childSessionId: child.id,
              status: result.status,
              answer: String(
                terminal?.data.summary ??
                  terminal?.data.answer ??
                  [...result.events]
                    .reverse()
                    .find(
                      (event) => event.type === 'model.message' && event.data.inputRequired === true
                    )?.data.text ??
                  'No final findings were produced.'
              ).slice(0, 2_000),
              decisions: result.budgetLedger?.totalModelDecisions ?? 0,
              usage: {
                providerRequests: result.budgetLedger?.totalProviderRequests ?? 0,
                inputTokens: result.budgetLedger?.totalInputTokens ?? 0,
                outputTokens: result.budgetLedger?.totalOutputTokens ?? 0,
                estimatedTokenMeasurements: result.budgetLedger?.estimatedTokenMeasurements ?? 0,
              },
            };
          } catch (error) {
            return {
              objective: objective.slice(0, 500),
              status: 'failed',
              answer: error instanceof Error ? error.message : String(error),
            };
          } finally {
            context.signal.removeEventListener('abort', abort);
          }
        })
      );
      return {
        ok: results.every((result) => result.status === 'completed'),
        output: {
          concurrent: objectives.length > 1,
          results,
          budgetUsage: results.reduce(
            (sum, result) => ({
              providerRequests: sum.providerRequests + (result.usage?.providerRequests ?? 0),
              inputTokens: sum.inputTokens + (result.usage?.inputTokens ?? 0),
              outputTokens: sum.outputTokens + (result.usage?.outputTokens ?? 0),
              estimatedTokenMeasurements:
                sum.estimatedTokenMeasurements + (result.usage?.estimatedTokenMeasurements ?? 0),
            }),
            { providerRequests: 0, inputTokens: 0, outputTokens: 0, estimatedTokenMeasurements: 0 }
          ),
          verificationAuthority: 'research-only; parent verification remains open',
        },
      };
    },
  };
}
