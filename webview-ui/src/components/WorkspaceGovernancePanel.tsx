import {
    Database,
    HardDrive,
    RefreshCw,
    Scale,
    Server,
    ShieldCheck,
    Sparkles,
    Wrench,
} from 'lucide-react';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import { findEvidenceCard } from '@/lib/dashboardEvidence';
import type { WorkspaceStatus } from '@/types';
import { ActionTile, ActionTileGrid } from './ActionTile';
import { ColumnHeader } from './SectionHeader';

interface WorkspaceGovernancePanelProps {
    workspaceStatus: WorkspaceStatus;
    evidence?: DashboardEvidencePayload | null;
    onBootstrap: () => void;
    onSetup: () => void;
    onReadiness: () => void;
    onMirrorStatus: () => void;
    onMirrorSync: () => void;
    onCacheStatus: () => void;
    onPolicy: () => void;
    onInfra: () => void;
}

function governanceDetail(
    evidence: DashboardEvidencePayload | null | undefined,
    cardId: Parameters<typeof findEvidenceCard>[1],
    fallback: string
): string {
    const card = findEvidenceCard(evidence, cardId);
    if (!card || card.status === 'missing') {
        return fallback;
    }
    return card.summary;
}

export function WorkspaceGovernancePanel({
    workspaceStatus,
    evidence,
    onBootstrap,
    onSetup,
    onReadiness,
    onMirrorStatus,
    onMirrorSync,
    onCacheStatus,
    onPolicy,
    onInfra,
}: WorkspaceGovernancePanelProps) {
    const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
    const scopeLabel = workspaceStatus.workspaceName || 'Workspace governance';
    const bootstrapCard = findEvidenceCard(evidence, 'bootstrap');
    const doctorCard = findEvidenceCard(evidence, 'doctor');
    const readinessCard = findEvidenceCard(evidence, 'readiness');
    const mirrorCard = findEvidenceCard(evidence, 'mirror');
    const cacheCard = findEvidenceCard(evidence, 'cache');
    const policyCard = findEvidenceCard(evidence, 'policy');
    const infraCard = findEvidenceCard(evidence, 'infra');

    return (
        <section className="workspace-governance-panel section">
            <ColumnHeader
                title="Governance"
                subtitle={hasWorkspace ? scopeLabel : 'Select a workspace to unlock'}
                scope="workspace"
            />
            <ActionTileGrid layout="governance">
                <ActionTile
                    icon={<Sparkles size={15} />}
                    label="Bootstrap"
                    detail={governanceDetail(evidence, 'bootstrap', 'Profile compliance')}
                    evidenceStatus={bootstrapCard?.status}
                    onClick={onBootstrap}
                    disabled={!hasWorkspace}
                    title="rapidkit bootstrap"
                />
                <ActionTile
                    icon={<Wrench size={15} />}
                    label="Setup"
                    detail={governanceDetail(evidence, 'doctor', 'Runtime toolchains')}
                    evidenceStatus={doctorCard?.status}
                    onClick={onSetup}
                    disabled={!hasWorkspace}
                    title="rapidkit setup"
                />
                <ActionTile
                    icon={<ShieldCheck size={15} />}
                    label="Readiness"
                    detail={governanceDetail(evidence, 'readiness', 'Release evidence')}
                    evidenceStatus={readinessCard?.status}
                    onClick={onReadiness}
                    disabled={!hasWorkspace}
                    title="rapidkit readiness"
                />
                <ActionTile
                    icon={<Database size={15} />}
                    label="Mirror"
                    detail={governanceDetail(evidence, 'mirror', 'Replication status')}
                    evidenceStatus={mirrorCard?.status}
                    onClick={onMirrorStatus}
                    disabled={!hasWorkspace}
                    title="rapidkit mirror status"
                />
                <ActionTile
                    icon={<RefreshCw size={15} />}
                    label="Sync"
                    detail="Refresh mirror"
                    onClick={onMirrorSync}
                    disabled={!hasWorkspace}
                    title="rapidkit mirror sync"
                />
                <ActionTile
                    icon={<HardDrive size={15} />}
                    label="Cache"
                    detail={governanceDetail(evidence, 'cache', 'Package cache')}
                    evidenceStatus={cacheCard?.status}
                    onClick={onCacheStatus}
                    disabled={!hasWorkspace}
                    title="rapidkit cache status"
                />
                <ActionTile
                    icon={<Scale size={15} />}
                    label="Policy"
                    detail={governanceDetail(evidence, 'policy', 'Governance rules')}
                    evidenceStatus={policyCard?.status}
                    onClick={onPolicy}
                    disabled={!hasWorkspace}
                    title="rapidkit workspace policy show"
                />
                <ActionTile
                    icon={<Server size={15} />}
                    label="Infra"
                    detail={governanceDetail(evidence, 'infra', 'Sidecar compose')}
                    evidenceStatus={infraCard?.status}
                    onClick={onInfra}
                    disabled={!hasWorkspace}
                    title="rapidkit infra"
                />
            </ActionTileGrid>
        </section>
    );
}
