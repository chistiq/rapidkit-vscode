import { describe, expect, it } from 'vitest';
import { jsonToolMessages, parseJsonToolEnvelope } from '../core/aiToolTransport.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_COMPLETE_TOOL_NAME,
} from '../core/studioAgentModelProtocol.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';

// Scripted endpoints exercise admission and answer delivery, not model reasoning.
// Run the corresponding user objectives against live providers before claiming
// semantic quality or parity across models.
describe.each(['native', 'json'] as const)('Assistant scenario transport: %s', (transport) => {
  it.each(['ask', 'agent'] as const)(
    'delivers source-backed architecture guidance in %s without a workspace or repair loop',
    async (mode) => {
      const objective = 'Explain Workspai Model and Graph. Do not change any files.';
      const registry = createStudioAgentWorkspaiToolRegistry({
        host: {} as StudioAgentWorkspaiToolHost,
        cardId: `assistant:${mode}`,
        assistantMode: mode,
      });
      let calls = 0;
      const summary =
        'The Workspace Model is canonical; Graph is derived and revision-bound. A missing relationship is not proven. This is product documentation, not current workspace health.';
      const adapter = new ContractStudioAgentModelAdapter(objective, async (_prompt, request) => {
        const action =
          calls++ === 0
            ? {
                toolName: 'inspect-cli-commands',
                input: { topic: 'knowledge', document: 'graph', maxChars: 1000 },
              }
            : { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary } };
        if (calls === 2) {
          const history = JSON.stringify(request.messages);
          expect(history).toContain('product-documentation-not-live-evidence');
          expect(history).toContain('sourceSha256');
        }
        if (transport === 'native') {
          return action;
        }
        const messages = jsonToolMessages(request.messages, request.tools);
        expect(
          messages.every((message) => !('toolCall' in message) && !('toolResult' in message))
        ).toBe(true);
        const decoded = parseJsonToolEnvelope(JSON.stringify(action), request.tools);
        if (!decoded) {
          throw new Error('The endpoint returned an invalid transport envelope.');
        }
        return {
          ...decoded,
          resolution: {
            provider: 'scripted',
            modelId: 'same-model',
            fallback: false,
            attempts: 1,
            toolTransport: 'json',
          },
        };
      });
      const state = await new StudioAgentSession(
        {
          workspacePath: '/opt/fixtures/no-workspace-required',
          cardId: `assistant:${mode}`,
          assistantMode: mode,
          permissionLevel: 'default',
          workspaceTrusted: true,
          requiresVerifiedCompletion: false,
        },
        adapter,
        registry,
        { save: async () => {} }
      ).run(objective);
      expect(state.status).toBe('completed');
      expect(calls).toBe(2);
      expect(state.events.filter((event) => event.type === 'tool.completed')).toHaveLength(1);
      expect(
        state.events.some(
          (event) => event.type === 'verify.completed' || event.type === 'mutation.applied'
        )
      ).toBe(false);
      expect(state.events.find((event) => event.type === 'session.completed')?.data.summary).toBe(
        summary
      );
      if (transport === 'json') {
        expect(JSON.stringify(state.events)).toContain('"toolTransport":"json"');
      }
    }
  );
});
