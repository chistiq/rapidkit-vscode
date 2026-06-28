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

  it('labels policy violations as governance evidence instead of doctor issues', () => {
    const policyPayload = buildDoctorIssueHandoffPayload({
      issue:
        'policy.workspace.marker.missing: Workspace marker is missing; model is based on filesystem observation. (workspace.marker)',
      kind: 'policy-violation',
      evidence: {
        workspacePath: '/tmp/ws',
        workspaceName: 'demo-ws',
        generatedAt: '2026-06-27T15:12:13.914Z',
        healthScore: { total: 6, passed: 5, warnings: 1, errors: 0 },
        system: { versions: { core: '0.5.4', npm: '0.41.0' } },
      },
    });

    expect(policyPayload).toBeTruthy();

    const advisor = buildDoctorIssueAdvisorQuestion(policyPayload!);
    expect(advisor).toContain('Issue detected by Workspai Governance Policy');
    expect(advisor).not.toContain('Issue detected by Workspai Doctor');
    expect(advisor).toContain('"source": "workspace-governance-policy"');

    const studio = buildDoctorIssueStudioPrompt(policyPayload!);
    expect(studio).toContain('workspace governance evidence issue');
    expect(studio).toContain('## Governance policy issue');
    expect(studio).toContain('workspace verify/model evidence');
    expect(studio).not.toContain('## Doctor issue');

    const copilot = buildDoctorIssueCopilotQuestion(policyPayload!);
    expect(copilot).toContain('Workspai governance policy issue');
    expect(copilot).toContain('workspace verify/model evidence artifacts');
  });
});
