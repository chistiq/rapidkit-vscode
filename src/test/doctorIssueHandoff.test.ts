import { describe, expect, it } from 'vitest';

import {
  buildDoctorIssueAdvisorQuestion,
  buildDoctorIssueCopilotQuestion,
  buildDoctorIssueHandoffPayload,
  buildDoctorIssueStudioPrompt,
  resolveDoctorIssueHandoff,
} from '../core/doctorIssueHandoff';

describe('doctorIssueHandoff', () => {
  const payload = buildDoctorIssueHandoffPayload({
    issue: 'No migration markers detected for this backend runtime.',
    kind: 'probe',
    evidence: {
      workspacePath: '/tmp/ws',
      workspaceName: 'demo-ws',
      generatedAt: '2026-06-22T00:00:00.000Z',
      healthScore: { total: 10, passed: 8, warnings: 2, errors: 0 },
    },
    project: {
      name: 'polyglot-api',
      path: '/tmp/ws/polyglot-api',
      framework: 'nestjs',
      issues: [],
      fixCommands: ['npx rapidkit doctor project --fix'],
    },
    probe: {
      id: 'migration-readiness',
      label: 'Migration/readiness surface',
      status: 'warn',
      reason: 'No migration markers detected for this backend runtime.',
    },
  });

  it('builds advisor, studio, and copilot prompts with issue context', () => {
    expect(payload).toBeTruthy();
    const advisor = buildDoctorIssueAdvisorQuestion(payload!);
    expect(advisor).toContain('polyglot-api');
    expect(advisor).toContain('No migration markers detected');
    expect(advisor).toContain('doctor project --fix');

    const studio = buildDoctorIssueStudioPrompt(payload!);
    expect(studio).toContain('Workspace Health issue');
    expect(studio).toContain('Migration/readiness surface');

    const copilot = buildDoctorIssueCopilotQuestion(payload!);
    expect(copilot).toContain('polyglot-api');
    expect(copilot).toContain('No migration markers detected');
  });

  it('resolves handoff payload from tree item shape', () => {
    const resolved = resolveDoctorIssueHandoff({
      issueHandoff: payload,
    });
    expect(resolved?.issue).toBe(payload?.issue);
  });
});
