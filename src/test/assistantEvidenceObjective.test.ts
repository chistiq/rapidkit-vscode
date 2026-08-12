import { describe, expect, it } from 'vitest';

import { buildAssistantEvidenceObjective } from '../core/assistantEvidenceObjective.js';
import type { EvidenceAgentContextBundle } from '../core/evidenceAgentContextBundle.js';

function evidence(): EvidenceAgentContextBundle {
  return {
    workspacePath: '/workspace',
    attachments: [
      {
        relativePath: '.workspai/reports/workspace-context-agent.json',
        label: 'Agent context',
        required: true,
        exists: true,
      },
      {
        relativePath: '.workspai/reports/doctor-receipt-last-run.json',
        label: 'Doctor receipt',
        required: false,
        exists: true,
      },
      {
        relativePath: '.workspai/reports/workspace-impact-last-run.json',
        label: 'Impact',
        required: false,
        exists: false,
      },
    ],
    missingRequired: [],
    summaryLines: ['Workspace: sample (/workspace)'],
    copilotQuestion: '',
  };
}

describe('Assistant governed evidence objective', () => {
  it('exposes only present CLI artifacts and their freshness to Agent', () => {
    const objective = buildAssistantEvidenceObjective({
      task: 'Fix the current failure.',
      assistantMode: 'agent',
      evidence: evidence(),
      freshness: {
        verdict: 'stale',
        reason: 'Workspace verify reports stale graph input.',
        oldestAgeMs: 1,
        verifyVerdict: 'stale',
        missingReports: [],
      },
    });

    expect(objective).toContain('Fix the current failure.');
    expect(objective).toContain('Freshness: stale');
    expect(objective).toContain('doctor-receipt-last-run.json');
    expect(objective).not.toContain('workspace-impact-last-run.json');
    expect(objective).toContain('Refresh the governed producer');
  });

  it('keeps Ask read-only and explicit about stale evidence', () => {
    const objective = buildAssistantEvidenceObjective({
      task: 'Explain the release posture.',
      assistantMode: 'ask',
      evidence: evidence(),
      freshness: {
        verdict: 'missing',
        reason: 'Workspace model is missing.',
        oldestAgeMs: null,
        verifyVerdict: null,
        missingReports: ['workspace-model'],
      },
    });

    expect(objective).toContain('Ask and Plan are read-only');
    expect(objective).toContain('report the freshness limitation');
  });
});
