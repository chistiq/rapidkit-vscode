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

  it('enriches impact cards with workspace-level samples from the artifact', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-impact-card-'));
    tempDirs.push(workspacePath);
    const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.ensureDir(reportsDir);
    await fs.writeJson(path.join(reportsDir, 'workspace-impact-last-run.json'), {
      schemaVersion: 'workspace-impact.v1',
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
  });
});
