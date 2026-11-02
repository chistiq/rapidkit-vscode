import crypto from 'node:crypto';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  studioWorkspaceIntelligenceReaders,
  type StudioIntelligenceReadRunner,
} from '../core/studioWorkspaceIntelligenceReads.js';
import { projectStudioGraphObservation } from '../core/studioGraphObservation.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_COMPLETE_TOOL_NAME,
} from '../core/studioAgentModelProtocol.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
const graph = {
  schemaVersion: 'workspace-knowledge-search.v1',
  graphSourceHash: 'a'.repeat(64),
  totalMatches: 30,
  truncated: true,
  entities: [{ id: 'file:handler', kind: 'file', label: 'handler.ts', proofIds: ['p1'] }],
  proofs: [{ id: 'p1', artifact: 'handler.ts', provider: 'source', trust: 'authoritative' }],
  budget: { omitted: { proofs: 3 } },
};
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-intelligence-'));
  roots.push(root);
  const workspace = path.join(root, 'team');
  const project = path.join(workspace, 'renamed-folder');
  const external = path.join(root, 'user-source');
  await fs.outputJSON(path.join(workspace, '.workspai/workspace.json'), { workspace_name: 'team' });
  await fs.outputJSON(path.join(workspace, '.workspai/workspace.contract.json'), {
    workspace: { name: 'team' },
    projects: [
      { slug: 'billing', relativePath: 'renamed-folder' },
      { slug: 'external-api', relativePath: 'external/external-api', externalPath: external },
    ],
  });
  await fs.outputFile(path.join(project, 'handler.ts'), 'export const authenticated = true;\n');
  await fs.outputJSON(path.join(external, '.workspai/project.json'), { name: 'external-api' });
  const normalize = async (value: string) => {
    const resolved = await fs.realpath(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  await fs.outputJSON(path.join(external, '.workspai/workspace-link.local.json'), {
    schemaVersion: 'project-workspace-link.v1',
    kind: 'workspai.project-workspace-link',
    generatedAt: new Date().toISOString(),
    state: 'active',
    workspace: {
      name: 'team',
      root: workspace,
      marker: '.workspai/workspace.json',
      contract: '.workspai/workspace.contract.json',
    },
    project: {
      name: 'external-api',
      relativePath: 'external/external-api',
      relationship: 'adopted',
    },
    integrity: {
      algorithm: 'sha256',
      binding: crypto
        .createHash('sha256')
        .update(
          [
            'team',
            await normalize(workspace),
            'external-api',
            await normalize(external),
            'external/external-api',
            'adopted',
          ].join('\0')
        )
        .digest('hex'),
    },
  });
  const run = vi.fn<StudioIntelligenceReadRunner>(async () => ({
    failed: false,
    exitCode: 0,
    result: graph,
  }));
  const readers = studioWorkspaceIntelligenceReaders(run);
  return { root, workspace, project, external, run, readers };
}

describe('Shared scoped Workspace Intelligence retrieval', () => {
  it.each(['ready', 'degraded', 'blocked'] as const)(
    'observes %s agent grounding without shell approval or making it a task failure',
    async (status) => {
      const f = await fixture();
      f.run.mockResolvedValueOnce({
        failed: status !== 'ready',
        exitCode: status === 'ready' ? 0 : 2,
        result: {
          schemaVersion: 'workspai.agent-bootstrap-receipt.v1',
          statusScope: 'agent-grounding',
          receiptId: 'a'.repeat(64),
          status,
          project: { name: 'billing' },
          workspace: { name: 'team', resolved: true },
          checks: [
            { id: 'member', status: 'passed' },
            { id: 'environment', status: 'warning' },
          ],
          nextActions: ['Inspect source'],
          integrity: {
            algorithm: 'sha256',
            payloadHash: 'b'.repeat(64),
            portable: true,
            absolutePathsEmitted: false,
          },
        },
      });
      const result = await f.readers.inspectProjectAgentEntry({
        workspacePath: f.workspace,
        project: 'billing',
      });
      expect(result).toMatchObject({
        ok: true,
        output: {
          groundingReady: status === 'ready',
          receipt: { status },
          coverage: { totalChecks: 2, passedChecks: 1 },
        },
      });
      expect(f.run.mock.calls[0][0]).toMatchObject({
        cwd: f.project,
        command: ['agent', 'bootstrap', '--for-agent', 'generic', '--strict', '--json'],
      });
      expect(f.run.mock.calls[0][0].command).not.toContain('--project');
    }
  );
  it('rejects foreign bootstrap receipts and unresolved project scope, and observes cancellation', async () => {
    const f = await fixture();
    expect(await f.readers.inspectProjectAgentEntry({ workspacePath: f.workspace })).toMatchObject({
      ok: false,
    });
    expect(f.run).not.toHaveBeenCalled();
    f.run.mockResolvedValueOnce({
      failed: false,
      exitCode: 0,
      result: {
        schemaVersion: 'workspai.agent-bootstrap-receipt.v1',
        status: 'ready',
        project: { name: 'foreign' },
      },
    });
    expect(
      await f.readers.inspectProjectAgentEntry({ workspacePath: f.workspace, project: 'billing' })
    ).toMatchObject({ ok: false });
    const abort = new AbortController();
    abort.abort();
    expect(
      await f.readers.inspectProjectAgentEntry({
        workspacePath: f.workspace,
        project: 'external-api',
        signal: abort.signal,
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining('cancelled') });
    expect(f.run).toHaveBeenCalledTimes(1);
  });
  it('selects a registered project from a workspace chat without changing mutation scope', async () => {
    const f = await fixture();
    f.run.mockResolvedValueOnce({
      failed: false,
      exitCode: 0,
      result: { schemaVersion: 1, scope: 'project', commandMap: {} },
    });
    expect(
      await f.readers.inspectProjectCommands({ workspacePath: f.workspace, project: 'billing' })
    ).toMatchObject({ ok: true });
    expect(f.run.mock.calls[0][0].cwd).toBe(f.project);
    expect(
      await f.readers.graphSearch({
        workspacePath: f.workspace,
        project: 'external-api',
        query: 'handler',
      })
    ).toMatchObject({ ok: true, output: { scope: 'project:external-api' } });
    expect(f.run.mock.calls[1][0].cwd).toBe(f.workspace);
    const calls = f.run.mock.calls.length;
    expect(
      await f.readers.inspectProjectCommands({ workspacePath: f.workspace, project: '../unknown' })
    ).toMatchObject({ ok: false });
    expect(
      await f.readers.inspectProjectCommands({
        workspacePath: f.workspace,
        projectPath: f.project,
        project: 'external-api',
      })
    ).toMatchObject({ ok: false });
    expect(f.run).toHaveBeenCalledTimes(calls);
  });
  it('uses canonical project identity instead of a renamed directory and retains Graph proof/coverage metadata', async () => {
    const f = await fixture();
    const result = await f.readers.graphSearch({
      workspacePath: f.workspace,
      projectPath: f.project,
      query: 'authentication endpoint',
    });
    expect(result).toMatchObject({
      ok: true,
      output: {
        scope: 'project:billing',
        coverage: {
          graphSourceHash: graph.graphSourceHash,
          totalMatches: 30,
          truncated: true,
          budget: graph.budget,
        },
        result: { proofs: graph.proofs },
        extensionProjection: { applied: false },
      },
    });
    expect(f.run.mock.calls[0][0]).toMatchObject({
      cwd: f.workspace,
      command: [
        'workspace',
        'graph',
        'search',
        'authentication endpoint',
        '--limit',
        '12',
        '--scope',
        'project:billing',
        '--json',
      ],
    });
    expect(JSON.stringify(f.run.mock.calls)).not.toContain('project:renamed-folder');
  });
  it('resolves an external adopted project as a project entry, not as its own workspace', async () => {
    const f = await fixture();
    expect(
      await f.readers.graphSearch({ workspacePath: f.external, query: 'handler' })
    ).toMatchObject({ ok: true, output: { scope: 'project:external-api' } });
    expect(f.run.mock.calls[0][0].cwd).toBe(f.workspace);
    await f.readers.graphSearch({
      workspacePath: f.external,
      query: 'dependencies',
      scope: 'workspace',
    });
    expect(f.run.mock.calls[1][0].command).not.toContain('--scope');
  });
  it.each(['entities', 'evidence', 'path'] as const)(
    'exposes bounded %s retrieval in the same CLI runtime',
    async (operation) => {
      const f = await fixture();
      const result = await f.readers.graphSearch({
        workspacePath: f.workspace,
        query: operation === 'entities' ? 'endpoint' : 'file:handler',
        operation,
        ...(operation === 'path' ? { target: 'database:orders' } : {}),
        limit: 5,
      });
      expect(result.ok).toBe(true);
      expect(f.run.mock.calls[0][0].command).toEqual([
        'workspace',
        'graph',
        operation,
        ...(operation === 'entities'
          ? ['--kind', 'endpoint']
          : operation === 'path'
            ? ['file:handler', 'database:orders']
            : ['file:handler']),
        '--limit',
        '5',
        '--json',
      ]);
    }
  );
  it('queries effective capabilities in the project, independently of global CLI or Core availability', async () => {
    const f = await fixture();
    f.run.mockResolvedValueOnce({
      failed: false,
      exitCode: 0,
      result: {
        schemaVersion: 1,
        scope: 'project',
        runtime: 'go',
        moduleSupport: false,
        commandMap: {
          test: { owner: 'runtime', status: 'supported' },
          modules: { owner: 'none', status: 'unsupported' },
        },
      },
    });
    expect(
      await f.readers.inspectProjectCommands({ workspacePath: f.workspace, projectPath: f.project })
    ).toMatchObject({
      ok: true,
      output: {
        authority: 'installed-project-capabilities',
        result: { moduleSupport: false, commandMap: { modules: { status: 'unsupported' } } },
      },
    });
    expect(f.run.mock.calls[0][0]).toMatchObject({
      cwd: f.project,
      command: ['project', 'commands', '--json'],
    });
    f.run.mockClear();
    expect(await f.readers.inspectProjectCommands({ workspacePath: f.workspace })).toMatchObject({
      ok: false,
    });
    expect(f.run).not.toHaveBeenCalled();
  });
  it('keeps failed and cancelled retrieval available for recovery without claiming completion or running setup', async () => {
    const f = await fixture();
    const empty = path.join(f.root, 'independent');
    await fs.ensureDir(empty);
    expect(await f.readers.graphSearch({ workspacePath: empty, query: 'auth' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('Use source search'),
    });
    expect(f.run).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    expect(
      await f.readers.graphSearch({
        workspacePath: f.workspace,
        query: 'auth',
        signal: controller.signal,
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining('cancelled') });
    expect(f.run).not.toHaveBeenCalled();
    const active = new AbortController();
    f.run.mockImplementationOnce(async (request) => {
      expect(request.signal).toBe(active.signal);
      active.abort();
      return { failed: false, exitCode: 0, result: graph };
    });
    expect(
      await f.readers.graphSearch({
        workspacePath: f.workspace,
        query: 'auth',
        signal: active.signal,
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining('cancelled') });
    expect(await fs.readdir(empty)).toEqual([]);
  });
  it('rejects unregistered projects and invalid operation bounds without calling the CLI', async () => {
    const f = await fixture();
    const unknown = path.join(f.workspace, 'not-registered');
    await fs.ensureDir(unknown);
    for (const request of [
      { projectPath: unknown },
      { limit: NaN },
      { limit: 51 },
      { operation: 'path' as const },
    ]) {
      expect(
        (await f.readers.graphSearch({ workspacePath: f.workspace, query: 'auth', ...request })).ok
      ).toBe(false);
    }
    expect(f.run).not.toHaveBeenCalled();
  });
  it('does not cache a previous graph verdict after source edits', async () => {
    const f = await fixture();
    await f.readers.graphSearch({ workspacePath: f.workspace, query: 'auth' });
    await fs.writeFile(path.join(f.project, 'handler.ts'), 'export const authenticated = false;\n');
    f.run.mockResolvedValueOnce({
      failed: false,
      exitCode: 0,
      result: { ...graph, graphSourceHash: 'b'.repeat(64) },
    });
    expect(
      await f.readers.graphSearch({ workspacePath: f.workspace, query: 'auth' })
    ).toMatchObject({ output: { coverage: { graphSourceHash: 'b'.repeat(64) } } });
    expect(f.run).toHaveBeenCalledTimes(2);
  });
  it('bounds large proof bodies without changing the CLI completeness verdict or original observations', () => {
    const large = {
      ...graph,
      truncated: false,
      proofs: Array.from({ length: 200 }, (_, index) => ({
        id: `p${index}`,
        artifact: 'handler.ts',
        quote: 'source context '.repeat(100),
      })),
    };
    const projected = projectStudioGraphObservation(large);
    expect(projected.result.truncated).toBe(false);
    expect(projected.projection.applied).toBe(true);
    expect(projected.projection.returnedChars).toBeLessThanOrEqual(16000);
    expect(projected.projection.omitted.proofs).toBeGreaterThan(0);
    expect(large.proofs).toHaveLength(200);
    expect(JSON.parse(JSON.stringify(projected.result)).entities).toEqual(graph.entities);
  });
  it.each(['ask', 'plan', 'agent', 'goal'] as const)(
    'provides the same read tools in %s without adding mutation permission',
    async (mode) => {
      const f = await fixture();
      const registry = createStudioAgentWorkspaiToolRegistry({
        host: f.readers as StudioAgentWorkspaiToolHost,
        cardId: `assistant:${mode}`,
        assistantMode: mode,
        executionAuthority: 'workspace',
      });
      const tool = registry.get('query-workspace-graph')!;
      expect(tool.risk).toBe('read');
      expect(registry.get('inspect-project-commands')?.risk).toBe('read');
      expect(registry.get('inspect-project-agent-entry')?.risk).toBe('read');
      expect(
        await tool.execute(
          { query: 'endpoint', operation: 'entities', limit: 3 },
          {
            workspacePath: f.workspace,
            projectPath: f.project,
            sessionId: 's',
            requestId: 'r',
            toolCallId: 't',
            signal: new AbortController().signal,
          }
        )
      ).toMatchObject({ ok: true });
    }
  );
  it.each(['ask', 'agent'] as const)(
    'continues from a failed optional Graph query to actual source and delivers an answer in %s',
    async (mode) => {
      const f = await fixture();
      f.run.mockResolvedValueOnce({
        failed: true,
        exitCode: 1,
        stderr: 'Graph provider unavailable',
      });
      const registry = createStudioAgentWorkspaiToolRegistry({
        host: {
          ...f.readers,
          inspect: async () => ({
            ok: true,
            output: [
              {
                path: 'handler.ts',
                content: await fs.readFile(path.join(f.project, 'handler.ts'), 'utf8'),
              },
            ],
          }),
        } as StudioAgentWorkspaiToolHost,
        assistantMode: mode,
        executionAuthority: 'workspace',
        cardId: `assistant:${mode}`,
      });
      let calls = 0;
      const adapter = new ContractStudioAgentModelAdapter(
        'Explain whether this handler requires authentication; do not change source.',
        async (_prompt, request) => {
          if (calls++ === 0)
            return {
              toolName: 'query-workspace-graph',
              input: { query: 'authentication handler' },
            };
          if (calls === 2) {
            expect(JSON.stringify(request.messages)).toContain('Graph provider unavailable');
            return { toolName: 'inspect-source', input: { paths: ['handler.ts'] } };
          }
          expect(JSON.stringify(request.messages)).toContain('authenticated = true');
          return {
            toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
            input: {
              summary:
                'The inspected source sets authenticated to true. Graph retrieval failed; no files were changed.',
            },
          };
        }
      );
      const result = await new StudioAgentSession(
        {
          workspacePath: f.workspace,
          projectPath: f.project,
          cardId: `assistant:${mode}`,
          assistantMode: mode,
          executionAuthority: 'workspace',
          workspaceTrusted: true,
          requiresVerifiedCompletion: false,
          permissionLevel: 'default',
        },
        adapter,
        registry,
        { save: async () => {} }
      ).run('Explain this handler');
      expect(result.status).toBe('completed');
      expect(calls).toBe(3);
      expect(result.events.some((event) => event.type === 'verify.completed')).toBe(false);
      expect(await fs.readFile(path.join(f.project, 'handler.ts'), 'utf8')).toBe(
        'export const authenticated = true;\n'
      );
    }
  );
});
