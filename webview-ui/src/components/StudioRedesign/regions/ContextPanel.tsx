/**
 * ContextPanel: Health summary, policy gates, related files with badges
 * Enterprise right-side information panel
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Clock, TrendingDown, AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { studioClass, postureToneClass, releasePostureToneClass, approvalToneClass, policyGateStateClass, moduleSeverityClass, lifecycleStatusClass, contractValidationClass, studioToneClass } from '../styles/studioUi';
import {
    HealthMetrics,
    PolicyGateState,
    RelatedFile,
    AIActionContractView,
    AIActionRegistryView,
    RELEASE_GATE_LABELS,
    ReleaseGatePosture,
    StudioEvidenceSummary,
} from '../state/studioState';
import { buildStudioPosture, StudioPosture } from '../state/studioPosture';
import { buildStudioActionApprovalGate } from '../state/studioActionApproval';
import { StudioApprovalAuditEvent, StudioApprovalAuditOperation } from '../state/studioActionAudit';
import type { IncidentStudioStabilizationKpiStatus } from '../../../lib/incidentStudioPayload';
import { deriveStabilizationEnterpriseClaim } from '../../../lib/incidentStudioStabilizationClaim';

interface ContextPanelProps {
    health: HealthMetrics;
    relatedFiles: RelatedFile[];
    policyGates: PolicyGateState;
    userMode: 'guided' | 'standard' | 'expert';
    releasePosture: ReleaseGatePosture;
    studioEvidence?: StudioEvidenceSummary;
    aiActionContract?: AIActionContractView | null;
    aiActionRegistry?: AIActionRegistryView | null;
    onAIActionCommand?: (operation: 'apply' | 'verify' | 'rollback') => void;
    onApprovalAuditEvent?: (event: Omit<StudioApprovalAuditEvent, 'id' | 'happenedAt'>) => void;
    onRevealEvidence?: (path: string) => void;
    stabilizationKpiStatus?: IncidentStudioStabilizationKpiStatus | null;
}

interface ModuleGraphItem {
    id: string;
    name: string;
    framework: 'fastapi' | 'nestjs' | 'shared';
    severity: 'healthy' | 'warning' | 'critical';
    freshness: string;
    summary: string;
}

function inferFramework(path: string): ModuleGraphItem['framework'] {
    const normalized = path.toLowerCase();
    if (normalized.includes('nest') || normalized.includes('.ts')) {
        return 'nestjs';
    }
    if (normalized.includes('fastapi') || normalized.includes('.py')) {
        return 'fastapi';
    }
    return 'shared';
}

function mapRelatedFilesToModules(relatedFiles: RelatedFile[], health: HealthMetrics): ModuleGraphItem[] {
    if (relatedFiles.length === 0) {
        return [
            {
                id: 'workspace-evidence',
                name: 'Workspace Evidence',
                framework: 'shared',
                severity:
                    health.modulesError > 0
                        ? 'critical'
                        : health.modulesWarning > 0
                            ? 'warning'
                            : 'healthy',
                freshness: health.systemLastCheck || 'Pending analyze',
                summary: 'Run workspace analysis to hydrate module-level evidence.',
            },
        ];
    }

    return relatedFiles.map((file, index) => ({
        id: `${file.path}-${index}`,
        name: file.path.split('/').filter(Boolean).slice(-2).join('/') || file.path,
        framework: inferFramework(file.path),
        severity:
            file.health === 'error'
                ? 'critical'
                : file.health === 'warning'
                    ? 'warning'
                    : 'healthy',
        freshness: file.freshness || health.systemLastCheck || 'Freshness unknown',
        summary: `Evidence-backed file signal from ${file.path}.`,
    }));
}

const GuidedReleaseGateSection: React.FC<{
    policyGates: PolicyGateState;
    releasePosture: ReleaseGatePosture;
}> = ({ policyGates, releasePosture }) => {
    const releaseTone = releasePostureToneClass(policyGates.releasePosture);
    const flowLabel =
        policyGates.flowState === 'passing'
            ? 'Flow verified'
            : policyGates.flowState === 'warning'
              ? 'Flow degraded'
              : 'Flow blocked';
    const flowTone =
        policyGates.flowState === 'passing'
            ? studioClass.toneOk
            : policyGates.flowState === 'warning'
              ? studioClass.toneWarn
              : studioClass.toneError;

    return (
        <section className={`${studioClass.contextSection} studio-context-guided-release`}>
            <div className={studioClass.sectionLabel}>Release Gate</div>
            <div className={`${studioClass.card} is-active studio-context-guided-release__card ${releaseTone}`}>
                <div className={studioClass.between}>
                    <div className={`${studioClass.rowSm} ${studioClass.minW0}`}>
                        <span className={`studio-status-dot studio-status-dot--md ${releaseTone}`} />
                        <span className={`${studioClass.h2} ${releaseTone}`}>
                            {RELEASE_GATE_LABELS[policyGates.releasePosture]}
                        </span>
                    </div>
                    <span className={`${studioClass.statusPill} ${flowTone}`}>{flowLabel}</span>
                </div>
                <p className={`${studioClass.bodySmall} studio-u-text-muted ${studioClass.mtSm}`}>
                    Enterprise release decision from flow verification and stabilization posture. Complete verify
                    before claiming resolution.
                </p>
                <div className={studioClass.traceGrid}>
                    <div className={studioClass.metric}>
                        <span className={studioClass.metricLabel}>Release posture</span>
                        <span className={`${studioClass.metricValue} ${releaseTone}`}>
                            {RELEASE_GATE_LABELS[releasePosture]}
                        </span>
                    </div>
                    <div className={studioClass.metric}>
                        <span className={studioClass.metricLabel}>Flow gate</span>
                        <span className={`${studioClass.metricValue} ${flowTone}`}>{flowLabel}</span>
                    </div>
                </div>
            </div>
        </section>
    );
};

const OperationalPostureCard: React.FC<{ posture: StudioPosture; compactGuided?: boolean }> = ({
    posture,
    compactGuided = false,
}) => {
    const toneClass = postureToneClass(posture.tone);
    const metrics = compactGuided ? posture.metrics.slice(0, 2) : posture.metrics;

    return (
        <section className={studioClass.contextSection}>
            <div className={studioClass.sectionLabel}>Operational Posture</div>
            <div className={`${studioClass.card} is-active ${studioClass.postureCard} ${toneClass}`}>
                <div className={studioClass.between}>
                    <div className={`${studioClass.rowSm} ${studioClass.minW0}`}>
                        <span className={`studio-status-dot studio-status-dot--md ${studioClass.postureCardDot} ${toneClass}`} />
                        <span className={`${studioClass.h2} ${studioClass.postureCardLabel} ${toneClass}`}>{posture.label}</span>
                    </div>
                    <span className={`${studioClass.statusPill} ${toneClass}`}>
                        {posture.tone === 'ok' ? 'Ready' : posture.tone === 'warning' ? 'Review' : 'Hold'}
                    </span>
                </div>

                <div className={`${studioClass.bodySmall} studio-u-text-muted`}>
                    {posture.summary}
                </div>

                <div className={studioClass.traceGrid}>
                    {metrics.map((metric) => (
                        <div key={metric.label} className="studio-posture-metric">
                            <span className={studioClass.metricLabel}>{metric.label}</span>
                            <span className={`${studioClass.metricValue} ${studioToneClass(metric.tone)}`} title={metric.value}>
                                {metric.value}
                            </span>
                        </div>
                    ))}
                </div>

                {!compactGuided ? (
                    <div className={studioClass.postureCardProof}>
                        Next proof · {posture.nextProof}
                    </div>
                ) : null}
            </div>
        </section>
    );
};

export const ContextPanel: React.FC<ContextPanelProps> = ({
    health,
    relatedFiles,
    policyGates,
    userMode,
    releasePosture,
    studioEvidence,
    aiActionContract,
    aiActionRegistry,
    onAIActionCommand,
    onApprovalAuditEvent,
    onRevealEvidence,
    stabilizationKpiStatus = null,
}) => {
    const [frameworkFilter, setFrameworkFilter] = useState<'all' | ModuleGraphItem['framework']>('all');
    const [severityFilter, setSeverityFilter] = useState<'all' | ModuleGraphItem['severity']>('all');
    const [moduleSearch, setModuleSearch] = useState('');
    const [actionReviewOpen, setActionReviewOpen] = useState(userMode !== 'guided');
    const [actionApprovalConfirmed, setActionApprovalConfirmed] = useState(false);
    const isGuided = userMode === 'guided';
    const visibleRelatedFiles = isGuided ? relatedFiles.slice(0, 5) : relatedFiles;

    const totalModules = health.modulesOk + health.modulesWarning + health.modulesError;
    const healthPercent = totalModules > 0
        ? Math.round((health.modulesOk / totalModules) * 100)
        : 0;

    const getFileHealthBadge = (health: string) => {
        switch (health) {
            case 'ok':
                return { toneClass: studioClass.toneOk, label: '✓ OK' };
            case 'warning':
                return { toneClass: studioClass.toneWarn, label: '⚠ WARN' };
            case 'error':
                return { toneClass: studioClass.toneError, label: '✗ ERR' };
            default:
                return { toneClass: 'studio-tone-muted', label: '? UNK' };
        }
    };

    const moduleGraphItems = useMemo(
        () => mapRelatedFilesToModules(relatedFiles, health),
        [health, relatedFiles],
    );

    const frameworkOptions = useMemo(
        () => Array.from(new Set(moduleGraphItems.map((item) => item.framework))),
        [moduleGraphItems],
    );

    const filteredModules = useMemo(
        () =>
            moduleGraphItems.filter((item) => {
                const frameworkMatch = frameworkFilter === 'all' || item.framework === frameworkFilter;
                const severityMatch = severityFilter === 'all' || item.severity === severityFilter;
                const searchMatch = moduleSearch.trim().length === 0 ||
                    `${item.name} ${item.summary}`.toLowerCase().includes(moduleSearch.toLowerCase());
                return frameworkMatch && severityMatch && searchMatch;
            }),
        [frameworkFilter, moduleGraphItems, moduleSearch, severityFilter],
    );

    const moduleGroups = useMemo(() => {
        return frameworkOptions.map((framework) => ({
            framework,
            modules: filteredModules.filter((item) => item.framework === framework),
        })).filter((group) => group.modules.length > 0);
    }, [filteredModules, frameworkOptions]);
    const latestActionEntry = aiActionRegistry?.entries[0];
    const latestActionExecution = latestActionEntry?.executions[0];
    const evidenceCoverageLabel =
        relatedFiles.length === 0
            ? 'Awaiting analyze'
            : `${relatedFiles.length} source${relatedFiles.length === 1 ? '' : 's'}`;
    const confidenceLabel = aiActionContract?.contract
        ? `${Math.round(aiActionContract.contract.confidence * 100)}% contract`
        : latestActionEntry
            ? `${latestActionEntry.validationStatus}/${latestActionEntry.lifecycleStatus}`
            : 'No contract yet';
    const drillDownLabel = onRevealEvidence
        ? 'Reveal enabled'
        : 'Read-only';
    const proofReadinessLabel = latestActionExecution?.evidenceSha256
        ? `sha256:${latestActionExecution.evidenceSha256.slice(0, 12)}`
        : latestActionExecution?.evidencePath
            ? 'Evidence file ready'
            : studioEvidence?.generatedAt
                ? 'Analyze evidence ready'
                : 'Run verify';
    const operationalPosture = useMemo(
        () => buildStudioPosture({
            releasePosture,
            policyGates,
            health,
            studioEvidence,
            aiActionRegistry,
        }),
        [aiActionRegistry, health, policyGates, releasePosture, studioEvidence],
    );
    const actionApprovalGate = useMemo(
        () => buildStudioActionApprovalGate(aiActionContract),
        [aiActionContract],
    );
    const stabilizationClaim = useMemo(
        () => deriveStabilizationEnterpriseClaim({ status: stabilizationKpiStatus }),
        [stabilizationKpiStatus],
    );

    useEffect(() => {
        setActionApprovalConfirmed(false);
    }, [aiActionContract?.actionId, aiActionContract?.receivedAt]);

    useEffect(() => {
        if (isGuided) {
            setActionReviewOpen(false);
        }
    }, [isGuided]);

    const postApprovalAuditEvent = (
        operation: StudioApprovalAuditOperation,
        detail?: string,
    ) => {
        onApprovalAuditEvent?.({
            actionId: aiActionContract?.actionId || 'draft-action-contract',
            operation,
            title:
                operation === 'approval-confirmed'
                    ? 'Approval confirmed'
                    : operation === 'approval-revoked'
                        ? 'Approval revoked'
                        : `${operation.replace('-requested', '')} requested`,
            summary: aiActionContract?.contract?.summary,
            riskLevel: aiActionContract?.contract?.riskLevel,
            provider: aiActionContract?.provider,
            detail,
        });
    };

    const handleApprovalConfirmedChange = (confirmed: boolean) => {
        setActionApprovalConfirmed(confirmed);
        postApprovalAuditEvent(
            confirmed ? 'approval-confirmed' : 'approval-revoked',
            confirmed
                ? 'User confirmed review of risk, files, commands, verification, and rollback posture.'
                : 'User revoked approval before execution.'
        );
    };

    const handleAIActionOperation = (operation: 'apply' | 'verify' | 'rollback') => {
        postApprovalAuditEvent(
            `${operation}-requested` as StudioApprovalAuditOperation,
            `${operation} requested from Risk & Approval Gate.`
        );
        onAIActionCommand?.(operation);
    };

    return (
        <div className={`${studioClass.rail} ${studioClass.contextPanel}${isGuided ? ' is-guided-essentials' : ''}`}>
            <div className={studioClass.panelHeader}>
                <div className={studioClass.panelHeaderTitle}>
                    <span className={studioClass.kicker}>Operational Context</span>
                    <span className={studioClass.panelHeaderMeta}>
                        {isGuided ? 'Essentials only' : 'Evidence · Gates · Approval'}
                    </span>
                </div>
            </div>

            {isGuided ? (
                <GuidedReleaseGateSection policyGates={policyGates} releasePosture={releasePosture} />
            ) : (
                <OperationalPostureCard posture={operationalPosture} compactGuided={false} />
            )}

            {!isGuided ? (
            <section className={studioClass.contextSection}>
                <div className={studioClass.sectionLabel}>System Health</div>
                <div className={studioClass.card}>
                    <div className={studioClass.healthSummary}>
                        <div className="studio-health-ring">{healthPercent}%</div>
                        <div className={studioClass.healthMetrics}>
                            <div className={studioClass.metric}>
                                <span className={studioClass.metricLabel}>Healthy</span>
                                <span className={`${studioClass.metricValue} ${studioClass.toneOk}`}>{health.modulesOk}</span>
                            </div>
                            {health.modulesWarning > 0 ? (
                                <div className={studioClass.metric}>
                                    <span className={studioClass.metricLabel}>Warning</span>
                                    <span className={`${studioClass.metricValue} ${studioClass.toneWarn}`}>{health.modulesWarning}</span>
                                </div>
                            ) : null}
                            {health.modulesError > 0 ? (
                                <div className={studioClass.metric}>
                                    <span className={studioClass.metricLabel}>Error</span>
                                    <span className={`${studioClass.metricValue} ${studioClass.toneError}`}>{health.modulesError}</span>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    {health.systemLastCheck ? (
                        <div className={`${studioClass.caption} studio-u-text-subtle ${studioClass.mtSm}`}>
                            Last check · {health.systemLastCheck}
                        </div>
                    ) : null}
                </div>
            </section>
            ) : null}

            {!isGuided ? (
            <section className={studioClass.contextSection}>
                <div className={studioClass.sectionLabel}>Policy Gates</div>
                <div className={studioClass.stackSm}>
                    <PolicyGateBadge label="Flow State" state={policyGates.flowState} />
                    <PolicyGateBadge label="Telemetry" state={policyGates.telemetryState} />

                    <div className={studioClass.card}>
                        <div className={`${studioClass.kicker} ${studioClass.mbSm}`}>Release Posture</div>
                        <div
                            className={`${studioClass.releasePostureTitle} ${releasePostureToneClass(policyGates.releasePosture)}`}
                        >
                            {RELEASE_GATE_LABELS[policyGates.releasePosture]}
                        </div>
                        {policyGates.artifactId && userMode === 'expert' && (
                            <div className={studioClass.releaseArtifact}>
                                {policyGates.artifactId}
                            </div>
                        )}
                    </div>
                </div>
            </section>
            ) : null}

            {stabilizationKpiStatus ? (
                <section className={studioClass.contextSection}>
                    <div className={studioClass.sectionLabel}>Stabilization KPI</div>
                    <div className={studioClass.card}>
                        <div className={studioClass.rowSm}>
                            <span
                                className={`${studioClass.captionSmall} ${studioClass.uppercase} ${postureToneClass(
                                    stabilizationClaim.summaryState === 'PASS'
                                        ? 'ok'
                                        : stabilizationClaim.summaryState === 'HOLD'
                                          ? 'warning'
                                          : stabilizationClaim.summaryState === 'FAIL'
                                            ? 'error'
                                            : 'neutral',
                                )}`}
                            >
                                {stabilizationClaim.summaryState}
                            </span>
                            <span className={`${studioClass.caption} studio-u-text-subtle`}>
                                Enterprise claim · {stabilizationClaim.enterpriseClaimLabel}
                            </span>
                        </div>
                        {stabilizationClaim.verifyWarningsLine ? (
                            <p className={`${studioClass.caption} ${studioClass.toneWarn} ${studioClass.mtSm}`}>
                                {stabilizationClaim.verifyWarningsLine}
                            </p>
                        ) : null}
                        {!isGuided ? (
                            <div className={`${studioClass.traceGrid} ${studioClass.mtSm}`}>
                                <TraceabilityTile
                                    label="Route precision"
                                    value={
                                        stabilizationKpiStatus.metrics.routePrecision !== null
                                            ? `${stabilizationKpiStatus.metrics.routePrecision}%`
                                            : 'N/A'
                                    }
                                />
                                <TraceabilityTile
                                    label="Verify path"
                                    value={
                                        stabilizationKpiStatus.metrics.verifyPathCompletionRate !== null
                                            ? `${stabilizationKpiStatus.metrics.verifyPathCompletionRate}%`
                                            : 'N/A'
                                    }
                                />
                            </div>
                        ) : null}
                        {stabilizationClaim.normalizedBlockers.length > 0 ? (
                            <ul className={`studio-action-outcome__list ${studioClass.mtSm}`}>
                                {stabilizationClaim.normalizedBlockers.slice(0, isGuided ? 2 : 4).map((blocker) => (
                                    <li key={blocker}>{blocker}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className={`${studioClass.caption} studio-u-text-muted ${studioClass.mtSm}`}>
                                No stabilization blockers in the current window.
                            </p>
                        )}
                    </div>
                </section>
            ) : isGuided ? (
                <section className={studioClass.contextSection}>
                    <div className={studioClass.sectionLabel}>Stabilization KPI</div>
                    <div className={`${studioClass.card} studio-context-guided-empty`}>
                        <p className={`${studioClass.bodySmall} studio-u-text-muted`}>
                            Stabilization telemetry is not loaded yet. Run verify to hydrate enterprise KPIs before
                            claiming release readiness.
                        </p>
                    </div>
                </section>
            ) : null}

            {!isGuided && aiActionContract ? (
                <section className={studioClass.contextSection}>
                    <div className={studioClass.sectionLabel}>AI Action Gate</div>
                    <div
                        className={`${studioClass.card} ${studioClass.actionGateCard} ${contractValidationClass(aiActionContract.validation.status)}`}
                    >
                        <div className={studioClass.rowSm}>
                            {aiActionContract.validation.status === 'valid' ? (
                                <ShieldCheck size={16} className={studioClass.toneOk} />
                            ) : (
                                <ShieldAlert
                                    size={16}
                                    className={contractValidationClass(aiActionContract.validation.status)}
                                />
                            )}
                            <div className={studioClass.minW0}>
                                <div className={studioClass.h3}>
                                    {aiActionContract.contract?.summary || 'Action contract review'}
                                </div>
                                <div className={`${studioClass.caption} studio-u-text-subtle`}>
                                    {aiActionContract.validation.status.toUpperCase()}
                                    {aiActionContract.contract
                                        ? ` · ${aiActionContract.contract.actionType} · ${aiActionContract.contract.riskLevel} risk · ${Math.round(aiActionContract.contract.confidence * 100)}%`
                                        : ''}
                                </div>
                            </div>
                        </div>

                        <div className={studioClass.traceGrid}>
                            <TraceabilityTile label="Apply" value={aiActionContract.validation.canApply ? 'Ready' : 'Held'} />
                            <TraceabilityTile label="Verify" value={aiActionContract.validation.canVerify ? 'Ready' : 'Held'} />
                            <TraceabilityTile label="Rollback" value={aiActionContract.validation.canRollback ? 'Ready' : 'Held'} />
                        </div>

                        <ActionApprovalGateCard
                            gate={actionApprovalGate}
                            confirmed={actionApprovalConfirmed}
                            onConfirmedChange={handleApprovalConfirmedChange}
                        />

                        {aiActionContract.contract ? (
                            <div className="studio-review-panel">
                                <button
                                    type="button"
                                    onClick={() => setActionReviewOpen((open) => !open)}
                                    className={`${studioClass.collapseTrigger}${actionReviewOpen ? ' is-open' : ''}`}
                                >
                                    <span>Action Review</span>
                                    <span className="studio-u-text-subtle">
                                        {actionReviewOpen ? 'Hide' : 'Show'}
                                    </span>
                                </button>

                                {actionReviewOpen ? (
                                    <div className="studio-review-panel__body">
                                        <ReviewLine
                                            label="Action ID"
                                            value={aiActionContract.actionId || 'Not persisted yet'}
                                        />
                                        <ReviewLine
                                            label="Provider"
                                            value={aiActionContract.provider || 'ai-provider'}
                                        />
                                        <ReviewList
                                            label="Affected files"
                                            items={aiActionContract.contract.affectedFiles}
                                            empty="No files declared"
                                        />
                                        <ReviewList
                                            label="Patch plan"
                                            items={aiActionContract.contract.proposedPatches.map((patch) =>
                                                [patch.relativePath, patch.summary].filter(Boolean).join(' - ')
                                            )}
                                            empty="No patch diff supplied"
                                            monospace
                                        />
                                        <ReviewList
                                            label="Apply commands"
                                            items={aiActionContract.contract.proposedCommands}
                                            empty="No apply commands"
                                            monospace
                                        />
                                        <ReviewList
                                            label="Verification"
                                            items={aiActionContract.contract.verificationCommands}
                                            empty="No verification commands"
                                            monospace
                                        />
                                        <ReviewList
                                            label="Rollback"
                                            items={aiActionContract.contract.rollbackPlan}
                                            empty="No rollback plan"
                                            monospace
                                        />
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {onAIActionCommand ? (
                            <div className={studioClass.traceGrid3}>
                                <AIActionButton
                                    label="Apply"
                                    disabled={!actionApprovalGate.canApplyAfterApproval || !actionApprovalConfirmed}
                                    onClick={() => handleAIActionOperation('apply')}
                                />
                                <AIActionButton
                                    label="Verify"
                                    disabled={!actionApprovalGate.canVerify}
                                    onClick={() => handleAIActionOperation('verify')}
                                />
                                <AIActionButton
                                    label="Rollback"
                                    disabled={!actionApprovalGate.canRollbackAfterApproval || !actionApprovalConfirmed}
                                    onClick={() => handleAIActionOperation('rollback')}
                                />
                            </div>
                        ) : null}

                        {aiActionContract.parseError ? (
                            <div className={`${studioClass.caption} ${studioClass.toneError}`}>
                                Contract parse failed: {aiActionContract.parseError}
                            </div>
                        ) : null}

                        {aiActionContract.validation.issues.length > 0 ? (
                            <div className={studioClass.stackXs}>
                                {aiActionContract.validation.issues.slice(0, 3).map((issue) => (
                                    <div
                                        key={`${issue.code}-${issue.detail}`}
                                        className={`${studioClass.caption} ${issue.severity === 'error' ? studioClass.toneError : studioClass.toneWarn} ${studioClass.lineHeight145}`}
                                    >
                                        {issue.code}: {issue.detail}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className={`${studioClass.caption} studio-u-text-muted`}>
                                Contract passed strict validation. Apply still requires explicit user approval.
                            </div>
                        )}
                    </div>
                </section>
            ) : null}

            {!isGuided && aiActionRegistry?.entries.length ? (
                <section className={studioClass.contextSection}>
                    <div className={studioClass.sectionLabel}>AI Action History</div>
                    <div className={studioClass.stackSm}>
                        {aiActionRegistry.entries.slice(0, isGuided ? 2 : 4).map((entry) => {
                            const latestExecution = entry.executions[0];
                            const statusClass = lifecycleStatusClass(entry.lifecycleStatus);
                            return (
                                <div key={entry.id} className={studioClass.card}>
                                    <div className={studioClass.registryCardHead}>
                                        <span className={`${studioClass.bodySmall} ${studioClass.fw600}`}>
                                            {entry.summary}
                                        </span>
                                        <span className={`${studioClass.captionSmall} ${statusClass} ${studioClass.uppercase} ${studioClass.fw750}`}>
                                            {entry.lifecycleStatus}
                                        </span>
                                    </div>
                                    <div className={`${studioClass.caption} studio-u-text-subtle ${studioClass.registryCardMeta}`}>
                                        {entry.actionType} · {entry.riskLevel} risk · validation {entry.validationStatus} · {new Date(entry.createdAt).toLocaleString()}
                                    </div>
                                    {latestExecution ? (
                                        <div className={studioClass.registryCardExecution}>
                                            <div className={`${studioClass.caption} ${latestExecution.ok ? studioClass.toneOk : studioClass.toneError}`}>
                                                {latestExecution.operation}: {latestExecution.ok ? 'PASS' : 'FAIL'}
                                                {typeof latestExecution.commandCount === 'number'
                                                    ? ` · ${latestExecution.commandCount} command${latestExecution.commandCount === 1 ? '' : 's'}`
                                                    : ''}
                                                {latestExecution.failedCommandCount
                                                    ? ` · ${latestExecution.failedCommandCount} failed`
                                                    : ''}
                                            </div>
                                            {latestExecution.evidenceSha256 ? (
                                                <div className={`${studioClass.codeBreak} studio-u-text-subtle`}>
                                                    sha256:{' '}
                                                    {latestExecution.evidenceSha256.slice(0, 12)}
                                                    {latestExecution.evidenceSizeBytes
                                                        ? ` · ${Math.max(1, Math.round(latestExecution.evidenceSizeBytes / 1024))} KB`
                                                        : ''}
                                                </div>
                                            ) : null}
                                            {latestExecution.failedCommands?.length ? (
                                                <div className={studioClass.stackXs}>
                                                    {latestExecution.failedCommands.slice(0, 2).map((command) => (
                                                        <div
                                                            key={`${entry.id}-${command}`}
                                                            className={`${studioClass.reviewItem} ${studioClass.reviewItemMono} ${studioClass.toneError}`}
                                                        >
                                                            {command}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                            {latestExecution.evidencePath && onRevealEvidence ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onRevealEvidence(latestExecution.evidencePath!)}
                                                    className={`${studioClass.btnGhost} ${studioClass.selfStart}`}
                                                >
                                                    Reveal evidence
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    {latestExecution?.preflight?.stale ? (
                                        <div className={`${studioClass.caption} ${studioClass.toneError} ${studioClass.mtSm}`}>
                                            Preflight stale: {latestExecution.preflight.issues.slice(0, 1).join('; ')}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            {userMode === 'expert' ? (
                <>
                    <section className={studioClass.contextSection}>
                        <div className={studioClass.sectionLabel}>Active Signals</div>
                        <div className={studioClass.stackSm}>
                            <SignalRow
                                icon={<TrendingDown size={13} />}
                                label="Module errors"
                                value={String(health.modulesError)}
                                tone={health.modulesError > 0 ? 'error' : 'ok'}
                            />
                            <SignalRow
                                icon={<AlertTriangle size={13} />}
                                label="Warnings"
                                value={String(health.modulesWarning)}
                                tone={health.modulesWarning > 0 ? 'warning' : 'ok'}
                            />
                            <SignalRow
                                icon={<CheckCircle2 size={13} />}
                                label="Flow gate"
                                value={policyGates.flowState}
                                tone={policyGates.flowState === 'blocking' ? 'error' : policyGates.flowState === 'warning' ? 'warning' : 'ok'}
                            />
                            <SignalRow
                                icon={<ShieldAlert size={13} />}
                                label="Telemetry"
                                value={policyGates.telemetryState}
                                tone={policyGates.telemetryState === 'stale' ? 'error' : policyGates.telemetryState === 'partial' ? 'warning' : 'neutral'}
                            />
                            <SignalRow
                                icon={<Clock size={13} />}
                                label="Last check"
                                value={health.systemLastCheck || 'Pending'}
                                tone="neutral"
                            />
                        </div>
                    </section>

                    <section className={studioClass.contextSection}>
                        <div className={studioClass.sectionLabel}>Traceability</div>
                        <div className={studioClass.traceGrid}>
                            <TraceabilityTile label="Evidence coverage" value={evidenceCoverageLabel} />
                            <TraceabilityTile label="Confidence band" value={confidenceLabel} />
                            <TraceabilityTile label="Drill-down" value={drillDownLabel} />
                            <TraceabilityTile label="Proof readiness" value={proofReadinessLabel} />
                        </div>
                    </section>

                    <section className={studioClass.contextSection}>
                        <div className={studioClass.sectionLabel}>Module Graph</div>

                        <div className={studioClass.moduleGraphFilters}>
                            <div className={studioClass.moduleGraphFiltersRow}>
                                <select
                                    aria-label="Filter module graph by framework"
                                    value={frameworkFilter}
                                    onChange={(e) => setFrameworkFilter(e.target.value as 'all' | ModuleGraphItem['framework'])}
                                    className={`${studioClass.fieldSelect} ${studioClass.flexGrowField}`}
                                >
                                    <option value="all">All frameworks</option>
                                    {frameworkOptions.map((framework) => (
                                        <option key={framework} value={framework}>{framework}</option>
                                    ))}
                                </select>
                                <select
                                    aria-label="Filter module graph by severity"
                                    value={severityFilter}
                                    onChange={(e) => setSeverityFilter(e.target.value as 'all' | ModuleGraphItem['severity'])}
                                    className={`${studioClass.fieldSelect} ${studioClass.flexGrowField}`}
                                >
                                    <option value="all">All severities</option>
                                    <option value="healthy">Healthy</option>
                                    <option value="warning">Warning</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>
                            <input
                                aria-label="Search module graph"
                                type="text"
                                placeholder="Search modules"
                                value={moduleSearch}
                                onChange={(e) => setModuleSearch(e.target.value)}
                                className={studioClass.field}
                            />
                        </div>

                        <div className={studioClass.stackMd}>
                            {moduleGroups.length === 0 ? (
                                <div className={studioClass.moduleEmpty}>
                                    No modules match current filters.
                                </div>
                            ) : (
                                moduleGroups.map((group) => (
                                    <div key={group.framework} className={studioClass.card}>
                                        <div className={studioClass.moduleGroupHead}>
                                            <div className={studioClass.moduleGroupTitle}>
                                                {group.framework}
                                            </div>
                                            <span className={`${studioClass.captionSmall} studio-u-text-subtle`}>
                                                {group.modules.length} module{group.modules.length === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                        <div className={studioClass.stackSm}>
                                            {group.modules.map((module) => (
                                                <div key={module.id} className="studio-module-row">
                                                    <div className="studio-module-row__head">
                                                        <span className="studio-module-row__title">{module.name}</span>
                                                        <span
                                                            className={`studio-module-row__severity ${moduleSeverityClass(module.severity)}`}
                                                        >
                                                            {module.severity}
                                                        </span>
                                                    </div>
                                                    <div className="studio-module-row__body">{module.summary}</div>
                                                    <div className="studio-module-row__meta">
                                                        <span>{module.freshness}</span>
                                                        <span className={studioClass.uppercase}>{module.framework}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </>
            ) : !isGuided ? (
                <section className={studioClass.contextSection}>
                    <div className={studioClass.sectionLabel}>Quick Insight</div>
                    <div className={studioClass.traceGrid}>
                        <TraceabilityTile label="Coverage" value={evidenceCoverageLabel} />
                        <TraceabilityTile label="Release" value={RELEASE_GATE_LABELS[policyGates.releasePosture]} />
                    </div>
                </section>
            ) : null}

            {!isGuided ? (
            <section className={`${studioClass.contextSection} ${studioClass.scrollSection}`}>
                <div className={studioClass.sectionLabel}>Related Files</div>
                <div className={studioClass.stackSm}>
                    {visibleRelatedFiles.length === 0 ? (
                        <div className="studio-context-empty">No related files</div>
                    ) : (
                        visibleRelatedFiles.map((file, idx) => {
                            const badge = getFileHealthBadge(file.health);
                            return (
                                <div
                                    key={idx}
                                    className={`studio-module-row${onRevealEvidence ? ` ${studioClass.moduleRowClickable}` : ''}`}
                                    onClick={() => onRevealEvidence?.(file.path)}
                                    onKeyDown={(event) => {
                                        if (onRevealEvidence && (event.key === 'Enter' || event.key === ' ')) {
                                            event.preventDefault();
                                            onRevealEvidence(file.path);
                                        }
                                    }}
                                    role={onRevealEvidence ? 'button' : undefined}
                                    tabIndex={onRevealEvidence ? 0 : undefined}
                                >
                                    <div className="studio-module-row__head">
                                        <span className="studio-module-row__title">{file.path}</span>
                                        <span className={`studio-module-row__severity ${badge.toneClass}`}>
                                            {badge.label}
                                        </span>
                                    </div>
                                    {file.freshness ? (
                                        <div className="studio-module-row__meta">{file.freshness}</div>
                                    ) : null}
                                </div>
                            );
                        })
                    )}
                </div>
            </section>
            ) : null}
        </div>
    );
};

const TraceabilityTile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="studio-trace-tile">
        <div className="studio-trace-tile__label">{label}</div>
        <div className="studio-trace-tile__value">{value}</div>
    </div>
);

const AIActionButton: React.FC<{
    label: string;
    disabled: boolean;
    onClick: () => void;
}> = ({ label, disabled, onClick }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={disabled ? studioClass.btnGhost : studioClass.btnPrimary}
    >
        {label}
    </button>
);

const ActionApprovalGateCard: React.FC<{
    gate: ReturnType<typeof buildStudioActionApprovalGate>;
    confirmed: boolean;
    onConfirmedChange: (confirmed: boolean) => void;
}> = ({ gate, confirmed, onConfirmedChange }) => {
    const approvalDisabled = gate.hardBlocked || !gate.requiresApproval;
    const toneClass =
        gate.tone === 'error' ? 'is-error' : gate.tone === 'warning' ? 'is-warning' : gate.tone === 'ok' ? 'is-ok' : '';

    return (
        <div className={`studio-approval-card ${toneClass}`.trim()}>
            <div className={studioClass.approvalCardHead}>
                <div className={studioClass.minW0}>
                    <div className={studioClass.kicker}>Risk & Approval Gate</div>
                    <div className={`${studioClass.bodySmall} ${approvalToneClass(gate.tone)} ${studioClass.fw750} ${studioClass.mtSm}`}>
                        {gate.label}
                    </div>
                    <div className={`${studioClass.caption} studio-u-text-muted ${studioClass.mtSm} ${studioClass.lineHeight145}`}>
                        {gate.summary}
                    </div>
                </div>
                <span className={`${studioClass.statusPill} ${approvalToneClass(gate.tone)}`}>{gate.riskLabel}</span>
            </div>

            <div className={studioClass.approvalMetricGrid}>
                {gate.metrics.map((metric) => (
                    <div key={metric.label} className={studioClass.approvalMetric}>
                        <div className={studioClass.metricLabel}>{metric.label}</div>
                        <div className={`${studioClass.metricValue} ${studioClass.metricValueFull} ${approvalToneClass(metric.tone)} ${studioClass.mtSm}`} title={metric.value}>
                            {metric.value}
                        </div>
                    </div>
                ))}
            </div>

            {gate.holds.length > 0 ? (
                <div className={studioClass.approvalHolds}>
                    {gate.holds.slice(0, 4).map((hold) => (
                        <div
                            key={`${hold.code}-${hold.detail}`}
                            className={`${studioClass.caption} ${approvalToneClass(hold.tone)} ${studioClass.lineHeight145}`}
                        >
                            {hold.code}: {hold.detail}
                        </div>
                    ))}
                </div>
            ) : null}

            <label
                className={`${studioClass.approvalCheck}${approvalDisabled ? ' is-disabled' : ''}`}
            >
                <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={approvalDisabled}
                    onChange={(event) => onConfirmedChange(event.currentTarget.checked)}
                    className={studioClass.approvalCheckInput}
                />
                <span>
                    I reviewed risk, affected files, commands, verification, and rollback posture.
                </span>
            </label>
        </div>
    );
};

const ReviewLine: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className={studioClass.reviewLine}>
        <span className={`${studioClass.captionSmall} studio-u-text-subtle`}>
            {label}
        </span>
        <span className={`${studioClass.caption} studio-u-text-muted`}>
            {value}
        </span>
    </div>
);

const ReviewList: React.FC<{
    label: string;
    items: string[];
    empty: string;
    monospace?: boolean;
}> = ({ label, items, empty, monospace = false }) => {
    const visibleItems = items.filter(Boolean).slice(0, 6);

    return (
        <div className={studioClass.reviewList}>
            <span className={`${studioClass.captionSmall} studio-u-text-subtle`}>
                {label}
            </span>
            {visibleItems.length > 0 ? (
                <div className={studioClass.stackXs}>
                    {visibleItems.map((item, index) => (
                        <div
                            key={`${label}-${item}-${index}`}
                            className={`${studioClass.reviewItem}${monospace ? ` ${studioClass.reviewItemMono}` : ''}`}
                        >
                            {item}
                        </div>
                    ))}
                    {items.length > visibleItems.length ? (
                        <span className={`${studioClass.caption} studio-u-text-subtle`}>
                            +{items.length - visibleItems.length} more
                        </span>
                    ) : null}
                </div>
            ) : (
                <span className={`${studioClass.caption} studio-u-text-subtle`}>
                    {empty}
                </span>
            )}
        </div>
    );
};

interface PolicyGateBadgeProps {
    label: string;
    state: 'passing' | 'warning' | 'blocking' | 'complete' | 'partial' | 'stale';
}

const PolicyGateBadge: React.FC<PolicyGateBadgeProps> = ({ label, state }) => {
    const toneClass = policyGateStateClass(state);

    return (
        <div className={`studio-gate-row ${toneClass}`}>
            <span className="studio-gate-row__label">{label}</span>
            <span className={`studio-gate-row__state ${toneClass}`}>
                {state}
            </span>
        </div>
    );
};

interface SignalRowProps {
    icon: React.ReactNode;
    label: string;
    value: string;
    tone: 'ok' | 'warning' | 'error' | 'neutral';
}

const SignalRow: React.FC<SignalRowProps> = ({ icon, label, value, tone }) => {
    const toneClass = approvalToneClass(
        tone === 'neutral' ? 'neutral' : tone === 'ok' ? 'ok' : tone === 'warning' ? 'warning' : 'error',
    );

    return (
        <div className={studioClass.signalRow}>
            <span className={`${studioClass.signalRowIcon} ${toneClass}`}>{icon}</span>
            <span className="studio-signal-row__label">{label}</span>
            <span className={`studio-signal-row__value ${toneClass}`}>{value}</span>
        </div>
    );
};
