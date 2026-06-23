import fs from 'fs-extra';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWorkspaceAgentContextPromptSection,
  readWorkspaceAgentContextReport,
} from '../core/workspaceAgentContextReader';
import { WORKSPACE_INTELLIGENCE_REPORT_PATHS } from '../core/workspaceIntelligencePaths';

describe('workspaceIntelligencePaths', () => {
  const workspaceIntelligenceContractFiles = [
    'workspace-context.v1.json',
    'workspace-impact.v1.json',
    'workspace-model-diff.v1.json',
    'workspace-model-snapshot.v1.json',
    'workspace-model.v1.json',
    'workspace-verify.v1.json',
  ];

  it('keeps report paths aligned with rapidkit-npm workspace intelligence artifacts', () => {
    expect(WORKSPACE_INTELLIGENCE_REPORT_PATHS).toEqual([
      '.rapidkit/reports/agent-customization-pack.json',
      '.rapidkit/reports/INDEX.json',
      '.rapidkit/reports/workspace-model.json',
      '.rapidkit/reports/workspace-model-snapshot.json',
      '.rapidkit/reports/workspace-model-diff-last-run.json',
      '.rapidkit/reports/workspace-impact-last-run.json',
      '.rapidkit/reports/workspace-verify-last-run.json',
      '.rapidkit/reports/workspace-context-agent.json',
    ]);
  });

  it('ships workspace intelligence schemas in parity with rapidkit-npm', async () => {
    for (const fileName of workspaceIntelligenceContractFiles) {
      const extensionContract = path.resolve(
        __dirname,
        '../../contracts/workspace-intelligence',
        fileName
      );
      const npmContract = path.resolve(
        __dirname,
        '../../../rapidkit-npm/contracts/workspace-intelligence',
        fileName
      );

      expect(await fs.pathExists(extensionContract)).toBe(true);
      const extensionHash = crypto
        .createHash('sha256')
        .update(await fs.readFile(extensionContract))
        .digest('hex');
      const npmHash = crypto
        .createHash('sha256')
        .update(await fs.readFile(npmContract))
        .digest('hex');

      expect(extensionHash).toBe(npmHash);
    }
  });

  it('does not offer diff-last-run as a workspace diff baseline', async () => {
    const { WORKSPACE_INTELLIGENCE_DIFF_FROM_CANDIDATES } =
      await import('../core/workspaceIntelligencePaths');

    expect(WORKSPACE_INTELLIGENCE_DIFF_FROM_CANDIDATES).toEqual([
      '.rapidkit/reports/workspace-model-snapshot.json',
      '.rapidkit/reports/workspace-model.json',
    ]);
  });
});

describe('workspaceAgentContextReader', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.remove(dir)));
  });

  it('reads agent context report and builds safe command prompt section', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-agent-context-'));
    tempDirs.push(workspacePath);
    const reportPath = path.join(
      workspacePath,
      '.rapidkit',
      'reports',
      'workspace-context-agent.json'
    );
    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeJSON(reportPath, {
      schemaVersion: 'workspace-context.v1',
      generatedAt: '2026-06-15T10:00:00.000Z',
      agent: 'cursor',
      workspaceSummary: '2-project polyglot workspace',
      safeCommands: [
        {
          id: 'workspace.pipeline',
          scope: 'workspace',
          display: 'Governance pipeline',
          execute: 'rapidkit pipeline --json --strict',
        },
      ],
      validation: { status: 'passed', errors: 0, warnings: 0 },
    });

    const report = await readWorkspaceAgentContextReport(workspacePath);
    const section = buildWorkspaceAgentContextPromptSection(report);

    expect(report?.agent).toBe('cursor');
    expect(section).toContain('WORKSPACE INTELLIGENCE');
    expect(section).toContain('rapidkit pipeline --json --strict');
    expect(section).toContain('workspace model');
  });
});

describe('workspaceIntelligence commands source', () => {
  it('registers canonical npm workspace intelligence CLI args', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../commands/workspaceIntelligence.ts'),
      'utf8'
    );

    expect(source).toContain("['workspace', 'model', '--json', '--write']");
    expect(source).toContain("['workspace', 'snapshot', '--json']");
    expect(source).toContain("['workspace', 'diff', '--from', fromPath, '--json']");
    expect(source).toContain("['workspace', 'impact', '--from', fromPath, '--json']");
    expect(source).toContain('buildWorkspaceAgentContextCliArgs');
    expect(source).toContain('buildWorkspaceAgentSyncCliArgs');
    expect(source).toContain('workspai.copyCopilotContextPrompt');
    expect(source).toContain('workspai.workspaceAgentSync');
    expect(source).toContain('workspai.workspaceContextAgent');
    expect(source).toContain('dispatchWorkspaceIntelligenceChain');
    expect(source).toContain('workspai.workspaceVerify');
    expect(source).toContain('workspai.workspaceImpactLens');
    expect(source).toContain('workspai.architectureImpactLens');
    expect(source).toContain("['workspace', 'verify', '--from-impact', fromImpact, '--json']");
  });
});
