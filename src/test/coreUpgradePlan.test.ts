import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveCoreUpgradePlan } from '../core/coreUpgradePlan';

const roots: string[] = [];

async function workspaceRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-core-upgrade-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('RapidKit Core upgrade ownership', () => {
  it('upgrades through the workspace interpreter when .venv is healthy', async () => {
    const root = await workspaceRoot();
    const python = path.join(root, '.venv', 'bin', 'python');
    await fs.ensureFile(python);

    await expect(resolveCoreUpgradePlan(root, 'linux')).resolves.toEqual({
      kind: 'workspace',
      commands: [`${python} -m pip install --upgrade rapidkit-core`],
    });
  });

  it('repairs a broken workspace environment instead of falling through to pipx', async () => {
    const root = await workspaceRoot();
    await fs.ensureDir(path.join(root, '.venv'));

    const plan = await resolveCoreUpgradePlan(root, 'linux');

    expect(plan.kind).toBe('workspace-repair');
    expect(plan.backupPath).toBe(`${root}/.venv.broken`);
    expect(plan.commands[0]).toBe(`mv ${root}/.venv ${root}/.venv.broken`);
    expect(plan.commands[1]).toBe(`python3 -m venv ${root}/.venv`);
    expect(plan.commands[2]).toContain(
      `${root}/.venv/bin/python -m pip install --upgrade rapidkit-core`
    );
    expect(plan.commands.join('\n')).not.toContain('pipx');
  });

  it('creates a local environment when the workspace has no local Python environment', async () => {
    const root = await workspaceRoot();

    await expect(resolveCoreUpgradePlan(root, 'linux')).resolves.toEqual({
      kind: 'workspace-install',
      commands: [
        `python3 -m venv ${root}/.venv`,
        `${root}/.venv/bin/python -m pip install --upgrade rapidkit-core`,
      ],
    });
  });
});
