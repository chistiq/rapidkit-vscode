export type SidebarStudioActionProgressView = {
  action: string;
  status: 'running' | 'review' | 'done';
  phase?: string;
  title: string;
  summary: string;
  commandText?: string;
  nextAction?: 'auto-fix' | 'continue-remediation';
  nextActionLabel?: string;
};

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    'auto-fix': 'Auto-fix',
    'apply-patch': 'Patch apply',
    'apply-remediation-step': 'Apply and verify',
    'run-remediation-command': 'Repair command',
    'refresh-remediation-plan': 'Evidence refresh',
    'verify-handoff': 'Verify',
    verify: 'Verify',
    'ship-loop-step': 'Ship-loop step',
    'refresh-ship-loop': 'Ship-loop refresh',
    'run-command': 'Command',
    'copy-command': 'Copy command',
    'retry-audit': 'Audit retry',
  };
  return labels[action] ?? 'Studio action';
}

function actionPhaseTitle(
  action: string,
  status: SidebarStudioActionProgressView['status'],
  phase?: string
): string {
  if (action === 'apply-remediation-step') {
    if (phase === 'applying-remediation-step') {
      return 'Applying approved fix';
    }
    if (phase === 'verifying-remediation-step') {
      return 'Running verify after apply';
    }
    if (status === 'done') {
      return 'Apply and verify complete';
    }
  }
  if (action === 'run-remediation-command') {
    if (phase === 'running-remediation-command') {
      return 'Running repair command';
    }
    if (phase === 'verifying-remediation-command') {
      return 'Running verify after command';
    }
    if (status === 'done') {
      return 'Repair command complete';
    }
  }
  if (action === 'refresh-remediation-plan') {
    if (phase === 'refreshing-remediation-plan') {
      return 'Refreshing repair evidence';
    }
    if (status === 'done') {
      return 'Repair evidence refreshed';
    }
  }
  if (action === 'verify-handoff' || action === 'verify') {
    if (phase === 'verifying-handoff') {
      return 'Running verify';
    }
    if (status === 'done') {
      return 'Verify complete';
    }
  }
  return status === 'running'
    ? `${actionLabel(action)} running`
    : status === 'review'
      ? `${actionLabel(action)} needs review`
      : `${actionLabel(action)} complete`;
}

function phaseLabel(phase?: string): string | undefined {
  if (!phase) {
    return undefined;
  }
  const labels: Record<string, string> = {
    'applying-remediation-step': 'Applying approved file operation',
    'verifying-remediation-step': 'Running verify after apply',
    'running-remediation-command': 'Running selected repair command',
    'verifying-remediation-command': 'Running verify after command',
    'refreshing-remediation-plan': 'Refreshing source evidence and the npm repair plan',
    'verifying-handoff': 'Running the card verify command',
    'preparing-doctor-fix': 'Preparing the Doctor fix command',
    'running-doctor-fix': 'Doctor fix is running against workspace evidence',
    'reading-doctor-fix-result': 'Reading Doctor fix output',
    'applying-patch': 'Applying reviewed patch',
    fixing: 'Applying fix',
    'running-source-command': 'Running source command',
  };
  return labels[phase] ?? phase.replace(/-/g, ' ');
}

export function parseSidebarStudioActionProgress(
  value: unknown
): SidebarStudioActionProgressView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const status =
    record.status === 'running' || record.status === 'review' || record.status === 'done'
      ? record.status
      : null;
  const action = optionalTrimmedString(record.action);
  if (!status || !action) {
    return null;
  }
  const phase = optionalTrimmedString(record.phase);
  const phaseSummary = phaseLabel(phase);
  const title = optionalTrimmedString(record.title) ?? actionPhaseTitle(action, status, phase);
  const summary =
    optionalTrimmedString(record.summary) ??
    phaseSummary ??
    (status === 'running'
      ? 'Studio is working on this card.'
      : status === 'review'
        ? 'Review is required before Studio can continue.'
        : 'Studio completed this action.');

  return {
    action,
    status,
    phase,
    title,
    summary,
    commandText: optionalTrimmedString(record.commandText),
    nextAction:
      record.nextAction === 'auto-fix' || record.nextAction === 'continue-remediation'
        ? record.nextAction
        : undefined,
    nextActionLabel: optionalTrimmedString(record.nextActionLabel),
  };
}
