import { ShieldCheck, Terminal } from 'lucide-react';
import { remediationRiskLabel, type DoctorRemediationPlanView } from '@/lib/doctorRemediationPlan';
import { compactStudioPathText } from '@/lib/studioDisplayText';
import { deriveStudioRepairCapability } from '@/lib/studioRepairCapability';
import type { StudioBlockerHandoffView } from '@/lib/studioBlockerHandoff';

type StudioRemediationPlanProps = {
  plan: DoctorRemediationPlanView | null;
  handoff?: StudioBlockerHandoffView | null;
  onRunCommand: (stepId: string, command: string) => void;
  onApplyStep: (stepId: string) => void;
  onRefreshPlan: () => void;
  busy?: boolean;
};

const STEP_STATE_LABEL: Record<
  DoctorRemediationPlanView['visibleSteps'][number]['studioState'],
  string
> = {
  ready: 'Ready to run',
  blocked: 'Needs a prerequisite',
  'review-required': 'Needs approval',
  'guidance-only': 'Guidance only',
};

const RISK_LABEL: Record<DoctorRemediationPlanView['visibleSteps'][number]['risk'], string> = {
  safe: 'Safe',
  guarded: 'Guarded',
  invasive: 'Invasive',
};

function repairActionLabel(step: DoctorRemediationPlanView['visibleSteps'][number]): string {
  if (step.canApply) {
    return 'Apply change';
  }
  return step.executable ? 'Run check' : 'Review details';
}

function isRunnableStudioCommand(command: string | undefined): boolean {
  const trimmed = command?.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith('rapidkit:')) {
    return false;
  }
  return /^(?:npx\s+rapidkit|npx\s+--yes\s+rapidkit|npx\s+--yes\s+--package\s+\S+\s+rapidkit|rapidkit(?:\s|$)|npm(?:\s|$)|pnpm(?:\s|$)|yarn(?:\s|$)|dotnet(?:\s|$)|poetry(?:\s|$))/.test(
    trimmed
  );
}

function stepIdentity(step: DoctorRemediationPlanView['visibleSteps'][number]): string {
  return `${step.id}:${step.order}:${step.primaryAction}`;
}

export function StudioRemediationPlan({
  plan,
  handoff = null,
  onRunCommand,
  onApplyStep,
  onRefreshPlan,
  busy = false,
}: StudioRemediationPlanProps) {
  if (!plan || plan.visibleSteps.length === 0) {
    return null;
  }
  const stale = plan.freshness.verdict === 'stale';
  const recommendedStep =
    plan.visibleSteps.find((step) => step.canApply || step.executable) ?? plan.visibleSteps[0];
  const recommendedIdentity = stepIdentity(recommendedStep);
  const supportingSteps = plan.visibleSteps
    .filter((step) => stepIdentity(step) !== recommendedIdentity)
    .slice(0, 4);
  const supportingCount = plan.visibleSteps.length - 1 + plan.hiddenStepCount;
  const blockerSummary = handoff?.blockers[0] ?? recommendedStep.previewSummary;
  const affectedFileCount = recommendedStep.files.length;
  const capability = deriveStudioRepairCapability({
    plan,
    step: recommendedStep,
    handoff,
  });
  const canApplyCapability =
    Boolean(capability?.canEditFiles) && recommendedStep.canApply && !stale;
  const canRunDiagnostic =
    !recommendedStep.canApply &&
    recommendedStep.executable &&
    isRunnableStudioCommand(recommendedStep.originalCommand);
  const displayBlockerSummary = compactStudioPathText(blockerSummary);
  const displayPreviewSummary = compactStudioPathText(recommendedStep.previewSummary);
  const displayDiffSummary = compactStudioPathText(recommendedStep.diffSummary);
  const displayBlockedReason = compactStudioPathText(
    recommendedStep.blockedReason || recommendedStep.studioReason
  );
  const displayVerifyCommand = compactStudioPathText(capability?.verifyCommand);
  const displayOriginalCommand = compactStudioPathText(recommendedStep.originalCommand);
  const displayStepVerifyCommand = compactStudioPathText(recommendedStep.verifyCommand);

  return (
    <section
      className="ws-sidebar__remediation-plan"
      aria-label="Doctor remediation plan"
      data-scope={plan.scope}
    >
      {handoff ? (
        <div className="ws-sidebar__repair-bubble ws-sidebar__repair-bubble--intro">
          <div className="ws-sidebar__repair-copy">
            <strong>
              <span className="ws-sidebar__repair-live" aria-hidden="true" />
              I’m on this card
            </strong>
            <p>{handoff?.cardLabel ?? 'This evidence card'} is in a focused repair session.</p>
            <span className="ws-sidebar__repair-meta">
              {recommendedStep.projectName || plan.scope} · {RISK_LABEL[recommendedStep.risk]} ·
              evidence-backed
            </span>
          </div>
        </div>
      ) : null}
      {handoff ? (
        <div className="ws-sidebar__repair-bubble ws-sidebar__repair-bubble--finding">
          <div className="ws-sidebar__repair-copy">
            <strong>Current blocker</strong>
            <p>
              {displayBlockerSummary ||
                `${handoff?.cardLabel ?? 'This card'} is blocked by the latest evidence.`}
            </p>
          </div>
        </div>
      ) : null}
      {plan.freshness.verdict !== 'fresh' ? (
        <div
          className="ws-sidebar__repair-bubble ws-sidebar__remediation-freshness"
          data-verdict={plan.freshness.verdict}
        >
          <strong>
            {plan.freshness.verdict === 'stale' ? 'Evidence changed' : 'Freshness unknown'}
          </strong>
          <span>
            {plan.freshness.reason ||
              'Refresh the source evidence and npm repair plan before changing files or applying a repair.'}
          </span>
          {plan.freshness.verdict === 'stale' ? (
            <button
              type="button"
              className="ws-sidebar__inline"
              disabled={busy}
              onClick={onRefreshPlan}
            >
              Refresh evidence
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        className="ws-sidebar__repair-bubble ws-sidebar__remediation-focus"
        data-risk={recommendedStep.risk}
        data-state={recommendedStep.studioState}
        data-fix-kind={capability?.fixKind ?? 'manual'}
      >
        {capability ? (
          <div className="ws-sidebar__repair-capability" data-fix-kind={capability.fixKind}>
            <div>
              <strong>Repair capability</strong>
              <span>{capability.statusLabel}</span>
            </div>
            <small>
              {capability.canEditFiles
                ? 'Ready for approved file edit.'
                : capability.fixKind === 'run-command'
                  ? 'Run the check first so I can continue safely.'
                  : capability.reason}
            </small>
          </div>
        ) : null}
        <div className="ws-sidebar__remediation-step-head">
          <span className="ws-sidebar__remediation-order">{recommendedStep.order || 1}</span>
          <div>
            <strong>
              Next move: {recommendedStep.previewTitle || recommendedStep.primaryAction}
            </strong>
            <small>
              {STEP_STATE_LABEL[recommendedStep.studioState]} · {remediationRiskLabel(plan)}
            </small>
          </div>
        </div>

        <p>{displayPreviewSummary || 'I can take the smallest safe step for this card.'}</p>
        {recommendedStep.diffSummary ? (
          <div className="ws-sidebar__remediation-diff">
            <ShieldCheck size={13} strokeWidth={1.8} />
            <span>{displayDiffSummary}</span>
          </div>
        ) : null}

        {recommendedStep.files.length > 0 ? (
          <div className="ws-sidebar__repair-file-summary" aria-label="Files affected">
            {recommendedStep.files.length} file hint{recommendedStep.files.length === 1 ? '' : 's'}{' '}
            ready
          </div>
        ) : null}

        <div className="ws-sidebar__remediation-actions">
          {recommendedStep.canApply ? (
            <button
              type="button"
              className="ws-sidebar__inline ws-sidebar__inline--primary"
              disabled={busy || (!stale && !canApplyCapability)}
              onClick={() => (stale ? onRefreshPlan() : onApplyStep(recommendedStep.id))}
            >
              {stale
                ? 'Refresh evidence first'
                : (capability?.primaryLabel ?? repairActionLabel(recommendedStep))}
            </button>
          ) : null}
          {canRunDiagnostic ? (
            <button
              type="button"
              className="ws-sidebar__inline"
              disabled={busy || stale}
              onClick={() => onRunCommand(recommendedStep.id, recommendedStep.originalCommand)}
            >
              <Terminal size={13} strokeWidth={1.8} />
              {capability?.secondaryLabel ?? 'Run check'}
            </button>
          ) : null}
        </div>

        {capability?.verifyCommand ? (
          <small className="ws-sidebar__remediation-reason">
            Verify after apply: {displayVerifyCommand}
          </small>
        ) : null}

        {recommendedStep.blockedReason || recommendedStep.studioReason ? (
          <small className="ws-sidebar__remediation-reason">{displayBlockedReason}</small>
        ) : null}
      </div>

      {supportingCount > 0 || affectedFileCount > 0 ? (
        <details className="ws-sidebar__repair-details">
          <summary>Details</summary>
          <div>
            <span>
              {affectedFileCount > 0
                ? `${affectedFileCount} file hint${affectedFileCount === 1 ? '' : 's'} available`
                : 'No deterministic file diff yet'}
            </span>
            {supportingCount > 0 ? (
              <span>
                {supportingCount} supporting step{supportingCount === 1 ? '' : 's'} kept in the
                artifact
              </span>
            ) : null}
            {supportingSteps.length > 0 ? (
              <ol className="ws-sidebar__remediation-steps" aria-label="Supporting repair steps">
                {supportingSteps.map((step) => (
                  <li key={step.id} data-state={step.studioState} data-risk={step.risk}>
                    <div className="ws-sidebar__remediation-step-head">
                      <span className="ws-sidebar__remediation-order">{step.order || 1}</span>
                      <div>
                        <strong>
                          {compactStudioPathText(step.previewTitle || step.primaryAction)}
                        </strong>
                        <small>
                          {STEP_STATE_LABEL[step.studioState]} · {RISK_LABEL[step.risk]}
                        </small>
                      </div>
                    </div>
                    <p>{compactStudioPathText(step.diffSummary || step.previewSummary)}</p>
                  </li>
                ))}
              </ol>
            ) : null}
            {canRunDiagnostic ? <code>{displayOriginalCommand}</code> : null}
            {recommendedStep.verifyCommand ? <code>{displayStepVerifyCommand}</code> : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}
