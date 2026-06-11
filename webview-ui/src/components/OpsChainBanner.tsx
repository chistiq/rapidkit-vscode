import { ArrowRight, Sparkles, X } from 'lucide-react';
import type { DashboardOpsChainState } from '@/lib/dashboardEvidence';
import { opsChainStepLabel } from '@/lib/dashboardEvidenceActions';

interface OpsChainBannerProps {
    chain: DashboardOpsChainState;
    onDismiss: () => void;
}

export function OpsChainBanner({ chain, onDismiss }: OpsChainBannerProps) {
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
                        {chain.triggeredBy === 'clone'
                            ? 'Started after catalog clone'
                            : chain.triggeredBy === 'ai-create'
                              ? 'Started after workspace creation'
                              : 'Started after workspace import'}
                        {chain.lastDetail ? ` · ${chain.lastDetail}` : ''}
                    </small>
                </div>
                <button type="button" className="ops-chain-banner__dismiss" onClick={onDismiss} aria-label="Dismiss chain">
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
                            {completed ? <span className="ops-chain-banner__step-meta">done</span> : null}
                            {current ? <span className="ops-chain-banner__step-meta">running</span> : null}
                            {blocked ? <span className="ops-chain-banner__step-meta">blocked</span> : null}
                        </li>
                    );
                })}
            </ol>
            {chain.status === 'completed' ? (
                <p className="ops-chain-banner__footer">
                    Chain complete. Review Release hub and Next steps for handoff.
                    <ArrowRight size={12} aria-hidden="true" />
                </p>
            ) : null}
        </section>
    );
}
