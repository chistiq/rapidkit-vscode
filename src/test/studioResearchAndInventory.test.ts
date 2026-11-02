import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectStudioWorkspaceInventory } from '../core/studioWorkspaceInventory.js';
import { searchStudioPublicWeb } from '../core/studioPublicWebSearch.js';
import { fetchStudioPublicWeb } from '../core/studioPublicWebFetch.js';
import { dispatchAssistantTurn } from '../core/assistantTurn.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import { ContractStudioAgentModelAdapter } from '../core/studioAgentModelProtocol.js';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
describe('Reported research and project-list conversation', () => {
  it('routes a search follow-up to read-only tools, carrying the original CLI question without requiring local scope', async () => {
    const execute = vi.fn(async (route, policy) => {
      expect(route.normalizedRequest).toBe('Find the Workspai CLI command to create a workspace.');
      expect(policy).toMatchObject({ profile: 'evidence-answer', toolMode: 'ask' });
      const registry = createStudioAgentWorkspaiToolRegistry({
        host: {} as StudioAgentWorkspaiToolHost,
        cardId: 'assistant:research',
        assistantMode: policy.toolMode,
        externalResearch: true,
      });
      expect(registry.list().map((tool) => tool.name)).toEqual([
        'inspect-cli-commands',
        'search-public-web',
        'fetch-public-web',
      ]);
    });
    const respond = vi.fn();
    await dispatchAssistantTurn({
      task: 'Search the internet for it.',
      selectedMode: 'agent',
      hasProjectScope: false,
      history: [
        { role: 'user', content: 'What is the Workspai CLI command for creating a workspace?' },
      ],
      complete: async ({ prompt }) => {
        expect(prompt).toContain('Explicit search or lookup requests must be research');
        return {
          type: 'tool',
          toolName: 'route-workspai-request',
          input: {
            intent: 'research',
            confidence: 'high',
            normalizedRequest: 'Find the Workspai CLI command to create a workspace.',
            userResponse: '',
            reason: 'The user requested current documentation.',
          },
        };
      },
      isCancelled: () => false,
      respond,
      suggest: vi.fn(),
      execute,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(respond).not.toHaveBeenCalled();
  });
  it('reads all eight registered project names from the live contract despite an incomplete older summary', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-inventory-'));
    roots.push(root);
    await fs.outputJSON(path.join(root, '.workspai/workspace-registry.v1.json'), {
      schemaVersion: 'workspace-registry.v1',
      workspaceName: 'wrong-old-name',
      projects: [{ slug: 'only-one', relativePath: 'only-one' }],
    });
    await fs.outputJSON(path.join(root, '.workspai/workspace.contract.json'), {
      workspace: { name: 'my-workspace' },
      projects: Array.from({ length: 8 }, (_, index) => ({
        slug: `project-${index}`,
        relativePath: `projects/project-${index}`,
      })),
    });
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: {} as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:question',
      assistantMode: 'ask',
    });
    let turn = 0;
    const adapter = new ContractStudioAgentModelAdapter(
      'Name the projects.',
      async (_prompt, request) => {
        if (turn++ === 0) return { toolName: 'inspect-workspace', input: {} };
        const observation = request.messages.find((message) => 'toolResult' in message);
        expect(JSON.stringify(observation)).toContain('project-7');
        return {
          type: 'text',
          text: Array.from({ length: 8 }, (_, index) => `project-${index}`).join(', '),
        };
      }
    );
    const result = await new StudioAgentSession(
      {
        workspacePath: root,
        cardId: 'assistant:question',
        assistantMode: 'agent',
        executionPolicy: {
          schemaVersion: 'workspai.assistant-execution-policy.v1',
          selectedMode: 'agent',
          requestIntent: 'question',
          routeConfidence: 'high',
          profile: 'evidence-answer',
          toolMode: 'ask',
        },
        permissionLevel: 'default',
        workspaceTrusted: true,
        requiresVerifiedCompletion: false,
      },
      adapter,
      registry,
      { save: async () => {} }
    ).run('Name the projects.');
    expect(result.status).toBe('completed');
    expect(turn).toBe(2);
    expect((await inspectStudioWorkspaceInventory(root)).projectCount).toBe(8);
    expect(result.events.filter((event) => event.type === 'tool.completed')).toHaveLength(1);
    expect(result.events.some((event) => event.type === 'verify.completed')).toBe(false);
  });
  it('preserves source links from a public documentation page', async () => {
    const result = await fetchStudioPublicWeb(
      { url: 'https://docs.example.test/' },
      {
        lookup: async () => ({ address: '93.184.216.34', family: 4 }),
        fetch: vi.fn(
          async () =>
            new Response('<a href="https://docs.example.test/cli">CLI documentation</a>', {
              status: 200,
              headers: { 'content-type': 'text/html' },
            })
        ) as typeof fetch,
      }
    );
    expect(result).toMatchObject({
      ok: true,
      output: { links: [{ title: 'CLI documentation', url: 'https://docs.example.test/cli' }] },
    });
  });
  it('tries a second search provider after a challenge and returns useful alternative guidance after failure', async () => {
    const page = {
      schemaVersion: 'workspai.studio-public-web-fetch.v1' as const,
      requestedUrl: '',
      finalUrl: '',
      status: 200,
      contentType: 'text/html',
      truncated: false,
      text: 'Official CLI reference',
      links: [{ title: 'CLI', url: 'https://workspai.dev/cli' }],
    };
    const lookup = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, output: { ...page, text: 'Verify you are human' } })
      .mockResolvedValueOnce({ ok: true, output: page });
    expect(
      await searchStudioPublicWeb({ query: 'workspai cli workspace create' }, lookup)
    ).toMatchObject({ ok: true, output: { links: page.links } });
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(
      await searchStudioPublicWeb(
        { query: 'workspai' },
        vi.fn(async () => ({ ok: false, error: 'HTTP 429' }))
      )
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('registered search/browser host tool'),
    });
  });
});
