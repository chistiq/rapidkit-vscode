import fs from 'fs-extra';
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
    'workspace-knowledge-graph.v1.json',
    'workspace-knowledge-search.v1.json',
    'workspace-knowledge-graph-change-overlay.v1.json',
    'workspace-graph-token-efficiency.v1.json',
    'model-usage-event.v1.json',
    'workspace-intelligence-evaluation.v1.json',
    'workspace-intelligence-evaluation-comparison.v1.json',
  ];

  it('keeps report paths aligned with Workspai CLI workspace intelligence artifacts', () => {
    expect(WORKSPACE_INTELLIGENCE_REPORT_PATHS).toEqual([
      '.workspai/reports/agent-customization-pack.json',
      '.workspai/reports/INDEX.json',
      '.workspai/reports/workspace-model.json',
      '.workspai/reports/workspace-model-snapshot.json',
      '.workspai/reports/workspace-model-diff-last-run.json',
      '.workspai/reports/workspace-impact-last-run.json',
      '.workspai/reports/workspace-verify-last-run.json',
      '.workspai/reports/workspace-context-agent.json',
      '.workspai/reports/workspace-skills-index.json',
      '.workspai/reports/workspace-explain-last-run.json',
      '.workspai/reports/workspace-why-last-run.json',
      '.workspai/reports/workspace-trace-last-run.json',
      '.workspai/reports/workspace-knowledge-graph.json',
      '.workspai/reports/workspace-intelligence-evaluation-live.json',
      '.workspai/reports/workspace-intelligence-evaluation-last-run.json',
      '.workspai/reports/workspace-contract-verify-last-run.json',
    ]);
  });

  it('ships valid workspace intelligence schema mirrors', async () => {
    const phase4Contracts = [
      'workspace-explain.v1.json',
      'workspace-skills-index.v1.json',
      'workspace-operational-skill.v1.json',
      'agent-action-outcome.v1.json',
      'workspace-intelligence-history.v1.json',
    ];
    for (const fileName of [...workspaceIntelligenceContractFiles, ...phase4Contracts]) {
      const extensionContract = path.resolve(
        __dirname,
        '../../contracts/workspace-intelligence',
        fileName
      );
      expect(await fs.pathExists(extensionContract)).toBe(true);
      expect(() => JSON.parse(fs.readFileSync(extensionContract, 'utf8')), fileName).not.toThrow();
    }
  });

  it('does not offer diff-last-run as a workspace diff baseline', async () => {
    const { WORKSPACE_INTELLIGENCE_DIFF_FROM_CANDIDATES } =
      await import('../core/workspaceIntelligencePaths');

    expect(WORKSPACE_INTELLIGENCE_DIFF_FROM_CANDIDATES).toEqual([
      '.workspai/reports/workspace-model-snapshot.json',
      '.workspai/reports/workspace-model.json',
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
      '.workspai',
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
          execute: 'workspai pipeline --json --strict',
        },
      ],
      validation: { status: 'passed', errors: 0, warnings: 0 },
    });

    const report = await readWorkspaceAgentContextReport(workspacePath);
    const section = buildWorkspaceAgentContextPromptSection(report);

    expect(report?.agent).toBe('cursor');
    expect(section).toContain('WORKSPACE INTELLIGENCE');
    expect(section).toContain('workspai pipeline --json --strict');
    expect(section).toContain('workspace model');
  });
});

describe('workspaceIntelligence commands source', () => {
  it('registers canonical npm workspace intelligence CLI args', async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, '../commands/workspaceIntelligence.ts'),
      'utf8'
    );
    const presetSource = await fs.readFile(
      path.resolve(__dirname, '../core/workspaceCommandPresets.ts'),
      'utf8'
    );

    expect(presetSource).toContain("args: ['workspace', 'model', '--json', '--write']");
    expect(source).toContain("['workspace', 'snapshot', '--json']");
    expect(presetSource).toContain(
      "args: ['workspace', 'diff', '--from', '<baseline-report>', '--json']"
    );
    expect(presetSource).toContain(
      "args: ['workspace', 'impact', '--from', '<change-report>', '--json']"
    );
    expect(presetSource).toContain(
      "args: ['workspace', 'context', '--for-agent', '--json', '--write']"
    );
    expect(presetSource).toContain("'workspace',\n          'agent-sync',");
    expect(source).toContain('workspai.copyCopilotContextPrompt');
    expect(source).toContain('workspai.workspaceAgentSync');
    expect(source).toContain('workspai.workspaceContextAgent');
    expect(source).toContain('dispatchWorkspaceIntelligenceChain');
    expect(source).toContain('workspai.workspaceVerify');
    expect(source).toContain('workspai.workspaceImpactLens');
    expect(source).toContain('workspai.architectureImpactLens');
    expect(presetSource).toContain(
      "args: ['workspace', 'verify', '--from-impact', '<impact-report>', '--json']"
    );
  });
});
