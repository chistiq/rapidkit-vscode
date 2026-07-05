import { ChevronDown, TerminalSquare } from 'lucide-react';
import { useState } from 'react';
import type { DashboardActivityEntry, DashboardEvidenceCard } from '@/lib/dashboardEvidence';
import { buildEvidenceCardLogPreview } from '@/lib/evidenceAgentContext';
import { EVIDENCE_CARD_COMMANDS } from '@/lib/dashboardEvidenceActions';
import { EvidenceCardDetailPreview } from '@/components/EvidenceCardDetailPreview';

interface EvidenceCardLogDrawerProps {
  card: DashboardEvidenceCard;
  activity?: DashboardActivityEntry[];
  defaultExpanded?: boolean;
  onOpenOutputChannel?: () => void;
  onRevealArtifact?: (artifactPath: string) => void;
}

function relatedActivity(
  card: DashboardEvidenceCard,
  activity: DashboardActivityEntry[]
): DashboardActivityEntry[] {
  const command = EVIDENCE_CARD_COMMANDS[card.id];
  if (!command) {
    return activity.slice(0, 3);
  }
  return activity.filter((entry) => entry.command === command).slice(0, 4);
}

export function EvidenceCardLogDrawer({
  card,
  activity = [],
  defaultExpanded = false,
  onOpenOutputChannel,
  onRevealArtifact,
}: EvidenceCardLogDrawerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const preview = buildEvidenceCardLogPreview(card);
  const entries = relatedActivity(card, activity);
  const blockers = card.blockers ?? [];
  const hasDetails =
    blockers.length > 0 ||
    preview.stderrTail ||
    preview.exitCode != null ||
    entries.length > 0 ||
    Boolean(card.artifactPath);

  if (!hasDetails && card.id !== 'workspaceModel' && !(card.detailSections?.length ?? 0)) {
    return null;
  }

  return (
    <div className="evidence-card-log-drawer">
      <EvidenceCardDetailPreview card={card} />
      {!hasDetails ? null : (
      <>
      <button
        type="button"
        className="evidence-card-log-drawer__toggle"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        <TerminalSquare size={12} aria-hidden="true" />
        <span>Execution details</span>
        <ChevronDown
          size={12}
          className={`evidence-card-log-drawer__chevron${expanded ? ' is-open' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <div className="evidence-card-log-drawer__body">
          <dl className="evidence-card-log-drawer__meta">
            {preview.commandId ? (
              <>
                <dt>Command</dt>
                <dd>{preview.commandId}</dd>
              </>
            ) : null}
            {preview.exitCode != null ? (
              <>
                <dt>Exit code</dt>
                <dd>{preview.exitCode}</dd>
              </>
            ) : null}
            {preview.runId ? (
              <>
                <dt>Run ID</dt>
                <dd>{preview.runId}</dd>
              </>
            ) : null}
            {card.generatedAt ? (
              <>
                <dt>Generated</dt>
                <dd>{card.generatedAt}</dd>
              </>
            ) : null}
          </dl>

          {blockers.length > 0 ? (
            <div className="evidence-card-log-drawer__section">
              <strong>Blockers</strong>
              <ul>
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.stderrTail ? (
            <div className="evidence-card-log-drawer__section">
              <strong>stderr tail</strong>
              <pre className="evidence-card-log-drawer__log">{preview.stderrTail}</pre>
            </div>
          ) : null}

          {entries.length > 0 ? (
            <div className="evidence-card-log-drawer__section">
              <strong>Recent command activity</strong>
              <ul>
                {entries.map((entry) => (
                  <li key={entry.id}>
                    {entry.label} · {entry.status}
                    {entry.detail ? ` — ${entry.detail}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="evidence-card-log-drawer__actions">
            {onOpenOutputChannel ? (
              <button type="button" className="ws-btn ws-btn--ghost" onClick={onOpenOutputChannel}>
                Open Workspai Evidence output
              </button>
            ) : null}
            {card.artifactPath && onRevealArtifact ? (
              <button
                type="button"
                className="ws-btn ws-btn--ghost"
                onClick={() => onRevealArtifact(card.artifactPath!)}
              >
                Open artifact file
              </button>
            ) : null}
          </div>
          <p className="evidence-card-log-drawer__footnote">
            Background CLI logs appear in Workspai Evidence output after you run this card. Terminal-mode
            commands log in the integrated terminal instead.
          </p>
        </div>
      ) : null}
      </>
      )}
    </div>
  );
}
