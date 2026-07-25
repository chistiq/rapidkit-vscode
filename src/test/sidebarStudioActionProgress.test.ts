import { describe, expect, it } from 'vitest';

import {
  enrichSidebarStudioActionProgressWithHandoff,
  parseSidebarStudioActionProgress,
  studioAgentToolProgressCopy,
} from '../../webview-ui/src/lib/sidebarStudioActionProgress';
import { parseStudioActionFailure } from '../../webview-ui/src/lib/studioVerifyFailure';

describe('sidebarStudioActionProgress', () => {
  it('uses concise Copilot-style labels for native Agent tool activity', () => {
    expect(studioAgentToolProgressCopy('recover-active-blocker', 'running')).toEqual({
      title: 'Resolving the active blocker',
      phase: 'recover-active-blocker',
    });
    expect(studioAgentToolProgressCopy('inspect-dependency-security', 'running')).toEqual({
      title: 'Auditing dependencies',
      phase: 'inspect-dependency-security',
    });
    expect(studioAgentToolProgressCopy('repair-dependency-security', 'failed')).toEqual({
      title: 'Dependency repair needs a source edit',
      phase: 'repair-dependency-security',
    });
    expect(studioAgentToolProgressCopy('apply-workspace-patch', 'completed')).toEqual({
      title: 'Applied source edit',
      phase: 'apply-workspace-patch',
    });
    expect(studioAgentToolProgressCopy('run-workspace-command', 'running')).toEqual({
      title: 'Running workspace command',
      phase: 'run-workspace-command',
    });
    expect(studioAgentToolProgressCopy('delete-workspace-files', 'completed')).toEqual({
      title: 'Removed inspected source',
      phase: 'delete-workspace-files',
    });
  });

  it('maps apply-remediation verify progress to a user-visible status', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'apply-remediation-step',
        status: 'running',
        phase: 'applying-remediation-step',
      })
    ).toMatchObject({
      title: 'Applying approved fix',
      summary: 'Applying approved file operation',
    });

    expect(
      parseSidebarStudioActionProgress({
        action: 'apply-remediation-step',
        status: 'running',
        phase: 'verifying-remediation-step',
        summary: 'Fix applied. Running verify now.',
      })
    ).toMatchObject({
      action: 'apply-remediation-step',
      status: 'running',
      title: 'Running verify after apply',
      summary: 'Fix applied. Running verify now.',
      phase: 'verifying-remediation-step',
    });
  });

  it('does not turn failures into progress and keeps the failure title specific', () => {
    const failed = {
      action: 'apply-remediation-step',
      status: 'failed',
      summary: 'Verify failed.',
    };

    expect(parseSidebarStudioActionProgress(failed)).toBeNull();
    expect(parseStudioActionFailure(failed)).toMatchObject({
      title: 'Apply and verify failed',
      action: 'apply-remediation-step',
    });
  });

  it('maps remediation command progress separately from terminal command execution', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'run-remediation-command',
        status: 'running',
        phase: 'running-remediation-command',
      })
    ).toMatchObject({
      title: 'Running repair command',
      summary: 'Running selected repair command',
    });

    expect(
      parseSidebarStudioActionProgress({
        action: 'run-remediation-command',
        status: 'running',
        phase: 'verifying-remediation-command',
      })
    ).toMatchObject({
      title: 'Running verify after command',
      summary: 'Running verify after command',
    });

    expect(
      parseStudioActionFailure({
        action: 'run-remediation-command',
        status: 'failed',
      })
    ).toMatchObject({
      title: 'Repair command failed',
    });
  });

  it('maps remediation refresh progress and failures', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'refresh-remediation-plan',
        status: 'running',
        phase: 'reading-evidence',
      })
    ).toMatchObject({
      title: 'Reading repair evidence',
      summary: 'Matching this card to source evidence and npm repair plans',
    });

    expect(
      parseSidebarStudioActionProgress({
        action: 'refresh-remediation-plan',
        status: 'running',
        phase: 'refreshing-remediation-plan',
      })
    ).toMatchObject({
      title: 'Refreshing repair evidence',
      summary: 'Refreshing source evidence and the npm repair plan',
    });

    expect(
      parseStudioActionFailure({
        action: 'refresh-remediation-plan',
        status: 'failed',
      })
    ).toMatchObject({
      title: 'Evidence refresh failed',
    });
  });

  it('maps awaiting verify and verified phases without dropping progress copy', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'apply-remediation-step',
        status: 'review',
        phase: 'awaiting-verify',
      })
    ).toMatchObject({
      title: 'Apply and verify needs review',
      summary: 'Fix applied; verify is required before completion',
    });

    expect(
      parseSidebarStudioActionProgress({
        action: 'verify-handoff',
        status: 'done',
        phase: 'verified',
      })
    ).toMatchObject({
      title: 'Verify complete',
      summary: 'Verify passed and dashboard evidence can refresh',
    });
  });

  it('maps long Doctor fix heartbeat phases to live Studio copy', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'auto-fix',
        status: 'running',
        phase: 'preparing-doctor-fix',
      })
    ).toMatchObject({
      title: 'Auto-fix running',
      summary: 'Preparing the Doctor fix command',
    });

    expect(
      parseSidebarStudioActionProgress({
        action: 'auto-fix',
        status: 'running',
        phase: 'running-doctor-fix',
        summary: 'Doctor fix is still running (20s). Keeping this repair session live.',
      })
    ).toMatchObject({
      title: 'Auto-fix running',
      summary: 'Doctor fix is still running (20s). Keeping this repair session live.',
    });

    expect(
      parseSidebarStudioActionProgress({
        action: 'auto-fix',
        status: 'running',
        phase: 'reading-doctor-fix-result',
      })
    ).toMatchObject({
      title: 'Auto-fix running',
      summary: 'Reading Doctor fix output',
    });
  });

  it('keeps AI repair phases and real approval boundaries explicit', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'auto-fix',
        status: 'running',
        phase: 'requesting-ai-repair',
      })
    ).toMatchObject({
      summary: 'AI is diagnosing the source issue',
    });

    expect(
      parseSidebarStudioActionProgress({
        action: 'apply-remediation-step',
        status: 'review',
        requiresApproval: true,
        nextAction: 'continue-remediation',
        nextActionLabel: 'Approve and continue',
      })
    ).toMatchObject({
      requiresApproval: true,
      nextAction: 'continue-remediation',
      nextActionLabel: 'Approve and continue',
    });
  });

  it('maps handoff verify progress before the host responds', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'verify-handoff',
        status: 'running',
        phase: 'verifying-handoff',
        dashboardCommandId: 'workspaceVerify',
        executionChannel: 'background',
        capabilityGate: 'workspace verify',
      })
    ).toMatchObject({
      action: 'verify-handoff',
      status: 'running',
      title: 'Running verify',
      summary: 'Running the card verify command',
      dashboardCommandId: 'workspaceVerify',
      executionChannel: 'background',
      capabilityGate: 'workspace verify',
    });
  });

  it('inherits command contract metadata from the active Studio handoff', () => {
    const progress = parseSidebarStudioActionProgress({
      action: 'run-remediation-command',
      status: 'running',
      phase: 'running-remediation-command',
    });

    expect(progress).not.toBeNull();
    expect(
      enrichSidebarStudioActionProgressWithHandoff(progress!, {
        schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
        cardId: 'workspace-verify',
        cardStatus: 'fail',
        blockers: ['verify blocked'],
        artifactPath: '.rapidkit/reports/workspace-verify-last-run.json',
        sourceCommand: 'npx rapidkit workspace verify --json',
        dashboardCommandId: 'workspaceVerify',
        executionChannel: 'background',
        capabilityGate: 'workspace verify',
        safetyRisk: 'write',
        safetyRefreshCommands: ['npx rapidkit workspace verify --json'],
        scope: 'workspace',
        blockerSignature: 'abc123456789abcd',
      })
    ).toMatchObject({
      dashboardCommandId: 'workspaceVerify',
      executionChannel: 'background',
      capabilityGate: 'workspace verify',
      safetyRisk: 'write',
      safetyRefreshCommands: ['npx rapidkit workspace verify --json'],
    });
  });

  it('keeps the continue-fix CTA when evidence refresh succeeds without a deterministic plan', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'refresh-remediation-plan',
        status: 'review',
        title: 'Evidence refreshed; source fix needed',
        summary: 'The artifact is fresh, but no deterministic repair plan is available.',
        nextAction: 'auto-fix',
        nextActionLabel: 'Continue with fix',
      })
    ).toMatchObject({
      action: 'refresh-remediation-plan',
      status: 'review',
      title: 'Evidence refreshed; source fix needed',
      nextAction: 'auto-fix',
      nextActionLabel: 'Continue with fix',
    });
  });

  it('keeps the continue-remediation CTA for deterministic repair loops', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'apply-remediation-step',
        status: 'review',
        title: 'Next safe step ready',
        summary: 'The card still needs attention. Studio loaded the next deterministic step.',
        nextAction: 'continue-remediation',
        nextActionLabel: 'Continue repair',
      })
    ).toMatchObject({
      nextAction: 'continue-remediation',
      nextActionLabel: 'Continue repair',
    });
  });

  it('preserves opaque Agent transaction identity for a live Undo action', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'apply-workspace-patch',
        status: 'done',
        title: 'Changed 2 files',
        summary: 'Edit transaction applied.',
        changedPaths: ['package.json', 'src/index.ts'],
        invocationId: 'tool-call-123',
        canUndo: true,
      })
    ).toMatchObject({
      changedPaths: ['package.json', 'src/index.ts'],
      invocationId: 'tool-call-123',
      canUndo: true,
    });
  });
});
