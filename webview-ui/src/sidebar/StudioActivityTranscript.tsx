import {
  BookOpen,
  ChevronRight,
  FileEdit,
  Loader2,
  Search,
  Terminal,
  AlertCircle,
  Brain,
  Globe,
  Users,
  Bug,
  ShieldCheck,
  MessageCircle,
  Info,
  Folder,
  ListChecks,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type {
  SidebarStudioActionProgressView,
  SidebarStudioApprovalRequestView,
} from '@/lib/sidebarStudioActionProgress';
import {
  studioFileChangeLineCounts,
  studioFileChangeHasLineCounts,
} from '@/lib/sidebarStudioActionProgress';
import { StudioActionProgress } from './StudioActionProgress';

type Props = {
  entries: SidebarStudioActionProgressView[];
  active?: boolean;
  onOpenFile?: (path: string, transactionId?: string) => void;
  onOpenDiff?: (path: string, transactionId: string) => void;
  onOpenSubagentActivity?: (requestId: string, toolCallId: string) => void;
  onApprovalDecision?: (
    request: SidebarStudioApprovalRequestView,
    execution: 'once' | 'session' | 'project' | undefined
  ) => void;
};

function ActivityDetails({
  status,
  summary,
  renderBody,
  onExpanded,
  hidden = false,
}: {
  status: SidebarStudioActionProgressView['status'];
  summary: ReactNode;
  renderBody(): ReactNode;
  onExpanded(expanded: boolean): void;
  hidden?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className="ws-activity__step"
      data-status={status}
      role="listitem"
      hidden={hidden}
      onToggle={(event) => {
        if (event.target === event.currentTarget) {
          setExpanded(event.currentTarget.open);
          onExpanded(event.currentTarget.open);
        }
      }}
    >
      <summary>{summary}</summary>
      {expanded ? renderBody() : null}
    </details>
  );
}

/** Public tool activity only: never synthesize or display private model reasoning. */
export function StudioActivityTranscript({
  entries,
  active = false,
  onOpenFile,
  onOpenDiff,
  onOpenSubagentActivity,
  onApprovalDecision,
}: Props) {
  const [historyLimit, setHistoryLimit] = useState(100);
  // Automatic live expansion must never overwrite an explicit user choice.
  const [expansionChoice, setExpansionChoice] = useState<boolean | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const activityId = (entry: SidebarStudioActionProgressView, index: number) =>
    entry.transcriptId ?? `${entry.invocationId ?? entry.action}:${index}`;
  // Repair legacy approval rows without rewriting durable host evidence.
  const approvals = new Set(
    entries
      .filter(
        (entry) =>
          entry.phase === 'command-approved' &&
          entry.eventType === 'tool.approval.approved' &&
          entry.requestId &&
          entry.invocationId
      )
      .map((entry) => `${entry.requestId}:${entry.invocationId}`)
  );
  const displayed = entries
    .filter(
      (entry) =>
        !(entry.status === 'review' && approvals.has(`${entry.requestId}:${entry.invocationId}`))
    )
    .map((entry) => {
      if (entry.phase === 'command-approved' && entry.eventType === 'tool.approval.approved') {
        return { ...entry, status: 'done' as const };
      }
      if (!active && entry.status === 'running') {
        return {
          ...entry,
          status: 'review' as const,
          requiresApproval: false,
          approvalRequest: undefined,
          summary: `${entry.summary} This activity ended without a recorded final result.`,
        };
      }
      return entry;
    });
  const canCollapseTranscript = displayed.length >= 8;
  const actionableApprovals = displayed
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) =>
        active &&
        Boolean(onApprovalDecision) &&
        entry.status === 'review' &&
        Boolean(entry.approvalRequest)
    );
  const actionableApprovalIds = new Set(
    actionableApprovals.map(({ entry, index }) => activityId(entry, index))
  );
  const failedCount = displayed.filter((entry) => entry.status === 'failed').length;
  const reviewCount = displayed.filter((entry) => entry.status === 'review').length;
  const changedPaths = new Set(
    displayed.flatMap((entry) => (entry.fileChanges ?? []).map((file) => file.relativePath))
  );
  const readCount = displayed.reduce(
    (count, entry) => count + (entry.activityPaths?.length ?? 0),
    0
  );
  const commandCount = displayed.filter(
    (entry) =>
      Boolean(entry.commandText) || /run-workspace-command|run-governed-command/.test(entry.action)
  ).length;
  const needsAttention = failedCount > 0 || reviewCount > actionableApprovals.length;
  const waitingForApproval =
    active && displayed.some((entry) => entry.status === 'review' && entry.approvalRequest);
  const transcriptLabel = waitingForApproval
    ? 'Waiting for approval'
    : active
      ? 'Working'
      : needsAttention
        ? 'Needs attention'
        : actionableApprovals.length > 0
          ? 'Needs your input'
          : 'Completed';
  const transcriptExpanded =
    expansionChoice ?? (active || !canCollapseTranscript || expandedIds.size > 0);
  const choosingNextAction =
    active && !waitingForApproval && !displayed.some((entry) => entry.status === 'running');
  // Page completed history while keeping every live execution and approval
  // actionable. Hidden activity remains in the request's full timeline.
  const visible = displayed
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry, index }) =>
        index >= displayed.length - historyLimit ||
        expandedIds.has(activityId(entry, index)) ||
        (active &&
          (entry.status === 'running' || (entry.status === 'review' && entry.approvalRequest)))
    );
  const visibleIds = new Set(visible.map(({ entry, index }) => activityId(entry, index)));
  const hiddenByPage = displayed.filter(
    (entry, index) =>
      !visibleIds.has(activityId(entry, index)) &&
      !actionableApprovalIds.has(activityId(entry, index))
  ).length;
  const hidden = hiddenByPage;
  return (
    <div className="ws-activity" role="group" aria-label="Assistant activity">
      {canCollapseTranscript && (
        <div className="ws-activity__group-row">
          <button
            type="button"
            className="ws-activity__group-summary"
            data-state={needsAttention ? 'attention' : active ? 'active' : 'complete'}
            aria-expanded={!canCollapseTranscript || transcriptExpanded}
            onClick={() => setExpansionChoice(!transcriptExpanded)}
          >
            {active && !waitingForApproval ? (
              <Loader2 size={14} className="ws-activity__spinner" aria-hidden="true" />
            ) : needsAttention ? (
              <AlertCircle size={14} aria-hidden="true" />
            ) : (
              <BookOpen size={14} aria-hidden="true" />
            )}
            <span className="ws-activity__group-label">{transcriptLabel}</span>
            <span className="ws-activity__group-meta">
              {displayed.length} {displayed.length === 1 ? 'step' : 'steps'}
              {changedPaths.size > 0 && ` · ${changedPaths.size} files changed`}
              {readCount > 0 && ` · ${readCount} reads`}
              {commandCount > 0 && ` · ${commandCount} commands`}
              {failedCount > 0 && ` · ${failedCount} failed`}
            </span>
            <ChevronRight size={12} className="ws-activity__group-chevron" aria-hidden="true" />
          </button>
        </div>
      )}
      {actionableApprovals.map(({ entry, index }) => (
        <div role="group" aria-label="Pending approval" key={activityId(entry, index)}>
          <StudioActionProgress
            progress={entry}
            repairBubble
            onApprovalDecision={onApprovalDecision}
          />
        </div>
      ))}
      {active && canCollapseTranscript && !transcriptExpanded ? (
        <div className="ws-activity__live-preview" role="status" aria-live="polite">
          <Loader2
            size={13}
            className={waitingForApproval ? '' : 'ws-activity__spinner'}
            aria-hidden="true"
          />
          <span>
            {waitingForApproval
              ? 'Waiting for approval'
              : choosingNextAction
                ? 'Choosing next action…'
                : [...displayed].reverse().find((entry) => entry.status === 'running')?.title ||
                  displayed.at(-1)?.title ||
                  'Working…'}
          </span>
        </div>
      ) : null}
      <div
        className="ws-activity__entries"
        role="list"
        aria-label="Activity details"
        hidden={canCollapseTranscript && !transcriptExpanded}
      >
        {hidden > 0 && (
          <div role="listitem">
            <button
              type="button"
              className="ws-activity__history"
              onClick={() => setHistoryLimit((limit) => limit + 100)}
            >
              Show earlier activities ({hidden} hidden)
            </button>
          </div>
        )}
        {visible.map(({ entry, index }) => {
          if (actionableApprovalIds.has(activityId(entry, index))) return null;
          const files = entry.fileChanges ?? [];
          const reads = entry.activityPaths ?? [];
          const Icon =
            entry.status === 'running'
              ? Loader2
              : entry.status === 'failed'
                ? AlertCircle
                : entry.receipt?.kind === 'model'
                  ? Brain
                  : entry.receipt?.kind === 'narration'
                    ? MessageCircle
                    : entry.receipt?.kind === 'approval' || entry.receipt?.kind === 'permission'
                      ? ShieldCheck
                      : entry.receipt?.kind === 'scope'
                        ? Folder
                        : entry.receipt?.unsupported
                          ? Info
                          : /subagent|delegate/.test(entry.action)
                            ? Users
                            : /browser|web|fetch/.test(entry.action)
                              ? Globe
                              : /notebook/.test(entry.action)
                                ? BookOpen
                                : /debug/.test(entry.action)
                                  ? Bug
                                  : /test|task/.test(entry.action)
                                    ? ListChecks
                                    : /search|discover/.test(entry.action)
                                      ? Search
                                      : /terminal|command|task/.test(entry.action)
                                        ? Terminal
                                        : files.length || /patch|edit/.test(entry.action)
                                          ? FileEdit
                                          : BookOpen;
          const counts = files.reduce(
            (sum, file) => {
              const next = studioFileChangeLineCounts(file);
              return { added: sum.added + next.added, removed: sum.removed + next.removed };
            },
            { added: 0, removed: 0 }
          );
          return (
            <ActivityDetails
              status={entry.status}
              key={activityId(entry, index)}
              onExpanded={(expanded) => {
                const id = activityId(entry, index);
                setExpandedIds((previous) => {
                  const next = new Set(previous);
                  if (expanded) next.add(id);
                  else next.delete(id);
                  return next;
                });
              }}
              summary={
                <>
                  <Icon
                    size={14}
                    className={entry.status === 'running' ? 'ws-activity__spinner' : ''}
                    aria-hidden="true"
                  />
                  <span className="ws-activity__title">{entry.title}</span>
                  {entry.outputWarning || entry.contentParts?.some((part) => !part.supported) ? (
                    <Info
                      size={12}
                      aria-label="Output display has limitations; expand for details"
                    />
                  ) : null}
                  {entry.receipt?.durationMs !== undefined ? (
                    <small className="ws-activity__duration">
                      {entry.receipt.durationMs < 1000
                        ? `${Math.round(entry.receipt.durationMs)}ms`
                        : `${Math.round(entry.receipt.durationMs / 1000)}s`}
                    </small>
                  ) : null}
                  {files.length || reads.length ? (
                    <span className="ws-activity__preview">
                      {(() => {
                        const file = files[0];
                        const filePath = file?.relativePath ?? reads[0];
                        const deleted = file?.status === 'deleted';
                        return (
                          <button
                            type="button"
                            title={filePath}
                            disabled={deleted ? !entry.transactionId || !onOpenDiff : !onOpenFile}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (deleted && entry.transactionId)
                                onOpenDiff?.(filePath, entry.transactionId);
                              else if (file) onOpenFile?.(filePath, entry.transactionId);
                              else onOpenFile?.(filePath);
                            }}
                          >
                            {filePath.split(/[\\/]/).at(-1)}
                          </button>
                        );
                      })()}
                      {Math.max(files.length, reads.length) > 1 ? (
                        <small>+{Math.max(files.length, reads.length) - 1} files</small>
                      ) : null}
                    </span>
                  ) : entry.commandText ? (
                    <code className="ws-activity__command-preview" title={entry.commandText}>
                      {entry.commandText}
                    </code>
                  ) : null}
                  <span className="ws-sidebar__sr-only">
                    {entry.status === 'running'
                      ? 'In progress'
                      : entry.status === 'failed'
                        ? 'Failed'
                        : entry.status === 'review'
                          ? 'Needs review'
                          : 'Completed'}
                  </span>
                  {counts.added > 0 && <span className="ws-activity__added">+{counts.added}</span>}
                  {counts.removed > 0 && (
                    <span className="ws-activity__removed">−{counts.removed}</span>
                  )}
                  <ChevronRight size={12} className="ws-activity__chevron" aria-hidden="true" />
                </>
              }
              renderBody={() => (
                <div className="ws-activity__body">
                  {entry.summary && <p>{entry.summary}</p>}
                  {entry.outputWarning ? (
                    <p role="note">Output availability: {entry.outputWarning}</p>
                  ) : null}
                  {entry.contentParts?.some((part) => !part.supported) ? (
                    <div role="note" className="ws-activity__output-notice">
                      <span>The host returned output types without a dedicated renderer:</span>
                      <ul>
                        {entry.contentParts
                          .filter((part) => !part.supported)
                          .map((part, index) => (
                            <li key={index}>
                              {part.kind}
                              {part.mimeType ? ` · ${part.mimeType}` : ''}
                            </li>
                          ))}
                      </ul>
                      <span>
                        The tool result remains separate from output display support; repeating its
                        effects is not required.
                      </span>
                    </div>
                  ) : null}
                  {['delegate-task', 'delegate-research'].includes(entry.action) &&
                  entry.requestId &&
                  entry.invocationId &&
                  onOpenSubagentActivity ? (
                    <button
                      type="button"
                      onClick={() => onOpenSubagentActivity(entry.requestId!, entry.invocationId!)}
                    >
                      Open subagent activity
                    </button>
                  ) : null}
                  {reads.map((file) => (
                    <div className="ws-activity__file" key={file}>
                      <BookOpen size={13} aria-hidden="true" />
                      <span>Read</span>
                      <button
                        type="button"
                        disabled={!onOpenFile}
                        onClick={() => onOpenFile?.(file)}
                        title={file}
                      >
                        <span className="ws-activity__filename">{file}</span>
                      </button>
                    </div>
                  ))}
                  {files.map((file) => {
                    const delta = studioFileChangeLineCounts(file);
                    return (
                      <div className="ws-activity__file" key={file.relativePath}>
                        <FileEdit size={13} aria-hidden="true" />
                        <span>
                          {file.status === 'deleted'
                            ? 'Deleted'
                            : file.status === 'added'
                              ? 'Created'
                              : 'Edited'}
                        </span>
                        <button
                          type="button"
                          title={file.relativePath}
                          disabled={
                            file.status === 'deleted'
                              ? !entry.transactionId || !onOpenDiff
                              : !onOpenFile && (!entry.transactionId || !onOpenDiff)
                          }
                          onClick={() =>
                            file.status !== 'deleted' && onOpenFile
                              ? onOpenFile(file.relativePath, entry.transactionId)
                              : entry.transactionId && onOpenDiff
                                ? onOpenDiff(file.relativePath, entry.transactionId)
                                : undefined
                          }
                        >
                          <span className="ws-activity__filename">{file.relativePath}</span>
                          {file.binary ? (
                            <span>
                              Binary
                              {file.afterBytes !== undefined
                                ? ` · ${file.afterBytes.toLocaleString()} bytes`
                                : ''}
                            </span>
                          ) : (
                            studioFileChangeHasLineCounts(file) && (
                              <>
                                <span className="ws-activity__added">+{delta.added}</span>
                                <span className="ws-activity__removed">−{delta.removed}</span>
                              </>
                            )
                          )}
                        </button>
                      </div>
                    );
                  })}
                  {entry.commandText && (
                    <code className="ws-activity__command">{entry.commandText}</code>
                  )}
                  {entry.outputText && (
                    <pre className="ws-activity__output">{entry.outputText}</pre>
                  )}
                  {entry.phaseHistory && entry.phaseHistory.length > 1 ? (
                    <details className="ws-activity__phases">
                      <summary>Activity history · {entry.phaseHistory.length} events</summary>
                      <ol>
                        {entry.phaseHistory.map((receipt) => (
                          <li key={receipt.eventId}>
                            <span>{receipt.title}</span>
                            <small>
                              {receipt.eventType} · #{receipt.sequence}
                              {receipt.timestamp ? ` · ${receipt.timestamp}` : ''}
                            </small>
                            {receipt.summary ? <p>{receipt.summary}</p> : null}
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                  {entry.technicalDetail && (
                    <details>
                      <summary>Details</summary>
                      <pre className="ws-activity__output">{entry.technicalDetail}</pre>
                    </details>
                  )}
                </div>
              )}
            />
          );
        })}
        {choosingNextAction ? (
          <div className="ws-activity__model-wait" role="listitem">
            <Loader2 size={13} className="ws-activity__spinner" aria-hidden="true" />
            <span>Choosing next action…</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
