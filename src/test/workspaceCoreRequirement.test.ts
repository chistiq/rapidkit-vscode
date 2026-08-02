import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveWorkspaceCoreRequirement } from '../core/workspaceCoreRequirement';

const roots: string[] = [];

async function workspaceFixture(input: {
  profile: string;
  projects?: Array<Record<string, unknown>>;
}): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-core-requirement-'));
  roots.push(root);
  await fs.outputJSON(path.join(root, '.workspai', 'workspace.json'), {
    profile: input.profile,
  });
  await fs.outputJSON(path.join(root, '.workspai', 'workspace.contract.json'), {
    workspace: { name: path.basename(root), profile: input.profile },
    projects: input.projects ?? [],
  });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('workspace RapidKit Core requirement', () => {
  it('does not assign a global Core installation to an empty minimal workspace', async () => {
    const root = await workspaceFixture({ profile: 'minimal' });

    await expect(resolveWorkspaceCoreRequirement(root)).resolves.toEqual({
      required: false,
      reason: 'not-required',
      profile: 'minimal',
    });
  });

  it('requires Core for Python profiles and FastAPI project contracts', async () => {
    const pythonRoot = await workspaceFixture({ profile: 'python-only' });
    const fastApiRoot = await workspaceFixture({
      profile: 'minimal',
      projects: [{ kit: 'fastapi.standard', modules: [] }],
    });

    await expect(resolveWorkspaceCoreRequirement(pythonRoot)).resolves.toMatchObject({
      required: true,
      reason: 'profile',
    });
    await expect(resolveWorkspaceCoreRequirement(fastApiRoot)).resolves.toMatchObject({
      required: true,
      reason: 'python-kit',
    });
  });

  it('keeps ownership with an existing workspace environment regardless of profile', async () => {
    const root = await workspaceFixture({ profile: 'minimal' });
    await fs.ensureDir(path.join(root, '.venv'));

    await expect(resolveWorkspaceCoreRequirement(root)).resolves.toEqual({
      required: true,
      reason: 'local-environment',
    });
  });

  it('honors an explicit Python engine opt-out before profile defaults', async () => {
    const root = await workspaceFixture({ profile: 'polyglot' });
    await fs.outputJSON(path.join(root, '.workspai', 'workspace.json'), {
      profile: 'polyglot',
      engine: {
        python_core: {
          status: 'skipped',
          reason: 'user-opted-out',
        },
      },
    });

    await expect(resolveWorkspaceCoreRequirement(root)).resolves.toEqual({
      required: false,
      reason: 'user-opted-out',
      profile: 'polyglot',
    });
  });
});
