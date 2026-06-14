import { ClipboardCheck } from 'lucide-react';
import { CommandActivityPanel } from '@/components/CommandActivityPanel';
import { EvidenceOutcomePanel } from '@/components/EvidenceOutcomePanel';
import { ReleaseHub } from '@/components/ReleaseHub';
import { WorkspaiEmptyState } from '@/components/WorkspaiEmptyState';
import type {
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
} from '@/lib/dashboardEvidence';
import { evidenceIsSparse, outcomeCards } from '@/lib/dashboardEvidence';
import type { DashboardSection } from '@/lib/dashboardSections';

interface DashboardEvidenceSectionProps {
  evidence: DashboardEvidencePayload | null;
  hasWorkspace: boolean;
  pendingCardIds?: DashboardEvidenceCardId[];
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onRefreshEvidence: () => void;
  onClearActivity: () => void;
  onRevealArtifact: (artifactPath: string) => void;
  onOpenIncidentStudio: (card: DashboardEvidenceCard) => void;
  onReadiness: () => void;
  onAnalyze: () => void;
  onAutopilotRelease: () => void;
  onNavigateSection: (section: DashboardSection) => void;
}

export function DashboardEvidenceSection({
  evidence,
  hasWorkspace,
  pendingCardIds = [],
  onRunCommand,
  onRefreshEvidence,
  onClearActivity,
  onRevealArtifact,
  onOpenIncidentStudio,
  onReadiness,
  onAnalyze,
  onAutopilotRelease,
  onNavigateSection,
}: DashboardEvidenceSectionProps) {
  const cards = evidence?.cards ?? [];
  const activity = evidence?.activity ?? [];
  const hasOutcomes = outcomeCards(evidence).length > 0;
  const sparseWorkspaceEvidence = evidenceIsSparse(evidence, hasWorkspace);
  const hasEvidenceContent = cards.length > 0 || activity.length > 0 || hasWorkspace;

  if (!hasEvidenceContent) {
    return (
      <WorkspaiEmptyState
        icon={<ClipboardCheck size={18} />}
        title="No evidence yet"
        description={
          <>
            Select a workspace to populate the ops evidence loop. Artifacts from doctor, analyze,
            readiness, and release commands appear here.
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
            <button type="button" className="ws-btn" onClick={() => onNavigateSection('operate')}>
              Open Operate
            </button>
          </>
        }
      />
    );
  }

  if (sparseWorkspaceEvidence) {
    return (
      <WorkspaiEmptyState
        icon={<ClipboardCheck size={18} />}
        title="No governance evidence yet"
        description={
          <>
            This workspace has no doctor, analyze, or readiness artifacts yet. Run the bootstrap →
            doctor → analyze chain from Operate to populate evidence.
          </>
        }
        actions={
          <>
            <button
              type="button"
              className="ws-btn ws-btn--primary"
              onClick={() => onRunCommand('workspaceBootstrap')}
            >
              Bootstrap workspace
            </button>
            <button
              type="button"
              className="ws-btn"
              onClick={() => onRunCommand('checkWorkspaceHealth')}
            >
              Run doctor
            </button>
            <button type="button" className="ws-btn" onClick={() => onNavigateSection('operate')}>
              Open Operate
            </button>
          </>
        }
      />
    );
  }

  return (
    <div className="dashboard-evidence-layout">
      <div className="dashboard-evidence-toolbar">
        <div>
          <span className="ws-kicker">Evidence refresh</span>
          <p>Re-read workspace and project artifacts without running a command.</p>
        </div>
        <button type="button" className="ws-btn" onClick={onRefreshEvidence}>
          Refresh evidence
        </button>
      </div>
      <CommandActivityPanel
        evidence={evidence}
        onRunCommand={onRunCommand}
        onClearActivity={onClearActivity}
        onRevealArtifact={onRevealArtifact}
      />

      <div
        className={`dashboard-evidence-layout__split ${hasOutcomes ? 'has-outcomes' : 'release-only'}`}
      >
        {hasOutcomes ? (
          <EvidenceOutcomePanel
            evidence={evidence}
            pendingCardIds={pendingCardIds}
            onRunCommand={onRunCommand}
            onOpenIncidentStudio={onOpenIncidentStudio}
            onRevealArtifact={onRevealArtifact}
          />
        ) : null}

        <ReleaseHub
          evidence={evidence}
          hasWorkspace={hasWorkspace}
          pendingCardIds={pendingCardIds}
          onReadiness={onReadiness}
          onAnalyze={onAnalyze}
          onAutopilotRelease={onAutopilotRelease}
        />
      </div>
    </div>
  );
}
