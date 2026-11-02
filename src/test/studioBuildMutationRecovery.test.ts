import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';
import {
  configureStudioNativeStorage,
  createStudioNativeWorkspaceCapabilities,
  reviewStudioNativeCheckpoint,
} from '../core/studioNativeWorkspace.js';
import { hydrateStudioRepairEventFileChanges } from '../core/workspaceRepairCliClient.js';
import { parseSidebarStudioActionProgress } from '../../webview-ui/src/lib/sidebarStudioActionProgress.js';
import { buildStudioChangedFilesSummary } from '../../webview-ui/src/lib/studioChangedFilesSummary.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('Source-producing build recovery', () => {
  it('continues after an exact rollback, approves the declared retry, verifies and replays an actionable checkpoint', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-build-recovery-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    await fs.ensureDir(workspacePath);
    configureStudioNativeStorage(path.join(root, 'private'));
    await fs.writeFile(path.join(workspacePath, 'source.ts'), 'previous request edit\n');
    await fs.writeFile(path.join(workspacePath, 'generated.d.ts'), 'before\n');
    await fs.writeFile(
      path.join(workspacePath, 'compile.cjs'),
      "require('fs').writeFileSync('generated.d.ts', 'export {};\\n'); console.log('Compiled successfully');"
    );
    const native = createStudioNativeWorkspaceCapabilities({
      workspacePath,
      inspectedSource: new Map(),
      diagnostics: async () => ({ ok: true, output: { diagnostics: [] } }),
      inspectChanges: async () => ({ ok: true, output: {} }),
    });
    const registry = createStudioAgentWorkspaiToolRegistry({
      host: native as unknown as StudioAgentWorkspaiToolHost,
      assistantMode: 'agent',
      executionAuthority: 'workspace',
      cardId: 'assistant:agent',
    });
    const command = { executable: 'node', args: ['compile.cjs'], purpose: 'build' as const };
    const approvals: string[] = [];
    let turn = 0;
    const session = new StudioAgentSession(
      {
        id: 'build-recovery',
        workspacePath,
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        async requestToolApproval(request) {
          approvals.push(request.fingerprint);
          return { approved: true, fingerprint: request.fingerprint, approvedBy: 'test:user' };
        },
      },
      {
        async next(context) {
          turn++;
          if (turn === 1)
            return {
              type: 'tool',
              toolName: 'run-workspace-command',
              input: command,
              reason: 'Build.',
            };
          if (turn === 2) {
            expect(context.latestObservation).toMatchObject({
              ok: false,
              changed: false,
              output: { exitCode: 0, sourceRecovery: { state: 'restored' } },
            });
            expect(context.latestObservation?.terminalReason).toBeUndefined();
            expect(await fs.readFile(path.join(workspacePath, 'generated.d.ts'), 'utf8')).toBe(
              'before\n'
            );
            return {
              type: 'tool',
              toolName: 'run-workspace-command',
              input: { ...command, allowSourceChanges: true },
              reason: 'Accept the observed generator through exact approval.',
            };
          }
          if (turn === 3)
            return {
              type: 'tool',
              toolName: 'inspect-workspace-changes',
              input: {},
              reason: 'Review.',
            };
          if (turn === 4)
            return {
              type: 'tool',
              toolName: 'verify-blocker',
              input: {},
              reason: 'Verify current source.',
            };
          return {
            type: 'complete',
            summary: 'Build passed; generated declarations retained and changes reviewed.',
          };
        },
      },
      registry,
      { save: async () => {} }
    );
    const result = await session.run('Build and verify the project.');
    expect(
      result.status,
      JSON.stringify(
        result.events
          .filter((event) => ['session.failed', 'tool.failed'].includes(event.type))
          .map((event) => event.data)
      )
    ).toBe('completed');
    expect(turn).toBe(5);
    expect(approvals).toHaveLength(1);
    expect(result.events.some((event) => event.type === 'session.failed')).toBe(false);
    expect(result.nativeTransactionIds).toHaveLength(1);
    const build = result.events.find(
      (event) => event.type === 'tool.completed' && event.data.toolName === 'run-workspace-command'
    )!;
    const output = build.data.output as {
      transactionId: string;
      nativeTransactionId: string;
      commandTransactionId: string;
    };
    expect(output.transactionId).toBe(output.nativeTransactionId);
    expect(output.transactionId).toMatch(/^native-/);
    expect(output.commandTransactionId).not.toBe(output.transactionId);
    expect(result.nativeTransactionIds).toContain(output.transactionId);
    expect(JSON.stringify(build)).not.toContain('export {};');

    // An older saved event used the temporary command ID at the top level.
    // Hydration must normalize it to the owned review receipt for file actions.
    const replay = await hydrateStudioRepairEventFileChanges({
      workspacePath,
      event: {
        ...build,
        data: { ...build.data, output: { ...output, transactionId: output.commandTransactionId } },
      },
    });
    const progress = parseSidebarStudioActionProgress({
      action: 'run-workspace-command',
      status: 'done',
      ...(replay.data.output as object),
    })!;
    expect(progress.transactionId).toBe(output.nativeTransactionId);
    const summary = buildStudioChangedFilesSummary([progress]);
    expect(summary.files).toHaveLength(1);
    expect(summary).toMatchObject({
      addedLines: 1,
      removedLines: 1,
      undoTransactionId: output.nativeTransactionId,
    });
    expect(summary.files[0].comparable).toBe(true);

    await reviewStudioNativeCheckpoint({
      sessionId: result.id,
      requestIds: [build.requestId!],
      transactionIds: result.nativeTransactionIds!,
      workspaceTrusted: true,
      action: 'restore',
    });
    expect(await fs.readFile(path.join(workspacePath, 'generated.d.ts'), 'utf8')).toBe('before\n');
    expect(await fs.readFile(path.join(workspacePath, 'source.ts'), 'utf8')).toBe(
      'previous request edit\n'
    );
  });
});
