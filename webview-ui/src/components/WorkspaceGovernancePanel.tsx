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
import type { WorkspaceStatus } from '@/types';
import { ActionTile, ActionTileGrid } from './ActionTile';
import { ColumnHeader } from './SectionHeader';

interface WorkspaceGovernancePanelProps {
    workspaceStatus: WorkspaceStatus;
    onBootstrap: () => void;
    onSetup: () => void;
    onReadiness: () => void;
    onMirrorStatus: () => void;
    onMirrorSync: () => void;
    onCacheStatus: () => void;
    onPolicy: () => void;
    onInfra: () => void;
}

export function WorkspaceGovernancePanel({
    workspaceStatus,
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

    return (
        <section className="workspace-governance-panel section">
            <ColumnHeader
                title="Governance"
                subtitle={hasWorkspace ? scopeLabel : 'Select a workspace to unlock'}
                scope="workspace"
            />
            <ActionTileGrid layout="operate">
                <ActionTile
                    icon={<Sparkles size={15} />}
                    label="Bootstrap"
                    detail="Profile compliance"
                    onClick={onBootstrap}
                    disabled={!hasWorkspace}
                    title="rapidkit bootstrap"
                />
                <ActionTile
                    icon={<Wrench size={15} />}
                    label="Setup"
                    detail="Runtime toolchains"
                    onClick={onSetup}
                    disabled={!hasWorkspace}
                    title="rapidkit setup"
                />
                <ActionTile
                    icon={<ShieldCheck size={15} />}
                    label="Readiness"
                    detail="Release evidence"
                    onClick={onReadiness}
                    disabled={!hasWorkspace}
                    title="rapidkit readiness"
                />
                <ActionTile
                    icon={<Database size={15} />}
                    label="Mirror"
                    detail="Replication status"
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
                    detail="Package cache"
                    onClick={onCacheStatus}
                    disabled={!hasWorkspace}
                    title="rapidkit cache status"
                />
                <ActionTile
                    icon={<Scale size={15} />}
                    label="Policy"
                    detail="Governance rules"
                    onClick={onPolicy}
                    disabled={!hasWorkspace}
                    title="rapidkit workspace policy show"
                />
                <ActionTile
                    icon={<Server size={15} />}
                    label="Infra"
                    detail="Sidecar compose"
                    onClick={onInfra}
                    disabled={!hasWorkspace}
                    title="rapidkit infra"
                />
            </ActionTileGrid>
        </section>
    );
}
