import { ClipboardCheck } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { EvidenceCardActions } from '@/components/EvidenceCardActions';
import { EvidenceCardLogDrawer } from '@/components/EvidenceCardLogDrawer';
import { EvidencePostureIcon } from '@/components/EvidencePostureIcon';
import { WorkspaiEmptyState } from '@/components/WorkspaiEmptyState';
import { buildDashboardEvidenceActionContract } from '@/lib/dashboardActionContract';
import type {
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
} from '@/lib/dashboardEvidence';
import { resolveEvidenceFreshness } from '@/lib/dashboardEvidence';
import {
  evidenceCardStatusLabelForWorkspace,
  effectiveCardBlockers,
  evidenceCardVisualTone,
  resolveWorkspaceProjectCountFromEvidence,
} from '@/lib/dashboardScaffoldEvidence';
import {
  buildEvidenceGuidedSteps,
  buildGuidedStepFocusCard,
  evidenceGuidedStepCards,
  type EvidenceGuidedStep,
} from '@/lib/dashboardEvidenceViewMode';
import { buildDashboardEvidenceBrief } from '@/lib/dashboardEvidenceBrief';
import { resolveEvidenceAttentionBucket } from '@/lib/evidenceAgentContext';
import { getDashboardCommandMeta } from '@/lib/dashboardCommandRegistry';
import type { DashboardOperateZone } from '@/lib/dashboardOperateZones';
import type { DashboardScopeDescriptor } from '@/lib/dashboardScope';
import { dashboardScopeDetail, dashboardScopeLabel } from '@/lib/dashboardScope';
import { resolveEvidenceProjectAttribution } from '@/lib/dashboardEvidenceProjectAttribution';
import {
  buildDashboardIncidentCopy,
  type DashboardIncidentCopy,
} from '@/lib/dashboardIncidentContract';
import { buildDashboardRepairCardCopy } from '@/lib/dashboardRepairCardCopy';

export type RepairMode = 'guided' | 'inspect' | 'audit';

export interface DashboardRepairFlowProps {
  evidence: DashboardEvidencePayload | null;
  hasWorkspace: boolean;
  hasProject?: boolean;
  scope: DashboardScopeDescriptor;
  workspace?: { path?: string; name?: string };
  pendingCardIds?: DashboardEvidenceCardId[];
  pendingRunCardIds?: DashboardEvidenceCardId[];
  pendingRefreshCardIds?: DashboardEvidenceCardId[];
  isEvidenceFullRefreshPending?: boolean;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidence: () => void;
  onRefreshEvidenceCard: (cardId: DashboardEvidenceCardId) => void;
  onAskStudioAboutCard: (card: DashboardEvidenceCard) => void;
  onSendEvidenceToCopilot: (card: DashboardEvidenceCard) => void;
  onCopyEvidenceAgentHandoff: (card: DashboardEvidenceCard) => void;
  onShowEvidenceOutput: () => void;
  onRevealArtifact: (artifactPath: string) => void;
  onOpenRunZone?: (zone: DashboardOperateZone) => void;
  onOpenProjectLifecycle?: () => void;
}

const MODE_LABELS: Record<RepairMode, string> = {
  guided: 'Priority',
  inspect: 'All issues',
  audit: 'Diagnostics',
};

const REPAIR_MODE_STORAGE_KEY = 'workspai.dashboard.repairMode';

function normalizeRepairMode(value: string | null | undefined): RepairMode | null {
  return value === 'guided' || value === 'inspect' || value === 'audit' ? value : null;
}

function storedRepairMode(): RepairMode | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return normalizeRepairMode(window.localStorage.getItem(REPAIR_MODE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function persistRepairMode(mode: RepairMode): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(REPAIR_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures; guided remains the safe runtime default.
  }
}

function initialRepairMode(): RepairMode {
  return storedRepairMode() ?? 'guided';
}

function isActionableCard(
  card: DashboardEvidenceCard,
  workspaceProjectCount: number | null
): boolean {
  const bucket = resolveEvidenceAttentionBucket(card, workspaceProjectCount);
  return bucket === 'blocked' || bucket === 'attention' || bucket === 'missing';
}

function cardPriority(card: DashboardEvidenceCard, workspaceProjectCount: number | null): number {
  const bucket = resolveEvidenceAttentionBucket(card, workspaceProjectCount);
  if (bucket === 'blocked') {
    return 0;
  }
  if (bucket === 'attention') {
    return 1;
  }
  if (bucket === 'missing') {
    return 2;
  }
  return 3;
}

export function selectRepairVisibleCards(
  cards: DashboardEvidenceCard[],
  activeCard: DashboardEvidenceCard | undefined,
  mode: RepairMode,
  workspaceProjectCount: number | null
): DashboardEvidenceCard[] {
  if (mode === 'audit') {
    return cards;
  }

  const blockedCards = cards.filter(
    (card) => resolveEvidenceAttentionBucket(card, workspaceProjectCount) === 'blocked'
  );
  if (mode === 'inspect') {
    return cards.slice(0, Math.max(8, blockedCards.length));
  }

  const visibleIds = new Set<DashboardEvidenceCardId>([
    ...(activeCard ? [activeCard.id] : []),
    ...blockedCards.map((card) => card.id),
    ...cards.slice(0, 3).map((card) => card.id),
  ]);
  return cards.filter((card) => visibleIds.has(card.id));
}

function chooseActiveCard(
  cards: DashboardEvidenceCard[],
  currentStep: EvidenceGuidedStep | undefined,
  evidence: DashboardEvidencePayload | null | undefined,
  preferredCard: DashboardEvidenceCard | undefined,
  workspaceProjectCount: number | null
): DashboardEvidenceCard | undefined {
  if (
    currentStep?.command === 'importProject' &&
    workspaceProjectCount === 0 &&
    (currentStep.state === 'attention' || currentStep.state === 'current')
  ) {
    const importFocus = buildGuidedStepFocusCard(currentStep);
    if (importFocus && isActionableCard(importFocus, workspaceProjectCount)) {
      return importFocus;
    }
  }

  if (preferredCard && isActionableCard(preferredCard, workspaceProjectCount)) {
    return preferredCard;
  }

  const currentStepCards = currentStep
    ? evidenceGuidedStepCards(currentStep, evidence ?? null)
    : [];
  const scoped = currentStepCards
    .filter((card) => isActionableCard(card, workspaceProjectCount))
    .sort(
      (a, b) => cardPriority(a, workspaceProjectCount) - cardPriority(b, workspaceProjectCount)
    );
  if (scoped[0]) {
    return scoped[0];
  }

  if (currentStep && (currentStep.state === 'attention' || currentStep.state === 'current')) {
    const stepFocus = buildGuidedStepFocusCard(currentStep);
    return stepFocus && isActionableCard(stepFocus, workspaceProjectCount) ? stepFocus : undefined;
  }

  return cards
    .filter((card) => isActionableCard(card, workspaceProjectCount))
    .sort(
      (a, b) => cardPriority(a, workspaceProjectCount) - cardPriority(b, workspaceProjectCount)
    )[0];
}

function statusTone(card: DashboardEvidenceCard, workspaceProjectCount: number | null): string {
  return evidenceCardVisualTone(card, workspaceProjectCount);
}

function statusLabel(card: DashboardEvidenceCard, workspaceProjectCount: number | null): string {
  return evidenceCardStatusLabelForWorkspace(card, workspaceProjectCount);
}

function postureForTone(tone: string): 'blocked' | 'attention' | 'healthy' {
  return tone === 'danger' ? 'blocked' : tone === 'good' ? 'healthy' : 'attention';
}

function activeRepairKicker(
  card: DashboardEvidenceCard,
  workspaceProjectCount: number | null
): string {
  if (card.status === 'missing') {
    return 'Active evidence gap';
  }
  const tone = statusTone(card, workspaceProjectCount);
  if (tone === 'warn') {
    return 'Active warning';
  }
  return 'Active blocker';
}

type RepairCardGroup = {
  id: string;
  label: string;
  detail: string;
  cards: DashboardEvidenceCard[];
};

function repairCardGroupLabel(
  card: DashboardEvidenceCard,
  workspaceProjectCount: number | null
): { id: string; label: string; detail: string } {
  const scope = card.scope === 'project' ? 'Project' : 'Workspace';
  const bucket = resolveEvidenceAttentionBucket(card, workspaceProjectCount);
  if (bucket === 'blocked') {
    return {
      id: 'blocked',
      label: `${scope} blockers`,
      detail: 'Issues that currently prevent verification or release',
    };
  }
  if (bucket === 'attention') {
    return {
      id: 'attention',
      label: `${scope} attention`,
      detail: 'Warnings that should be reviewed',
    };
  }
  return {
    id: 'missing',
    label: `${scope} missing`,
    detail: 'Evidence that has not been generated yet',
  };
}

function groupRepairCards(
  cards: DashboardEvidenceCard[],
  workspaceProjectCount: number | null
): RepairCardGroup[] {
  const groups = new Map<string, RepairCardGroup>();
  for (const card of cards) {
    const copy = repairCardGroupLabel(card, workspaceProjectCount);
    const key = `${card.scope}:${copy.id}`;
    const group = groups.get(key) ?? {
      id: key,
      label: copy.label,
      detail: copy.detail,
      cards: [],
    };
    group.cards.push(card);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function RepairModeToggle({
  mode,
  onChange,
}: {
  mode: RepairMode;
  onChange: (mode: RepairMode) => void;
}) {
  return (
    <label className="ws-view-select" title="Choose how much repair evidence to show">
      <span>Show</span>
      <select
        aria-label="Repair detail level"
        value={mode}
        onChange={(event) => onChange(event.target.value as RepairMode)}
      >
        {(['guided', 'inspect', 'audit'] as const).map((item) => (
          <option key={item} value={item}>
            {MODE_LABELS[item]}
          </option>
        ))}
      </select>
    </label>
  );
}

function isInteractiveKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')
  );
}

function groupTone(groupId: string): 'danger' | 'warn' | 'neutral' {
  if (groupId.includes('blocked')) {
    return 'danger';
  }
  if (groupId.includes('attention')) {
    return 'warn';
  }
  return 'neutral';
}

function RepairStackCard({
  card,
  evidence,
  workspace,
  workspaceProjectCount,
  pending,
  refreshPending = false,
  selected = false,
  onSelect,
  onRunCommand,
  onRefreshEvidenceCard,
  onAskStudioAboutCard,
  onSendEvidenceToCopilot,
  onCopyEvidenceAgentHandoff,
  onShowEvidenceOutput,
  onRevealArtifact,
}: {
  card: DashboardEvidenceCard;
  evidence: DashboardEvidencePayload | null;
  workspace?: { path?: string; name?: string };
  workspaceProjectCount: number | null;
  pending: boolean;
  refreshPending?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidenceCard: (cardId: DashboardEvidenceCardId) => void;
  onAskStudioAboutCard: (card: DashboardEvidenceCard) => void;
  onSendEvidenceToCopilot: (card: DashboardEvidenceCard) => void;
  onCopyEvidenceAgentHandoff: (card: DashboardEvidenceCard) => void;
  onShowEvidenceOutput: () => void;
  onRevealArtifact: (artifactPath: string) => void;
}) {
  const tone = statusTone(card, workspaceProjectCount);
  const actionContract = buildDashboardEvidenceActionContract(card, { workspace, evidence });
  const action = actionContract.commandAction;
  const blockers = effectiveCardBlockers(card, workspaceProjectCount);
  const bucket = resolveEvidenceAttentionBucket(card, workspaceProjectCount);
  const copy = buildDashboardRepairCardCopy({
    card,
    blockers,
    actionLabel: actionContract.commandLabel,
    blocking: bucket === 'blocked',
  });

  return (
    <article
      className={`repair-flow__card repair-flow__card--${tone}${selected ? ' is-selected' : ''}`}
    >
      <div className="repair-flow__card-head">
        <EvidencePostureIcon posture={postureForTone(tone)} size={20} />
        <button
          type="button"
          className="repair-flow__card-select"
          onClick={onSelect}
          disabled={!onSelect}
          title={onSelect ? `Focus ${card.label}` : undefined}
        >
          {card.label}
        </button>
        <span className={`repair-flow__status repair-flow__status--${tone}`}>
          {refreshPending
            ? 'Refreshing'
            : pending
              ? 'Running'
              : statusLabel(card, workspaceProjectCount)}
        </span>
      </div>
      <p className="repair-flow__card-issue">{copy.issue}</p>
      <small className="repair-flow__card-guidance">
        {copy.guidance}
        {copy.remainingFindingCount > 0
          ? ` ${copy.remainingFindingCount} more related finding${copy.remainingFindingCount === 1 ? '' : 's'}.`
          : ''}
      </small>
      <div className="repair-flow__card-actions">
        <EvidenceCardActions
          cardId={card.id}
          runLabel={actionContract.commandLabel}
          pending={pending}
          refreshPending={refreshPending}
          canRun={Boolean(action)}
          canRefresh
          showAgentActions
          compact
          studioVariant="ghost"
          primaryAction={actionContract.primaryAction}
          copyCommandText={action?.command}
          onRun={action ? () => onRunCommand(action.command, action.commandData) : undefined}
          onRefresh={onRefreshEvidenceCard}
          onAdvancedInspect={onShowEvidenceOutput}
          artifactLabel={actionContract.artifactLabel}
          artifactPath={actionContract.artifactPath}
          artifactState={actionContract.artifactState}
          onRevealArtifact={onRevealArtifact}
          onAskStudio={() => onAskStudioAboutCard(card)}
          onSendToCopilot={() => onSendEvidenceToCopilot(card)}
          onCopyAgentHandoff={() => onCopyEvidenceAgentHandoff(card)}
          executionChannel={actionContract.executionChannel}
        />
      </div>
    </article>
  );
}

function RepairMetricStrip({ brief }: { brief: ReturnType<typeof buildDashboardEvidenceBrief> }) {
  return (
    <div className="repair-flow__metrics" aria-label="Repair evidence counters">
      {brief.metrics.map((metric) => (
        <span
          key={metric.label}
          className={`repair-flow__metric repair-flow__metric--${metric.tone}`}
        >
          <strong>{metric.value}</strong>
          <span>{metric.label}</span>
        </span>
      ))}
    </div>
  );
}

function RepairIncidentSummary({ incident }: { incident: DashboardIncidentCopy }) {
  return (
    <dl className="repair-flow__incident-summary" aria-label="Incident summary">
      <div>
        <dt>Phase</dt>
        <dd>{incident.phaseLabel}</dd>
      </div>
      <div>
        <dt>Action</dt>
        <dd>{incident.primaryAction}</dd>
      </div>
      <div>
        <dt>Verify</dt>
        <dd>{incident.verifyLabel}</dd>
      </div>
      <div>
        <dt>Audit</dt>
        <dd>{incident.auditLabel}</dd>
      </div>
    </dl>
  );
}

function RepairActiveCard({
  card,
  evidence,
  workspace,
  workspaceProjectCount,
  pending,
  refreshPending = false,
  fallbackStepCommand,
  fallbackStepCommandLabel,
  mode,
  onRunCommand,
  onRefreshEvidenceCard,
  onAskStudioAboutCard,
  onSendEvidenceToCopilot,
  onCopyEvidenceAgentHandoff,
  onShowEvidenceOutput,
  onRevealArtifact,
  onOpenProjectLifecycle,
}: {
  card: DashboardEvidenceCard;
  evidence: DashboardEvidencePayload | null;
  workspace?: { path?: string; name?: string };
  workspaceProjectCount: number | null;
  pending: boolean;
  refreshPending?: boolean;
  fallbackStepCommand?: string;
  fallbackStepCommandLabel?: string;
  mode: RepairMode;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidenceCard: (cardId: DashboardEvidenceCardId) => void;
  onAskStudioAboutCard: (card: DashboardEvidenceCard) => void;
  onSendEvidenceToCopilot: (card: DashboardEvidenceCard) => void;
  onCopyEvidenceAgentHandoff: (card: DashboardEvidenceCard) => void;
  onShowEvidenceOutput: () => void;
  onRevealArtifact: (artifactPath: string) => void;
  onOpenProjectLifecycle?: () => void;
}) {
  const actionContract = buildDashboardEvidenceActionContract(card, { workspace, evidence });
  const action = actionContract.commandAction;
  const runLabel = action?.label ?? fallbackStepCommandLabel ?? actionContract.commandLabel;
  const canRun = Boolean(action || fallbackStepCommand);
  const freshness = resolveEvidenceFreshness(card);
  const blockers = effectiveCardBlockers(card, workspaceProjectCount);
  const projectAttribution = resolveEvidenceProjectAttribution(card, evidence);
  const tone = statusTone(card, workspaceProjectCount);
  const bucket = resolveEvidenceAttentionBucket(card, workspaceProjectCount);
  const incident = buildDashboardIncidentCopy({ card, contract: actionContract });
  const copy = buildDashboardRepairCardCopy({
    card,
    blockers,
    actionLabel: runLabel,
    blocking: bucket === 'blocked',
  });
  const runPrimaryAction = () => {
    if (action) {
      onRunCommand(action.command, action.commandData);
      return;
    }
    if (fallbackStepCommand) {
      onRunCommand(
        fallbackStepCommand,
        workspace?.path ? { workspacePath: workspace.path } : undefined
      );
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' || isInteractiveKeyboardTarget(event.target) || !canRun) {
      return;
    }
    event.preventDefault();
    runPrimaryAction();
  };

  return (
    <section
      className={`repair-flow__active repair-flow__active--${tone}`}
      aria-label="Active repair item"
      aria-keyshortcuts="Enter"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="repair-flow__active-head">
        <span className="repair-flow__active-identity">
          <EvidencePostureIcon posture={postureForTone(tone)} size={22} />
          <span className="ws-kicker">{activeRepairKicker(card, workspaceProjectCount)}</span>
        </span>
        <span className={`repair-flow__status repair-flow__status--${tone}`}>
          {refreshPending
            ? 'Refreshing'
            : pending
              ? 'Running'
              : statusLabel(card, workspaceProjectCount)}
        </span>
      </div>

      <div className="repair-flow__active-main">
        <h3>{card.label}</h3>
        <p className="repair-flow__active-issue">{copy.issue}</p>
        <small className="repair-flow__active-guidance">
          {copy.guidance}
          {copy.remainingFindingCount > 0
            ? ` ${copy.remainingFindingCount} more related finding${copy.remainingFindingCount === 1 ? '' : 's'}.`
            : ''}
        </small>
        <div className="repair-flow__active-meta">
          <small>
            {freshness.label} · {freshness.detail}
          </small>
          {projectAttribution ? (
            <button
              type="button"
              className="repair-flow__project-link"
              onClick={onOpenProjectLifecycle}
              disabled={!onOpenProjectLifecycle}
              title={`Open Project lifecycle for ${projectAttribution.label}`}
            >
              Project · {projectAttribution.label}
            </button>
          ) : null}
        </div>
        {mode !== 'guided' ? (
          <details className="repair-flow__technical">
            <summary>
              Technical details{blockers.length > 0 ? ` · ${blockers.length} findings` : ''}
            </summary>
            {blockers.length > 0 ? (
              <ul className="repair-flow__blocker-list" aria-label="Technical findings">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : null}
            <RepairIncidentSummary incident={incident} />
          </details>
        ) : null}
      </div>

      <div className="repair-flow__active-actions">
        <EvidenceCardActions
          cardId={card.id}
          runLabel={runLabel}
          pending={pending}
          refreshPending={refreshPending}
          canRun={canRun}
          canRefresh
          showAgentActions
          studioVariant="ghost"
          primaryAction={actionContract.primaryAction}
          copyCommandText={action?.command ?? fallbackStepCommand}
          artifactLabel={actionContract.artifactLabel}
          artifactPath={actionContract.artifactPath}
          artifactState={actionContract.artifactState}
          executionChannel={actionContract.executionChannel}
          onRun={canRun ? runPrimaryAction : undefined}
          onRefresh={onRefreshEvidenceCard}
          onAdvancedInspect={onShowEvidenceOutput}
          onRevealArtifact={onRevealArtifact}
          onAskStudio={() => onAskStudioAboutCard(card)}
          onSendToCopilot={() => onSendEvidenceToCopilot(card)}
          onCopyAgentHandoff={() => onCopyEvidenceAgentHandoff(card)}
        />
        {mode === 'audit' ? (
          <EvidenceCardLogDrawer
            card={card}
            activity={evidence?.activity}
            onOpenOutputChannel={onShowEvidenceOutput}
            onRevealArtifact={onRevealArtifact}
          />
        ) : null}
      </div>
    </section>
  );
}

export function DashboardRepairFlow({
  evidence,
  hasWorkspace,
  hasProject = false,
  scope,
  workspace,
  pendingCardIds = [],
  pendingRunCardIds = pendingCardIds,
  pendingRefreshCardIds = [],
  onRunCommand,
  onRefreshEvidence,
  onRefreshEvidenceCard,
  onAskStudioAboutCard,
  onSendEvidenceToCopilot,
  onCopyEvidenceAgentHandoff,
  onShowEvidenceOutput,
  onRevealArtifact,
  onOpenRunZone,
  onOpenProjectLifecycle,
}: DashboardRepairFlowProps) {
  const [mode, setMode] = useState<RepairMode>(initialRepairMode);
  const [selectedCardId, setSelectedCardId] = useState<DashboardEvidenceCardId | null>(null);
  const cards = evidence?.cards ?? [];
  const workspaceProjectCount = resolveWorkspaceProjectCountFromEvidence(evidence);
  const steps = buildEvidenceGuidedSteps({ evidence, hasProject });
  const brief = buildDashboardEvidenceBrief({ evidence, hasWorkspace, hasProject });
  const actionableCards = useMemo(
    () =>
      cards
        .filter((card) => isActionableCard(card, workspaceProjectCount))
        .sort(
          (a, b) => cardPriority(a, workspaceProjectCount) - cardPriority(b, workspaceProjectCount)
        ),
    [cards, workspaceProjectCount]
  );
  const selectedCard = selectedCardId
    ? actionableCards.find((card) => card.id === selectedCardId)
    : undefined;
  const activeCard = chooseActiveCard(
    cards,
    brief.currentStep,
    evidence,
    selectedCard ?? brief.primaryCard,
    workspaceProjectCount
  );
  const stepCommand = brief.currentStep?.command;
  const stepCommandLabel = stepCommand ? getDashboardCommandMeta(stepCommand)?.label : undefined;
  const visibleCards = selectRepairVisibleCards(
    actionableCards,
    activeCard,
    mode,
    workspaceProjectCount
  );
  const queueCards = visibleCards.filter((card) => card.id !== activeCard?.id);
  const queueGroups = mode === 'inspect' ? groupRepairCards(queueCards, workspaceProjectCount) : [];
  const pendingActiveRun = activeCard ? pendingRunCardIds.includes(activeCard.id) : false;
  const pendingActiveRefresh = activeCard ? pendingRefreshCardIds.includes(activeCard.id) : false;
  const handleRepairModeChange = (nextMode: RepairMode) => {
    setMode(nextMode);
    persistRepairMode(nextMode);
  };
  const overviewSummary = activeCard
    ? `${actionableCards.length} item${actionableCards.length === 1 ? '' : 's'} need action. Start with ${activeCard.label}.`
    : 'No repair item is currently active.';

  useEffect(() => {
    if (selectedCardId && !actionableCards.some((card) => card.id === selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [actionableCards, selectedCardId]);

  if (!hasWorkspace) {
    return (
      <WorkspaiEmptyState
        icon={<ClipboardCheck size={18} />}
        title="No workspace selected"
        description={
          <>
            Repair flow unlocks after you create, import, or switch to a workspace. Doctor, analyze,
            readiness, and verify stay scoped to a real workspace target.
          </>
        }
      />
    );
  }

  return (
    <section className="repair-flow" aria-label="Repair command center">
      <div className={`repair-flow__decision repair-flow__decision--${brief.posture}`}>
        <div className="repair-flow__decision-copy">
          <span className="ws-kicker">Workspace repair</span>
          <h3>{brief.label}</h3>
          <p>{overviewSummary}</p>
          <small className="repair-flow__scope">
            {dashboardScopeLabel(scope)} · {dashboardScopeDetail(scope, { showPaths: false })}
          </small>
        </div>
        <div className="repair-flow__decision-tools">
          <RepairMetricStrip brief={brief} />
          <RepairModeToggle mode={mode} onChange={handleRepairModeChange} />
        </div>
      </div>

      {activeCard ? (
        <RepairActiveCard
          card={activeCard}
          evidence={evidence}
          workspace={workspace}
          workspaceProjectCount={workspaceProjectCount}
          pending={pendingActiveRun}
          refreshPending={pendingActiveRefresh}
          fallbackStepCommand={stepCommand}
          fallbackStepCommandLabel={stepCommandLabel}
          mode={mode}
          onRunCommand={onRunCommand}
          onRefreshEvidenceCard={onRefreshEvidenceCard}
          onAskStudioAboutCard={onAskStudioAboutCard}
          onSendEvidenceToCopilot={onSendEvidenceToCopilot}
          onCopyEvidenceAgentHandoff={onCopyEvidenceAgentHandoff}
          onShowEvidenceOutput={onShowEvidenceOutput}
          onRevealArtifact={onRevealArtifact}
          onOpenProjectLifecycle={onOpenProjectLifecycle}
        />
      ) : (
        <section className="repair-flow__active repair-flow__active--clear">
          <div className="repair-flow__active-head">
            <span className="ws-kicker">Active blocker</span>
          </div>
          <EvidencePostureIcon posture="healthy" size={24} />
          <h3>No active blocker.</h3>
          <p>
            Evidence is clear enough for the current path. Continue with verify or release checks.
          </p>
          <button
            type="button"
            className="ws-btn ws-btn--primary"
            onClick={() => (onOpenRunZone ? onOpenRunZone('governance') : onRefreshEvidence())}
          >
            Continue governance
          </button>
        </section>
      )}

      {queueCards.length > 0 ? (
        <section className="repair-flow__stack" aria-label="Evidence stack">
          <div className="repair-flow__section-head">
            <span className="ws-kicker">
              {mode === 'guided' ? 'Next blockers' : 'Evidence stack'}
            </span>
            <small>
              Showing {queueCards.length} of {Math.max(actionableCards.length - 1, 0)} queued cards
            </small>
          </div>
          {mode === 'inspect' ? (
            <div className="repair-flow__groups">
              {queueGroups.map((group, index) => (
                <details
                  key={group.id}
                  className={`repair-flow__group repair-flow__group--${groupTone(group.id)}`}
                  open={index === 0}
                >
                  <summary>
                    <span>
                      <strong>{group.label}</strong>
                      <small>{group.detail}</small>
                    </span>
                    <em>{group.cards.length}</em>
                  </summary>
                  <div className="repair-flow__stack-grid">
                    {group.cards.map((card) => (
                      <RepairStackCard
                        key={`${card.scope}-${card.id}`}
                        card={card}
                        evidence={evidence}
                        workspace={workspace}
                        workspaceProjectCount={workspaceProjectCount}
                        pending={pendingRunCardIds.includes(card.id)}
                        refreshPending={pendingRefreshCardIds.includes(card.id)}
                        selected={activeCard?.id === card.id}
                        onSelect={() => setSelectedCardId(card.id)}
                        onRunCommand={onRunCommand}
                        onRefreshEvidenceCard={onRefreshEvidenceCard}
                        onAskStudioAboutCard={onAskStudioAboutCard}
                        onSendEvidenceToCopilot={onSendEvidenceToCopilot}
                        onCopyEvidenceAgentHandoff={onCopyEvidenceAgentHandoff}
                        onShowEvidenceOutput={onShowEvidenceOutput}
                        onRevealArtifact={onRevealArtifact}
                      />
                    ))}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="repair-flow__stack-grid">
              {queueCards.map((card) => (
                <RepairStackCard
                  key={`${card.scope}-${card.id}`}
                  card={card}
                  evidence={evidence}
                  workspace={workspace}
                  workspaceProjectCount={workspaceProjectCount}
                  pending={pendingRunCardIds.includes(card.id)}
                  refreshPending={pendingRefreshCardIds.includes(card.id)}
                  selected={activeCard?.id === card.id}
                  onSelect={() => setSelectedCardId(card.id)}
                  onRunCommand={onRunCommand}
                  onRefreshEvidenceCard={onRefreshEvidenceCard}
                  onAskStudioAboutCard={onAskStudioAboutCard}
                  onSendEvidenceToCopilot={onSendEvidenceToCopilot}
                  onCopyEvidenceAgentHandoff={onCopyEvidenceAgentHandoff}
                  onShowEvidenceOutput={onShowEvidenceOutput}
                  onRevealArtifact={onRevealArtifact}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {mode === 'audit' && (evidence?.activity.length ?? 0) > 0 ? (
        <section className="repair-flow__audit" aria-label="Recent command history">
          <div className="repair-flow__section-head">
            <span className="ws-kicker">Recent command history</span>
            <button type="button" className="ws-btn ws-btn--ghost" onClick={onShowEvidenceOutput}>
              Open output
            </button>
          </div>
          <ol>
            {evidence!.activity.slice(0, 10).map((entry) => (
              <li key={entry.id}>
                <strong>{entry.label}</strong>
                <span>{entry.status}</span>
                <small>{entry.scope}</small>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
