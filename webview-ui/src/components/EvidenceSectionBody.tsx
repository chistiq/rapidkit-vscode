import { WorkspaceGraphPreview } from '@/components/WorkspaceGraphPreview';
import { parseGraphSectionBody } from '@/lib/workspaceModelGraphVisual';

export type EvidenceSectionContent = {
  id: string;
  title: string;
  body: string;
};

export function EvidenceSectionBody({ section }: { section: EvidenceSectionContent }) {
  const graphPayload = parseGraphSectionBody(section.body);
  if (graphPayload) {
    return <WorkspaceGraphPreview payload={graphPayload} />;
  }

  if (section.id === 'workspace-model-overview' || section.id === 'workspace-model-validation') {
    return (
      <ul className="evidence-section-body__lines">
        {section.body
          .split('\n')
          .filter(Boolean)
          .map((line) => (
            <li key={line}>{line}</li>
          ))}
      </ul>
    );
  }

  if (section.body.length <= 180 && !section.body.includes('```') && section.body.split('\n').length <= 4) {
    return <p className="evidence-section-body__prose">{section.body}</p>;
  }

  return <pre className="evidence-section-body__pre">{section.body}</pre>;
}
