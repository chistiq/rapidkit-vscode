import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  captureStudioScaffoldChanges,
  configureStudioScaffoldStorage,
  readStudioScaffoldComparison,
  readStudioScaffoldFileChanges,
} from '../core/studioScaffoldChanges.js';
import { hydrateStudioRepairEventFileChanges } from '../core/workspaceRepairCliClient.js';
import { redactAssistantRequestForConsumer } from '../core/consumerPathRedaction.js';
import { buildAssistantIntentRoutingPrompt } from '../core/assistantIntentRouter.js';
import { buildStudioChangedFilesSummary } from '../../webview-ui/src/lib/studioChangedFilesSummary';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});
describe('Generated source observations', () => {
  it('counts real files without model reads, persists counts, and reviews only the unchanged owned output', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scaffold-count-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    configureStudioScaffoldStorage(path.join(root, 'private'));
    await fs.outputFile(path.join(workspacePath, 'app/page.tsx'), 'first\r\nsecond\r\n');
    await fs.outputFile(path.join(workspacePath, 'empty.txt'), '');
    await fs.outputFile(path.join(workspacePath, 'README.md'), 'last line');
    await fs.outputFile(path.join(workspacePath, 'image.png'), Buffer.from([0, 128, 255]));
    for (const excluded of ['node_modules', '.git', '.workspai', '.next'])
      await fs.outputFile(
        path.join(workspacePath, excluded, 'large.txt'),
        'ignored\n'.repeat(1000)
      );
    await fs.outputFile(path.join(workspacePath, '.env.local'), 'TOKEN=private');
    await fs.outputFile(path.join(root, 'outside.txt'), 'outside\n');
    await fs.symlink(path.join(root, 'outside.txt'), path.join(workspacePath, 'linked.txt'));
    const result = await captureStudioScaffoldChanges({
      workspacePath,
      sessionId: 's',
      requestId: 'r',
    });
    expect(result.scaffoldSummary).toMatchObject({
      fileCount: 4,
      addedLines: 3,
      binaryFiles: 1,
      excludedEntries: 6,
      truncated: false,
      reversible: false,
    });
    const id = result.transactionId as string;
    const comparison = await readStudioScaffoldComparison(workspacePath, id, 'app/page.tsx');
    expect(comparison).toMatchObject({ before: '', after: 'first\r\nsecond\r\n' });
    expect(await readStudioScaffoldFileChanges(workspacePath, id)).toEqual(result.fileChanges);
    const event = await hydrateStudioRepairEventFileChanges({
      workspacePath,
      event: { type: 'tool.completed', data: { output: { transactionId: id } } },
    });
    expect((event.data.output as Record<string, unknown>).fileChanges).toEqual(result.fileChanges);
    const summary = buildStudioChangedFilesSummary([
      {
        action: 'create-workspace',
        status: 'done',
        title: 'Created',
        summary: '',
        transactionId: id,
        transactionState: 'observed',
        fileChanges: await readStudioScaffoldFileChanges(workspacePath, id),
      },
    ]);
    expect(summary).toMatchObject({ addedLines: 3, removedLines: 0 });
    expect(summary.files).toHaveLength(4);
    expect(summary.undoTransactionId).toBeUndefined();
    await fs.writeFile(path.join(workspacePath, 'app/page.tsx'), 'user change\n');
    expect(
      (await readStudioScaffoldFileChanges(workspacePath, id)).find(
        (file) => file.relativePath === 'app/page.tsx'
      )
    ).toMatchObject({ stale: true, addedLines: 2 });
    await expect(readStudioScaffoldComparison(workspacePath, id, 'app/page.tsx')).rejects.toThrow(
      'changed after'
    );
    await expect(readStudioScaffoldComparison(workspacePath, id, '../outside.txt')).rejects.toThrow(
      'No text'
    );
    await expect(readStudioScaffoldComparison(root, id, 'app/page.tsx')).rejects.toThrow();
    await expect(readStudioScaffoldComparison(workspacePath, id, 'image.png')).rejects.toThrow(
      'No text'
    );
  });
  it('reports bounded coverage rather than claiming oversized output has zero lines', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scaffold-limit-'));
    roots.push(root);
    configureStudioScaffoldStorage(path.join(root, 'private'));
    await fs.outputFile(path.join(root, 'source', 'huge.txt'), 'x'.repeat(2 * 1024 * 1024 + 1));
    const result = await captureStudioScaffoldChanges({
      workspacePath: path.join(root, 'source'),
      sessionId: 's',
      requestId: 'r',
    });
    expect(result.scaffoldSummary).toMatchObject({
      fileCount: 0,
      excludedEntries: 1,
      truncated: true,
    });
  });
});
describe('Logical destination privacy', () => {
  it.each([
    '/.workspai/workspaces/article-blog-workspace',
    '/opt/fixtures/private/.workspai/workspaces/article-blog-workspace',
    '~/.workspai/workspaces/article-blog-workspace',
    'C:\\Users\\private\\.workspai\\workspaces\\article-blog-workspace',
  ])('preserves the requested destination from %s', (candidate) => {
    const request = `Add a test to ${candidate}`;
    const text = redactAssistantRequestForConsumer(request);
    expect(text).toContain('managed workspace "article-blog-workspace"');
    expect(text).not.toContain('private');
    expect(
      buildAssistantIntentRoutingPrompt({
        task: request,
        selectedMode: 'agent',
        hasProjectScope: false,
      })
    ).toContain('article-blog-workspace');
  });
});
