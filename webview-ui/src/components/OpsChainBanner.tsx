import { ArrowRight, Sparkles, X } from 'lucide-react';
import type { DashboardOpsChainState } from '@/lib/dashboardEvidence';
import { opsChainStepLabel } from '@/lib/dashboardEvidenceActions';

interface OpsChainBannerProps {
    chain: DashboardOpsChainState;
    onDismiss: () => void;
    onViewEvidence?: () => void;
    continueLabel?: string;
}

function chainTriggerLabel(triggeredBy: DashboardOpsChainState['triggeredBy']): string {
    switch (triggeredBy) {
        case 'clone':
            return 'Started after catalog clone';
        case 'ai-create':
            return 'Started after workspace creation';
        case 'import':
            return 'Started after workspace import';
        case 'create':
            return 'Started after workspace create';
        case 'add':
            return 'Started after workspace add';
        default:
            return 'Started after workspace onboarding';
    }
}

function stepMetaChipClass(completed: boolean, current: boolean, blocked: boolean): string {
    if (blocked) {
        return 'ws-chip ws-chip--error';
    }
    if (current) {
        return 'ws-chip ws-chip--accent';
    }
    if (completed) {
        return 'ws-chip ws-chip--success';
    }
    return 'ws-chip ws-chip--muted';
}

export function OpsChainBanner({ chain, onDismiss, onViewEvidence, continueLabel }: OpsChainBannerProps) {
    return (
        <section
            className={`ops-chain-banner ops-chain-banner--${chain.status}`}
            aria-label="Governance onboarding chain"
        >
            <div className="ops-chain-banner__head">
                <Sparkles size={14} aria-hidden="true" />
                <div className="ops-chain-banner__copy">
                    <strong>Governance chain</strong>
                    <small>
                        {chainTriggerLabel(chain.triggeredBy)}
                        {chain.lastDetail ? ` · ${chain.lastDetail}` : ''}
                    </small>
                </div>
                <button
                    type="button"
                    className="ws-btn ws-btn--ghost ws-btn--icon ops-chain-banner__dismiss"
                    onClick={onDismiss}
                    aria-label="Dismiss chain"
                >
                    <X size={12} />
                </button>
            </div>
            <ol className="ops-chain-banner__steps">
                {chain.steps.map((step) => {
                    const completed = chain.completedSteps.includes(step);
                    const current = chain.currentStep === step && chain.status === 'running';
                    const blocked = chain.status === 'blocked' && chain.currentStep === step;
                    return (
                        <li
                            key={step}
                            className={`ops-chain-banner__step ${completed ? 'is-complete' : ''} ${current ? 'is-current' : ''} ${blocked ? 'is-blocked' : ''}`}
                        >
                            <span>{opsChainStepLabel(step)}</span>
                            {completed ? (
                                <span className={`${stepMetaChipClass(true, false, false)} ops-chain-banner__step-meta`}>
                                    done
                                </span>
                            ) : null}
                            {current ? (
                                <span className={`${stepMetaChipClass(false, true, false)} ops-chain-banner__step-meta`}>
                                    running
                                </span>
                            ) : null}
                            {blocked ? (
                                <span className={`${stepMetaChipClass(false, false, true)} ops-chain-banner__step-meta`}>
                                    blocked
                                </span>
                            ) : null}
                        </li>
                    );
                })}
            </ol>
            {chain.status === 'completed' ? (
                <p className="ops-chain-banner__footer">
                    Chain complete.
                    {onViewEvidence ? (
                        <button
                            type="button"
                            className="ws-btn ws-btn--ghost ops-chain-banner__link"
                            onClick={onViewEvidence}
                        >
                            Review Release hub
                            <ArrowRight size={12} aria-hidden="true" />
                        </button>
                    ) : (
                        <>
                            Review Release hub and Next steps for handoff.
                            <ArrowRight size={12} aria-hidden="true" />
                        </>
                    )}
                </p>
            ) : chain.status === 'blocked' && onViewEvidence ? (
                <p className="ops-chain-banner__footer">
                    <button
                        type="button"
                        className="ws-btn ws-btn--ghost ops-chain-banner__link"
                        onClick={onViewEvidence}
                    >
                        {continueLabel ?? 'Continue governance chain'}
                        <ArrowRight size={12} aria-hidden="true" />
                    </button>
                </p>
            ) : null}
        </section>
    );
}
