/**
 * WorkspaceSidebar: Capability map navigation
 * Shows modules and features (current + planned)
 */

import React, { useState } from 'react';
import {
    Folder,
    Package,
    CheckCircle2,
    ChevronDown,
    Circle,
    PlayCircle,
    ShieldAlert,
    Lock,
} from 'lucide-react';
import {
    studioClass,
    auditOutcomeToneClass,
    actionStabilityClass,
    actionRuntimeToneClass,
} from '../styles/studioUi';
import {
    ActionItem,
    AIActionRegistryView,
    StudioExecutionTranscript,
    StudioActionStatus,
    StudioProofEvent,
    UserMode,
} from '../state/studioState';
import { STUDIO_ACTION_REGISTRY } from '../state/studioActions';
import type { StudioActionCommand, StudioActionRegistryEntry } from '../state/studioActions';
import {
    buildStudioActionAuditTimeline,
    StudioActionAuditEvent,
    StudioApprovalAuditEvent,
} from '../state/studioActionAudit';
import { CliSurfaceSection } from './CliSurfaceSection';
import { CollapsibleSection } from './CollapsibleSection';
import type { IncidentCliActionEntry } from '../../../lib/incidentCliActionMatrix';

interface WorkspaceItem {
    id: string;
    name: string;
    type: 'module' | 'project' | 'workspace';
    command?: StudioActionCommand;
    description?: string;
}

interface WorkspaceSidebarProps {
    items: WorkspaceItem[];
    selectedItemId?: string;
    onItemSelect: (itemId: string) => void;
    actionItems?: ActionItem[];
    aiActionRegistry?: AIActionRegistryView | null;
    studioActionStatus?: StudioActionStatus | null;
    approvalAuditEvents?: StudioApprovalAuditEvent[];
    proofEvents?: StudioProofEvent[];
    executionTranscripts?: StudioExecutionTranscript[];
    onToggleActionItem?: (id: string) => void;
    onExecuteAction?: (command: StudioActionCommand) => void;
    onRevealEvidence?: (path: string) => void;
    onRunCliSurfaceAction?: (entry: { command: string; cliActionId: string }) => void;
    executingCliCommand?: string | null;
    hasProjectSelected?: boolean;
    userMode?: UserMode;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
    items,
    selectedItemId,
    onItemSelect,
    actionItems = [],
    aiActionRegistry,
    studioActionStatus,
    approvalAuditEvents = [],
    proofEvents = [],
    executionTranscripts = [],
    onToggleActionItem,
    onExecuteAction,
    onRevealEvidence,
    onRunCliSurfaceAction,
    executingCliCommand = null,
    hasProjectSelected = false,
    userMode = 'guided',
}) => {
    const auditEvents = buildStudioActionAuditTimeline({
        registry: aiActionRegistry,
        status: studioActionStatus,
        approvalEvents: approvalAuditEvents,
        proofEvents,
    });
    const [selectedAuditEventId, setSelectedAuditEventId] = useState<string | null>(null);
    const selectedAuditEvent =
        auditEvents.find((event) => event.id === selectedAuditEventId) || auditEvents[0] || null;
    const selectedTranscript = selectedAuditEvent?.transcriptId
        ? executionTranscripts.find((transcript) => transcript.id === selectedAuditEvent.transcriptId) || null
        : null;
    const actionRunning = studioActionStatus?.status === 'started';

    const getIcon = (type: string) => {
        switch (type) {
            case 'module':
                return <Package size={16} />;
            case 'project':
                return <Folder size={16} />;
            default:
                return <Folder size={16} />;
        }
    };

    return (
        <div className={`${studioClass.rail} ${studioClass.sidebar}`}>
            <div className={studioClass.panelHeader}>
                <div className={studioClass.panelHeaderTitle}>
                    <span className={studioClass.kicker}>Capability Map</span>
                    <span className={studioClass.panelHeaderMeta}>Incident Studio</span>
                </div>
                {actionItems.filter((a) => !a.done).length > 0 && (
                    <span className={`${studioClass.badge} ${studioClass.badgeWarn}`}>
                        {actionItems.filter((a) => !a.done).length}
                    </span>
                )}
            </div>

            <div className={studioClass.sidebarScroll}>
                <div className="studio-sidebar-start-hint">
                    <strong>Start here</strong>
                    Run Analyze, then Verify gates. Expand other toolboxes when you need CLI, audit, or module details.
                </div>

                {/* Recent Incidents — the retention hook */}
                <ActionAuditSection
                    events={auditEvents}
                    selectedEventId={selectedAuditEvent?.id}
                    onSelectEvent={setSelectedAuditEventId}
                />

                {selectedAuditEvent ? (
                    <ActionAuditInspector
                        event={selectedAuditEvent}
                        executionTranscript={selectedTranscript}
                        onRevealEvidence={onRevealEvidence}
                    />
                ) : null}

                {/* Open Action Items — cross-session retention */}
                {actionItems.length > 0 && (
                    <OpenActionsSection
                        items={actionItems}
                        onToggle={onToggleActionItem}
                    />
                )}

                <CollapsibleSection
                    title="Action matrix"
                    hint="Analyze · Verify · Fix"
                    defaultOpen
                    variant="sidebar"
                >
                    <div className={`${studioClass.sidebarSection} studio-sidebar__section--matrix`}>
                        {STUDIO_ACTION_REGISTRY.map((action) => (
                            <ActionMatrixRow
                                key={action.id}
                                action={action}
                                selectedItemId={selectedItemId}
                                onItemSelect={onItemSelect}
                                aiActionRegistry={aiActionRegistry}
                                actionRunning={actionRunning}
                                onExecuteAction={onExecuteAction}
                            />
                        ))}
                    </div>
                </CollapsibleSection>

                {onRunCliSurfaceAction ? (
                    <CollapsibleSection
                        title="RapidKit CLI"
                        hint="npm commands"
                        variant="sidebar"
                    >
                        <CliSurfaceSection
                            hasProjectSelected={hasProjectSelected}
                            userMode={userMode}
                            executingCommand={executingCliCommand}
                            onRunCliAction={(entry: IncidentCliActionEntry) =>
                                onRunCliSurfaceAction({ command: entry.command, cliActionId: entry.id })
                            }
                            embedded
                        />
                    </CollapsibleSection>
                ) : null}

                <CollapsibleSection
                    title="Capability map"
                    hint={`${items.length} live modules`}
                    variant="sidebar"
                >
                    {items.map((item) => (
                        <SidebarItemRow
                            key={item.id}
                            item={item}
                            selectedItemId={selectedItemId}
                            onItemSelect={onItemSelect}
                            getIcon={getIcon}
                            tone="current"
                            actionRunning={actionRunning}
                            onExecuteAction={onExecuteAction}
                        />
                    ))}
                </CollapsibleSection>

            </div>

            <div className={studioClass.sidebarFooter}>
                <div className="studio-sidebar__footer-note">
                    Toolboxes stay collapsed until you open them. Action matrix is your default entry point.
                </div>
            </div>
        </div>
    );
};


const PHASE_SHORT: Record<StudioActionAuditEvent['phase'], string> = {
    detect: 'Detect',
    diagnose: 'Diagnose',
    plan: 'Plan',
    verify: 'Verify',
    learn: 'Learn',
};

const ActionAuditSection: React.FC<{
    events: StudioActionAuditEvent[];
    selectedEventId?: string | null;
    onSelectEvent: (id: string) => void;
}> = ({ events, selectedEventId, onSelectEvent }) => {
    const [open, setOpen] = useState(false);

    return (
        <div className={studioClass.sidebarCollapse}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`${studioClass.collapseTrigger}${open ? ' is-open' : ''}`}
            >
                <span>Action Audit</span>
                <ChevronDown size={11} className={`${studioClass.chevron}${open ? ' is-open' : ''} ${studioClass.collapseChevron}`} />
            </button>

            {open && (
                <div className={studioClass.sidebarCollapseBody}>
                    {events.length > 0 ? (
                        events.map((event) => (
                            <AuditRow
                                key={event.id}
                                event={event}
                                selected={selectedEventId === event.id}
                                onSelectEvent={onSelectEvent}
                            />
                        ))
                    ) : (
                        <div className="studio-sidebar__empty">
                            No action audit yet. Run Analyze or ask Studio for a governed fix/impact plan.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const AuditRow: React.FC<{
    event: StudioActionAuditEvent;
    selected?: boolean;
    onSelectEvent: (id: string) => void;
}> = ({ event, selected = false, onSelectEvent }) => {
    const toneClass = auditOutcomeToneClass(event.outcome);
    const proof = event.evidenceSha256
        ? `sha256:${event.evidenceSha256.slice(0, 12)}`
        : event.evidencePath
            ? 'evidence file'
            : event.commandCount
                ? `${event.commandCount} cmd`
                : event.outcome;

    return (
        <button
            type="button"
            onClick={() => onSelectEvent(event.id)}
            title={event.evidencePath || event.detail || event.title}
            className={`${studioClass.auditRow}${selected ? ' is-selected' : ''}`}
        >
            <span className={`studio-status-dot ${toneClass}`} />
            <div className={studioClass.flex1}>
                <div className="studio-audit-row__title">{event.title}</div>
                <div className="studio-audit-row__meta">
                    {event.scope} · {PHASE_SHORT[event.phase]} · {proof}
                </div>
            </div>
            <span className="studio-audit-row__time">{event.timeAgo}</span>
        </button>
    );
};

const ActionAuditInspector: React.FC<{
    event: StudioActionAuditEvent;
    executionTranscript?: StudioExecutionTranscript | null;
    onRevealEvidence?: (path: string) => void;
}> = ({ event, executionTranscript = null, onRevealEvidence }) => {
    const toneClass = auditOutcomeToneClass(event.outcome);
    const proof = event.evidenceSha256
        ? `sha256:${event.evidenceSha256}`
        : event.evidencePath
            ? event.evidencePath
            : null;
    const proofShort = event.evidenceSha256
        ? `sha256:${event.evidenceSha256.slice(0, 12)}`
        : event.evidencePath
            ? shortenPath(event.evidencePath)
            : null;
    const failedCommands = event.failedCommands || [];
    const contextLine = `${PHASE_SHORT[event.phase]} · ${event.scope} · ${event.timeAgo}`;
    const opsLine = [
        `Cmd ${event.commandCount ?? 0}`,
        `Fail ${event.failedCommandCount ?? 0}`,
        event.durationMs ? formatDuration(event.durationMs) : null,
        event.evidenceSizeBytes ? formatEvidenceBytes(event.evidenceSizeBytes) : '—',
        event.provider || 'local bridge',
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <div className={`${studioClass.sidebarInspectorWrap} studio-sidebar-inspector-wrap--compact`}>
            <div className={`${studioClass.inspector} studio-inspector--compact`}>
                <div className="studio-inspector__headline">
                    <span className={`studio-status-dot ${toneClass}`} />
                    <span className="studio-inspector__title" title={event.title}>{event.title}</span>
                    <span className={`studio-matrix-tag studio-matrix-tag--runtime ${toneClass}`}>
                        {event.outcome}
                    </span>
                </div>

                <div className="studio-inspector__meta" title={contextLine}>{contextLine}</div>
                <div className="studio-inspector__meta studio-inspector__meta--muted" title={opsLine}>{opsLine}</div>

                {proofShort ? (
                    <div className="studio-inspector__proof-row">
                        <span className="studio-inspector__proof-label">Proof</span>
                        <span className="studio-inspector__proof-value" title={proof || proofShort}>{proofShort}</span>
                        {event.evidencePath && onRevealEvidence ? (
                            <button
                                type="button"
                                onClick={() => onRevealEvidence(event.evidencePath || '')}
                                className="studio-inspector__link-btn"
                            >
                                Open
                            </button>
                        ) : null}
                    </div>
                ) : null}

                {failedCommands.length > 0 ? (
                    <div className="studio-inspector__failures">
                        {failedCommands.slice(0, 2).map((command) => (
                            <code key={command} className="studio-code-snippet" title={command}>
                                {shortenPath(command)}
                            </code>
                        ))}
                        {failedCommands.length > 2 ? (
                            <span className="studio-inspector__fail-more">+{failedCommands.length - 2}</span>
                        ) : null}
                    </div>
                ) : null}

                {executionTranscript ? (
                    <div className="studio-inspector__failures" title={executionTranscript.title}>
                        {executionTranscript.steps.slice(0, 2).map((step) => (
                            <code key={step.id} className="studio-code-snippet" title={step.command}>
                                {step.status.toUpperCase()} · {shortenCommand(step.command)}
                                {step.durationMs ? ` · ${formatDuration(step.durationMs)}` : ''}
                            </code>
                        ))}
                        {executionTranscript.steps.length > 2 ? (
                            <span className="studio-inspector__fail-more">
                                +{executionTranscript.steps.length - 2}
                            </span>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

function shortenCommand(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 54 ? `${normalized.slice(0, 51)}…` : normalized;
}

function shortenPath(value: string): string {
    const normalized = value.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 2) {
        return normalized;
    }
    return `…/${parts.slice(-2).join('/')}`;
}

function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${Math.max(0, Math.round(ms))}ms`;
    }
    if (ms < 60_000) {
        return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
    }
    return `${Math.round(ms / 60_000)}m`;
}

function formatEvidenceBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
    }
    if (bytes >= 1024) {
        return `${Math.round(bytes / 1024)}kb`;
    }
    return `${bytes}b`;
};

// ─── Open Action Items ────────────────────────────────────────────────────────

interface OpenActionsSectionProps {
    items: ActionItem[];
    onToggle?: (id: string) => void;
}

const OpenActionsSection: React.FC<OpenActionsSectionProps> = ({ items, onToggle }) => {
    const openCount = items.filter((a) => !a.done).length;

    return (
        <CollapsibleSection
            title="Open actions"
            hint={openCount > 0 ? `${openCount} pending` : undefined}
            badge={
                openCount > 0 ? (
                    <span className={`${studioClass.badge} ${studioClass.badgeWarn}`}>{openCount}</span>
                ) : undefined
            }
            defaultOpen={openCount > 0}
            variant="sidebar"
        >
            {items.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => onToggle?.(item.id)}
                    disabled={!onToggle}
                    className={`studio-action-item${item.done ? ' is-done' : ''}`}
                >
                    {item.done ? (
                        <CheckCircle2 size={13} className={`${studioClass.flexShrink0} studio-action-item__icon is-done`} />
                    ) : (
                        <Circle size={13} className={`${studioClass.flexShrink0} studio-action-item__icon is-open`} />
                    )}
                    <span className="studio-action-item__text">{item.text}</span>
                </button>
            ))}
        </CollapsibleSection>
    );
};

const ActionMatrixRow: React.FC<{
    action: StudioActionRegistryEntry;
    selectedItemId?: string;
    onItemSelect: (itemId: string) => void;
    aiActionRegistry?: AIActionRegistryView | null;
    actionRunning?: boolean;
    onExecuteAction?: (command: StudioActionCommand) => void;
}> = ({ action, selectedItemId, onItemSelect, aiActionRegistry, actionRunning = false, onExecuteAction }) => {
    const active = selectedItemId === action.id;
    const runtime = buildActionRuntime(action, aiActionRegistry);
    const runDisabled = actionRunning || !onExecuteAction;
    const runDisabledReason = actionRunning
        ? 'Another Studio action is running.'
        : !onExecuteAction
          ? 'Studio action bridge is not available.'
          : undefined;
    const stabilityClass = actionStabilityClass(action.stability);

    return (
        <div
            className={`${studioClass.card} studio-card--matrix${active ? ' is-active' : ''}`}
            title={`${action.summary} · ${action.description}`}
        >
            <div className="studio-matrix-row__top">
                <button type="button" onClick={() => onItemSelect(action.id)} className="studio-matrix-row__select">
                    <span className="studio-card__title">{action.title}</span>
                    {runtime.needsAttention ? (
                        <ShieldAlert size={12} className={`${studioClass.flexShrink0} ${studioClass.toneError}`} />
                    ) : null}
                    <span className={`studio-matrix-tag studio-matrix-tag--runtime ${stabilityClass}`}>
                        {action.stability}
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (!runDisabled) {
                            onExecuteAction?.(action.command);
                        }
                    }}
                    disabled={runDisabled}
                    title={runDisabledReason || `Run ${action.title}`}
                    className={`${studioClass.btnPrimary} studio-matrix-row__run`}
                >
                    <PlayCircle size={11} />
                    {actionRunning ? '…' : 'Run'}
                </button>
            </div>
            <div className="studio-matrix-row__meta">
                <span className="studio-matrix-row__desc">{action.description}</span>
                <span className="studio-matrix-tag studio-matrix-tag--neutral">{action.scope}</span>
                <span
                    className={`studio-matrix-tag studio-matrix-tag--runtime ${runtime.toneClass}`}
                    title={runtime.proof}
                >
                    {runtime.label}
                </span>
            </div>
        </div>
    );
};

function buildActionRuntime(
    action: StudioActionRegistryEntry,
    registry?: AIActionRegistryView | null,
): { label: string; toneClass: string; proof: string; needsAttention: boolean } {
    const latest = action.actionType
        ? registry?.entries.find((entry) => entry.actionType === action.actionType)
        : registry?.entries[0];
    const latestExecution = latest?.executions[0];

    if (!latest) {
        return {
            label: action.stability === 'stable' ? 'ready' : 'available',
            toneClass: actionRuntimeToneClass({
                blocked: false,
                proposed: false,
                readyFallback: action.stability === 'stable' ? 'ok' : 'warn',
            }),
            proof: 'No governed execution recorded yet.',
            needsAttention: false,
        };
    }

    const blocked =
        latest.lifecycleStatus === 'blocked' ||
        latest.lifecycleStatus === 'stale' ||
        latest.lifecycleStatus === 'applied-failed-verify' ||
        latest.validationStatus === 'blocked' ||
        latestExecution?.ok === false;
    const proposed = latest.lifecycleStatus === 'proposed' || latest.validationStatus === 'needs-review';

    return {
        label: blocked ? latest.lifecycleStatus : proposed ? 'needs review' : latest.lifecycleStatus,
        toneClass: actionRuntimeToneClass({ blocked, proposed }),
        proof: latestExecution?.evidenceSha256
            ? `sha256:${latestExecution.evidenceSha256.slice(0, 12)}`
            : latest.summary,
        needsAttention: blocked,
    };
}

interface SidebarItemRowProps {
    item: WorkspaceItem;
    selectedItemId?: string;
    onItemSelect: (itemId: string) => void;
    getIcon: (type: string) => React.ReactNode;
    tone: 'current' | 'future';
    actionRunning?: boolean;
    onExecuteAction?: (command: StudioActionCommand) => void;
}

const SidebarItemRow: React.FC<SidebarItemRowProps> = ({
    item,
    selectedItemId,
    onItemSelect,
    getIcon,
    tone,
    actionRunning = false,
    onExecuteAction,
}) => {
    const active = selectedItemId === item.id;
    const runDisabled = tone === 'future' || actionRunning || !item.command || !onExecuteAction;
    const rowDisabled = tone === 'future';
    const runDisabledReason = tone === 'future'
        ? 'This capability is planned.'
        : actionRunning
          ? 'Another Studio action is running.'
          : !item.command
            ? 'No executable action is attached to this capability yet.'
            : !onExecuteAction
              ? 'Studio action bridge is not available.'
              : undefined;
    const title = runDisabledReason || item.description || (item.command ? `Run ${item.name}` : item.name);

    return (
        <button
            type="button"
            onClick={() => {
                onItemSelect(item.id);
                if (!runDisabled && item.command) {
                    onExecuteAction?.(item.command);
                }
            }}
            className={`${studioClass.navItem}${active ? ' is-active' : ''}${tone === 'future' ? ' is-future' : ''}`}
            disabled={rowDisabled}
            title={title}
        >
            <span className={studioClass.navItemIcon}>
                {getIcon(item.type)}
            </span>
            <span className={studioClass.navItemLabel}>
                {item.name}
            </span>
            <span className={`${studioClass.navItemAction}${runDisabled ? ' is-muted' : ''}`}>
                {tone === 'future' ? (
                    <Lock size={10} />
                ) : runDisabled ? (
                    <CheckCircle2 size={10} />
                ) : (
                    <PlayCircle size={11} />
                )}
            </span>
        </button>
    );
};
