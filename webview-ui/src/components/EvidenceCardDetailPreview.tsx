import { Network } from 'lucide-react';
import { IntelligenceDetailAccordion } from '@/components/IntelligenceDetailAccordion';
import { WorkspaceGraphPreview } from '@/components/WorkspaceGraphPreview';
import type { DashboardEvidenceCard } from '@/lib/dashboardEvidence';
import { findWorkspaceGraphSection } from '@/lib/workspaceModelGraphVisual';
import { buildDashboardIncidentCopy } from '@/lib/dashboardIncidentContract';

export function EvidenceCardDetailPreview({ card }: { card: DashboardEvidenceCard }) {
  const sections = card.detailSections ?? [];
  const graphPayload = findWorkspaceGraphSection(sections);
  const proseSections = sections.filter((section) => section.id !== 'workspace-graph');
  const incident = buildDashboardIncidentCopy({ card });

  if (sections.length === 0) {
    if (card.id === 'workspaceModel') {
      return (
        <div className="evidence-card-detail-preview evidence-card-detail-preview--empty">
          <div className="evidence-card-detail-preview__incident" aria-label="Incident detail">
            <span>Incident</span>
            <strong>{incident.phaseLabel}</strong>
            <span>{incident.primaryAction}</span>
            <span>{incident.verifyLabel}</span>
            <span>{incident.auditLabel}</span>
          </div>
          <WorkspaceGraphPreview
            payload={{ nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0 } }}
            compact
          />
          <p className="evidence-card-detail-preview__hint">
            Run <strong>Workspace Model</strong>, then refresh this card to load the dependency graph.
          </p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="evidence-card-detail-preview">
      <div className="evidence-card-detail-preview__incident" aria-label="Incident detail">
        <span>Incident</span>
        <strong>{incident.phaseLabel}</strong>
        <span>{incident.primaryAction}</span>
        <span>{incident.verifyLabel}</span>
        <span>{incident.auditLabel}</span>
      </div>
      {graphPayload ? (
        <div className="evidence-card-detail-preview__graph">
          <span className="ws-kicker">Dependency graph</span>
          <WorkspaceGraphPreview payload={graphPayload} compact />
        </div>
      ) : null}
      {proseSections.length > 0 ? (
        <IntelligenceDetailAccordion
          title="Evidence detail"
          count={proseSections.length}
          hint={`Structured summary for ${card.label}`}
          icon={<Network size={15} />}
          sections={proseSections}
          defaultOpen={proseSections.length <= 2}
        />
      ) : null}
    </div>
  );
}
