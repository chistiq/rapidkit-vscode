import { describe, expect, it, vi } from 'vitest';

import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';

describe('Studio Agent Workspai tool registry', () => {
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
      'discover-workspace-files',
      'inspect-source',
      'inspect-evidence',
      'search-workspace',
      'inspect-workspace-diagnostics',
      'inspect-workspace-changes',
      'apply-workspace-patch',
      'run-governed-command',
      'delete-workspace-files',
      'run-workspace-command',
      'inspect-remediation-plan',
      'execute-remediation-step',
      'inspect-dependency-security',
      'verify-blocker',
    ]);
    const commandTool = registry.get('run-governed-command');
    expect(commandTool?.inputSchema).toMatchObject({
      properties: {
        commandId: {
          enum: expect.arrayContaining(['workspaceIntelligenceChain', 'workspaceWatch']),
        },
      },
    });
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
    expect(host.runWorkspaceCommand).toHaveBeenCalledWith({
      request: {
        executable: 'npm',
        args: ['test'],
        cwd: 'web',
        purpose: 'test',
        timeoutMs: 90_000,
      },
      workspacePath: '/workspace',
      projectPath: '/workspace/web',
    });
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
    expect(registry.get('repair-dependency-security')).toBeUndefined();
    expect(registry.get('upgrade-dependency-security')).toBeUndefined();
    expect(registry.get('complete-dependency-transaction')).toBeUndefined();
    expect(host.repairDependencySecurity).not.toHaveBeenCalled();
    expect(host.upgradeDependencySecurity).not.toHaveBeenCalled();
    expect(host.completeDependencyTransaction).not.toHaveBeenCalled();
    expect(host.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 'readiness',
        blockerSignature: 'blocked-v1',
      })
    );
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
});
