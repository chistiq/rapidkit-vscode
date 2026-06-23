import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
  },
  Uri: {
    file: (value: string) => ({ fsPath: value }),
  },
}));

import {
  buildStudioActionContractMessageData,
  buildStudioAIActionResult,
  formatAIActionRegistryWebviewPayload,
  persistStudioAIActionContractFromText,
  writeStudioAIActionEvidence,
} from '../ui/panels/incidentStudioAIActionBridge';
import { normalizeAIActionContract } from '../core/aiActionContract';

describe('incidentStudioAIActionBridge', () => {
  let workspacePath = '';

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-ai-action-bridge-'));
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('persists and validates a strict action contract from assistant text', async () => {
    const contract = normalizeAIActionContract({
      schemaVersion: 'workspai.ai-action.v1',
      actionType: 'fix',
      summary: 'Tighten auth gate',
      riskLevel: 'medium',
      affectedFiles: ['src/auth.ts'],
      proposedCommands: ['npm test'],
      proposedPatches: [{ relativePath: 'src/auth.ts', summary: 'Tighten auth gate' }],
      verificationCommands: ['npm run test:auth'],
      rollbackPlan: ['git checkout -- src/auth.ts'],
      confidence: 0.86,
      requiresApproval: true,
    });

    const text = [
      'Proposed fix with governed contract below.',
      '```json',
      JSON.stringify(contract),
      '```',
    ].join('\n');

    const persisted = await persistStudioAIActionContractFromText({
      workspacePath,
      text,
      provider: 'test-provider',
    });

    expect(persisted.contract?.summary).toBe('Tighten auth gate');
    expect(persisted.validation.status).toBe('valid');
    expect(persisted.validation.canApply).toBe(true);
    expect(persisted.registry?.entries.length).toBeGreaterThan(0);
    expect(persisted.activeActionId).toBeTruthy();
  });

  it('builds studio action result and registry payloads for webview sync', () => {
    const registryPayload = formatAIActionRegistryWebviewPayload({
      schemaVersion: 'workspai.ai-action-registry.v1',
      updatedAt: '2026-06-10T12:00:00.000Z',
      entries: [],
    });
    const actionResult = buildStudioAIActionResult({
      actionId: 'ai-action-verify',
      workspacePath: '/tmp/workspai',
      fallbackSummary: 'Verify blocked by contract validation.',
    });
    const contractMessage = buildStudioActionContractMessageData({
      actionId: 'action-1',
      contract: null,
      validation: {
        status: 'blocked',
        issues: [],
        canApply: false,
        canVerify: false,
        canRollback: false,
      },
      provider: 'chat-brain',
      parsed: { contract: null, rawJson: null },
    });

    expect(registryPayload.updatedAt).toBe('2026-06-10T12:00:00.000Z');
    expect(actionResult.summary).toContain('Verify blocked');
    expect(contractMessage.provider).toBe('chat-brain');
  });

  it('writes AI action evidence with proof summary', async () => {
    const contract = normalizeAIActionContract({
      schemaVersion: 'workspai.ai-action.v1',
      actionType: 'verify',
      summary: 'Verify gates',
      riskLevel: 'low',
      affectedFiles: ['package.json'],
      proposedCommands: [],
      proposedPatches: [],
      verificationCommands: ['npm test'],
      rollbackPlan: [],
      confidence: 0.9,
      requiresApproval: true,
    })!;

    const evidence = await writeStudioAIActionEvidence({
      workspacePath,
      workspaceName: 'Test Workspace',
      actionId: 'action-verify',
      contract,
      result: {
        operation: 'verify',
        ok: true,
        summary: 'verify completed successfully.',
        commands: [
          {
            command: 'npm test',
            exitCode: 0,
            stdout: 'ok',
            stderr: '',
            startedAt: '2026-06-19T00:00:00.000Z',
            completedAt: '2026-06-19T00:00:01.000Z',
            durationMs: 1000,
            cwd: workspacePath,
          },
        ],
      },
    });

    expect(evidence?.sha256).toHaveLength(64);
    const raw = JSON.parse(await fs.readFile(evidence!.path, 'utf8'));
    expect(raw.proof).toMatchObject({
      schemaVersion: 'workspai.ai-action-proof-summary.v1',
      evidencePresent: true,
      transcriptCommandCount: 1,
      failedCommandCount: 0,
      rollbackProofRequired: false,
      rollbackPlanPresent: false,
    });
    expect(raw.redactionApplied).toBe(true);
  });
});
