import { describe, expect, it } from 'vitest';

import { STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION } from '../contracts/studio-blocker-handoff-contract.js';
import { DOCTOR_REMEDIATION_PLAN_SCHEMA_VERSION } from '../core/doctorRemediationPlanReader.js';
import { buildSidebarStudioPrompt } from '../core/sidebarStudioFixPrompt.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import type { DoctorRemediationPlanView } from '../core/doctorRemediationPlanReader.js';

const handoff: StudioBlockerHandoff = {
  schemaVersion: STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION,
  cardId: 'workspace-doctor',
  cardLabel: 'Workspace Doctor',
  cardStatus: 'warn',
  blockers: ['Security hygiene surface: No .gitignore baseline detected.'],
  artifactPath: '/workspace/.rapidkit/reports/doctor-last-run.json',
  sourceCommand: 'npx rapidkit doctor workspace --json',
  scope: 'workspace',
  blockerSignature: '1234567890abcdef',
  resolutionClass: 'source-fix',
  studioMode: 'FIX',
  verifyCommand: 'npx rapidkit doctor project --json',
  workspacePath: '/workspace',
  projectPath: '/workspace/fastapi-service',
  commandRunCount: 2,
  exitCode: 1,
  stderrTail: 'No .gitignore baseline detected.',
  incidentSummary: {
    title: 'Fix Workspace Doctor',
    phase: 'fix',
    primaryAction: 'Fix by Workspai',
    verifyRequired: true,
    auditStatus: 'not-started',
  },
};

const remediationPlan: DoctorRemediationPlanView = {
  schemaVersion: DOCTOR_REMEDIATION_PLAN_SCHEMA_VERSION,
  sourcePath: '/workspace/.rapidkit/reports/doctor-remediation-plan-last-run.json',
  generatedAt: '2026-07-01T00:00:00.000Z',
  policyProfile: 'enterprise',
  totalSteps: 6,
  executableSteps: 2,
  risk: { safe: 1, guarded: 5, invasive: 0 },
  scope: 'workspace',
  freshness: { verdict: 'fresh' },
  hiddenStepCount: 5,
  visibleSteps: [
    {
      id: 'fastapi-service:gitignore',
      phase: 'fix',
      order: 1,
      projectName: 'fastapi-service',
      projectPath: '/workspace/fastapi-service',
      originalCommand: 'npx rapidkit doctor project --fix --json',
      kind: 'security-hygiene',
      risk: 'safe',
      executable: true,
      studioState: 'ready',
      studioReason: 'Ready for deterministic apply.',
      primaryAction: 'Create .gitignore secret baseline',
      requiresApproval: true,
      confidence: 'high',
      previewTitle: 'Create .gitignore secret baseline',
      previewSummary: 'Create .gitignore if it does not already exist.',
      diffSummary: 'Create .gitignore without overwriting an existing file.',
      files: ['.gitignore'],
      verifyCommand: 'npx rapidkit doctor project --json',
      refreshCommands: ['npx rapidkit doctor workspace --plan --json'],
      operation: {
        type: 'file-create',
        path: '.gitignore',
        content: '.env\n.env.*\n',
        overwrite: false,
      },
      canApply: true,
    },
  ],
};

describe('sidebarStudioFixPrompt', () => {
  it('grounds card chat in the active remediation plan instead of only generic blockers', () => {
    const prompt = buildSidebarStudioPrompt({
      task: 'What should I do next?',
      handoff,
      remediationPlan,
      studioMode: 'investigate',
    });

    expect(prompt).toContain('## Active blocker handoff');
    expect(prompt).toContain('## Active remediation plan');
    expect(prompt).toContain('- Workspace path: /workspace');
    expect(prompt).toContain('- Project path: /workspace/fastapi-service');
    expect(prompt).toContain(
      '- Evidence artifact: /workspace/.rapidkit/reports/doctor-last-run.json'
    );
    expect(prompt).toContain('- Last exit code: 1');
    expect(prompt).toContain('- Prior command runs for this signature: 2');
    expect(prompt).toContain('- Incident phase: fix');
    expect(prompt).toContain('- Primary action: Fix by Workspai');
    expect(prompt).toContain('Step 1: Create .gitignore secret baseline');
    expect(prompt).toContain('Apply available: yes');
    expect(prompt).toContain('Use the active remediation plan as the source of truth');
    expect(prompt).toContain('Do not invent unrelated framework setup');
    expect(prompt).toContain('return patch blocks in this exact format');
    expect(prompt).toContain('Do not present prose guidance as a completed repair');
  });

  it('treats short follow-ups as continuation of the active card repair session', () => {
    const prompt = buildSidebarStudioPrompt({
      task: 'yes',
      handoff,
      remediationPlan,
      studioMode: 'investigate',
    });

    expect(prompt).toContain('Card repair continuation contract');
    expect(prompt).toContain(
      'Treat short follow-ups such as "continue", "fix it", "apply it", "yes"'
    );
    expect(prompt).toContain('Do not ask the user to restate the blocker');
    expect(prompt).toContain('use the active blocker handoff, project path, remediation plan');
    expect(prompt).toContain('If the user asks a casual or clarifying question');
    expect(prompt).toContain(
      'Prefer the project path from the handoff over the globally active workspace/project'
    );
    expect(prompt).toContain(
      'Never switch to a generic workspace answer while a card repair handoff is active'
    );
  });

  it('makes the AI-assisted source fix path explicit when no deterministic step remains', () => {
    const prompt = buildSidebarStudioPrompt({
      task: 'continue with AI fix',
      handoff,
      remediationPlan: {
        ...remediationPlan,
        totalSteps: 0,
        executableSteps: 0,
        visibleSteps: [],
        hiddenStepCount: 0,
      },
      studioMode: 'investigate',
    });

    expect(prompt).toContain('Deterministic remediation steps: none visible.');
    expect(prompt).toContain(
      'Continue with AI fix: propose the smallest source/config edit grounded in the blocker and verify command.'
    );
    expect(prompt).toContain('If deterministic steps are exhausted or blocked');
  });

  it('uses standalone workspace verify as the verify-only fallback', () => {
    const prompt = buildSidebarStudioPrompt({
      task: 'verify this card',
      handoff: {
        ...handoff,
        studioMode: 'VERIFY_ONLY',
        verifyCommand: undefined,
      },
      remediationPlan,
      studioMode: 'verify',
    });

    expect(prompt).toContain('Only recommend: workspace verify --json');
    expect(prompt).not.toContain('Only recommend: workspace verify --from-impact');
  });
});
