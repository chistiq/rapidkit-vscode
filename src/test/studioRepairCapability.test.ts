import { describe, expect, it } from 'vitest';

import {
  deriveStudioRepairCapability,
  type StudioRepairCapability,
} from '../../webview-ui/src/lib/studioRepairCapability';
import type { DoctorRemediationPlanView } from '../../webview-ui/src/lib/doctorRemediationPlan';
import type { StudioBlockerHandoffView } from '../../webview-ui/src/lib/studioBlockerHandoff';

const handoff: StudioBlockerHandoffView = {
  schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
  cardId: 'project-doctor',
  cardLabel: 'Project Doctor',
  cardStatus: 'warn',
  artifactPath: '/workspace/.rapidkit/reports/doctor-project-last-run.json',
  sourceCommand: 'npx rapidkit doctor project --json',
  scope: 'project',
  blockerSignature: 'test-script-missing',
  blockers: ['test script surface: No test script detected for Next.js.'],
  verifyCommand: 'npx rapidkit doctor project --json',
};

function planWithStep(
  step: DoctorRemediationPlanView['visibleSteps'][number]
): DoctorRemediationPlanView {
  return {
    schemaVersion: 'doctor-remediation-plan-v2',
    sourcePath: '/workspace/.rapidkit/reports/doctor-remediation-plan-last-run.json',
    generatedAt: '2026-06-30T00:00:00.000Z',
    policyProfile: 'enterprise-strict',
    totalSteps: 1,
    executableSteps: step.executable ? 1 : 0,
    risk: {
      safe: step.risk === 'safe' ? 1 : 0,
      guarded: step.risk === 'guarded' ? 1 : 0,
      invasive: 0,
    },
    visibleSteps: [step],
    hiddenStepCount: 0,
    scope: 'project',
    freshness: { verdict: 'fresh' },
  };
}

describe('studio repair capability', () => {
  it.each([
    [
      { type: 'file-create' as const, path: 'README.md', content: 'ok', overwrite: false },
      'Create file',
    ],
    [
      { type: 'file-append' as const, path: '.gitignore', lines: ['.env'], ensureNewline: true },
      'Append lines',
    ],
    [
      {
        type: 'file-copy' as const,
        sourcePath: 'template.yml',
        path: '.github/workflows/ci.yml',
        overwrite: false,
      },
      'Copy file',
    ],
    [
      {
        type: 'package-json-script' as const,
        path: 'package.json',
        scriptName: 'test',
        scriptValue: 'vitest run',
      },
      'Update script',
    ],
    [
      {
        type: 'json-edit' as const,
        path: '.rapidkit/policies.json',
        edits: [{ pointer: '/ci/enabled', value: true }],
      },
      'Update JSON',
    ],
    [
      {
        type: 'env-key-add' as const,
        path: '.env.example',
        keys: [{ name: 'DATABASE_URL', value: '' }],
      },
      'Add env keys',
    ],
    [
      {
        type: 'makefile-target' as const,
        path: 'Makefile',
        target: 'audit',
        command: 'npm audit',
        phony: true,
      },
      'Add target',
    ],
  ])('uses operation-specific primary labels for %s', (operation, label) => {
    const step = {
      id: `operation-${operation.type}`,
      phase: 'repair',
      order: 1,
      projectName: 'web',
      projectPath: '/workspace/apps/web',
      originalCommand: 'npx rapidkit workspace remediation-plan --json',
      kind: 'edit-file',
      risk: 'safe' as const,
      executable: true,
      studioState: 'ready' as const,
      studioReason: 'Safe deterministic edit.',
      primaryAction: 'Apply deterministic edit',
      requiresApproval: true,
      previewTitle: 'Apply deterministic edit',
      previewSummary: 'Applies one deterministic change.',
      diffSummary: 'One deterministic edit.',
      files: [operation.path],
      verifyCommand: 'npx rapidkit workspace verify --json',
      refreshCommands: ['workspace-doctor'],
      operation,
      canApply: true,
    };

    const capability = deriveStudioRepairCapability({
      plan: planWithStep(step),
      step,
      handoff,
    }) as StudioRepairCapability;

    expect(capability.primaryLabel).toBe(label);
  });

  it('classifies deterministic package-json edits as an apply-first workspace edit', () => {
    const step = {
      id: 'next-test-script',
      phase: 'repair',
      order: 1,
      projectName: 'web',
      projectPath: '/workspace/apps/web',
      originalCommand: 'npx rapidkit doctor project --json',
      kind: 'package-json-script',
      risk: 'safe' as const,
      executable: true,
      studioState: 'ready' as const,
      studioReason: 'Add a deterministic test script.',
      primaryAction: 'Add test script',
      requiresApproval: true,
      previewTitle: 'Add Next.js test script',
      previewSummary: 'Adds scripts.test to package.json.',
      diffSummary: 'package.json scripts.test will be added.',
      files: ['/workspace/apps/web/package.json'],
      verifyCommand: 'npx rapidkit doctor project --json',
      refreshCommands: ['project-doctor'],
      operation: {
        type: 'package-json-script' as const,
        path: 'package.json',
        scriptName: 'test',
        scriptValue: 'vitest run',
      },
      canApply: true,
    };

    const capability = deriveStudioRepairCapability({
      plan: planWithStep(step),
      step,
      handoff,
    }) as StudioRepairCapability;

    expect(capability.fixKind).toBe('workspace-edit');
    expect(capability.canEditFiles).toBe(true);
    expect(capability.primaryLabel).toBe('Update script');
    expect(capability.secondaryLabel).toBe('Run check');
    expect(capability.verifyCommand).toBe('npx rapidkit doctor project --json');
    expect(capability.files).toContain('/workspace/apps/web/package.json');
  });

  it('keeps command-only remediation as diagnostic instead of fake mutation', () => {
    const step = {
      id: 'audit-refresh',
      phase: 'diagnose',
      order: 1,
      projectName: 'web',
      projectPath: '/workspace/apps/web',
      originalCommand: 'npm audit --json',
      kind: 'dependency-audit',
      risk: 'guarded' as const,
      executable: true,
      studioState: 'guidance-only' as const,
      studioReason: 'Dependency audit must run before a safe fix can be selected.',
      primaryAction: 'Run audit',
      requiresApproval: false,
      previewTitle: 'Refresh dependency audit',
      previewSummary: 'Runs npm audit for current evidence.',
      diffSummary: '',
      files: [],
      refreshCommands: [],
      canApply: false,
    };

    const capability = deriveStudioRepairCapability({
      plan: planWithStep(step),
      step,
      handoff,
    }) as StudioRepairCapability;

    expect(capability.fixKind).toBe('run-command');
    expect(capability.canEditFiles).toBe(false);
    expect(capability.primaryLabel).toBe('Run check');
  });
});
