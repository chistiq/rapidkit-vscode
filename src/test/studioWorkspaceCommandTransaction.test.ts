import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveStudioWorkspaceCommandPlan } from '../core/studioWorkspaceCommand.js';
import { executeStudioWorkspaceCommandTransaction } from '../core/studioWorkspaceCommandTransaction.js';

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
