import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { EvidenceSectionBody } from '@/components/EvidenceSectionBody';

export type IntelligenceDetailSection = {
  id: string;
  title: string;
  body: string;
};

export interface IntelligenceDetailAccordionProps {
  title: string;
  count: number;
  sections: IntelligenceDetailSection[];
  icon?: ReactNode;
  /** Subtitle under the title, e.g. "Explain narrative from verify report" */
  hint?: string;
  defaultOpen?: boolean;
}

export function IntelligenceDetailAccordion({
  title,
  count,
  sections,
  icon,
  hint,
  defaultOpen = false,
}: IntelligenceDetailAccordionProps) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <details className="workspace-intelligence-detail-card" open={defaultOpen || undefined}>
      <summary className="workspace-intelligence-detail-card__summary">
        {icon ? (
          <span className="workspace-intelligence-detail-card__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="workspace-intelligence-detail-card__copy">
          <strong className="workspace-intelligence-detail-card__title">{title}</strong>
          <small className="workspace-intelligence-detail-card__meta">
            {hint ?? `${count} item${count === 1 ? '' : 's'}`}
          </small>
        </span>
        <span className="workspace-intelligence-detail-card__count" aria-hidden="true">
          {count}
        </span>
        <ChevronDown size={14} className="workspace-intelligence-detail-card__chevron" aria-hidden="true" />
      </summary>
      <div className="workspace-intelligence-detail-card__body">
        {sections.map((section) => (
          <article key={section.id} className="workspace-intelligence-detail-card__section">
            <h4>{section.title}</h4>
            <EvidenceSectionBody section={section} />
          </article>
        ))}
      </div>
    </details>
  );
}
