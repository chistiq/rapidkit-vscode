import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  studioWorkspaceCreationTool,
  studioWorkspaceBindingTool,
  validateStudioCreatedWorkspaceTarget,
} from '../core/studioWorkspaceCreation.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import {
  StudioAgentToolRegistry,
  type StudioAgentToolContext,
} from '../core/studioAgentToolRegistry.js';
import { resolveAssistantExecutionPolicy } from '../core/assistantExecutionPolicy.js';
import { inspectStudioWorkspaceInventory } from '../core/studioWorkspaceInventory.js';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
async function fixture(failProject?: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'assistant-create-'));
  roots.push(root);
  const original = path.join(root, 'existing');
  const home = path.join(root, 'managed');
  await fs.ensureDir(original);
  const calls: Array<{ args: string[]; cwd: string }> = [];
  const tool = studioWorkspaceCreationTool({
    managedHome: home,
    run: async ({ args, cwd }) => {
      expect(await fs.pathExists(cwd)).toBe(true);
      calls.push({ args, cwd });
      if (args[1] === 'workspace') {
        await fs.outputJSON(
          path.join(args[args.indexOf('--output') + 1], args[2], '.workspai/workspace.json'),
          {
            workspace_name: args[2],
          }
        );
      } else if (args[3] === failProject) return { exitCode: 1, stderr: 'Generator unavailable' };
      else {
        await fs.outputJSON(path.join(cwd, args[3], '.workspai/workspace-link.local.json'), {
          workspace: { root: cwd },
          project: { relativePath: args[3] },
        });
        await fs.outputFile(path.join(cwd, args[3], 'source.txt'), 'Generated source\n');
      }
      return { exitCode: 0 };
    },
  });
  const context: StudioAgentToolContext = {
    sessionId: 's',
    requestId: 'r',
    toolCallId: 'c',
    workspacePath: original,
    signal: new AbortController().signal,
  };
  const request = {
    name: 'shop',
    profile: 'node-only',
    projects: [
      { name: 'api', kit: 'nestjs.standard' },
      { name: 'storefront', kit: 'nextjs' },
    ],
  };
  return { root, original, home, tool, calls, context, request };
}
async function approved(f: Awaited<ReturnType<typeof fixture>>) {
  const auth = await f.tool.authorize!(f.request, f.context);
  return {
    ...f.context,
    approval: {
      fingerprint: auth.approval!.fingerprint,
      approvedBy: 'user',
      approvedAt: new Date().toISOString(),
    },
  };
}
describe('Owned workspace creation', () => {
  it('explains invalid project directory names before authorization without blaming a valid kit', async () => {
    const f = await fixture();
    const request = {
      ...f.request,
      projects: [{ name: 'Focusboard', kit: 'frontend.vite-react' }],
    };
    await expect(f.tool.authorize!(request, f.context)).rejects.toThrow('lowercase slugs');
    expect(f.calls).toEqual([]);
    const corrected = {
      ...request,
      projects: [{ name: 'focusboard', kit: 'frontend.vite-react' }],
    };
    const auth = await f.tool.authorize!(corrected, f.context);
    expect(auth.approval?.displayCommand).toContain('frontend.vite-react');
    expect(auth.approval?.displayCommand).toContain('focusboard');
    expect(f.calls).toEqual([]);
  });

  it('creates and binds projects in the approved custom parent instead of managed home or the selected workspace', async () => {
    const f = await fixture();
    const outputParent = path.join(f.root, 'custom parent', 'systems');
    const request = { ...f.request, outputParent };
    const auth = await f.tool.authorize!(request, f.context);
    const context = {
      ...f.context,
      approval: {
        fingerprint: auth.approval!.fingerprint,
        approvedBy: 'user',
        approvedAt: new Date().toISOString(),
      },
    };
    await expect(
      f.tool.execute({ ...request, outputParent: path.join(f.root, 'different') }, context)
    ).rejects.toThrow('exact destination');
    const result = await f.tool.execute(request, context);
    const workspacePath = path.join(outputParent, 'shop');
    expect(result).toMatchObject({
      ok: true,
      executionTarget: {
        workspacePath,
        location: { kind: 'custom', parentPath: outputParent, directoryName: 'shop' },
      },
    });
    expect(f.calls.map((call) => call.cwd)).toEqual([outputParent, workspacePath, workspacePath]);
    expect(await fs.pathExists(path.join(f.home, 'shop'))).toBe(false);
    expect(await fs.readdir(f.original)).toEqual([]);
    await validateStudioCreatedWorkspaceTarget(
      JSON.parse(JSON.stringify(result.executionTarget)),
      f.home
    );
  });
  it('resolves relative custom parents from the selected scope and rejects workspace nesting before approval or writes', async () => {
    const f = await fixture();
    const request = { ...f.request, outputParent: '../custom' };
    const auth = await f.tool.authorize!(request, f.context);
    expect(auth.approval?.cwd).toBe(path.join(f.root, 'custom/shop'));
    await fs.outputJSON(path.join(f.original, '.workspai/workspace.json'), {
      workspace_name: 'existing',
    });
    await expect(
      f.tool.authorize!({ ...request, outputParent: f.original }, f.context)
    ).rejects.toThrow('cannot be nested');
    await expect(
      f.tool.authorize!({ ...request, outputParent: '$LOCAL_PATH' }, f.context)
    ).rejects.toThrow('display path');
    expect(f.calls).toEqual([]);
    expect(await fs.pathExists(path.join(f.root, 'custom'))).toBe(false);
  });
  it('selects a custom existing workspace with an independent directory name and rejects changed identity and redirection', async () => {
    const f = await fixture();
    const workspacePath = path.join(f.root, 'Custom Workspace');
    const marker = path.join(workspacePath, '.workspai/workspace.json');
    await fs.outputJSON(marker, { workspace_name: 'canonical-system' });
    const tool = studioWorkspaceBindingTool({ managedHome: f.home });
    const request = { workspacePath };
    const auth = await tool.authorize!(request, f.context);
    const context = {
      ...f.context,
      approval: {
        fingerprint: auth.approval!.fingerprint,
        approvedBy: 'user',
        approvedAt: new Date().toISOString(),
      },
    };
    const result = await tool.execute(request, context);
    expect(result.executionTarget).toMatchObject({
      name: 'canonical-system',
      workspacePath,
      location: { directoryName: 'Custom Workspace' },
    });
    await validateStudioCreatedWorkspaceTarget(result.executionTarget!, f.home);
    await expect(tool.authorize!({ name: 'shop', workspacePath }, f.context)).rejects.toThrow(
      'either'
    );
    await fs.writeJSON(marker, { workspace_name: 'changed-identity' });
    await expect(tool.execute(request, context)).rejects.toThrow('exact destination');
    await expect(
      validateStudioCreatedWorkspaceTarget(result.executionTarget!, f.home)
    ).rejects.toThrow('receipt');
    await fs.writeJSON(marker, { workspace_name: 'canonical-system' });
    await fs.move(workspacePath, path.join(f.root, 'moved'));
    await fs.symlink(path.join(f.root, 'moved'), workspacePath);
    await expect(
      validateStudioCreatedWorkspaceTarget(result.executionTarget!, f.home)
    ).rejects.toThrow('receipt');
  });
  it('retains a custom destination through the controller and Resume without changing the original scope', async () => {
    const f = await fixture();
    const workspacePath = path.join(f.root, 'custom/shop');
    const registry = new StudioAgentToolRegistry();
    registry.register(f.tool);
    const seen: string[] = [];
    registry.register({
      name: 'inspect-destination',
      title: 'Inspect',
      description: '',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute: async (_, context) => {
        seen.push(context.workspacePath);
        return { ok: true };
      },
    });
    const request = { ...f.request, outputParent: path.dirname(workspacePath) };
    const actions = [
      {
        type: 'tool' as const,
        toolName: 'create-workspace',
        input: request,
        reason: 'Use the requested custom parent',
      },
      {
        type: 'tool' as const,
        toolName: 'inspect-destination',
        input: {},
        reason: 'Inspect chosen workspace',
      },
      {
        type: 'report' as const,
        summary: 'Created source; application checks remain.',
        nextSteps: ['Run project checks'],
      },
    ];
    const options = {
      workspacePath: f.original,
      cardId: 'assistant:agent',
      assistantMode: 'agent' as const,
      executionAuthority: 'workspace' as const,
      workspaceTrusted: true,
      permissionLevel: 'autopilot' as const,
      requestToolApproval: async (request: { fingerprint: string }) => ({
        approved: true,
        fingerprint: request.fingerprint,
      }),
      validateExecutionTarget: (
        target: Parameters<typeof validateStudioCreatedWorkspaceTarget>[0]
      ) => validateStudioCreatedWorkspaceTarget(target, f.home),
    };
    let index = 0;
    const state = await new StudioAgentSession(
      options,
      { next: async () => actions[index++] ?? actions[2] },
      registry,
      { save: async () => {} }
    ).run('Create the system in a custom directory');
    expect(state.executionTarget?.workspacePath).toBe(workspacePath);
    expect(state.executionTarget?.location?.kind).toBe('custom');
    let resumed = 0;
    await new StudioAgentSession(
      { ...options, restoredSession: JSON.parse(JSON.stringify(state)) },
      { next: async () => (resumed++ === 0 ? actions[1] : actions[2]) },
      registry,
      { save: async () => {} }
    ).run('Continue');
    expect(seen).toEqual([workspacePath, workspacePath]);
    expect(await fs.readdir(f.original)).toEqual([]);
  });
  it('recovers a missing selected scope through inventory discovery, approved creation and target-owned verification', async () => {
    const f = await fixture();
    await fs.remove(f.original);
    const registry = new StudioAgentToolRegistry();
    registry.register(f.tool);
    registry.register({
      name: 'inspect-workspace',
      title: 'Inventory',
      description: '',
      inputSchema: {},
      risk: 'read',
      activity: 'inspect',
      execute: async (_, context) => {
        const output = await inspectStudioWorkspaceInventory(context.workspacePath);
        return { ok: output.availability.status === 'available', output };
      },
    });
    const verifiedRoots: string[] = [];
    registry.register({
      name: 'inspect-workspace-changes',
      title: 'Review',
      description: '',
      inputSchema: {},
      risk: 'read',
      activity: 'inspect',
      execute: async (_, context) => {
        verifiedRoots.push(context.workspacePath);
        return {
          ok:
            (await fs.readFile(path.join(context.workspacePath, 'api/source.txt'), 'utf8')) ===
            'Generated source\n',
        };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify',
      description: '',
      inputSchema: {},
      risk: 'read',
      activity: 'verify',
      execute: async (_, context) => {
        const link = await fs.readJSON(
          path.join(context.workspacePath, 'storefront/.workspai/workspace-link.local.json')
        );
        return {
          ok: link.workspace.root === context.workspacePath,
          cardBlocking: false,
          output: { authority: 'workspace-evidence' },
        };
      },
    });
    const actions = [
      {
        type: 'tool' as const,
        toolName: 'inspect-workspace',
        input: {},
        reason: 'Check the selected destination',
      },
      {
        type: 'tool' as const,
        toolName: 'create-workspace',
        input: f.request,
        reason: 'Create the requested software independently of a missing scope',
      },
      {
        type: 'tool' as const,
        toolName: 'inspect-workspace-changes',
        input: {},
        reason: 'Review actual generated source',
      },
      {
        type: 'tool' as const,
        toolName: 'verify-blocker',
        input: {},
        reason: 'Verify the selected destination and membership',
      },
      {
        type: 'complete' as const,
        summary:
          'Workspace and two projects were created; application behavior is not verified by this test.',
      },
    ];
    let turn = 0;
    const state = await new StudioAgentSession(
      {
        workspacePath: f.original,
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        workspaceTrusted: true,
        permissionLevel: 'autopilot',
        validateExecutionTarget: (target) => validateStudioCreatedWorkspaceTarget(target, f.home),
        requestToolApproval: async (request) => ({
          approved: true,
          fingerprint: request.fingerprint,
          approvedBy: 'test-user',
        }),
      },
      { next: async () => actions[turn++] ?? actions[4] },
      registry,
      { save: async () => {} }
    ).run('Create a shop with frontend and backend');
    expect(state.status).toBe('completed');
    expect(state.executionTarget?.workspacePath).toBe(path.join(f.home, 'shop'));
    expect(verifiedRoots).toEqual([path.join(f.home, 'shop')]);
    expect(await fs.pathExists(f.original)).toBe(false);
    expect(
      state.events.some(
        (event) => event.type === 'tool.failed' && event.data.toolName === 'create-workspace'
      )
    ).toBe(false);
  });
  it.each(['use-current', 'create-new'] as const)(
    'lets the model choose applicable tools with a %s intent hint',
    async (workspaceIntent) => {
      const f = await fixture();
      const registry = new StudioAgentToolRegistry();
      registry.register(f.tool);
      const seen: string[] = [];
      registry.register({
        name: 'scaffold-current-project',
        title: 'Scaffold',
        description: '',
        inputSchema: {},
        risk: 'safe-write',
        activity: 'change',
        execute: async (_, context) => {
          seen.push(context.workspacePath);
          return { ok: true };
        },
      });
      let index = 0;
      const actions = [
        {
          type: 'tool' as const,
          toolName: 'scaffold-current-project',
          input: {},
          reason: 'Use the active workspace',
        },
        { type: 'report' as const, summary: 'Current workspace used.', nextSteps: [] },
      ];
      const session = new StudioAgentSession(
        {
          workspacePath: f.original,
          cardId: 'assistant:agent',
          assistantMode: 'agent',
          executionAuthority: 'workspace',
          permissionLevel: 'autopilot',
          workspaceTrusted: true,
          requiresVerifiedCompletion: false,
          executionPolicy: resolveAssistantExecutionPolicy({
            selectedMode: 'agent',
            requestIntent: 'engineering-task',
            workspaceIntent,
          }),
        },
        { next: async () => actions[index++] ?? actions[1] },
        registry,
        { save: async () => {} }
      );
      const state = await session.run('Create a project in the active workspace');
      expect(seen).toEqual([f.original]);
      expect(f.calls).toEqual([]);
      expect(state.executionTarget).toBeUndefined();
      expect(state.events.some((event) => event.type === 'tool.failed')).toBe(false);
    }
  );
  it('does not make a complete answer depend on an intent-classifier workspace hint', async () => {
    const f = await fixture();
    const session = new StudioAgentSession(
      {
        workspacePath: f.original,
        cardId: 'assistant:ask',
        assistantMode: 'ask',
        executionAuthority: 'workspace',
        requiresVerifiedCompletion: false,
        executionPolicy: resolveAssistantExecutionPolicy({
          selectedMode: 'ask',
          requestIntent: 'question',
          workspaceIntent: 'create-new',
        }),
      },
      {
        next: async () => ({
          type: 'complete',
          summary: 'Use workspai create workspace <name> to create an independent workspace.',
        }),
      },
      new StudioAgentToolRegistry(),
      { save: async () => {} }
    );
    const state = await session.run('How do I create a workspace?');
    expect(state.status).toBe('completed');
    expect(state.executionTarget).toBeUndefined();
  });
  it('requires exact destination approval and rejects missing, traversing and redirected bindings', async () => {
    const f = await fixture();
    const selected: string[] = [];
    const tool = studioWorkspaceBindingTool({
      managedHome: f.home,
      onWorkspaceReady: (target) => {
        selected.push(target.workspacePath);
      },
    });
    await expect(tool.authorize!({ name: 'missing' }, f.context)).rejects.toThrow();
    await expect(tool.authorize!({ name: '../existing' }, f.context)).rejects.toThrow();
    await fs.outputJSON(path.join(f.home, 'shop/.workspai/workspace.json'), {
      workspace_name: 'shop',
    });
    const auth = await tool.authorize!({ name: 'shop' }, f.context);
    const context = {
      ...f.context,
      approval: {
        fingerprint: auth.approval!.fingerprint,
        approvedBy: 'user',
        approvedAt: new Date().toISOString(),
      },
    };
    await expect(tool.execute({ name: 'shop' }, f.context)).rejects.toThrow('exact destination');
    const result = await tool.execute({ name: 'shop' }, context);
    expect(result.executionTarget?.workspacePath).toBe(path.join(f.home, 'shop'));
    expect(result.changed).not.toBe(true);
    expect(selected).toEqual([path.join(f.home, 'shop')]);
    await fs.outputJSON(path.join(f.original, '.workspai/workspace.json'), {
      workspace_name: 'shop',
    });
    await fs.remove(path.join(f.home, 'shop'));
    await fs.symlink(f.original, path.join(f.home, 'shop'));
    await expect(tool.execute({ name: 'shop' }, context)).rejects.toThrow('receipt');
    expect(selected).toHaveLength(1);
  });
  it('does not start a cancelled creation', async () => {
    const f = await fixture();
    const context = await approved(f);
    const controller = new AbortController();
    controller.abort();
    expect(
      await f.tool.execute(f.request, { ...context, signal: controller.signal })
    ).toMatchObject({ ok: false, changed: false });
    expect(f.calls).toEqual([]);
    expect(await fs.pathExists(path.join(f.home, 'shop'))).toBe(false);
  });
  it('creates both projects inside the newly approved independent workspace', async () => {
    const f = await fixture();
    const result = await f.tool.execute(f.request, await approved(f));
    expect(result.ok).toBe(true);
    expect(result.executionTarget?.workspacePath).toBe(path.join(f.home, 'shop'));
    expect(f.calls.map((call) => call.cwd)).toEqual([
      f.home,
      path.join(f.home, 'shop'),
      path.join(f.home, 'shop'),
    ]);
    expect(await fs.readdir(f.original)).toEqual([]);
    await validateStudioCreatedWorkspaceTarget(result.executionTarget!, f.home);
    await fs.remove(path.join(f.home, 'shop/.workspai/workspace.json'));
    await expect(
      validateStudioCreatedWorkspaceTarget(result.executionTarget!, f.home)
    ).rejects.toThrow();
  });
  it('creates independently when the selected folder no longer exists', async () => {
    const f = await fixture();
    await fs.remove(f.original);
    const result = await f.tool.execute(f.request, await approved(f));
    expect(result.ok).toBe(true);
    expect(result.executionTarget?.workspacePath).toBe(path.join(f.home, 'shop'));
    expect(await fs.pathExists(f.original)).toBe(false);
    expect(f.calls.every((call) => call.cwd !== f.original)).toBe(true);
  });
  it.each([
    [{ name: 'api', kit: 'gofiber.standard' }, 'go-only'],
    [{ name: 'web', kit: 'nextjs' }, 'node-only'],
    [{ name: 'api', kit: 'fastapi.standard' }, 'python-only'],
  ])('selects a runtime-aware default profile for %j', async (project, profile) => {
    const f = await fixture();
    const request = { name: 'shop', projects: [project] };
    const auth = await f.tool.authorize!(request, f.context);
    const result = await f.tool.execute(request, {
      ...f.context,
      approval: {
        fingerprint: auth.approval!.fingerprint,
        approvedBy: 'user',
        approvedAt: new Date().toISOString(),
      },
    });
    expect(result.ok).toBe(true);
    const args = f.calls[0].args;
    expect(args[args.indexOf('--profile') + 1]).toBe(profile);
  });
  it('retains a partial owned destination and never falls back to the original workspace', async () => {
    const f = await fixture('storefront');
    const result = await f.tool.execute(f.request, await approved(f));
    expect(result).toMatchObject({ ok: false, changed: true, executionTarget: { name: 'shop' } });
    expect(f.calls.at(-1)?.cwd).toBe(path.join(f.home, 'shop'));
    expect(await fs.readdir(f.original)).toEqual([]);
    await expect(f.tool.authorize!(f.request, f.context)).rejects.toThrow('already exists');
  });
  it('rejects changed approval, existing targets, path traversal, and wrong project ownership', async () => {
    const f = await fixture();
    const context = await approved(f);
    await expect(f.tool.execute({ ...f.request, name: 'other' }, context)).rejects.toThrow(
      'exact destination'
    );
    await expect(
      f.tool.authorize!({ ...f.request, name: '../outside' }, f.context)
    ).rejects.toThrow();
    await fs.ensureDir(path.join(f.home, 'shop'));
    await expect(f.tool.execute(f.request, context)).rejects.toThrow('already exists');
    expect(f.calls).toEqual([]);
    const broken = studioWorkspaceCreationTool({
      managedHome: f.home,
      run: async ({ args }) => {
        if (args[1] === 'workspace')
          await fs.outputJSON(path.join(f.home, 'different/.workspai/workspace.json'), {
            workspace_name: 'different',
          });
        else
          await fs.outputJSON(
            path.join(f.home, 'different/api/.workspai/workspace-link.local.json'),
            { workspace: { root: f.original }, project: { relativePath: 'api' } }
          );
        return { exitCode: 0 };
      },
    });
    const request = { name: 'different', projects: [{ name: 'api', kit: 'nestjs.standard' }] };
    const auth = await broken.authorize!(request, f.context);
    expect(
      await broken.execute(request, {
        ...f.context,
        approval: { ...context.approval, fingerprint: auth.approval!.fingerprint },
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining('not registered') });
  });
  it('accepts another creation route and routes later inspection and Resume to its selected target', async () => {
    const f = await fixture();
    const registry = new StudioAgentToolRegistry();
    // A different host capability can return a validated destination, without a reserved name.
    registry.register({
      ...studioWorkspaceBindingTool({ managedHome: f.home }),
      name: 'choose-destination',
    });
    const seen: string[] = [];
    registry.register({
      name: 'start-terminal',
      title: 'Terminal',
      description: '',
      inputSchema: {},
      risk: 'safe-write',
      activity: 'change',
      execute: async (_, context) => {
        expect(context.workspacePath).toBe(f.original);
        await fs.outputJSON(path.join(f.home, 'shop/.workspai/workspace.json'), {
          workspace_name: 'shop',
        });
        return { ok: true };
      },
    });
    registry.register({
      name: 'inspect-source',
      title: 'Inspect',
      description: '',
      inputSchema: {},
      risk: 'read',
      activity: 'inspect',
      execute: async (_, context) => {
        seen.push(context.workspacePath);
        return { ok: true };
      },
    });
    let turn = 0;
    const options = {
      workspacePath: f.original,
      cardId: 'assistant:agent',
      assistantMode: 'agent' as const,
      executionAuthority: 'workspace' as const,
      permissionLevel: 'autopilot' as const,
      workspaceTrusted: true,
      requiresVerifiedCompletion: false,
      executionPolicy: resolveAssistantExecutionPolicy({
        selectedMode: 'agent',
        requestIntent: 'engineering-task',
        workspaceIntent: 'create-new',
      }),
      validateExecutionTarget: (
        target: Parameters<typeof validateStudioCreatedWorkspaceTarget>[0]
      ) => validateStudioCreatedWorkspaceTarget(target, f.home),
      requestToolApproval: async (request: { fingerprint: string }) => ({
        approved: true,
        fingerprint: request.fingerprint,
      }),
    };
    const model = {
      next: async () => {
        const actions = [
          {
            type: 'tool' as const,
            toolName: 'start-terminal',
            input: { command: 'workspai create workspace shop' },
            reason: 'Create the destination through an alternative approved tool',
          },
          {
            type: 'tool' as const,
            toolName: 'choose-destination',
            input: { name: 'shop' },
            reason: 'Select the independently created destination',
          },
          {
            type: 'tool' as const,
            toolName: 'inspect-source',
            input: {},
            reason: 'Inspect owned workspace',
          },
          {
            type: 'report' as const,
            summary: 'Scaffolding inspected; further checks remain.',
            nextSteps: ['Run checks'],
          },
        ];
        return actions[turn++] ?? actions[3];
      },
    };
    const session = new StudioAgentSession(options, model, registry, { save: async () => {} });
    const state = await session.run('Create a new workspace with projects');
    expect(state.events.some((event) => event.type === 'workspace.target.bound')).toBe(true);
    expect(seen).toEqual([path.join(f.home, 'shop')]);
    expect(state.executionTarget?.name).toBe('shop');
    const resumed = new StudioAgentSession(
      { ...options, restoredSession: state },
      {
        next: async () =>
          seen.length === 1
            ? { type: 'tool', toolName: 'inspect-source', input: {}, reason: 'Resume' }
            : { type: 'report', summary: 'Pending checks', nextSteps: [] },
      },
      registry,
      { save: async () => {} }
    );
    await resumed.run('Continue');
    expect(seen).toEqual([path.join(f.home, 'shop'), path.join(f.home, 'shop')]);
    const question = new StudioAgentSession(
      {
        ...options,
        assistantMode: 'ask',
        executionTarget: state.executionTarget,
        executionPolicy: resolveAssistantExecutionPolicy({
          selectedMode: 'ask',
          requestIntent: 'question',
        }),
      },
      {
        next: async () =>
          seen.length === 2
            ? {
                type: 'tool',
                toolName: 'inspect-source',
                input: {},
                reason: 'Inspect the newly created workspace for a follow-up question',
              }
            : { type: 'complete', summary: 'The newly created workspace was inspected.' },
      },
      registry,
      { save: async () => {} }
    );
    await question.run('What projects are in it?');
    expect(seen.at(-1)).toBe(path.join(f.home, 'shop'));
  });
});
