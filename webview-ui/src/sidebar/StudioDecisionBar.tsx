import { AlertTriangle, RotateCcw, Settings2 } from 'lucide-react';
import { resolveRuntimeSetupGuidance } from '../../../src/contracts/runtimeSetupGuidance';

type StudioDecisionBarProps = {
  reviewRequired?: boolean;
  resumable?: boolean;
  terminalReason?: string;
  missingExecutable?: string;
  message?: string;
  transactionId?: string;
  decisionOptions?: string[];
  onDecision?: (decision: string, transactionId?: string) => void;
  onResume: () => void;
  onOpenSetup?: (executable?: string) => void;
};

const DECISION_COPY: Record<string, { label: string; detail: string; primary?: boolean }> = {
  approve: {
    label: 'Approve and continue',
    detail: 'Apply the reviewed plan and continue verification.',
    primary: true,
  },
  continue: {
    label: 'Continue safely',
    detail: 'Continue from the current evidence and checkpoint.',
    primary: true,
  },
  retry: {
    label: 'Retry this step',
    detail: 'Retry the current bounded operation with fresh evidence.',
    primary: true,
  },
  replan: {
    label: 'Create a new plan',
    detail: 'Discard this plan and prepare a fresh plan for the same finding.',
  },
  'manual-repair': {
    label: 'Repair manually',
    detail: 'Open the affected source and continue with a reviewed fix.',
  },
  cancel: {
    label: 'Cancel repair',
    detail: 'Release the repair transaction without changing source.',
  },
};

function humanizeDecision(decision: string) {
  return (
    DECISION_COPY[decision] ?? {
      label: decision
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      detail: 'Continue with this CLI-authorized decision.',
    }
  );
}

/** The single primary decision surface for a paused governed repair. */
export function StudioDecisionBar({
  reviewRequired = false,
  resumable = false,
  terminalReason,
  missingExecutable,
  message,
  transactionId,
  decisionOptions = [],
  onDecision,
  onResume,
  onOpenSetup,
}: StudioDecisionBarProps) {
  const runtimeSetup = resolveRuntimeSetupGuidance(missingExecutable);
  const toolchainFailure =
    terminalReason === 'repair-toolchain-unavailable' ||
    terminalReason === 'environment-prerequisite-required';
  const connectionFailure = terminalReason === 'cli-repair-contract-mismatch';
  const providerTimeout = terminalReason === 'ai-provider-timeout';
  const providerFailure = terminalReason === 'ai-provider-unavailable' || providerTimeout;
  if (
    !reviewRequired &&
    !resumable &&
    !toolchainFailure &&
    !connectionFailure &&
    !providerFailure
  ) {
    return null;
  }

  const title = toolchainFailure
    ? 'Setup required'
    : reviewRequired
      ? 'Your decision is needed'
      : connectionFailure
        ? 'Reconnect Workspai CLI'
        : providerFailure
          ? providerTimeout
            ? 'Model request timed out'
            : 'Reconnect the AI provider'
          : 'Repair paused';

  return (
    <section className="ws-sidebar__decision-bar" role="region" aria-label={title}>
      <span className="ws-sidebar__decision-bar-icon" aria-hidden="true">
        {toolchainFailure || connectionFailure ? (
          <Settings2 size={15} strokeWidth={1.8} />
        ) : (
          <AlertTriangle size={15} strokeWidth={1.8} />
        )}
      </span>
      <div className="ws-sidebar__decision-bar-copy">
        <strong>{title}</strong>
        <span>{message || 'Choose the next safe step. No unapproved source change will run.'}</span>
        <div className="ws-sidebar__decision-bar-actions">
          {toolchainFailure && onOpenSetup ? (
            <button
              type="button"
              className="ws-sidebar__inline ws-sidebar__inline--primary"
              onClick={() => onOpenSetup(missingExecutable)}
            >
              {runtimeSetup?.actionLabel ?? 'Open setup'}
            </button>
          ) : null}
          {decisionOptions.length > 0 && onDecision
            ? decisionOptions.map((decision) => {
                const copy = humanizeDecision(decision);
                return (
                  <button
                    type="button"
                    className={`ws-sidebar__inline${copy.primary ? ' ws-sidebar__inline--primary' : ''}`}
                    key={decision}
                    title={copy.detail}
                    onClick={() => onDecision(decision, transactionId)}
                  >
                    {copy.label}
                  </button>
                );
              })
            : null}
          {!reviewRequired || decisionOptions.length === 0 ? (
            <button
              type="button"
              className="ws-sidebar__inline ws-sidebar__inline--primary"
              onClick={onResume}
            >
              <RotateCcw size={12} strokeWidth={1.8} aria-hidden="true" />
              {connectionFailure
                ? 'Retry connection'
                : providerFailure
                  ? 'Retry AI'
                  : toolchainFailure
                    ? 'Recheck environment'
                    : 'Resume'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
