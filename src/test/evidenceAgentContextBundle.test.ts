import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildEvidenceAgentContextBundle,
  buildSendToCopilotPrompt,
} from '../core/evidenceAgentContextBundle';
import {
  WORKSPACE_CONTRACT_VERIFY_REPORT_PATH,
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_TRACE_REPORT_PATH,
  WORKSPACE_WHY_REPORT_PATH,
} from '../core/workspaceIntelligencePaths';

describe('evidenceAgentContextBundle', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.remove(dir)));
  });

  async function createWorkspace(relativeFiles: Record<string, unknown>): Promise<string> {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-agent-'));
    tempDirs.push(workspacePath);
    for (const [relativePath, payload] of Object.entries(relativeFiles)) {
      const absolutePath = path.join(workspacePath, relativePath);
      await fs.ensureDir(path.dirname(absolutePath));
      await fs.writeJSON(absolutePath, payload);
    }
    return workspacePath;
  }

  it('builds a send-to-copilot prompt with intelligence attachments and blockers', async () => {
    const workspacePath = await createWorkspace({
      '.workspai/reports/workspace-context-agent.json': { schemaVersion: 'v1' },
      '.workspai/reports/agent-customization-pack.json': {
        schemaVersion: 'rapidkit-agent-customization-pack.v1',
        generatedAt: '2026-06-23T10:00:00.000Z',
        preset: 'enterprise',
        targets: ['vscode'],
        outputInventory: [{ path: 'AGENTS.md', kind: 'grounding', status: 'written' }],
        drift: { missingRequired: [], staleReports: [], strictViolations: [] },
      },
      '.workspai/reports/doctor-last-run.json': { generatedAt: '2026-06-10T00:00:00.000Z' },
      [WORKSPACE_EXPLAIN_REPORT_PATH]: { schemaVersion: 'workspace-explain.v1' },
      [WORKSPACE_WHY_REPORT_PATH]: { schemaVersion: 'workspace-explain.v1', mode: 'why' },
      [WORKSPACE_TRACE_REPORT_PATH]: { schemaVersion: 'workspace-explain.v1', mode: 'trace' },
      [WORKSPACE_CONTRACT_VERIFY_REPORT_PATH]: {
        schemaVersion: 'rapidkit-workspace-contract-verify.v1',
      },
    });

    const bundle = await buildEvidenceAgentContextBundle({
      workspacePath,
      workspaceName: 'demo',
      card: {
        id: 'doctor',
        label: 'Doctor',
        status: 'fail',
        summary: '2 projects need attention',
        scope: 'workspace',
        artifactPath: path.join(workspacePath, '.workspai/reports/doctor-last-run.json'),
        blockers: ['api: lockfile drift'],
        metrics: { exitCode: 2, stderrTail: 'ERROR: dependency mismatch' },
      },
    });

    const prompt = buildSendToCopilotPrompt(bundle);

    expect(bundle.missingRequired).toEqual([]);
    expect(prompt).toContain('@workspace');
    expect(prompt).toContain('## Workspai workspace root (READ THIS FIRST)');
    expect(prompt).toContain(workspacePath.replace(/\\/g, '/'));
    expect(prompt).toContain(
      `#file:${workspacePath.replace(/\\/g, '/')}/.workspai/reports/workspace-context-agent.json`
    );
    expect(prompt).toContain(
      `#file:${workspacePath.replace(/\\/g, '/')}/${WORKSPACE_EXPLAIN_REPORT_PATH}`
    );
    expect(prompt).not.toContain('/workspace-model.json');
    expect(prompt).not.toContain('/workspace-knowledge-graph.json');
    expect(prompt).not.toContain(`/${WORKSPACE_WHY_REPORT_PATH}`);
    expect(prompt).not.toContain(`/${WORKSPACE_TRACE_REPORT_PATH}`);
    expect(prompt).not.toContain(`/${WORKSPACE_CONTRACT_VERIFY_REPORT_PATH}`);
    expect(bundle.attachments.map((attachment) => attachment.relativePath)).toContain(
      WORKSPACE_EXPLAIN_REPORT_PATH
    );
    expect(prompt).toContain('Agent pack preset: enterprise');
    expect(prompt).toContain('## Standard answer contract');
    expect(prompt).toContain('1. Scope');
    expect(prompt).toContain('7. Assumptions');
    expect(prompt).toContain('Blocker: api: lockfile drift');
    expect(prompt).toContain('ERROR: dependency mismatch');
    expect(prompt).toContain('Fix the blocked Workspai evidence issue');
  });

  it('supports workspace-only handoff without an evidence card', async () => {
    const workspacePath = await createWorkspace({
      '.workspai/reports/workspace-context-agent.json': { schemaVersion: 'v1' },
    });

    const bundle = await buildEvidenceAgentContextBundle({
      workspacePath,
      userQuestion: 'What should I run next?',
    });

    const prompt = buildSendToCopilotPrompt(bundle);

    expect(bundle.copilotQuestion).toBe('What should I run next?');
    expect(prompt).toContain('What should I run next?');
    expect(prompt).not.toContain('Evidence:');
    expect(prompt).toContain('Agent customization pack: missing');
  });

  it('consumes the CLI reports index as the ordered artifact authority', async () => {
    const indexedReport = '.workspai/reports/release-readiness-last-run.json';
    const workspacePath = await createWorkspace({
      '.workspai/reports/workspace-context-agent.json': { schemaVersion: 'v1' },
      [indexedReport]: { schemaVersion: 'release-readiness-v1', status: 'warn' },
      '.workspai/reports/INDEX.json': {
        schemaVersion: 'rapidkit-agent-reports-index.v1',
        readOrder: [indexedReport, '.workspai/reports/workspace-context-agent.json'],
        reports: [
          {
            path: indexedReport,
            label: 'Release readiness',
            required: false,
            exists: true,
            validity: 'valid',
          },
          {
            path: '.workspai/reports/workspace-context-agent.json',
            label: 'Agent context pack',
            required: true,
            exists: true,
            validity: 'valid',
          },
        ],
      },
    });

    const bundle = await buildEvidenceAgentContextBundle({ workspacePath });

    expect(bundle.attachments[0]).toMatchObject({
      relativePath: indexedReport,
      label: 'Release readiness',
      validity: 'valid',
    });
    expect(bundle.missingRequired).toEqual([]);
  });

  it('reconciles a stale missing index entry when the required artifact exists on disk', async () => {
    const skillsIndex = '.workspai/reports/workspace-skills-index.json';
    const workspacePath = await createWorkspace({
      '.workspai/reports/workspace-context-agent.json': { schemaVersion: 'workspace-context.v1' },
      [skillsIndex]: { schemaVersion: 'workspace-skills-index.v1', skills: [] },
      '.workspai/reports/INDEX.json': {
        schemaVersion: 'rapidkit-agent-reports-index.v1',
        readOrder: [skillsIndex],
        reports: [
          {
            path: skillsIndex,
            label: 'Operational skills index',
            required: true,
            exists: false,
            validity: 'missing',
          },
        ],
      },
    });

    const bundle = await buildEvidenceAgentContextBundle({ workspacePath });
    const attachment = bundle.attachments.find((entry) => entry.relativePath === skillsIndex);

    expect(attachment).toMatchObject({ exists: true, required: true });
    expect(attachment?.validity).toBeUndefined();
    expect(bundle.missingRequired).toEqual([]);
    expect(bundle.summaryLines.join('\n')).not.toContain('Missing or invalid intelligence');
  });

  it('authorizes indexed operational Skills while preloading only bounded relevant guidance', async () => {
    const workspacePath = await createWorkspace({
      '.workspai/reports/workspace-context-agent.json': { schemaVersion: 'workspace-context.v1' },
      '.workspai/reports/workspace-skills-index.json': {
        schemaVersion: 'workspace-skills-index.v1',
        generatedAt: '2026-08-20T00:00:00.000Z',
        inputsHash: '12345678',
        skills: [
          {
            skillId: 'dependency-repair',
            path: '.workspai/skills/dependency-repair.md',
            schemaVersion: 'workspai-operational-skill.v1',
            title: 'Dependency repair',
          },
          {
            skillId: 'release-readiness',
            path: '.workspai/skills/release-readiness.md',
            schemaVersion: 'workspai-operational-skill.v1',
            title: 'Release readiness',
          },
        ],
      },
      '.workspai/skills/dependency-repair.md': '# Dependency repair',
      '.workspai/skills/release-readiness.md': '# Release readiness',
    });

    const bundle = await buildEvidenceAgentContextBundle({
      workspacePath,
      userQuestion: 'Repair the broken dependency installation.',
    });
    const dependencySkill = bundle.attachments.find(
      (entry) => entry.relativePath === '.workspai/skills/dependency-repair.md'
    );
    const releaseSkill = bundle.attachments.find(
      (entry) => entry.relativePath === '.workspai/skills/release-readiness.md'
    );
    const prompt = buildSendToCopilotPrompt(bundle);

    expect(dependencySkill).toMatchObject({ exists: true, promptEligible: true });
    expect(releaseSkill).toMatchObject({ exists: true, promptEligible: false });
    expect(prompt).toContain('/.workspai/skills/dependency-repair.md');
    expect(prompt).not.toContain('/.workspai/skills/release-readiness.md');
    expect(bundle.summaryLines.join('\n')).toContain('Relevant operational skill');
  });
});
