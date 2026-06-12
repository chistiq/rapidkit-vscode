import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { normalizeAIActionContract } from '../core/aiActionContract';
import {
  captureAIActionPreflightSnapshot,
  compareAIActionPreflightSnapshots,
  computeAIActionFingerprint,
} from '../core/aiActionSafety';

describe('aiActionSafety', () => {
  let workspacePath = '';

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-ai-safety-'));
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('computes stable fingerprints from action contracts', () => {
    const contract = normalizeAIActionContract({
      actionType: 'fix',
      summary: 'Patch auth guard',
      affectedFiles: ['src/auth.ts'],
      proposedCommands: ['npm test'],
      verificationCommands: ['npm test'],
      rollbackPlan: ['git checkout -- src/auth.ts'],
      confidence: 0.9,
      requiresApproval: true,
    })!;

    expect(computeAIActionFingerprint(contract)).toBe(computeAIActionFingerprint(contract));
    expect(computeAIActionFingerprint(contract)).toHaveLength(64);
  });

  it('detects affected file changes between review and apply', async () => {
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspacePath, 'src', 'auth.ts'), 'export const ok = true;\n');
    const contract = normalizeAIActionContract({
      actionType: 'fix',
      summary: 'Patch auth guard',
      affectedFiles: ['src/auth.ts'],
      verificationCommands: ['npm test'],
      rollbackPlan: ['git checkout -- src/auth.ts'],
      confidence: 0.9,
      requiresApproval: true,
    })!;

    const baseline = await captureAIActionPreflightSnapshot(workspacePath, contract);
    await fs.writeFile(path.join(workspacePath, 'src', 'auth.ts'), 'export const ok = false;\n');
    const current = await captureAIActionPreflightSnapshot(workspacePath, contract);

    const comparison = compareAIActionPreflightSnapshots(baseline, current);

    expect(comparison.stale).toBe(true);
    expect(comparison.issues.join('\n')).toContain('src/auth.ts');
  });
});
