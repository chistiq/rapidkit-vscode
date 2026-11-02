import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readStudioWorkspaiEvidence,
  studioProjectDocsTool,
} from '../core/studioProjectReadTools.js';
import { inspectStudioAgentFiles } from '../core/sidebarStudioAgentRuntime.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';
import type { StudioAgentToolContext } from '../core/studioAgentToolRegistry.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-read-tools-'));
  roots.push(root);
  const workspace = path.join(root, 'workspace');
  const project = path.join(workspace, 'web');
  await fs.outputJSON(path.join(workspace, '.workspai/workspace.json'), {
    workspace_name: 'sample',
  });
  await fs.outputJSON(path.join(workspace, '.workspai/workspace.contract.json'), {
    workspace: { name: 'sample' },
    projects: [{ slug: 'frontend', relativePath: 'web' }],
  });
  await fs.outputJSON(path.join(project, 'package.json'), { name: 'web' });
  const context = {
    workspacePath: workspace,
    sessionId: 'test',
    signal: new AbortController().signal,
  } as StudioAgentToolContext;
  return { root, workspace, project, context };
}
describe('Scoped evidence and dependency documentation', () => {
  it('discovers newly created evidence at the current destination and reads project metadata without granting source mutation', async () => {
    const f = await fixture();
    const input = { workspacePath: f.workspace, project: 'frontend' };
    expect((await readStudioWorkspaiEvidence(input)).documents).not.toContain(
      'project:.workspai/agent-entry.v1.json'
    );
    await fs.outputJSON(path.join(f.project, '.workspai/agent-entry.v1.json'), { project: 'web' });
    await fs.outputJSON(path.join(f.project, '.workspai/reports/project-context-agent.json'), {
      generation: 1,
    });
    expect((await readStudioWorkspaiEvidence(input)).documents).toContain(
      'project:.workspai/agent-entry.v1.json'
    );
    const first = await readStudioWorkspaiEvidence({
      ...input,
      paths: ['project:.workspai/reports/project-context-agent.json'],
    });
    expect(first.observations?.[0].content).toContain('1');
    await fs.outputJSON(path.join(f.project, '.workspai/reports/project-context-agent.json'), {
      generation: 2,
    });
    expect(
      (
        await readStudioWorkspaiEvidence({
          workspacePath: f.workspace,
          paths: ['web/.workspai/reports/project-context-agent.json'],
        })
      ).observations?.[0].content
    ).toContain('2');
    expect(
      await readStudioWorkspaiEvidence({
        ...input,
        paths: ['project:.workspai/reports/missing-context.json'],
      })
    ).toMatchObject({ observations: [{ exists: false }] });
    await expect(
      inspectStudioAgentFiles({
        workspacePath: f.workspace,
        kind: 'source',
        paths: ['web/.workspai/reports/project-context-agent.json'],
      })
    ).rejects.toThrow('not authorized');
    const next = await fixture();
    await fs.outputJSON(path.join(next.workspace, '.workspai/reports/INDEX.json'), {
      destination: 'new',
    });
    expect(
      (
        await readStudioWorkspaiEvidence({
          workspacePath: next.workspace,
          paths: ['.workspai/reports/INDEX.json'],
        })
      ).observations?.[0].content
    ).toContain('new');
  });
  it('rejects traversal, private state and escaping symlinks without widening a governed evidence allowlist', async () => {
    const f = await fixture();
    await fs.outputFile(path.join(f.root, 'private.json'), 'private');
    await fs.outputFile(path.join(f.workspace, '.workspai/reports/secrets.json'), 'private');
    await fs.outputFile(path.join(f.workspace, '.env'), 'PRIVATE_KEY=value');
    await fs.symlink(
      path.join(f.workspace, '.env'),
      path.join(f.workspace, '.workspai/reports/internal-link.json')
    );
    await fs.ensureDir(path.join(f.workspace, '.workspai/reports'));
    await fs.symlink(
      path.join(f.root, 'private.json'),
      path.join(f.workspace, '.workspai/reports/leak.json')
    );
    for (const locator of [
      '../private.json',
      '.workspai/cache/private.json',
      '.workspai/reports/secrets.json',
      '.workspai/reports/internal-link.json',
      '.workspai/reports/leak.json',
      '.env',
      'project:.workspai/reports/no.json',
    ]) {
      await expect(
        readStudioWorkspaiEvidence({ workspacePath: f.workspace, paths: [locator] })
      ).rejects.toThrow();
    }
    const host = {
      inspect: async () => {
        throw new Error('original allowlist');
      },
    } as unknown as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'goal',
      assistantMode: 'goal',
      executionAuthority: 'workspai-cli',
    });
    await expect(
      registry
        .get('inspect-evidence')!
        .execute({ paths: ['.workspai/reports/INDEX.json'] }, f.context)
    ).rejects.toThrow('original allowlist');
  });
  it('pages UTF-8 evidence losslessly and excludes large, binary or invalid-offset documents', async () => {
    const f = await fixture();
    const content = '\u06af'.repeat(7000);
    const locator = '.workspai/reports/context.md';
    await fs.outputFile(path.join(f.workspace, locator), content);
    const first = (
      await readStudioWorkspaiEvidence({ workspacePath: f.workspace, paths: [locator] })
    ).observations![0];
    let restored = first.content;
    let nextOffset = first.nextOffset;
    while (nextOffset !== null) {
      const next = (
        await readStudioWorkspaiEvidence({
          workspacePath: f.workspace,
          paths: [locator],
          offset: nextOffset,
        })
      ).observations![0];
      restored += next.content;
      nextOffset = next.nextOffset;
    }
    expect(restored).toBe(content);
    for (const name of ['a', 'b', 'c'])
      await fs.outputFile(path.join(f.workspace, `.workspai/reports/${name}.md`), 'x'.repeat(4000));
    const bounded = await readStudioWorkspaiEvidence({
      workspacePath: f.workspace,
      paths: ['a', 'b', 'c'].map((name) => `.workspai/reports/${name}.md`),
    });
    expect(JSON.stringify(bounded).length).toBeLessThan(12000);
    expect(bounded.omittedPaths).toContain('.workspai/reports/c.md');
    await expect(
      readStudioWorkspaiEvidence({ workspacePath: f.workspace, paths: [locator], offset: -1 })
    ).rejects.toThrow();
    await fs.writeFile(path.join(f.workspace, locator), Buffer.from([0]));
    await expect(
      readStudioWorkspaiEvidence({ workspacePath: f.workspace, paths: [locator] })
    ).rejects.toThrow('not text');
  });
  it('provides useful alternatives for skipped installation and reads installed Next.js docs without exposing them as editable source', async () => {
    const f = await fixture();
    expect(
      await studioProjectDocsTool.execute({ project: 'frontend', package: 'next' }, f.context)
    ).toMatchObject({ ok: true, output: { available: false, reason: 'dependency-not-installed' } });
    const guide = 'dist/docs/app/guide.mdx';
    await fs.outputFile(path.join(f.project, 'node_modules/next', guide), 'Current API guide');
    expect(
      await studioProjectDocsTool.execute({ project: 'frontend', package: 'next' }, f.context)
    ).toMatchObject({ ok: true, output: { available: true, documents: [guide] } });
    expect(
      await studioProjectDocsTool.execute(
        { project: 'frontend', package: 'next', path: guide },
        f.context
      )
    ).toMatchObject({ ok: true, output: { content: 'Current API guide' } });
    await expect(
      inspectStudioAgentFiles({
        workspacePath: f.project,
        kind: 'source',
        paths: [`node_modules/next/${guide}`],
      })
    ).rejects.toThrow('not authorized');
    await expect(
      studioProjectDocsTool.execute(
        { project: 'frontend', package: 'next', path: 'package.json' },
        f.context
      )
    ).rejects.toThrow('documentation');
    await expect(
      studioProjectDocsTool.execute({ project: 'frontend', package: '../private' }, f.context)
    ).rejects.toThrow();
    await fs.outputFile(path.join(f.root, 'secret.md'), 'private');
    await fs.symlink(
      path.join(f.root, 'secret.md'),
      path.join(f.project, 'node_modules/next/dist/docs/leak.md')
    );
    await expect(
      studioProjectDocsTool.execute(
        { project: 'frontend', package: 'next', path: 'dist/docs/leak.md' },
        f.context
      )
    ).rejects.toThrow('outside');
  });
  it('shares read tools across modes, preserves bundled provenance and honors cancellation', async () => {
    const f = await fixture();
    for (const mode of ['ask', 'plan', 'agent', 'goal'] as const) {
      const registry = createStudioAgentWorkspaiToolRegistry({
        host: {} as StudioAgentWorkspaiToolHost,
        cardId: 'test',
        assistantMode: mode,
        executionAuthority: 'workspace',
      });
      expect(registry.get('inspect-project-docs')).toBeDefined();
      expect(
        await registry
          .get('inspect-cli-commands')!
          .execute({ topic: 'architecture', source: 'installed' }, f.context)
      ).toMatchObject({ ok: true, output: { source: 'bundled-create-contract' } });
      expect(await registry.get('inspect-evidence')!.execute({}, f.context)).toMatchObject({
        ok: true,
      });
    }
    const controller = new AbortController();
    controller.abort();
    await expect(
      readStudioWorkspaiEvidence({ workspacePath: f.workspace, signal: controller.signal })
    ).rejects.toThrow('cancelled');
  });
  it('retains successful source reads when another requested path needs a different reader', async () => {
    const f = await fixture();
    const host = {
      inspect: (request: Parameters<typeof inspectStudioAgentFiles>[0]) =>
        inspectStudioAgentFiles(request).then((output) => ({ ok: true, output })),
    } as unknown as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'test',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
    });
    const result = await registry
      .get('inspect-source')!
      .execute(
        { paths: ['web/package.json', 'web/.workspai/reports/project-context-agent.json'] },
        f.context
      );
    expect(result).toMatchObject({
      ok: true,
      output: {
        files: [{ path: 'web/package.json', exists: true }],
        failures: [
          {
            path: 'web/.workspai/reports/project-context-agent.json',
            error: expect.stringContaining('inspect-evidence'),
          },
        ],
      },
    });
    const independent = path.join(f.root, 'independent');
    await fs.outputJSON(path.join(independent, 'package.json'), { name: 'unmanaged' });
    await fs.outputFile(path.join(independent, 'node_modules/next/docs/guide.md'), 'Current guide');
    expect(
      await studioProjectDocsTool.execute(
        { package: 'next', path: 'docs/guide.md' },
        { ...f.context, workspacePath: independent }
      )
    ).toMatchObject({ ok: true, output: { content: 'Current guide' } });
  });
});
