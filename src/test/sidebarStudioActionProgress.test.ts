import { describe, expect, it } from 'vitest';

import { parseSidebarStudioActionProgress } from '../../webview-ui/src/lib/sidebarStudioActionProgress';
import { parseStudioActionFailure } from '../../webview-ui/src/lib/studioVerifyFailure';

describe('sidebarStudioActionProgress', () => {
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

  it('maps handoff verify progress before the host responds', () => {
    expect(
      parseSidebarStudioActionProgress({
        action: 'verify-handoff',
        status: 'running',
        phase: 'verifying-handoff',
      })
    ).toMatchObject({
      action: 'verify-handoff',
      status: 'running',
      title: 'Running verify',
      summary: 'Running the card verify command',
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
});
