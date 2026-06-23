import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildEvidenceAgentContextBundle,
  buildSendToCopilotPrompt,
} from '../core/evidenceAgentContextBundle';

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
      '.rapidkit/reports/workspace-context-agent.json': { schemaVersion: 'v1' },
      '.rapidkit/reports/doctor-last-run.json': { generatedAt: '2026-06-10T00:00:00.000Z' },
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
        artifactPath: path.join(workspacePath, '.rapidkit/reports/doctor-last-run.json'),
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
      `#file:${workspacePath.replace(/\\/g, '/')}/.rapidkit/reports/workspace-context-agent.json`
    );
    expect(prompt).toContain('Blocker: api: lockfile drift');
    expect(prompt).toContain('ERROR: dependency mismatch');
    expect(prompt).toContain('Fix the blocked Workspai evidence issue');
  });

  it('supports workspace-only handoff without an evidence card', async () => {
    const workspacePath = await createWorkspace({
      '.rapidkit/reports/workspace-context-agent.json': { schemaVersion: 'v1' },
    });

    const bundle = await buildEvidenceAgentContextBundle({
      workspacePath,
      userQuestion: 'What should I run next?',
    });

    const prompt = buildSendToCopilotPrompt(bundle);

    expect(bundle.copilotQuestion).toBe('What should I run next?');
    expect(prompt).toContain('What should I run next?');
    expect(prompt).not.toContain('Evidence:');
  });
});
