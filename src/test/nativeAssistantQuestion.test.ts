import { VSCodeStudioAgentSessionStore } from '../core/studioAgentSessionStore.js';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
const provider = vi.hoisted(() => vi.fn());
vi.mock('../core/aiProviderService.js', () => ({ askConfiguredAIProviderForToolAction: provider }));
vi.mock('vscode', () => ({
  workspace: { isTrusted: true },
  tasks: undefined,
  debug: undefined,
  lm: { tools: [] },
}));
import { studioAssistantIdeCapabilities } from '../core/studioAssistantIdeCapabilities.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import { runNativeAssistantQuestion } from '../core/nativeAssistantQuestion.js';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
  provider.mockReset();
});
describe('Native Chat shared runtime', () => {
  it('shares IDE resource ownership while preserving the read-only tool boundary', () => {
    const context = { subscriptions: [] } as unknown as import('vscode').ExtensionContext;
    const service = studioAssistantIdeCapabilities(context);
    expect(studioAssistantIdeCapabilities(context)).toBe(service);
    expect(context.subscriptions).toHaveLength(1);
    const ask = new StudioAgentToolRegistry();
    service.register(ask, true);
    const agent = new StudioAgentToolRegistry();
    service.register(agent, false);
    expect(ask.get('browser-page')).toBeDefined();
    expect(ask.get('read-terminal')).toBeDefined();
    expect(ask.get('start-terminal')).toBeUndefined();
    expect(agent.get('start-terminal')).toBeDefined();
    expect(agent.get('send-terminal-input')).toBeDefined();
    service.dispose();
  });

  it('routes a greeting directly without constructing a workspace session', async () => {
    provider.mockResolvedValue({
      type: 'tool',
      toolName: 'route-workspai-request',
      input: {
        intent: 'conversation',
        confidence: 'high',
        normalizedRequest: 'Hello',
        userResponse: 'Hi!',
        reason: 'Greeting',
        workspaceIntent: 'none',
      },
    });
    const stream = { markdown: vi.fn(), progress: vi.fn(), button: vi.fn() };
    const result = await runNativeAssistantQuestion({
      context: {} as import('vscode').ExtensionContext,
      scope: { type: 'workspace', name: 'none' },
      task: 'Hello',
      history: [],
      token: { isCancellationRequested: false } as import('vscode').CancellationToken,
      stream,
    });
    expect(result.status).toBe('answered');
    expect(stream.markdown).toHaveBeenCalledExactlyOnceWith('Hi!');
    expect(provider).toHaveBeenCalledOnce();
  });
  it('continues native clarifications and preserves chat ownership across questions without crossing workspace scope', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-continuation-'));
    roots.push(root);
    const context = {
      storageUri: { fsPath: path.join(root, 'storage') },
      globalStorageUri: { fsPath: path.join(root, 'global') },
      subscriptions: [] as Array<{ dispose(): void }>,
      workspaceState: { get: () => undefined, update: async () => {} },
    } as unknown as import('vscode').ExtensionContext;
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose() {} }),
    } as unknown as import('vscode').CancellationToken;
    const stream = { markdown: vi.fn(), progress: vi.fn(), button: vi.fn() };
    let phase = 0;
    provider.mockImplementation(async (_context, messages, tools) => {
      if (tools[0]?.name === 'route-workspai-request')
        return {
          type: 'tool',
          toolName: 'route-workspai-request',
          input: {
            intent: 'question',
            confidence: 'high',
            normalizedRequest: phase === 1 ? 'Use staging' : 'Explain the environment',
            userResponse: '',
            continuesPreviousTask: phase === 1,
            reason: 'Contextual follow-up',
            workspaceIntent: 'use-current',
          },
        };
      if (tools[0]?.name === 'workspai-deliver-answer')
        return {
          type: 'tool',
          toolName: tools[0].name,
          input: {
            answer: `Answer phase ${phase}`,
            delivered: true,
            missing: [],
            catalogCoverage: 'none',
          },
        };
      if (phase === 0)
        return {
          type: 'tool',
          toolName: 'workspai-request-input',
          input: { question: 'Which environment?', reason: 'Missing target' },
        };
      if (phase === 1) {
        expect(JSON.stringify(messages)).toContain('Explain the environment');
        expect(JSON.stringify(messages)).toContain('staging');
      }
      return {
        type: 'tool',
        toolName: 'workspai-complete',
        input: { summary: `Answer phase ${phase}` },
      };
    });
    const scope = { type: 'workspace' as const, name: 'sample', path: root };
    const first = await runNativeAssistantQuestion({
      context,
      scope,
      task: 'Explain the environment',
      history: [],
      token,
      stream,
    });
    expect(first.status).toBe('waiting-input');
    expect(stream.markdown).toHaveBeenCalledWith('Which environment?\n\n');
    const store = new VSCodeStudioAgentSessionStore(context);
    const firstCreated = (await store.load(first.sessionId!))!.createdAt;
    phase = 1;
    const second = await runNativeAssistantQuestion({
      context,
      scope,
      task: 'staging',
      previousSessionId: first.sessionId,
      history: [
        { role: 'user', content: 'Explain the environment' },
        { role: 'assistant', content: 'Which environment?' },
      ],
      token,
      stream,
    });
    expect(second).toMatchObject({ status: 'completed', sessionId: first.sessionId });
    expect((await store.load(first.sessionId!))!.createdAt).toBe(firstCreated);
    expect(await store.listRequests(first.sessionId!)).toHaveLength(2);
    phase = 2;
    const third = await runNativeAssistantQuestion({
      context,
      scope,
      task: 'A new question',
      previousSessionId: second.sessionId,
      history: [],
      token,
      stream,
    });
    expect(third.sessionId).toBe(first.sessionId);
    const current = (await store.load(first.sessionId!))!;
    expect(current.events.filter((event) => event.type === 'request.started')).toHaveLength(1);
    expect(await store.listRequests(first.sessionId!)).toHaveLength(3);
    phase = 3;
    const changedScope = await runNativeAssistantQuestion({
      context,
      scope: { ...scope, path: path.join(root, 'other') },
      task: 'Another workspace',
      previousSessionId: third.sessionId,
      history: [],
      token,
      stream,
    });
    expect(changedScope.sessionId).not.toBe(first.sessionId);
    context.subscriptions.forEach((subscription) => subscription.dispose());
  });

  it('selects a user-supplied external project in native Ask without requiring adoption or a selected workspace', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-external-'));
    roots.push(root);
    const source = path.join(root, 'user-project');
    await fs.outputFile(path.join(source, 'answer.ts'), 'export const externalAnswer = 73;\n');
    let step = 0;
    provider.mockImplementation(async (_context, messages, tools) => {
      const name = tools[0]?.name;
      if (name === 'route-workspai-request') {
        return {
          type: 'tool',
          toolName: name,
          input: {
            intent: 'question',
            confidence: 'high',
            normalizedRequest: `Read ${source}`,
            userResponse: '',
            reason: 'Inspect requested source',
            workspaceIntent: 'none',
          },
        };
      }
      if (name === 'workspai-deliver-answer') {
        return {
          type: 'tool',
          toolName: name,
          input: {
            answer: 'The external answer is 73.',
            delivered: true,
            missing: [],
            catalogCoverage: 'none',
          },
        };
      }
      expect(tools.map((tool: { name: string }) => tool.name)).toEqual(
        expect.arrayContaining(['select-project', 'inspect-source'])
      );
      expect(tools.map((tool: { name: string }) => tool.name)).not.toContain('onboard-project');
      if (step++ === 0) {
        return { type: 'tool', toolName: 'select-project', input: { projectPath: source } };
      }
      if (step === 2) {
        return { type: 'tool', toolName: 'inspect-source', input: { paths: ['answer.ts'] } };
      }
      expect(JSON.stringify(messages)).toContain('externalAnswer = 73');
      return {
        type: 'tool',
        toolName: 'workspai-complete',
        input: { summary: 'The external answer is 73.' },
      };
    });
    const context = {
      storageUri: { fsPath: path.join(root, 'storage') },
      globalStorageUri: { fsPath: path.join(root, 'global') },
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => {} },
    } as unknown as import('vscode').ExtensionContext;
    const stream = { markdown: vi.fn(), progress: vi.fn(), button: vi.fn() };
    const result = await runNativeAssistantQuestion({
      context,
      scope: { type: 'workspace', name: 'none' },
      task: `What is the answer in "${source}"?`,
      history: [],
      stream,
      token: {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose() {} }),
      } as unknown as import('vscode').CancellationToken,
    });
    expect(result.status).toBe('completed');
    expect(stream.markdown).toHaveBeenCalledExactlyOnceWith('The external answer is 73.');
    const saved = await new VSCodeStudioAgentSessionStore(context).load(result.sessionId!);
    expect(saved?.executionTarget).toMatchObject({ kind: 'project', workspacePath: source });
    expect(await fs.readdir(source)).toEqual(['answer.ts']);
    context.subscriptions.forEach((subscription) => subscription.dispose());
  });

  it('uses real source inspection and the durable engine without CLI bootstrap', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-shared-'));
    roots.push(root);
    await fs.writeFile(path.join(root, 'service.ts'), 'export const answer = 42;\n');
    let modelCall = 0;
    provider.mockImplementation(async (_context, messages, tools) => {
      const name = tools[0]?.name;
      if (name === 'route-workspai-request')
        return {
          type: 'tool',
          toolName: name,
          input: {
            intent: 'question',
            confidence: 'high',
            normalizedRequest: 'Read the answer constant',
            userResponse: '',
            reason: 'Source question',
            workspaceIntent: 'none',
          },
        };
      if (name === 'workspai-deliver-answer')
        return {
          type: 'tool',
          toolName: name,
          input: {
            answer: 'The answer is 42.',
            delivered: true,
            missing: [],
            catalogCoverage: 'none',
          },
        };
      const names = tools.map((tool: { name: string }) => tool.name);
      expect(names).toEqual(expect.arrayContaining(['inspect-source', 'search-studio-tools']));
      expect(tools.map((tool: { name: string }) => tool.name)).not.toContain(
        'apply-workspace-patch'
      );
      expect(JSON.stringify(messages)).toContain('Do not modify files');
      expect(JSON.stringify(messages)).not.toContain('Own this ordinary coding task');
      if (modelCall++ === 0) {
        expect(names).not.toContain('browser-page');
        expect(JSON.stringify(messages)).toContain('Deferred invocation schemas');
        return {
          type: 'tool',
          toolName: 'search-studio-tools',
          callId: 'discover',
          input: {
            names: ['delegate-research', 'read-host-tool-output', 'browser-page', 'read-terminal'],
          },
        };
      }
      expect(names).toEqual(
        expect.arrayContaining([
          'delegate-research',
          'read-host-tool-output',
          'browser-page',
          'read-terminal',
        ])
      );
      if (modelCall === 2)
        return {
          type: 'tool',
          toolName: 'inspect-source',
          callId: 'read',
          input: { paths: ['service.ts'] },
        };
      expect(JSON.stringify(messages)).toContain('export const answer = 42');
      return {
        type: 'tool',
        toolName: 'workspai-complete',
        input: { summary: 'The answer is 42.' },
      };
    });
    const context = {
      storageUri: { fsPath: path.join(root, 'storage') },
      globalStorageUri: { fsPath: path.join(root, 'global') },
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => {} },
    } as unknown as import('vscode').ExtensionContext;
    const stream = { markdown: vi.fn(), progress: vi.fn(), button: vi.fn() };
    const result = await runNativeAssistantQuestion({
      context,
      scope: { type: 'workspace', name: 'sample', path: root },
      task: 'What is the answer constant?',
      history: [],
      stream,
      token: {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose() {} }),
      } as unknown as import('vscode').CancellationToken,
    });
    expect(result.status).toBe('completed');
    expect(stream.markdown).toHaveBeenCalledExactlyOnceWith('The answer is 42.');
    const stored = await fs.readJSON(path.join(root, 'storage/studio-agent-sessions.v1.json'));
    expect(
      stored.sessions[0].events.some(
        (event: { type: string; data: { toolName?: string } }) =>
          event.type === 'tool.completed' && event.data.toolName === 'inspect-source'
      )
    ).toBe(true);
    context.subscriptions.forEach((subscription) => subscription.dispose());
  });
});
