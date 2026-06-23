import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCheck,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EvidenceCardActions } from '@/components/EvidenceCardActions';
import { CommandExecutionBadge } from '@/components/CommandExecutionBadge';
import { EvidenceCardLogDrawer } from '@/components/EvidenceCardLogDrawer';
import {
  buildDashboardEvidenceActionContract,
  type DashboardEvidenceActionContract,
} from '@/lib/dashboardActionContract';
import type {
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
} from '@/lib/dashboardEvidence';
import { evidenceCardStatusLabel, resolveEvidenceFreshness } from '@/lib/dashboardEvidence';
import {
  buildEvidenceGuidedSteps,
  evidenceGuidedStepCards,
  type EvidenceGuidedStep,
  type EvidenceGuidedStepState,
} from '@/lib/dashboardEvidenceViewMode';
import { evidenceGuidedStepShortLabel } from '@/components/EvidenceGuidedPath';
import { buildDashboardEvidenceBrief } from '@/lib/dashboardEvidenceBrief';
import type { DashboardOperateZone } from '@/lib/dashboardOperateZones';
import type { DashboardScopeDescriptor } from '@/lib/dashboardScope';
import { dashboardScopeDetail, dashboardScopeLabel } from '@/lib/dashboardScope';
import { resolveEvidenceProjectAttribution } from '@/lib/dashboardEvidenceProjectAttribution';

type RepairMode = 'guided' | 'inspect' | 'audit';

interface DashboardRepairFlowProps {
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
  onShowEvidenceOutput: () => void;
  onRevealArtifact: (artifactPath: string) => void;
  onOpenRunZone?: (zone: DashboardOperateZone) => void;
  onOpenProjectLifecycle?: () => void;
}

const MODE_LABELS: Record<RepairMode, string> = {
  guided: 'Guided',
  inspect: 'Inspect',
  audit: 'Audit',
};

function isActionableCard(card: DashboardEvidenceCard): boolean {
  return card.status === 'fail' || card.status === 'warn' || card.status === 'missing';
}

function cardPriority(card: DashboardEvidenceCard): number {
  if (card.status === 'fail') {
    return 0;
  }
  if ((card.blockers?.length ?? 0) > 0) {
    return 1;
  }
  if (card.status === 'warn') {
    return 2;
  }
  if (card.status === 'missing') {
    return 3;
  }
  return 4;
}

function chooseActiveCard(
  cards: DashboardEvidenceCard[],
  currentStep?: EvidenceGuidedStep,
  evidence?: DashboardEvidencePayload | null,
  preferredCard?: DashboardEvidenceCard
): DashboardEvidenceCard | undefined {
  if (preferredCard && isActionableCard(preferredCard)) {
    return preferredCard;
  }

  const currentStepCards = currentStep
    ? evidenceGuidedStepCards(currentStep, evidence ?? null)
    : [];
  const scoped = currentStepCards
    .filter(isActionableCard)
    .sort((a, b) => cardPriority(a) - cardPriority(b));
  if (scoped[0]) {
    return scoped[0];
  }

  return cards.filter(isActionableCard).sort((a, b) => cardPriority(a) - cardPriority(b))[0];
}

function statusTone(card: DashboardEvidenceCard): string {
  if (card.status === 'fail' || (card.blockers?.length ?? 0) > 0) {
    return 'danger';
  }
  if (card.status === 'warn') {
    return 'warn';
  }
  if (card.status === 'pass') {
    return 'good';
  }
  return 'neutral';
}

type RepairCardGroup = {
  id: string;
  label: string;
  detail: string;
  cards: DashboardEvidenceCard[];
};

function repairCardGroupLabel(card: DashboardEvidenceCard): { label: string; detail: string } {
  const scope = card.scope === 'project' ? 'Project' : 'Workspace';
  if (card.status === 'fail') {
    return { label: `${scope} blockers`, detail: 'Failed evidence that blocks progress' };
  }
  if (card.status === 'warn') {
    return { label: `${scope} attention`, detail: 'Warnings that need review before release' };
  }
  return { label: `${scope} pending`, detail: 'Missing or stale evidence to refresh' };
}

function groupRepairCards(cards: DashboardEvidenceCard[]): RepairCardGroup[] {
  const groups = new Map<string, RepairCardGroup>();
  for (const card of cards) {
    const key = `${card.scope}:${card.status}`;
    const copy = repairCardGroupLabel(card);
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
    <div className="repair-flow__mode-toggle" role="tablist" aria-label="Repair view mode">
      {(['guided', 'inspect', 'audit'] as const).map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={mode === item}
          className={`repair-flow__mode ${mode === item ? 'is-active' : ''}`}
          onClick={() => onChange(item)}
        >
          {MODE_LABELS[item]}
        </button>
      ))}
    </div>
  );
}

function defaultRepairPathIndex(steps: EvidenceGuidedStep[]): number {
  const index = steps.findIndex((step) => step.state === 'attention' || step.state === 'current');
  return index >= 0 ? index : 0;
}

function RepairPathRailIcon({ state, index }: { state: EvidenceGuidedStepState; index: number }) {
  if (state === 'complete') {
    return (
      <span className="evidence-guided-path__rail-dot evidence-guided-path__rail-dot--complete">
        <Check size={10} strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (state === 'locked') {
    return (
      <span className="evidence-guided-path__rail-dot evidence-guided-path__rail-dot--locked">
        <Lock size={9} aria-hidden="true" />
      </span>
    );
  }
  if (state === 'attention') {
    return (
      <span className="evidence-guided-path__rail-dot evidence-guided-path__rail-dot--attention">
        <AlertTriangle size={9} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="evidence-guided-path__rail-dot evidence-guided-path__rail-dot--current">
      {index + 1}
    </span>
  );
}

function RepairPathRailItem({
  step,
  index,
  isActive,
  isLast,
  onSelect,
}: {
  step: EvidenceGuidedStep;
  index: number;
  isActive: boolean;
  isLast: boolean;
  onSelect: () => void;
}) {
  const locked = step.state === 'locked';

  return (
    <div className={`evidence-guided-path__rail-item${isLast ? ' is-last' : ''}`}>
      <button
        type="button"
        role="tab"
        className={`evidence-guided-path__rail-btn evidence-guided-path__rail-btn--${step.state}${isActive ? ' is-active' : ''}`}
        onClick={onSelect}
        disabled={locked}
        aria-selected={isActive}
        title={`${step.title}: ${step.detail}`}
      >
        <RepairPathRailIcon state={step.state} index={index} />
        <span className="evidence-guided-path__rail-label">
          {evidenceGuidedStepShortLabel(step)}
        </span>
      </button>
      {!isLast ? <span className="evidence-guided-path__rail-connector" aria-hidden="true" /> : null}
    </div>
  );
}

function RepairPath({
  steps,
  fixPathContract,
  fixPathPending = false,
  isRefreshingEvidence = false,
  onRunFixPath,
  onRefreshEvidence,
}: {
  steps: EvidenceGuidedStep[];
  fixPathContract?: DashboardEvidenceActionContract | null;
  fixPathPending?: boolean;
  isRefreshingEvidence?: boolean;
  onRunFixPath: () => void;
  onRefreshEvidence: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(() => defaultRepairPathIndex(steps));

  useEffect(() => {
    setActiveIndex(defaultRepairPathIndex(steps));
  }, [steps]);

  const completedCount = steps.filter((step) => step.state === 'complete').length;
  const fixPathAction = fixPathContract?.commandAction;
  const progressPct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <section className="repair-flow__path" aria-label="Repair path">
      <header className="repair-flow__path-head">
        <span className="ws-kicker">Repair path</span>
        <div className="repair-flow__path-head-trail">
          <span className="repair-flow__path-progress">
            {completedCount}/{steps.length} complete
          </span>
          {fixPathAction ? (
            <button
              type="button"
              className="ws-btn ws-btn--primary repair-flow__path-run"
              onClick={onRunFixPath}
              disabled={fixPathPending}
              aria-busy={fixPathPending || undefined}
            >
              <ArrowRight size={12} aria-hidden="true" />
              <span>{fixPathPending ? 'Running…' : 'Fix path'}</span>
              <CommandExecutionBadge channel={fixPathContract?.executionChannel} compact />
            </button>
          ) : (
            <button
              type="button"
              className="ws-btn ws-btn--ghost repair-flow__path-run"
              onClick={onRefreshEvidence}
              disabled={isRefreshingEvidence}
              aria-busy={isRefreshingEvidence || undefined}
            >
              <Activity
                size={12}
                aria-hidden="true"
                className={isRefreshingEvidence ? 'spinning' : undefined}
              />
              {isRefreshingEvidence ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>
      </header>

      <div
        className="repair-flow__path-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
        aria-label="Path completion"
      >
        <span className="repair-flow__path-track-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <nav className="repair-flow__path-rail evidence-guided-path__rail" aria-label="Evidence path steps">
        {steps.map((step, index) => (
          <RepairPathRailItem
            key={step.id}
            step={step}
            index={index}
            isActive={index === activeIndex}
            isLast={index === steps.length - 1}
            onSelect={() => setActiveIndex(index)}
          />
        ))}
      </nav>
    </section>
  );
}

function groupTone(groupId: string): 'danger' | 'warn' | 'neutral' {
  if (groupId.includes('fail')) {
    return 'danger';
  }
  if (groupId.includes('warn')) {
    return 'warn';
  }
  return 'neutral';
}

function RepairStackCard({
  card,
  evidence,
  workspace,
  pending,
  refreshPending = false,
  selected = false,
  onSelect,
  onRunCommand,
  onRefreshEvidenceCard,
  onAskStudioAboutCard,
  onSendEvidenceToCopilot,
  onRevealArtifact,
}: {
  card: DashboardEvidenceCard;
  evidence: DashboardEvidencePayload | null;
  workspace?: { path?: string; name?: string };
  pending: boolean;
  refreshPending?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidenceCard: (cardId: DashboardEvidenceCardId) => void;
  onAskStudioAboutCard: (card: DashboardEvidenceCard) => void;
  onSendEvidenceToCopilot: (card: DashboardEvidenceCard) => void;
  onRevealArtifact: (artifactPath: string) => void;
}) {
  const tone = statusTone(card);
  const actionContract = buildDashboardEvidenceActionContract(card, { workspace, evidence });
  const action = actionContract.commandAction;

  return (
    <article
      className={`repair-flow__card repair-flow__card--${tone}${selected ? ' is-selected' : ''}`}
    >
      <div className="repair-flow__card-head">
        <span className={`repair-flow__status repair-flow__status--${tone}`}>
          {refreshPending ? 'Refreshing' : pending ? 'Running' : evidenceCardStatusLabel(card)}
        </span>
        <button
          type="button"
          className="repair-flow__card-select"
          onClick={onSelect}
          disabled={!onSelect}
          title={onSelect ? `Focus ${card.label}` : undefined}
        >
          {card.label}
        </button>
      </div>
      <p className="repair-flow__card-summary">{card.summary || 'No summary available yet.'}</p>
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
          onRun={action ? () => onRunCommand(action.command, action.commandData) : undefined}
          onRefresh={onRefreshEvidenceCard}
          artifactLabel={actionContract.artifactLabel}
          artifactPath={actionContract.artifactPath}
          artifactState={actionContract.artifactState}
          onRevealArtifact={onRevealArtifact}
          onAskStudio={() => onAskStudioAboutCard(card)}
          onSendToCopilot={() => onSendEvidenceToCopilot(card)}
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

function RepairActionContract({ contract }: { contract: DashboardEvidenceActionContract }) {
  return (
    <dl className="repair-flow__contract" aria-label="Repair action contract">
      <div>
        <dt>Command</dt>
        <dd>{contract.commandLabel}</dd>
      </div>
      <div>
        <dt>Scope</dt>
        <dd>{contract.cardScope}</dd>
      </div>
      <div>
        <dt>Artifact</dt>
        <dd>{contract.artifactLabel}</dd>
      </div>
      <div>
        <dt>Handoff</dt>
        <dd>
          {contract.studioLabel} · {contract.copilotLabel}
        </dd>
      </div>
    </dl>
  );
}

function RepairActiveCard({
  card,
  evidence,
  workspace,
  pending,
  refreshPending = false,
  mode,
  onModeChange,
  onRunCommand,
  onRefreshEvidenceCard,
  onAskStudioAboutCard,
  onSendEvidenceToCopilot,
  onShowEvidenceOutput,
  onRevealArtifact,
  onOpenProjectLifecycle,
}: {
  card: DashboardEvidenceCard;
  evidence: DashboardEvidencePayload | null;
  workspace?: { path?: string; name?: string };
  pending: boolean;
  refreshPending?: boolean;
  mode: RepairMode;
  onModeChange: (mode: RepairMode) => void;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidenceCard: (cardId: DashboardEvidenceCardId) => void;
  onAskStudioAboutCard: (card: DashboardEvidenceCard) => void;
  onSendEvidenceToCopilot: (card: DashboardEvidenceCard) => void;
  onShowEvidenceOutput: () => void;
  onRevealArtifact: (artifactPath: string) => void;
  onOpenProjectLifecycle?: () => void;
}) {
  const actionContract = buildDashboardEvidenceActionContract(card, { workspace, evidence });
  const action = actionContract.commandAction;
  const freshness = resolveEvidenceFreshness(card);
  const blockers = card.blockers ?? [];
  const visibleBlockers = blockers.slice(0, 4);
  const hiddenBlockerCount = Math.max(blockers.length - visibleBlockers.length, 0);
  const projectAttribution = resolveEvidenceProjectAttribution(card, evidence);

  return (
    <section
      className={`repair-flow__active repair-flow__active--${statusTone(card)}`}
      aria-label="Active repair item"
    >
      <div className="repair-flow__active-head">
        <span className="ws-kicker">Active blocker</span>
        <div className="repair-flow__active-head-tools">
          <RepairModeToggle mode={mode} onChange={onModeChange} />
          <span className={`repair-flow__status repair-flow__status--${statusTone(card)}`}>
            {refreshPending ? 'Refreshing' : pending ? 'Running' : evidenceCardStatusLabel(card)}
          </span>
        </div>
      </div>

      <div className="repair-flow__active-main">
        <h3>{card.label}</h3>
        <p>{card.summary || 'No summary available yet.'}</p>
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
        {visibleBlockers.length > 0 ? (
          <ul className="repair-flow__blocker-list" aria-label="Blockers">
            {visibleBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
            {hiddenBlockerCount > 0 ? (
              <li className="repair-flow__blocker-more">{hiddenBlockerCount} more blocker(s)</li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className="repair-flow__active-actions">
        <EvidenceCardActions
          cardId={card.id}
          runLabel={action?.label ?? actionContract.commandLabel}
          pending={pending}
          refreshPending={refreshPending}
          canRun={Boolean(action)}
          canRefresh
          showAgentActions
          studioVariant="ghost"
          artifactLabel={actionContract.artifactLabel}
          artifactPath={actionContract.artifactPath}
          artifactState={actionContract.artifactState}
          executionChannel={actionContract.executionChannel}
          onRun={action ? () => onRunCommand(action.command, action.commandData) : undefined}
          onRefresh={onRefreshEvidenceCard}
          onRevealArtifact={onRevealArtifact}
          onAskStudio={() => onAskStudioAboutCard(card)}
          onSendToCopilot={() => onSendEvidenceToCopilot(card)}
        />
        <EvidenceCardLogDrawer
          card={card}
          activity={evidence?.activity}
          onOpenOutputChannel={onShowEvidenceOutput}
          onRevealArtifact={onRevealArtifact}
        />
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
  isEvidenceFullRefreshPending = false,
  onRunCommand,
  onRefreshEvidence,
  onRefreshEvidenceCard,
  onAskStudioAboutCard,
  onSendEvidenceToCopilot,
  onShowEvidenceOutput,
  onRevealArtifact,
  onOpenRunZone,
  onOpenProjectLifecycle,
}: DashboardRepairFlowProps) {
  const [mode, setMode] = useState<RepairMode>('guided');
  const [selectedCardId, setSelectedCardId] = useState<DashboardEvidenceCardId | null>(null);
  const cards = evidence?.cards ?? [];
  const steps = buildEvidenceGuidedSteps({ evidence, hasProject });
  const brief = buildDashboardEvidenceBrief({ evidence, hasWorkspace, hasProject });
  const actionableCards = useMemo(
    () => cards.filter(isActionableCard).sort((a, b) => cardPriority(a) - cardPriority(b)),
    [cards]
  );
  const selectedCard = selectedCardId
    ? actionableCards.find((card) => card.id === selectedCardId)
    : undefined;
  const activeCard = chooseActiveCard(
    cards,
    brief.currentStep,
    evidence,
    selectedCard ?? brief.primaryCard
  );
  const activeContract = activeCard
    ? buildDashboardEvidenceActionContract(activeCard, { workspace, evidence })
    : undefined;
  const activeAction = activeContract?.commandAction;
  const visibleCards =
    mode === 'guided'
      ? actionableCards.slice(0, 3)
      : mode === 'inspect'
        ? actionableCards.slice(0, 8)
        : actionableCards;
  const queueCards = visibleCards.filter((card) => card.id !== activeCard?.id);
  const queueGroups = mode === 'inspect' ? groupRepairCards(queueCards) : [];
  const pendingActiveRun = activeCard ? pendingRunCardIds.includes(activeCard.id) : false;
  const pendingActiveRefresh = activeCard ? pendingRefreshCardIds.includes(activeCard.id) : false;
  const isRefreshingEvidence =
    isEvidenceFullRefreshPending ||
    pendingRefreshCardIds.length > 0 ||
    (activeCard ? pendingActiveRefresh : false);
  const nextLabel = activeContract?.commandLabel ?? brief.currentStep?.title ?? 'Refresh evidence';

  useEffect(() => {
    if (selectedCardId && !actionableCards.some((card) => card.id === selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [actionableCards, selectedCardId]);

  if (!hasWorkspace) {
    return (
      <section className="repair-flow repair-flow--empty" aria-label="Repair command center">
        <div className="repair-flow__empty">
          <ClipboardCheck size={18} aria-hidden="true" />
          <h3>Select a workspace to start the repair flow.</h3>
          <p>
            Workspai will turn doctor, analyze, readiness, and verify artifacts into one safe path.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="repair-flow" aria-label="Repair command center">
      <RepairPath
        steps={steps}
        fixPathContract={activeContract}
        fixPathPending={pendingActiveRun}
        isRefreshingEvidence={isRefreshingEvidence}
        onRunFixPath={() => {
          if (activeAction) {
            onRunCommand(activeAction.command, activeAction.commandData);
          }
        }}
        onRefreshEvidence={onRefreshEvidence}
      />

      <div className={`repair-flow__decision repair-flow__decision--${brief.posture}`}>
        <div className="repair-flow__decision-copy">
          <span className="ws-kicker">Repair Command Center</span>
          <h3>{brief.label}</h3>
          <p>{brief.summary}</p>
          <small className="repair-flow__scope">
            {dashboardScopeLabel(scope)} · {dashboardScopeDetail(scope, { showPaths: false })}
          </small>
          <small>Next: {nextLabel}</small>
        </div>
        <RepairMetricStrip brief={brief} />
      </div>

      {activeCard ? (
        <RepairActiveCard
          card={activeCard}
          evidence={evidence}
          workspace={workspace}
          pending={pendingActiveRun}
          refreshPending={pendingActiveRefresh}
          mode={mode}
          onModeChange={setMode}
          onRunCommand={onRunCommand}
          onRefreshEvidenceCard={onRefreshEvidenceCard}
          onAskStudioAboutCard={onAskStudioAboutCard}
          onSendEvidenceToCopilot={onSendEvidenceToCopilot}
          onShowEvidenceOutput={onShowEvidenceOutput}
          onRevealArtifact={onRevealArtifact}
          onOpenProjectLifecycle={onOpenProjectLifecycle}
        />
      ) : (
        <section className="repair-flow__active repair-flow__active--clear">
          <div className="repair-flow__active-head">
            <span className="ws-kicker">Active blocker</span>
            <RepairModeToggle mode={mode} onChange={setMode} />
          </div>
          <ShieldCheck size={18} aria-hidden="true" />
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
                        pending={pendingRunCardIds.includes(card.id)}
                        refreshPending={pendingRefreshCardIds.includes(card.id)}
                        selected={activeCard?.id === card.id}
                        onSelect={() => setSelectedCardId(card.id)}
                        onRunCommand={onRunCommand}
                        onRefreshEvidenceCard={onRefreshEvidenceCard}
                        onAskStudioAboutCard={onAskStudioAboutCard}
                        onSendEvidenceToCopilot={onSendEvidenceToCopilot}
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
                  pending={pendingRunCardIds.includes(card.id)}
                  refreshPending={pendingRefreshCardIds.includes(card.id)}
                  selected={activeCard?.id === card.id}
                  onSelect={() => setSelectedCardId(card.id)}
                  onRunCommand={onRunCommand}
                  onRefreshEvidenceCard={onRefreshEvidenceCard}
                  onAskStudioAboutCard={onAskStudioAboutCard}
                  onSendEvidenceToCopilot={onSendEvidenceToCopilot}
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
