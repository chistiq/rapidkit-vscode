import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Lock,
  Loader2,
} from 'lucide-react';
import type {
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
} from '@/lib/dashboardEvidence';
import {
  evidenceCardStatusLabel,
  isBootstrapPendingCard,
  resolveEvidenceFreshness,
} from '@/lib/dashboardEvidence';
import {
  buildEvidenceGuidedSteps,
  evidenceGuidedStepCards,
  pickGuidedStepPrimaryCard,
  type EvidenceGuidedStep,
  type EvidenceGuidedStepState,
} from '@/lib/dashboardEvidenceViewMode';
import { buildDashboardEvidenceActionContract } from '@/lib/dashboardActionContract';
import { EvidenceCardActions } from '@/components/EvidenceCardActions';
import { EvidenceCardLogDrawer } from '@/components/EvidenceCardLogDrawer';
import type { DashboardOperateZone } from '@/lib/dashboardOperateZones';

interface EvidenceGuidedPathProps {
  evidence: DashboardEvidencePayload | null;
  hasProject: boolean;
  pendingCardIds?: DashboardEvidenceCardId[];
  workspace?: { path?: string; name?: string };
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidenceCard?: (cardId: DashboardEvidenceCardId) => void;
  onShowEvidenceOutput?: () => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onOpenRunZone?: (zone: DashboardOperateZone) => void;
}

function defaultStepIndex(steps: EvidenceGuidedStep[]): number {
  const focusIdx = steps.findIndex(
    (step) => step.state === 'current' || step.state === 'attention'
  );
  if (focusIdx >= 0) {
    return focusIdx;
  }
  const nextIdx = steps.findIndex((step) => step.state !== 'complete' && step.state !== 'locked');
  if (nextIdx >= 0) {
    return nextIdx;
  }
  return Math.max(steps.length - 1, 0);
}

const GUIDED_STEP_SHORT_LABELS: Record<EvidenceGuidedStep['id'], string> = {
  health: 'Health',
  project: 'Project',
  analyze: 'Analyze',
  readiness: 'Readiness',
  verify: 'Verify',
  release: 'Release',
};

export function evidenceGuidedStepShortLabel(step: EvidenceGuidedStep): string {
  return GUIDED_STEP_SHORT_LABELS[step.id] ?? step.title;
}

function isSelectableGuidedStep(step: EvidenceGuidedStep): boolean {
  return step.state !== 'locked';
}

export function findPreviousSelectableStepIndex(
  steps: EvidenceGuidedStep[],
  activeIndex: number
): number | null {
  for (let index = Math.min(activeIndex - 1, steps.length - 1); index >= 0; index -= 1) {
    if (isSelectableGuidedStep(steps[index])) {
      return index;
    }
  }
  return null;
}

export function findNextSelectableStepIndex(
  steps: EvidenceGuidedStep[],
  activeIndex: number
): number | null {
  for (let index = Math.max(activeIndex + 1, 0); index < steps.length; index += 1) {
    if (isSelectableGuidedStep(steps[index])) {
      return index;
    }
  }
  return null;
}

function completedStepCount(steps: EvidenceGuidedStep[]): number {
  return steps.filter((step) => step.state === 'complete').length;
}

function cardStatusTone(card: DashboardEvidenceCard, pending: boolean): string {
  if (pending) {
    return 'running';
  }
  if (isBootstrapPendingCard(card)) {
    return 'pending';
  }
  if (card.status === 'pass') {
    return 'pass';
  }
  if (card.status === 'warn') {
    return 'warn';
  }
  if (card.status === 'fail') {
    return 'fail';
  }
  return 'missing';
}

export function EvidenceGuidedPath({
  evidence,
  hasProject,
  pendingCardIds = [],
  workspace,
  onRunCommand,
  onRefreshEvidenceCard,
  onShowEvidenceOutput,
  onRevealArtifact,
  onOpenRunZone,
}: EvidenceGuidedPathProps) {
  const steps = buildEvidenceGuidedSteps({ evidence, hasProject });
  const recommendedIndex = useMemo(() => defaultStepIndex(steps), [steps]);
  const [activeIndex, setActiveIndex] = useState(recommendedIndex);

  useEffect(() => {
    setActiveIndex(recommendedIndex);
  }, [recommendedIndex]);

  if (steps.length === 0) {
    return null;
  }

  const activeStep = steps[activeIndex] ?? steps[0];
  const doneCount = completedStepCount(steps);
  const progressPct = Math.round((doneCount / steps.length) * 100);
  const previousIndex = findPreviousSelectableStepIndex(steps, activeIndex);
  const nextIndex = findNextSelectableStepIndex(steps, activeIndex);

  const goPrev = () => {
    if (previousIndex !== null) {
      setActiveIndex(previousIndex);
    }
  };
  const goNext = () => {
    if (nextIndex !== null) {
      setActiveIndex(nextIndex);
    }
  };

  return (
    <section className="evidence-guided-path" aria-label="Guided evidence path">
      <header className="evidence-guided-path__head">
        <div className="evidence-guided-path__head-copy">
          <span className="evidence-guided-path__eyebrow">Guided path</span>
          <h3 className="evidence-guided-path__title">{activeStep.title}</h3>
        </div>
        <div className="evidence-guided-path__progress-meta" aria-live="polite">
          <span>
            Step {activeIndex + 1} of {steps.length}
          </span>
          <span className="evidence-guided-path__progress-count">{doneCount} complete</span>
        </div>
      </header>

      <div
        className="evidence-guided-path__progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
        aria-label="Path completion"
      >
        <span
          className="evidence-guided-path__progress-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <nav className="evidence-guided-path__rail" aria-label="Path steps">
        {steps.map((step, index) => (
          <StepRailItem
            key={step.id}
            step={step}
            index={index}
            isActive={index === activeIndex}
            isLast={index === steps.length - 1}
            onSelect={() => {
              if (step.state !== 'locked') {
                setActiveIndex(index);
              }
            }}
          />
        ))}
      </nav>

      <GuidedStepSlide
        step={activeStep}
        stepIndex={activeIndex}
        stepTotal={steps.length}
        evidence={evidence}
        pendingCardIds={pendingCardIds}
        workspace={workspace}
        onRunCommand={onRunCommand}
        onRefreshEvidenceCard={onRefreshEvidenceCard}
        onShowEvidenceOutput={onShowEvidenceOutput}
        onRevealArtifact={onRevealArtifact}
        onOpenRunZone={onOpenRunZone}
      />

      <footer className="evidence-guided-path__footer">
        <button
          type="button"
          className="ws-btn ws-btn--ghost evidence-guided-path__nav"
          onClick={goPrev}
          disabled={previousIndex === null}
          aria-label="Previous step"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Back
        </button>
        <button
          type="button"
          className="ws-btn ws-btn--ghost evidence-guided-path__nav"
          onClick={goNext}
          disabled={nextIndex === null}
          aria-label="Next step"
        >
          Next
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </footer>
    </section>
  );
}

function StepRailItem({
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
        className={`evidence-guided-path__rail-btn evidence-guided-path__rail-btn--${step.state}${isActive ? ' is-active' : ''}`}
        onClick={onSelect}
        disabled={locked}
        aria-current={isActive ? 'step' : undefined}
        title={step.title}
      >
        <StepRailIcon state={step.state} index={index} />
        <span className="evidence-guided-path__rail-label">
          {evidenceGuidedStepShortLabel(step)}
        </span>
      </button>
      {!isLast ? (
        <span className="evidence-guided-path__rail-connector" aria-hidden="true" />
      ) : null}
    </div>
  );
}

function StepRailIcon({ state, index }: { state: EvidenceGuidedStepState; index: number }) {
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

function GuidedStepSlide({
  step,
  stepIndex,
  stepTotal,
  evidence,
  pendingCardIds,
  workspace,
  onRunCommand,
  onRefreshEvidenceCard,
  onShowEvidenceOutput,
  onRevealArtifact,
  onOpenRunZone,
}: {
  step: EvidenceGuidedStep;
  stepIndex: number;
  stepTotal: number;
  evidence: DashboardEvidencePayload | null;
  pendingCardIds: DashboardEvidenceCardId[];
  workspace?: { path?: string; name?: string };
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidenceCard?: (cardId: DashboardEvidenceCardId) => void;
  onShowEvidenceOutput?: () => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onOpenRunZone?: (zone: DashboardOperateZone) => void;
}) {
  const stepCards = evidenceGuidedStepCards(step, evidence);
  const primaryCard = pickGuidedStepPrimaryCard(step.id, stepCards);
  const primaryContract = primaryCard
    ? buildDashboardEvidenceActionContract(primaryCard, { workspace, evidence })
    : undefined;
  const runAction = primaryContract?.commandAction;
  const pending = step.cardIds.some((id) => pendingCardIds.includes(id));
  const locked = step.state === 'locked';
  const complete = step.state === 'complete';

  const handlePrimaryAction = () => {
    if (step.id === 'project' && onOpenRunZone) {
      onOpenRunZone('build');
      return;
    }
    if (runAction) {
      onRunCommand(runAction.command, runAction.commandData);
      return;
    }
    if (step.command) {
      onRunCommand(step.command);
    }
  };

  const primaryLabel =
    step.id === 'project'
      ? 'Open Run — Build'
      : runAction
        ? primaryContract?.commandLabel || runAction.label
        : step.command
          ? 'Run step'
          : 'Continue';

  return (
    <article
      key={step.id}
      className={`evidence-guided-path__slide evidence-guided-path__slide--${step.state}`}
      aria-labelledby={`guided-step-title-${step.id}`}
    >
      <div className="evidence-guided-path__slide-head">
        <span
          className={`evidence-guided-path__slide-badge evidence-guided-path__slide-badge--${step.state}`}
        >
          {complete
            ? 'Complete'
            : locked
              ? 'Locked'
              : step.state === 'attention'
                ? 'Needs attention'
                : 'Up next'}
        </span>
        <h4 id={`guided-step-title-${step.id}`} className="evidence-guided-path__slide-title">
          {step.title}
        </h4>
        <p className="evidence-guided-path__slide-detail">{step.detail}</p>
      </div>

      {stepCards.length > 0 ? (
        <ul className="evidence-guided-path__checklist" aria-label="Step evidence checks">
          {stepCards.map((card) => {
            const cardPending = pendingCardIds.includes(card.id);
            const tone = cardStatusTone(card, cardPending);
            const freshness = resolveEvidenceFreshness(card);
            const actionContract = buildDashboardEvidenceActionContract(card, {
              workspace,
              evidence,
            });
            return (
              <li
                key={card.id}
                className={`evidence-guided-path__check evidence-guided-path__check--${tone}`}
              >
                <span className="evidence-guided-path__check-mark" aria-hidden="true">
                  {cardPending ? (
                    <Loader2 size={11} className="evidence-guided-path__check-spinner" />
                  ) : tone === 'pass' ? (
                    <Check size={11} strokeWidth={2.5} />
                  ) : tone === 'fail' || tone === 'warn' || tone === 'pending' ? (
                    <AlertTriangle size={11} />
                  ) : (
                    <Circle size={7} fill="currentColor" strokeWidth={0} />
                  )}
                </span>
                <div className="evidence-guided-path__check-copy">
                  <strong>{card.label}</strong>
                  <span>{cardPending ? 'Refreshing…' : evidenceCardStatusLabel(card)}</span>
                  {!cardPending ? (
                    <small className={`evidence-freshness evidence-freshness--${freshness.status}`}>
                      {freshness.detail}
                    </small>
                  ) : null}
                  <small className="evidence-guided-path__contract">
                    {actionContract.commandLabel} · {actionContract.artifactLabel}
                  </small>
                </div>
                <EvidenceCardLogDrawer
                  card={card}
                  activity={evidence?.activity}
                  onOpenOutputChannel={onShowEvidenceOutput}
                  onRevealArtifact={onRevealArtifact}
                />
                <EvidenceCardActions
                  cardId={card.id}
                  pending={cardPending}
                  canRun={false}
                  canRefresh={false}
                  compact
                  artifactLabel={actionContract.artifactLabel}
                  artifactPath={actionContract.artifactPath}
                  artifactState={actionContract.artifactState}
                  onRevealArtifact={onRevealArtifact}
                />
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="evidence-guided-path__slide-actions">
        {locked ? (
          <p className="evidence-guided-path__locked-hint">
            Finish the previous step to unlock this one.
          </p>
        ) : (
          <>
            <button
              type="button"
              className="ws-btn ws-btn--primary evidence-guided-path__action"
              disabled={pending || complete}
              onClick={handlePrimaryAction}
            >
              {pending ? 'Running…' : complete ? 'Step complete' : primaryLabel}
              {!pending && !complete ? <ArrowRight size={12} aria-hidden="true" /> : null}
            </button>
            {primaryCard && onRefreshEvidenceCard ? (
              <EvidenceCardActions
                cardId={primaryCard.id}
                runLabel="Refresh step"
                pending={pending}
                canRun={false}
                onRefresh={onRefreshEvidenceCard}
                artifactLabel={primaryContract?.artifactLabel}
                artifactPath={primaryContract?.artifactPath}
                artifactState={primaryContract?.artifactState}
                onRevealArtifact={onRevealArtifact}
              />
            ) : null}
          </>
        )}
        <span className="evidence-guided-path__slide-footnote">
          {stepIndex + 1} / {stepTotal}
          {primaryContract ? ` · ${primaryContract.commandLabel}` : ''}
        </span>
      </div>
    </article>
  );
}
