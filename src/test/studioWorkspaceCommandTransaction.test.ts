import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveStudioWorkspaceCommandPlan } from '../core/studioWorkspaceCommand.js';
import { executeStudioWorkspaceCommandTransaction } from '../core/studioWorkspaceCommandTransaction.js';
import { StudioAgentSession, type StudioAgentModelAction } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import { studioProjectSelectionTool } from '../core/studioProjectTarget.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

async function commandFixture(script: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-command-transaction-'));
  roots.push(root);
  await fs.writeFile(path.join(root, 'target.txt'), 'before\n');
  await fs.writeFile(path.join(root, 'command.js'), script);
  return root;
}

describe('Studio workspace command transaction', () => {
  it.each([false, true])(
    'ignores regenerable Python bytecode but still protects real source (source write=%s)',
    async (writeSource) => {
      const root = await commandFixture(
        "const fs=require('fs'); fs.mkdirSync('__pycache__',{recursive:true}); fs.writeFileSync('__pycache__/test.cpython-313.pyc',Buffer.from([0,1,2]));\n" +
          (writeSource
            ? "fs.writeFileSync('target.txt','unexpected source change');\n"
            : "console.log('2 tests passed');\n")
      );
      const result = await executeStudioWorkspaceCommandTransaction({
        workspacePath: root,
        request: { executable: 'node', args: ['command.js'], purpose: 'test' },
      });
      expect(result.ok).toBe(!writeSource);
      expect(result.changed).toBe(false);
      expect(result.output?.changedPaths).toEqual(writeSource ? ['target.txt'] : []);
      expect(await fs.readFile(path.join(root, 'target.txt'), 'utf8')).toBe('before\n');
      expect(await fs.pathExists(path.join(root, '__pycache__', 'test.cpython-313.pyc'))).toBe(
        true
      );
    }
  );

  it('keeps preflight checkpoint failure recoverable and runs only after selecting narrow project source', async () => {
    const root = await commandFixture(
      "require('fs').writeFileSync('should-not-exist.txt', 'unsafe');\n"
    );
    const large = path.join(root, 'unrelated-large-source.bin');
    const handle = await fs.open(large, 'w');
    await fs.ftruncate(handle, 17 * 1024 * 1024);
    await fs.close(handle);
    const project = path.join(root, 'focusboard');
    await fs.outputFile(
      path.join(project, 'command.js'),
      "console.log('narrow project checked');\n"
    );
    const registry = new StudioAgentToolRegistry();
    const results: Array<Awaited<ReturnType<typeof executeStudioWorkspaceCommandTransaction>>> = [];
    registry.register({
      name: 'run-workspace-command',
      title: 'Run scoped command',
      activity: 'inspect',
      risk: 'read',
      async execute(_input, context) {
        const result = await executeStudioWorkspaceCommandTransaction({
          workspacePath: context.workspacePath,
          projectPath: context.projectPath,
          request: { executable: 'node', args: ['command.js'], purpose: 'diagnose' },
        });
        results.push(result);
        return result;
      },
    });
    registry.register(studioProjectSelectionTool({ ideRoots: [root] }));
    registry.register({
      name: 'inspect-workspace-changes',
      title: 'Review changes',
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return { ok: true };
      },
    });
    registry.register({
      name: 'verify-blocker',
      title: 'Verify check',
      activity: 'verify',
      risk: 'read',
      async execute() {
        return { ok: true, cardBlocking: false };
      },
    });
    const actions: StudioAgentModelAction[] = [
      {
        type: 'tool',
        toolName: 'run-workspace-command',
        input: {},
        reason: 'Check project script.',
      },
      {
        type: 'tool',
        toolName: 'select-project',
        input: { projectPath: project },
        reason: 'Use the intended narrower project after safe preflight rejection.',
      },
      {
        type: 'tool',
        toolName: 'run-workspace-command',
        input: {},
        reason: 'Check within the selected project.',
      },
      {
        type: 'tool',
        toolName: 'inspect-workspace-changes',
        input: {},
        reason: 'Review resulting changes.',
      },
      { type: 'complete', summary: 'The project script passed within its source directory.' },
    ];
    const session = new StudioAgentSession(
      {
        id: 'checkpoint-recovery',
        workspacePath: root,
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        requiresVerifiedCompletion: true,
      },
      {
        async next() {
          const action = actions.shift();
          if (!action) throw new Error('Unexpected model turn.');
          return action;
        },
      },
      registry,
      {
        async save() {},
        async load() {
          return undefined;
        },
      }
    );
    const result = await session.run(`Run the project script in ${project}.`);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      ok: false,
      changed: false,
      output: {
        executed: false,
        checkpointFailure: { code: 'file-size-limit', limit: 16 * 1024 * 1024 },
        recovery: { kind: 'source-scope' },
      },
    });
    expect(results[0].terminalReason).toBeUndefined();
    expect(results[1]).toMatchObject({
      ok: true,
      output: { exitCode: 0, stdout: 'narrow project checked\n' },
    });
    expect(await fs.pathExists(path.join(root, 'should-not-exist.txt'))).toBe(false);
    expect(result.status).toBe('completed');
    expect(result.executionTarget?.workspacePath).toBe(project);
  });

  it('rolls back an undeclared source mutation exactly', async () => {
    const root = await commandFixture(
      "require('fs').writeFileSync('target.txt', 'unexpected\\n'); console.log('done');\n"
    );
    const result = await executeStudioWorkspaceCommandTransaction({
      workspacePath: root,
      request: {
        executable: 'node',
        args: ['command.js'],
        purpose: 'diagnose',
      },
    });

    expect(result).toMatchObject({
      ok: false,
      changed: false,
      output: {
        observedSourceChange: true,
        changedPaths: ['target.txt'],
        rollback: { reason: 'unapproved-mutation' },
        sourceRecovery: { state: 'restored', requiresMutationDeclaration: true },
      },
    });
    expect(result.terminalReason).toBeUndefined();
    expect(result.output?.sourceRecovery?.instruction).toContain('allowSourceChanges:true');
    expect(await fs.readFile(path.join(root, 'target.txt'), 'utf8')).toBe('before\n');
  });

  it('rolls back a partially applied approved command when it fails', async () => {
    const root = await commandFixture(
      "require('fs').writeFileSync('target.txt', 'partial\\n'); process.exitCode = 1;\n"
    );
    const plan = resolveStudioWorkspaceCommandPlan({
      workspacePath: root,
      request: {
        executable: 'node',
        args: ['command.js'],
        purpose: 'format',
      },
    });
    const result = await executeStudioWorkspaceCommandTransaction({
      workspacePath: root,
      request: {
        executable: 'node',
        args: ['command.js'],
        purpose: 'format',
      },
      approval: {
        fingerprint: plan.authorizationFingerprint,
        approvedBy: 'test:user',
        approvedAt: '2026-08-29T00:00:00.000Z',
        execution: 'once',
      },
    });

    expect(result).toMatchObject({
      ok: false,
      changed: false,
      output: {
        rollback: { reason: 'failed-command' },
        sourceRecovery: { state: 'restored', requiresMutationDeclaration: false },
      },
    });
    expect(result.terminalReason).toBeUndefined();
    expect(await fs.readFile(path.join(root, 'target.txt'), 'utf8')).toBe('before\n');
  });

  it('keeps a successful explicitly approved mutation and reports process lifecycle', async () => {
    const root = await commandFixture(
      "require('fs').writeFileSync('target.txt', 'after\\n'); console.log('updated');\n"
    );
    const request = {
      executable: 'node',
      args: ['command.js'],
      purpose: 'format' as const,
    };
    const plan = resolveStudioWorkspaceCommandPlan({ workspacePath: root, request });
    const phases: string[] = [];
    const result = await executeStudioWorkspaceCommandTransaction({
      workspacePath: root,
      request,
      approval: {
        fingerprint: plan.authorizationFingerprint,
        approvedBy: 'test:user',
        approvedAt: '2026-08-29T00:00:00.000Z',
        execution: 'session',
      },
      reportProcessEvent: (event) => {
        phases.push(event.phase);
      },
    });

    expect(result).toMatchObject({
      ok: true,
      changed: true,
      output: {
        observedSourceChange: true,
        changedPaths: ['target.txt'],
        authorization: { execution: 'session' },
      },
    });
    expect(phases[0]).toBe('started');
    expect(phases.at(-1)).toBe('completed');
    expect(await fs.readFile(path.join(root, 'target.txt'), 'utf8')).toBe('after\n');
  });

  it('serializes concurrent commands that target the same source root', async () => {
    const root = await commandFixture(
      'setTimeout(() => console.log(process.argv[2]), Number(process.argv[3]));\n'
    );
    const order: string[] = [];
    const execute = (label: string, delay: string) =>
      executeStudioWorkspaceCommandTransaction({
        workspacePath: root,
        request: {
          executable: 'node',
          args: ['command.js', label, delay],
          purpose: 'diagnose',
        },
        reportProcessEvent: (event) => {
          if (event.phase === 'started' || event.phase === 'completed') {
            order.push(`${label}:${event.phase}`);
          }
        },
      });

    const [first, second] = await Promise.all([execute('first', '100'), execute('second', '0')]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(order).toEqual([
      'first:started',
      'first:completed',
      'second:started',
      'second:completed',
    ]);
  });

  it('returns machine-readable observation scopes from successful read-only commands', async () => {
    const root = await commandFixture("console.log('unused');\n");
    const initRequest = {
      executable: 'git',
      args: ['init'],
      purpose: 'build' as const,
    };
    const initPlan = resolveStudioWorkspaceCommandPlan({
      workspacePath: root,
      request: initRequest,
    });
    const initialized = await executeStudioWorkspaceCommandTransaction({
      workspacePath: root,
      request: initRequest,
      approval: {
        fingerprint: initPlan.authorizationFingerprint,
        approvedBy: 'test:user',
        approvedAt: '2026-08-31T00:00:00.000Z',
        execution: 'once',
      },
    });
    expect(initialized.ok).toBe(true);

    const observed = await executeStudioWorkspaceCommandTransaction({
      workspacePath: root,
      request: {
        executable: 'git',
        args: ['status', '--short'],
        purpose: 'inspect',
      },
    });

    expect(observed).toMatchObject({
      ok: true,
      output: {
        observationScopes: ['git-repository'],
        effects: { verificationScopes: [] },
      },
    });
  });
});
