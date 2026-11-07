import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStudioProjectTarget,
  resolveStudioProjectCandidates,
  studioProjectSelectionTool,
  validateStudioExecutionTarget,
} from '../core/studioProjectTarget.js';
import { studioProjectOnboardingTool } from '../core/studioProjectOnboarding.js';
import {
  StudioAgentToolRegistry,
  type StudioAgentToolContext,
} from '../core/studioAgentToolRegistry.js';
import { StudioAgentSession, type StudioAgentModelAction } from '../core/studioAgentSession.js';
import {
  collectAssistantUserPaths,
  redactAssistantRequestForConsumer,
} from '../core/consumerPathRedaction.js';
import {
  configureStudioNativeStorage,
  createStudioNativeWorkspaceCapabilities,
} from '../core/studioNativeWorkspace.js';
import { studioActivityReceipt } from '../contracts/studioActivity.js';
import { studioAgentExecutionEvidence } from '../core/studioAgentExecutionEvidence.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-external-project-'));
  roots.push(root);
  const ideRoot = path.join(root, 'InWork');
  const selected = path.join(root, 'selected-workspace');
  const source = path.join(ideRoot, 'Reference/knowledge-catalog');
  const home = path.join(root, 'user-home');
  await fs.ensureDir(selected);
  await fs.outputFile(path.join(source, 'source.mjs'), 'export const answer = 42;\n');
  const context: StudioAgentToolContext = {
    sessionId: 'chat',
    requestId: 'r',
    toolCallId: 't',
    workspacePath: selected,
    signal: new AbortController().signal,
  };
  return { root, ideRoot, selected, source, home, context };
}
async function registered(
  workspace: string,
  source: string,
  name: string,
  relationship: 'adopted' | 'imported'
) {
  const workspaceName = path.basename(workspace);
  await fs.outputJSON(path.join(workspace, '.workspai/workspace.json'), {
    workspace_name: workspaceName,
  });
  const relativePath = relationship === 'adopted' ? `external/${name}` : name;
  await fs.outputJSON(path.join(workspace, '.workspai/workspace.contract.json'), {
    workspace: { name: workspaceName },
    projects: [
      { name, relativePath, ...(relationship === 'adopted' ? { externalPath: source } : {}) },
    ],
  });
  await fs.outputJSON(path.join(source, '.workspai/project.json'), { name });
  const normalize = (value: string) => (process.platform === 'win32' ? value.toLowerCase() : value);
  await fs.outputJSON(path.join(source, '.workspai/workspace-link.local.json'), {
    schemaVersion: 'project-workspace-link.v1',
    kind: 'workspai.project-workspace-link',
    generatedAt: new Date().toISOString(),
    state: 'active',
    workspace: {
      name: workspaceName,
      root: workspace,
      marker: '.workspai/workspace.json',
      contract: '.workspai/workspace.contract.json',
    },
    project: { name, relativePath, relationship },
    integrity: {
      algorithm: 'sha256',
      binding: crypto
        .createHash('sha256')
        .update(
          [
            workspaceName,
            normalize(workspace),
            name,
            normalize(source),
            relativePath,
            relationship,
          ].join('\0')
        )
        .digest('hex'),
    },
  });
}
function onboarding(
  f: Awaited<ReturnType<typeof fixture>>,
  behavior: 'normal' | 'fail' | 'wrong-receipt' | 'new-instructions' = 'normal'
) {
  const calls: Array<{ args: string[]; cwd: string }> = [];
  const tool = studioProjectOnboardingTool({
    home: f.home,
    run: async ({ args, cwd }) => {
      calls.push({ args, cwd });
      if (args[0] === 'create') {
        await fs.outputJSON(
          path.join(args[args.indexOf('--output') + 1], args[2], '.workspai/workspace.json'),
          { workspace_name: args[2] }
        );
        return { exitCode: 0 };
      }
      if (behavior === 'fail') return { exitCode: 1, stderr: 'CLI rejected this project' };
      const workspace = args[args.indexOf('--workspace') + 1];
      const name = args[args.indexOf('--name') + 1];
      const source = args[0] === 'adopt' ? args[1] : path.join(workspace, name);
      if (args[0] === 'import') await fs.copy(args[1], source);
      await registered(workspace, source, name, args[0] === 'adopt' ? 'adopted' : 'imported');
      if (behavior === 'new-instructions')
        await fs.outputFile(
          path.join(source, 'AGENTS.md'),
          'New onboarding instructions: inspect the agent entry before source changes.'
        );
      const receipt = {
        workspacePath: workspace,
        [args[0] === 'adopt' ? 'adoptedProject' : 'importedProject']: { path: source },
        plan: {
          schemaVersion: 'workspai.ingestion-plan.v1',
          action: `${args[0]}-project`,
          mode: args[0] === 'adopt' ? 'link' : 'copy',
          source: args[1],
          targetWorkspace: workspace,
          destination: behavior === 'wrong-receipt' ? '/wrong' : source,
        },
      };
      return {
        exitCode: 0,
        stdout: `${JSON.stringify({ event: 'run.started' })}\n${JSON.stringify(receipt, null, 2)}\n${JSON.stringify({ event: 'run.completed' })}`,
      };
    },
  });
  return { tool, calls };
}
async function approve(
  tool: ReturnType<typeof studioProjectOnboardingTool>,
  raw: unknown,
  context: StudioAgentToolContext
) {
  const authorization = await tool.authorize!(raw, context);
  expect(authorization.risk).toBe('invasive');
  return {
    ...context,
    approval: {
      fingerprint: authorization.approval!.fingerprint,
      approvedBy: 'user',
      approvedAt: new Date().toISOString(),
    },
  };
}

describe('External project resolution independent of Workspai membership', () => {
  it('resolves a pasted shell prompt as an explicitly requested source without another selection approval', async () => {
    const f = await fixture();
    const paths = collectAssistantUserPaths('InWork/Reference/knowledge-catalog$ make dev-setup');
    expect(paths).toEqual(['InWork/Reference/knowledge-catalog']);
    expect(collectAssistantUserPaths('Edit "Reference/project$"')).toEqual(['Reference/project$']);
    expect(collectAssistantUserPaths('Edit Reference/project$')).toEqual(['Reference/project$']);
    expect(collectAssistantUserPaths('Edit Reference/project$ now')).toEqual([
      'Reference/project$',
    ]);
    const absolutePrompt = `${f.source}$ make dev-setup`;
    expect(
      redactAssistantRequestForConsumer(absolutePrompt, collectAssistantUserPaths(absolutePrompt))
    ).toBe(absolutePrompt);
    const tool = studioProjectSelectionTool({ ideRoots: [f.ideRoot] });
    const context = { ...f.context, userRequestedPaths: paths };
    expect((await tool.authorize!({ projectPath: paths[0] }, context)).risk).toBe('read');
    const result = await tool.execute({ projectPath: paths[0] }, context);
    expect(result.output).toMatchObject({
      inventory: { management: 'unmanaged' },
      onboarding: {
        optional: true,
        toolName: 'onboard-project',
        input: { operation: 'adopt', offer: true },
      },
    });
    expect(await fs.readdir(f.source)).toEqual(['source.mjs']);
    const declined = await tool.execute(
      { projectPath: paths[0] },
      {
        ...context,
        declinedProjectOnboarding: [f.source],
      }
    );
    expect(declined.output).not.toHaveProperty('onboarding');
  });
  it('captures genuine relative project locators, including quoted spaces, without capturing URLs', () => {
    expect(
      collectAssistantUserPaths(
        'Edit InWork/Reference/knowledge-catalog and "Reference/project with spaces"; see https://example.test/docs.'
      )
    ).toEqual(['Reference/project with spaces', 'InWork/Reference/knowledge-catalog']);
    expect(collectAssistantUserPaths('Edit ./Reference/knowledge-catalog')).toEqual([
      './Reference/knowledge-catalog',
    ]);
  });
  it('resolves both IDE-relative and IDE-folder-prefixed locators outside the selected Workspai workspace', async () => {
    const f = await fixture();
    for (const locator of [
      'Reference/knowledge-catalog',
      'InWork/Reference/knowledge-catalog',
      f.source,
    ]) {
      expect(await resolveStudioProjectCandidates(locator, f.context, [f.ideRoot])).toEqual([
        f.source,
      ]);
      const tool = studioProjectSelectionTool({ ideRoots: [f.ideRoot] });
      const context = { ...f.context, userRequestedPaths: [locator] };
      expect((await tool.authorize!({ projectPath: locator }, context)).risk).toBe('read');
      const result = await tool.execute({ projectPath: locator }, context);
      expect(result.executionTarget).toMatchObject({ kind: 'project', workspacePath: f.source });
      expect(result.output).toMatchObject({ inventory: { management: 'unmanaged' } });
      await validateStudioExecutionTarget(result.executionTarget!);
    }
    expect(await fs.readdir(f.selected)).toEqual([]);
    expect(await fs.readdir(f.source)).toEqual(['source.mjs']);
  });
  it('returns a real ambiguity instead of choosing the first root or an unrelated registered project', async () => {
    const f = await fixture();
    const second = path.join(f.root, 'second');
    await fs.ensureDir(path.join(second, 'Reference/knowledge-catalog'));
    const tool = studioProjectSelectionTool({ ideRoots: [f.ideRoot, second] });
    const result = await tool.execute(
      { projectPath: 'Reference/knowledge-catalog' },
      { ...f.context, userRequestedPaths: ['Reference/knowledge-catalog'] }
    );
    expect(result).toMatchObject({
      ok: false,
      output: {
        code: 'project-path-ambiguous',
        candidates: [f.source, path.join(second, 'Reference/knowledge-catalog')],
      },
    });
    expect(result.executionTarget).toBeUndefined();
    const choice = (result.output as { candidateChoices: Array<{ ref: string; label: string }> })
      .candidateChoices[1];
    expect(choice.label).toContain('second');
    const selected = { projectPath: 'Reference/knowledge-catalog', candidateRef: choice.ref };
    const context = { ...f.context, userRequestedPaths: ['Reference/knowledge-catalog'] };
    expect((await tool.authorize!(selected, context)).risk).toBe('invasive');
    const chosen = await tool.execute(selected, await approve(tool, selected, context));
    expect(chosen.executionTarget?.workspacePath).toBe(
      path.join(second, 'Reference/knowledge-catalog')
    );
  });
  it('does not search the disk, accept a redaction token, or silently substitute the current project', async () => {
    const f = await fixture();
    const tool = studioProjectSelectionTool({ ideRoots: [] });
    expect(
      await tool.execute({ projectPath: 'Reference/knowledge-catalog' }, f.context)
    ).toMatchObject({ ok: false, output: { code: 'project-path-not-found', candidates: [] } });
    await expect(tool.execute({ projectPath: '$LOCAL_PATH' }, f.context)).rejects.toThrow(
      'actual project path'
    );
  });
  it('requires immutable approval for a model-invented directory and rejects root replacement', async () => {
    const f = await fixture();
    const tool = studioProjectSelectionTool({ ideRoots: [f.ideRoot] });
    const raw = { projectPath: f.source };
    expect((await tool.authorize!(raw, f.context)).risk).toBe('invasive');
    await expect(tool.execute(raw, f.context)).rejects.toThrow('exact directory');
    const approved = await approve(tool, raw, f.context);
    const target = (await tool.execute(raw, approved)).executionTarget!;
    await fs.move(f.source, `${f.source}-old`);
    await fs.ensureDir(f.source);
    await expect(validateStudioExecutionTarget(target)).rejects.toThrow('identity');
    await expect(tool.execute(raw, approved)).rejects.toThrow('exact directory');
  });
  it('preserves the project target and genuine path through Resume, with no owner workspace required', async () => {
    const f = await fixture();
    const registry = new StudioAgentToolRegistry();
    registry.register(studioProjectSelectionTool({ ideRoots: [f.ideRoot] }));
    const seen: string[] = [];
    registry.register({
      name: 'inspect-target',
      title: 'Inspect target',
      description: 'Inspect source',
      activity: 'inspect',
      risk: 'read',
      inputSchema: {},
      execute: async (_, context) => {
        seen.push(context.workspacePath);
        return { ok: true };
      },
    });
    const actions: StudioAgentModelAction[] = [
      {
        type: 'tool',
        toolName: 'select-project',
        input: { projectPath: 'InWork/Reference/knowledge-catalog' },
        reason: 'Select the user project',
      },
      {
        type: 'tool',
        toolName: 'inspect-target',
        input: {},
        reason: 'Inspect the selected source',
      },
      { type: 'report', summary: 'Inspected source', nextSteps: [] },
    ];
    const options = {
      workspacePath: f.selected,
      cardId: 'assistant:agent',
      assistantMode: 'agent' as const,
      executionAuthority: 'workspace' as const,
      permissionLevel: 'autopilot' as const,
      workspaceTrusted: true,
    };
    let index = 0;
    const state = await new StudioAgentSession(
      options,
      { next: async () => actions[index++] ?? actions[2] },
      registry,
      { save: async () => {} }
    ).run('Edit InWork/Reference/knowledge-catalog');
    expect(
      state.executionTarget?.workspacePath,
      JSON.stringify(state.events.filter((event) => event.type === 'tool.failed'))
    ).toBe(f.source);
    const selected = state.events.find((event) => event.type === 'workspace.target.bound')!;
    expect(studioActivityReceipt(selected)).toMatchObject({
      title: 'Project source selected',
      summary: 'knowledge-catalog',
    });
    let resumed = 0;
    await new StudioAgentSession(
      { ...options, restoredSession: JSON.parse(JSON.stringify(state)) },
      { next: async () => actions[resumed++ === 0 ? 1 : 2] },
      registry,
      { save: async () => {} }
    ).run('Continue');
    expect(seen).toEqual([f.source, f.source]);
    expect(await fs.readdir(f.selected)).toEqual([]);
  });
  it('allows real reversible source edits and verification without adopting the project', async () => {
    const f = await fixture();
    configureStudioNativeStorage(path.join(f.root, 'extension-storage'));
    const native = createStudioNativeWorkspaceCapabilities({
      workspacePath: f.source,
      inspectedSource: new Map([['source.test.mjs', null]]),
      diagnostics: async () => ({ ok: true, output: { diagnostics: [] } }),
      inspectChanges: async () => ({
        ok: true,
        output: { statusExitCode: 128, diffExitCode: 129 },
      }),
    });
    const result = await native.applyPatches({
      workspacePath: f.source,
      sessionId: 'plain-project',
      requestId: 'r',
      transactionId: 'proposal',
      patches: [
        {
          relativePath: 'source.test.mjs',
          patchedContent:
            "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { answer } from './source.mjs';\ntest('answer', () => assert.equal(answer, 42));\n",
          isNewFile: true,
          hunks: [],
          status: 'pending',
        },
      ],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const { spawnSync } = await import('node:child_process');
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'source.test.mjs'], {
      cwd: f.source,
      encoding: 'utf8',
    });
    expect(run.error).toBeUndefined();
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('pass 1');
    expect(await native.verify({ workspacePath: f.source })).toMatchObject({
      ok: true,
      cardBlocking: false,
    });
    expect(await fs.pathExists(path.join(f.source, '.workspai'))).toBe(false);
    expect(await fs.readdir(f.selected)).toEqual([]);
  });
});

describe('Optional exact-approved adoption and import', () => {
  it('returns instructions created by onboarding instead of relying on instruction reads from before adoption', async () => {
    const f = await fixture();
    const { tool } = onboarding(f, 'new-instructions');
    const context = { ...f.context, workspacePath: f.source };
    const result = await tool.execute(
      { operation: 'adopt' },
      await approve(tool, { operation: 'adopt' }, context)
    );
    expect(result).toMatchObject({
      ok: true,
      output: {
        refreshedInstructions: { ok: true },
        nextReads: [],
      },
    });
    expect(JSON.stringify(result.output)).toContain('New onboarding instructions');
    expect(JSON.stringify(result.output)).not.toContain('run.started');
    expect(
      (result.output as { commands: object[] }).commands.every((command) => !('stdout' in command))
    ).toBe(true);
  });
  it('continues the refreshed instruction page instead of requesting the same prefix after adoption', async () => {
    const f = await fixture();
    await fs.outputFile(
      path.join(f.source, '.github/copilot-instructions.md'),
      'Repository instructions. '.repeat(400)
    );
    const { tool } = onboarding(f, 'new-instructions');
    const context = { ...f.context, workspacePath: f.source };
    const raw = { operation: 'adopt' };
    const result = await tool.execute(raw, await approve(tool, raw, context));
    const output = result.output as {
      refreshedInstructions: { output: { nextReads: unknown[] } };
      nextReads: Array<{ input: { document: string; offset: number } }>;
    };
    expect(output.nextReads).toEqual(output.refreshedInstructions.output.nextReads);
    expect(output.nextReads).toHaveLength(1);
    expect(output.nextReads[0].input.document).toBe('workspace:.github/copilot-instructions.md');
    expect(output.nextReads[0].input.offset).toBeGreaterThan(0);
  });
  it('suppresses a repeated optional offer for existing metadata without claiming the project is registered', async () => {
    const f = await fixture();
    await fs.ensureDir(path.join(f.source, '.workspai'));
    const { tool, calls } = onboarding(f);
    const context = { ...f.context, workspacePath: f.source };
    expect(await tool.authorize!({ operation: 'adopt', offer: true }, context)).toEqual({
      risk: 'read',
    });
    expect(await tool.execute({ operation: 'adopt', offer: true }, context)).toMatchObject({
      ok: true,
      changed: false,
      output: { status: 'metadata-present' },
    });
    const select = studioProjectSelectionTool({ ideRoots: [f.ideRoot] });
    const selection = await select.execute(
      { projectPath: f.source },
      { ...context, userRequestedPaths: [f.source] }
    );
    expect(selection.output).not.toHaveProperty('onboarding');
    expect(calls).toEqual([]);
    expect(await fs.readdir(path.join(f.source, '.workspai'))).toEqual([]);
  });
  it('creates the default workspace, adopts in place, and verifies actual canonical membership', async () => {
    const f = await fixture();
    const { tool, calls } = onboarding(f);
    const context = { ...f.context, workspacePath: f.source };
    const raw = { operation: 'adopt' };
    const authorization = await tool.authorize!(raw, context);
    expect(authorization.approval).toMatchObject({
      optionalProjectOnboarding: { projectPath: f.source },
      allowedExecutions: ['once'],
    });
    expect(authorization.approval!.summary).toContain('dependency mapping');
    expect(calls).toEqual([]); // Presenting the offer writes nothing.
    await expect(tool.execute(raw, context)).rejects.toThrow('consent');
    const result = await tool.execute(raw, await approve(tool, raw, context));
    const workspace = path.join(f.home, '.workspai/workspaces/workspai');
    expect(calls.map((call) => call.args)).toEqual([
      [
        'create',
        'workspace',
        'workspai',
        '--output',
        path.dirname(workspace),
        '--profile',
        'minimal',
        '--skip-git',
        '--yes',
      ],
      ['adopt', f.source, '--workspace', workspace, '--name', 'knowledge-catalog', '--json'],
    ]);
    expect(result).toMatchObject({
      ok: true,
      output: {
        status: 'registered',
        projectPath: f.source,
        inventory: { management: 'workspai', scope: { kind: 'project' } },
      },
    });
    expect(result.executionTarget).toBeUndefined();
    expect(await fs.readFile(path.join(f.source, 'source.mjs'), 'utf8')).toBe(
      'export const answer = 42;\n'
    );
    expect(await fs.readdir(f.selected)).toEqual([]);
  });
  it('uses the user-selected existing workspace, not the currently selected unrelated workspace', async () => {
    const f = await fixture();
    const { tool, calls } = onboarding(f);
    const workspace = path.join(f.root, 'custom');
    await fs.outputJSON(path.join(workspace, '.workspai/workspace.json'), {
      workspace_name: 'custom',
    });
    const context = { ...f.context, projectPath: f.source };
    const raw = { operation: 'adopt', workspacePath: workspace };
    const result = await tool.execute(raw, await approve(tool, raw, context));
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toContain(workspace);
    expect(calls[0].args).not.toContain('--yes');
    expect(calls[0].args).not.toContain('--output');
    expect(await fs.readdir(f.selected)).toEqual([]);
  });
  it('reuses the legacy managed default if it already exists', async () => {
    const f = await fixture();
    const { tool, calls } = onboarding(f);
    const workspace = path.join(f.home, 'rapidkit/workspaces/workspai');
    await fs.outputJSON(path.join(workspace, '.rapidkit/workspace.json'), {
      workspace_name: 'workspai',
    });
    const context = { ...f.context, workspacePath: f.source };
    await tool.execute(
      { operation: 'adopt' },
      await approve(tool, { operation: 'adopt' }, context)
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toContain(workspace);
  });
  it('imports by copying and switches the task to the verified copy, keeping original source intact', async () => {
    const f = await fixture();
    const { tool, calls } = onboarding(f);
    const context = { ...f.context, workspacePath: f.source };
    const raw = { operation: 'import', name: 'catalog-copy' };
    const result = await tool.execute(raw, await approve(tool, raw, context));
    const copied = path.join(f.home, '.workspai/workspaces/workspai/catalog-copy');
    expect(result).toMatchObject({
      ok: true,
      executionTarget: { workspacePath: copied },
      output: { operation: 'import' },
    });
    expect(calls.at(-1)!.args[0]).toBe('import');
    expect(calls.at(-1)!.args).not.toContain('--dry-run');
    expect(await fs.readdir(f.source)).toEqual(['source.mjs']);
    expect(await fs.readFile(path.join(copied, 'source.mjs'), 'utf8')).toContain('42');
  });
  it('rejects changed destination/operation and occupied copy destinations before running any CLI', async () => {
    const f = await fixture();
    const { tool, calls } = onboarding(f);
    const context = { ...f.context, workspacePath: f.source };
    const raw = { operation: 'adopt' };
    const approved = await approve(tool, raw, context);
    await expect(
      tool.execute({ ...raw, workspacePath: path.join(f.root, 'other') }, approved)
    ).rejects.toThrow('consent');
    await expect(tool.execute({ operation: 'import' }, approved)).rejects.toThrow('consent');
    await expect(
      tool.authorize!({ operation: 'import', name: 'catalog.git' }, context)
    ).rejects.toThrow('normalize');
    await expect(
      tool.authorize!({ operation: 'import', name: 'catalog--copy' }, context)
    ).rejects.toThrow('normalize');
    const workspace = path.join(f.root, 'occupied');
    await fs.outputJSON(path.join(workspace, '.workspai/workspace.json'), {
      workspace_name: 'occupied',
    });
    await fs.ensureDir(path.join(workspace, 'knowledge-catalog'));
    await expect(
      tool.authorize!({ operation: 'import', workspacePath: workspace }, context)
    ).rejects.toThrow('already exists');
    expect(calls).toEqual([]);
  });
  it('rejects unsafe/nonempty workspace targets and does not turn source into a workspace', async () => {
    const f = await fixture();
    const { tool, calls } = onboarding(f);
    const context = { ...f.context, workspacePath: f.source };
    await expect(
      tool.authorize!({ operation: 'adopt', workspacePath: f.source }, context)
    ).rejects.toThrow('outside the project');
    await fs.outputFile(path.join(f.root, 'not-clean/file.txt'), 'user data');
    await expect(
      tool.authorize!(
        { operation: 'adopt', workspacePath: path.join(f.root, 'not-clean') },
        context
      )
    ).rejects.toThrow('neither a Workspai workspace nor empty');
    expect(calls).toEqual([]);
  });
  it('retains successful workspace creation when adoption fails, without claiming task completion', async () => {
    const f = await fixture();
    const { tool } = onboarding(f, 'fail');
    const context = { ...f.context, workspacePath: f.source };
    const result = await tool.execute(
      { operation: 'adopt' },
      await approve(tool, { operation: 'adopt' }, context)
    );
    expect(result).toMatchObject({
      ok: false,
      changed: true,
      output: { commands: [{ exitCode: 0 }, { exitCode: 1 }] },
    });
    expect(result.executionTarget).toBeUndefined();
    expect(await fs.readdir(f.source)).toEqual(['source.mjs']);
  });
  it('does not claim adoption when the CLI receipt disagrees with the approved materialization', async () => {
    const f = await fixture();
    const { tool } = onboarding(f, 'wrong-receipt');
    const context = { ...f.context, workspacePath: f.source };
    const result = await tool.execute(
      { operation: 'adopt' },
      await approve(tool, { operation: 'adopt' }, context)
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('differs');
    expect(result.executionTarget).toBeUndefined();
  });
  it('invalidates approval when the workspace identity marker changes', async () => {
    const f = await fixture();
    const { tool, calls } = onboarding(f);
    const workspace = path.join(f.root, 'identity');
    const marker = path.join(workspace, '.workspai/workspace.json');
    await fs.outputJSON(marker, { workspace_name: 'identity' });
    const context = { ...f.context, workspacePath: f.source };
    const raw = { operation: 'adopt', workspacePath: workspace };
    const approved = await approve(tool, raw, context);
    await fs.writeJSON(marker, { workspace_name: 'replacement' });
    await expect(tool.execute(raw, approved)).rejects.toThrow('consent');
    expect(calls).toEqual([]);
  });
  it('persists each successful onboarding command before a later provider/transport failure', async () => {
    const f = await fixture();
    const events: Array<Record<string, unknown>> = [];
    const tool = studioProjectOnboardingTool({
      home: f.home,
      run: async ({ args }) => {
        if (args[0] !== 'create') {
          throw new Error('transport interrupted');
        }
        await fs.outputJSON(
          path.join(f.home, '.workspai/workspaces/workspai/.workspai/workspace.json'),
          { workspace_name: 'workspai' }
        );
        return { exitCode: 0 };
      },
    });
    const context = {
      ...f.context,
      workspacePath: f.source,
      reportProgress: async (data: Record<string, unknown>) => {
        events.push(data);
      },
    };
    const result = await tool.execute(
      { operation: 'adopt' },
      await approve(tool, { operation: 'adopt' }, context)
    );
    expect(result).toMatchObject({
      ok: false,
      changed: true,
      error: 'transport interrupted',
      output: { commands: [{ exitCode: 0 }] },
    });
    expect(
      events.some((event) => (event.commandReceipt as { exitCode?: number })?.exitCode === 0)
    ).toBe(true);
    const state = new StudioAgentSession(
      {
        workspacePath: f.source,
        cardId: 'test',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        workspaceTrusted: true,
        permissionLevel: 'autopilot',
      },
      { next: async () => ({ type: 'report', summary: 'unused', nextSteps: [] }) },
      new StudioAgentToolRegistry(),
      { save: async () => {} }
    ).snapshot();
    state.events = events.map((data, index) => ({
      schemaVersion: 'workspai.studio-agent-event.v1',
      id: `event-${index}`,
      sequence: index + 1,
      timestamp: new Date().toISOString(),
      sessionId: state.id,
      type: 'tool.progress',
      data: { toolName: 'onboard-project', ...data },
    }));
    expect(studioAgentExecutionEvidence(state).commands).toMatchObject([
      { ok: true, exitCode: 0, purpose: 'project onboarding' },
    ]);
  });
  it('continues the original task after declined onboarding, remembers the decline, and executes no CLI', async () => {
    const f = await fixture();
    const { tool, calls } = onboarding(f);
    const registry = new StudioAgentToolRegistry();
    registry.register(tool);
    const continueTask = vi.fn(async () => ({ ok: true }));
    registry.register({
      name: 'continue-task',
      title: 'Continue',
      description: 'Continue original task',
      activity: 'inspect',
      risk: 'read',
      inputSchema: {},
      execute: continueTask,
    });
    const actions: StudioAgentModelAction[] = [
      {
        type: 'tool',
        toolName: 'onboard-project',
        input: { operation: 'adopt' },
        reason: 'Offer optional adoption',
      },
      {
        type: 'tool',
        toolName: 'continue-task',
        input: {},
        reason: 'Honor decline and continue source task',
      },
      {
        type: 'tool',
        toolName: 'onboard-project',
        input: { operation: 'adopt' },
        reason: 'Attempt duplicate offer',
      },
      { type: 'report', summary: 'Source inspected without onboarding.', nextSteps: [] },
    ];
    let index = 0;
    const approval = vi.fn(async (request: { fingerprint: string }) => ({
      approved: false,
      fingerprint: request.fingerprint,
    }));
    const state = await new StudioAgentSession(
      {
        workspacePath: f.source,
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        requestToolApproval: approval,
      },
      { next: async () => actions[index++] ?? actions[3] },
      registry,
      { save: async () => {} }
    ).run('Add a test in this existing project');
    expect(approval).toHaveBeenCalledTimes(1);
    expect(continueTask).toHaveBeenCalledTimes(1);
    expect(state.declinedProjectOnboarding).toEqual([
      { requestId: expect.any(String), projectPath: f.source },
    ]);
    expect(calls).toEqual([]);
    expect(
      state.events.some(
        (event) => event.type === 'tool.completed' && event.data.toolName === 'continue-task'
      )
    ).toBe(true);
    const declineEvent = state.events.find((event) => event.type === 'tool.approval.rejected')!;
    expect(studioActivityReceipt(declineEvent)).toMatchObject({
      status: 'done',
      title: 'Optional onboarding skipped',
    });
    let resumed = 0;
    await new StudioAgentSession(
      {
        workspacePath: f.source,
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        requestToolApproval: approval,
        restoredSession: JSON.parse(JSON.stringify(state)),
      },
      { next: async () => (resumed++ === 0 ? actions[0] : actions[3]) },
      registry,
      { save: async () => {} }
    ).run('Continue the source task');
    expect(approval).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
    // A later explicit onboarding request can ask for new exact consent; it cannot bypass it.
    const reconsider = await tool.authorize!(
      { operation: 'adopt', offer: false },
      { ...f.context, workspacePath: f.source, declinedProjectOnboarding: [f.source] }
    );
    expect(reconsider.risk).toBe('invasive');
    expect(reconsider.approval?.allowedExecutions).toEqual(['once']);
  });
  it('blocks scope replacement before offering or executing onboarding in a governed session', async () => {
    const f = await fixture();
    const { tool, calls } = onboarding(f);
    const registry = new StudioAgentToolRegistry();
    registry.register(tool);
    let index = 0;
    const approval = vi.fn();
    const state = await new StudioAgentSession(
      {
        workspacePath: f.source,
        cardId: 'blocker',
        assistantMode: 'agent',
        executionAuthority: 'workspai-cli',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        requestToolApproval: approval,
      },
      {
        next: async () =>
          index++ === 0
            ? {
                type: 'tool',
                toolName: 'onboard-project',
                input: { operation: 'adopt' },
                reason: 'Invalid scope change',
              }
            : { type: 'report', summary: 'Scope remains pinned', nextSteps: [] },
      },
      registry,
      { save: async () => {} }
    ).run('Inspect the blocker');
    expect(
      state.events.some(
        (event) =>
          event.type === 'tool.failed' && String(event.data.error).includes('governed scope')
      )
    ).toBe(true);
    expect(approval).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});
