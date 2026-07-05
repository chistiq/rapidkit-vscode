import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Blocks,
  CheckCircle2,
  Compass,
  ListChecks,
  RotateCcw,
  ScanSearch,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { vscode } from '@/vscode';
import { useSidebarMessages } from './useSidebarMessages';
import { useChatSessions } from './useChatSessions';
import { CreateTab } from './CreateTab';
import type { CreateDrawerId } from './drawers/CreateAddDrawer';
import { ChatTab } from './ChatTab';
import type { ManualWorkspaceInput } from './drawers/ManualWorkspaceDrawer';
import {
  FRAMEWORK_OPTIONS,
  type CreateMessage,
  type CreationPlan,
  type CreatedProject,
} from './createTypes';
import {
  normalizeModels,
  resolveSelectedModelId,
  type SidebarModel,
} from './sidebarModels';
import type { SidebarScope, SidebarTab } from './sidebarTypes';
import { resolveScopeFromPayload } from './sidebarTypes';
import { StudioBlockerChrome, parseStudioBlockerHandoffView } from './StudioBlockerChrome';
import {
  StudioPatchReview,
  type SidebarPatchReviewItem,
} from './StudioPatchReview';
import { StudioActionProgress } from './StudioActionProgress';
import { StudioRemediationPlan } from './StudioRemediationPlan';
import { StudioRepairPrelude } from './StudioRepairPrelude';
import { StudioRepairResult } from './StudioRepairResult';
import { StudioShipLoopStepper } from './StudioShipLoopStepper';
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
  parseSidebarStudioActionProgress,
  type SidebarStudioActionProgressView,
} from '@/lib/sidebarStudioActionProgress';
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
  const text = error.trim();
  if (!text) {
    return 'Studio could not complete this request. The repair workflow is still available from the card actions.';
  }
  if (text.includes('model_not_supported') || text.includes('The requested model is not supported')) {
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

const TABS: { id: SidebarTab; label: string; shortLabel: string; title: string; icon: LucideIcon }[] =
  [
    {
      id: 'create',
      label: 'Create with AI',
      shortLabel: 'Create',
      title: 'Create with AI — scaffold workspaces and projects',
      icon: Blocks,
    },
    {
      id: 'impact',
      label: 'Workspace Advisor',
      shortLabel: 'Advisor',
      title: 'Workspace Advisor — impact, dependencies, and release guidance',
      icon: Compass,
    },
    {
      id: 'studio',
      label: 'Studio',
      shortLabel: 'Studio',
      title: 'Studio — investigate, verify, and plan with evidence',
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
  const key = ['editor-issue', trigger || 'editor', filePath || fileName, languageId, diagnosticSignature || 'selection'].join('|');
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

function editorIssueSessionTitle(prefix: 'Fix' | 'Explain', issue: EditorIssueSessionInput): string {
  const file = issue.fileName || basenameFromPath(issue.filePath) || 'editor issue';
  return `${prefix} ${file}`;
}

type StudioPatchReviewState = {
  summary?: string;
  riskSummary?: string;
  patches: SidebarPatchReviewItem[];
};

const STUDIO_MODES: { id: StudioMode; label: string; title: string; icon: LucideIcon }[] = [
  { id: 'investigate', label: 'Detect', title: 'Detect issues and evidence gaps', icon: Search },
  {
    id: 'verify',
    label: 'Verify',
    title: 'Verify gates and release readiness',
    icon: CheckCircle2,
  },
  { id: 'prepare', label: 'Plan', title: 'Prepare a safe action plan', icon: ListChecks },
];

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
      failReason: typeof entry.failReason === 'string' ? entry.failReason : undefined,
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
  verifyFailures?: Record<string, StudioVerifyFailureView>;
  returnStates?: Record<string, SidebarStudioReturnState>;
  rollbackCommands?: Record<string, string>;
  patchReviews?: Record<string, StudioPatchReviewState>;
};

type SecondarySidebarPersistedState = {
  workspaiStudioRepair?: StudioRepairPersistedState;
};

function loadStudioRepairPersistedState(): StudioRepairPersistedState {
  const state = vscode.getState() as SecondarySidebarPersistedState | undefined;
  return state?.workspaiStudioRepair ?? {};
}

function persistStudioRepairState(state: StudioRepairPersistedState): void {
  const current = (vscode.getState() ?? {}) as SecondarySidebarPersistedState;
  vscode.setState({
    ...current,
    workspaiStudioRepair: state,
  });
}

/**
 * React secondary-sidebar (roadmap 2.11). Hosts the Create / Advisor / Studio
 * tabs on the same React stack + `ws-*` tokens as the dashboard. Create (2.11d)
 * and Advisor (2.11e) are ported; Studio is migrated in 2.11f.
 */
export function SecondarySidebar() {
  const persistedStudioRepairState = useMemo(() => loadStudioRepairPersistedState(), []);
  const [activeTab, setActiveTab] = useState<SidebarTab>('create');
  const [scope, setScope] = useState<SidebarScope>({});
  const [models, setModels] = useState<SidebarModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const [createMessages, setCreateMessages] = useState<CreateMessage[]>([]);
  const [createBusy, setCreateBusy] = useState(false);
  const [createDrawerFocus, setCreateDrawerFocus] = useState<{
    drawer: CreateDrawerId;
    key: number;
  } | null>(null);

  const impact = useChatSessions('workspaiImpact', 'impact');
  const studio = useChatSessions('workspaiStudio', 'studio');
  const [studioMode, setStudioMode] = useState<StudioMode>('investigate');
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
  const [studioReturnState, setStudioReturnState] = useState<SidebarStudioReturnState | null>(null);
  const [studioActionProgress, setStudioActionProgress] =
    useState<SidebarStudioActionProgressView | null>(null);
  const [advisorActionFailure, setAdvisorActionFailure] = useState<{
    title: string;
    summary: string;
    nextAction?: string;
  } | null>(null);

  useEffect(() => {
    persistStudioRepairState({
      handoffs: studioIncidentHandoffs,
      plans: studioIncidentPlans,
      progress: studioIncidentProgress,
      verifyFailures: studioIncidentVerifyFailures,
      returnStates: studioIncidentReturnStates,
      rollbackCommands: studioIncidentRollbackCommands,
      patchReviews: studioIncidentPatchReviews,
    });
  }, [
    studioIncidentHandoffs,
    studioIncidentPatchReviews,
    studioIncidentPlans,
    studioIncidentProgress,
    studioIncidentReturnStates,
    studioIncidentRollbackCommands,
    studioIncidentVerifyFailures,
  ]);
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
  const handleSubmitStudioRef = useRef<
    (task: string, options?: { forceNew?: boolean }) => void
  >(() => undefined);
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
        projectName: incidentScope.projectName,
        projectPath: incidentScope.projectPath,
        cardId: handoff.cardId,
        cardLabel: handoff.cardLabel,
        cardStatus: handoff.cardStatus,
        scope: handoff.scope,
        blockers: handoff.blockers,
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
    const id = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : studio.activeId;
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
      resolveStudioIncidentKeyForCard(data.cardId) ??
      resolveStudioIncidentKeyForSession(data.sessionId)
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

  const appendCreate = (message: CreateMessage) => {
    setCreateMessages((prev) => [...prev, message]);
  };
  const dropThinking = () => {
    setCreateMessages((prev) => prev.filter((m) => m.kind !== 'thinking'));
  };

  useSidebarMessages(({ command, data }) => {
    switch (command) {
      case 'sidebarActivateTab': {
        const tab = data.tab === 'impact' || data.tab === 'studio' ? data.tab : 'create';
        setActiveTab(tab as SidebarTab);
        const nextScope =
          data.workspace || data.project ? resolveScopeFromPayload(data) : scope;
        if (data.workspace || data.project) {
          setScope(nextScope);
        } else {
          vscode.postMessage('sidebarRefreshScope', {}, META);
        }
        const initialQuestion =
          typeof data.initialQuestion === 'string' ? data.initialQuestion.trim() : '';
        const initialTask =
          typeof data.initialTask === 'string' ? data.initialTask.trim() : '';
        const composerHandoff =
          data.composerHandoff === 'submit' ? 'submit' : 'prefill';
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
              mode: data.studioMode === 'verify' || data.studioMode === 'prepare' ? data.studioMode : 'investigate',
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
          const incidentKey = openStudioIncidentSession(activatedHandoff, incidentScope);
          setBlockerHandoff(activatedHandoff);
          setStudioFixApplied(false);
          startStudioActionProgress(
            {
              action: 'refresh-remediation-plan',
              status: 'running',
              phase: 'reading-evidence',
              title: 'Reading repair evidence',
              summary: 'I am matching this card to the latest source evidence and npm repair plan.',
            },
            incidentKey
          );
          vscode.postMessage(
            'sidebarStudioAction',
            {
              action: 'refresh-remediation-plan',
              sessionId: pendingStudioIncidentSessionRef.current ?? undefined,
              scope: scopePayloadFromScope(incidentScope),
              blockerHandoff: activatedHandoff,
            },
            META
          );
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
        setSelectedModelId(resolveSelectedModelId(data.preferredModel));
        break;

      // ---- Create ----
      case 'sidebarAiCreateThinking':
        dropThinking();
        appendCreate({
          id: nextId(),
          role: 'ai',
          kind: 'thinking',
          label: (data.label as string) || 'Thinking...',
        });
        break;
      case 'sidebarAiCreatePlan': {
        dropThinking();
        setCreateBusy(false);
        const plan = (data.plan as CreationPlan) || null;
        if (plan) {
          appendCreate({
            id: nextId(),
            role: 'ai',
            kind: 'plan',
            plan,
            planSource:
              data.planSource === 'llm' || data.planSource === 'heuristic'
                ? data.planSource
                : undefined,
          });
        }
        break;
      }
      case 'sidebarAiCreateProgress':
        dropThinking();
        appendCreate({
          id: nextId(),
          role: 'ai',
          kind: 'progress',
          title: (data.title as string) || 'Working',
          detail: (data.detail as string) || '',
        });
        break;
      case 'sidebarAiCreateDone':
        dropThinking();
        setCreateBusy(false);
        appendCreate({
          id: nextId(),
          role: 'ai',
          kind: 'done',
          workspacePath: data.workspacePath as string | undefined,
          projects: (data.projects as CreatedProject[]) || [],
        });
        break;
      case 'sidebarAiCreateError':
        dropThinking();
        setCreateBusy(false);
        appendCreate({
          id: nextId(),
          role: 'ai',
          kind: 'error',
          error: (data.error as string) || 'Unknown error',
          unsupportedStack: Boolean(data.unsupportedStack),
        });
        break;
      case 'sidebarManualCreateResult': {
        dropThinking();
        setCreateBusy(false);
        if (data.status === 'done') {
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
          appendCreate({
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
          });
        } else {
          appendCreate({
            id: nextId(),
            role: 'ai',
            kind: 'error',
            error: (data.error as string) || 'Unknown error',
          });
        }
        break;
      }

      // ---- Workspace Advisor ----
      case 'sidebarImpactScope':
        if (data.scopeMode !== 'none') {
          setScope(resolveScopeFromPayload(data));
        }
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
        impact.failSession(
          String(data.sessionId ?? ''),
          (data.error as string) || 'Unknown error'
        );
        break;

      // ---- Studio ----
      case 'sidebarStudioScope':
        if (data.scopeMode !== 'none') {
          setScope(resolveScopeFromPayload(data));
        }
        break;
      case 'sidebarStudioChunk':
        studio.appendChunk(String(data.sessionId ?? ''), (data.text as string) || '');
        break;
      case 'sidebarStudioDone':
        studio.finishStreaming(
          String(data.sessionId ?? ''),
          data.modelId as string | undefined,
          data.answer as string | undefined
        );
        break;
      case 'sidebarStudioError':
        studio.failSession(
          String(data.sessionId ?? ''),
          humanizeStudioError((data.error as string) || 'Unknown error')
        );
        setStudioAutoFixBusy(false);
        break;
      case 'sidebarBlockerHandoff': {
        const nextHandoff = parseStudioBlockerHandoffView(data.handoff);
        if (nextHandoff) {
          const incidentScope = scopeFromHandoff(nextHandoff, scope);
          setScope(incidentScope);
          openStudioIncidentSession(nextHandoff, incidentScope);
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
        if (advisorHandoff) {
          const incidentScope = scopeFromHandoff(advisorHandoff, scope);
          setScope(incidentScope);
          openStudioIncidentSession(advisorHandoff, incidentScope);
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
          lastActionTitle:
            data.cardStatus === 'pass' ? 'Fix applied and verified' : 'Fix applied',
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
          const refreshedKey = openStudioIncidentSession(nextHandoff);
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
            repairStatus: nextHandoff.cardStatus === 'pass' ? 'done' : 'ready',
            lastActionTitle:
              nextHandoff.cardStatus === 'pass'
                ? 'Card verified'
                : nextReturnState?.title ?? 'Card refreshed',
            lastActionSummary:
              nextHandoff.cardStatus === 'pass'
                ? 'The latest evidence reports this card as passing.'
                : nextReturnState?.detail ?? 'Studio refreshed the card evidence.',
            lastActionAt: new Date().toISOString(),
          });
          if (nextHandoff.cardStatus === 'pass') {
            setStudioVerifyFailure(null);
            setStudioIncidentVerifyFailures((prev) => {
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
          const nextFailure = parseStudioActionFailure(data);
          const nextProgress = parseSidebarStudioActionProgress(data);
          const progressIncidentKey = resolveStudioIncidentKeyForEvent(data);
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
          }
          if (progressIncidentKey && nextProgress) {
            setStudioIncidentProgress((prev) => ({ ...prev, [progressIncidentKey]: nextProgress }));
            updateStudioIncidentRepairState(progressIncidentKey, {
              repairStatus: nextProgress.status === 'done' ? 'done' : nextProgress.status,
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
  const handleSubmitPrompt = (prompt: string, stackFocus: string) => {
    appendCreate({ id: nextId(), role: 'user', kind: 'text', text: prompt });
    setCreateBusy(true);
    vscode.postMessage(
      'sidebarAiCreatePlan',
      {
        prompt,
        modelId: selectedModelId ?? undefined,
        stackFocus,
        scope: scope.workspacePath ? { workspacePath: scope.workspacePath } : undefined,
      },
      META
    );
  };

  const handleApprovePlan = (plan: CreationPlan) => {
    setCreateMessages((prev) =>
      prev.map((m) => (m.kind === 'plan' ? { ...m, resolved: true } : m))
    );
    setCreateBusy(true);
    vscode.postMessage('sidebarAiCreateConfirm', { plan }, META);
  };

  const handleRevisePlan = () => {
    setCreateMessages((prev) =>
      prev.map((m) => (m.kind === 'plan' ? { ...m, resolved: true } : m))
    );
  };

  const handleManualCreate = (
    input: ManualWorkspaceInput | { mode: 'project'; name: string; framework: string }
  ) => {
    if ('mode' in input) {
      appendCreate({
        id: nextId(),
        role: 'user',
        kind: 'text',
        text: `Create project "${input.name}" with ${frameworkLabel(input.framework)}`,
      });
      setCreateBusy(true);
      vscode.postMessage(
        'sidebarManualCreate',
        {
          mode: 'project',
          name: input.name,
          framework: input.framework,
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
    appendCreate({
      id: nextId(),
      role: 'user',
      kind: 'text',
      text: `Create workspace "${input.name}" (${input.profile})`,
    });
    setCreateBusy(true);
    vscode.postMessage(
      'sidebarManualCreate',
      {
        mode: 'workspace',
        name: input.name,
        profile: input.profile,
        installMethod: input.installMethod,
        initGit: input.initGit,
        policyMode: input.policyMode,
        dependencySharing: input.dependencySharing,
      },
      META
    );
  };

  const handleFocusView = (target: 'workspaces' | 'projects') => {
    vscode.postMessage('sidebarFocusView', { target }, META);
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
    if (
      !scope.workspaceName &&
      !scope.workspacePath &&
      !scope.projectName &&
      !scope.projectPath
    ) {
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
    const activeImpactSession =
      impact.sessions.find((session) => session.sessionId === impact.activeId) ?? null;
    const { sessionId, history } = impact.startQuery(question, undefined, {
      ...options,
      scope: activeImpactSession?.editorIssue ? null : sessionScopeSnapshot,
    });
    const sessionForPayload =
      activeImpactSession ??
      impact.sessions.find((session) => session.sessionId === sessionId) ??
      null;
    vscode.postMessage(
      'sidebarImpactQuery',
      {
        question,
        sessionId,
        modelId: selectedModelId ?? undefined,
        history,
        scope: scopePayloadForSession(sessionForPayload, scope),
        scopeMode: sessionScopeMode(sessionForPayload),
        ...(sessionForPayload?.editorIssue ? { editorIssue: sessionForPayload.editorIssue } : {}),
      },
      META
    );
  };

  const activeImpact = impact.sessions.find((s) => s.sessionId === impact.activeId) ?? null;

  const advisorAction = (action: 'studio' | 'verify' | 'copy') => {
    if (action === 'studio') {
      setActiveTab('studio');
      if (activeImpact?.editorIssue) {
        const { firstSeenAt: _firstSeenAt, lastSeenAt: _lastSeenAt, ...editorIssue } =
          activeImpact.editorIssue;
        studio.openEditorSession({
          title: editorIssueSessionTitle('Fix', editorIssue),
          mode: 'investigate',
          editorIssue,
        });
      } else if (!activeImpact?.incident) {
        const scopedSession = activeImpact?.scope ?? sessionScopeSnapshot;
        if (scopedSession) {
          const {
            firstSeenAt: _firstSeenAt,
            lastSeenAt: _lastSeenAt,
            ...scopeSnapshot
          } = scopedSession;
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
    const lastUser = [...(activeImpact?.messages ?? [])]
      .reverse()
      .find((m) => m.role === 'user');
    const lastAssistant = [...(activeImpact?.messages ?? [])]
      .reverse()
      .find((m) => m.role === 'assistant');
    vscode.postMessage(
      'sidebarAdvisorAction',
      {
        action,
        sessionId: impact.activeId ?? undefined,
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
  const pendingStudioIncidentSession =
    pendingStudioIncidentSessionRef.current
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
    : studioActionProgress;
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
  const activeStudioFixPhase = resolveStudioFixPhase({
    handoff: activeBlockerHandoff,
    fixApplied: studioFixApplied,
    autoFixRunning: studioAutoFixBusy || studioPatchApplyBusy,
  });
  const hasActiveStudioRepairOutput = Boolean(
    activeStudioRemediationPlan ||
      activeStudioActionProgress ||
      activeStudioVerifyFailure ||
      activeStudioReturnState ||
      activeStudioRollbackCommand ||
      activeStudioPatchReview
  );
  const activeStudioUserTurnCount =
    activeStudio?.messages.filter((message) => message.role === 'user').length ?? 0;
  const showStudioStuckNudge =
    Boolean(activeBlockerHandoff) &&
    activeStudioUserTurnCount >= 3 &&
    !studioAutoFixBusy &&
    !studioPatchApplyBusy &&
    !activeStudioPatchReview &&
    activeStudioFixPhase !== 'done';

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
    setStudioActionProgress(progress);
    if (!incidentKey) {
      return;
    }
    setStudioIncidentProgress((prev) => ({ ...prev, [incidentKey]: progress }));
    updateStudioIncidentRepairState(incidentKey, {
      repairStatus: progress.status === 'done' ? 'done' : progress.status,
      lastActionTitle: progress.title,
      lastActionSummary: progress.summary,
      lastActionAt: new Date().toISOString(),
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
      summary: 'I am refreshing source evidence and the npm repair plan before choosing the next safe step.',
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
  const studioAutoFix = () => {
    if (!activeBlockerHandoff) {
      return;
    }
    setStudioAutoFixBusy(true);
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
        scope: scopePayload,
        blockerHandoff: activeBlockerHandoff,
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
      if (!activeStudioRemediationPlan || activeStudioRemediationPlan.freshness.verdict !== 'fresh') {
        refreshStudioRemediationPlan();
        return;
      }
      const nextStep =
        activeStudioRemediationPlan.visibleSteps.find((step) => step.canApply) ??
        activeStudioRemediationPlan.visibleSteps.find((step) => step.executable);
      if (!nextStep) {
        studioAutoFix();
        return;
      }
      if (nextStep.canApply) {
        studioApplyRemediationStep(nextStep.id);
        return;
      }
      if (nextStep.executable && nextStep.originalCommand) {
        runStudioRemediationCommand(nextStep.id, nextStep.originalCommand);
      }
    }
  };
  const studioApplyRemediationStep = (stepId: string) => {
    if (!activeBlockerHandoff) {
      return;
    }
    setStudioPatchApplyBusy(true);
    startStudioActionProgress({
      action: 'apply-remediation-step',
      status: 'running',
      phase: 'applying-remediation-step',
      title: 'Applying approved fix',
      summary: 'I am applying the approved file operation, then I will verify this card.',
    });
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'apply-remediation-step',
        stepId,
        sessionId: studio.activeId ?? undefined,
        scope: scopePayload,
        blockerHandoff: activeBlockerHandoff,
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
      { action: 'copy-command', commandText: activeStudioRollbackCommand, sessionId: studio.activeId ?? undefined },
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
    setSelectedModelId(id);
    vscode.postMessage('setPreferredModel', { modelId: id?.trim() || 'auto' }, META);
  };

  const refreshModels = () => {
    vscode.postMessage('sidebarRefreshModels', {}, META);
  };

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

      <CreateTab
        active={activeTab === 'create'}
        busy={createBusy}
        messages={createMessages}
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
        onBootstrapWorkspace={handleBootstrapCreatedWorkspace}
        onFocusView={handleFocusView}
      />

      <ChatTab
        active={activeTab === 'impact'}
        contextLabel="Workspace Advisor"
        placeholder="Ask with workspace context"
        scope={scope}
        sessions={impact.sessions}
        activeSessionId={impact.activeId}
        onNewSession={impact.newSession}
        onSelectSession={impact.selectSession}
        onDeleteSession={impact.deleteSession}
        suggestions={advisorSuggestions(scope)}
        onSubmit={handleSubmitImpact}
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={handleSelectModel}
        onRefreshModels={refreshModels}
        composerPrefill={impactPrefill}
        composerPrefillKey={impactPrefillKey}
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
          ) : null
        }
        footerActions={
          <>
            <button
              type="button"
              className="ws-sidebar__inline"
              onClick={() => advisorAction('studio')}
            >
              Send to Studio
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
        active={activeTab === 'studio'}
        contextLabel="Studio"
        placeholder={
          activeBlockerHandoff?.studioMode === 'FIX'
            ? 'Ask clarifying questions about the fix'
            : activeBlockerHandoff
              ? 'Review the blocker plan or ask for details'
              : 'Describe the issue or task'
        }
        scope={scope}
        sessions={studio.sessions}
        activeSessionId={studio.activeId}
        onNewSession={studio.newSession}
        onSelectSession={(id) => {
          studio.selectSession(id);
          const selected = studio.sessions.find((session) => session.sessionId === id);
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
            setStudioActionProgress(null);
            setStudioVerifyFailure(null);
            setStudioReturnState(null);
            setStudioRollbackCommand(null);
            setStudioPatchReview(null);
          }
        }}
        onDeleteSession={(id) => {
          const incidentKey = studio.sessions.find((session) => session.sessionId === id)?.incident?.key;
          studio.deleteSession(id);
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
        suggestions={studioSuggestions(studioMode, scope)}
        onSubmit={handleSubmitStudio}
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={handleSelectModel}
        onRefreshModels={refreshModels}
        composerPrefill={studioPrefill}
        composerPrefillKey={studioPrefillKey}
        onRunCommand={runStudioCommand}
        onCopyCommand={copyStudioCommand}
        chromeMode={activeBlockerHandoff ? 'repair' : 'default'}
        streamChrome={
          activeBlockerHandoff ? (
            <>
              <StudioBlockerChrome
                handoff={activeBlockerHandoff}
                phase={activeStudioFixPhase}
                autoFixBusy={studioAutoFixBusy || studioPatchApplyBusy}
                verifyFailure={activeStudioVerifyFailure}
                onAutoFix={studioAutoFix}
                onVerify={studioVerifyHandoff}
              />
              {!hasActiveStudioRepairOutput ? (
                <StudioRepairPrelude
                  handoff={activeBlockerHandoff}
                  busy={studioAutoFixBusy}
                  onRefreshEvidence={refreshStudioRemediationPlan}
                />
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
              {activeStudioActionProgress ? (
                <StudioActionProgress
                  progress={activeStudioActionProgress}
                  repairBubble={true}
                  onNextAction={handleStudioProgressNextAction}
                />
              ) : null}
              {showStudioStuckNudge ? (
                <div className="ws-sidebar__studio-nudge" role="note">
                  <strong>Ready for the next repair step</strong>
                  <span>
                    I can continue from this card evidence instead of adding more chat.
                  </span>
                  <div className="ws-sidebar__studio-nudge-actions">
                    <button type="button" className="ws-sidebar__inline" onClick={studioAutoFix}>
                      Continue fix
                    </button>
                    <button type="button" className="ws-sidebar__inline" onClick={studioVerifyHandoff}>
                      Verify
                    </button>
                  </div>
                </div>
              ) : null}
              <StudioRepairResult
                returnState={activeStudioReturnState}
                verifyFailure={activeStudioVerifyFailure}
                rollbackCommand={activeStudioRollbackCommand}
                onCopyRollback={studioCopyRollback}
                onBackToDashboard={openDashboardRepairFlow}
                onContinueRepair={() => handleStudioProgressNextAction('continue-remediation')}
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
          ) : null
        }
        headerChrome={
          !activeBlockerHandoff &&
          (
          studioAuditState ||
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
                  role={activeStudioReturnState.status === 'verified-refreshed' ? 'status' : 'alert'}
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
                      <small>
                        Refreshed {activeStudioReturnState.refreshedCardIds.join(', ')}
                      </small>
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
                  key={`${activeBlockerHandoff?.cardId ?? 'patch'}-${activeStudioPatchReview.patches.length}`}
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
        toolbar={
          <div className="ws-sidebar__mode-switch" role="group" aria-label="Studio mode">
            {STUDIO_MODES.map((mode) => {
              const Icon = mode.icon;
              const pressed = studioMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={pressed}
                  title={mode.title}
                  onClick={() => setStudioMode(mode.id)}
                >
                  <Icon size={12} strokeWidth={1.75} aria-hidden="true" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>
        }
        footerActions={
          <>
            <button type="button" className="ws-sidebar__inline" onClick={studioVerifyHandoff}>
              Run Verify
            </button>
            <button type="button" className="ws-sidebar__inline" onClick={studioCopyBrief}>
              Copy Brief
            </button>
          </>
        }
      />
    </div>
  );
}
