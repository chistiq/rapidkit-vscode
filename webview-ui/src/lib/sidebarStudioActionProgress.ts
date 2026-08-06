import type { StudioBlockerHandoffView } from './studioBlockerHandoff';
import type { StudioIntelligencePhaseId } from './studioIntelligencePhaseRail';

export type SidebarStudioActionProgressView = {
  action: string;
  status: 'running' | 'review' | 'done';
  phase?: string;
  intelligencePhase?: StudioIntelligencePhaseId;
  title: string;
  summary: string;
  commandText?: string;
  dashboardCommandId?: string;
  executionChannel?: 'terminal' | 'background';
  capabilityGate?: string;
  safetyRisk?: 'read' | 'write' | 'destructive';
  safetyConfirmation?: string;
  safetyRefreshCommands?: string[];
  requiresApproval?: boolean;
  nextAction?: 'auto-fix' | 'continue-remediation';
  nextActionLabel?: string;
  changedPaths?: string[];
  activityPaths?: string[];
  outputText?: string;
  fileChanges?: Array<{
    relativePath: string;
    status: string;
    isNewFile?: boolean;
    failReason?: string;
    diffLines?: Array<{ type: 'added' | 'removed' | 'unchanged'; content: string }>;
  }>;
  invocationId?: string;
  canUndo?: boolean;
};

const STUDIO_AGENT_TOOL_LABELS: Record<
  string,
  { running: string; completed: string; failed: string }
> = {
  'recover-active-blocker': {
    running: 'Resolving the active blocker',
    completed: 'Resolved the active blocker path',
    failed: 'Source repair is required',
  },
  'discover-workspace-files': {
    running: 'Discovering workspace files',
    completed: 'Discovered workspace files',
    failed: 'Workspace discovery needs a narrower scope',
  },
  'inspect-source': {
    running: 'Reading source',
    completed: 'Read source',
    failed: 'Source inspection needs another path',
  },
  'inspect-evidence': {
    running: 'Reading evidence',
    completed: 'Read evidence',
    failed: 'Evidence inspection needs another path',
  },
  'search-workspace': {
    running: 'Searching workspace',
    completed: 'Searched workspace',
    failed: 'Workspace search needs refinement',
  },
  'inspect-workspace-diagnostics': {
    running: 'Reading diagnostics',
    completed: 'Read diagnostics',
    failed: 'Diagnostics are not available yet',
  },
  'inspect-workspace-changes': {
    running: 'Reviewing workspace changes',
    completed: 'Reviewed workspace changes',
    failed: 'Workspace changes could not be read',
  },
  'apply-workspace-patch': {
    running: 'Applying source edit',
    completed: 'Applied source edit',
    failed: 'Source edit was not applied',
  },
  'delete-workspace-files': {
    running: 'Removing inspected source',
    completed: 'Removed inspected source',
    failed: 'Source delete was not applied',
  },
  'run-governed-command': {
    running: 'Running intelligence producer',
    completed: 'Refreshed governed evidence',
    failed: 'Intelligence producer needs a source fix',
  },
  'run-workspace-command': {
    running: 'Running workspace command',
    completed: 'Ran workspace command',
    failed: 'Workspace command found remaining work',
  },
  'inspect-remediation-plan': {
    running: 'Reading remediation plan',
    completed: 'Read remediation plan',
    failed: 'Remediation plan needs fresh evidence',
  },
  'execute-remediation-step': {
    running: 'Applying remediation',
    completed: 'Applied remediation',
    failed: 'Remediation step did not clear the blocker',
  },
  'inspect-dependency-security': {
    running: 'Auditing dependencies',
    completed: 'Audited dependencies',
    failed: 'Dependency audit needs fresh evidence',
  },
  'repair-dependency-security': {
    running: 'Repairing dependencies',
    completed: 'Repaired dependencies',
    failed: 'Dependency repair needs a source edit',
  },
  'upgrade-dependency-security': {
    running: 'Upgrading vulnerable dependency',
    completed: 'Upgraded vulnerable dependency',
    failed: 'Dependency upgrade needs another candidate',
  },
  'complete-dependency-transaction': {
    running: 'Validating dependency transaction',
    completed: 'Dependency transaction closed',
    failed: 'Dependency transaction still has work',
  },
  'verify-blocker': {
    running: 'Verifying blocker',
    completed: 'Verified blocker',
    failed: 'Verify found remaining work',
  },
  'verify-goal': {
    running: 'Verifying engineering goal',
    completed: 'Verified engineering goal',
    failed: 'Goal still has work',
  },
};

export function studioAgentToolProgressCopy(
  toolName: string,
  state: 'running' | 'completed' | 'failed'
): { title: string; phase: string } {
  const normalized = toolName.trim() || 'studio-agent';
  const labels = STUDIO_AGENT_TOOL_LABELS[normalized];
  return {
    title: labels?.[state] ?? normalized.replace(/-/g, ' '),
    phase: normalized,
  };
}

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
    if (phase === 'reading-evidence') {
      return 'Reading repair evidence';
    }
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
    'reading-evidence': 'Matching this card to source evidence and npm repair plans',
    'refreshing-remediation-plan': 'Refreshing source evidence and the npm repair plan',
    'verifying-handoff': 'Running the card verify command',
    'awaiting-verify': 'Fix applied; verify is required before completion',
    verified: 'Verify passed and dashboard evidence can refresh',
    'preparing-doctor-fix': 'Preparing the Doctor fix command',
    'running-doctor-fix': 'Doctor fix is running against workspace evidence',
    'reading-doctor-fix-result': 'Reading Doctor fix output',
    'reading-ai-evidence': 'Reading blocker artifacts and exact source evidence',
    'evidence-changed': 'A new evidence generation arrived; restarting grounded reasoning',
    'observing-evidence': 'Live artifact generation observed by Studio',
    'refreshing-agent-evidence': 'Refreshing the canonical agent evidence index',
    'requesting-ai-repair': 'AI is diagnosing the source issue',
    'inspecting-agent-files': 'Inspecting source files selected by the model',
    'reading-agent-evidence': 'Reading allowlisted Workspai evidence',
    'running-agent-command': 'Running a governed Workspai command',
    'agent-budget-exhausted': 'Agent tool budget reached; preserving the latest evidence',
    'extracting-ai-patch': 'Extracting complete patches from the AI response',
    'evaluating-ai-patch': 'Checking patch safety and CLI target coverage',
    'applying-ai-patch': 'Applying the safe patch with rollback metadata',
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
    intelligencePhase:
      typeof record.intelligencePhase === 'string'
        ? (record.intelligencePhase as StudioIntelligencePhaseId)
        : undefined,
    title,
    summary,
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
    requiresApproval: record.requiresApproval === true,
    nextAction:
      record.nextAction === 'auto-fix' || record.nextAction === 'continue-remediation'
        ? record.nextAction
        : undefined,
    nextActionLabel: optionalTrimmedString(record.nextActionLabel),
    changedPaths: Array.isArray(record.changedPaths)
      ? record.changedPaths.filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
        )
      : undefined,
    invocationId: optionalTrimmedString(record.invocationId),
    canUndo: record.canUndo === true,
  };
}

export function enrichSidebarStudioActionProgressWithHandoff(
  progress: SidebarStudioActionProgressView,
  handoff?: StudioBlockerHandoffView | null
): SidebarStudioActionProgressView {
  if (!handoff) {
    return progress;
  }
  return {
    ...progress,
    dashboardCommandId: progress.dashboardCommandId ?? handoff.dashboardCommandId,
    executionChannel: progress.executionChannel ?? handoff.executionChannel,
    capabilityGate: progress.capabilityGate ?? handoff.capabilityGate,
    safetyRisk: progress.safetyRisk ?? handoff.safetyRisk,
    safetyConfirmation: progress.safetyConfirmation ?? handoff.safetyConfirmation,
    safetyRefreshCommands: progress.safetyRefreshCommands ?? handoff.safetyRefreshCommands,
  };
}
