import { describe, expect, it } from 'vitest';
import {
  appendWorkspaceCommandRefresh,
  resolveWorkspaceCommandSafetyPolicy,
} from '../core/workspaceCommandSafety';

describe('workspaceCommandSafety', () => {
  it('keeps high-risk workspace operations behind explicit safety policies', () => {
    expect(resolveWorkspaceCommandSafetyPolicy('workspacePolicySet')).toMatchObject({
      risk: 'write',
      confirmation: expect.objectContaining({ confirmLabel: 'Update Policy' }),
    });
    expect(resolveWorkspaceCommandSafetyPolicy('cacheClear')).toMatchObject({
      risk: 'destructive',
      confirmation: expect.objectContaining({ confirmLabel: 'Clear Cache' }),
    });
    expect(resolveWorkspaceCommandSafetyPolicy('mirrorRotate')).toMatchObject({
      risk: 'destructive',
      confirmation: expect.objectContaining({ confirmLabel: 'Rotate Keys' }),
    });
    expect(resolveWorkspaceCommandSafetyPolicy('workspaceSnapshotRestore')).toMatchObject({
      risk: 'destructive',
      confirmation: expect.objectContaining({ confirmLabel: 'Restore Snapshot' }),
    });
    expect(resolveWorkspaceCommandSafetyPolicy('workspaceFoundationEnsure')).toMatchObject({
      risk: 'write',
    });
  });

  it('appends evidence refresh commands for mutating operational handlers', () => {
    expect(
      appendWorkspaceCommandRefresh('workspacePolicySet', [['workspace', 'policy', 'set']])
    ).toEqual([
      ['workspace', 'policy', 'set'],
      ['workspace', 'policy', 'show'],
    ]);
    expect(appendWorkspaceCommandRefresh('infraDown', [['infra', 'down']])).toEqual([
      ['infra', 'down'],
      ['infra', 'status'],
    ]);
    expect(appendWorkspaceCommandRefresh('mirrorRotate', [['mirror', 'rotate']])).toEqual([
      ['mirror', 'rotate'],
      ['mirror', 'status'],
    ]);
    expect(
      appendWorkspaceCommandRefresh('workspaceSnapshotRestore', [['snapshot', 'restore']])
    ).toEqual([
      ['snapshot', 'restore'],
      ['snapshot', 'list'],
    ]);
    expect(
      appendWorkspaceCommandRefresh('workspaceFoundationEnsure', [
        ['workspace', 'foundation', 'ensure'],
      ])
    ).toEqual([
      ['workspace', 'foundation', 'ensure'],
      ['workspace', 'contract', 'inspect', '--json'],
    ]);
  });

  it('leaves commands without a safety policy unchanged', () => {
    expect(
      appendWorkspaceCommandRefresh('workspaceModel', [['workspace', 'model', '--json']])
    ).toEqual([['workspace', 'model', '--json']]);
  });
});
