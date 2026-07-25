import { DashboardOverviewQuickNav } from '@/components/DashboardOverviewQuickNav';
import { WorkspaceOverview } from '@/components/WorkspaceOverview';
import { WorkspaiBanner } from '@/components/WorkspaiBanner';
import type { WorkspaceStatus } from '@/types';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import type { DashboardSection } from '@/lib/dashboardSections';

export type ImportedWorkspaceShareSummary = {
  sourceFile: string;
  workspaceName: string;
  workspaceProfile?: string;
  generatedAt?: string;
  schemaVersion: string;
  projectCount: number;
  runtimes: string[];
  doctorEvidenceIncluded: boolean;
  healthTotals: {
    passed: number;
    warnings: number;
    errors: number;
  };
};

export type DashboardOverviewSectionProps = {
  workspaceStatus: WorkspaceStatus;
  evidence: DashboardEvidencePayload | null;
  importedWorkspaceShare: ImportedWorkspaceShareSummary | null;
  evidenceAttentionCount: number;
  operateAttentionCount: number;
  onDismissImportedWorkspaceShare: () => void;
  onOpenEvidence: () => void;
  onOpenRunGovernance: () => void;
  onNavigate: (section: DashboardSection) => void;
};

export function DashboardOverviewSection({
  workspaceStatus,
  evidence,
  importedWorkspaceShare,
  evidenceAttentionCount,
  operateAttentionCount,
  onDismissImportedWorkspaceShare,
  onOpenEvidence,
  onOpenRunGovernance,
  onNavigate,
}: DashboardOverviewSectionProps) {
  return (
    <div
      id="dashboard-panel-overview"
      role="tabpanel"
      aria-labelledby="dashboard-tab-overview"
      className="ws-dashboard-panel ws-dashboard-panel--overview"
    >
      {importedWorkspaceShare ? (
        <WorkspaiBanner
          title="Imported Share Bundle"
          onDismiss={onDismissImportedWorkspaceShare}
        >
          <p className="workspai-banner__body">
            <strong>{importedWorkspaceShare.workspaceName}</strong>
            {importedWorkspaceShare.workspaceProfile
              ? ` (${importedWorkspaceShare.workspaceProfile})`
              : ''}
            {' · '}
            {importedWorkspaceShare.projectCount} projects
            {' · schema '}
            {importedWorkspaceShare.schemaVersion}
          </p>
          <p className="workspai-banner__meta">
            Runtimes:{' '}
            {importedWorkspaceShare.runtimes.length > 0
              ? importedWorkspaceShare.runtimes.join(', ')
              : 'unknown'}
          </p>
          <p className="workspai-banner__meta">
            Health totals: {importedWorkspaceShare.healthTotals.passed} passed,{' '}
            {importedWorkspaceShare.healthTotals.warnings} warnings,{' '}
            {importedWorkspaceShare.healthTotals.errors} errors
          </p>
        </WorkspaiBanner>
      ) : null}

      <WorkspaceOverview
        workspaceStatus={workspaceStatus}
        evidence={evidence}
        evidenceAttentionCount={evidenceAttentionCount}
        operateAttentionCount={operateAttentionCount}
        onOpenEvidence={onOpenEvidence}
        onOpenRunGovernance={onOpenRunGovernance}
      />

      <DashboardOverviewQuickNav
        evidenceAttentionCount={evidenceAttentionCount}
        operateAttentionCount={operateAttentionCount}
        onNavigate={onNavigate}
      />
    </div>
  );
}
