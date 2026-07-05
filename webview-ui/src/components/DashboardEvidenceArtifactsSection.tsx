import { DashboardEvidenceSection } from '@/components/DashboardEvidenceSection';
import type {
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
} from '@/lib/dashboardEvidence';
import type { EvidenceViewMode } from '@/lib/dashboardEvidenceViewMode';
import type { DashboardOperateZone } from '@/lib/dashboardOperateZones';
import type { DashboardScopeDescriptor } from '@/lib/dashboardScope';
import type { DashboardSection } from '@/lib/dashboardSections';

export type DashboardEvidenceArtifactsSectionProps = {
  evidence: DashboardEvidencePayload | null;
  hasWorkspace: boolean;
  hasProject?: boolean;
  scope: DashboardScopeDescriptor;
  workspace?: { path?: string; name?: string };
  evidenceViewMode: EvidenceViewMode;
  onEvidenceViewModeChange: (mode: EvidenceViewMode) => void;
  pendingCardIds?: DashboardEvidenceCardId[];
  pendingRunCardIds?: DashboardEvidenceCardId[];
  pendingRefreshCardIds?: DashboardEvidenceCardId[];
  isEvidenceFullRefreshPending?: boolean;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidence: () => void;
  onRefreshEvidenceCard: (cardId: DashboardEvidenceCardId) => void;
  onAskStudioAboutCard: (card: DashboardEvidenceCard) => void;
  onSendEvidenceToCopilot: (card: DashboardEvidenceCard) => void;
  onShowEvidenceOutput: () => void;
  onClearActivity: () => void;
  onRevealArtifact: (artifactPath: string) => void;
  onOpenIncidentStudio: (card: DashboardEvidenceCard) => void;
  onPipeline: () => void;
  onReadiness: () => void;
  onAnalyze: () => void;
  onAutopilotRelease: () => void;
  onWorkspaceVerify: () => void;
  onOpenStudioVerify: () => void;
  onNavigateSection: (section: DashboardSection) => void;
  onOpenRunZone: (zone: DashboardOperateZone) => void;
};

export function DashboardEvidenceArtifactsSection({
  evidence,
  hasWorkspace,
  hasProject,
  scope,
  workspace,
  evidenceViewMode,
  onEvidenceViewModeChange,
  pendingCardIds,
  pendingRunCardIds,
  pendingRefreshCardIds,
  isEvidenceFullRefreshPending,
  onRunCommand,
  onRefreshEvidence,
  onRefreshEvidenceCard,
  onAskStudioAboutCard,
  onSendEvidenceToCopilot,
  onShowEvidenceOutput,
  onClearActivity,
  onRevealArtifact,
  onOpenIncidentStudio,
  onPipeline,
  onReadiness,
  onAnalyze,
  onAutopilotRelease,
  onWorkspaceVerify,
  onOpenStudioVerify,
  onNavigateSection,
  onOpenRunZone,
}: DashboardEvidenceArtifactsSectionProps) {
  return (
    <div
      id="dashboard-panel-evidence"
      role="tabpanel"
      aria-labelledby="dashboard-tab-evidence"
      className="ws-dashboard-panel ws-dashboard-panel--evidence"
    >
      <DashboardEvidenceSection
        evidence={evidence}
        hasWorkspace={hasWorkspace}
        hasProject={hasProject}
        scope={scope}
        workspace={workspace}
        evidenceViewMode={evidenceViewMode}
        onEvidenceViewModeChange={onEvidenceViewModeChange}
        pendingCardIds={pendingCardIds}
        pendingRunCardIds={pendingRunCardIds}
        pendingRefreshCardIds={pendingRefreshCardIds}
        isEvidenceFullRefreshPending={isEvidenceFullRefreshPending}
        onRunCommand={onRunCommand}
        onRefreshEvidence={onRefreshEvidence}
        onRefreshEvidenceCard={onRefreshEvidenceCard}
        onAskStudioAboutCard={onAskStudioAboutCard}
        onSendEvidenceToCopilot={onSendEvidenceToCopilot}
        onShowEvidenceOutput={onShowEvidenceOutput}
        onClearActivity={onClearActivity}
        onRevealArtifact={onRevealArtifact}
        onOpenIncidentStudio={onOpenIncidentStudio}
        onPipeline={onPipeline}
        onReadiness={onReadiness}
        onAnalyze={onAnalyze}
        onAutopilotRelease={onAutopilotRelease}
        onWorkspaceVerify={onWorkspaceVerify}
        onOpenStudioVerify={onOpenStudioVerify}
        onNavigateSection={onNavigateSection}
        onOpenRunZone={onOpenRunZone}
      />
    </div>
  );
}
