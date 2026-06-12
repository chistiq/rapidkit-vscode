import React, { useEffect, useMemo, useState } from 'react';
import { studioClass } from '../styles/studioUi';
import type { ActionOutcomePresentation } from '../../../lib/incidentStudioActionOutcomePresentation';
import type {
    IncidentReproPackEvidence,
    NormalizedIncidentActionResultPayload,
} from '../../../lib/incidentStudioPayload';
import { resolveMultiFilePatchApplyArgs } from '../../../lib/incidentStudioPayload';
import { buildReplayQueryFromIncidentReproPack } from '../../../lib/incidentStudioReproPack';

export type ActionOutcomeCallbacks = {
    onExportReproPack?: (reproPack: IncidentReproPackEvidence) => void;
    onImportReproPack?: () => void;
    onReplayReproPack?: (query: string) => void;
    onApplyPatch?: (patchId: string, acceptedPaths: string[], branchSafeApply: boolean) => void;
};

interface ActionOutcomePanelProps {
    presentation: ActionOutcomePresentation;
    actionResult?: NormalizedIncidentActionResultPayload | null;
    callbacks?: ActionOutcomeCallbacks;
}

function bannerClassForTone(tone: ActionOutcomePresentation['headline']['tone']): string {
    if (tone === 'failure') {
        return studioClass.bannerError;
    }
    if (tone === 'warning') {
        return studioClass.bannerWarn;
    }
    return studioClass.banner;
}

export const ActionOutcomePanel: React.FC<ActionOutcomePanelProps> = ({
    presentation,
    actionResult,
    callbacks,
}) => {
    const { headline, releaseSignalLabel, decisionClarity, reproPack, memoryTimeline } = presentation;
    const reproPackEvidence = actionResult?.incidentReproPack;
    const multiFilePatch = actionResult?.multiFilePatch;
    const pendingPatches = useMemo(
        () => multiFilePatch?.patches.filter((patch) => patch.status === 'pending') ?? [],
        [multiFilePatch],
    );
    const pendingPaths = useMemo(
        () => pendingPatches.map((patch) => patch.relativePath),
        [pendingPatches],
    );
    const [selectedPaths, setSelectedPaths] = useState<ReadonlySet<string>>(() => new Set(pendingPaths));
    const [branchSafeApply, setBranchSafeApply] = useState(false);

    useEffect(() => {
        setSelectedPaths(new Set(pendingPaths));
        setBranchSafeApply(false);
    }, [multiFilePatch?.patchId, pendingPaths.join('|')]);

    const togglePatchPath = (path: string) => {
        setSelectedPaths((current) => {
            const next = new Set(current);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const handleApplyPatch = () => {
        if (!multiFilePatch || !callbacks?.onApplyPatch || pendingPaths.length === 0) {
            return;
        }

        const args = resolveMultiFilePatchApplyArgs({
            patchId: multiFilePatch.patchId,
            allPaths: pendingPaths,
            selectedPaths,
            branchSafeApply,
        });

        if (args.acceptedPaths.length === 0) {
            return;
        }

        callbacks.onApplyPatch(args.patchId, args.acceptedPaths, args.branchSafeApply);
    };

    const showReproActions =
        reproPack &&
        (callbacks?.onExportReproPack || callbacks?.onImportReproPack || callbacks?.onReplayReproPack);
    const showPatchReview = pendingPatches.length > 0 && callbacks?.onApplyPatch;

    return (
        <section className="studio-action-outcome" aria-label="Latest action outcome">
            <div className={bannerClassForTone(headline.tone)}>
                <strong>{headline.title}</strong>
                <p>{headline.description}</p>
                {releaseSignalLabel ? <p className="studio-action-outcome__meta">{releaseSignalLabel}</p> : null}
            </div>

            {decisionClarity ? (
                <div className="studio-action-outcome__block">
                    <p className={studioClass.sectionLabel}>Decision clarity</p>
                    <p>Next action: {decisionClarity.nextAction}</p>
                    {decisionClarity.verifyLine ? <p>{decisionClarity.verifyLine}</p> : null}
                    {decisionClarity.evidenceLine ? <p>{decisionClarity.evidenceLine}</p> : null}
                </div>
            ) : null}

            {reproPack ? (
                <div className="studio-action-outcome__block">
                    <p className={studioClass.sectionLabel}>Incident repro pack</p>
                    <p>Pack ID: {reproPack.packId}</p>
                    <p>Sensitivity: {reproPack.sensitivityLabel}</p>
                    <p>{reproPack.verifyChecklistCount} verify checks captured</p>
                    {showReproActions ? (
                        <div className={studioClass.bannerActions}>
                            {callbacks?.onExportReproPack && reproPackEvidence ? (
                                <button
                                    type="button"
                                    className={studioClass.btnGhost}
                                    onClick={() => callbacks.onExportReproPack?.(reproPackEvidence)}
                                >
                                    Export
                                </button>
                            ) : null}
                            {callbacks?.onImportReproPack ? (
                                <button
                                    type="button"
                                    className={studioClass.btnGhost}
                                    onClick={() => callbacks.onImportReproPack?.()}
                                >
                                    Import
                                </button>
                            ) : null}
                            {callbacks?.onReplayReproPack && reproPackEvidence ? (
                                <button
                                    type="button"
                                    className={studioClass.btnPrimary}
                                    onClick={() =>
                                        callbacks.onReplayReproPack?.(
                                            buildReplayQueryFromIncidentReproPack(reproPackEvidence),
                                        )
                                    }
                                >
                                    Replay
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {showPatchReview && multiFilePatch ? (
                <div className="studio-action-outcome__block">
                    <p className={studioClass.sectionLabel}>Multi-file patch review</p>
                    <p>
                        {pendingPatches.length} pending file
                        {pendingPatches.length === 1 ? '' : 's'} · patch {multiFilePatch.patchId}
                    </p>
                    <ul className="studio-action-outcome__patch-list">
                        {pendingPatches.map((patch) => (
                            <li key={patch.relativePath}>
                                <label className="studio-action-outcome__patch-row">
                                    <input
                                        type="checkbox"
                                        checked={selectedPaths.has(patch.relativePath)}
                                        onChange={() => togglePatchPath(patch.relativePath)}
                                    />
                                    <span>{patch.relativePath}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                    <label className="studio-action-outcome__patch-row">
                        <input
                            type="checkbox"
                            checked={branchSafeApply}
                            onChange={(event) => setBranchSafeApply(event.target.checked)}
                        />
                        <span>Apply on safety branch</span>
                    </label>
                    <button
                        type="button"
                        className={studioClass.btnPrimary}
                        disabled={selectedPaths.size === 0}
                        onClick={handleApplyPatch}
                    >
                        Apply selected patches
                    </button>
                </div>
            ) : null}

            {memoryTimeline ? (
                <div className="studio-action-outcome__block">
                    <p className={studioClass.sectionLabel}>{memoryTimeline.heading}</p>
                    <ul className="studio-action-outcome__list">
                        {memoryTimeline.entries.map((entry) => (
                            <li key={entry.id}>{entry.summary}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
};
