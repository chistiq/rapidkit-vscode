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
import {
  StudioBlockerChrome,
  parseStudioBlockerHandoffView,
  resolveStudioFixPhase,
} from './StudioBlockerChrome';
import {
  StudioPatchReview,
  type SidebarPatchReviewItem,
} from './StudioPatchReview';
import { StudioShipLoopStepper } from './StudioShipLoopStepper';
import {
  mergeStudioFixAppliedIntoHandoff,
  shouldAwaitVerifyAfterStudioFixApplied,
  type StudioBlockerHandoffView,
} from '@/lib/studioBlockerHandoff';
import {
  buildSidebarStudioRetryAuditPayload,
  parseSidebarStudioAuditState,
  type SidebarStudioAuditState,
} from '@/lib/sidebarStudioAuditState';
import {
  parseStudioVerifyFailure,
  type StudioVerifyFailureView,
} from '@/lib/studioVerifyFailure';

const META = { source: 'workspai-sidebar-react', version: '1' } as const;

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `m${messageSeq}`;
}

function frameworkLabel(key: string): string {
  return FRAMEWORK_OPTIONS.find((option) => option.value === key)?.label ?? key;
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

/**
 * React secondary-sidebar (roadmap 2.11). Hosts the Create / Advisor / Studio
 * tabs on the same React stack + `ws-*` tokens as the dashboard. Create (2.11d)
 * and Advisor (2.11e) are ported; Studio is migrated in 2.11f.
 */
export function SecondarySidebar() {
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
  const [studioPatchReview, setStudioPatchReview] = useState<{
    summary?: string;
    riskSummary?: string;
    patches: SidebarPatchReviewItem[];
  } | null>(null);
  const [studioPatchApplyBusy, setStudioPatchApplyBusy] = useState(false);
  const [studioRollbackCommand, setStudioRollbackCommand] = useState<string | null>(null);
  const [studioAuditState, setStudioAuditState] = useState<SidebarStudioAuditState | null>(null);
  const [studioVerifyFailure, setStudioVerifyFailure] = useState<StudioVerifyFailureView | null>(
    null
  );
  const [shipLoopCards, setShipLoopCards] = useState<
    Array<{
      id: 'analyze' | 'verify-gates' | 'readiness' | 'archive' | 'autopilot';
      status: 'pass' | 'warn' | 'fail' | 'missing';
      summary?: string;
      blockers?: string[];
    }>
  >([]);
  const [shipLoopBusy, setShipLoopBusy] = useState(false);
  const handleSubmitImpactRef = useRef<
    (question: string, options?: { forceNew?: boolean }) => void
  >(() => undefined);
  const handleSubmitStudioRef = useRef<
    (task: string, options?: { forceNew?: boolean }) => void
  >(() => undefined);

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
        if (data.workspace || data.project) {
          setScope(resolveScopeFromPayload(data));
        } else {
          vscode.postMessage('sidebarRefreshScope', {}, META);
        }
        const initialQuestion =
          typeof data.initialQuestion === 'string' ? data.initialQuestion.trim() : '';
        const initialTask =
          typeof data.initialTask === 'string' ? data.initialTask.trim() : '';
        const composerHandoff =
          data.composerHandoff === 'submit' ? 'submit' : 'prefill';
        if (
          data.studioMode === 'verify' ||
          data.studioMode === 'prepare' ||
          data.studioMode === 'investigate'
        ) {
          setStudioMode(data.studioMode);
        }
        if (initialQuestion) {
          if (composerHandoff === 'submit') {
            handleSubmitImpactRef.current(initialQuestion, { forceNew: true });
          } else {
            impact.newSession();
            setImpactPrefill(initialQuestion);
            setImpactPrefillKey((key) => key + 1);
          }
        }
        if (initialTask) {
          if (composerHandoff === 'submit') {
            handleSubmitStudioRef.current(initialTask, { forceNew: true });
          } else {
            studio.newSession();
            setStudioPrefill(initialTask);
            setStudioPrefillKey((key) => key + 1);
          }
        }
        const activatedHandoff = parseStudioBlockerHandoffView(data.blockerHandoff);
        if (activatedHandoff) {
          setBlockerHandoff(activatedHandoff);
          setStudioFixApplied(false);
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
      case 'sidebarImpactScope':
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
          appendCreate({
            id: nextId(),
            role: 'ai',
            kind: 'manual-done',
            mode: data.mode === 'project' ? 'project' : 'workspace',
            name: typeof data.name === 'string' ? data.name : undefined,
            kit: typeof data.kit === 'string' ? data.kit : undefined,
            summary:
              typeof data.summary === 'string'
                ? data.summary
                : typeof data.name === 'string'
                  ? data.name
                  : 'Creation completed.',
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
        setScope(resolveScopeFromPayload(data));
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
          (data.error as string) || 'Unknown error'
        );
        setStudioAutoFixBusy(false);
        break;
      case 'sidebarBlockerHandoff': {
        const nextHandoff = parseStudioBlockerHandoffView(data.handoff);
        if (nextHandoff) {
          setBlockerHandoff(nextHandoff);
          setStudioFixApplied(false);
          setStudioPatchReview(null);
          setStudioVerifyFailure(null);
        }
        break;
      }
      case 'sidebarAdvisorStudioHandoff': {
        if (typeof data.prefill === 'string' && data.prefill.trim()) {
          studio.newSession();
          setStudioPrefill(data.prefill.trim());
          setStudioPrefillKey((key) => key + 1);
        }
        setActiveTab('studio');
        const advisorHandoff = parseStudioBlockerHandoffView(data.blockerHandoff);
        if (advisorHandoff) {
          setBlockerHandoff(advisorHandoff);
          setStudioFixApplied(false);
          setStudioVerifyFailure(null);
        }
        break;
      }
      case 'sidebarStudioFixApplied':
        setBlockerHandoff((current) => mergeStudioFixAppliedIntoHandoff(current, data));
        setStudioFixApplied(shouldAwaitVerifyAfterStudioFixApplied(data));
        if (data.cardStatus === 'pass') {
          setStudioVerifyFailure(null);
        }
        setStudioAutoFixBusy(false);
        setStudioPatchReview(null);
        setStudioPatchApplyBusy(false);
        if (typeof data.rollbackCommand === 'string' && data.rollbackCommand.trim()) {
          setStudioRollbackCommand(data.rollbackCommand.trim());
        }
        break;
      case 'sidebarStudioShipLoop':
        setShipLoopCards(parseSidebarShipLoopCards(data.cards));
        setShipLoopBusy(false);
        break;
      case 'sidebarStudioPatchReview':
        if (data.cleared === true) {
          setStudioPatchReview(null);
        } else {
          setStudioPatchReview({
            summary: typeof data.summary === 'string' ? data.summary : undefined,
            riskSummary: typeof data.riskSummary === 'string' ? data.riskSummary : undefined,
            patches: parseSidebarPatchReviewItems(data.patches),
          });
        }
        setStudioAutoFixBusy(false);
        setStudioPatchApplyBusy(false);
        break;
      case 'sidebarStudioCardRefreshed': {
        const nextHandoff = parseStudioBlockerHandoffView(data.handoff);
        if (nextHandoff) {
          setBlockerHandoff(nextHandoff);
          setStudioFixApplied(nextHandoff.cardStatus === 'pass' ? false : true);
          if (nextHandoff.cardStatus === 'pass') {
            setStudioVerifyFailure(null);
          }
        }
        break;
      }
      case 'sidebarStudioActionResult':
        if (data.action === 'verify-handoff') {
          setStudioVerifyFailure(parseStudioVerifyFailure(data));
        }
        if (data.action === 'auto-fix' || data.action === 'apply-patch') {
          setStudioAutoFixBusy(data.status === 'running');
          setStudioPatchApplyBusy(data.status === 'running' && data.action === 'apply-patch');
        }
        if (data.action === 'retry-audit') {
          setStudioAutoFixBusy(false);
          setStudioPatchApplyBusy(false);
        }
        if (data.action === 'ship-loop-step') {
          setShipLoopBusy(data.status === 'running');
        }
        break;
      case 'sidebarStudioAuditState':
        setStudioAuditState(parseSidebarStudioAuditState(data));
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
          scope: scope.workspacePath ? { workspacePath: scope.workspacePath } : undefined,
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

  // ---- Advisor handlers ----
  const scopePayload = useMemo(
    () => ({
      workspace: scope.workspacePath
        ? { name: scope.workspaceName, path: scope.workspacePath }
        : null,
      project: scope.projectPath ? { name: scope.projectName, path: scope.projectPath } : null,
    }),
    [scope]
  );

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
    resetImpactSession();
    resetStudioSession();
  }, [scopeKey, resetImpactSession, resetStudioSession]);

  const handleSubmitImpact = (question: string, options?: { forceNew?: boolean }) => {
    const { sessionId, history } = impact.startQuery(question, undefined, options);
    vscode.postMessage(
      'sidebarImpactQuery',
      {
        question,
        sessionId,
        modelId: selectedModelId ?? undefined,
        history,
        scope: scopePayload,
      },
      META
    );
  };

  const activeImpact = impact.sessions.find((s) => s.sessionId === impact.activeId) ?? null;

  const advisorAction = (action: 'studio' | 'verify' | 'copy') => {
    if (action === 'studio') {
      setActiveTab('studio');
    }
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
        scope: scopePayload,
        question: lastUser?.content,
        answer: lastAssistant?.content,
      },
      META
    );
  };

  // ---- Studio handlers ----
  const handleSubmitStudio = (task: string, options?: { forceNew?: boolean }) => {
    const { sessionId, history } = studio.startQuery(task, studioMode, options);
    vscode.postMessage(
      'sidebarStudioQuery',
      {
        task,
        sessionId,
        mode: studioMode,
        modelId: selectedModelId ?? undefined,
        history,
        scope: scopePayload,
        ...(blockerHandoff ? { blockerHandoff } : {}),
      },
      META
    );
  };

  handleSubmitImpactRef.current = handleSubmitImpact;
  handleSubmitStudioRef.current = handleSubmitStudio;

  const activeStudio = studio.sessions.find((s) => s.sessionId === studio.activeId) ?? null;

  const runStudioCommand = (command: string) => {
    vscode.postMessage(
      'sidebarStudioAction',
      { action: 'run-command', commandText: command, sessionId: studio.activeId ?? undefined, scope: scopePayload },
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
  const studioVerifyHandoff = () => {
    setStudioVerifyFailure(null);
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: blockerHandoff?.verifyCommand ? 'verify-handoff' : 'verify',
        sessionId: studio.activeId ?? undefined,
        scope: scopePayload,
        ...(blockerHandoff ? { blockerHandoff } : {}),
      },
      META
    );
  };
  const studioAutoFix = () => {
    if (!blockerHandoff) {
      return;
    }
    setStudioAutoFixBusy(true);
    setStudioPatchReview(null);
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'auto-fix',
        sessionId: studio.activeId ?? undefined,
        scope: scopePayload,
        blockerHandoff,
      },
      META
    );
  };
  const studioApplyPatches = (acceptedPaths: string[]) => {
    if (!blockerHandoff) {
      return;
    }
    setStudioPatchApplyBusy(true);
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'apply-patch',
        acceptedPaths,
        sessionId: studio.activeId ?? undefined,
        scope: scopePayload,
        blockerHandoff,
      },
      META
    );
  };
  const studioRejectPatches = () => {
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'reject-patch',
        sessionId: studio.activeId ?? undefined,
        ...(blockerHandoff ? { blockerHandoff } : {}),
      },
      META
    );
    setStudioPatchReview(null);
  };
  const studioRunShipLoopStep = (stepId: 'analyze' | 'verify-gates' | 'readiness' | 'archive') => {
    setShipLoopBusy(true);
    vscode.postMessage(
      'sidebarStudioAction',
      {
        action: 'ship-loop-step',
        stepId,
        sessionId: studio.activeId ?? undefined,
        scope: scopePayload,
      },
      META
    );
  };
  const studioCopyRollback = () => {
    if (!studioRollbackCommand) {
      return;
    }
    vscode.postMessage(
      'sidebarStudioAction',
      { action: 'copy-command', commandText: studioRollbackCommand, sessionId: studio.activeId ?? undefined },
      META
    );
  };
  const studioRetryAudit = () => {
    vscode.postMessage(
      'sidebarStudioAction',
      buildSidebarStudioRetryAuditPayload({
        sessionId: studio.activeId ?? undefined,
        scope: scopePayload,
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
        scope: scopePayload,
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
          blockerHandoff?.studioMode === 'FIX'
            ? 'Ask clarifying questions about the fix'
            : blockerHandoff
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
        }}
        onDeleteSession={studio.deleteSession}
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
        headerChrome={
          blockerHandoff ||
          studioAuditState ||
          studioPatchReview ||
          shipLoopCards.length > 0 ||
          studioRollbackCommand ? (
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
              {blockerHandoff ? (
                <StudioBlockerChrome
                  handoff={blockerHandoff}
                  phase={resolveStudioFixPhase({
                    handoff: blockerHandoff,
                    fixApplied: studioFixApplied,
                    autoFixRunning: studioAutoFixBusy,
                  })}
                  onAutoFix={studioAutoFix}
                  onVerify={studioVerifyHandoff}
                  autoFixBusy={studioAutoFixBusy}
                  verifyFailure={studioVerifyFailure}
                />
              ) : null}
              {studioPatchReview ? (
                <StudioPatchReview
                  key={`${blockerHandoff?.cardId ?? 'patch'}-${studioPatchReview.patches.length}`}
                  summary={studioPatchReview.summary}
                  riskSummary={studioPatchReview.riskSummary}
                  patches={studioPatchReview.patches}
                  busy={studioPatchApplyBusy}
                  onApply={studioApplyPatches}
                  onReject={studioRejectPatches}
                />
              ) : null}
              {studioRollbackCommand ? (
                <div className="ws-sidebar__studio-rollback" role="note">
                  <strong>Rollback available</strong>
                  <code>{studioRollbackCommand}</code>
                  <button type="button" className="ws-sidebar__inline" onClick={studioCopyRollback}>
                    Copy rollback
                  </button>
                </div>
              ) : null}
              {shipLoopCards.length > 0 ? (
                <StudioShipLoopStepper
                  cards={shipLoopCards}
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
