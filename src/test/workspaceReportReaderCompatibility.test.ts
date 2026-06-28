import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  extractDoctorFixResultDetailed,
  DOCTOR_FIX_RESULT_SCHEMA_VERSION,
} from '../core/doctorFixResultReader';
import {
  readWorkspaceAgentContextReportArtifact,
  WORKSPACE_CONTEXT_SCHEMA_VERSION,
} from '../core/workspaceAgentContextReader';
import {
  readWorkspaceContractVerifyEvidenceArtifact,
  WORKSPACE_CONTRACT_VERIFY_SCHEMA_VERSION,
} from '../core/workspaceContractVerifyReader';
import {
  readWorkspaceExplainReportArtifact,
  WORKSPACE_EXPLAIN_SCHEMA_VERSION,
} from '../core/workspaceExplainReader';
import {
  readWorkspaceSkillsIndexArtifact,
  WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION,
} from '../core/workspaceSkillsIndexReader';
import {
  WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
  WORKSPACE_CONTRACT_VERIFY_REPORT_PATH,
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_SKILLS_INDEX_PATH,
} from '../core/workspaceIntelligencePaths';

describe('workspace report reader compatibility contracts', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.remove(dir)));
  });

  async function makeWorkspace(files: Record<string, unknown>): Promise<string> {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-reader-'));
    tempDirs.push(workspacePath);
    for (const [relativePath, payload] of Object.entries(files)) {
      const absolutePath = path.join(workspacePath, relativePath);
      await fs.ensureDir(path.dirname(absolutePath));
      await fs.writeJSON(absolutePath, payload);
    }
    return workspacePath;
  }

  it('accepts forward-compatible unknown fields on workspace intelligence reports', async () => {
    const workspacePath = await makeWorkspace({
      [WORKSPACE_EXPLAIN_REPORT_PATH]: {
        schemaVersion: WORKSPACE_EXPLAIN_SCHEMA_VERSION,
        generatedAt: '2026-06-28T00:00:00.000Z',
        workspacePath: '/tmp/demo',
        target: { kind: 'release-blocked' },
        summary: 'Release blocked.',
        sections: [],
        futureField: { safeToIgnore: true },
      },
      [WORKSPACE_CONTRACT_VERIFY_REPORT_PATH]: {
        schemaVersion: WORKSPACE_CONTRACT_VERIFY_SCHEMA_VERSION,
        generatedAt: '2026-06-28T00:00:00.000Z',
        status: 'passed',
        contractPath: '.rapidkit/workspace.contract.json',
        checks: [],
        violations: [],
        futureField: 'ignored',
      },
      [WORKSPACE_SKILLS_INDEX_PATH]: {
        schemaVersion: WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION,
        generatedAt: '2026-06-28T00:00:00.000Z',
        inputsHash: 'abc',
        skills: [{ skillId: 'release', path: '.github/skills/release/SKILL.md', title: 'Release' }],
        futureField: 1,
      },
      [WORKSPACE_CONTEXT_AGENT_REPORT_PATH]: {
        schemaVersion: WORKSPACE_CONTEXT_SCHEMA_VERSION,
        generatedAt: '2026-06-28T00:00:00.000Z',
        workspaceSummary: 'Demo workspace',
        futureField: ['ignored'],
      },
    });

    await expect(readWorkspaceExplainReportArtifact(workspacePath)).resolves.toMatchObject({
      kind: 'valid',
    });
    await expect(readWorkspaceContractVerifyEvidenceArtifact(workspacePath)).resolves.toMatchObject(
      { kind: 'valid' }
    );
    await expect(readWorkspaceSkillsIndexArtifact(workspacePath)).resolves.toMatchObject({
      kind: 'valid',
    });
    await expect(readWorkspaceAgentContextReportArtifact(workspacePath)).resolves.toMatchObject({
      kind: 'valid',
    });
  });

  it('reports incompatible schema versions instead of treating artifacts as missing', async () => {
    const workspacePath = await makeWorkspace({
      [WORKSPACE_EXPLAIN_REPORT_PATH]: {
        schemaVersion: 'workspace-explain.vNext',
        generatedAt: '2026-06-28T00:00:00.000Z',
        workspacePath: '/tmp/demo',
        target: { kind: 'release-blocked' },
        summary: 'Release blocked.',
        sections: [],
      },
    });

    await expect(readWorkspaceExplainReportArtifact(workspacePath)).resolves.toMatchObject({
      kind: 'incompatible',
      error: expect.stringContaining(WORKSPACE_EXPLAIN_SCHEMA_VERSION),
    });
  });

  it('distinguishes malformed doctor fix result contracts from absent payloads', () => {
    expect(extractDoctorFixResultDetailed({})).toEqual({ kind: 'missing' });
    expect(
      extractDoctorFixResultDetailed({
        fixResult: {
          schemaVersion: 'rapidkit-doctor-fix-result-vNext',
          appliedFixes: [],
          remainingBlockers: [],
          verifyRecommended: 'rapidkit doctor',
        },
      })
    ).toMatchObject({
      kind: 'incompatible',
      error: expect.stringContaining(DOCTOR_FIX_RESULT_SCHEMA_VERSION),
    });
  });
});
