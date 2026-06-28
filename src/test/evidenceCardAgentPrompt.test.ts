import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildEvidenceCardStudioPrompt,
  buildEvidenceCardStudioPromptEnriched,
} from '../core/evidenceCardAgentPrompt';

describe('evidenceCardAgentPrompt', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.remove(dir)));
  });

  it('includes impact semantics and warns against doctor/delete fixes', () => {
    const prompt = buildEvidenceCardStudioPrompt({
      workspacePath: '/tmp/ws',
      card: {
        id: 'workspaceImpact',
        label: 'Workspace Impact',
        status: 'fail',
        summary: 'Risk high · 0 project(s) affected · 1169 workspace item(s)',
        scope: 'workspace',
        blockers: ['Affected projects: none.', 'Workspace-level items: 1169.'],
      },
    });

    expect(prompt).toContain('## Impact card semantics');
    expect(prompt).toContain('Do NOT delete `workspace-impact-last-run.json`');
    expect(prompt).toContain('do NOT run `rapidkit doctor`');
  });

  it('carries the active incident object into Studio prompts', () => {
    const prompt = buildEvidenceCardStudioPrompt({
      workspacePath: '/tmp/ws',
      blockerHandoff: {
        blockerSignature: 'sig-release-1234',
        blockers: ['readiness is blocked'],
        incidentSummary: {
          title: 'Governance Gate',
          phase: 'fix',
          primaryAction: 'Fix source issue',
          verifyRequired: true,
          auditStatus: 'not-started',
        },
      },
      card: {
        id: 'pipeline',
        label: 'Governance Gate',
        status: 'fail',
        summary: '2 passed · 0 warn · 3 failed',
        scope: 'workspace',
        blockers: ['readiness is blocked'],
      },
    });

    expect(prompt).toContain('## Incident summary');
    expect(prompt).toContain('Title: Governance Gate');
    expect(prompt).toContain('Primary action: Fix source issue');
    expect(prompt).toContain('Verify required: yes');
    expect(prompt).toContain('Blocker signature: sig-release-1234');
  });

  it('enriches impact cards with workspace-level samples from the artifact', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-impact-card-'));
    tempDirs.push(workspacePath);
    const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.ensureDir(reportsDir);
    await fs.writeJson(path.join(reportsDir, 'workspace-impact-last-run.json'), {
      schemaVersion: 'workspace-impact.v1',
      generatedAt: '2026-06-15T10:00:00.000Z',
      summary: {
        risk: 'high',
        affectedProjects: 0,
        workspaceItems: 2,
        changed: true,
      },
      workspaceImpact: [
        {
          target: 'git:AGENTS.md',
          summary: 'Git untracked file affects workspace: AGENTS.md',
          risk: 'low',
        },
        {
          target: 'git:.cursor/rules/rapidkit-grounding.mdc',
          summary: 'Git untracked file affects workspace: .cursor/rules/rapidkit-grounding.mdc',
          risk: 'low',
        },
      ],
      agentBrief: {
        headline: 'Workspace impact risk: high.',
        bullets: ['Affected projects: none.', 'Workspace-level items: 2.'],
      },
    });

    const prompt = await buildEvidenceCardStudioPromptEnriched({
      workspacePath,
      card: {
        id: 'workspaceImpact',
        label: 'Workspace Impact',
        status: 'fail',
        summary: 'Risk high · 0 project(s) affected · 2 workspace item(s)',
        scope: 'workspace',
      },
    });

    expect(prompt).toContain('git:AGENTS.md');
    expect(prompt).toContain('Workspace-level impact samples');
    expect(prompt).toContain('agent-sync');
    expect(prompt).toContain('## Agent customization pack');
    expect(prompt).toContain('## Standard answer contract');
  });
});
