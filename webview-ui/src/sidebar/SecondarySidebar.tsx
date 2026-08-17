import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Blocks,
  CheckCircle2,
  RotateCcw,
  ScanSearch,
  type LucideIcon,
} from 'lucide-react';
import { vscode } from '@/vscode';
import { useSidebarMessages } from './useSidebarMessages';
import { useChatSessions } from './useChatSessions';
import { useCreateSessions } from './useCreateSessions';
import { CreateTab } from './CreateTab';
import type { CreateDrawerId } from './drawers/CreateAddDrawer';
import { ChatTab } from './ChatTab';
import { AssistantModeSelector, type AssistantMode } from './composer/AssistantModeSelector';
import type { CreateTarget } from './composer/CreateTargetSelector';
import type { ManualWorkspaceInput } from './drawers/ManualWorkspaceDrawer';
import {
  FRAMEWORK_OPTIONS,
  type CreateMessage,
  type CreationPlan,
  type CreatedProject,
} from './createTypes';
import { normalizeModels, resolveSelectedModelId, type SidebarModel } from './sidebarModels';
import type { SidebarScope, SidebarTab } from './sidebarTypes';
import { resolveScopeFromPayload } from './sidebarTypes';
import { StudioBlockerChrome, parseStudioBlockerHandoffView } from './StudioBlockerChrome';
import { StudioPatchReview, type SidebarPatchReviewItem } from './StudioPatchReview';
import { StudioActionProgress } from './StudioActionProgress';
import { StudioRemediationPlan } from './StudioRemediationPlan';
import { StudioRepairPrelude } from './StudioRepairPrelude';
import { StudioRepairResult } from './StudioRepairResult';
import { StudioShipLoopStepper } from './StudioShipLoopStepper';
import { StudioIntelligencePhaseRail } from './StudioIntelligencePhaseRail';
import type { ChatSession } from './sidebarSessions';
import { chatSessionKind } from './sidebarSessions';
import {
  mergeStudioFixAppliedIntoHandoff,
  resolveStudioFixPhase,
  shouldAwaitVerifyAfterStudioFixApplied,
  type StudioBlockerHandoffView,
} from '@/lib/studioBlockerHandoff';
import {
  buildSidebarStudioRetryAuditPayload,
  parseSidebarStudioAuditState,
  type SidebarStudioAuditState,
} from '@/lib/sidebarStudioAuditState';
import {
  enrichStudioActionFailureWithHandoff,
  parseStudioActionFailure,
  type StudioVerifyFailureView,
} from '@/lib/studioVerifyFailure';
import {
  parseDoctorRemediationPlanView,
  type DoctorRemediationPlanView,
} from '@/lib/doctorRemediationPlan';
import {
  buildSidebarStudioAuditReturnState,
  buildSidebarStudioReturnState,
  type SidebarStudioReturnState,
} from '@/lib/sidebarStudioReturnState';
import {
  enrichSidebarStudioActionProgressWithHandoff,
  isCanonicalStudioRepairDecision,
  parseSidebarStudioActionProgress,
  studioAgentToolProgressCopy,
  type SidebarStudioActionProgressView,
} from '@/lib/sidebarStudioActionProgress';
import { appendStudioRepairTimelineEntry } from '@/lib/studioRepairTimeline';
import { resolveStudioIncidentRepairStatus } from '@/lib/studioIncidentRepairStatus';
import {
  describeStudioTerminalFailure,
  isStudioRepairActivelyOwned,
  settleStudioTimeline,
  terminalizeStudioProgress,
  terminalizeStudioTimeline,
} from '@/lib/studioSessionLifecycle';
import {
  resolveStudioIntelligencePhaseFromCard,
  resolveStudioIntelligencePhaseFromToolEvent,
  studioIntelligencePhaseLabel,
} from '@/lib/studioIntelligencePhaseRail';
import {
  scopeFromHandoff,
  scopePayloadForSession,
  scopePayloadFromScope,
  sessionScopeMode,
} from '@/lib/sidebarInteractionScope';

const META = { source: 'workspai-sidebar-react', version: '1' } as const;

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `m${messageSeq}`;
}

function frameworkLabel(key: string): string {
  return FRAMEWORK_OPTIONS.find((option) => option.value === key)?.label ?? key;
}

function humanizeStudioError(error: string): string {
  const seen = new Set<string>();
  const text = error
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.replace(/\s+/g, ' ').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
  if (!text) {
    return 'Studio could not complete this request. The repair workflow is still available from the card actions.';
  }
  if (
    text.includes('model_not_supported') ||
    text.includes('The requested model is not supported')
  ) {
    return 'The chat model configured for Studio is not available. Select a supported model or update the provider settings, then continue this repair session.';
  }
  if (text.includes('invalid_api_key') || text.includes('Incorrect API key')) {
    return 'Studio cannot reach the AI provider because the API key is missing or invalid. Update the provider settings, then continue this repair session.';
  }
  if (text.startsWith('Request Failed:')) {
    return 'Studio could not reach the AI provider for this message. The evidence-backed repair actions above are still usable.';
  }
  return text;
}

const TABS: {
  id: SidebarTab;
  label: string;
  shortLabel: string;
  title: string;
  icon: LucideIcon;
}[] = [
  {
    id: 'create',
    label: 'Create with AI',
    shortLabel: 'Create',
    title: 'Create with AI — scaffold workspaces and projects',
    icon: Blocks,
  },
  {
    id: 'studio',
    label: 'Assistant',
    shortLabel: 'Assistant',
    title: 'Workspai Assistant — Agent, Ask, Plan, and governed Goal workflows',
    icon: ScanSearch,
  },
];

type StudioMode = 'investigate' | 'verify' | 'prepare';

type EditorIssueSessionInput = {
  key: string;
  filePath?: string;
  fileName?: string;
  languageId?: string;
  diagnosticSignature?: string;
  source?: string;
  trigger?: string;
};

function basenameFromPath(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.split(/[\\/]/).filter(Boolean).pop();
}

function parseEditorIssueSessionInput(
  value: unknown,
  fallback: { source?: string; trigger?: string }
): EditorIssueSessionInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const filePath = typeof record.filePath === 'string' ? record.filePath.trim() : '';
  const fileName = typeof record.fileName === 'string' ? record.fileName.trim() : '';
  const languageId = typeof record.languageId === 'string' ? record.languageId.trim() : '';
  const diagnosticSignature =
    typeof record.diagnosticSignature === 'string' ? record.diagnosticSignature.trim() : '';
  const source = typeof record.source === 'string' ? record.source.trim() : fallback.source;
  const trigger = typeof record.trigger === 'string' ? record.trigger.trim() : fallback.trigger;
  if (!filePath && !fileName) {
    return null;
  }
  const key = [
    'editor-issue',
    trigger || 'editor',
    filePath || fileName,
    languageId,
    diagnosticSignature || 'selection',
  ].join('|');
  return {
    key,
    filePath: filePath || undefined,
    fileName: fileName || basenameFromPath(filePath),
    languageId: languageId || undefined,
    diagnosticSignature: diagnosticSignature || undefined,
    source,
    trigger,
  };
}

function editorIssueSessionTitle(
  prefix: 'Fix' | 'Explain',
  issue: EditorIssueSessionInput
): string {
  const file = issue.fileName || basenameFromPath(issue.filePath) || 'editor issue';
  return `${prefix} ${file}`;
}

type StudioPatchReviewState = {
  summary?: string;
  riskSummary?: string;
  patches: SidebarPatchReviewItem[];
};

function studioSuggestions(mode: StudioMode, scope: SidebarScope): string[] {
  const projectName = scope.projectName ? `"${scope.projectName}"` : 'the selected project';
  if (mode === 'verify') {
    return [
      'Verify the current workspace gates and tell me what blocks release.',
      `Check the evidence for ${projectName} and list the safest verification commands.`,
      'Find stale or missing evidence before I ship this workspace.',
      'Create a short verification checklist for the selected scope.',
    ];
  }
  if (mode === 'prepare') {
    return [
      'Prepare a safe action plan for the next change in this workspace.',
      'Turn the current evidence into a release-safe implementation plan.',
      `Plan the commands I should run before changing ${projectName}.`,
      'Create a rollback-aware plan for this scope.',
    ];
  }
  return [
    'Investigate why this workspace is not release-ready.',
    'Find the highest-risk files, projects, and evidence gaps for this scope.',
    'Explain what changed and what I should inspect first.',
  ];
}

function advisorSuggestions(scope: SidebarScope): string[] {
  if (scope.projectName) {
    const name = scope.projectName;
    return [
      `What are the highest-risk changes for "${name}" in this workspace?`,
      `Which workspace dependencies or shared modules affect "${name}"?`,
      `What release checks should pass before shipping "${name}"?`,
      `How should "${name}" communicate with the other projects?`,
      `What should I verify if "${name}" starts failing in CI?`,
    ];
  }
  return [
    'What is the best way to share code between projects in this workspace?',
    'How should I set up a shared database for all projects?',
    'What deployment strategy fits a multi-project Workspai workspace?',
    'Which projects are most likely to be affected by a shared contract change?',
    'What governance or release gates should this workspace enforce?',
  ];
}

function parseSidebarPatchReviewItems(value: unknown): SidebarPatchReviewItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => typeof entry.relativePath === 'string')
    .map((entry) => ({
      relativePath: entry.relativePath as string,
      status: typeof entry.status === 'string' ? entry.status : 'pending',
      isNewFile: entry.isNewFile === true,
      binary: entry.binary === true,
      stale: entry.stale === true,
      failReason: typeof entry.failReason === 'string' ? entry.failReason : undefined,
      diffLines: Array.isArray(entry.diffLines)
        ? entry.diffLines
            .filter((line) => line && typeof line === 'object' && !Array.isArray(line))
            .map((line) => line as Record<string, unknown>)
            .filter(
              (line) =>
                (line.type === 'added' || line.type === 'removed' || line.type === 'unchanged') &&
                typeof line.content === 'string'
            )
            .map((line) => ({
              type: line.type as 'added' | 'removed' | 'unchanged',
              content: line.content as string,
            }))
        : [],
    }));
}

function parseSidebarShipLoopCards(value: unknown): Array<{
  id: 'analyze' | 'verify-gates' | 'readiness' | 'archive' | 'autopilot';
  status: 'pass' | 'warn' | 'fail' | 'missing';
  summary?: string;
  blockers?: string[];
}> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => typeof entry.id === 'string')
    .map((entry) => ({
      id: entry.id as 'analyze' | 'verify-gates' | 'readiness' | 'archive' | 'autopilot',
      status:
        entry.status === 'pass' ||
        entry.status === 'warn' ||
        entry.status === 'fail' ||
        entry.status === 'missing'
          ? entry.status
          : 'missing',
      summary: typeof entry.summary === 'string' ? entry.summary : undefined,
      blockers: Array.isArray(entry.blockers)
        ? entry.blockers.filter((blocker): blocker is string => typeof blocker === 'string')
        : undefined,
    }));
}

type StudioRepairPersistedState = {
  handoffs?: Record<string, StudioBlockerHandoffView>;
  plans?: Record<string, DoctorRemediationPlanView>;
  progress?: Record<string, SidebarStudioActionProgressView>;
  timeline?: Record<string, SidebarStudioActionProgressView[]>;
  verifyFailures?: Record<string, StudioVerifyFailureView>;
  returnStates?: Record<string, SidebarStudioReturnState>;
  rollbackCommands?: Record<string, string>;
  patchReviews?: Record<string, StudioPatchReviewState>;
  repairHolds?: Record<string, string>;
};

type SecondarySidebarPersistedState = {
  workspaiStudioRepair?: StudioRepairPersistedState;
  workspaiAssistantMode?: AssistantMode;
  workspaiAssistantModels?: Partial<Record<AssistantMode, string | null>>;
};

function loadStudioRepairPersistedState(): StudioRepairPersistedState {
  const state = vscode.getState() as SecondarySidebarPersistedState | undefined;
  return state?.workspaiStudioRepair ?? {};
}

function loadAssistantMode(): AssistantMode {
  const mode = (vscode.getState() as SecondarySidebarPersistedState | undefined)
    ?.workspaiAssistantMode;
  return mode === 'ask' || mode === 'plan' || mode === 'goal' ? mode : 'agent';
}

function loadAssistantModels(): Partial<Record<AssistantMode, string | null>> {
  return (
    (vscode.getState() as SecondarySidebarPersistedState | undefined)?.workspaiAssistantModels ?? {}
  );
}

function persistStudioRepairState(state: StudioRepairPersistedState): void {
  const current = (vscode.getState() ?? {}) as SecondarySidebarPersistedState;
  vscode.setState({
    ...current,
    workspaiStudioRepair: state,
  });
}

/**
 * React secondary-sidebar. Creation remains a dedicated lifecycle while Ask,
 * Agent, Plan, and Goal share one Assistant surface and composer-level mode selector.
 * Legacy Advisor/Studio session stores remain intact for lossless migration.
 */
export function SecondarySidebar() {
  const persistedStudioRepairState = useMemo(() => loadStudioRepairPersistedState(), []);
  const assistantModelsRef =
    useRef<Partial<Record<AssistantMode, string | null>>>(loadAssistantModels());
  const [activeTab, setActiveTab] = useState<SidebarTab>('create');
  const [scope, setScope] = useState<SidebarScope>({});
  const [models, setModels] = useState<SidebarModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    assistantModelsRef.current[loadAssistantMode()] ?? null
  );

  const [createBusy, setCreateBusy] = useState(false);
  const [activeCreateOperationId, setActiveCreateOperationId] = useState<string | null>(null);
  const [createDrawerFocus, setCreateDrawerFocus] = useState<{
    drawer: CreateDrawerId;
    key: number;
  } | null>(null);

  const create = useCreateSessions();
  const createMessages = create.activeSession?.messages ?? [];
  const impact = useChatSessions('workspaiImpact', 'impact');
  const studio = useChatSessions('workspaiStudio', 'studio');
  const [studioMode, setStudioMode] = useState<StudioMode>(() =>
    loadAssistantMode() === 'plan' ? 'prepare' : 'investigate'
  );
  const [assistantMode, setAssistantMode] = useState<AssistantMode>(loadAssistantMode);
  const [impactPrefill, setImpactPrefill] = useState('');
  const [studioPrefill, setStudioPrefill] = useState('');
  const [impactPrefillKey, setImpactPrefillKey] = useState(0);
  const [studioPrefillKey, setStudioPrefillKey] = useState(0);
  const [blockerHandoff, setBlockerHandoff] = useState<StudioBlockerHandoffView | null>(null);
  const [studioAutoFixBusy, setStudioAutoFixBusy] = useState(false);
  const [studioFixApplied, setStudioFixApplied] = useState(false);
  const [studioPatchReview, setStudioPatchReview] = useState<StudioPatchReviewState | null>(null);
  const [studioPatchApplyBusy, setStudioPatchApplyBusy] = useState(false);
  const [studioRollbackCommand, setStudioRollbackCommand] = useState<string | null>(null);
  const [studioAuditState, setStudioAuditState] = useState<SidebarStudioAuditState | null>(null);
  const [studioVerifyFailure, setStudioVerifyFailure] = useState<StudioVerifyFailureView | null>(
    null
  );
  const [studioRemediationPlan, setStudioRemediationPlan] =
    useState<DoctorRemediationPlanView | null>(null);
  const [studioIncidentHandoffs, setStudioIncidentHandoffs] = useState<
    Record<string, StudioBlockerHandoffView>
  >(persistedStudioRepairState.handoffs ?? {});
  const [studioIncidentPlans, setStudioIncidentPlans] = useState<
    Record<string, DoctorRemediationPlanView>
  >(persistedStudioRepairState.plans ?? {});
  const [studioIncidentProgress, setStudioIncidentProgress] = useState<
    Record<string, SidebarStudioActionProgressView>
  >(persistedStudioRepairState.progress ?? {});
  const [studioIncidentTimeline, setStudioIncidentTimeline] = useState<
    Record<string, SidebarStudioActionProgressView[]>
  >(persistedStudioRepairState.timeline ?? {});
  const [studioIncidentVerifyFailures, setStudioIncidentVerifyFailures] = useState<
    Record<string, StudioVerifyFailureView>
  >(persistedStudioRepairState.verifyFailures ?? {});
  const [studioIncidentReturnStates, setStudioIncidentReturnStates] = useState<
    Record<string, SidebarStudioReturnState>
  >(persistedStudioRepairState.returnStates ?? {});
  const [studioIncidentRollbackCommands, setStudioIncidentRollbackCommands] = useState<
    Record<string, string>
  >(persistedStudioRepairState.rollbackCommands ?? {});
  const [studioIncidentPatchReviews, setStudioIncidentPatchReviews] = useState<
    Record<string, StudioPatchReviewState>
  >(persistedStudioRepairState.patchReviews ?? {});
  const [studioIncidentRepairHolds, setStudioIncidentRepairHolds] = useState<
    Record<string, string>
  >(persistedStudioRepairState.repairHolds ?? {});
  const [studioReturnState, setStudioReturnState] = useState<SidebarStudioReturnState | null>(null);
  const [studioActionProgress, setStudioActionProgress] =
    useState<SidebarStudioActionProgressView | null>(null);
  const [studioSessionProgress, setStudioSessionProgress] = useState<
    Record<string, SidebarStudioActionProgressView>
  >({});
  const [studioSessionTimeline, setStudioSessionTimeline] = useState<
    Record<string, SidebarStudioActionProgressView[]>
  >({});
  const [advisorActionFailure, setAdvisorActionFailure] = useState<{
    title: string;
    summary: string;
    nextAction?: string;
  } | null>(null);
  const [surfaceActionFailure, setSurfaceActionFailure] = useState<{
    title: string;
    summary: string;
  } | null>(null);

  useEffect(() => {
    persistStudioRepairState({
      handoffs: studioIncidentHandoffs,
      plans: studioIncidentPlans,
      progress: studioIncidentProgress,
      timeline: studioIncidentTimeline,
      verifyFailures: studioIncidentVerifyFailures,
      returnStates: studioIncidentReturnStates,
      rollbackCommands: studioIncidentRollbackCommands,
      patchReviews: studioIncidentPatchReviews,
      repairHolds: studioIncidentRepairHolds,
    });
  }, [
    studioIncidentHandoffs,
    studioIncidentPatchReviews,
    studioIncidentPlans,
    studioIncidentProgress,
    studioIncidentTimeline,
    studioIncidentReturnStates,
    studioIncidentRollbackCommands,
    studioIncidentRepairHolds,
    studioIncidentVerifyFailures,
  ]);
  useEffect(() => {
    const current = (vscode.getState() ?? {}) as SecondarySidebarPersistedState;
    vscode.setState({
      ...current,
      workspaiAssistantMode: assistantMode,
      workspaiAssistantModels: assistantModelsRef.current,
    });
  }, [assistantMode]);
  const [shipLoopCards, setShipLoopCards] = useState<
    Array<{
      id: 'analyze' | 'verify-gates' | 'readiness' | 'archive' | 'autopilot';
      status: 'pass' | 'warn' | 'fail' | 'missing';
      summary?: string;
      blockers?: string[];
    }>
  >([]);
  const [shipLoopContext, setShipLoopContext] = useState<{
    workspacePath: string;
    projectPath?: string;
    projectName?: string;
  } | null>(null);
  const [shipLoopBusy, setShipLoopBusy] = useState(false);
  const handleSubmitImpactRef = useRef<
    (question: string, options?: { forceNew?: boolean }) => void
  >(() => undefined);
  const handleSubmitStudioRef = useRef<(task: string, options?: { forceNew?: boolean }) => void>(
    () => undefined
  );
  const studioAttemptedRemediationStepsRef = useRef<Map<string, Set<string>>>(new Map());
  const studioMirroredHandoffKeysRef = useRef<Set<string>>(new Set());
  const pendingStudioIncidentSessionRef = useRef<string | null>(null);

  const openStudioIncidentSession = (
    handoff: StudioBlockerHandoffView,
    incidentScope: SidebarScope = scope
  ): string => {
    const workspacePath = incidentScope.workspacePath || 'workspace';
    const projectPath = incidentScope.projectPath || 'workspace';
    const key = [
      'studio-incident',
      workspacePath,
      handoff.scope,
      handoff.scope === 'project' ? projectPath : 'workspace',
      handoff.cardId,
    ].join('|');
    const sessionId = studio.openIncidentSession({
      title: `Fix ${handoff.cardLabel ?? handoff.cardId}`,
      mode: handoff.studioMode === 'VERIFY_ONLY' ? 'verify' : 'investigate',
      incident: {
        key,
        workspaceName: incidentScope.workspaceName,
        workspacePath: incidentScope.workspacePath,
        projectName: handoff.scope === 'project' ? incidentScope.projectName : undefined,
        projectPath: handoff.scope === 'project' ? incidentScope.projectPath : undefined,
        cardId: handoff.cardId,
        cardLabel: handoff.cardLabel,
        cardStatus: handoff.cardStatus,
        scope: handoff.scope,
        blockers: handoff.blockers,
        affectedProjectNames: handoff.affectedProjectNames,
        doctorFindings: handoff.doctorFindings,
        blockerSignature: handoff.blockerSignature,
        commandRunCount: handoff.commandRunCount,
        resolutionClass: handoff.resolutionClass,
        resolutionHints: handoff.resolutionHints,
        studioMode: handoff.studioMode,
        sourceCommand: handoff.sourceCommand,
        artifactPath: handoff.artifactPath,
        verifyCommand: handoff.verifyCommand,
        verifyArtifact: handoff.verifyArtifact,
        incidentSummary: handoff.incidentSummary,
        repairStatus: handoff.cardStatus === 'pass' ? 'done' : 'ready',
      },
    });
    pendingStudioIncidentSessionRef.current = sessionId;
    setStudioIncidentHandoffs((prev) => ({ ...prev, [key]: handoff }));
    return key;
  };

  const resolveStudioIncidentKeyForSession = (sessionId: unknown): string | undefined => {
    const id =
      typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : studio.activeId;
    const sessionKey = studio.sessions.find((session) => session.sessionId === id)?.incident?.key;
    if (sessionKey) {
      return sessionKey;
    }
    const pendingId = pendingStudioIncidentSessionRef.current;
    if (pendingId) {
      return studio.sessions.find((session) => session.sessionId === pendingId)?.incident?.key;
    }
    return undefined;
  };

  const resolveStudioIncidentKeyForCard = (cardId: unknown): string | undefined => {
    const normalizedCardId =
      typeof cardId === 'string' && cardId.trim().length > 0 ? cardId.trim() : '';
    if (!normalizedCardId) {
      return undefined;
    }
    const sessionKey = studio.sessions.find(
      (session) => session.incident?.cardId === normalizedCardId
    )?.incident?.key;
    if (sessionKey) {
      return sessionKey;
    }
    return Object.entries(studioIncidentHandoffs).find(
      ([, handoff]) => handoff.cardId === normalizedCardId
    )?.[0];
  };

  const resolveStudioIncidentKeyForEvent = (data: {
    cardId?: unknown;
    sessionId?: unknown;
  }): string | undefined => {
    return (
      resolveStudioIncidentKeyForSession(data.sessionId) ??
      resolveStudioIncidentKeyForCard(data.cardId)
    );
  };

  const restoreStudioHandoffFromSession = (
    session = studio.sessions.find((entry) => entry.sessionId === studio.activeId) ?? null
  ): StudioBlockerHandoffView | null => {
    const incident = session?.incident;
    if (!incident) {
      return null;
    }
    return {
      schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
      cardId: incident.cardId,
      cardLabel: incident.cardLabel,
      cardStatus: incident.cardStatus ?? 'fail',
      blockers: incident.blockers ?? [],
      affectedProjectNames: incident.affectedProjectNames,
      doctorFindings: incident.doctorFindings,
      artifactPath: incident.artifactPath ?? '',
      sourceCommand: incident.sourceCommand ?? '',
      scope: incident.scope ?? 'workspace',
      blockerSignature: incident.blockerSignature ?? incident.key,
      commandRunCount: incident.commandRunCount,
      resolutionClass: incident.resolutionClass,
      resolutionHints: incident.resolutionHints,
      studioMode:
        incident.studioMode === 'FIX' ||
        incident.studioMode === 'RUN_ONCE' ||
        incident.studioMode === 'VERIFY_ONLY' ||
        incident.studioMode === 'EXPLAIN'
          ? incident.studioMode
          : undefined,
      verifyCommand: incident.verifyCommand,
      verifyArtifact: incident.verifyArtifact,
      handoffSource: 'session-history',
      incidentSummary: incident.incidentSummary,
      workspacePath: incident.workspacePath,
      projectPath: incident.projectPath,
    };
  };

  const updateStudioIncidentRepairState = (
    incidentKey: string | undefined,
    patch: Parameters<typeof studio.updateIncidentByKey>[1]
  ) => {
    if (!incidentKey) {
      return;
    }
    studio.updateIncidentByKey(incidentKey, patch);
  };

  const createSessionIdForEvent = (data: Record<string, unknown>): string => {
    const correlated = typeof data.sessionId === 'string' ? data.sessionId.trim() : '';
    return correlated || create.activeId || '';
  };
  const appendCreate = (message: CreateMessage, sessionId = create.activeId || '') => {
    create.appendMessage(sessionId, message);
  };
  const dropThinking = (sessionId = create.activeId || '') => {
    create.replaceMessages(sessionId, (messages) =>
      messages.filter((message) => message.kind !== 'thinking')
    );
  };

  useSidebarMessages(({ command, data }) => {
    switch (command) {
      case 'sidebarActivateTab': {
        const tab = data.tab === 'impact' || data.tab === 'studio' ? data.tab : 'create';
        setActiveTab(tab === 'impact' ? 'studio' : (tab as SidebarTab));
        if (tab === 'impact') {
          setAssistantMode('ask');
        } else if (tab === 'studio') {
          setAssistantMode(data.studioMode === 'prepare' ? 'plan' : 'agent');
        }
        const nextScope = data.workspace || data.project ? resolveScopeFromPayload(data) : scope;
        if (data.workspace || data.project) {
          setScope(nextScope);
        } else {
          vscode.postMessage('sidebarRefreshScope', {}, META);
        }
        const initialQuestion =
          typeof data.initialQuestion === 'string' ? data.initialQuestion.trim() : '';
        const initialTask = typeof data.initialTask === 'string' ? data.initialTask.trim() : '';
        const composerHandoff = data.composerHandoff === 'submit' ? 'submit' : 'prefill';
        const activatedHandoff = parseStudioBlockerHandoffView(data.blockerHandoff);
        const editorIssue = parseEditorIssueSessionInput(data.editorIssue, {
          source: typeof data.source === 'string' ? data.source : undefined,
          trigger: typeof data.trigger === 'string' ? data.trigger : undefined,
        });
        if (
          data.studioMode === 'verify' ||
          data.studioMode === 'prepare' ||
          data.studioMode === 'investigate'
        ) {
          setStudioMode(data.studioMode);
        }
        if (tab === 'studio' && data.shipLoopIntent !== 'release') {
          setShipLoopCards([]);
          setShipLoopContext(null);
          setShipLoopBusy(false);
        }
        if (initialQuestion) {
          if (editorIssue) {
            impact.openEditorSession({
              title: editorIssueSessionTitle('Explain', editorIssue),
              editorIssue,
            });
          }
          if (composerHandoff === 'submit') {
            handleSubmitImpactRef.current(initialQuestion, { forceNew: !editorIssue });
          } else {
            if (!editorIssue) {
              impact.newSession();
            }
            setImpactPrefill(initialQuestion);
            setImpactPrefillKey((key) => key + 1);
          }
        }
        if (initialTask) {
          if (editorIssue) {
            studio.openEditorSession({
              title: editorIssueSessionTitle('Fix', editorIssue),
              mode:
                data.studioMode === 'verify' || data.studioMode === 'prepare'
                  ? data.studioMode
                  : 'investigate',
              editorIssue,
            });
          }
          if (composerHandoff === 'submit') {
            handleSubmitStudioRef.current(initialTask, { forceNew: !editorIssue });
          } else if (activatedHandoff) {
            setStudioPrefill('');
            setStudioPrefillKey((key) => key + 1);
          } else {
            if (!editorIssue) {
              studio.newSession();
            }
            setStudioPrefill(initialTask);
            setStudioPrefillKey((key) => key + 1);
          }
        }
        if (activatedHandoff) {
          const incidentScope = scopeFromHandoff(activatedHandoff, nextScope);
          setScope(incidentScope);
          openStudioIncidentSession(activatedHandoff, incidentScope);
          const activatedSessionId = pendingStudioIncidentSessionRef.current;
          studioMirroredHandoffKeysRef.current.add(
            `${activatedHandoff.cardId}:${activatedHandoff.blockerSignature}`
          );
          setBlockerHandoff(activatedHandoff);
          setStudioFixApplied(false);
          setStudioAutoFixBusy(false);
          if (activatedSessionId) {
            vscode.postMessage(
              'sidebarStudioAction',
              {
                action: 'agent-status',
                sessionId: activatedSessionId,
                blockerHandoff: activatedHandoff,
              },
              META
            );
          }
        }
        if (data.createMode === 'project') {
          setCreateDrawerFocus({ drawer: 'project', key: Date.now() });
        } else if (data.createMode === 'workspace') {
          setCreateDrawerFocus({ drawer: 'add', key: Date.now() });
        }
        break;
      }
      case 'sidebarAiScope':
      case 'sidebarScope':
        setScope(resolveScopeFromPayload(data));
        break;
      case 'sidebarAiModelsList':
        setModels(normalizeModels(data.models));
        if (Object.prototype.hasOwnProperty.call(assistantModelsRef.current, assistantMode)) {
          setSelectedModelId(assistantModelsRef.current[assistantMode] ?? null);
        } else {
          const preferred = resolveSelectedModelId(data.preferredModel);
          assistantModelsRef.current = {
            ...assistantModelsRef.current,
            [assistantMode]: preferred,
          };
          setSelectedModelId(preferred);
        }
        break;
      case 'sidebarStudioAgentEvent': {
        const event =
          data.event && typeof data.event === 'object' && !Array.isArray(data.event)
            ? (data.event as Record<string, unknown>)
            : null;
        const eventData =
          event?.data && typeof event.data === 'object' && !Array.isArray(event.data)
            ? (event.data as Record<string, unknown>)
            : {};
        const eventType = typeof event?.type === 'string' ? event.type : '';
        const eventSessionId = typeof event?.sessionId === 'string' ? event.sessionId : undefined;
        const invocationId = typeof event?.toolCallId === 'string' ? event.toolCallId : undefined;
        const eventMeta = {
          ...(eventSessionId ? { sessionId: eventSessionId } : {}),
          eventType,
          ...(typeof event?.sequence === 'number' ? { eventSequence: event.sequence } : {}),
          ...(typeof event?.requestId === 'string' ? { requestId: event.requestId } : {}),
          ...(invocationId ? { invocationId } : {}),
        };
        const replay = data.replay === true;
        if (
          eventType === 'request.started' &&
          eventData.goal &&
          typeof eventData.goal === 'object' &&
          !Array.isArray(eventData.goal)
        ) {
          const goal = eventData.goal as Record<string, unknown>;
          startStudioActionProgress({
            action: 'verified-goal',
            status: 'running',
            phase: 'goal-baseline',
            title:
              goal.kind === 'test-coverage'
                ? 'Raising verified coverage'
                : goal.kind === 'dependency-security'
                  ? 'Securing dependencies'
                  : 'Preparing release',
            summary:
              typeof goal.summary === 'string'
                ? goal.summary
                : 'Studio is executing a durable engineering goal.',
            ...eventMeta,
          });
        } else if (eventType === 'model.message') {
          const text = typeof eventData.text === 'string' ? eventData.text.trim() : '';
          if (text && eventSessionId) {
            studio.setActivity(eventSessionId, text);
          }
        } else if (eventType === 'model.checkpoint') {
          const summary =
            typeof eventData.summary === 'string'
              ? eventData.summary
              : typeof eventData.reason === 'string'
                ? eventData.reason
                : typeof eventData.message === 'string'
                  ? eventData.message
                  : 'Choosing the next verified action...';
          if (eventSessionId) {
            studio.setActivity(eventSessionId, summary);
          }
        } else if (eventType === 'request.steered') {
          startStudioActionProgress({
            action: 'agent-steering',
            status: 'done',
            phase: 'request-steered',
            title: 'Repair instructions updated',
            summary:
              typeof eventData.message === 'string'
                ? eventData.message
                : 'Studio merged the latest user direction into this session.',
            ...eventMeta,
          });
        } else if (eventType === 'tool.requested') {
          const toolName = String(eventData.toolName ?? 'studio-agent');
          const copy = studioAgentToolProgressCopy(toolName, 'running');
          if (eventSessionId) {
            studio.setActivity(eventSessionId, copy.title);
          }
        } else if (eventType === 'tool.permission' && eventData.allowed !== true) {
          startStudioActionProgress({
            action: String(eventData.toolName ?? 'studio-agent'),
            status: eventData.requiresUserConfirmation === true ? 'review' : 'failed',
            phase: 'tool-permission',
            title:
              eventData.requiresUserConfirmation === true
                ? 'Approval required'
                : 'Action blocked by policy',
            summary:
              typeof eventData.reason === 'string'
                ? eventData.reason
                : 'Workspace policy did not authorize this action.',
            requiresApproval: eventData.requiresUserConfirmation === true,
            ...eventMeta,
          });
        } else if (eventType === 'tool.started') {
          const toolName = String(eventData.toolName ?? 'studio-agent');
          const copy = studioAgentToolProgressCopy(toolName, 'running');
          const intelligencePhase = resolveStudioIntelligencePhaseFromToolEvent({
            toolName,
            toolInput: eventData.input,
            reportedPhase: eventData.intelligencePhase,
          });
          startStudioActionProgress({
            action: toolName,
            status: 'running',
            phase: copy.phase,
            title: copy.title,
            summary:
              typeof eventData.reason === 'string' && eventData.reason.trim()
                ? eventData.reason
                : 'Continuing the evidence-backed repair.',
            intelligencePhase,
            ...eventMeta,
          });
        } else if (
          eventType === 'tool.progress' &&
          eventData.repair &&
          typeof eventData.repair === 'object' &&
          !Array.isArray(eventData.repair)
        ) {
          const repair = eventData.repair as Record<string, unknown>;
          const phase = typeof repair.phase === 'string' ? repair.phase : 'execute';
          const state = typeof repair.state === 'string' ? repair.state : undefined;
          const decisionRequired = state === 'decision-required' || state === 'rollback-required';
          const failed = state === 'failed' || state === 'cancelled';
          const closed = state === 'closed';
          const rolledBack = state === 'rolled-back';
          const status = decisionRequired
            ? 'review'
            : failed || rolledBack
              ? 'failed'
              : phase === 'complete' && closed
                ? 'done'
                : 'running';
          const phaseTitle =
            phase === 'plan'
              ? 'Planning the repair transaction'
              : phase === 'approval'
                ? 'Binding approval to the repair plan'
                : phase === 'execute'
                  ? 'Executing the CLI repair transaction'
                  : decisionRequired
                    ? 'Repair decision required'
                    : rolledBack
                      ? 'Repair changes rolled back'
                      : closed
                        ? 'Repair transaction verified'
                        : 'Repair transaction stopped';
          startStudioActionProgress({
            action: 'cli-repair-engine',
            status,
            phase: `cli-repair-${phase}`,
            title: phaseTitle,
            summary:
              typeof repair.message === 'string'
                ? humanizeStudioError(repair.message)
                : 'The Workspai CLI is advancing the durable repair transaction.',
            transactionId:
              typeof repair.transactionId === 'string' ? repair.transactionId : undefined,
            requiresApproval: decisionRequired,
            ...eventMeta,
          });
        } else if (
          eventType === 'tool.progress' &&
          eventData.intelligenceMilestoneStatus === 'started'
        ) {
          const toolName = String(eventData.toolName ?? 'run-governed-command');
          const intelligencePhase = resolveStudioIntelligencePhaseFromToolEvent({
            reportedPhase: eventData.intelligencePhase,
          });
          if (!intelligencePhase) {
            break;
          }
          const label = studioIntelligencePhaseLabel(intelligencePhase) ?? 'Intelligence stage';
          startStudioActionProgress({
            action: toolName,
            status: 'running',
            phase: `intelligence-${intelligencePhase}`,
            title: `Running ${label}`,
            summary:
              typeof eventData.message === 'string' && eventData.message.trim()
                ? eventData.message
                : `Workspai is executing the ${label} stage from the canonical CLI contract.`,
            intelligencePhase,
            ...eventMeta,
          });
        } else if (eventType === 'tool.completed' || eventType === 'tool.failed') {
          const toolName = String(eventData.toolName ?? 'studio-agent');
          if (eventData.duplicate === true || toolName === 'verify-blocker') {
            break;
          }
          const copy = studioAgentToolProgressCopy(
            toolName,
            eventType === 'tool.completed' ? 'completed' : 'failed'
          );
          const intelligencePhase = resolveStudioIntelligencePhaseFromToolEvent({
            toolName,
            toolInput: eventData.input,
            reportedPhase: eventData.intelligencePhase,
          });
          const toolOutput =
            eventData.output &&
            typeof eventData.output === 'object' &&
            !Array.isArray(eventData.output)
              ? (eventData.output as Record<string, unknown>)
              : null;
          const appliedFixes = Array.isArray(toolOutput?.appliedFixes)
            ? toolOutput.appliedFixes
                .filter(
                  (entry): entry is Record<string, unknown> =>
                    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
                )
                .map((entry) => entry.path)
                .filter((entry): entry is string => typeof entry === 'string')
            : [];
          const directPatches = Array.isArray(toolOutput?.patches)
            ? toolOutput.patches
            : toolOutput?.patchResult &&
                typeof toolOutput.patchResult === 'object' &&
                !Array.isArray(toolOutput.patchResult) &&
                Array.isArray((toolOutput.patchResult as Record<string, unknown>).patches)
              ? ((toolOutput.patchResult as Record<string, unknown>).patches as unknown[])
              : [];
          const patchedPaths = directPatches
            .filter(
              (entry): entry is Record<string, unknown> =>
                Boolean(entry) &&
                typeof entry === 'object' &&
                !Array.isArray(entry) &&
                entry.status === 'applied'
            )
            .map((entry) => entry.relativePath)
            .filter((entry): entry is string => typeof entry === 'string');
          const reportedChangedPaths = Array.isArray(toolOutput?.changedPaths)
            ? toolOutput.changedPaths.filter(
                (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
              )
            : [];
          const changedPaths = [
            ...new Set([...appliedFixes, ...patchedPaths, ...reportedChangedPaths]),
          ];
          const fileChanges = parseSidebarPatchReviewItems(toolOutput?.fileChanges);
          const transaction =
            toolOutput?.transaction &&
            typeof toolOutput.transaction === 'object' &&
            !Array.isArray(toolOutput.transaction)
              ? (toolOutput.transaction as Record<string, unknown>)
              : undefined;
          const transactionId =
            typeof toolOutput?.transactionId === 'string'
              ? toolOutput.transactionId
              : typeof transaction?.transactionId === 'string'
                ? transaction.transactionId
                : undefined;
          const transactionState =
            typeof transaction?.state === 'string' ? transaction.state : undefined;
          const transactionRestored = transactionState === 'rolled-back';
          const validationStages = Array.isArray(transaction?.stages)
            ? transaction.stages
            : undefined;
          const toolInput =
            eventData.input &&
            typeof eventData.input === 'object' &&
            !Array.isArray(eventData.input)
              ? (eventData.input as Record<string, unknown>)
              : null;
          const commandText =
            typeof toolOutput?.displayCommand === 'string'
              ? toolOutput.displayCommand
              : typeof toolOutput?.command === 'string'
                ? toolOutput.command
                : typeof toolInput?.executable === 'string'
                  ? [
                      toolInput.executable,
                      ...(Array.isArray(toolInput.args)
                        ? toolInput.args.filter(
                            (entry): entry is string => typeof entry === 'string'
                          )
                        : []),
                    ].join(' ')
                  : undefined;
          const activityPaths = Array.isArray(toolOutput?.files)
            ? toolOutput.files
                .map((entry) =>
                  entry && typeof entry === 'object' && !Array.isArray(entry)
                    ? (entry as Record<string, unknown>).path
                    : undefined
                )
                .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
                .slice(0, 12)
            : [];
          const outputText = [toolOutput?.stdout, toolOutput?.stderr]
            .filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
            )
            .join('\n')
            .slice(0, 4_000);
          const changedFiles =
            !transactionRestored &&
            eventType === 'tool.completed' &&
            changedPaths.length > 0 &&
            Boolean(transactionId);
          const transactionClosed = transaction?.state === 'closed';
          const policyRejected = eventData.policyRejected === true;
          startStudioActionProgress({
            action: toolName,
            status: policyRejected ? 'done' : eventType === 'tool.completed' ? 'done' : 'failed',
            phase: copy.phase,
            title: policyRejected
              ? 'Verification remains controller-owned'
              : transactionRestored
                ? 'Repair attempt restored'
                : changedFiles
                  ? `Changed ${changedPaths.length} file${changedPaths.length === 1 ? '' : 's'}`
                  : replay && eventType === 'tool.failed'
                    ? `Observed: ${copy.title}`
                    : copy.title,
            summary: policyRejected
              ? 'A duplicate evidence command was blocked. Studio returned the agent to the required causal source-repair path.'
              : transactionRestored
                ? 'The CLI could not clear the selected target and restored the source checkpoint. No attempted source edit remains applied.'
                : typeof eventData.error === 'string'
                  ? eventData.error
                  : changedFiles
                    ? transactionClosed
                      ? 'The CLI verified and closed this source transaction.'
                      : 'The edit transaction was applied with rollback metadata. Studio is verifying the result.'
                    : 'The result was returned to the model; Studio is choosing the next step.',
            changedPaths,
            fileChanges,
            activityPaths,
            commandText,
            ...(outputText ? { outputText } : {}),
            intelligencePhase,
            ...eventMeta,
            ...(transactionId ? { transactionId } : {}),
            ...(transactionState ? { transactionState } : {}),
            canUndo: changedFiles && Boolean(transactionId),
            validationStages,
            policyRejected,
            ...(policyRejected && typeof eventData.error === 'string'
              ? { technicalDetail: eventData.error }
              : {}),
          });
        } else if (eventType === 'verify.completed') {
          const resolved = eventData.ok === true && eventData.cardBlocking === false;
          const verifyOutput =
            eventData.output &&
            typeof eventData.output === 'object' &&
            !Array.isArray(eventData.output)
              ? (eventData.output as Record<string, unknown>)
              : null;
          const goalStatus =
            verifyOutput?.status &&
            typeof verifyOutput.status === 'object' &&
            !Array.isArray(verifyOutput.status)
              ? (verifyOutput.status as Record<string, unknown>)
              : null;
          if (goalStatus && typeof goalStatus.goalId === 'string') {
            const progress =
              goalStatus.progress &&
              typeof goalStatus.progress === 'object' &&
              !Array.isArray(goalStatus.progress)
                ? (goalStatus.progress as Record<string, unknown>)
                : null;
            const remaining = Array.isArray(goalStatus.blockingReasons)
              ? goalStatus.blockingReasons.filter(
                  (entry): entry is string => typeof entry === 'string'
                )
              : [];
            startStudioActionProgress({
              action: 'verify-goal',
              status: resolved ? 'done' : 'review',
              phase: resolved ? 'goal-verified' : 'goal-progress',
              title: resolved ? 'Engineering goal verified' : 'Goal still has work',
              summary: resolved
                ? String(
                    progress?.message ?? 'Every required goal criterion has fresh passing evidence.'
                  )
                : String(
                    remaining[0] ??
                      progress?.message ??
                      eventData.error ??
                      'The goal remains active. Studio is continuing from current evidence.'
                  ),
              ...eventMeta,
              intelligencePhase: 'verify',
            });
            break;
          }
          const cardVerification =
            verifyOutput?.cardVerification &&
            typeof verifyOutput.cardVerification === 'object' &&
            !Array.isArray(verifyOutput.cardVerification)
              ? (verifyOutput.cardVerification as Record<string, unknown>)
              : null;
          const workspaceVerification =
            verifyOutput?.workspaceVerification &&
            typeof verifyOutput.workspaceVerification === 'object' &&
            !Array.isArray(verifyOutput.workspaceVerification)
              ? (verifyOutput.workspaceVerification as Record<string, unknown>)
              : null;
          const localResolved = cardVerification?.resolved === true;
          const workspaceResolved = workspaceVerification?.resolved === true;
          const remainingCards = Array.isArray(workspaceVerification?.blockingCards)
            ? workspaceVerification.blockingCards.length
            : Array.isArray(workspaceVerification?.remainingActionIds)
              ? workspaceVerification.remainingActionIds.length
              : 0;
          const targetResolved = resolved || localResolved;
          const cliRepairVerified = verifyOutput?.closureAuthority === 'cli-repair-engine';
          startStudioActionProgress({
            action: 'verify-blocker',
            status: targetResolved ? 'done' : 'review',
            phase: targetResolved ? 'verified' : 'verify-observation',
            title: targetResolved
              ? cliRepairVerified
                ? workspaceResolved
                  ? 'Repair verified'
                  : 'Repair verified · other findings remain'
                : workspaceResolved
                  ? 'Finding verified'
                  : 'Finding verified · other findings remain'
              : 'Verify found remaining work',
            summary: targetResolved
              ? workspaceResolved
                ? cliRepairVerified
                  ? 'Fresh evidence confirms that the selected repair and workspace verification passed.'
                  : 'Fresh evidence confirms that the selected finding and workspace verification passed.'
                : `The selected ${cliRepairVerified ? 'repair' : 'finding'} passed. ${remainingCards || 'Other'} unrelated workspace finding${remainingCards === 1 ? '' : 's'} remain available as separate work.`
              : String(
                  eventData.error ??
                    'The blocker remains active. Studio Agent is continuing from this evidence.'
                ),
            ...eventMeta,
            intelligencePhase: 'verify',
          });
        } else if (eventType === 'session.completed') {
          setStudioAutoFixBusy(false);
          if (!activeBlockerHandoff) {
            startStudioActionProgress({
              action: 'assistant-session',
              status: 'done',
              phase: 'completed',
              title: 'Completed',
              summary: String(eventData.summary ?? 'Assistant completed this request.'),
              ...eventMeta,
            });
          }
        } else if (eventType === 'session.failed' || eventType === 'session.cancelled') {
          setStudioAutoFixBusy(false);
          setStudioPatchApplyBusy(false);
          const decisionTransactionId =
            typeof eventData.transactionId === 'string' && eventData.transactionId.trim()
              ? eventData.transactionId.trim()
              : undefined;
          const decisionOptions = Array.isArray(eventData.decisionOptions)
            ? eventData.decisionOptions.filter(
                (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
              )
            : [];
          const eventRequiresDecision = Boolean(
            eventType === 'session.failed' &&
            eventData.requiresUserDecision === true &&
            decisionTransactionId &&
            decisionOptions.length > 0
          );
          const rawFailureMessage = String(
            eventData.error ??
              eventData.reason ??
              (eventType === 'session.cancelled'
                ? 'Studio was stopped by the user.'
                : 'The durable repair ended with remaining work.')
          );
          const eventTerminalReason =
            typeof eventData.terminalReason === 'string'
              ? eventData.terminalReason
              : eventType === 'session.cancelled'
                ? 'cancelled'
                : undefined;
          const terminalPresentation = describeStudioTerminalFailure({
            error: humanizeStudioError(rawFailureMessage),
            terminalReason: eventTerminalReason,
            requiresUserDecision: eventRequiresDecision,
          });
          startStudioActionProgress({
            action: activeBlockerHandoff ? 'repair-session' : 'assistant-session',
            status: eventRequiresDecision ? 'review' : 'failed',
            phase:
              eventType === 'session.cancelled'
                ? 'cancelled'
                : eventRequiresDecision
                  ? 'decision-required'
                  : 'failed',
            title: terminalPresentation.title,
            summary: terminalPresentation.summary,
            terminalReason: terminalPresentation.terminalReason,
            technicalDetail: terminalPresentation.technicalDetail,
            requiresApproval: eventRequiresDecision,
            transactionId: decisionTransactionId,
            decisionOptions: decisionOptions.length > 0 ? decisionOptions : undefined,
            ...eventMeta,
          });
          if (eventSessionId) {
            const failedIncidentKey = resolveStudioIncidentKeyForSession(eventSessionId);
            const requiresUserDecision = eventRequiresDecision;
            const failureMessage = terminalPresentation.summary;
            studio.failSession(eventSessionId, failureMessage);
            if (failedIncidentKey) {
              const terminalTitle = terminalPresentation.title;
              setStudioIncidentProgress((previous) => {
                const terminal = terminalizeStudioProgress(previous[failedIncidentKey], {
                  title: terminalTitle,
                  summary: failureMessage,
                  reviewRequired: requiresUserDecision,
                  terminalReason: terminalPresentation.terminalReason,
                  technicalDetail: terminalPresentation.technicalDetail,
                });
                return terminal ? { ...previous, [failedIncidentKey]: terminal } : previous;
              });
              setStudioIncidentTimeline((previous) => ({
                ...previous,
                [failedIncidentKey]: terminalizeStudioTimeline(previous[failedIncidentKey] ?? [], {
                  title: terminalTitle,
                  summary: failureMessage,
                  reviewRequired: requiresUserDecision,
                  terminalReason: terminalPresentation.terminalReason,
                  technicalDetail: terminalPresentation.technicalDetail,
                }),
              }));
              setStudioActionProgress((current) =>
                terminalizeStudioProgress(current, {
                  title: terminalTitle,
                  summary: failureMessage,
                  reviewRequired: requiresUserDecision,
                  terminalReason: terminalPresentation.terminalReason,
                  technicalDetail: terminalPresentation.technicalDetail,
                })
              );
              if (requiresUserDecision) {
                setStudioIncidentRepairHolds((previous) => ({
                  ...previous,
                  [failedIncidentKey]: failureMessage,
                }));
              }
              updateStudioIncidentRepairState(failedIncidentKey, {
                repairStatus: requiresUserDecision ? 'review' : 'blocked',
                lastActionTitle: terminalTitle,
                lastActionSummary: failureMessage,
                lastActionAt: new Date().toISOString(),
                terminalReason: terminalPresentation.terminalReason,
              });
            }
          }
        }
        break;
      }
      case 'sidebarStudioSessionState': {
        const statusSessionId = typeof data.sessionId === 'string' ? data.sessionId.trim() : '';
        if (!statusSessionId) {
          break;
        }
        if (data.active === true) {
          setStudioAutoFixBusy(true);
          studio.setActivity(statusSessionId, 'Continuing the active repair...');
          break;
        }
        setStudioAutoFixBusy(false);
        setStudioPatchApplyBusy(false);
        const hydratedDecisionTransactionId =
          typeof data.transactionId === 'string' && data.transactionId.trim()
            ? data.transactionId.trim()
            : undefined;
        const hydratedDecisionOptions = Array.isArray(data.decisionOptions)
          ? data.decisionOptions.filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
            )
          : [];
        if (
          data.requiresUserDecision === true &&
          hydratedDecisionTransactionId &&
          hydratedDecisionOptions.length > 0
        ) {
          const reviewIncidentKey = resolveStudioIncidentKeyForSession(statusSessionId);
          const reviewMessage = humanizeStudioError(
            typeof data.error === 'string'
              ? data.error
              : 'Studio requires an engineering decision to continue.'
          );
          if (reviewIncidentKey) {
            setStudioIncidentRepairHolds((previous) => ({
              ...previous,
              [reviewIncidentKey]: reviewMessage,
            }));
            updateStudioIncidentRepairState(reviewIncidentKey, {
              repairStatus: 'review',
              lastActionTitle: 'Decision required',
              lastActionSummary: reviewMessage,
              lastActionAt: new Date().toISOString(),
            });
          }
          startStudioActionProgress({
            action: 'repair-decision',
            status: 'review',
            phase: 'decision-required',
            title: 'Decision required',
            summary: reviewMessage,
            transactionId: hydratedDecisionTransactionId,
            decisionOptions: hydratedDecisionOptions,
          });
          break;
        }
        const hydratedSession = studio.sessions.find(
          (session) => session.sessionId === statusSessionId
        );
        const hydratedIncidentKey = hydratedSession?.incident?.key;
        if (hydratedIncidentKey) {
          setStudioIncidentRepairHolds((previous) => {
            const next = { ...previous };
            delete next[hydratedIncidentKey];
            return next;
          });
          const persistedTerminalReason =
            typeof data.terminalReason === 'string' ? data.terminalReason : undefined;
          const terminalPresentation = describeStudioTerminalFailure({
            error:
              typeof data.error === 'string' && data.error.trim()
                ? humanizeStudioError(data.error)
                : 'No live Studio process owns this persisted repair. Resume only when you choose to continue.',
            terminalReason: persistedTerminalReason,
          });
          const inactiveMessage = terminalPresentation.summary;
          setStudioIncidentProgress((previous) => {
            const terminal = terminalizeStudioProgress(previous[hydratedIncidentKey], {
              title: terminalPresentation.title,
              summary: inactiveMessage,
              terminalReason: terminalPresentation.terminalReason,
              technicalDetail: terminalPresentation.technicalDetail,
            });
            return terminal ? { ...previous, [hydratedIncidentKey]: terminal } : previous;
          });
          setStudioIncidentTimeline((previous) => ({
            ...previous,
            [hydratedIncidentKey]: terminalizeStudioTimeline(previous[hydratedIncidentKey] ?? [], {
              title: terminalPresentation.title,
              summary: inactiveMessage,
              terminalReason: terminalPresentation.terminalReason,
              technicalDetail: terminalPresentation.technicalDetail,
            }),
          }));
          setStudioActionProgress((current) =>
            terminalizeStudioProgress(current, {
              title: terminalPresentation.title,
              summary: inactiveMessage,
              terminalReason: terminalPresentation.terminalReason,
              technicalDetail: terminalPresentation.technicalDetail,
            })
          );
          updateStudioIncidentRepairState(hydratedIncidentKey, {
            repairStatus: 'blocked',
            lastActionTitle: terminalPresentation.title,
            lastActionSummary: inactiveMessage,
            lastActionAt: new Date().toISOString(),
            terminalReason: terminalPresentation.terminalReason,
          });
        }
        if (hydratedSession?.status === 'streaming') {
          studio.failSession(
            statusSessionId,
            'This repair is paused. Review the latest evidence, then press Resume repair when you are ready.'
          );
          if (hydratedIncidentKey) {
            updateStudioIncidentRepairState(hydratedIncidentKey, {
              repairStatus: 'blocked',
              lastActionTitle: 'Repair stopped',
              lastActionSummary: 'No live Studio process owns this persisted session.',
              lastActionAt: new Date().toISOString(),
            });
          }
        }
        break;
      }
      case 'sidebarStudioAgentPatchRollback': {
        const transactionId =
          typeof data.transactionId === 'string' ? data.transactionId.trim() : '';
        const disableUndo = (progress: SidebarStudioActionProgressView) =>
          progress.transactionId === transactionId ? { ...progress, canUndo: false } : progress;
        setStudioActionProgress((current) => (current ? disableUndo(current) : current));
        setStudioIncidentProgress((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, progress]) => [key, disableUndo(progress)])
          )
        );
        setStudioIncidentTimeline((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, timeline]) => [key, timeline.map(disableUndo)])
          )
        );
        const restoredPaths = Array.isArray(data.restoredPaths)
          ? data.restoredPaths.filter((entry): entry is string => typeof entry === 'string')
          : [];
        startStudioActionProgress({
          action: 'agent-patch-rollback',
          status: data.ok === true ? 'done' : 'review',
          phase: data.ok === true ? 'rollback-completed' : 'rollback-refused',
          title: data.ok === true ? 'Changes undone' : 'Undo requires review',
          summary: String(
            data.summary ??
              data.error ??
              'Undo was refused because one or more files changed after the Agent edit.'
          ),
          changedPaths: restoredPaths,
        });
        break;
      }

      // ---- Create ----
      case 'sidebarAiCreateThinking': {
        const sessionId = createSessionIdForEvent(data);
        dropThinking(sessionId);
        appendCreate(
          {
            id: nextId(),
            role: 'ai',
            kind: 'thinking',
            label: (data.label as string) || 'Thinking...',
          },
          sessionId
        );
        break;
      }
      case 'sidebarAiCreatePlan': {
        const sessionId = createSessionIdForEvent(data);
        dropThinking(sessionId);
        setCreateBusy(false);
        setActiveCreateOperationId((current) => (current === sessionId ? null : current));
        create.setStatus(sessionId, 'ready');
        const plan = (data.plan as CreationPlan) || null;
        if (plan) {
          appendCreate(
            {
              id: nextId(),
              role: 'ai',
              kind: 'plan',
              plan,
              planSource:
                data.planSource === 'llm' || data.planSource === 'heuristic'
                  ? data.planSource
                  : undefined,
            },
            sessionId
          );
        }
        break;
      }
      case 'sidebarAiCreateProgress': {
        const sessionId = createSessionIdForEvent(data);
        dropThinking(sessionId);
        create.setStatus(sessionId, 'running');
        appendCreate(
          {
            id: nextId(),
            role: 'ai',
            kind: 'progress',
            title: (data.title as string) || 'Working',
            detail: (data.detail as string) || '',
          },
          sessionId
        );
        break;
      }
      case 'sidebarAiCreateDone': {
        const sessionId = createSessionIdForEvent(data);
        dropThinking(sessionId);
        setCreateBusy(false);
        setActiveCreateOperationId((current) => (current === sessionId ? null : current));
        create.setStatus(sessionId, 'done');
        appendCreate(
          {
            id: nextId(),
            role: 'ai',
            kind: 'done',
            workspacePath: data.workspacePath as string | undefined,
            projects: (data.projects as CreatedProject[]) || [],
          },
          sessionId
        );
        break;
      }
      case 'sidebarAiCreateError': {
        const sessionId = createSessionIdForEvent(data);
        dropThinking(sessionId);
        setCreateBusy(false);
        setActiveCreateOperationId((current) => (current === sessionId ? null : current));
        create.setStatus(sessionId, 'error');
        appendCreate(
          {
            id: nextId(),
            role: 'ai',
            kind: 'error',
            error: (data.error as string) || 'Unknown error',
            unsupportedStack: Boolean(data.unsupportedStack),
          },
          sessionId
        );
        break;
      }
      case 'sidebarManualCreateResult': {
        const sessionId = createSessionIdForEvent(data);
        dropThinking(sessionId);
        setCreateBusy(false);
        setActiveCreateOperationId((current) => (current === sessionId ? null : current));
        if (data.status === 'done') {
          create.setStatus(sessionId, 'done');
          const createdWorkspacePath =
            typeof data.workspacePath === 'string' ? data.workspacePath : undefined;
          const createdProjectPath =
            typeof data.projectPath === 'string' ? data.projectPath : undefined;
          const createdName = typeof data.name === 'string' ? data.name : undefined;
          if (createdWorkspacePath) {
            setScope((previous) => ({
              workspaceName: data.mode === 'workspace' ? createdName : previous.workspaceName,
              workspacePath: createdWorkspacePath,
              projectName: data.mode === 'project' ? createdName : undefined,
              projectPath: createdProjectPath,
            }));
          }
          appendCreate(
            {
              id: nextId(),
              role: 'ai',
              kind: 'manual-done',
              mode: data.mode === 'project' ? 'project' : 'workspace',
              name: createdName,
              kit: typeof data.kit === 'string' ? data.kit : undefined,
              summary:
                typeof data.summary === 'string'
                  ? data.summary
                  : createdName
                    ? createdName
                    : 'Creation completed.',
              profile: typeof data.profile === 'string' ? data.profile : undefined,
              workspacePath: createdWorkspacePath,
              projectPath: createdProjectPath,
            },
            sessionId
          );
        } else {
          create.setStatus(sessionId, 'error');
          appendCreate(
            {
              id: nextId(),
              role: 'ai',
              kind: 'error',
              error: (data.error as string) || 'Unknown error',
            },
            sessionId
          );
        }
        break;
      }

      // ---- Workspace Advisor ----
      case 'sidebarImpactScope':
        if (data.scopeMode !== 'none') {
          setScope(resolveScopeFromPayload(data));
        }
        break;
      case 'sidebarImpactThinking':
        impact.setActivity(
          String(data.sessionId ?? ''),
          typeof data.label === 'string' ? data.label : 'Reading workspace evidence...'
        );
        break;
      case 'sidebarImpactChunk':
        impact.appendChunk(String(data.sessionId ?? ''), (data.text as string) || '');
        break;
      case 'sidebarImpactDone':
        impact.finishStreaming(
          String(data.sessionId ?? ''),
          data.modelId as string | undefined,
          data.answer as string | undefined
        );
        break;
      case 'sidebarImpactError':
        impact.failSession(String(data.sessionId ?? ''), (data.error as string) || 'Unknown error');
        break;

      // ---- Studio ----
      case 'sidebarStudioScope':
        if (data.scopeMode !== 'none') {
          setScope(resolveScopeFromPayload(data));
        }
        break;
      case 'sidebarStudioThinking':
        studio.setActivity(
          String(data.sessionId ?? ''),
          typeof data.label === 'string' ? data.label : 'Preparing the next safe step...'
        );
        break;
      case 'sidebarStudioChunk':
        studio.appendChunk(String(data.sessionId ?? ''), (data.text as string) || '');
        break;
      case 'sidebarStudioDone': {
        const completedSessionId = String(data.sessionId ?? '');
        studio.finishStreaming(
          completedSessionId,
          data.modelId as string | undefined,
          data.answer as string | undefined
        );
        const completedIncidentKey = resolveStudioIncidentKeyForSession(completedSessionId);
        if (completedIncidentKey && data.verified === true) {
          updateStudioIncidentRepairState(completedIncidentKey, {
            repairStatus: 'done',
            lastActionTitle: 'Verified',
            lastActionSummary:
              typeof data.answer === 'string' && data.answer.trim()
                ? data.answer
                : 'The blocker passed refreshed verification.',
            lastActionAt: new Date().toISOString(),
          });
        }
        setStudioAutoFixBusy(false);
        setStudioPatchApplyBusy(false);
        break;
      }
      case 'sidebarStudioEvidencePulse': {
        const pulseIncidentKey = resolveStudioIncidentKeyForEvent(data);
        const changedCount = Array.isArray(data.changedPaths) ? data.changedPaths.length : 0;
        const pulse = parseSidebarStudioActionProgress({
          ...data,
          action: 'live-evidence',
          status: 'done',
          phase: 'observing-evidence',
          title: 'Evidence refreshed',
          summary:
            changedCount > 0
              ? `${changedCount} governed artifact${changedCount === 1 ? '' : 's'} updated. Studio is using the latest evidence.`
              : 'Studio is using the latest governed evidence.',
        });
        if (pulseIncidentKey && pulse) {
          setStudioIncidentTimeline((prev) => ({
            ...prev,
            [pulseIncidentKey]: appendStudioRepairTimelineEntry(
              prev[pulseIncidentKey] ?? [],
              pulse
            ),
          }));
        }
        break;
      }
      case 'sidebarStudioError': {
        const failedSessionId = String(data.sessionId ?? '');
        const rawFailureMessage = (data.error as string) || 'Unknown error';
        const terminalReason =
          typeof data.terminalReason === 'string' ? data.terminalReason : undefined;
        const errorDecisionOptions = Array.isArray(data.decisionOptions)
          ? data.decisionOptions.filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
            )
          : [];
        const requiresUserDecision = Boolean(
          data.requiresUserDecision === true &&
          typeof data.transactionId === 'string' &&
          data.transactionId.trim() &&
          errorDecisionOptions.length > 0
        );
        const terminalPresentation = describeStudioTerminalFailure({
          error: humanizeStudioError(rawFailureMessage),
          terminalReason,
          requiresUserDecision,
        });
        const failureMessage = terminalPresentation.summary;
        const failedIncidentKey = resolveStudioIncidentKeyForSession(failedSessionId);
        studio.failSession(failedSessionId, failureMessage);
        if (failedIncidentKey) {
          const terminalTitle = terminalPresentation.title;
          if (requiresUserDecision) {
            setStudioIncidentRepairHolds((previous) => ({
              ...previous,
              [failedIncidentKey]: failureMessage,
            }));
          } else {
            setStudioIncidentRepairHolds((previous) => {
              const next = { ...previous };
              delete next[failedIncidentKey];
              return next;
            });
          }
          setStudioIncidentProgress((previous) => {
            const terminal = terminalizeStudioProgress(previous[failedIncidentKey], {
              title: terminalTitle,
              summary: failureMessage,
              reviewRequired: requiresUserDecision,
              terminalReason: terminalPresentation.terminalReason,
              technicalDetail: terminalPresentation.technicalDetail,
            });
            return terminal ? { ...previous, [failedIncidentKey]: terminal } : previous;
          });
          setStudioIncidentTimeline((previous) => ({
            ...previous,
            [failedIncidentKey]: terminalizeStudioTimeline(previous[failedIncidentKey] ?? [], {
              title: terminalTitle,
              summary: failureMessage,
              reviewRequired: requiresUserDecision,
              terminalReason: terminalPresentation.terminalReason,
              technicalDetail: terminalPresentation.technicalDetail,
            }),
          }));
          setStudioActionProgress((current) =>
            terminalizeStudioProgress(current, {
              title: terminalTitle,
              summary: failureMessage,
              reviewRequired: requiresUserDecision,
              terminalReason: terminalPresentation.terminalReason,
              technicalDetail: terminalPresentation.technicalDetail,
            })
          );
          updateStudioIncidentRepairState(failedIncidentKey, {
            repairStatus: requiresUserDecision ? 'review' : 'blocked',
            lastActionTitle: terminalTitle,
            lastActionSummary: failureMessage,
            lastActionAt: new Date().toISOString(),
            terminalReason: terminalPresentation.terminalReason,
          });
        }
        setStudioAutoFixBusy(false);
        setStudioPatchApplyBusy(false);
        break;
      }
      case 'sidebarActionError':
        setSurfaceActionFailure({
          title:
            typeof data.title === 'string' && data.title.trim()
              ? data.title.trim()
              : 'Action unavailable',
          summary:
            typeof data.error === 'string' && data.error.trim()
              ? data.error.trim()
              : 'This action is not available in the current workspace.',
        });
        break;
      case 'sidebarBlockerHandoff': {
        const nextHandoff = parseStudioBlockerHandoffView(data.handoff);
        if (nextHandoff) {
          setActiveTab('studio');
          setAssistantMode('agent');
          const mirroredKey = `${nextHandoff.cardId}:${nextHandoff.blockerSignature}`;
          if (studioMirroredHandoffKeysRef.current.delete(mirroredKey)) {
            setBlockerHandoff(nextHandoff);
            break;
          }
          const incidentScope = scopeFromHandoff(nextHandoff, scope);
          setScope(incidentScope);
          const incidentKey = openStudioIncidentSession(nextHandoff, incidentScope);
          setStudioIncidentTimeline((prev) => ({ ...prev, [incidentKey]: [] }));
          setBlockerHandoff(nextHandoff);
          setStudioFixApplied(false);
          setStudioPatchReview(null);
          setStudioVerifyFailure(null);
          setStudioRemediationPlan(null);
          setStudioReturnState(null);
          setStudioActionProgress(null);
          setAdvisorActionFailure(null);
        }
        break;
      }
      case 'sidebarAdvisorStudioHandoff': {
        const advisorHandoff = parseStudioBlockerHandoffView(data.blockerHandoff);
        const editorIssue = parseEditorIssueSessionInput(data.editorIssue, {
          source: typeof data.source === 'string' ? data.source : 'advisor',
          trigger: typeof data.trigger === 'string' ? data.trigger : 'advisor-to-studio',
        });
        if (typeof data.prefill === 'string' && data.prefill.trim() && !advisorHandoff) {
          if (editorIssue) {
            studio.openEditorSession({
              title: editorIssueSessionTitle('Fix', editorIssue),
              mode: 'investigate',
              editorIssue,
            });
          } else {
            studio.newSession();
          }
          setStudioPrefill(data.prefill.trim());
          setStudioPrefillKey((key) => key + 1);
        } else if (advisorHandoff) {
          setStudioPrefill('');
          setStudioPrefillKey((key) => key + 1);
        }
        setActiveTab('studio');
        setAssistantMode('agent');
        if (advisorHandoff) {
          const incidentScope = scopeFromHandoff(advisorHandoff, scope);
          setScope(incidentScope);
          const incidentKey = openStudioIncidentSession(advisorHandoff, incidentScope);
          studioMirroredHandoffKeysRef.current.add(
            `${advisorHandoff.cardId}:${advisorHandoff.blockerSignature}`
          );
          setStudioIncidentTimeline((prev) => ({ ...prev, [incidentKey]: [] }));
          setBlockerHandoff(advisorHandoff);
          setStudioFixApplied(false);
          setStudioVerifyFailure(null);
          setStudioRemediationPlan(null);
          setStudioReturnState(null);
          setStudioActionProgress(null);
          setAdvisorActionFailure(null);
        }
        break;
      }
      case 'sidebarStudioRemediationPlan': {
        const cardId = typeof data.cardId === 'string' ? data.cardId : '';
        const responseSignature =
          typeof data.blockerSignature === 'string' ? data.blockerSignature : undefined;
        if (
          responseSignature &&
          blockerHandoff?.blockerSignature &&
          responseSignature !== blockerHandoff.blockerSignature
        ) {
          break;
        }
        const nextPlan = parseDoctorRemediationPlanView(data.plan);
        const targetIncidentKey = resolveStudioIncidentKeyForEvent(data);
        if (targetIncidentKey && nextPlan) {
          setStudioIncidentPlans((prev) => ({ ...prev, [targetIncidentKey]: nextPlan }));
        }
        if (
          !targetIncidentKey ||
          targetIncidentKey === activeStudioIncidentKey ||
          (cardId && blockerHandoff?.cardId === cardId)
        ) {
          setStudioRemediationPlan(nextPlan);
        }
        break;
      }
      case 'sidebarAdvisorActionResult': {
        if (data.status === 'failed') {
          const error =
            typeof data.error === 'string' && data.error.trim().length > 0
              ? data.error.trim()
              : undefined;
          setAdvisorActionFailure({
            title:
              typeof data.title === 'string' && data.title.trim().length > 0
                ? data.title.trim()
                : 'Workspace Advisor action failed',
            summary:
              (typeof data.summary === 'string' && data.summary.trim().length > 0
                ? data.summary.trim()
                : error) ?? 'The Advisor action failed before completion.',
            nextAction:
              typeof data.nextAction === 'string' && data.nextAction.trim().length > 0
                ? data.nextAction.trim()
                : undefined,
          });
        } else {
          setAdvisorActionFailure(null);
        }
        break;
      }
      case 'sidebarStudioFixApplied': {
        const targetIncidentKey = resolveStudioIncidentKeyForEvent(data);
        const shouldReflectVisible =
          !targetIncidentKey || targetIncidentKey === visibleStudioIncidentKey;
        setBlockerHandoff((current) => {
          const sourceHandoff =
            targetIncidentKey && studioIncidentHandoffs[targetIncidentKey]
              ? studioIncidentHandoffs[targetIncidentKey]
              : current;
          const merged = mergeStudioFixAppliedIntoHandoff(sourceHandoff, data);
          if (targetIncidentKey && merged) {
            setStudioIncidentHandoffs((prev) => ({ ...prev, [targetIncidentKey]: merged }));
          }
          if (targetIncidentKey && targetIncidentKey !== visibleStudioIncidentKey) {
            return current;
          }
          return merged;
        });
        setStudioFixApplied(shouldAwaitVerifyAfterStudioFixApplied(data));
        if (data.cardStatus === 'pass' && shouldReflectVisible) {
          setStudioVerifyFailure(null);
        }
        if (data.cardStatus === 'pass') {
          if (targetIncidentKey) {
            setStudioIncidentVerifyFailures((prev) => {
              const next = { ...prev };
              delete next[targetIncidentKey];
              return next;
            });
            setStudioIncidentRepairHolds((prev) => {
              const next = { ...prev };
              delete next[targetIncidentKey];
              return next;
            });
          }
        }
        if (shouldReflectVisible) {
          setStudioReturnState(null);
          setStudioActionProgress(null);
          setStudioPatchReview(null);
          setStudioRemediationPlan(null);
        }
        setStudioAutoFixBusy(false);
        if (targetIncidentKey) {
          setStudioIncidentPlans((prev) => {
            const next = { ...prev };
            delete next[targetIncidentKey];
            return next;
          });
          setStudioIncidentReturnStates((prev) => {
            const next = { ...prev };
            delete next[targetIncidentKey];
            return next;
          });
          setStudioIncidentProgress((prev) => {
            const next = { ...prev };
            delete next[targetIncidentKey];
            return next;
          });
          setStudioIncidentPatchReviews((prev) => {
            const next = { ...prev };
            delete next[targetIncidentKey];
            return next;
          });
        }
        setStudioPatchApplyBusy(false);
        if (typeof data.rollbackCommand === 'string' && data.rollbackCommand.trim()) {
          const rollbackCommand = data.rollbackCommand.trim();
          if (shouldReflectVisible) {
            setStudioRollbackCommand(rollbackCommand);
          }
          if (targetIncidentKey) {
            setStudioIncidentRollbackCommands((prev) => ({
              ...prev,
              [targetIncidentKey]: rollbackCommand,
            }));
          }
        }
        updateStudioIncidentRepairState(targetIncidentKey, {
          ...(data.cardStatus === 'pass' ? { cardStatus: 'pass' as const } : {}),
          repairStatus: data.cardStatus === 'pass' ? 'done' : 'running',
          lastActionTitle: data.cardStatus === 'pass' ? 'Fix applied and verified' : 'Fix applied',
          lastActionSummary:
            data.cardStatus === 'pass'
              ? 'Studio applied the fix and the card is passing.'
              : 'Studio applied the fix and is waiting for verification.',
          lastActionAt: new Date().toISOString(),
        });
        break;
      }
      case 'sidebarStudioShipLoop':
        if (data.shipLoopIntent === 'release' && typeof data.workspacePath === 'string') {
          setShipLoopCards(parseSidebarShipLoopCards(data.cards));
          setShipLoopContext({
            workspacePath: data.workspacePath,
            projectPath: typeof data.projectPath === 'string' ? data.projectPath : undefined,
            projectName: typeof data.projectName === 'string' ? data.projectName : undefined,
          });
        } else {
          setShipLoopCards([]);
          setShipLoopContext(null);
        }
        setShipLoopBusy(false);
        break;
      case 'sidebarStudioPatchReview': {
        const targetIncidentKey = resolveStudioIncidentKeyForEvent(data);
        const shouldReflectVisible =
          !targetIncidentKey || targetIncidentKey === visibleStudioIncidentKey;
        if (data.cleared === true) {
          if (shouldReflectVisible) {
            setStudioPatchReview(null);
          }
          if (targetIncidentKey) {
            setStudioIncidentPatchReviews((prev) => {
              const next = { ...prev };
              delete next[targetIncidentKey];
              return next;
            });
          }
        } else {
          const nextPatchReview = {
            summary: typeof data.summary === 'string' ? data.summary : undefined,
            riskSummary: typeof data.riskSummary === 'string' ? data.riskSummary : undefined,
            patches: parseSidebarPatchReviewItems(data.patches),
          };
          if (shouldReflectVisible) {
            setStudioPatchReview(nextPatchReview);
          }
          if (targetIncidentKey) {
            setStudioIncidentPatchReviews((prev) => ({
              ...prev,
              [targetIncidentKey]: nextPatchReview,
            }));
          }
        }
        setStudioAutoFixBusy(false);
        setStudioPatchApplyBusy(false);
        break;
      }
      case 'sidebarStudioCardRefreshed': {
        const nextHandoff = parseStudioBlockerHandoffView(data.handoff);
        if (nextHandoff) {
          const refreshedKey = openStudioIncidentSession(nextHandoff, {
            workspaceName:
              nextHandoff.workspacePath?.split(/[\\/]/).filter(Boolean).pop() ??
              scope.workspaceName,
            workspacePath: nextHandoff.workspacePath ?? scope.workspacePath,
            projectName:
              nextHandoff.scope === 'project'
                ? (nextHandoff.projectPath?.split(/[\\/]/).filter(Boolean).pop() ??
                  scope.projectName)
                : undefined,
            projectPath:
              nextHandoff.scope === 'project'
                ? (nextHandoff.projectPath ?? scope.projectPath)
                : undefined,
          });
          setBlockerHandoff(nextHandoff);
          setStudioIncidentHandoffs((prev) => ({ ...prev, [refreshedKey]: nextHandoff }));
          setStudioFixApplied(nextHandoff.cardStatus === 'pass' ? false : true);
          const nextReturnState = buildSidebarStudioReturnState(data);
          setStudioReturnState(nextReturnState);
          if (nextReturnState) {
            setStudioIncidentReturnStates((prev) => ({
              ...prev,
              [refreshedKey]: nextReturnState,
            }));
          }
          updateStudioIncidentRepairState(refreshedKey, {
            cardStatus: nextHandoff.cardStatus,
            blockers: nextHandoff.blockers,
            blockerSignature: nextHandoff.blockerSignature,
            repairStatus:
              nextHandoff.cardStatus === 'pass'
                ? 'done'
                : data.agentOwned === true
                  ? 'running'
                  : 'ready',
            lastActionTitle:
              nextHandoff.cardStatus === 'pass'
                ? 'Card verified'
                : data.agentOwned === true
                  ? 'Evidence refreshed; repair continues'
                  : (nextReturnState?.title ?? 'Card refreshed'),
            lastActionSummary:
              nextHandoff.cardStatus === 'pass'
                ? 'The latest evidence reports this card as passing.'
                : data.agentOwned === true
                  ? 'Studio still owns this repair and is continuing with the refreshed blocker state.'
                  : (nextReturnState?.detail ?? 'Studio refreshed the card evidence.'),
            lastActionAt: new Date().toISOString(),
          });
          if (nextHandoff.cardStatus === 'pass') {
            setStudioVerifyFailure(null);
            setStudioIncidentVerifyFailures((prev) => {
              const next = { ...prev };
              delete next[refreshedKey];
              return next;
            });
            setStudioIncidentRepairHolds((prev) => {
              const next = { ...prev };
              delete next[refreshedKey];
              return next;
            });
          }
        }
        break;
      }
      case 'sidebarStudioActionResult':
        {
          const rawProgress = parseSidebarStudioActionProgress(data);
          const progressIncidentKey = resolveStudioIncidentKeyForEvent(data);
          const progressHandoff = progressIncidentKey
            ? (studioIncidentHandoffs[progressIncidentKey] ?? activeBlockerHandoff)
            : activeBlockerHandoff;
          const rawFailure = parseStudioActionFailure(data);
          const nextFailure = rawFailure
            ? enrichStudioActionFailureWithHandoff(rawFailure, progressHandoff)
            : null;
          const nextProgress = rawProgress
            ? enrichSidebarStudioActionProgressWithHandoff(rawProgress, progressHandoff)
            : null;
          if (progressIncidentKey && nextFailure) {
            setStudioIncidentVerifyFailures((prev) => ({
              ...prev,
              [progressIncidentKey]: nextFailure,
            }));
            if (nextFailure.rollbackCommand) {
              setStudioIncidentRollbackCommands((prev) => ({
                ...prev,
                [progressIncidentKey]: nextFailure.rollbackCommand!,
              }));
            }
          }
          if (progressIncidentKey && !nextFailure && data.status === 'done') {
            setStudioIncidentVerifyFailures((prev) => {
              const next = { ...prev };
              delete next[progressIncidentKey];
              return next;
            });
            setStudioIncidentRepairHolds((prev) => {
              const next = { ...prev };
              delete next[progressIncidentKey];
              return next;
            });
          }
          if (progressIncidentKey && nextProgress) {
            setStudioIncidentProgress((prev) => ({ ...prev, [progressIncidentKey]: nextProgress }));
            setStudioIncidentTimeline((prev) => ({
              ...prev,
              [progressIncidentKey]: appendStudioRepairTimelineEntry(
                prev[progressIncidentKey] ?? [],
                nextProgress
              ),
            }));
            updateStudioIncidentRepairState(progressIncidentKey, {
              repairStatus: resolveStudioIncidentRepairStatus({
                progressStatus: nextProgress.status,
                phase: nextProgress.phase,
                cardStatus: progressHandoff?.cardStatus,
              }),
              lastActionTitle: nextProgress.title,
              lastActionSummary: nextProgress.summary,
              lastActionAt: new Date().toISOString(),
            });
          }
          if (progressIncidentKey && nextFailure) {
            updateStudioIncidentRepairState(progressIncidentKey, {
              repairStatus: 'blocked',
              lastActionTitle: nextFailure.title,
              lastActionSummary: nextFailure.summary,
              lastActionAt: new Date().toISOString(),
            });
          }
          if (!progressIncidentKey || progressIncidentKey === visibleStudioIncidentKey) {
            setStudioVerifyFailure(nextFailure);
            setStudioActionProgress(nextProgress);
            const progressSessionId =
              typeof data.sessionId === 'string' && data.sessionId.trim()
                ? data.sessionId.trim()
                : studio.activeId;
            if (!progressIncidentKey && progressSessionId && nextProgress) {
              const scopedProgress = { ...nextProgress, sessionId: progressSessionId };
              setStudioSessionProgress((previous) => ({
                ...previous,
                [progressSessionId]: scopedProgress,
              }));
              setStudioSessionTimeline((previous) => ({
                ...previous,
                [progressSessionId]: appendStudioRepairTimelineEntry(
                  previous[progressSessionId] ?? [],
                  scopedProgress
                ),
              }));
            }
            if (nextFailure?.rollbackCommand) {
              setStudioRollbackCommand(nextFailure.rollbackCommand);
            }
          }
        }
        if (
          data.action === 'auto-fix' ||
          data.action === 'apply-patch' ||
          data.action === 'apply-remediation-step' ||
          data.action === 'run-remediation-command' ||
          data.action === 'refresh-remediation-plan'
        ) {
          setStudioAutoFixBusy(data.status === 'running');
          setStudioPatchApplyBusy(
            data.status === 'running' &&
              (data.action === 'apply-patch' || data.action === 'apply-remediation-step')
          );
        }
        if (data.action === 'retry-audit') {
          setStudioAutoFixBusy(false);
          setStudioPatchApplyBusy(false);
        }
        if (data.action === 'ship-loop-step' || data.action === 'refresh-ship-loop') {
          setShipLoopBusy(data.status === 'running');
        }
        break;
      case 'sidebarStudioAuditState':
        setStudioAuditState(parseSidebarStudioAuditState(data));
        if (data.status === 'failed') {
          setStudioReturnState(
            buildSidebarStudioAuditReturnState({
              registryRecorded: data.registryRecorded === true,
              feedbackRecorded: data.feedbackRecorded === true,
              error: typeof data.error === 'string' ? data.error : undefined,
            })
          );
        }
        break;
      default:
        break;
    }
  });

  useEffect(() => {
    vscode.postMessage('sidebarRefreshModels', {}, META);
  }, []);

  // ---- Create handlers ----
  const handleSubmitPrompt = (prompt: string, stackFocus: string, target: CreateTarget) => {
    const sessionId = create.startSession({
      target,
      method: 'ai',
      request: prompt,
      initialMessage: { id: nextId(), role: 'user', kind: 'text', text: prompt },
    });
    setCreateBusy(true);
    setActiveCreateOperationId(sessionId);
    vscode.postMessage(
      'sidebarAiCreatePlan',
      {
        prompt,
        modelId: selectedModelId ?? undefined,
        stackFocus,
        target,
        sessionId,
        scope: scope.workspacePath ? { workspacePath: scope.workspacePath } : undefined,
      },
      META
    );
  };

  const handleApprovePlan = (plan: CreationPlan) => {
    const sessionId = create.activeId || '';
    create.replaceMessages(sessionId, (messages) =>
      messages.map((message) =>
        message.kind === 'plan' ? { ...message, resolved: true } : message
      )
    );
    create.setStatus(sessionId, 'running');
    setCreateBusy(true);
    setActiveCreateOperationId(sessionId);
    vscode.postMessage(
      'sidebarAiCreateConfirm',
      {
        plan,
        sessionId,
        scope: scope.workspacePath
          ? { workspaceName: scope.workspaceName, workspacePath: scope.workspacePath }
          : undefined,
      },
      META
    );
  };

  const handleRevisePlan = () => {
    const sessionId = create.activeId || '';
    create.replaceMessages(sessionId, (messages) =>
      messages.map((message) =>
        message.kind === 'plan' ? { ...message, resolved: true } : message
      )
    );
  };

  const handleManualCreate = (
    input: ManualWorkspaceInput | { mode: 'project'; name: string; framework: string }
  ) => {
    if ('mode' in input) {
      const request = `Create project "${input.name}" with ${frameworkLabel(input.framework)}`;
      const sessionId = create.startSession({
        target: 'project',
        method: 'manual',
        request,
        initialMessage: {
          id: nextId(),
          role: 'user',
          kind: 'text',
          text: request,
        },
      });
      setCreateBusy(true);
      setActiveCreateOperationId(sessionId);
      vscode.postMessage(
        'sidebarManualCreate',
        {
          mode: 'project',
          name: input.name,
          framework: input.framework,
          sessionId,
          scope: scope.workspacePath
            ? {
                workspaceName: scope.workspaceName,
                workspacePath: scope.workspacePath,
                projectName: scope.projectName,
                projectPath: scope.projectPath,
              }
            : undefined,
        },
        META
      );
      return;
    }
    const request = `Create workspace "${input.name}" (${input.profile})`;
    const sessionId = create.startSession({
      target: 'workspace',
      method: 'manual',
      request,
      initialMessage: { id: nextId(), role: 'user', kind: 'text', text: request },
    });
    setCreateBusy(true);
    setActiveCreateOperationId(sessionId);
    vscode.postMessage(
      'sidebarManualCreate',
      {
        mode: 'workspace',
        name: input.name,
        profile: input.profile,
        installMethod: input.installMethod,
        skipPythonEngine: input.skipPythonEngine,
        initGit: input.initGit,
        policyMode: input.policyMode,
        dependencySharing: input.dependencySharing,
        sessionId,
      },
      META
    );
  };

  const handleFocusView = (target: 'workspaces' | 'projects') => {
    vscode.postMessage('sidebarFocusView', { target }, META);
  };

  const handleAdoptProject = () => {
    vscode.postMessage(
      'adoptExistingProject',
      scope.workspacePath ? { workspacePath: scope.workspacePath } : {},
      META
    );
  };

  const handleImportProject = () => {
    vscode.postMessage(
      'importExistingProject',
      scope.workspacePath ? { workspacePath: scope.workspacePath } : {},
      META
    );
  };

  const handleImportWorkspace = () => {
    vscode.postMessage('importExistingWorkspace', {}, META);
  };

  const handleBootstrapCreatedWorkspace = (input: {
    workspacePath: string;
    workspaceName?: string;
    profile?: string;
  }) => {
    setScope((previous) => ({
      ...previous,
      workspaceName: input.workspaceName || previous.workspaceName,
      workspacePath: input.workspacePath,
      projectName: undefined,
      projectPath: undefined,
    }));
    vscode.postMessage(
      'sidebarCreatedWorkspaceBootstrap',
      {
        workspacePath: input.workspacePath,
        workspaceName: input.workspaceName,
        profile: input.profile,
      },
      META
    );
  };

  // ---- Advisor handlers ----
  const scopePayload = useMemo(() => scopePayloadFromScope(scope), [scope]);
  const sessionScopeSnapshot = useMemo(() => {
    if (!scope.workspaceName && !scope.workspacePath && !scope.projectName && !scope.projectPath) {
      return null;
    }
    return {
      workspaceName: scope.workspaceName,
      workspacePath: scope.workspacePath,
      projectName: scope.projectName,
      projectPath: scope.projectPath,
    };
  }, [scope]);

  const scopeKey = `${scope.workspacePath ?? ''}|${scope.projectPath ?? ''}`;
  const previousScopeKeyRef = useRef<string | null>(null);
  const resetImpactSession = impact.newSession;
  const resetStudioSession = studio.newSession;

  useEffect(() => {
    if (previousScopeKeyRef.current === null) {
      previousScopeKeyRef.current = scopeKey;
      return;
    }
    if (previousScopeKeyRef.current === scopeKey) {
      return;
    }
    previousScopeKeyRef.current = scopeKey;
    const activeImpactSession = impact.sessions.find(
      (session) => session.sessionId === impact.activeId
    );
    if (!activeImpactSession?.editorIssue && !activeImpactSession?.scope) {
      resetImpactSession();
    }
    const pendingIncidentSessionId = pendingStudioIncidentSessionRef.current;
    if (pendingIncidentSessionId && pendingIncidentSessionId === studio.activeId) {
      return;
    }
    const activeStudioSession = studio.sessions.find(
      (session) => session.sessionId === studio.activeId
    );
    if (
      !activeStudioSession?.incident &&
      !activeStudioSession?.editorIssue &&
      !activeStudioSession?.scope
    ) {
      resetStudioSession();
    } else {
      pendingStudioIncidentSessionRef.current = null;
    }
  }, [
    impact.activeId,
    impact.sessions,
    resetImpactSession,
    resetStudioSession,
    scopeKey,
    studio.activeId,
    studio.sessions,
  ]);

  const handleSubmitImpact = (question: string, options?: { forceNew?: boolean }) => {
    const activeAskSession =
      studio.sessions.find((session) => session.sessionId === studio.activeId) ?? null;
    const { sessionId, history } = studio.startQuery(question, 'investigate', {
      ...options,
      assistantMode: 'ask',
      scope: activeAskSession?.editorIssue ? null : sessionScopeSnapshot,
    });
    const sessionForPayload =
      activeAskSession ??
      studio.sessions.find((session) => session.sessionId === sessionId) ??
      null;
    vscode.postMessage(
      'sidebarStudioQuery',
      {
        task: question,
        sessionId,
        assistantMode: 'ask',
        mode: 'investigate',
        modelId: selectedModelId ?? undefined,
        history,
        scope: scopePayloadForSession(sessionForPayload, scope),
        scopeMode: sessionScopeMode(sessionForPayload),
        ...(sessionForPayload?.editorIssue ? { editorIssue: sessionForPayload.editorIssue } : {}),
      },
      META
    );
  };

  const activeImpact =
    assistantMode === 'ask'
      ? (studio.sessions.find((s) => s.sessionId === studio.activeId) ?? null)
      : (impact.sessions.find((s) => s.sessionId === impact.activeId) ?? null);

  const advisorAction = (action: 'studio' | 'verify' | 'copy') => {
    if (action === 'studio') {
      setActiveTab('studio');
      setAssistantMode('agent');
      if (activeImpact?.editorIssue) {
        const {
          firstSeenAt: _firstSeenAt,
          lastSeenAt: _lastSeenAt,
          ...editorIssue
        } = activeImpact.editorIssue;
        studio.openEditorSession({
          title: editorIssueSessionTitle('Fix', editorIssue),
          mode: 'investigate',
          editorIssue,
        });
      } else if (!activeImpact?.incident) {
        const scopedSession = activeImpact?.scope ?? sessionScopeSnapshot;
        if (scopedSession) {
          const scopeSnapshot = {
            workspaceName: scopedSession.workspaceName,
            workspacePath: scopedSession.workspacePath,
            projectName: scopedSession.projectName,
            projectPath: scopedSession.projectPath,
          };
          const title = scopeSnapshot.projectName
            ? `Fix ${scopeSnapshot.projectName}`
            : scopeSnapshot.workspaceName
              ? `Fix ${scopeSnapshot.workspaceName}`
              : 'Studio workspace session';
          studio.openScopeSession({
            title,
            mode: 'investigate',
            scope: scopeSnapshot,
          });
        } else {
          studio.newSession();
        }
      }
    }
    setAdvisorActionFailure(null);
    const lastUser = [...(activeImpact?.messages ?? [])].reverse().find((m) => m.role === 'user');
    const lastAssistant = [...(activeImpact?.messages ?? [])]
      .reverse()
      .find((m) => m.role === 'assistant');
    vscode.postMessage(
      'sidebarAdvisorAction',
      {
        action,
        sessionId: activeImpact?.sessionId,
        scope: scopePayloadForSession(activeImpact, scope),
        scopeMode: sessionScopeMode(activeImpact),
        sessionKind: activeImpact ? chatSessionKind(activeImpact) : 'global',
        ...(activeImpact?.editorIssue ? { editorIssue: activeImpact.editorIssue } : {}),
        ...(activeImpact?.incident ? { incident: activeImpact.incident } : {}),
        ...(activeImpact?.scope ? { sessionScope: activeImpact.scope } : {}),
        question: lastUser?.content,
        answer: lastAssistant?.content,
      },
      META
    );
  };

  // ---- Studio handlers ----
  const handleSubmitStudio = (task: string, options?: { forceNew?: boolean }) => {
    const activeStudioSession =
      studio.sessions.find((session) => session.sessionId === studio.activeId) ?? null;
    const { sessionId, history } = studio.startQuery(task, studioMode, {
      ...options,
      assistantMode,
      scope: activeStudioSession?.editorIssue ? null : sessionScopeSnapshot,
    });
    const sessionForPayload =
      activeStudioSession ??
      studio.sessions.find((session) => session.sessionId === sessionId) ??
      null;
    vscode.postMessage(
      'sidebarStudioQuery',
      {
        task,
        sessionId,
        assistantMode,
        mode: studioMode,
        modelId: selectedModelId ?? undefined,
        history,
        scope: scopePayloadForSession(sessionForPayload, scope),
        scopeMode: sessionScopeMode(sessionForPayload),
        ...(sessionForPayload?.editorIssue ? { editorIssue: sessionForPayload.editorIssue } : {}),
        ...(activeBlockerHandoff ? { blockerHandoff: activeBlockerHandoff } : {}),
      },
      META
    );
  };

  handleSubmitImpactRef.current = handleSubmitImpact;
  handleSubmitStudioRef.current = handleSubmitStudio;

  const activeStudio = studio.sessions.find((s) => s.sessionId === studio.activeId) ?? null;
  const activeStudioIncidentKey = activeStudio?.incident?.key;
  const pendingStudioIncidentSession = pendingStudioIncidentSessionRef.current
    ? (studio.sessions.find(
        (session) => session.sessionId === pendingStudioIncidentSessionRef.current
      ) ?? null)
    : null;
  const visibleStudioIncidentKey =
    activeStudioIncidentKey ?? pendingStudioIncidentSession?.incident?.key;
  const activeBlockerHandoff = visibleStudioIncidentKey
    ? (studioIncidentHandoffs[visibleStudioIncidentKey] ??
      restoreStudioHandoffFromSession(
        activeStudioIncidentKey ? activeStudio : pendingStudioIncidentSession
      ))
    : null;
  const activeStudioRemediationPlan = visibleStudioIncidentKey
    ? (studioIncidentPlans[visibleStudioIncidentKey] ?? null)
    : null;
  const activeStudioActionProgress = visibleStudioIncidentKey
    ? (studioIncidentProgress[visibleStudioIncidentKey] ?? null)
    : studio.activeId
      ? (studioSessionProgress[studio.activeId] ?? null)
      : studioActionProgress;
  const activeStudioRepairTimeline = visibleStudioIncidentKey
    ? (studioIncidentTimeline[visibleStudioIncidentKey] ?? [])
    : studio.activeId
      ? (studioSessionTimeline[studio.activeId] ??
        (activeStudioActionProgress ? [activeStudioActionProgress] : []))
      : activeStudioActionProgress
        ? [activeStudioActionProgress]
        : [];
  const activeStudioVerifyFailure = visibleStudioIncidentKey
    ? (studioIncidentVerifyFailures[visibleStudioIncidentKey] ?? null)
    : studioVerifyFailure;
  const activeStudioReturnState = visibleStudioIncidentKey
    ? (studioIncidentReturnStates[visibleStudioIncidentKey] ?? null)
    : studioReturnState;
  const activeStudioRollbackCommand = visibleStudioIncidentKey
    ? (studioIncidentRollbackCommands[visibleStudioIncidentKey] ?? null)
    : studioRollbackCommand;
  const activeStudioPatchReview = visibleStudioIncidentKey
    ? (studioIncidentPatchReviews[visibleStudioIncidentKey] ?? null)
    : studioPatchReview;
  const activeStudioCompleted = Boolean(
    activeStudio?.incident?.repairStatus === 'done' ||
    activeStudioReturnState?.status === 'verified-refreshed' ||
    (activeStudioActionProgress?.status === 'done' &&
      ['verified', 'goal-verified'].includes(activeStudioActionProgress.phase ?? ''))
  );
  const activeStudioReviewRequired =
    !activeStudioCompleted && isCanonicalStudioRepairDecision(activeStudioActionProgress);
  const activeStudioTerminalReason =
    activeStudioActionProgress?.terminalReason ?? activeStudio?.incident?.terminalReason;
  const activeStudioReviewMessage =
    activeStudioReviewRequired && activeStudioActionProgress?.status === 'review'
      ? activeStudioActionProgress.summary
      : undefined;
  const activeStudioRepairRunning = isStudioRepairActivelyOwned({
    sessionStatus: activeStudio?.status,
    autoFixBusy: studioAutoFixBusy,
    patchApplyBusy: studioPatchApplyBusy,
    progressStatus: activeStudioActionProgress?.status,
  });
  const activeStudioIntelligencePhase =
    activeStudioActionProgress?.intelligencePhase ??
    resolveStudioIntelligencePhaseFromCard(activeBlockerHandoff?.cardId);
  const visibleStudioVerifyFailureForResult = activeStudioRepairRunning
    ? null
    : activeStudioVerifyFailure;
  const visibleStudioReturnStateForResult = activeStudioRepairRunning
    ? null
    : activeStudioReturnState;
  const visibleStudioRollbackCommandForResult = activeStudioRepairRunning
    ? null
    : activeStudioRollbackCommand;
  const activeStudioFixPhase = resolveStudioFixPhase({
    handoff: activeBlockerHandoff,
    fixApplied: studioFixApplied,
    autoFixRunning: studioAutoFixBusy || studioPatchApplyBusy,
    completed: activeStudioCompleted,
  });
  const runStudioCommand = (command: string) => {
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'run-command',
        commandText: command,
        sessionId: studio.activeId ?? undefined,
        scope: scopePayloadForSession(activeStudio, scope),
        scopeMode: sessionScopeMode(activeStudio),
        ...(activeStudio?.editorIssue ? { editorIssue: activeStudio.editorIssue } : {}),
      },
      META
    );
  };
  const clearStudioPatchReviewForIncident = (incidentKey = visibleStudioIncidentKey) => {
    setStudioPatchReview(null);
    if (!incidentKey) {
      return;
    }
    setStudioIncidentPatchReviews((prev) => {
      if (!prev[incidentKey]) {
        return prev;
      }
      const next = { ...prev };
      delete next[incidentKey];
      return next;
    });
  };
  const startStudioActionProgress = (
    progress: SidebarStudioActionProgressView,
    incidentKey = visibleStudioIncidentKey
  ) => {
    const progressHandoff = incidentKey
      ? (studioIncidentHandoffs[incidentKey] ?? activeBlockerHandoff)
      : activeBlockerHandoff;
    const normalizedProgress = enrichSidebarStudioActionProgressWithHandoff(
      progress,
      progressHandoff
    );
    setStudioActionProgress(normalizedProgress);
    const progressSessionId = normalizedProgress.sessionId ?? studio.activeId;
    if (progressSessionId) {
      setStudioSessionProgress((previous) => ({
        ...previous,
        [progressSessionId]: normalizedProgress,
      }));
      setStudioSessionTimeline((previous) => ({
        ...previous,
        [progressSessionId]: appendStudioRepairTimelineEntry(
          previous[progressSessionId] ?? [],
          normalizedProgress
        ),
      }));
    }
    if (!incidentKey) {
      return;
    }
    setStudioIncidentRepairHolds((prev) => {
      if (!prev[incidentKey]) {
        return prev;
      }
      const next = { ...prev };
      delete next[incidentKey];
      return next;
    });
    setStudioIncidentProgress((prev) => ({ ...prev, [incidentKey]: normalizedProgress }));
    setStudioIncidentTimeline((prev) => ({
      ...prev,
      [incidentKey]: appendStudioRepairTimelineEntry(prev[incidentKey] ?? [], normalizedProgress),
    }));
    updateStudioIncidentRepairState(incidentKey, {
      repairStatus: resolveStudioIncidentRepairStatus({
        progressStatus: normalizedProgress.status,
        phase: normalizedProgress.phase,
        cardStatus: progressHandoff?.cardStatus,
      }),
      lastActionTitle: normalizedProgress.title,
      lastActionSummary: normalizedProgress.summary,
      lastActionAt: new Date().toISOString(),
      terminalReason: normalizedProgress.terminalReason,
    });
  };
  const runStudioRemediationCommand = (stepId: string, command: string) => {
    if (!activeBlockerHandoff) {
      return;
    }
    setStudioAutoFixBusy(true);
    startStudioActionProgress({
      action: 'run-remediation-command',
      status: 'running',
      phase: 'running-remediation-command',
      title: 'Running repair command',
      summary: 'I am running the selected repair command and will refresh evidence next.',
      commandText: command,
    });
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'run-remediation-command',
        stepId,
        commandText: command,
        sessionId: studio.activeId ?? undefined,
        scope: scopePayload,
        blockerHandoff: activeBlockerHandoff,
      },
      META
    );
  };
  const refreshStudioRemediationPlan = () => {
    if (!activeBlockerHandoff) {
      return;
    }
    setStudioAutoFixBusy(true);
    startStudioActionProgress({
      action: 'refresh-remediation-plan',
      status: 'running',
      phase: 'refreshing-remediation-plan',
      title: 'Refreshing repair evidence',
      summary:
        'I am refreshing source evidence and the npm repair plan before choosing the next safe step.',
    });
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'refresh-remediation-plan',
        sessionId: studio.activeId ?? undefined,
        scope: scopePayload,
        blockerHandoff: activeBlockerHandoff,
      },
      META
    );
  };
  const copyStudioCommand = (command: string) => {
    vscode.postMessage(
      'sidebarStudioAction',
      { action: 'copy-command', commandText: command, sessionId: studio.activeId ?? undefined },
      META
    );
  };
  const openDashboardRepairFlow = () => {
    vscode.postMessage('sidebarOpenDashboard', { section: 'repair' }, META);
  };
  const openStudioChangedFile = (relativePath: string) => {
    vscode.postMessage(
      'sidebarOpenWorkspaceFile',
      { relativePath, workspacePath: scope.workspacePath },
      META
    );
  };
  const openStudioChangedFileDiff = (relativePath: string, transactionId: string) => {
    vscode.postMessage(
      'sidebarOpenWorkspaceDiff',
      { relativePath, transactionId, workspacePath: scope.workspacePath },
      META
    );
  };
  const undoStudioAgentPatch = (transactionId: string) => {
    vscode.postMessage('sidebarStudioUndoPatch', { transactionId }, META);
  };
  const studioVerifyHandoff = () => {
    setStudioVerifyFailure(null);
    setStudioAutoFixBusy(true);
    startStudioActionProgress({
      action: activeBlockerHandoff?.verifyCommand ? 'verify-handoff' : 'verify',
      status: 'running',
      phase: 'verifying-handoff',
      title: 'Running verify',
      summary: activeBlockerHandoff?.verifyCommand
        ? 'I am running the card verify command and will refresh this repair session.'
        : 'I am running verify and will refresh the current Studio context.',
      commandText: activeBlockerHandoff?.verifyCommand,
    });
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: activeBlockerHandoff?.verifyCommand ? 'verify-handoff' : 'verify',
        sessionId: studio.activeId ?? undefined,
        scope: scopePayloadForSession(activeStudio, scope),
        scopeMode: sessionScopeMode(activeStudio),
        ...(activeBlockerHandoff ? { blockerHandoff: activeBlockerHandoff } : {}),
      },
      META
    );
  };
  const reviewStudioRepairOptions = (decision?: string, transactionId?: string) => {
    if (!activeBlockerHandoff) {
      return;
    }
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'repair-decision',
        sessionId: studio.activeId ?? undefined,
        scope: scopePayloadForSession(activeStudio, scope),
        scopeMode: sessionScopeMode(activeStudio),
        blockerHandoff: activeBlockerHandoff,
        transactionId: transactionId ?? activeStudioActionProgress?.transactionId,
        ...(decision ? { decision } : {}),
      },
      META
    );
  };
  const studioAutoFix = () => {
    if (!activeBlockerHandoff) {
      return;
    }
    if (activeStudioReviewRequired) {
      reviewStudioRepairOptions();
      return;
    }
    setStudioAutoFixBusy(true);
    setStudioVerifyFailure(null);
    setStudioReturnState(null);
    const incidentKey =
      visibleStudioIncidentKey ??
      `${activeBlockerHandoff.cardId}:${activeBlockerHandoff.blockerSignature}`;
    setStudioIncidentVerifyFailures((previous) => {
      const next = { ...previous };
      delete next[incidentKey];
      return next;
    });
    setStudioIncidentRepairHolds((previous) => {
      const next = { ...previous };
      delete next[incidentKey];
      return next;
    });
    clearStudioPatchReviewForIncident();
    startStudioActionProgress({
      action: 'auto-fix',
      status: 'running',
      phase: 'fixing',
      title: 'Continuing repair',
      summary: 'I am using the card evidence to continue the smallest safe fix path.',
    });
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'auto-fix',
        sessionId: studio.activeId ?? undefined,
        modelId: selectedModelId ?? undefined,
        scope: scopePayload,
        blockerHandoff: activeBlockerHandoff,
      },
      META
    );
  };
  const stopStudioAgent = () => {
    if (!studio.activeId) {
      return;
    }
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'agent-cancel',
        sessionId: studio.activeId,
        ...(activeBlockerHandoff ? { blockerHandoff: activeBlockerHandoff } : {}),
      },
      META
    );
  };
  const handleStudioProgressNextAction = (
    action: NonNullable<SidebarStudioActionProgressView['nextAction']>
  ) => {
    if (action === 'auto-fix') {
      studioAutoFix();
      return;
    }
    if (action === 'continue-remediation') {
      studioAutoFix();
      return;
    }
  };
  const studioApplyRemediationStep = (stepId: string, options: { automatic?: boolean } = {}) => {
    if (!activeBlockerHandoff) {
      return;
    }
    const incidentKey =
      visibleStudioIncidentKey ??
      `${activeBlockerHandoff.cardId}:${activeBlockerHandoff.blockerSignature}`;
    const attemptedSteps = new Set(
      studioAttemptedRemediationStepsRef.current.get(incidentKey) ?? []
    );
    attemptedSteps.add(stepId);
    studioAttemptedRemediationStepsRef.current.set(incidentKey, attemptedSteps);
    setStudioPatchApplyBusy(true);
    startStudioActionProgress({
      action: 'apply-remediation-step',
      status: 'running',
      phase: 'applying-remediation-step',
      title: options.automatic ? 'Applying trusted fix' : 'Applying approved fix',
      summary: options.automatic
        ? 'I am applying a fresh, safe, approval-free contract operation, then I will verify this card.'
        : 'I am applying the approved file operation, then I will verify this card.',
    });
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'apply-remediation-step',
        stepId,
        sessionId: studio.activeId ?? undefined,
        scope: scopePayload,
        blockerHandoff: activeBlockerHandoff,
        autonomous: options.automatic === true || assistantMode === 'agent',
      },
      META
    );
  };
  const studioApplyPatches = (acceptedPaths: string[]) => {
    if (!activeBlockerHandoff) {
      return;
    }
    setStudioPatchApplyBusy(true);
    clearStudioPatchReviewForIncident();
    startStudioActionProgress({
      action: 'apply-patch',
      status: 'running',
      phase: 'applying-patch',
      title: 'Applying reviewed patch',
      summary: 'I am applying the approved patch set, then I will run the verify command.',
    });
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'apply-patch',
        acceptedPaths,
        sessionId: studio.activeId ?? undefined,
        scope: scopePayload,
        blockerHandoff: activeBlockerHandoff,
      },
      META
    );
  };
  const studioRejectPatches = () => {
    clearStudioPatchReviewForIncident();
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'reject-patch',
        sessionId: studio.activeId ?? undefined,
        ...(activeBlockerHandoff ? { blockerHandoff: activeBlockerHandoff } : {}),
      },
      META
    );
  };
  const studioRunShipLoopStep = (stepId: 'analyze' | 'verify-gates' | 'readiness' | 'archive') => {
    if (!shipLoopContext) {
      return;
    }
    setShipLoopBusy(true);
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'ship-loop-step',
        stepId,
        sessionId: studio.activeId ?? undefined,
        scope: {
          workspace: { path: shipLoopContext.workspacePath },
          project: shipLoopContext.projectPath
            ? { name: shipLoopContext.projectName, path: shipLoopContext.projectPath }
            : null,
        },
      },
      META
    );
  };
  const studioCopyRollback = () => {
    if (!activeStudioRollbackCommand) {
      return;
    }
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'copy-command',
        commandText: activeStudioRollbackCommand,
        sessionId: studio.activeId ?? undefined,
      },
      META
    );
  };
  const studioRetryAudit = () => {
    vscode.postMessage(
      'sidebarStudioAction',
      buildSidebarStudioRetryAuditPayload({
        sessionId: studio.activeId ?? undefined,
        scope,
      }),
      META
    );
  };
  const studioCopyBrief = () => {
    const lastUser = [...(activeStudio?.messages ?? [])].reverse().find((m) => m.role === 'user');
    const lastAssistant = [...(activeStudio?.messages ?? [])]
      .reverse()
      .find((m) => m.role === 'assistant');
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'copy',
        sessionId: studio.activeId ?? undefined,
        scope: scopePayloadForSession(activeStudio, scope),
        scopeMode: sessionScopeMode(activeStudio),
        ...(activeStudio?.editorIssue ? { editorIssue: activeStudio.editorIssue } : {}),
        task: lastUser?.content,
        answer: lastAssistant?.content,
      },
      META
    );
  };

  const handleSelectModel = (id: string | null) => {
    assistantModelsRef.current = { ...assistantModelsRef.current, [assistantMode]: id };
    setSelectedModelId(id);
    const current = (vscode.getState() ?? {}) as SecondarySidebarPersistedState;
    vscode.setState({
      ...current,
      workspaiAssistantMode: assistantMode,
      workspaiAssistantModels: assistantModelsRef.current,
    });
    vscode.postMessage('setPreferredModel', { modelId: id?.trim() || 'auto' }, META);
  };

  const refreshModels = () => {
    vscode.postMessage('sidebarRefreshModels', {}, META);
  };

  const selectAssistantMode = (mode: AssistantMode) => {
    const selectedSession = studio.sessions.find(
      (session) => session.sessionId === studio.activeId
    );
    if (
      selectedSession?.assistantMode &&
      selectedSession.assistantMode !== mode &&
      selectedSession.messages.some((message) => message.content.trim().length > 0)
    ) {
      studio.newSession();
    }
    assistantModelsRef.current = {
      ...assistantModelsRef.current,
      [assistantMode]: selectedModelId,
    };
    setSelectedModelId(assistantModelsRef.current[mode] ?? null);
    setAssistantMode(mode);
    setActiveTab('studio');
    if (mode === 'plan') {
      setStudioMode('prepare');
    } else if ((mode === 'agent' || mode === 'goal') && studioMode === 'prepare') {
      setStudioMode('investigate');
    }
  };

  const assistantModeSelector = (
    <AssistantModeSelector
      value={assistantMode}
      onChange={selectAssistantMode}
      disabled={
        studioAutoFixBusy ||
        studioPatchApplyBusy ||
        studio.sessions.some(
          (session) => session.sessionId === studio.activeId && session.status === 'streaming'
        )
      }
    />
  );

  return (
    <div className="ws-sidebar ws-sidebar--secondary" data-variant="secondary-sidebar">
      <div className="ws-sidebar__tabs" role="tablist" aria-label="Workspai AI modes">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className="ws-sidebar__tab"
              aria-selected={selected}
              aria-label={tab.label}
              title={tab.title}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="ws-sidebar__tab-icon" aria-hidden="true">
                <Icon size={13} strokeWidth={1.75} />
              </span>
              <span className="ws-sidebar__tab-label">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>
      {surfaceActionFailure ? (
        <div className="ws-sidebar__advisor-alert" role="alert">
          <AlertTriangle size={14} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>{surfaceActionFailure.title}</strong>
            <span>{surfaceActionFailure.summary}</span>
          </div>
          <button
            type="button"
            className="ws-sidebar__inline"
            onClick={() => setSurfaceActionFailure(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <CreateTab
        active={activeTab === 'create'}
        busy={createBusy}
        messages={createMessages}
        sessions={create.sessions}
        activeSessionId={create.activeId}
        activeOperationSessionId={activeCreateOperationId}
        onNewSession={create.newSession}
        onSelectSession={create.selectSession}
        onDeleteSession={create.deleteSession}
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={handleSelectModel}
        onRefreshModels={refreshModels}
        scope={scope}
        initialDrawer={createDrawerFocus?.drawer ?? null}
        initialDrawerKey={createDrawerFocus?.key ?? 0}
        onSubmitPrompt={handleSubmitPrompt}
        onApprovePlan={handleApprovePlan}
        onRevisePlan={handleRevisePlan}
        onManualCreate={handleManualCreate}
        onAdoptProject={handleAdoptProject}
        onImportProject={handleImportProject}
        onImportWorkspace={handleImportWorkspace}
        onBootstrapWorkspace={handleBootstrapCreatedWorkspace}
        onFocusView={handleFocusView}
      />

      <ChatTab
        active={activeTab === 'studio' && assistantMode === 'ask'}
        contextLabel="Workspai Ask"
        placeholder="Ask with workspace context"
        scope={scope}
        sessions={studio.sessions}
        activeSessionId={studio.activeId}
        onNewSession={studio.newSession}
        onSelectSession={(id) => {
          studio.selectSession(id);
          const selected = studio.sessions.find((session) => session.sessionId === id);
          setAssistantMode(selected?.assistantMode ?? 'ask');
        }}
        onDeleteSession={studio.deleteSession}
        suggestions={advisorSuggestions(scope)}
        onSubmit={handleSubmitImpact}
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={handleSelectModel}
        onRefreshModels={refreshModels}
        composerPrefill={impactPrefill}
        composerPrefillKey={impactPrefillKey}
        composerModeSelector={assistantModeSelector}
        headerChrome={
          advisorActionFailure ? (
            <div className="ws-sidebar__advisor-alert" role="alert">
              <AlertTriangle size={14} strokeWidth={1.8} aria-hidden="true" />
              <div>
                <strong>{advisorActionFailure.title}</strong>
                <span>{advisorActionFailure.summary}</span>
                {advisorActionFailure.nextAction ? (
                  <small>{advisorActionFailure.nextAction}</small>
                ) : null}
              </div>
            </div>
          ) : activeStudioRepairTimeline.length > 0 ? (
            <div className="ws-sidebar__studio-repair-timeline" aria-label="Assistant activity">
              <StudioActionProgress
                progress={activeStudioRepairTimeline[activeStudioRepairTimeline.length - 1]}
                repairBubble={true}
                historical={false}
              />
            </div>
          ) : null
        }
        footerActions={
          <>
            <button
              type="button"
              className="ws-sidebar__inline"
              onClick={() => advisorAction('studio')}
            >
              Continue as Agent
            </button>
            <button
              type="button"
              className="ws-sidebar__inline"
              onClick={() => advisorAction('verify')}
            >
              Run Verify
            </button>
            <button
              type="button"
              className="ws-sidebar__inline"
              onClick={() => advisorAction('copy')}
            >
              Copy Plan
            </button>
          </>
        }
      />

      <ChatTab
        active={activeTab === 'studio' && assistantMode !== 'ask'}
        contextLabel={
          assistantMode === 'plan'
            ? 'Workspai Plan'
            : assistantMode === 'goal'
              ? 'Workspai Goal'
              : 'Workspai Agent'
        }
        placeholder={
          activeBlockerHandoff?.studioMode === 'FIX'
            ? 'Studio is repairing. Add context if needed.'
            : activeBlockerHandoff
              ? 'Studio is checking this blocker. Add context if needed.'
              : assistantMode === 'goal'
                ? 'Define a measurable outcome, e.g. Raise test coverage to 75%'
                : 'Describe the issue or task'
        }
        scope={scope}
        sessions={studio.sessions}
        activeSessionId={studio.activeId}
        onNewSession={studio.newSession}
        onSelectSession={(id) => {
          studio.selectSession(id);
          const selected = studio.sessions.find((session) => session.sessionId === id);
          if (selected?.assistantMode) {
            setAssistantMode(selected.assistantMode);
          }
          const mode = selected?.mode;
          if (mode === 'verify' || mode === 'prepare' || mode === 'investigate') {
            setStudioMode(mode);
          }
          const incidentKey = selected?.incident?.key;
          if (incidentKey) {
            const restoredHandoff =
              studioIncidentHandoffs[incidentKey] ?? restoreStudioHandoffFromSession(selected);
            setBlockerHandoff(restoredHandoff);
            if (restoredHandoff) {
              setStudioIncidentHandoffs((prev) => ({ ...prev, [incidentKey]: restoredHandoff }));
            }
            setStudioRemediationPlan(studioIncidentPlans[incidentKey] ?? null);
            setStudioActionProgress(studioIncidentProgress[incidentKey] ?? null);
            setStudioVerifyFailure(studioIncidentVerifyFailures[incidentKey] ?? null);
            setStudioReturnState(studioIncidentReturnStates[incidentKey] ?? null);
            setStudioRollbackCommand(studioIncidentRollbackCommands[incidentKey] ?? null);
            setStudioPatchReview(studioIncidentPatchReviews[incidentKey] ?? null);
          } else {
            setBlockerHandoff(null);
            setStudioRemediationPlan(null);
            setStudioActionProgress(studioSessionProgress[id] ?? null);
            setStudioVerifyFailure(null);
            setStudioReturnState(null);
            setStudioRollbackCommand(null);
            setStudioPatchReview(null);
          }
        }}
        onDeleteSession={(id) => {
          const incidentKey = studio.sessions.find((session) => session.sessionId === id)?.incident
            ?.key;
          studio.deleteSession(id);
          setStudioSessionProgress((previous) => {
            const next = { ...previous };
            delete next[id];
            return next;
          });
          setStudioSessionTimeline((previous) => {
            const next = { ...previous };
            delete next[id];
            return next;
          });
          if (incidentKey) {
            setStudioIncidentHandoffs((prev) => {
              const next = { ...prev };
              delete next[incidentKey];
              return next;
            });
            setStudioIncidentPlans((prev) => {
              const next = { ...prev };
              delete next[incidentKey];
              return next;
            });
            setStudioIncidentProgress((prev) => {
              const next = { ...prev };
              delete next[incidentKey];
              return next;
            });
            setStudioIncidentTimeline((prev) => {
              const next = { ...prev };
              delete next[incidentKey];
              return next;
            });
            setStudioIncidentVerifyFailures((prev) => {
              const next = { ...prev };
              delete next[incidentKey];
              return next;
            });
            setStudioIncidentReturnStates((prev) => {
              const next = { ...prev };
              delete next[incidentKey];
              return next;
            });
            setStudioIncidentRollbackCommands((prev) => {
              const next = { ...prev };
              delete next[incidentKey];
              return next;
            });
            setStudioIncidentPatchReviews((prev) => {
              const next = { ...prev };
              delete next[incidentKey];
              return next;
            });
          }
        }}
        suggestions={
          assistantMode === 'goal'
            ? [
                'Raise test coverage to 75%.',
                'Resolve blocking dependency vulnerabilities without breaking changes.',
                'Make this workspace release-ready.',
              ]
            : studioSuggestions(studioMode, scope)
        }
        onSubmit={handleSubmitStudio}
        onSteer={(message) => {
          const sessionId = studio.activeId;
          if (!sessionId) {
            return;
          }
          studio.steerSession(sessionId, message);
          vscode.postMessage(
            'sidebarStudioAction',
            {
              action: 'agent-steer',
              sessionId,
              message,
              ...(activeBlockerHandoff ? { blockerHandoff: activeBlockerHandoff } : {}),
            },
            META
          );
        }}
        onCancel={stopStudioAgent}
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={handleSelectModel}
        onRefreshModels={refreshModels}
        composerPrefill={studioPrefill}
        composerPrefillKey={studioPrefillKey}
        composerModeSelector={assistantModeSelector}
        onRunCommand={runStudioCommand}
        onCopyCommand={copyStudioCommand}
        chromeMode={activeBlockerHandoff ? 'repair' : 'default'}
        activityActive={activeStudioRepairRunning}
        streamChrome={
          activeBlockerHandoff ? (
            <>
              <StudioRepairPrelude
                handoff={activeBlockerHandoff}
                busy={activeStudioRepairRunning}
                completed={activeStudioCompleted}
                resumable={
                  !activeStudioReviewRequired &&
                  (activeStudio?.status === 'error' ||
                    activeStudio?.incident?.repairStatus === 'blocked')
                }
                terminalReason={activeStudioTerminalReason}
                reviewMessage={activeStudioReviewMessage}
                reviewRequired={activeStudioReviewRequired}
                transactionId={activeStudioActionProgress?.transactionId}
                decisionOptions={activeStudioActionProgress?.decisionOptions}
                onReview={reviewStudioRepairOptions}
                onDecision={reviewStudioRepairOptions}
                onStart={
                  activeBlockerHandoff.studioMode === 'VERIFY_ONLY'
                    ? studioVerifyHandoff
                    : studioAutoFix
                }
                onOpenSetup={() =>
                  vscode.postMessage(
                    'sidebarStudioAction',
                    { action: 'open-setup', sessionId: studio.activeId ?? undefined },
                    META
                  )
                }
                onStop={stopStudioAgent}
              />
              {activeStudioRepairTimeline.length > 0 ? (
                <div
                  className="ws-sidebar__studio-repair-timeline"
                  aria-label="Live repair timeline"
                >
                  {activeStudioRepairTimeline.length > 1 ? (
                    <details className="ws-sidebar__studio-activity-history">
                      <summary>
                        Worked on {Math.min(activeStudioRepairTimeline.length - 1, 6)} step
                        {Math.min(activeStudioRepairTimeline.length - 1, 6) === 1 ? '' : 's'}
                      </summary>
                      {activeStudioRepairTimeline.slice(-7, -1).map((progress, index) => (
                        <StudioActionProgress
                          key={`${progress.action}:${progress.phase ?? 'phase'}:${progress.status}:${index}`}
                          progress={progress}
                          repairBubble={true}
                          historical={true}
                          onNextAction={handleStudioProgressNextAction}
                          onOpenFile={openStudioChangedFile}
                          onOpenDiff={openStudioChangedFileDiff}
                          onUndo={undoStudioAgentPatch}
                        />
                      ))}
                    </details>
                  ) : null}
                  <StudioActionProgress
                    progress={activeStudioRepairTimeline[activeStudioRepairTimeline.length - 1]}
                    repairBubble={true}
                    historical={false}
                    onNextAction={handleStudioProgressNextAction}
                    onOpenFile={openStudioChangedFile}
                    onOpenDiff={openStudioChangedFileDiff}
                    onUndo={undoStudioAgentPatch}
                  />
                </div>
              ) : null}
              {activeStudioRemediationPlan ? (
                <StudioRemediationPlan
                  plan={activeStudioRemediationPlan}
                  handoff={activeBlockerHandoff}
                  onRunCommand={runStudioRemediationCommand}
                  onApplyStep={studioApplyRemediationStep}
                  onRefreshPlan={refreshStudioRemediationPlan}
                  busy={studioPatchApplyBusy || studioAutoFixBusy}
                />
              ) : null}
              <StudioRepairResult
                returnState={visibleStudioReturnStateForResult}
                verifyFailure={visibleStudioVerifyFailureForResult}
                repairHold={null}
                rollbackCommand={visibleStudioRollbackCommandForResult}
                onCopyRollback={studioCopyRollback}
                onBackToDashboard={openDashboardRepairFlow}
              />
              {activeStudioPatchReview ? (
                <StudioPatchReview
                  key={`${activeBlockerHandoff.cardId}-${activeStudioPatchReview.patches.length}`}
                  summary={activeStudioPatchReview.summary}
                  riskSummary={activeStudioPatchReview.riskSummary}
                  patches={activeStudioPatchReview.patches}
                  busy={studioPatchApplyBusy}
                  onApply={studioApplyPatches}
                  onReject={studioRejectPatches}
                />
              ) : null}
            </>
          ) : activeStudioRepairTimeline.length > 0 ? (
            <div
              className="ws-sidebar__studio-repair-timeline"
              aria-label="Live Assistant activity"
            >
              {activeStudioRepairTimeline.length > 1 ? (
                <details className="ws-sidebar__studio-activity-history">
                  <summary>
                    Worked on {Math.min(activeStudioRepairTimeline.length - 1, 6)} step
                    {Math.min(activeStudioRepairTimeline.length - 1, 6) === 1 ? '' : 's'}
                  </summary>
                  {activeStudioRepairTimeline.slice(-7, -1).map((progress, index) => (
                    <StudioActionProgress
                      key={`${progress.action}:${progress.phase ?? 'phase'}:${progress.status}:${index}`}
                      progress={progress}
                      repairBubble={true}
                      historical={true}
                      onOpenFile={openStudioChangedFile}
                      onOpenDiff={openStudioChangedFileDiff}
                      onUndo={undoStudioAgentPatch}
                    />
                  ))}
                </details>
              ) : null}
              <StudioActionProgress
                progress={activeStudioRepairTimeline[activeStudioRepairTimeline.length - 1]}
                repairBubble={true}
                historical={false}
                onOpenFile={openStudioChangedFile}
                onOpenDiff={openStudioChangedFileDiff}
                onUndo={undoStudioAgentPatch}
              />
            </div>
          ) : null
        }
        headerChrome={
          activeBlockerHandoff ? (
            <StudioBlockerChrome
              handoff={activeBlockerHandoff}
              phase={activeStudioFixPhase}
              workspaceName={activeStudio?.incident?.workspaceName}
              projectName={activeStudio?.incident?.projectName}
              autoFixBusy={studioAutoFixBusy || studioPatchApplyBusy}
              loop={
                <StudioIntelligencePhaseRail
                  activePhase={activeStudioIntelligencePhase}
                  running={activeStudioRepairRunning}
                  completed={activeStudioCompleted}
                />
              }
            />
          ) : !activeBlockerHandoff &&
            (studioAuditState ||
              activeStudioPatchReview ||
              shipLoopCards.length > 0 ||
              activeStudioRollbackCommand) ? (
            <>
              {studioAuditState ? (
                <div
                  className="ws-sidebar__studio-audit-alert"
                  data-state={studioAuditState.status}
                  role="alert"
                >
                  <span className="ws-sidebar__studio-audit-alert-icon" aria-hidden="true">
                    <AlertTriangle size={14} strokeWidth={1.8} />
                  </span>
                  <div className="ws-sidebar__studio-audit-alert-copy">
                    <strong>
                      {studioAuditState.status === 'failed'
                        ? 'Audit write failed'
                        : 'Feedback history is stale'}
                    </strong>
                    <span>
                      {studioAuditState.error ||
                        'The fix or verify result was preserved, but workspace feedback history was not updated.'}
                    </span>
                    <small>
                      Registry {studioAuditState.registryRecorded ? 'saved' : 'not saved'} ·
                      Feedback {studioAuditState.feedbackRecorded ? 'saved' : 'not saved'}
                    </small>
                  </div>
                  {studioAuditState.retryable ? (
                    <button
                      type="button"
                      className="ws-sidebar__inline"
                      onClick={studioRetryAudit}
                      title="Retry recording Studio audit history"
                    >
                      <RotateCcw size={12} strokeWidth={1.75} aria-hidden="true" />
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
              {activeStudioReturnState ? (
                <div
                  className="ws-sidebar__studio-return"
                  data-state={activeStudioReturnState.status}
                  role={
                    activeStudioReturnState.status === 'verified-refreshed' ? 'status' : 'alert'
                  }
                >
                  <span className="ws-sidebar__studio-return-icon" aria-hidden="true">
                    {activeStudioReturnState.status === 'verified-refreshed' ? (
                      <CheckCircle2 size={14} strokeWidth={1.8} />
                    ) : (
                      <AlertTriangle size={14} strokeWidth={1.8} />
                    )}
                  </span>
                  <div className="ws-sidebar__studio-return-copy">
                    <strong>{activeStudioReturnState.title}</strong>
                    <span>{activeStudioReturnState.detail}</span>
                    {activeStudioReturnState.refreshedCardIds.length > 0 ? (
                      <small>Refreshed {activeStudioReturnState.refreshedCardIds.join(', ')}</small>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {activeStudioRemediationPlan ? (
                <StudioRemediationPlan
                  plan={activeStudioRemediationPlan}
                  onRunCommand={runStudioRemediationCommand}
                  onApplyStep={studioApplyRemediationStep}
                  onRefreshPlan={refreshStudioRemediationPlan}
                  busy={studioPatchApplyBusy || studioAutoFixBusy}
                />
              ) : null}
              {activeStudioPatchReview ? (
                <StudioPatchReview
                  key={`${visibleStudioIncidentKey ?? 'patch'}-${activeStudioPatchReview.patches.length}`}
                  summary={activeStudioPatchReview.summary}
                  riskSummary={activeStudioPatchReview.riskSummary}
                  patches={activeStudioPatchReview.patches}
                  busy={studioPatchApplyBusy}
                  onApply={studioApplyPatches}
                  onReject={studioRejectPatches}
                />
              ) : null}
              {activeStudioRollbackCommand ? (
                <div className="ws-sidebar__studio-rollback" role="note">
                  <strong>Rollback available</strong>
                  <code>{activeStudioRollbackCommand}</code>
                  <button type="button" className="ws-sidebar__inline" onClick={studioCopyRollback}>
                    Copy rollback
                  </button>
                </div>
              ) : null}
              {shipLoopCards.length > 0 && shipLoopContext ? (
                <StudioShipLoopStepper
                  cards={shipLoopCards}
                  context={shipLoopContext}
                  busy={shipLoopBusy}
                  onRunStep={studioRunShipLoopStep}
                />
              ) : null}
            </>
          ) : null
        }
        footerActions={
          !activeBlockerHandoff ? (
            <>
              <button type="button" className="ws-sidebar__inline" onClick={studioVerifyHandoff}>
                Run Verify
              </button>
              <button type="button" className="ws-sidebar__inline" onClick={studioCopyBrief}>
                Copy Brief
              </button>
            </>
          ) : null
        }
      />
    </div>
  );
}
