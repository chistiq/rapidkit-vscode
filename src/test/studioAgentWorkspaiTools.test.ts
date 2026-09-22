import { describe, expect, it, vi } from 'vitest';

import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';

describe('Studio Agent Workspai tool registry', () => {
  it('classifies mutating project commands as exact one-time approval requests', async () => {
    const runWorkspaceCommand = vi.fn(async () => ({ ok: true, changed: true }));
    const host = { runWorkspaceCommand } as unknown as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'readiness',
      assistantMode: 'agent',
    });
    const tool = registry.get('run-workspace-command');
    const context = {
      sessionId: 'session-approval',
      requestId: 'request-approval',
      toolCallId: 'tool-approval',
      workspacePath: '/workspace',
      projectPath: '/workspace/web',
      signal: new AbortController().signal,
    };
    const raw = {
      executable: 'npm',
      args: ['install'],
      purpose: 'dependency',
    };

    const authorization = await tool?.authorize?.(raw, context);

    expect(authorization).toMatchObject({
      risk: 'invasive',
      approval: {
        displayCommand: 'npm install',
        scope: 'project',
        execution: 'once',
      },
    });
    const fingerprint = authorization?.approval?.fingerprint;
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await tool?.execute(raw, {
      ...context,
      approval: {
        fingerprint: fingerprint!,
        approvedBy: 'test:user',
        approvedAt: '2026-08-29T00:00:00.000Z',
      },
    });
    expect(runWorkspaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        request: raw,
        projectPath: '/workspace/web',
        approval: expect.objectContaining({ fingerprint }),
      })
    );
  });

  it('exposes and routes the deterministic blocker recovery prelude when the host supports it', async () => {
    const recoverActiveBlocker = vi.fn(async () => ({ ok: true, changed: true }));
    const host = {
      recoverActiveBlocker,
    } as unknown as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'readiness',
      assistantMode: 'agent',
    });
    const tool = registry.get('recover-active-blocker');

    expect(tool).toBeDefined();
    await tool?.execute(
      {},
      {
        sessionId: 'session-1',
        requestId: 'request-1',
        toolCallId: 'tool-1',
        workspacePath: '/workspace',
        projectPath: '/workspace/web',
        signal: new AbortController().signal,
      }
    );
    expect(recoverActiveBlocker).toHaveBeenCalledWith({
      workspacePath: '/workspace',
      projectPath: '/workspace/web',
    });
  });

  it('exposes the complete inspect/search/change/run/verify surface', () => {
    const host = {} as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'readiness',
      assistantMode: 'agent',
    });
    expect(registry.list().map((tool) => tool.name)).toEqual([
      'update-task-ledger',
      'discover-workspace-files',
      'inspect-source',
      'inspect-evidence',
      'search-workspace',
      'inspect-workspace-diagnostics',
      'inspect-workspace-batch',
      'fetch-public-web',
      'inspect-workspace-changes',
      'apply-workspace-patch',
      'run-governed-command',
      'delete-workspace-files',
      'run-workspace-command',
      'inspect-remediation-plan',
      'execute-remediation-step',
      'verify-blocker',
    ]);
    expect(registry.get('inspect-dependency-security')).toBeUndefined();
    const commandTool = registry.get('run-governed-command');
    expect(commandTool?.inputSchema).toMatchObject({
      properties: {
        commandId: {
          enum: expect.arrayContaining(['workspaceIntelligenceChain', 'workspaceWatch']),
        },
      },
    });
    expect(registry.get('inspect-source')?.description).toContain('exists:false');
    expect(registry.get('apply-workspace-patch')?.inputSchema).toMatchObject({
      additionalProperties: false,
      properties: {
        patches: {
          items: {
            required: ['relativePath', 'patchedContent'],
            properties: {
              relativePath: { type: 'string' },
              baseSha256: { type: ['string', 'null'] },
              patchedContent: { type: 'string' },
            },
          },
        },
      },
    });
  });

  it('validates a bounded durable task ledger', async () => {
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: {} as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
    });
    const tool = registry.get('update-task-ledger');
    const context = {
      sessionId: 'ledger-session',
      requestId: 'ledger-request',
      toolCallId: 'ledger-call',
      workspacePath: '/workspace',
      signal: new AbortController().signal,
    };

    await expect(
      tool?.execute(
        {
          objective: 'Implement and verify the endpoint.',
          currentStepId: 'verify',
          steps: [
            { id: 'implement', description: 'Implement endpoint', status: 'completed' },
            { id: 'verify', description: 'Verify behavior', status: 'in-progress' },
          ],
        },
        context
      )
    ).resolves.toMatchObject({
      ok: true,
      output: {
        schemaVersion: 'workspai.studio-task-ledger.v1',
        currentStepId: 'verify',
      },
    });
    await expect(
      tool?.execute(
        {
          objective: 'Invalid duplicate ledger.',
          steps: [
            { id: 'same', description: 'First', status: 'pending' },
            { id: 'same', description: 'Second', status: 'pending' },
          ],
        },
        context
      )
    ).rejects.toThrow('invalid or duplicate step');
  });

  it('runs independent read-only batch operations concurrently while preserving result order', async () => {
    const started: string[] = [];
    let releaseSource!: () => void;
    let releaseSearch!: () => void;
    const sourceGate = new Promise<void>((resolve) => {
      releaseSource = resolve;
    });
    const searchGate = new Promise<void>((resolve) => {
      releaseSearch = resolve;
    });
    const host = {
      inspect: vi.fn(async () => {
        started.push('source');
        await sourceGate;
        return { ok: true, output: ['source-result'] };
      }),
      search: vi.fn(async () => {
        started.push('search');
        await searchGate;
        return { ok: true, output: ['search-result'] };
      }),
      diagnostics: vi.fn(async () => ({ ok: true, output: [] })),
    } as unknown as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'readiness',
      assistantMode: 'ask',
    });
    const execution = registry.get('inspect-workspace-batch')?.execute(
      {
        operations: [
          { id: 'source-first', kind: 'source', paths: ['src/index.ts'] },
          { id: 'search-second', kind: 'search', query: 'readiness' },
        ],
      },
      {
        sessionId: 'batch-session',
        requestId: 'batch-request',
        toolCallId: 'batch-tool',
        workspacePath: '/workspace',
        signal: new AbortController().signal,
      }
    );
    await vi.waitFor(() => expect(started).toEqual(['source', 'search']));
    releaseSearch();
    releaseSource();
    await expect(execution).resolves.toMatchObject({
      ok: true,
      changed: false,
      output: {
        concurrent: true,
        results: [
          { id: 'source-first', kind: 'source', result: { output: ['source-result'] } },
          { id: 'search-second', kind: 'search', result: { output: ['search-result'] } },
        ],
      },
    });
  });

  it('routes typed tool inputs through the workspace-scoped host', async () => {
    const host: StudioAgentWorkspaiToolHost = {
      discover: vi.fn(async () => ({ ok: true, output: { files: [] } })),
      inspect: vi.fn(async () => ({ ok: true })),
      search: vi.fn(async () => ({ ok: true, output: [] })),
      diagnostics: vi.fn(async () => ({ ok: true, output: { diagnostics: [] } })),
      inspectChanges: vi.fn(async () => ({ ok: true, output: { status: '', diff: '' } })),
      applyPatches: vi.fn(async () => ({ ok: true, changed: true })),
      deleteFiles: vi.fn(async () => ({ ok: true, changed: true })),
      runGovernedCommand: vi.fn(async () => ({ ok: true, changed: true })),
      runWorkspaceCommand: vi.fn(async () => ({ ok: true, changed: false })),
      inspectRemediationPlan: vi.fn(async () => ({ ok: true, output: { visibleSteps: [] } })),
      executeRemediationStep: vi.fn(async () => ({ ok: true, changed: true })),
      inspectDependencySecurity: vi.fn(async () => ({ ok: true, output: {} })),
      repairDependencySecurity: vi.fn(async () => ({ ok: true, changed: true })),
      upgradeDependencySecurity: vi.fn(async () => ({ ok: true, changed: true })),
      completeDependencyTransaction: vi.fn(async () => ({
        ok: true,
        changed: false,
        output: { closureReady: true },
      })),
      verify: vi.fn(async () => ({ ok: true, cardBlocking: false })),
    };
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'readiness',
      blockerSignature: 'blocked-v1',
      assistantMode: 'agent',
    });
    const context = {
      sessionId: 'session-1',
      requestId: 'request-1',
      toolCallId: 'tool-1',
      workspacePath: '/workspace',
      projectPath: '/workspace/web',
      signal: new AbortController().signal,
      reportProgress: vi.fn(async () => undefined),
    };

    await registry
      .get('discover-workspace-files')
      ?.execute({ glob: '**/*.ts', limit: 50 }, context);
    await registry.get('inspect-source')?.execute({ paths: ['src/index.ts'] }, context);
    await registry.get('search-workspace')?.execute({ query: 'readiness' }, context);
    await registry
      .get('inspect-workspace-diagnostics')
      ?.execute({ severities: ['error', 'warning'] }, context);
    await registry.get('inspect-workspace-changes')?.execute({ paths: ['src/index.ts'] }, context);
    await registry.get('apply-workspace-patch')?.execute(
      {
        patches: [
          {
            relativePath: 'src/index.ts',
            patchedContent: 'export {};',
          },
        ],
      },
      context
    );
    await registry.get('delete-workspace-files')?.execute({ paths: ['src/obsolete.ts'] }, context);
    await registry
      .get('run-governed-command')
      ?.execute({ commandId: 'workspaceReadiness' }, context);
    await registry.get('run-workspace-command')?.execute(
      {
        executable: 'npm',
        args: ['test'],
        cwd: 'web',
        purpose: 'test',
        timeoutMs: 90_000,
      },
      context
    );
    await registry.get('inspect-remediation-plan')?.execute({}, context);
    await registry.get('execute-remediation-step')?.execute({ stepId: 'dependency-sync' }, context);
    await registry.get('inspect-dependency-security')?.execute({ projectName: 'web' }, context);
    await registry.get('verify-blocker')?.execute({}, context);

    expect(host.discover).toHaveBeenCalledWith({
      glob: '**/*.ts',
      limit: 50,
      workspacePath: '/workspace',
      projectPath: '/workspace/web',
    });
    expect(host.inspect).toHaveBeenCalledWith({
      paths: ['src/index.ts'],
      kind: 'source',
      workspacePath: '/workspace',
      projectPath: '/workspace/web',
    });
    expect(host.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'readiness', workspacePath: '/workspace' })
    );
    expect(host.diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        severities: ['error', 'warning'],
        workspacePath: '/workspace',
      })
    );
    expect(host.inspectChanges).toHaveBeenCalledWith(
      expect.objectContaining({ paths: ['src/index.ts'], workspacePath: '/workspace' })
    );
    expect(host.applyPatches).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'tool-1',
        workspacePath: '/workspace',
        projectPath: '/workspace/web',
      })
    );
    expect(host.deleteFiles).toHaveBeenCalledWith({
      paths: ['src/obsolete.ts'],
      transactionId: 'tool-1',
      workspacePath: '/workspace',
      projectPath: '/workspace/web',
      reportProgress: context.reportProgress,
    });
    expect(host.runGovernedCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: 'workspaceReadiness',
        reportProgress: context.reportProgress,
      })
    );
    expect(host.runWorkspaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          executable: 'npm',
          args: ['test'],
          cwd: 'web',
          purpose: 'test',
          timeoutMs: 90_000,
        },
        workspacePath: '/workspace',
        projectPath: '/workspace/web',
        signal: context.signal,
        reportProgress: context.reportProgress,
      })
    );
    expect(host.inspectRemediationPlan).toHaveBeenCalledWith({
      workspacePath: '/workspace',
      projectPath: '/workspace/web',
    });
    expect(host.executeRemediationStep).toHaveBeenCalledWith({
      stepId: 'dependency-sync',
      workspacePath: '/workspace',
      projectPath: '/workspace/web',
      reportProgress: context.reportProgress,
    });
    expect(host.inspectDependencySecurity).toHaveBeenCalledWith({
      projectName: 'web',
      workspacePath: '/workspace',
      projectPath: '/workspace/web',
    });
    await registry.get('repair-dependency-security')?.execute({ projectName: 'web' }, context);
    await registry
      .get('upgrade-dependency-security')
      ?.execute({ projectName: 'web', packageName: 'postcss' }, context);
    await registry
      .get('complete-dependency-transaction')
      ?.execute({ projectNames: ['web'], changedPaths: ['web/package-lock.json'] }, context);
    expect(host.repairDependencySecurity).toHaveBeenCalled();
    expect(host.upgradeDependencySecurity).toHaveBeenCalled();
    expect(host.completeDependencyTransaction).toHaveBeenCalled();
    expect(host.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 'readiness',
        blockerSignature: 'blocked-v1',
      })
    );
  });

  it('routes bounded graph retrieval, ranged reads, and exact edits when supported', async () => {
    const graphSearch = vi.fn(async () => ({ ok: true, output: { matches: [] } }));
    const inspect = vi.fn(async () => ({ ok: true }));
    const applyTextEdits = vi.fn(async () => ({ ok: true, changed: true }));
    const host = {
      graphSearch,
      inspect,
      applyTextEdits,
    } as unknown as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
    });
    const context = {
      sessionId: 'session-1',
      requestId: 'request-1',
      toolCallId: 'tool-1',
      workspacePath: '/workspace',
      projectPath: '/workspace/api',
      signal: new AbortController().signal,
      reportProgress: vi.fn(async () => undefined),
    };

    await registry
      .get('query-workspace-graph')
      ?.execute({ query: 'authentication ownership', limit: 8 }, context);
    await registry
      .get('inspect-source')
      ?.execute({ paths: ['src/large.ts'], lineStart: 120, lineEnd: 180 }, context);
    await registry.get('apply-workspace-edits')?.execute(
      {
        edits: [
          {
            relativePath: 'src/large.ts',
            oldText: 'const before = true;',
            newText: 'const before = false;',
          },
        ],
      },
      context
    );

    expect(graphSearch).toHaveBeenCalledWith({
      query: 'authentication ownership',
      limit: 8,
      workspacePath: '/workspace',
      projectPath: '/workspace/api',
    });
    expect(inspect).toHaveBeenCalledWith({
      paths: ['src/large.ts'],
      kind: 'source',
      lineStart: 120,
      lineEnd: 180,
      workspacePath: '/workspace',
      projectPath: '/workspace/api',
    });
    expect(applyTextEdits).toHaveBeenCalledWith({
      edits: [
        {
          relativePath: 'src/large.ts',
          oldText: 'const before = true;',
          newText: 'const before = false;',
        },
      ],
      transactionId: 'tool-1',
      workspacePath: '/workspace',
      projectPath: '/workspace/api',
      reportProgress: context.reportProgress,
    });
  });

  it('rejects missing remediation step identity before reaching the host', async () => {
    const host = {} as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'readiness',
      assistantMode: 'agent',
    });
    await expect(
      registry.get('execute-remediation-step')?.execute(
        { stepId: '   ' },
        {
          sessionId: 'session-1',
          requestId: 'request-1',
          toolCallId: 'tool-1',
          workspacePath: '/workspace',
          signal: new AbortController().signal,
        }
      )
    ).rejects.toThrow('stepId is required');
  });

  it('exposes public web fetch and routes host/MCP tools through the host', async () => {
    const listHostTools = vi.fn(async () => ({
      ok: true,
      output: {
        schemaVersion: 'workspai.studio-host-tool-catalog.v1',
        tools: [{ name: 'mcp_browser_snapshot', readLike: true }],
      },
    }));
    const invokeHostTool = vi.fn(async () => ({
      ok: true,
      output: { text: 'Dashboard loaded' },
    }));
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: { listHostTools, invokeHostTool } as unknown as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
    });
    const context = {
      sessionId: 'host-session',
      requestId: 'host-request',
      toolCallId: 'host-call',
      workspacePath: '/workspace',
      signal: new AbortController().signal,
    };

    expect(registry.get('fetch-public-web')).toBeDefined();
    await expect(
      registry.get('invoke-host-tool')?.authorize?.({ name: 'mcp_browser_snapshot' }, context)
    ).resolves.toMatchObject({ risk: 'read' });
    await expect(
      registry
        .get('invoke-host-tool')
        ?.execute({ name: 'mcp_browser_snapshot', arguments: { fullPage: true } }, context)
    ).resolves.toMatchObject({ ok: true, output: { text: 'Dashboard loaded' } });
    expect(invokeHostTool).toHaveBeenCalledWith({
      name: 'mcp_browser_snapshot',
      arguments: { fullPage: true },
      signal: context.signal,
    });
  });
});
