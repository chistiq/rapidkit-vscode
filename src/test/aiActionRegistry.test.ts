import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getAIActionRegistryPath,
  getLatestRunnableAIAction,
  readAIActionRegistry,
  recordAIActionContract,
  recordAIActionExecution,
} from '../core/aiActionRegistry';
import { normalizeAIActionContract, validateAIActionContract } from '../core/aiActionContract';

describe('aiActionRegistry', () => {
  let workspacePath = '';

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-ai-actions-'));
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('persists and reloads action contracts', async () => {
    const contract = normalizeAIActionContract({
      actionType: 'fix',
      summary: 'Patch workspace guard',
      affectedFiles: ['src/guard.ts'],
      verificationCommands: ['npm test'],
      rollbackPlan: ['git checkout -- src/guard.ts'],
      confidence: 0.95,
      requiresApproval: true,
    });
    const validation = validateAIActionContract(contract, {
      workspacePath,
      strict: true,
    });

    const entry = await recordAIActionContract(workspacePath, {
      contract: contract!,
      validation,
      provider: 'test-provider',
      rawJson: '{"ok":true}',
    });
    const registry = await readAIActionRegistry(workspacePath);

    expect(entry.id).toContain('patch-workspace-guard');
    expect(entry.fingerprint).toHaveLength(64);
    expect(entry.lifecycleStatus).toBe('proposed');
    expect(entry.preflight.fingerprint).toBe(entry.fingerprint);
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].provider).toBe('test-provider');
    expect(await fs.stat(getAIActionRegistryPath(workspacePath))).toBeTruthy();
  });

  it('appends execution history to an existing action', async () => {
    const contract = normalizeAIActionContract({
      actionType: 'verify',
      summary: 'Verify gates',
      affectedFiles: ['package.json'],
      verificationCommands: ['npm test'],
      rollbackPlan: [],
      confidence: 0.8,
      requiresApproval: true,
    })!;
    const validation = validateAIActionContract(contract, {
      workspacePath,
      strict: true,
    });
    const entry = await recordAIActionContract(workspacePath, { contract, validation });

    const registry = await recordAIActionExecution(workspacePath, entry.id, {
      operation: 'verify',
      ok: true,
      summary: 'verify completed successfully.',
      evidencePath: path.join(workspacePath, '.workspai/evidence/ai-actions/run.json'),
      evidenceSha256: 'a'.repeat(64),
      evidenceSizeBytes: 2048,
      commandCount: 2,
      failedCommandCount: 0,
      failedCommands: [],
    });

    expect(registry.entries[0].executions).toHaveLength(1);
    expect(registry.entries[0].executions[0].operation).toBe('verify');
    expect(registry.entries[0].executions[0].commandCount).toBe(2);
    expect(registry.entries[0].executions[0].evidenceSha256).toHaveLength(64);
    expect(registry.entries[0].executions[0].evidenceSizeBytes).toBe(2048);
    expect(registry.entries[0].lifecycleStatus).toBe('verified');
  });

  it('returns the newest non-blocked action', async () => {
    const blocked = normalizeAIActionContract({
      actionType: 'fix',
      summary: 'Blocked',
      affectedFiles: ['../outside'],
      verificationCommands: ['npm test'],
      rollbackPlan: ['git checkout -- ../outside'],
      confidence: 0.9,
      requiresApproval: true,
    })!;
    await recordAIActionContract(workspacePath, {
      contract: blocked,
      validation: validateAIActionContract(blocked, { workspacePath, strict: true }),
    });

    const runnable = normalizeAIActionContract({
      actionType: 'impact',
      summary: 'Runnable',
      affectedFiles: ['src/app.ts'],
      verificationCommands: ['npm test'],
      rollbackPlan: [],
      confidence: 0.9,
      requiresApproval: true,
    })!;
    const entry = await recordAIActionContract(workspacePath, {
      contract: runnable,
      validation: validateAIActionContract(runnable, { workspacePath, strict: true }),
    });

    const latest = getLatestRunnableAIAction(await readAIActionRegistry(workspacePath));
    expect(latest?.id).toBe(entry.id);
  });
});
