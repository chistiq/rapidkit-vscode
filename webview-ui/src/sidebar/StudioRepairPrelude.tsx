import { useState } from 'react';

import type { StudioBlockerHandoffView } from '@/lib/studioBlockerHandoff';

type StudioRepairPreludeProps = {
  handoff: StudioBlockerHandoffView;
  busy?: boolean;
  completed?: boolean;
  resumable?: boolean;
  reviewRequired?: boolean;
  terminalReason?: string;
  reviewMessage?: string;
  transactionId?: string;
  decisionOptions?: string[];
  onReview?: () => void;
  onDecision?: (decision: string, transactionId?: string) => void;
  onStart: () => void;
  onOpenSetup?: () => void;
  onStop: () => void;
};

export function StudioRepairPrelude({
  handoff,
  busy = false,
  completed = false,
  resumable = false,
  reviewRequired = false,
  terminalReason,
  reviewMessage,
  transactionId,
  decisionOptions = [],
  onReview,
  onDecision,
  onStart,
  onOpenSetup,
  onStop,
}: StudioRepairPreludeProps) {
  const [showDecisionOptions, setShowDecisionOptions] = useState(false);
  const scopeLabel = handoff.scope === 'project' ? 'project evidence' : 'workspace evidence';
  const connectionFailure = terminalReason === 'cli-repair-contract-mismatch';
  const providerFailure = terminalReason === 'ai-provider-unavailable';
  const toolchainFailure = terminalReason === 'repair-toolchain-unavailable';
  const status = completed
    ? 'Verified'
    : busy
      ? 'Working on the repair'
      : reviewRequired
        ? toolchainFailure
          ? 'Toolchain setup required'
          : 'Decision required'
        : connectionFailure
          ? 'CLI connection needed'
          : providerFailure
            ? 'AI connection needed'
            : resumable
              ? 'Repair paused'
              : 'Repair ready';

  return (
    <section className="ws-sidebar__repair-prelude" aria-label="Studio repair startup">
      <div
        className="ws-sidebar__repair-bubble ws-sidebar__repair-bubble--intro"
        data-state={
          completed
            ? 'complete'
            : busy
              ? 'running'
              : reviewRequired
                ? toolchainFailure
                  ? 'connection'
                  : 'review'
                : connectionFailure
                  ? 'connection'
                  : providerFailure
                    ? 'paused'
                    : resumable
                      ? 'paused'
                      : 'ready'
        }
      >
        <div className="ws-sidebar__repair-copy">
          <strong>
            <span
              className="ws-sidebar__repair-live"
              data-running={busy ? 'true' : 'false'}
              aria-hidden="true"
            />
            {status}
          </strong>
          <span className="ws-sidebar__repair-meta">
            {connectionFailure
              ? 'Repair did not start · no files changed'
              : providerFailure
                ? 'Latest repair is retained · reconnect to continue'
                : completed
                  ? 'Canonical evidence is current'
                  : busy
                    ? 'Using current evidence'
                    : toolchainFailure
                      ? 'A required runtime tool could not be launched'
                      : `${scopeLabel} · verification required`}
          </span>
          {reviewRequired ? (
            <>
              <p>{reviewMessage || 'Studio needs an explicit engineering decision to continue.'}</p>
              {toolchainFailure ? (
                <div
                  className="ws-sidebar__repair-controls"
                  role="group"
                  aria-label="Studio toolchain recovery controls"
                >
                  {onOpenSetup ? (
                    <button
                      type="button"
                      className="ws-sidebar__inline ws-sidebar__inline--primary"
                      onClick={onOpenSetup}
                    >
                      Open setup
                    </button>
                  ) : null}
                  <button type="button" className="ws-sidebar__inline" onClick={onStart}>
                    Retry repair
                  </button>
                  {decisionOptions.includes('cancel') && onDecision ? (
                    <button
                      type="button"
                      className="ws-sidebar__inline"
                      onClick={() => onDecision('cancel', transactionId)}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              ) : onReview || (decisionOptions.length > 0 && onDecision) ? (
                <div
                  className="ws-sidebar__repair-controls"
                  role="group"
                  aria-label="Studio engineering decision controls"
                >
                  <button
                    type="button"
                    className="ws-sidebar__inline"
                    onClick={() => {
                      if (decisionOptions.length > 0 && onDecision) {
                        setShowDecisionOptions((current) => !current);
                        return;
                      }
                      onReview?.();
                    }}
                    aria-expanded={showDecisionOptions}
                  >
                    Choose how to continue
                  </button>
                </div>
              ) : null}
              {showDecisionOptions && decisionOptions.length > 0 && onDecision ? (
                <div
                  className="ws-sidebar__repair-decision-options"
                  role="group"
                  aria-label="Available CLI repair decisions"
                >
                  {decisionOptions.map((decision) => (
                    <button
                      type="button"
                      className="ws-sidebar__inline"
                      key={decision}
                      onClick={() => onDecision(decision, transactionId)}
                    >
                      {decision
                        .split('-')
                        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                        .join(' ')}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {!completed && !reviewRequired ? (
            <div
              className="ws-sidebar__repair-controls"
              role="group"
              aria-label="Studio session controls"
            >
              {busy ? (
                <button type="button" className="ws-sidebar__inline" onClick={onStop}>
                  Stop session
                </button>
              ) : connectionFailure ? (
                <>
                  <button
                    type="button"
                    className="ws-sidebar__inline ws-sidebar__inline--primary"
                    onClick={onStart}
                  >
                    Retry connection
                  </button>
                  {onOpenSetup ? (
                    <button type="button" className="ws-sidebar__inline" onClick={onOpenSetup}>
                      Open setup
                    </button>
                  ) : null}
                </>
              ) : providerFailure ? (
                <button
                  type="button"
                  className="ws-sidebar__inline ws-sidebar__inline--primary"
                  onClick={onStart}
                >
                  Retry AI connection
                </button>
              ) : (
                <button type="button" className="ws-sidebar__inline" onClick={onStart}>
                  {resumable ? 'Resume repair' : 'Start repair'}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
