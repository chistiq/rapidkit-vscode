import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  inspectStudioAgentFiles,
  parseStudioAgentAction,
  StudioAgentSession,
  studioAgentActivityKind,
  studioAgentRepairIsComplete,
} from '../core/sidebarStudioAgentRuntime.js';

const schema = 'workspai.studio-agent-action.v1';

describe('sidebar Studio agent runtime contract', () => {
  it('derives completion only from a successful verify and a cleared blocker', () => {
    expect(
      studioAgentRepairIsComplete({
        verifyRan: true,
        verifySucceeded: true,
        blockerSignatureBefore: 'blocked-v1',
        blockerSignatureAfter: 'healthy-v2',
        cardBlocking: false,
      })
    ).toBe(true);
    expect(
      studioAgentRepairIsComplete({
        verifyRan: true,
        verifySucceeded: true,
        blockerSignatureBefore: 'same',
        blockerSignatureAfter: 'same',
        cardBlocking: true,
      })
    ).toBe(false);
    expect(studioAgentActivityKind('reading-agent-evidence')).toBe('inspect');
    expect(studioAgentActivityKind('applying-remediation-step')).toBe('fix');
    expect(studioAgentActivityKind('verifying-patch')).toBe('verify');
  });

  it('separates repeat prevention from continuation across evidence generations', () => {
    const session = new StudioAgentSession('session-1', 'blocked-v1', 3, 2);
    expect(session.authorizeInspection(['src/a.ts'])).toEqual({ allowed: true });
    expect(session.authorizeInspection(['src/a.ts'])).toEqual({
      allowed: false,
      reason: 'already-observed',
    });
    expect(session.authorizeCommand('workspaceVerify', 'generation-1')).toEqual({ allowed: true });
    expect(session.authorizeCommand('workspaceVerify', 'generation-1')).toEqual({
      allowed: false,
      reason: 'unchanged-generation',
    });
    expect(session.authorizeCommand('workspaceVerify', 'generation-2')).toEqual({ allowed: true });
    expect(session.snapshot()).toMatchObject({
      id: 'session-1',
      blockerSignature: 'blocked-v1',
      inspectedPaths: ['src/a.ts'],
      commands: [{ commandId: 'workspaceVerify', evidenceGeneration: 'generation-2' }],
    });
  });

  it('parses strict inspect and governed command actions', () => {
    expect(
      parseStudioAgentAction(
        JSON.stringify({
          schemaVersion: schema,
          action: 'inspect-files',
          paths: ['src/a.ts'],
          reason: 'Inspect target',
        })
      )
    ).toMatchObject({ type: 'inspect-files', paths: ['src/a.ts'] });
    expect(
      parseStudioAgentAction(
        `\`\`\`json\n${JSON.stringify({ schemaVersion: schema, action: 'run-command', commandId: 'workspaceContractVerify', reason: 'Refresh truth' })}\n\`\`\``
      )
    ).toMatchObject({ type: 'run-command', commandId: 'workspaceContractVerify' });
    expect(
      parseStudioAgentAction(
        JSON.stringify({
          schemaVersion: schema,
          action: 'run-command',
          commandId: 'checkWorkspaceHealth',
          reason: 'Refresh dependency evidence',
        })
      )
    ).toMatchObject({ type: 'run-command', commandId: 'checkWorkspaceHealth' });
  });

  it('rejects prose, unknown fields, shell text, traversal, duplicates, and unknown commands', () => {
    expect(
      parseStudioAgentAction(
        `I will inspect\n${JSON.stringify({ schemaVersion: schema, action: 'stop', reason: 'no' })}`
      )
    ).toBeNull();
    expect(
      parseStudioAgentAction(
        JSON.stringify({ schemaVersion: schema, action: 'stop', reason: 'no', extra: true })
      )
    ).toBeNull();
    expect(
      parseStudioAgentAction(
        JSON.stringify({
          schemaVersion: schema,
          action: 'run-command',
          commandId: 'rm -rf /',
          reason: 'bad',
        })
      )
    ).toBeNull();
    expect(
      parseStudioAgentAction(
        JSON.stringify({
          schemaVersion: schema,
          action: 'inspect-files',
          paths: ['../secret'],
          reason: 'bad',
        })
      )
    ).toBeNull();
    expect(
      parseStudioAgentAction(
        JSON.stringify({
          schemaVersion: schema,
          action: 'inspect-files',
          paths: ['a.ts', 'a.ts'],
          reason: 'bad',
        })
      )
    ).toBeNull();
  });

  it('reads bounded source and allowlisted evidence while rejecting sensitive and symlink targets', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-agent-runtime-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-agent-outside-'));
    try {
      await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
      await fs.mkdir(path.join(workspace, '.workspai', 'reports'), { recursive: true });
      await fs.writeFile(path.join(workspace, 'src', 'a.ts'), 'export const a = 1;\n');
      await fs.writeFile(path.join(workspace, '.env'), 'TOKEN=secret\n');
      await fs.writeFile(
        path.join(workspace, '.workspai', 'reports', 'verify.json'),
        '{"status":"fail"}\n'
      );
      await fs.writeFile(path.join(outside, 'escape.ts'), 'outside\n');
      await fs.symlink(path.join(outside, 'escape.ts'), path.join(workspace, 'src', 'escape.ts'));

      const source = await inspectStudioAgentFiles({
        workspacePath: workspace,
        paths: ['src/a.ts'],
        kind: 'source',
      });
      expect(source[0]).toMatchObject({ path: 'src/a.ts', kind: 'source', truncated: false });
      expect(source[0].sha256).toMatch(/^[a-f0-9]{64}$/);

      await expect(
        inspectStudioAgentFiles({ workspacePath: workspace, paths: ['.env'], kind: 'source' })
      ).rejects.toThrow('not authorized');
      await expect(
        inspectStudioAgentFiles({
          workspacePath: workspace,
          paths: ['src/escape.ts'],
          kind: 'source',
        })
      ).rejects.toThrow('outside');
      await expect(
        inspectStudioAgentFiles({
          workspacePath: workspace,
          paths: ['.workspai/reports/verify.json'],
          kind: 'evidence',
          authorizedEvidencePaths: [],
        })
      ).rejects.toThrow('not authorized');
      await expect(
        inspectStudioAgentFiles({
          workspacePath: workspace,
          paths: ['.workspai/reports/verify.json'],
          kind: 'evidence',
          authorizedEvidencePaths: ['.workspai/reports/verify.json'],
        })
      ).resolves.toHaveLength(1);
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});
