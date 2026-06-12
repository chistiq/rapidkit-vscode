import { Settings2 } from 'lucide-react';
import { CommandCheatsheet } from '@/components/CommandCheatsheet';
import { EnterpriseDashboardFlow } from '@/components/EnterpriseDashboardFlow';
import { WorkspaiEmptyState } from '@/components/WorkspaiEmptyState';
import { WorkspaceGovernancePanel } from '@/components/WorkspaceGovernancePanel';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import type { DashboardSection } from '@/lib/dashboardSections';
import type { WorkspaceStatus } from '@/types';

type Framework = 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';

interface DashboardOperateSectionProps {
    hasWorkspace: boolean;
    workspaceName?: string;
    workspaceProfile?: string;
    workspaceStatus: WorkspaceStatus;
    evidence: DashboardEvidencePayload | null;
    selectedFramework: Framework;
    onSelectFramework: (framework: Framework) => void;
    onOpenProjectBuilder: (framework: Framework) => void;
    onOpenManualProject: (framework: Framework) => void;
    onRunWorkspaceCommand?: (command: string, data?: Record<string, unknown>) => void;
    onRunFixPreview: () => void;
    onRunChangeImpact: () => void;
    onRunTerminalBridge: () => void;
    onOpenIncidentStudio: () => void;
    onNavigateSection: (section: DashboardSection) => void;
    onCreateWorkspace: () => void;
    onBootstrap: () => void;
    onSetup: () => void;
    onReadiness: () => void;
    onMirrorStatus: () => void;
    onMirrorSync: () => void;
    onCacheStatus: () => void;
    onPolicy: () => void;
    onInfra: () => void;
}

export function DashboardOperateSection({
    hasWorkspace,
    workspaceName,
    workspaceProfile,
    workspaceStatus,
    evidence,
    selectedFramework,
    onSelectFramework,
    onOpenProjectBuilder,
    onOpenManualProject,
    onRunWorkspaceCommand,
    onRunFixPreview,
    onRunChangeImpact,
    onRunTerminalBridge,
    onOpenIncidentStudio,
    onNavigateSection,
    onCreateWorkspace,
    onBootstrap,
    onSetup,
    onReadiness,
    onMirrorStatus,
    onMirrorSync,
    onCacheStatus,
    onPolicy,
    onInfra,
}: DashboardOperateSectionProps) {
    return (
        <div className="dashboard-operate-layout">
            {!hasWorkspace ? (
                <WorkspaiEmptyState
                    icon={<Settings2 size={18} />}
                    title="Select a workspace to operate"
                    description={
                        <>
                            Operate actions need an active workspace — doctor, bootstrap, project
                            builders, and governance tiles unlock after selection.
                        </>
                    }
                    actions={
                        <>
                            <button
                                type="button"
                                className="ws-btn ws-btn--primary"
                                onClick={() => onNavigateSection('workspaces')}
                            >
                                Open Workspaces
                            </button>
                            <button
                                type="button"
                                className="ws-btn"
                                onClick={onCreateWorkspace}
                            >
                                Create workspace
                            </button>
                        </>
                    }
                />
            ) : (
                <>
                    <EnterpriseDashboardFlow
                        workspaceName={workspaceName}
                        workspaceProfile={workspaceProfile}
                        workspaceStatus={workspaceStatus}
                        selectedFramework={selectedFramework}
                        onSelectFramework={onSelectFramework}
                        onOpenProjectBuilder={onOpenProjectBuilder}
                        onOpenManualProject={onOpenManualProject}
                        onRunWorkspaceCommand={onRunWorkspaceCommand}
                        onRunFixPreview={onRunFixPreview}
                        onRunChangeImpact={onRunChangeImpact}
                        onRunTerminalBridge={onRunTerminalBridge}
                        onOpenIncidentStudio={onOpenIncidentStudio}
                    />

                    <WorkspaceGovernancePanel
                        workspaceStatus={workspaceStatus}
                        evidence={evidence}
                        onBootstrap={onBootstrap}
                        onSetup={onSetup}
                        onReadiness={onReadiness}
                        onMirrorStatus={onMirrorStatus}
                        onMirrorSync={onMirrorSync}
                        onCacheStatus={onCacheStatus}
                        onPolicy={onPolicy}
                        onInfra={onInfra}
                    />
                </>
            )}

            <CommandCheatsheet />
        </div>
    );
}
