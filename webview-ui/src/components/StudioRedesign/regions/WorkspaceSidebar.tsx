/**
 * WorkspaceSidebar: Capability map navigation
 * Shows modules and features (current + planned)
 */

import React, { useState } from 'react';
import { Folder, Package, Lock, CheckCircle2, ChevronDown, Circle } from 'lucide-react';
import {
    colorTokens,
    spacing,
    typography,
    borderRadius,
    transitions,
} from '../styles/designTokens';
import { ActionItem } from '../state/studioState';

interface WorkspaceItem {
    id: string;
    name: string;
    type: 'module' | 'project' | 'workspace';
}

// ─── Incident History ───────────────────────────────────────────────────────
interface IncidentRecord {
    id: string;
    title: string;
    scope: string;
    resolvedAtPhase: 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';
    outcome: 'resolved' | 'escalated' | 'in-progress';
    timeAgo: string;
}

const DEMO_INCIDENTS: IncidentRecord[] = [
    {
        id: 'inc-001',
        title: 'Coverage regression',
        scope: 'core/policy',
        resolvedAtPhase: 'plan',
        outcome: 'resolved',
        timeAgo: '2h ago',
    },
    {
        id: 'inc-002',
        title: 'Release gate blocked',
        scope: 'rapidkit-core',
        resolvedAtPhase: 'verify',
        outcome: 'resolved',
        timeAgo: 'Yesterday',
    },
    {
        id: 'inc-003',
        title: 'Build timeout on CI',
        scope: 'frontend',
        resolvedAtPhase: 'diagnose',
        outcome: 'resolved',
        timeAgo: '3 days ago',
    },
];

interface ActionMatrixEntry {
    id: string;
    title: string;
    command: string;
    scope: 'workspace' | 'project';
    stability: 'stable' | 'preview' | 'planned';
    description: string;
}

const ACTION_MATRIX: ActionMatrixEntry[] = [
    {
        id: 'action-doctor',
        title: 'Run Doctor',
        command: 'npx --yes --package rapidkit rapidkit doctor workspace',
        scope: 'workspace',
        stability: 'stable',
        description: 'Baseline health and structure evidence.',
    },
    {
        id: 'action-graph',
        title: 'Open Module Graph',
        command: 'rapidkit incident graph',
        scope: 'workspace',
        stability: 'stable',
        description: 'Inspect framework clusters and severity bands.',
    },
    {
        id: 'action-verify',
        title: 'Verify Gates',
        command: 'rapidkit verify gates',
        scope: 'project',
        stability: 'stable',
        description: 'Lock the current change to a deterministic verify path.',
    },
    {
        id: 'action-export',
        title: 'Export Evidence Pack',
        command: 'rapidkit export evidence',
        scope: 'workspace',
        stability: 'preview',
        description: 'Produce an audit-ready summary for sharing.',
    },
];

interface WorkspaceSidebarProps {
    items: WorkspaceItem[];
    selectedItemId?: string;
    onItemSelect: (itemId: string) => void;
    actionItems?: ActionItem[];
    onToggleActionItem?: (id: string) => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
    items,
    selectedItemId,
    onItemSelect,
    actionItems = [],
    onToggleActionItem,
}) => {
    const currentItems = items.filter((item) => !item.name.includes('[Soon]'));

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
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: colorTokens.surface3,
                border: `1px solid ${colorTokens.border.medium}`,
                borderRadius: '0px',
                height: '100%',
                overflow: 'hidden',
                boxShadow: 'none',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: `${spacing.lg} ${spacing.md}`,
                    borderBottom: `1px solid ${colorTokens.border.subtle}`,
                    backgroundColor: colorTokens.surface3,
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, minWidth: 0, flex: 1 }}>
                    <span
                        style={{
                            ...typography.captionSmall,
                            color: colorTokens.text.tertiary,
                            textTransform: 'uppercase',
                            letterSpacing: '0.3px',
                        }}
                    >
                        Capability Map
                    </span>
                    <span
                        style={{
                            ...typography.bodySmall,
                            color: colorTokens.text.primary,
                            fontWeight: 500,
                        }}
                    >
                        Incident Studio
                    </span>
                </div>
                {/* Open actions badge */}
                {actionItems.filter((a) => !a.done).length > 0 && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 20,
                        height: 20,
                        padding: `0 ${spacing.xs}`,
                        background: colorTokens.health.warning,
                        borderRadius: borderRadius.full ?? '999px',
                        ...typography.captionSmall,
                        fontWeight: 700,
                        color: colorTokens.root,
                        flexShrink: 0,
                    }}>
                        {actionItems.filter((a) => !a.done).length}
                    </div>
                )}
            </div>

            {/* Scrollable list */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    paddingTop: spacing.md,
                    paddingBottom: spacing.md,
                }}
            >
                {/* Recent Incidents — the retention hook */}
                <IncidentHistorySection />

                {/* Open Action Items — cross-session retention */}
                {actionItems.length > 0 && (
                    <OpenActionsSection
                        items={actionItems}
                        onToggle={onToggleActionItem}
                    />
                )}

                {/* Action Matrix */}
                <SectionLabel label="Action Matrix" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, padding: spacing.md }}>
                    {ACTION_MATRIX.map((action) => (
                        <ActionMatrixRow
                            key={action.id}
                            action={action}
                            selectedItemId={selectedItemId}
                            onItemSelect={onItemSelect}
                        />
                    ))}
                </div>

                {/* Current Features Section */}
                <SectionLabel label="Current Features (LIVE)" />
                {currentItems.map((item) => (
                    <SidebarItemRow
                        key={item.id}
                        item={item}
                        selectedItemId={selectedItemId}
                        onItemSelect={onItemSelect}
                        getIcon={getIcon}
                        tone="current"
                    />
                ))}

            </div>

            {/* Footer */}
            <div
                style={{
                    borderTop: `1px solid ${colorTokens.border.subtle}`,
                    padding: spacing.md,
                    backgroundColor: colorTokens.surface3,
                }}
            >
                <div
                    style={{
                        ...typography.caption,
                        color: colorTokens.text.quaternary,
                        lineHeight: 1.4,
                    }}
                >
                    Focused view. Advanced modules are hidden until needed.
                </div>
            </div>
        </div>
    );
};


const OUTCOME_DOT: Record<IncidentRecord['outcome'], string> = {
    resolved: colorTokens.health.ok,
    escalated: colorTokens.health.error,
    'in-progress': colorTokens.health.warning,
};

const PHASE_SHORT: Record<IncidentRecord['resolvedAtPhase'], string> = {
    detect: 'Detect',
    diagnose: 'Diagnose',
    plan: 'Plan',
    verify: 'Verify',
    learn: 'Learn',
};

const IncidentHistorySection: React.FC = () => {
    const [open, setOpen] = useState(true);

    return (
        <div style={{ marginBottom: spacing.sm }}>
            {/* Collapsible header */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: spacing.sm,
                    padding: `${spacing.sm} ${spacing.md}`,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                }}
            >
                <span
                    style={{
                        ...typography.captionSmall,
                        color: colorTokens.text.quaternary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        fontWeight: 600,
                    }}
                >
                    Recent Incidents
                </span>
                <ChevronDown
                    size={11}
                    color={colorTokens.text.quaternary}
                    style={{
                        transition: 'transform 200ms ease',
                        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                    }}
                />
            </button>

            {open && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: `0 ${spacing.sm}` }}>
                    {DEMO_INCIDENTS.map((inc) => (
                        <HistoryRow key={inc.id} incident={inc} />
                    ))}
                </div>
            )}
        </div>
    );
};

const HistoryRow: React.FC<{ incident: IncidentRecord }> = ({ incident }) => {
    return (
        <button
            type="button"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                width: '100%',
                padding: `${spacing.sm} ${spacing.sm}`,
                background: 'none',
                border: 'none',
                borderRadius: borderRadius.md,
                cursor: 'pointer',
                textAlign: 'left',
                transition: transitions.microInteraction,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colorTokens.primaryInverse; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
            {/* Outcome dot */}
            <span
                style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: OUTCOME_DOT[incident.outcome],
                    flexShrink: 0,
                }}
            />
            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        ...typography.captionSmall,
                        color: colorTokens.text.secondary,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {incident.title}
                </div>
                <div style={{ ...typography.captionSmall, color: colorTokens.text.quaternary }}>
                    {incident.scope} · → {PHASE_SHORT[incident.resolvedAtPhase]}
                </div>
            </div>
            {/* Time */}
            <span style={{ ...typography.captionSmall, color: colorTokens.text.quaternary, flexShrink: 0 }}>
                {incident.timeAgo}
            </span>
        </button>
    );
};

// ─── Open Action Items ────────────────────────────────────────────────────────

interface OpenActionsSectionProps {
    items: ActionItem[];
    onToggle?: (id: string) => void;
}

const OpenActionsSection: React.FC<OpenActionsSectionProps> = ({ items, onToggle }) => {
    const [open, setOpen] = useState(true);
    const openCount = items.filter((a) => !a.done).length;

    return (
        <div style={{ paddingBottom: spacing.sm }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    width: '100%',
                    padding: `${spacing.sm} ${spacing.md}`,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                }}
            >
                <span style={{
                    ...typography.captionSmall,
                    color: colorTokens.text.quaternary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontWeight: 600,
                    flex: 1,
                    textAlign: 'left',
                }}>
                    Open Actions
                </span>
                {openCount > 0 && (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 16,
                        height: 16,
                        padding: `0 4px`,
                        background: colorTokens.health.warning,
                        borderRadius: '999px',
                        ...typography.captionSmall,
                        fontWeight: 700,
                        color: colorTokens.root,
                    }}>
                        {openCount}
                    </span>
                )}
                <ChevronDown
                    size={11}
                    color={colorTokens.text.quaternary}
                    style={{ transition: 'transform 200ms ease', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                />
            </button>

            {open && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: `0 ${spacing.sm}` }}>
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onToggle?.(item.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: spacing.sm,
                                width: '100%',
                                padding: `${spacing.sm} ${spacing.sm}`,
                                background: 'none',
                                border: 'none',
                                borderRadius: borderRadius.md,
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: transitions.microInteraction,
                                opacity: item.done ? 0.45 : 1,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colorTokens.primaryInverse; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            {item.done ? (
                                <CheckCircle2 size={13} color={colorTokens.health.ok} style={{ flexShrink: 0 }} />
                            ) : (
                                <Circle size={13} color={colorTokens.text.quaternary} style={{ flexShrink: 0 }} />
                            )}
                            <span style={{
                                ...typography.captionSmall,
                                color: item.done ? colorTokens.text.quaternary : colorTokens.text.secondary,
                                textDecoration: item.done ? 'line-through' : 'none',
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {item.text}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const ActionMatrixRow: React.FC<{
    action: ActionMatrixEntry;
    selectedItemId?: string;
    onItemSelect: (itemId: string) => void;
}> = ({ action, selectedItemId, onItemSelect }) => {
    const active = selectedItemId === action.id;

    return (
        <button
            type="button"
            onClick={() => onItemSelect(action.id)}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: spacing.xs,
                width: '100%',
                padding: spacing.md,
                background: active
                    ? colorTokens.surface3
                    : colorTokens.surface2,
                border: `1px solid ${active ? colorTokens.primary : colorTokens.border.subtle}`,
                borderRadius: borderRadius.md,
                cursor: 'pointer',
                transition: transitions.standard,
                boxShadow: 'none',
                textAlign: 'left',
            }}
            onMouseEnter={(e) => {
                if (!active) {
                    e.currentTarget.style.background = colorTokens.surface3;
                    e.currentTarget.style.borderColor = colorTokens.border.medium;
                }
            }}
            onMouseLeave={(e) => {
                if (!active) {
                    e.currentTarget.style.background = colorTokens.surface2;
                    e.currentTarget.style.borderColor = colorTokens.border.subtle;
                }
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <span style={{ ...typography.bodySmall, color: colorTokens.text.primary, fontWeight: 600, flex: 1 }}>
                    {action.title}
                </span>
                <span
                    style={{
                        ...typography.captionSmall,
                        color:
                            action.stability === 'stable'
                                ? colorTokens.health.ok
                                : action.stability === 'preview'
                                    ? colorTokens.health.warning
                                    : colorTokens.text.quaternary,
                        textTransform: 'uppercase',
                    }}
                >
                    {action.stability}
                </span>
            </div>
            <div style={{ ...typography.caption, color: colorTokens.text.secondary }}>
                {action.command}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <span
                    style={{
                        padding: `${spacing.xs} ${spacing.sm}`,
                        borderRadius: borderRadius.sm,
                        backgroundColor: colorTokens.surface2,
                        color: colorTokens.text.quaternary,
                        ...typography.captionSmall,
                    }}
                >
                    {action.scope}
                </span>
            </div>
        </button>
    );
};
const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div
        style={{
            padding: `${spacing.md} ${spacing.md}`,
            ...typography.captionSmall,
            color: colorTokens.text.quaternary,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
            borderBottom: `1px solid ${colorTokens.border.subtle}`,
        }}
    >
        {label}
    </div>
);

interface SidebarItemRowProps {
    item: WorkspaceItem;
    selectedItemId?: string;
    onItemSelect: (itemId: string) => void;
    getIcon: (type: string) => React.ReactNode;
    tone: 'current' | 'future';
}

const SidebarItemRow: React.FC<SidebarItemRowProps> = ({
    item,
    selectedItemId,
    onItemSelect,
    getIcon,
    tone,
}) => {
    const active = selectedItemId === item.id;

    return (
        <button
            type="button"
            onClick={() => onItemSelect(item.id)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.md,
                width: '100%',
                padding: `${spacing.md} ${spacing.md}`,
                background: active
                    ? colorTokens.surface3
                    : 'transparent',
                border: 'none',
                color: active ? colorTokens.primary : colorTokens.text.secondary,
                cursor: tone === 'future' ? 'not-allowed' : 'pointer',
                transition: transitions.standard,
                borderLeft: `3px solid ${active ? colorTokens.primary : 'transparent'}`,
                opacity: tone === 'future' ? 0.7 : 1,
                margin: `0 ${spacing.sm}`,
                borderRadius: borderRadius.md,
            }}
            onMouseEnter={(e) => {
                if (tone !== 'future' && !active) {
                    e.currentTarget.style.backgroundColor = colorTokens.surface2;
                    e.currentTarget.style.color = colorTokens.text.primary;
                }
            }}
            onMouseLeave={(e) => {
                if (tone !== 'future' && !active) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = colorTokens.text.secondary;
                }
            }}
        >
            <span
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    opacity: active ? 1 : 0.6,
                }}
            >
                {getIcon(item.type)}
            </span>
            <span
                style={{
                    ...typography.body,
                    textAlign: 'left',
                    flex: 1,
                    fontWeight: active ? 500 : 400,
                }}
            >
                {item.name}
            </span>
            <span
                style={{
                    color: tone === 'future' ? colorTokens.warning : colorTokens.accent,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                {tone === 'future' ? <Lock size={10} /> : <CheckCircle2 size={10} />}
            </span>
        </button>
    );
};
