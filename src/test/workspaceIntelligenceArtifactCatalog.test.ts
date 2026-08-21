import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildEvidenceAgentContextBundle } from '../core/evidenceAgentContextBundle.js';
import { resolveReportBinding } from '../core/dashboardReportRegistry.js';
import { getWorkspaceIntelligenceAgentReadOrder } from '../core/workspaceIntelligenceChainContract.js';
import {
  WORKSPAI_RUNTIME_ARTIFACT_CONTRACTS,
  WORKSPAI_RUNTIME_REPORT_PATHS,
  workspaceArtifactProducerCommand,
} from '../core/workspaceIntelligenceArtifactCatalog.js';

describe('workspace intelligence artifact catalog', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((directory) => fs.remove(directory)));
  });

  it('projects the CLI runtime artifact contract without unsafe or duplicate paths', () => {
    // The runtime surface also publishes non-.workspai artifacts (for example
    // editor hooks). This catalog intentionally admits only governed workspace
    // artifacts and must still cover the complete current Workspai baseline.
    expect(WORKSPAI_RUNTIME_ARTIFACT_CONTRACTS.length).toBeGreaterThanOrEqual(48);
    expect(new Set(WORKSPAI_RUNTIME_REPORT_PATHS).size).toBe(WORKSPAI_RUNTIME_REPORT_PATHS.length);
    expect(
      WORKSPAI_RUNTIME_ARTIFACT_CONTRACTS.every(
        (entry) =>
          entry.artifactPath.startsWith('.workspai/') &&
          !entry.artifactPath.includes('\\') &&
          !entry.artifactPath.split('/').includes('..')
      )
    ).toBe(true);
    expect(workspaceArtifactProducerCommand('.workspai/reports/doctor-capabilities.json')).toEqual([
      'doctor',
      'capabilities',
      '--write',
    ]);
  });

  it('uses the CLI-authored bounded read order when INDEX.json is missing', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-artifact-catalog-'));
    tempDirs.push(workspacePath);

    const bundle = await buildEvidenceAgentContextBundle({ workspacePath });
    const attachmentPaths = new Set(bundle.attachments.map((entry) => entry.relativePath));

    for (const artifactPath of getWorkspaceIntelligenceAgentReadOrder()) {
      expect(attachmentPaths.has(artifactPath), artifactPath).toBe(true);
    }
    expect(attachmentPaths.has('.workspai/reports/workspace-model.json')).toBe(false);
    expect(attachmentPaths.has('.workspai/reports/workspace-knowledge-graph.json')).toBe(false);
    expect(bundle.missingRequired).toContain('.workspai/reports/workspace-context-agent.json');
  });

  it('does not let a live index downgrade the required agent-context baseline', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-artifact-index-'));
    tempDirs.push(workspacePath);
    await fs.ensureDir(path.join(workspacePath, '.workspai', 'reports'));
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'reports', 'INDEX.json'), {
      schemaVersion: 'rapidkit-agent-reports-index.v1',
      reports: [
        {
          path: '.workspai/reports/workspace-context-agent.json',
          required: false,
          validity: 'missing',
        },
      ],
    });

    const bundle = await buildEvidenceAgentContextBundle({ workspacePath });
    expect(bundle.missingRequired).toContain('.workspai/reports/workspace-context-agent.json');
    expect(
      bundle.attachments.find(
        (entry) => entry.relativePath === '.workspai/reports/workspace-context-agent.json'
      )?.required
    ).toBe(true);
  });

  it('routes canonical Doctor control-plane artifacts back to the Doctor card', () => {
    const expected = [
      'doctor-capabilities.json',
      'doctor-validation-last-run.json',
      'doctor-receipt-last-run.json',
      'doctor-workspace-cache.json',
    ];
    for (const fileName of expected) {
      expect(resolveReportBinding(`/workspace/.workspai/reports/${fileName}`)).toMatchObject({
        command: 'checkWorkspaceHealth',
        cardId: 'doctor',
        scope: 'workspace',
      });
    }
  });
});
