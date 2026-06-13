/**
 * WorkspaceSidebar: Capability map navigation
 * Shows modules and features (current + planned)
 */

import React, { useState } from 'react';
import { Folder, Package, CheckCircle2, ChevronDown, Circle, PlayCircle, ShieldAlert, Lock } from 'lucide-react';
import { studioClass, auditOutcomeToneClass, actionStabilityClass, actionRuntimeToneClass } from '../styles/studioUi';
import { ActionItem, AIActionRegistryView, StudioActionStatus } from '../state/studioState';
import { STUDIO_ACTION_COMMANDS, StudioActionCommand } from '../state/studioActions';
import { buildStudioActionAuditTimeline, StudioActionAuditEvent, StudioApprovalAuditEvent } from '../state/studioActionAudit';
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

interface ActionMatrixEntry {
    id: string;
    title: string;
    command: string;
    studioCommand: StudioActionCommand;
    scope: 'workspace' | 'project';
    stability: 'stable' | 'governed' | 'analysis';
    description: string;
    actionType?: 'fix' | 'impact' | 'verify';
}

const ACTION_MATRIX: ActionMatrixEntry[] = [
    {
        id: 'action-analyze',
        title: 'Analyze Workspace',
        command: 'Hydrate evidence, health, gates, and related files.',
        studioCommand: STUDIO_ACTION_COMMANDS.runAnalyze,
        scope: 'workspace',
        stability: 'stable',
        description: 'Baseline health and structure evidence.',
    },
    {
        id: 'action-impact',
        title: 'Impact Lens',
        command: 'Generate a blast-radius contract before changes.',
        studioCommand: STUDIO_ACTION_COMMANDS.impactLens,
        scope: 'workspace',
        stability: 'analysis',
        description: 'Inspect framework clusters and severity bands.',
        actionType: 'impact',
    },
    {
        id: 'action-fix',
        title: 'Governed Fix',
        command: 'Draft apply, verify, and rollback contract.',
        studioCommand: STUDIO_ACTION_COMMANDS.fixLens,
        scope: 'project',
        stability: 'governed',
        description: 'Prepare a user-approved fix contract with rollback proof.',
        actionType: 'fix',
    },
    {
        id: 'action-verify',
        title: 'Verify Gates',
        command: 'Run deterministic verification against current evidence.',
        studioCommand: STUDIO_ACTION_COMMANDS.verifyGates,
        scope: 'project',
        stability: 'stable',
        description: 'Lock the current change to a deterministic verify path.',
        actionType: 'verify',
    },
    {
        id: 'action-terminal',
        title: 'Terminal Bridge',
        command: 'Route workspace commands through the guarded bridge.',
        studioCommand: STUDIO_ACTION_COMMANDS.terminalBridge,
        scope: 'workspace',
        stability: 'stable',
        description: 'Execute supported workspace commands with visible output.',
    },
];

interface WorkspaceSidebarProps {
    items: WorkspaceItem[];
    selectedItemId?: string;
    onItemSelect: (itemId: string) => void;
    actionItems?: ActionItem[];
    aiActionRegistry?: AIActionRegistryView | null;
    studioActionStatus?: StudioActionStatus | null;
    approvalAuditEvents?: StudioApprovalAuditEvent[];
    onToggleActionItem?: (id: string) => void;
    onExecuteAction?: (command: StudioActionCommand) => void;
    onRevealEvidence?: (path: string) => void;
    onRunCliSurfaceAction?: (entry: { command: string; cliActionId: string }) => void;
    executingCliCommand?: string | null;
    hasProjectSelected?: boolean;
    userMode?: 'guided' | 'expert';
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
    items,
    selectedItemId,
    onItemSelect,
    actionItems = [],
    aiActionRegistry,
    studioActionStatus,
    approvalAuditEvents = [],
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
    });
    const [selectedAuditEventId, setSelectedAuditEventId] = useState<string | null>(null);
    const selectedAuditEvent =
        auditEvents.find((event) => event.id === selectedAuditEventId) || auditEvents[0] || null;
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
                    <ActionAuditInspector event={selectedAuditEvent} onRevealEvidence={onRevealEvidence} />
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
                        {ACTION_MATRIX.map((action) => (
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
    onRevealEvidence?: (path: string) => void;
}> = ({ event, onRevealEvidence }) => {
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
        event.evidenceSizeBytes ? formatEvidenceBytes(event.evidenceSizeBytes) : '—',
        event.provider || 'local bridge',
    ].join(' · ');

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
            </div>
        </div>
    );
};

function shortenPath(value: string): string {
    const normalized = value.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 2) {
        return normalized;
    }
    return `…/${parts.slice(-2).join('/')}`;
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
    action: ActionMatrixEntry;
    selectedItemId?: string;
    onItemSelect: (itemId: string) => void;
    aiActionRegistry?: AIActionRegistryView | null;
    actionRunning?: boolean;
    onExecuteAction?: (command: StudioActionCommand) => void;
}> = ({ action, selectedItemId, onItemSelect, aiActionRegistry, actionRunning = false, onExecuteAction }) => {
    const active = selectedItemId === action.id;
    const runtime = buildActionRuntime(action, aiActionRegistry);
    const runDisabled = actionRunning || !onExecuteAction;
    const stabilityClass = actionStabilityClass(action.stability);

    return (
        <div
            className={`${studioClass.card} studio-card--matrix${active ? ' is-active' : ''}`}
            title={`${action.command} · ${action.description}`}
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
                            onExecuteAction?.(action.studioCommand);
                        }
                    }}
                    disabled={runDisabled}
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
    action: ActionMatrixEntry,
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
    const title = item.description || (item.command ? `Run ${item.name}` : item.name);

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
            disabled={tone === 'future'}
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
