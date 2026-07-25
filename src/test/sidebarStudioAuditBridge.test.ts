import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readAIActionRegistry } from '../core/aiActionRegistry.js';
import { recordSidebarStudioFixAudit } from '../core/sidebarStudioAuditBridge.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';

const runRapidkitStreaming = vi.fn();

vi.mock('../core/streamingRapidkitRunner.js', () => ({
  runRapidkitStreaming: (...args: unknown[]) => runRapidkitStreaming(...args),
}));

describe('sidebarStudioAuditBridge (roadmap 3.27)', () => {
  let workspacePath = '';

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-sidebar-audit-'));
    runRapidkitStreaming.mockReset();
    runRapidkitStreaming.mockResolvedValue({ failed: false, exitCode: 0, stdout: '', stderr: '' });
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('records sidebar Studio fix entries in the AI action registry', async () => {
    const handoff: StudioBlockerHandoff = {
      schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
      cardId: 'card-verify',
      cardStatus: 'fail',
      blockers: ['env missing'],
      sourceCommand: 'rapidkit doctor --fix',
      dashboardCommandId: 'projectDoctor',
      executionChannel: 'background',
      capabilityGate: 'doctor project',
      safetyRisk: 'write',
      safetyConfirmation: 'Apply Fix',
      safetyRefreshCommands: ['npx rapidkit doctor workspace --json'],
      scope: 'workspace',
      blockerSignature: 'sig-verify',
      resolutionClass: 'config-fixable',
      verifyCommand: 'rapidkit workspace verify --json',
      artifactPath: '.workspai/evidence/verify.json',
      handoffSource: 'dashboard',
      workspacePath,
    };

    const result = await recordSidebarStudioFixAudit({
      workspacePath,
      handoff,
      kind: 'auto-fix',
      actionId: 'doctor-fix',
      summary: 'Applied doctor --fix for missing env keys.',
      ok: true,
      appliedFixes: [{ path: '.env', action: 'doctor-fix', outcome: 'applied' }],
    });
    expect(result).toMatchObject({
      ok: true,
      registryRecorded: true,
      feedbackRecorded: true,
      stale: false,
    });

    const registry = await readAIActionRegistry(workspacePath);
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].provider).toBe('workspai-sidebar-studio');
    expect(registry.entries[0].contract.summary).toContain('[sidebar-studio:auto-fix]');
    expect(registry.entries[0].contract.affectedFiles).toEqual(['.env']);
    expect(registry.entries[0].executions).toHaveLength(1);
    expect(registry.entries[0].executions[0].operation).toBe('apply');
    expect(registry.entries[0].executions[0].ok).toBe(true);
    expect(JSON.parse(registry.entries[0].rawJson)).toMatchObject({
      dashboardCommandId: 'projectDoctor',
      executionChannel: 'background',
      capabilityGate: 'doctor project',
      safetyRisk: 'write',
      safetyConfirmation: 'Apply Fix',
      safetyRefreshCommands: ['npx rapidkit doctor workspace --json'],
    });
    const feedbackPayload = JSON.parse(runRapidkitStreaming.mock.calls[0][0].stdin);
    expect(feedbackPayload).toMatchObject({
      dashboardCommandId: 'projectDoctor',
      executionChannel: 'background',
      capabilityGate: 'doctor project',
      safetyRisk: 'write',
      safetyConfirmation: 'Apply Fix',
      safetyRefreshCommands: ['npx rapidkit doctor workspace --json'],
      commandsRun: ['rapidkit doctor --fix', 'rapidkit workspace verify --json'],
    });
  });

  it('hashes evidence artifact when present on disk', async () => {
    const evidenceDir = path.join(workspacePath, '.workspai', 'evidence');
    await fs.mkdir(evidenceDir, { recursive: true });
    const evidencePath = path.join(evidenceDir, 'verify.json');
    await fs.writeFile(evidencePath, '{"status":"fail"}\n', 'utf8');

    const handoff: StudioBlockerHandoff = {
      schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
      cardId: 'card-evidence',
      cardStatus: 'fail',
      blockers: ['verify failed'],
      sourceCommand: 'rapidkit workspace verify',
      scope: 'workspace',
      blockerSignature: 'sig-evidence',
      resolutionClass: 'semantic-attention',
      verifyCommand: 'rapidkit workspace verify --json',
      artifactPath: '.workspai/evidence/verify.json',
      handoffSource: 'dashboard',
      workspacePath,
    };

    const result = await recordSidebarStudioFixAudit({
      workspacePath,
      handoff,
      kind: 'verify-handoff',
      actionId: 'verify-handoff',
      summary: 'Verify once after Studio fix.',
      ok: true,
    });
    expect(result.ok).toBe(true);

    const registry = await readAIActionRegistry(workspacePath);
    expect(registry.entries[0].executions[0].operation).toBe('verify');
    expect(registry.entries[0].executions[0].evidenceSha256).toHaveLength(64);
    expect(registry.entries[0].executions[0].evidenceSizeBytes).toBeGreaterThan(0);
  });

  it('preserves registry audit and marks feedback history stale when feedback CLI fails', async () => {
    runRapidkitStreaming.mockResolvedValueOnce({
      failed: true,
      exitCode: 2,
      stdout: '',
      stderr: 'feedback unavailable',
    });

    const result = await recordSidebarStudioFixAudit({
      workspacePath,
      kind: 'ship-loop-step',
      actionId: 'readiness',
      summary: 'Readiness failed.',
      ok: false,
    });

    expect(result).toMatchObject({
      ok: false,
      registryRecorded: true,
      feedbackRecorded: false,
      stale: true,
      retryable: true,
    });
    expect(result.error).toContain('feedback unavailable');

    const registry = await readAIActionRegistry(workspacePath);
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].executions[0].ok).toBe(false);
  });

  it('records Studio patch metadata in registry raw audit and feedback payload', async () => {
    let stdinPayload: Record<string, unknown> | null = null;
    runRapidkitStreaming.mockImplementationOnce(async (input: { stdin?: string }) => {
      stdinPayload = input.stdin ? JSON.parse(input.stdin) : null;
      return { failed: false, exitCode: 0, stdout: '', stderr: '' };
    });

    const result = await recordSidebarStudioFixAudit({
      workspacePath,
      kind: 'apply-patch',
      actionId: 'apply-debug-patch',
      summary: 'Applied selected Studio patches.',
      ok: true,
      appliedFixes: [{ path: 'src/config.ts', action: 'apply-debug-patch', outcome: 'applied' }],
      rollbackCommand: 'git checkout -- "src/config.ts"',
      patchMetadata: {
        patchId: 'patch-apply-debug-patch',
        sourceAction: 'apply-patch',
        reviewRequired: true,
        appliedCount: 1,
        rejectedCount: 1,
        failedCount: 0,
        affectedFiles: ['src/config.ts'],
        rollbackCommand: 'git checkout -- "src/config.ts"',
      },
    });

    expect(result.ok).toBe(true);
    expect(stdinPayload?.patchMetadata).toMatchObject({
      patchId: 'patch-apply-debug-patch',
      reviewRequired: true,
      affectedFiles: ['src/config.ts'],
    });

    const registry = await readAIActionRegistry(workspacePath);
    expect(JSON.parse(registry.entries[0].rawJson).patchMetadata).toMatchObject({
      patchId: 'patch-apply-debug-patch',
      sourceAction: 'apply-patch',
      appliedCount: 1,
    });
  });

  it('marks feedback history stale when feedback CLI returns malformed JSON', async () => {
    runRapidkitStreaming.mockResolvedValueOnce({
      failed: false,
      exitCode: 0,
      stdout: '{not-json',
      stderr: '',
    });

    const result = await recordSidebarStudioFixAudit({
      workspacePath,
      kind: 'verify-handoff',
      actionId: 'verify-handoff',
      summary: 'Verify completed but feedback response was malformed.',
      ok: true,
    });

    expect(result).toMatchObject({
      ok: false,
      registryRecorded: true,
      feedbackRecorded: false,
      stale: true,
      retryable: true,
    });
    expect(result.error).toContain('malformed JSON');
  });
});
