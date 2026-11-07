import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readStudioProjectContext } from '../core/studioProjectContext.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-project-context-'));
  roots.push(root);
  const file = path.join(root, '.workspai/reports/project-context-agent.json');
  const input = { projectPath: root, projectName: 'api', workspaceName: 'product' };
  const context = {
    schemaVersion: 'project-context-agent.v1',
    workspace: { name: 'product' },
    project: {
      name: 'api',
      runtime: 'python',
      framework: 'fastapi',
      commands: { supported: ['test'], unsupported: ['modules'] },
      importantFiles: ['pyproject.toml', '../outside', '/private/key', 'C:\\private\\key'],
    },
    unrelatedExport: 'do not return this body'.repeat(1000),
  };
  await fs.outputJSON(file, context);
  return { root, file, input, context };
}
describe('Bounded post-onboarding project context', () => {
  it('returns membership-matched hints, proof navigation and a hash without full exports or unsafe paths', async () => {
    const f = await fixture();
    const result = await readStudioProjectContext(f.input);
    expect(result).toMatchObject({
      status: 'available',
      project: {
        name: 'api',
        runtime: 'python',
        supportedCommands: ['test'],
        unsupportedCommands: ['modules'],
        importantFiles: ['pyproject.toml'],
      },
      graph: { project: 'api', scope: 'project', limit: 8 },
    });
    expect(result).toHaveProperty('sha256', expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(JSON.stringify(result)).not.toContain('do not return this body');
    expect(JSON.stringify(result)).not.toContain(f.root);
    expect(JSON.stringify(result).length).toBeLessThan(1800);
  });
  it('does not treat another project/workspace or an oversized document as context for this target', async () => {
    const f = await fixture();
    expect(await readStudioProjectContext({ ...f.input, projectName: 'other' })).toMatchObject({
      status: 'unavailable',
    });
    expect(await readStudioProjectContext({ ...f.input, workspaceName: 'other' })).toMatchObject({
      status: 'unavailable',
    });
    await fs.writeFile(f.file, ' '.repeat(65537));
    expect(await readStudioProjectContext(f.input)).toMatchObject({ status: 'unavailable' });
    await fs.remove(f.file);
    expect(await readStudioProjectContext(f.input)).toMatchObject({ status: 'unavailable' });
    await fs.ensureDir(f.file);
    expect(await readStudioProjectContext(f.input)).toMatchObject({ status: 'unavailable' });
  });
  it('refuses redirected context even when its JSON claims the expected identities', async () => {
    const f = await fixture();
    const other = path.join(f.root, 'private-context.json');
    await fs.move(f.file, other);
    await fs.symlink(other, f.file);
    expect(await readStudioProjectContext(f.input)).toMatchObject({ status: 'unavailable' });
  });
});
