import React from 'react';
import { Activity, CheckCircle2, PlayCircle, ShieldAlert } from 'lucide-react';
import {
    AIActionRegistryView,
    IncidentPhase,
    PHASE_LABELS,
    PolicyGateState,
    ReleaseGatePosture,
    StudioActionStatus,
    StudioEvidenceSummary,
} from '../state/studioState';
import { STUDIO_ACTION_COMMANDS, StudioActionCommand } from '../state/studioActions';
import { buildStudioPosture } from '../state/studioPosture';
import { studioClass, postureToneClass } from '../styles/studioUi';
import type { StudioPostureTone } from '../state/studioPosture';
import type { LiteReleaseState } from '../../../lib/incidentStudioLiteMode';
import { mapLiteReleaseTone } from '../../../lib/incidentStudioLiteMode';
import type { IncidentStudioDisplayMode } from '../../../lib/incidentStudioPreferences';
import { isVerifyActionBlockedByPolicyGates } from '../../../lib/incidentStudioPolicyGateMapper';

interface CommandRibbonProps {
    currentPhase: IncidentPhase;
    releasePosture: ReleaseGatePosture;
    policyGates: PolicyGateState;
    studioEvidence?: StudioEvidenceSummary;
    aiActionRegistry?: AIActionRegistryView | null;
    studioActionStatus?: StudioActionStatus | null;
    compactMode?: boolean;
    merged?: boolean;
    displayMode?: IncidentStudioDisplayMode;
    liteReleaseState?: LiteReleaseState | null;
    onExecuteAction: (command: StudioActionCommand) => void;
    verifyGateBlockedReasons?: string[];
}

export const CommandRibbon: React.FC<CommandRibbonProps> = ({
    currentPhase,
    releasePosture,
    policyGates,
    studioEvidence,
    aiActionRegistry,
    studioActionStatus,
    compactMode = false,
    merged = false,
    displayMode = 'full',
    liteReleaseState = null,
    onExecuteAction,
    verifyGateBlockedReasons = [],
}) => {
    const fullStatus = buildStudioPosture({
        releasePosture,
        policyGates,
        studioEvidence,
        aiActionRegistry,
    });
    const useLitePosture = displayMode === 'lite' && liteReleaseState !== null;
    const status = useLitePosture
        ? {
              label: liteReleaseState.label,
              summary: liteReleaseState.summary,
              tone: mapLiteReleaseTone(liteReleaseState.tone),
              evidence: fullStatus.evidence,
              action: fullStatus.action,
              proof: fullStatus.proof,
          }
        : fullStatus;
    const toneClass = postureToneClass(status.tone);
    const actionRunning = studioActionStatus?.status === 'started';
    const verifyBlocked = isVerifyActionBlockedByPolicyGates({
        policyGates,
        verifyGateBlockedReasons,
    });
    const actionResult = studioActionStatus?.result;
    const actionValue = studioActionStatus
        ? actionResult?.summary || `${studioActionStatus.actionId}/${studioActionStatus.status}`
        : status.action;
    const proofValue =
        actionResult?.evidenceSha256
            ? `sha256:${actionResult.evidenceSha256.slice(0, 12)}`
            : actionResult?.evidencePath
                ? 'evidence file'
                : typeof actionResult?.score === 'number'
                    ? `score ${actionResult.score}`
                    : status.proof;

    const isLiteView = displayMode === 'lite';
    const liteStatusLine = `${PHASE_LABELS[currentPhase]} · ${actionValue}${proofValue !== status.proof ? ` · ${proofValue}` : ''}`;

    const ribbonClass = [
        studioClass.commandRibbon,
        merged ? 'studio-command-ribbon--merged' : 'studio-command-ribbon--standalone',
        compactMode ? 'is-compact' : undefined,
        isLiteView ? 'is-lite-view' : undefined,
    ].filter(Boolean).join(' ');

    return (
        <section aria-label="Studio command ribbon" className={ribbonClass}>
            <div className="studio-command-ribbon__lead">
                {status.tone === 'error' ? (
                    <ShieldAlert size={15} className={`${studioClass.flexShrink0} ${toneClass}`} aria-hidden="true" />
                ) : status.tone === 'ok' ? (
                    <CheckCircle2 size={15} className={`${studioClass.flexShrink0} ${toneClass}`} aria-hidden="true" />
                ) : (
                    <Activity size={15} className={`${studioClass.flexShrink0} ${toneClass}`} aria-hidden="true" />
                )}
                <span className={`studio-posture-chip ${toneClass}`}>
                    {status.label}
                </span>
                <span className="studio-command-ribbon__summary" title={status.summary}>
                    {status.summary}
                </span>
                {isLiteView ? (
                    <span
                        className="studio-command-ribbon__lite-line"
                        title={liteStatusLine}
                        aria-label={`Operational status: ${liteStatusLine}`}
                    >
                        {liteStatusLine}
                    </span>
                ) : null}
            </div>

            {!isLiteView ? (
                <div className="studio-command-ribbon__metrics">
                    <RibbonMetric label="Phase" value={currentPhase} />
                    {!compactMode ? <RibbonMetric label="Evidence" value={status.evidence} /> : null}
                    <RibbonMetric
                        label="Action"
                        value={actionValue}
                        tone={
                            studioActionStatus?.status === 'failed'
                                ? 'error'
                                : studioActionStatus?.status === 'started'
                                    ? 'warning'
                                    : undefined
                        }
                    />
                    {!compactMode ? <RibbonMetric label="Proof" value={proofValue} /> : null}
                </div>
            ) : null}

            <div className="studio-command-ribbon__actions">
                <RibbonButton
                    label="Analyze"
                    command={STUDIO_ACTION_COMMANDS.runAnalyze}
                    disabled={actionRunning}
                    primary
                    onExecute={onExecuteAction}
                />
                {!compactMode ? (
                    <RibbonButton
                        label="Impact"
                        command={STUDIO_ACTION_COMMANDS.impactLens}
                        disabled={actionRunning}
                        onExecute={onExecuteAction}
                    />
                ) : null}
                <RibbonButton
                    label="Verify"
                    command={STUDIO_ACTION_COMMANDS.verifyGates}
                    disabled={actionRunning || verifyBlocked}
                    onExecute={onExecuteAction}
                />
            </div>
        </section>
    );
};

const RibbonMetric: React.FC<{
    label: string;
    value: string;
    tone?: StudioPostureTone;
}> = ({ label, value, tone }) => (
    <div className={studioClass.metric}>
        <span className={studioClass.metricLabel}>{label}</span>
        <span
            className={`${studioClass.metricValue}${tone ? ` ${postureToneClass(tone)}` : ''}`}
            title={value}
        >
            {value}
        </span>
    </div>
);

const RibbonButton: React.FC<{
    label: string;
    command: StudioActionCommand;
    disabled?: boolean;
    primary?: boolean;
    onExecute: (command: StudioActionCommand) => void;
}> = ({ label, command, disabled = false, primary = false, onExecute }) => (
    <button
        type="button"
        disabled={disabled}
        className={primary && !disabled ? studioClass.btnPrimary : studioClass.btnGhost}
        onClick={() => {
            if (!disabled) {
                onExecute(command);
            }
        }}
    >
        <PlayCircle size={12} />
        {label}
    </button>
);
