import crypto from 'node:crypto';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectStudioWorkspaceInventory } from '../core/studioWorkspaceInventory.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';
import {
  studioWorkspaceBindingTool,
  validateStudioCreatedWorkspaceTarget,
} from '../core/studioWorkspaceCreation.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-inventory-scope-'));
  roots.push(root);
  const workspace = path.join(root, 'team');
  const internal = path.join(workspace, 'api');
  const external = path.join(root, 'user-code', 'web');
  await fs.outputJSON(path.join(workspace, '.workspai/workspace.json'), {
    workspace_name: 'team-system',
  });
  const contractPath = path.join(workspace, '.workspai/workspace.contract.json');
  await fs.outputJSON(contractPath, {
    workspace: { name: 'team-system' },
    projects: [
      { slug: 'api', relativePath: 'api' },
      { slug: 'web', relativePath: 'external/web', externalPath: external },
    ],
  });
  await fs.outputJSON(path.join(internal, '.workspai/project.json'), { name: 'api' });
  await fs.outputJSON(path.join(external, '.workspai/project.json'), { name: 'web' });
  await fs.outputFile(path.join(external, 'src/app.py'), '# user source stays here\n');
  const normalize = async (value: string) => {
    const resolved = await fs.realpath(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const link = {
    schemaVersion: 'project-workspace-link.v1',
    kind: 'workspai.project-workspace-link',
    generatedAt: new Date().toISOString(),
    state: 'active',
    workspace: {
      name: 'team-system',
      root: workspace,
      marker: '.workspai/workspace.json',
      contract: '.workspai/workspace.contract.json',
    },
    project: { name: 'web', relativePath: 'external/web', relationship: 'adopted' },
    integrity: {
      algorithm: 'sha256',
      binding: crypto
        .createHash('sha256')
        .update(
          [
            'team-system',
            await normalize(workspace),
            'web',
            await normalize(external),
            'external/web',
            'adopted',
          ].join('\0')
        )
        .digest('hex'),
    },
  };
  const linkPath = path.join(external, '.workspai/workspace-link.local.json');
  await fs.writeJSON(linkPath, link);
  return { root, workspace, internal, external, contractPath, linkPath, link };
}

describe('Assistant workspace versus project ownership', () => {
  it('checks the selected project signature instead of an unrelated open workspace', async () => {
    const f = await fixture();
    const unrelated = path.join(f.root, 'unrelated');
    await fs.ensureDir(unrelated);
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: {} as StudioAgentWorkspaiToolHost,
      cardId: 'assistant:agent',
      assistantMode: 'agent',
    });
    const result = await registry.get('inspect-workspace')!.execute(
      {},
      {
        workspacePath: unrelated,
        projectPath: f.external,
        sessionId: 's',
        requestId: 'r',
        toolCallId: 't',
        signal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      ok: true,
      output: {
        workspaiSignature: { path: '.workspai', status: 'present' },
        onboardingAdvice: 'continue-managed',
        workspace: { path: f.workspace },
      },
    });
    expect(await fs.readdir(unrelated)).toEqual([]);
  });

  it('distinguishes absent metadata from a bare directory without claiming ownership or offering adoption again', async () => {
    const f = await fixture();
    const source = path.join(f.root, 'independent');
    await fs.ensureDir(source);
    expect(await inspectStudioWorkspaceInventory(source)).toMatchObject({
      workspaiSignature: { status: 'absent' },
      management: 'unmanaged',
      onboardingAdvice: 'offer-optional-adoption',
    });
    await fs.ensureDir(path.join(source, '.workspai'));
    expect(await inspectStudioWorkspaceInventory(source)).toMatchObject({
      workspaiSignature: { status: 'present' },
      management: 'unmanaged',
      onboardingAdvice: 'inspect-existing-metadata',
    });
    expect(await fs.readdir(path.join(source, '.workspai'))).toEqual([]);
  });

  it('recognizes registered parent and legacy ownership even without a local signature', async () => {
    const f = await fixture();
    await fs.remove(path.join(f.internal, '.workspai'));
    expect(await inspectStudioWorkspaceInventory(f.internal)).toMatchObject({
      workspaiSignature: { status: 'absent' },
      management: 'workspai',
      onboardingAdvice: 'continue-managed',
      scope: { kind: 'project' },
    });
    const legacy = path.join(f.root, 'legacy');
    await fs.outputJSON(path.join(legacy, '.rapidkit/workspace.json'), {
      workspace_name: 'legacy',
    });
    expect(await inspectStudioWorkspaceInventory(legacy)).toMatchObject({
      workspaiSignature: { status: 'absent' },
      management: 'workspai',
      onboardingAdvice: 'continue-managed',
    });
  });

  it('does not treat a file or corrupt signature as permission to re-adopt', async () => {
    const f = await fixture();
    const source = path.join(f.root, 'invalid');
    await fs.outputFile(path.join(source, '.workspai'), 'not a directory');
    expect(await inspectStudioWorkspaceInventory(source)).toMatchObject({
      workspaiSignature: { status: 'invalid' },
      management: 'unknown',
      onboardingAdvice: 'inspect-existing-metadata',
    });
    await fs.remove(path.join(source, '.workspai'));
    await fs.outputFile(path.join(source, '.workspai/workspace.json'), '{broken');
    expect(await inspectStudioWorkspaceInventory(source)).toMatchObject({
      workspaiSignature: { status: 'present' },
      management: 'unknown',
      onboardingAdvice: 'inspect-existing-metadata',
    });
  });

  it.skipIf(process.platform === 'win32')(
    'does not follow a symbolic-link signature as verified ownership',
    async () => {
      const f = await fixture();
      const source = path.join(f.root, 'linked-signature');
      await fs.ensureDir(source);
      await fs.symlink(path.join(f.workspace, '.workspai'), path.join(source, '.workspai'));
      expect(await inspectStudioWorkspaceInventory(source)).toMatchObject({
        workspaiSignature: { status: 'invalid' },
        management: 'unknown',
        onboardingAdvice: 'inspect-existing-metadata',
      });
    }
  );
  it('selects the canonical workspace through an external project entry without assuming the managed directory', async () => {
    const f = await fixture();
    const context = {
      workspacePath: f.external,
      sessionId: 's',
      requestId: 'r',
      toolCallId: 't',
      signal: new AbortController().signal,
    };
    const tool = studioWorkspaceBindingTool({
      managedHome: path.join(f.root, 'different-managed-home'),
    });
    const request = { projectPath: '.' };
    const auth = await tool.authorize!(request, context);
    expect(auth.approval?.cwd).toBe(f.workspace);
    const result = await tool.execute(request, {
      ...context,
      approval: {
        fingerprint: auth.approval!.fingerprint,
        approvedBy: 'user',
        approvedAt: new Date().toISOString(),
      },
    });
    expect(result.executionTarget).toMatchObject({
      name: 'team-system',
      workspacePath: f.workspace,
      location: { kind: 'custom' },
    });
    await validateStudioCreatedWorkspaceTarget(result.executionTarget!);
    expect(await fs.pathExists(path.join(f.workspace, 'web'))).toBe(false);
    await fs.writeJSON(f.linkPath, {
      ...f.link,
      integrity: { algorithm: 'sha256', binding: '0'.repeat(64) },
    });
    await expect(tool.authorize!(request, context)).rejects.toThrow('no verified canonical');
  });
  it('resolves an adopted external project and nested source entry without moving source or switching execution permissions', async () => {
    const f = await fixture();
    const output = await inspectStudioWorkspaceInventory(path.join(f.external, 'src'));
    expect(output).toMatchObject({
      workspace: { name: 'team-system', path: f.workspace },
      management: 'workspai',
      projectCount: 2,
      scope: {
        kind: 'project',
        resolution: 'local-link',
        projectPath: f.external,
        projectName: 'web',
        executionScopeChanged: false,
      },
    });
    expect(output.projects.find((project) => project.name === 'web')?.path).toBe(f.external);
    expect(await fs.readFile(path.join(f.external, 'src/app.py'), 'utf8')).toContain(
      'user source stays here'
    );
    expect(await fs.pathExists(path.join(f.workspace, 'web'))).toBe(false);
  });
  it('uses parent ownership before a local link and reports the internal project separately', async () => {
    const f = await fixture();
    await fs.outputJSON(path.join(f.internal, '.workspai/workspace-link.local.json'), {
      malformed: true,
    });
    const output = await inspectStudioWorkspaceInventory(f.internal);
    expect(output).toMatchObject({
      workspace: { path: f.workspace },
      scope: { resolution: 'parent', kind: 'project', projectPath: f.internal },
    });
    expect((await inspectStudioWorkspaceInventory(f.workspace)).scope).toMatchObject({
      kind: 'workspace',
      resolution: 'self',
    });
  });
  it.each(['digest', 'membership', 'malformed', 'schema', 'symlink'] as const)(
    'reports %s failure as unresolved ownership, never an empty workspace or a reason to adopt again',
    async (failure) => {
      const f = await fixture();
      if (failure === 'digest') {
        await fs.writeJSON(f.linkPath, {
          ...f.link,
          integrity: { algorithm: 'sha256', binding: '0'.repeat(64) },
        });
      }
      if (failure === 'membership') {
        await fs.writeJSON(f.contractPath, {
          workspace: { name: 'team-system' },
          projects: [{ slug: 'api', relativePath: 'api' }],
        });
      }
      if (failure === 'malformed') {
        await fs.writeJSON(f.linkPath, { workspace: { root: f.workspace } });
      }
      if (failure === 'schema') {
        await fs.writeJSON(f.linkPath, { ...f.link, inventedAuthority: 'approved' });
      }
      if (failure === 'symlink') {
        await fs.remove(f.linkPath);
        await fs.symlink(f.contractPath, f.linkPath);
      }
      const output = await inspectStudioWorkspaceInventory(f.external);
      expect(output).toMatchObject({
        workspace: null,
        management: 'unknown',
        completeness: 'unresolved-ownership',
        scope: { resolution: 'unresolved' },
      });
      expect('projectCount' in output).toBe(false);
      expect(output.instruction).toContain('not an empty or unmanaged workspace');
    }
  );
  it('keeps the contract authoritative when a stale imported registry has extra entries', async () => {
    const f = await fixture();
    await fs.outputJSON(path.join(f.workspace, '.workspai/imported-projects.json'), {
      projects: [
        {
          name: 'stale',
          path: 'stale',
          stack: 'unknown',
          confidence: 'high',
          importedAt: new Date().toISOString(),
        },
      ],
    });
    const output = await inspectStudioWorkspaceInventory(f.workspace);
    expect(output.projectCount).toBe(2);
    expect(output.projects.map((project) => project.name)).toEqual(['api', 'web']);
  });
});
