import type { StudioBlockerHandoffView } from './studioBlockerHandoff';

export type StudioVerifyFailureView = {
  title?: string;
  action?: string;
  commandText?: string;
  dashboardCommandId?: string;
  executionChannel?: 'terminal' | 'background';
  capabilityGate?: string;
  safetyRisk?: 'read' | 'write' | 'destructive';
  safetyConfirmation?: string;
  safetyRefreshCommands?: string[];
  rollbackCommand?: string;
  exitCode?: number | null;
  stderrTail?: string;
  summary?: string;
  topBlocker?: string;
  error?: string;
  nextAction?: string;
};

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function parseStudioVerifyFailure(value: unknown): StudioVerifyFailureView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.action !== 'verify-handoff' || record.status !== 'failed') {
    return null;
  }
  return {
    title: optionalTrimmedString(record.title) ?? 'Verify failed',
    action: 'verify-handoff',
    commandText: optionalTrimmedString(record.commandText),
    dashboardCommandId: optionalTrimmedString(record.dashboardCommandId),
    executionChannel:
      record.executionChannel === 'terminal' || record.executionChannel === 'background'
        ? record.executionChannel
        : undefined,
    capabilityGate: optionalTrimmedString(record.capabilityGate),
    safetyRisk:
      record.safetyRisk === 'read' ||
      record.safetyRisk === 'write' ||
      record.safetyRisk === 'destructive'
        ? record.safetyRisk
        : undefined,
    safetyConfirmation: optionalTrimmedString(record.safetyConfirmation),
    safetyRefreshCommands: Array.isArray(record.safetyRefreshCommands)
      ? record.safetyRefreshCommands.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    rollbackCommand: optionalTrimmedString(record.rollbackCommand),
    exitCode:
      typeof record.exitCode === 'number' || record.exitCode === null ? record.exitCode : undefined,
    stderrTail: optionalTrimmedString(record.stderrTail),
    summary: optionalTrimmedString(record.summary),
    topBlocker: optionalTrimmedString(record.topBlocker),
    error: optionalTrimmedString(record.error),
    nextAction: optionalTrimmedString(record.nextAction),
  };
}

export function parseStudioActionFailure(value: unknown): StudioVerifyFailureView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.status !== 'failed') {
    return null;
  }
  const action = optionalTrimmedString(record.action);
  if (!action) {
    return null;
  }
  if (action === 'verify-handoff') {
    return parseStudioVerifyFailure(value);
  }
  const titleByAction: Record<string, string> = {
    'auto-fix': 'Auto-fix failed',
    'apply-patch': 'Patch apply failed',
    'apply-remediation-step': 'Apply and verify failed',
    'run-remediation-command': 'Repair command failed',
    'refresh-remediation-plan': 'Evidence refresh failed',
    'ship-loop-step': 'Ship-loop step failed',
    'refresh-ship-loop': 'Ship-loop refresh failed',
    'retry-audit': 'Audit retry failed',
    verify: 'Verify failed',
    'run-command': 'Command run failed',
    'copy-command': 'Command copy failed',
    copy: 'Copy failed',
  };
  return {
    title: optionalTrimmedString(record.title) ?? titleByAction[action] ?? 'Studio action failed',
    action,
    commandText: optionalTrimmedString(record.commandText),
    dashboardCommandId: optionalTrimmedString(record.dashboardCommandId),
    executionChannel:
      record.executionChannel === 'terminal' || record.executionChannel === 'background'
        ? record.executionChannel
        : undefined,
    capabilityGate: optionalTrimmedString(record.capabilityGate),
    safetyRisk:
      record.safetyRisk === 'read' ||
      record.safetyRisk === 'write' ||
      record.safetyRisk === 'destructive'
        ? record.safetyRisk
        : undefined,
    safetyConfirmation: optionalTrimmedString(record.safetyConfirmation),
    safetyRefreshCommands: Array.isArray(record.safetyRefreshCommands)
      ? record.safetyRefreshCommands.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    rollbackCommand: optionalTrimmedString(record.rollbackCommand),
    exitCode:
      typeof record.exitCode === 'number' || record.exitCode === null ? record.exitCode : undefined,
    stderrTail: optionalTrimmedString(record.stderrTail),
    summary: optionalTrimmedString(record.summary),
    topBlocker: optionalTrimmedString(record.topBlocker),
    error: optionalTrimmedString(record.error),
    nextAction: optionalTrimmedString(record.nextAction),
  };
}

export function enrichStudioActionFailureWithHandoff(
  failure: StudioVerifyFailureView,
  handoff?: StudioBlockerHandoffView | null
): StudioVerifyFailureView {
  if (!handoff) {
    return failure;
  }
  return {
    ...failure,
    dashboardCommandId: failure.dashboardCommandId ?? handoff.dashboardCommandId,
    executionChannel: failure.executionChannel ?? handoff.executionChannel,
    capabilityGate: failure.capabilityGate ?? handoff.capabilityGate,
    safetyRisk: failure.safetyRisk ?? handoff.safetyRisk,
    safetyConfirmation: failure.safetyConfirmation ?? handoff.safetyConfirmation,
    safetyRefreshCommands: failure.safetyRefreshCommands ?? handoff.safetyRefreshCommands,
  };
}

export function studioVerifyFailureSummary(failure: StudioVerifyFailureView): string {
  if (failure.stderrTail) {
    return failure.stderrTail;
  }
  if (failure.summary) {
    return failure.summary;
  }
  if (failure.topBlocker) {
    return failure.topBlocker;
  }
  return failure.error ?? 'The Studio action failed. Inspect the command output and retry.';
}
