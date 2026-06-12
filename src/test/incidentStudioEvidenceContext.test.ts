import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildIncidentStudioEvidenceContext,
  renderIncidentStudioEvidencePrompt,
} from '../core/incidentStudioEvidenceContext';
import { normalizeAIActionContract, validateAIActionContract } from '../core/aiActionContract';
import { recordAIActionContract, recordAIActionExecution } from '../core/aiActionRegistry';
import { AnalyzeReport } from '../ui/panels/incidentStudioAnalyze';

describe('incidentStudioEvidenceContext', () => {
  let workspacePath = '';

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-evidence-context-'));
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('summarizes analyze report and redacts sensitive evidence', async () => {
    const report: AnalyzeReport = {
      schemaVersion: 'test',
      generatedAt: '2026-06-11T00:00:00.000Z',
      workspacePath,
      summary: {
        score: 72,
        verdict: 'needs-attention',
        projectCount: 2,
        runtimeCount: 2,
        findings: {
          fail: 1,
          warn: 1,
          info: 0,
        },
      },
      findings: [
        {
          id: 'secret-finding',
          severity: 'fail',
          target: 'src/config.ts',
          title: 'Leaked token Bearer abc.def.ghi',
          detail: 'ignored',
          remediation: 'Replace api_key=sk-secret-value before release',
        },
      ],
      enterpriseControls: {
        jsonReady: true,
        ciGateCommand: 'make verify TOKEN=sk-secret-value',
        releaseGateCommand: 'make release-gate',
      },
    };

    const context = await buildIncidentStudioEvidenceContext({
      workspacePath,
      workspaceName: 'workspace',
      analyzeReport: report,
      gitDiffTimeoutMs: 10,
    });
    const prompt = renderIncidentStudioEvidencePrompt(context);

    expect(context.analyzeReport.available).toBe(true);
    expect(context.analyzeReport.score).toBe(72);
    expect(prompt).toContain('[redacted]');
    expect(prompt).not.toContain('sk-secret-value');
    expect(prompt).not.toContain('abc.def.ghi');
  });

  it('includes persisted AI action history', async () => {
    const contract = normalizeAIActionContract({
      actionType: 'verify',
      summary: 'Verify release gate',
      affectedFiles: ['package.json'],
      verificationCommands: ['npm test'],
      rollbackPlan: [],
      confidence: 0.88,
      requiresApproval: true,
    })!;
    const validation = validateAIActionContract(contract, {
      workspacePath,
      strict: true,
    });
    const entry = await recordAIActionContract(workspacePath, {
      contract,
      validation,
      provider: 'test',
    });
    await recordAIActionExecution(workspacePath, entry.id, {
      operation: 'verify',
      ok: true,
      summary: 'verify completed successfully.',
      evidencePath: null,
    });

    const context = await buildIncidentStudioEvidenceContext({
      workspacePath,
      workspaceName: 'workspace',
      analyzeReport: null,
      gitDiffTimeoutMs: 10,
    });

    expect(context.aiActions.total).toBe(1);
    expect(context.aiActions.latest[0]).toMatchObject({
      summary: 'Verify release gate',
      lastExecution: 'verify:pass',
    });
  });
});
