/**
 * ChatSurface: Message timeline + action chips + input area
 * Enterprise-grade messaging UI with card-based design
 */

import React, { useEffect, useRef, useState } from 'react';
import {
    Send,
    Lightbulb,
    Zap,
    Code,
    Copy,
    Play,
    ChevronDown,
} from 'lucide-react';
import {
    colorTokens,
    motionTokens,
    spacing,
    typography,
    borderRadius,
    transitions,
} from '../styles/designTokens';
import {
    ChatMessage,
    SourcePill,
    IncidentPhase,
    ScopeType,
    PHASE_LABELS,
    PHASE_SEQUENCE,
} from '../state/studioState';

interface ChatSurfaceProps {
    messages: ChatMessage[];
    isStreaming: boolean;
    currentPhase: IncidentPhase;
    scopeType: ScopeType;
    onSendMessage: (content: string) => void;
    onPhaseAdvance?: (phase: IncidentPhase) => void;
    onAddActionItem?: (text: string) => void;
    userMode: 'guided' | 'standard' | 'expert';
    compactMode?: boolean;
}

const setCtaInteractionState = (
    target: HTMLButtonElement,
    state: 'idle' | 'hover' | 'press',
) => {
    if (state === 'press') {
        target.style.transform = 'translateY(0) scale(0.985)';
        target.style.filter = 'brightness(0.98)';
        return;
    }

    if (state === 'hover') {
        target.style.transform = 'translateY(-1px)';
        target.style.filter = 'brightness(1.02)';
        return;
    }

    target.style.transform = 'translateY(0)';
    target.style.filter = 'none';
};

export const ChatSurface: React.FC<ChatSurfaceProps> = ({
    messages,
    isStreaming,
    currentPhase,
    scopeType,
    onSendMessage,
    onPhaseAdvance,
    onAddActionItem,
    userMode,
    compactMode = false,
}) => {
    const [input, setInput] = useState('');
    const [expandedSourceMessageId, setExpandedSourceMessageId] = useState<string | null>(null);
    const [showDemo, setShowDemo] = useState(true);
    const [showQuickActions, setShowQuickActions] = useState(false);
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
    const decisionDeck = buildDecisionDeck(currentPhase, scopeType, userMode);
    const sendDisabled = !input.trim() || isStreaming;
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
    const shouldAutoFollowRef = useRef(true);
    const prefersReducedMotionRef = useRef(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const syncPreference = () => {
            prefersReducedMotionRef.current = mediaQuery.matches;
        };

        syncPreference();
        mediaQuery.addEventListener('change', syncPreference);
        return () => {
            mediaQuery.removeEventListener('change', syncPreference);
        };
    }, []);

    useEffect(() => {
        if (!shouldAutoFollowRef.current) {
            return;
        }

        bottomAnchorRef.current?.scrollIntoView({
            behavior: prefersReducedMotionRef.current ? 'auto' : 'smooth',
            block: 'end',
        });
        setShowJumpToLatest(false);
    }, [messages, isStreaming]);

    useEffect(() => {
        if (!shouldAutoFollowRef.current && (isStreaming || messages.length > 0)) {
            setShowJumpToLatest(true);
        }
    }, [messages.length, isStreaming]);

    const handleTimelineScroll = () => {
        const el = timelineRef.current;
        if (!el) {
            return;
        }

        const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
        const isNearBottom = distanceToBottom < 32;
        shouldAutoFollowRef.current = isNearBottom;
        setShowJumpToLatest(!isNearBottom && (isStreaming || messages.length > 0));
    };

    const jumpToLatest = () => {
        shouldAutoFollowRef.current = true;
        setShowJumpToLatest(false);
        bottomAnchorRef.current?.scrollIntoView({
            behavior: prefersReducedMotionRef.current ? 'auto' : 'smooth',
            block: 'end',
        });
    };

    const handleSend = () => {
        if (input.trim()) {
            onSendMessage(input);
            setInput('');
        }
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: colorTokens.surface2,
                height: '100%',
                width: '100%',
                border: `1px solid ${colorTokens.border.medium}`,
                borderRadius: '0px',
                overflow: 'hidden',
                boxShadow: 'none',
                position: 'relative',
                animation: `studioEnterUp ${motionTokens.durations.surfaceEnter}ms ${motionTokens.easing.emphasized} ${motionTokens.delays.surfaceAfterHeader}ms both`,
            }}
        >
            {/* Quick Action Chips */}
            {messages.length > 0 && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: spacing.md,
                        padding: compactMode ? `${spacing.sm} ${spacing.md}` : `${spacing.sm} ${spacing.lg}`,
                        borderBottom: `1px solid ${colorTokens.border.subtle}`,
                        flexShrink: 0,
                        backgroundColor: colorTokens.surface3,
                        position: 'relative',
                        zIndex: 1,
                    }}
                >
                    <button
                        type="button"
                        onClick={() => setShowQuickActions((v) => !v)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: spacing.sm,
                            padding: `${spacing.xs} ${spacing.sm}`,
                            border: `1px solid ${colorTokens.border.subtle}`,
                            borderRadius: borderRadius.md,
                            background: 'transparent',
                            color: colorTokens.text.tertiary,
                            cursor: 'pointer',
                            ...typography.captionSmall,
                            whiteSpace: 'nowrap',
                            transition: transitions.microInteraction,
                        }}
                    >
                        Quick actions
                        <ChevronDown
                            size={12}
                            style={{ transform: showQuickActions ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        />
                    </button>
                    {showQuickActions && (
                        <div style={{ display: 'flex', gap: spacing.sm, overflowX: 'auto', overflowY: 'hidden' }}>
                            <ActionChip icon={<Zap size={16} />} label="Terminal Bridge" delayMs={motionTokens.delays.chipsBase + 0 * motionTokens.delays.chipsStep} />
                            <ActionChip icon={<Code size={16} />} label="Fix Preview" delayMs={motionTokens.delays.chipsBase + 1 * motionTokens.delays.chipsStep} />
                            <ActionChip icon={<Lightbulb size={16} />} label="Change Impact" delayMs={motionTokens.delays.chipsBase + 2 * motionTokens.delays.chipsStep} />
                        </div>
                    )}
                </div>
            )}

            {/* Messages Timeline */}
            <div
                role="log"
                aria-live="polite"
                aria-busy={isStreaming}
                ref={timelineRef}
                onScroll={handleTimelineScroll}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    padding: compactMode ? `${spacing.md} ${spacing.md} ${spacing.md}` : `${spacing.xl} ${spacing.xl} ${spacing.lg}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: compactMode ? spacing.lg : spacing.xl,
                    minHeight: 0,
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                {currentPhase === 'learn' ? (
                    <PostmortemCard
                        deck={decisionDeck}
                        onExecute={(command) => onSendMessage(command)}
                        onAddActionItem={onAddActionItem}
                    />
                ) : (
                    <DecisionDeckCard
                        deck={decisionDeck}
                        onExecute={(command) => onSendMessage(command)}
                        compactMode={compactMode}
                    />
                )}

                {messages.length === 0 ? (
                    showDemo ? (
                        <LiveDemoScenario
                            onContinue={(prompt) => {
                                onSendMessage(prompt);
                            }}
                            onDismiss={() => setShowDemo(false)}
                        />
                    ) : (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                minHeight: '160px',
                                gap: spacing.md,
                                animation: `studioFadeIn 240ms ${motionTokens.easing.emphasized} both`,
                            }}
                        >
                            <div style={{ ...typography.body, color: colorTokens.text.tertiary }}>
                                Ready. Start from the decision card above.
                            </div>
                        </div>
                    )
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: spacing.md,
                            }}
                        >
                            {msg.phase && msg.role === 'assistant' && (
                                <PhaseCard phase={msg.phase} />
                            )}
                            <MessageBubble
                                message={msg}
                                onSourceToggle={() =>
                                    setExpandedSourceMessageId(
                                        expandedSourceMessageId === msg.id ? null : msg.id,
                                    )
                                }
                                isSourceExpanded={expandedSourceMessageId === msg.id}
                                userMode={userMode}
                            />
                        </div>
                    ))
                )}
                {isStreaming && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                        <div
                            style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: colorTokens.primary,
                                animation: `pulse ${motionTokens.durations.pulse}ms infinite`,
                            }}
                        />
                        <span style={{ ...typography.body, color: colorTokens.text.secondary }}>
                            Assistant is thinking...
                        </span>
                    </div>
                )}
                {showJumpToLatest && (
                    <div style={{ position: 'sticky', bottom: spacing.sm, alignSelf: 'flex-end' }}>
                        <button
                            type="button"
                            onClick={jumpToLatest}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: spacing.xs,
                                padding: `${spacing.xs} ${spacing.sm}`,
                                border: `1px solid ${colorTokens.border.medium}`,
                                borderRadius: borderRadius.md,
                                backgroundColor: colorTokens.surface3,
                                color: colorTokens.text.secondary,
                                ...typography.captionSmall,
                                cursor: 'pointer',
                                boxShadow: 'none',
                                transition: transitions.microInteraction,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = colorTokens.primary;
                                e.currentTarget.style.color = colorTokens.primary;
                                setCtaInteractionState(e.currentTarget, 'hover');
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = colorTokens.border.medium;
                                e.currentTarget.style.color = colorTokens.text.secondary;
                                setCtaInteractionState(e.currentTarget, 'idle');
                            }}
                            onMouseDown={(e) => setCtaInteractionState(e.currentTarget, 'press')}
                            onMouseUp={(e) => setCtaInteractionState(e.currentTarget, 'hover')}
                        >
                            Jump to latest
                        </button>
                    </div>
                )}
                <div ref={bottomAnchorRef} aria-hidden="true" />
            </div>

            {/* Input Area */}
            <div
                style={{
                    borderTop: `1px solid ${colorTokens.border.subtle}`,
                    padding: compactMode ? `${spacing.md}` : `${spacing.md} ${spacing.lg}`,
                    backgroundColor: colorTokens.surface3,
                    flexShrink: 0,
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                {/* Phase Advancement Gate — shown after ≥2 messages, not on 'learn' */}
                {messages.length >= 2 && currentPhase !== 'learn' && onPhaseAdvance && (() => {
                    const nextIdx = PHASE_SEQUENCE.indexOf(currentPhase) + 1;
                    const nextPhase = PHASE_SEQUENCE[nextIdx] as IncidentPhase | undefined;
                    if (!nextPhase) { return null; }
                    return (
                        <PhaseAdvancementGate
                            currentPhase={currentPhase}
                            nextPhase={nextPhase}
                            onAdvance={() => onPhaseAdvance(nextPhase)}
                        />
                    );
                })()}

                {/* Suggestion chips — shown only when there are messages */}
                {messages.length > 0 && userMode === 'expert' && (
                    <div
                        style={{
                            display: 'flex',
                            gap: spacing.sm,
                            marginBottom: spacing.md,
                            overflowX: 'auto',
                            overflowY: 'hidden',
                            flexShrink: 0,
                        }}
                    >
                        <SuggestionChip label="Analyze git log" />
                        <SuggestionChip label="Check dependencies" />
                        <SuggestionChip label="Generate fix" />
                        <SuggestionChip label="Verify gates" />
                    </div>
                )}

                {/* Status line — slim bar replacing the metadata card */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.md,
                        marginBottom: spacing.sm,
                        flexShrink: 0,
                        flexWrap: 'wrap',
                    }}
                >
                    <MetadataItem label="Scope" value={scopeType === 'workspace' ? 'Workspace' : 'Project'} />
                    <MetadataItem label="Phase" value={PHASE_LABELS[currentPhase]} />
                    {userMode === 'expert' && <MetadataItem label="Model" value="WorkspAI" />}
                </div>

                {/* Input */}
                <div
                    style={{
                        display: 'flex',
                        gap: spacing.md,
                        alignItems: 'flex-end',
                        padding: spacing.md,
                        borderRadius: borderRadius.md,
                        border: `1px solid ${colorTokens.border.subtle}`,
                        backgroundColor: colorTokens.surface3,
                        boxShadow: 'none',
                    }}
                >
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        aria-label="Message input — press Enter to send, Shift+Enter for new line"
                        aria-multiline="true"
                        placeholder="Ask about incident... (Shift+Enter for new line)"
                        style={{
                            flex: 1,
                            padding: `${spacing.md} ${spacing.lg}`,
                            backgroundColor: colorTokens.surface2,
                            border: `1px solid ${colorTokens.border.medium}`,
                            borderRadius: borderRadius.md,
                            color: colorTokens.text.primary,
                            ...typography.body,
                            minHeight: '44px',
                            maxHeight: '120px',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            transition: transitions.microInteraction,
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = colorTokens.primary;
                            e.currentTarget.style.boxShadow = `0 0 0 2px ${colorTokens.primaryInverse}`;
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = colorTokens.border.medium;
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={sendDisabled}
                        aria-disabled={sendDisabled}
                        aria-label="Send message"
                        style={{
                            padding: spacing.md,
                            backgroundColor:
                                !sendDisabled
                                    ? colorTokens.primary
                                    : colorTokens.surface2,
                            border: 'none',
                            borderRadius: borderRadius.md,
                            cursor: !sendDisabled ? 'pointer' : 'default',
                            color:
                                !sendDisabled
                                    ? colorTokens.root
                                    : colorTokens.text.quaternary,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: transitions.microInteraction,
                            flexShrink: 0,
                            width: '44px',
                            height: '44px',
                            boxShadow: 'none',
                        }}
                        onMouseEnter={(e) => {
                            if (!sendDisabled) {
                                e.currentTarget.style.backgroundColor = colorTokens.primaryHover;
                                setCtaInteractionState(e.currentTarget, 'hover');
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!sendDisabled) {
                                e.currentTarget.style.backgroundColor = colorTokens.primary;
                                setCtaInteractionState(e.currentTarget, 'idle');
                            }
                        }}
                        onMouseDown={(e) => {
                            if (!sendDisabled) {
                                setCtaInteractionState(e.currentTarget, 'press');
                            }
                        }}
                        onMouseUp={(e) => {
                            if (!sendDisabled) {
                                setCtaInteractionState(e.currentTarget, 'hover');
                            }
                        }}
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Phase Advancement Gate ───────────────────────────────────────────────────

interface PhaseAdvancementGateProps {
    currentPhase: IncidentPhase;
    nextPhase: IncidentPhase;
    onAdvance: () => void;
}

const PhaseAdvancementGate: React.FC<PhaseAdvancementGateProps> = ({ currentPhase, nextPhase, onAdvance }) => {
    const currentLabel = PHASE_LABELS[currentPhase];
    const nextLabel = PHASE_LABELS[nextPhase];
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${spacing.sm} ${spacing.md}`,
            marginTop: spacing.lg,
            borderLeft: `3px solid ${colorTokens.health.ok}`,
            borderRadius: `0 ${borderRadius.sm} ${borderRadius.sm} 0`,
            background: `${colorTokens.health.ok}14`,
        }}>
            <span style={{ ...typography.captionSmall, color: colorTokens.text.secondary }}>
                ✓ <strong>{currentLabel}</strong> context gathered
            </span>
            <button
                onClick={onAdvance}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    padding: `${spacing.xs} ${spacing.sm}`,
                    background: colorTokens.health.ok,
                    border: 'none',
                    borderRadius: borderRadius.sm,
                    color: colorTokens.root,
                    cursor: 'pointer',
                    ...typography.captionSmall,
                    fontWeight: 600,
                    transition: transitions.microInteraction,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.9';
                    setCtaInteractionState(e.currentTarget, 'hover');
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                    setCtaInteractionState(e.currentTarget, 'idle');
                }}
                onMouseDown={(e) => setCtaInteractionState(e.currentTarget, 'press')}
                onMouseUp={(e) => setCtaInteractionState(e.currentTarget, 'hover')}
            >
                Advance to {nextLabel} →
            </button>
        </div>
    );
};

// ─── Postmortem Summary Card ──────────────────────────────────────────────────

interface PostmortemCardProps {
    deck: DecisionDeckContent;
    onExecute: (command: string) => void;
    onAddActionItem?: (text: string) => void;
}

const PostmortemCard: React.FC<PostmortemCardProps> = ({ deck, onExecute, onAddActionItem }) => {
    const [actionInput, setActionInput] = useState('');

    const submitAction = () => {
        const trimmed = actionInput.trim();
        if (!trimmed || !onAddActionItem) { return; }
        onAddActionItem(trimmed);
        setActionInput('');
    };

    return (
        <div style={{
            marginTop: spacing.lg,
            padding: spacing.lg,
            borderRadius: borderRadius.md,
            border: `1px solid ${colorTokens.health.ok}40`,
            background: `${colorTokens.health.ok}0a`,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span style={{ ...typography.label, color: colorTokens.health.ok, fontWeight: 700 }}>
                    Incident Resolved · Learn
                </span>
            </div>
            <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md }}>
                <span style={{ ...typography.captionSmall, color: colorTokens.text.tertiary }}>
                    Status: <span style={{ color: colorTokens.text.primary }}>{deck.status}</span>
                </span>
                <span style={{ color: colorTokens.border.medium, ...typography.captionSmall }}>·</span>
                <span style={{ ...typography.captionSmall, color: colorTokens.text.tertiary }}>
                    Risk: <span style={{ color: colorTokens.health.ok }}>{deck.riskLabel}</span>
                </span>
                <span style={{ color: colorTokens.border.medium, ...typography.captionSmall }}>·</span>
                <span style={{ ...typography.captionSmall, color: colorTokens.text.tertiary }}>
                    Next: <span style={{ color: colorTokens.text.primary }}>{deck.nextActionLabel}</span>
                </span>
            </div>
            {/* Action Item capture */}
            {onAddActionItem && (
                <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md }}>
                    <input
                        value={actionInput}
                        onChange={(e) => setActionInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { submitAction(); } }}
                        placeholder="Add follow-up action…"
                        style={{
                            flex: 1,
                            padding: `${spacing.xs} ${spacing.sm}`,
                            background: colorTokens.surface2,
                            border: `1px solid ${colorTokens.border.subtle}`,
                            borderRadius: borderRadius.sm,
                            color: colorTokens.text.primary,
                            ...typography.captionSmall,
                            outline: 'none',
                        }}
                    />
                    <button
                        onClick={submitAction}
                        disabled={!actionInput.trim()}
                        style={{
                            padding: `${spacing.xs} ${spacing.sm}`,
                            background: actionInput.trim() ? colorTokens.health.ok : colorTokens.surface3,
                            border: 'none',
                            borderRadius: borderRadius.sm,
                            color: actionInput.trim() ? colorTokens.root : colorTokens.text.quaternary,
                            cursor: actionInput.trim() ? 'pointer' : 'default',
                            ...typography.captionSmall,
                            fontWeight: 600,
                            transition: transitions.microInteraction,
                        }}
                    >
                        + Add
                    </button>
                </div>
            )}
            <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
                <button
                    onClick={() => onExecute('export-postmortem')}
                    style={{
                        padding: `${spacing.xs} ${spacing.sm}`,
                        background: colorTokens.health.ok,
                        border: 'none',
                        borderRadius: borderRadius.sm,
                        color: colorTokens.root,
                        cursor: 'pointer',
                        ...typography.captionSmall,
                        fontWeight: 600,
                    }}
                >
                    Export Summary
                </button>
                <button
                    onClick={() => onExecute('archive-evidence')}
                    style={{
                        padding: `${spacing.xs} ${spacing.sm}`,
                        background: 'none',
                        border: `1px solid ${colorTokens.health.ok}60`,
                        borderRadius: borderRadius.sm,
                        color: colorTokens.health.ok,
                        cursor: 'pointer',
                        ...typography.captionSmall,
                    }}
                >
                    Archive Evidence
                </button>
            </div>
        </div>
    );
};

// ─── Live Demo Scenario ───────────────────────────────────────────────────────

interface LiveDemoScenarioProps {
    onContinue: (prompt: string) => void;
    onDismiss: () => void;
}

const DEMO_COMMAND = 'npx --yes --package rapidkit rapidkit doctor workspace';

const demoEvidence = [
    { severity: 'high' as const, text: 'Coverage dropped 6.4% after merge #2847 into core/policy' },
    { severity: 'warn' as const, text: '3 untested policy validators flagged by doctor scan' },
    { severity: 'block' as const, text: 'Release gate blocked — 73.6% current / 80.0% threshold' },
];

const SEVERITY_COLOR = {
    high: colorTokens.health.error,
    warn: colorTokens.health.warning,
    block: colorTokens.error,
};

const LiveDemoScenario: React.FC<LiveDemoScenarioProps> = ({ onContinue, onDismiss }) => {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: spacing.lg,
                padding: spacing.xl,
                borderRadius: borderRadius.lg,
                border: `1px solid ${colorTokens.border.medium}`,
                borderLeft: `3px solid ${colorTokens.health.warning}`,
                backgroundColor: colorTokens.surface3,
                boxShadow: 'none',
                animation: `studioFadeIn 320ms ${motionTokens.easing.emphasized} both`,
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                <span
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.xs,
                        padding: `2px ${spacing.sm}`,
                        borderRadius: borderRadius.sm,
                        border: `1px solid ${colorTokens.health.warning}40`,
                        backgroundColor: `${colorTokens.health.warning}12`,
                        color: colorTokens.health.warning,
                        ...typography.captionSmall,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                    }}
                >
                    <span
                        style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: colorTokens.health.warning,
                            animation: `pulse ${motionTokens.durations.pulse}ms infinite`,
                            display: 'inline-block',
                        }}
                    />
                    Live Demo
                </span>
                <span style={{ ...typography.labelSmall, color: colorTokens.text.primary }}>
                    Coverage regression — core/policy
                </span>
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss demo and start fresh"
                    style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: colorTokens.text.quaternary,
                        ...typography.captionSmall,
                        padding: `${spacing.xs} ${spacing.sm}`,
                        borderRadius: borderRadius.sm,
                        transition: `color ${motionTokens.durations.chipFade}ms ease`,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = colorTokens.text.secondary; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = colorTokens.text.quaternary; }}
                >
                    Start fresh ×
                </button>
            </div>

            {/* Evidence lines */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {demoEvidence.map((ev, i) => (
                    <div
                        key={i}
                        style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: spacing.md,
                            padding: `${spacing.sm} ${spacing.md}`,
                            borderRadius: borderRadius.md,
                            background: colorTokens.surface2,
                            border: `1px solid ${colorTokens.border.subtle}`,
                        }}
                    >
                        <span
                            style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: SEVERITY_COLOR[ev.severity],
                                flexShrink: 0,
                                marginTop: '5px',
                            }}
                        />
                        <span style={{ ...typography.bodySmall, color: colorTokens.text.secondary }}>
                            {ev.text}
                        </span>
                    </div>
                ))}
            </div>

            {/* Suggested next step */}
            <div>
                <div style={{ ...typography.captionSmall, color: colorTokens.text.quaternary, marginBottom: spacing.xs }}>
                    Suggested next step
                </div>
                <div
                    style={{
                        padding: `${spacing.sm} ${spacing.md}`,
                        borderRadius: borderRadius.md,
                        background: colorTokens.primaryInverse,
                        border: `1px solid ${colorTokens.primary}30`,
                        fontFamily: 'var(--vscode-editor-font-family, "Fira Code", monospace)',
                        fontSize: '12px',
                        color: colorTokens.primary,
                        letterSpacing: '0.2px',
                    }}
                >
                    {DEMO_COMMAND}
                </div>
            </div>

            {/* CTA */}
            <button
                type="button"
                onClick={() => onContinue(DEMO_COMMAND)}
                style={{
                    alignSelf: 'flex-start',
                    padding: `${spacing.sm} ${spacing.lg}`,
                    border: 'none',
                    borderRadius: borderRadius.md,
                    background: colorTokens.primary,
                    color: colorTokens.root,
                    cursor: 'pointer',
                    ...typography.label,
                    boxShadow: 'none',
                    transition: `opacity ${motionTokens.durations.chipFade}ms ease`,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.92';
                    setCtaInteractionState(e.currentTarget, 'hover');
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                    setCtaInteractionState(e.currentTarget, 'idle');
                }}
                onMouseDown={(e) => setCtaInteractionState(e.currentTarget, 'press')}
                onMouseUp={(e) => setCtaInteractionState(e.currentTarget, 'hover')}
            >
                Continue this scenario →
            </button>
        </div>
    );
};

interface MessageBubbleProps {
    message: ChatMessage;
    onSourceToggle: () => void;
    isSourceExpanded: boolean;
    userMode: 'guided' | 'standard' | 'expert';
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
    message,
    onSourceToggle,
    isSourceExpanded,
    userMode,
}) => {
    const isUser = message.role === 'user';

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
            }}
        >
            <div
                style={{
                    maxWidth: '80%',
                    padding: `${spacing.md} ${spacing.lg}`,
                    backgroundColor: isUser ? colorTokens.primary : colorTokens.surface2,
                    color: isUser ? colorTokens.root : colorTokens.text.primary,
                    borderRadius: borderRadius.lg,
                    border: `1px solid ${isUser ? colorTokens.primary : colorTokens.border.medium}`,
                    boxShadow: 'none',
                    ...typography.body,
                    transition: transitions.microInteraction,
                }}
            >
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {message.content}
                </div>

                {!isUser && (
                    <>
                        {message.content.includes('```') && (
                            <div
                                style={{
                                    marginTop: spacing.lg,
                                    display: 'flex',
                                    gap: spacing.sm,
                                    paddingTop: spacing.md,
                                    borderTop: `1px solid ${colorTokens.border.medium}`,
                                }}
                            >
                                <button
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: spacing.sm,
                                        padding: `${spacing.sm} ${spacing.md}`,
                                        backgroundColor: colorTokens.surface1,
                                        border: `1px solid ${colorTokens.border.medium}`,
                                        borderRadius: borderRadius.md,
                                        cursor: 'pointer',
                                        color: colorTokens.text.secondary,
                                        ...typography.label,
                                        fontSize: '11px',
                                        transition: transitions.microInteraction,
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = colorTokens.primary;
                                        e.currentTarget.style.color = colorTokens.primary;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = colorTokens.border.medium;
                                        e.currentTarget.style.color = colorTokens.text.secondary;
                                    }}
                                >
                                    <Copy size={14} /> Copy
                                </button>
                                <button
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: spacing.sm,
                                        padding: `${spacing.sm} ${spacing.md}`,
                                        backgroundColor: colorTokens.primary,
                                        border: 'none',
                                        borderRadius: borderRadius.md,
                                        cursor: 'pointer',
                                        color: colorTokens.root,
                                        ...typography.label,
                                        fontSize: '11px',
                                        transition: transitions.microInteraction,
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = colorTokens.primaryHover;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = colorTokens.primary;
                                    }}
                                >
                                    <Play size={14} /> Run
                                </button>
                            </div>
                        )}

                        {message.sources && message.sources.length > 0 && (
                            <div style={{ marginTop: spacing.md }}>
                                {/* First source always visible — evidence anchor */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                                    <SourcePillComponent source={message.sources[0]} />
                                    {message.confidence && (
                                        <span style={{ ...typography.captionSmall, color: colorTokens.text.quaternary }}>
                                            {message.confidence}% confident
                                        </span>
                                    )}
                                    {message.sources.length > 1 && (
                                        <button
                                            onClick={onSourceToggle}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: spacing.xs,
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: colorTokens.text.quaternary,
                                                ...typography.captionSmall,
                                                padding: `${spacing.xs} ${spacing.sm}`,
                                                transition: transitions.microInteraction,
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.color = colorTokens.text.secondary; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.color = colorTokens.text.quaternary; }}
                                        >
                                            <ChevronDown
                                                size={12}
                                                style={{
                                                    transform: isSourceExpanded ? 'rotate(0)' : 'rotate(-90deg)',
                                                    transition: 'transform 0.2s ease',
                                                }}
                                            />
                                            +{message.sources.length - 1} more
                                        </button>
                                    )}
                                </div>
                                {/* Remaining sources — expandable */}
                                {isSourceExpanded && userMode !== 'guided' && message.sources.length > 1 && (
                                    <div style={{ marginTop: spacing.sm, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                                        {message.sources.slice(1).map((source, idx) => (
                                            <SourcePillComponent key={idx} source={source} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

interface ActionChipProps {
    icon: React.ReactNode;
    label: string;
    delayMs?: number;
}

const ActionChip: React.FC<ActionChipProps> = ({ icon, label, delayMs = 0 }) => {
    return (
        <button
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: `${spacing.sm} ${spacing.lg}`,
                background: colorTokens.surface3,
                border: `1px solid ${colorTokens.border.medium}`,
                borderRadius: borderRadius.md,
                cursor: 'pointer',
                color: colorTokens.text.secondary,
                ...typography.label,
                fontSize: '12px',
                whiteSpace: 'nowrap',
                transition: transitions.standard,
                boxShadow: 'none',
                animation: `studioFadeIn ${motionTokens.durations.chipFade}ms ${motionTokens.easing.emphasized} ${delayMs}ms both`,
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = colorTokens.surface3;
                e.currentTarget.style.borderColor = colorTokens.primary;
                e.currentTarget.style.color = colorTokens.primary;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = colorTokens.surface3;
                e.currentTarget.style.borderColor = colorTokens.border.medium;
                e.currentTarget.style.color = colorTokens.text.secondary;
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
};

interface SuggestionChipProps {
    label: string;
}

const SuggestionChip: React.FC<SuggestionChipProps> = ({ label }) => {
    return (
        <button
            style={{
                padding: `${spacing.sm} ${spacing.md}`,
                backgroundColor: colorTokens.surface2,
                border: `1px solid ${colorTokens.border.medium}`,
                borderRadius: borderRadius.md,
                cursor: 'pointer',
                color: colorTokens.text.secondary,
                ...typography.caption,
                whiteSpace: 'nowrap',
                transition: transitions.microInteraction,
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = colorTokens.primary;
                e.currentTarget.style.color = colorTokens.primary;
                e.currentTarget.style.backgroundColor = `${colorTokens.primary}12`;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = colorTokens.border.medium;
                e.currentTarget.style.color = colorTokens.text.secondary;
                e.currentTarget.style.backgroundColor = colorTokens.surface2;
            }}
        >
            {label}
        </button>
    );
};

interface PhaseCardProps {
    phase: IncidentPhase;
}

const PhaseCard: React.FC<PhaseCardProps> = ({ phase }) => {
    return (
        <div
            style={{
                padding: `${spacing.md} ${spacing.lg}`,
                backgroundColor: `${colorTokens.accent}12`,
                border: `1px solid ${colorTokens.accent}`,
                borderRadius: borderRadius.md,
                ...typography.label,
                color: colorTokens.accent,
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: 600,
            }}
        >
            ⚡ Phase: {PHASE_LABELS[phase]}
        </div>
    );
};

interface SourcePillComponentProps {
    source: SourcePill;
}

const SourcePillComponent: React.FC<SourcePillComponentProps> = ({ source }) => {
    return (
        <div
            style={{
                padding: `${spacing.sm} ${spacing.md}`,
                backgroundColor: colorTokens.surface3,
                border: `1px solid ${colorTokens.border.medium}`,
                borderRadius: borderRadius.md,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.md,
                ...typography.caption,
                color: colorTokens.text.secondary,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                <span style={{ ...typography.captionSmall, fontWeight: 600, color: colorTokens.text.primary, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {source.type}
                </span>
                <span>{source.label}</span>
            </div>
            {source.freshness && (
                <span style={{ ...typography.captionSmall, color: colorTokens.text.quaternary }}>
                    {source.freshness}
                </span>
            )}
        </div>
    );
};

interface MetadataItemProps {
    label: string;
    value: string;
}

const MetadataItem: React.FC<MetadataItemProps> = ({ label, value }) => {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: spacing.xs,
                padding: `${spacing.xs} ${spacing.sm}`,
                borderRadius: borderRadius.sm,
                border: `1px solid ${colorTokens.border.subtle}`,
                backgroundColor: colorTokens.surface2,
            }}
        >
            <span style={{ ...typography.captionSmall, color: colorTokens.text.quaternary, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {label}
            </span>
            <span style={{ ...typography.label, color: colorTokens.text.primary }}>
                {value}
            </span>
        </div>
    );
};

interface DecisionDeckContent {
    headline: string;
    status: string;
    riskLabel: string;
    nextActionLabel: string;
    nextCommand: string;
    verifyCommand: string;
    confidence: string;
    risk: 'Low' | 'Moderate' | 'High';
    assumptions: string;
    fields: Array<{ label: string; value: string; }>;
}

const buildDecisionDeck = (
    phase: IncidentPhase,
    scopeType: ScopeType,
    userMode: 'guided' | 'standard' | 'expert',
): DecisionDeckContent => {
    const scopeLabel = scopeType === 'workspace' ? 'Workspace aggregate' : 'Project focus';

    switch (phase) {
        case 'detect':
            return {
                headline: 'Detect',
                status: 'Baseline ready',
                riskLabel: 'Low risk',
                nextActionLabel: 'Run doctor',
                nextCommand:
                    scopeType === 'workspace'
                        ? 'npx --yes --package rapidkit rapidkit doctor workspace'
                        : 'npx --yes --package rapidkit rapidkit doctor project',
                verifyCommand:
                    scopeType === 'workspace'
                        ? 'npx --yes --package rapidkit rapidkit doctor workspace'
                        : 'npx --yes --package rapidkit rapidkit doctor project',
                confidence: '84%',
                risk: 'Low',
                assumptions: `${scopeLabel} metrics only; no live backend connected.`,
                fields: [
                    { label: 'Status', value: 'Baseline snapshot ready' },
                    { label: 'Risk', value: 'No live evidence attached yet' },
                    { label: 'Next Action', value: 'Run the doctor command' },
                    { label: 'Verify', value: 'Confirm policy gates and freshness' },
                ],
            };
        case 'diagnose':
            return {
                headline: 'Diagnose',
                status: 'Evidence aligned',
                riskLabel: 'Moderate risk',
                nextActionLabel: 'Open module graph',
                nextCommand: `rapidkit incident diagnose --scope=${scopeType}`,
                verifyCommand: `rapidkit incident verify --scope=${scopeType}`,
                confidence: '88%',
                risk: 'Moderate',
                assumptions: `${scopeLabel} evidence is synthetic until backend wiring lands.`,
                fields: [
                    { label: 'Status', value: 'Evidence consolidation in progress' },
                    { label: 'Risk', value: 'Need topology and provenance context' },
                    { label: 'Next Action', value: 'Open the module graph and action matrix' },
                    { label: 'Verify', value: 'Validate sources and scope truthfulness' },
                ],
            };
        case 'plan':
            return {
                headline: 'Plan',
                status: 'Plan drafted',
                riskLabel: 'Moderate risk',
                nextActionLabel: 'Review proposed fix',
                nextCommand: `rapidkit incident plan --scope=${scopeType}`,
                verifyCommand: `rapidkit incident dry-run --scope=${scopeType}`,
                confidence: '90%',
                risk: 'Moderate',
                assumptions: `Plan is limited to the current ${scopeLabel.toLowerCase()} view.`,
                fields: [
                    { label: 'Status', value: 'Next-step plan ready' },
                    { label: 'Risk', value: 'Need blast-radius comparison' },
                    { label: 'Next Action', value: 'Review the proposed fix' },
                    { label: 'Verify', value: 'Run the dry-run before execution' },
                ],
            };
        case 'verify':
            return {
                headline: 'Verify',
                status: 'Gate pending',
                riskLabel: 'Low risk',
                nextActionLabel: 'Execute verification',
                nextCommand: `rapidkit incident verify --strict --scope=${scopeType}`,
                verifyCommand: `rapidkit release gate --scope=${scopeType}`,
                confidence: '93%',
                risk: 'Low',
                assumptions: `Verification remains scoped to ${scopeLabel.toLowerCase()}.`,
                fields: [
                    { label: 'Status', value: 'Awaiting gate confirmation' },
                    { label: 'Risk', value: 'No release claim without proof' },
                    { label: 'Next Action', value: 'Execute strict verification' },
                    { label: 'Verify', value: 'Pass the release gate' },
                ],
            };
        default:
            return {
                headline: 'Learn',
                status: 'Postmortem ready',
                riskLabel: 'Low risk',
                nextActionLabel: 'Archive evidence',
                nextCommand: `rapidkit incident summarize --scope=${scopeType}`,
                verifyCommand: `rapidkit incident archive --scope=${scopeType}`,
                confidence: userMode === 'expert' ? '95%' : '91%',
                risk: 'Low',
                assumptions: `Postmortem stays on the ${scopeLabel.toLowerCase()} record.`,
                fields: [
                    { label: 'Status', value: 'Verified outcome recorded' },
                    { label: 'Risk', value: 'Need artifact export and replay' },
                    { label: 'Next Action', value: 'Summarize and archive' },
                    { label: 'Verify', value: 'Export the evidence pack' },
                ],
            };
    }
};

interface DecisionDeckCardProps {
    deck: DecisionDeckContent;
    onExecute: (command: string) => void;
    compactMode?: boolean;
}

const DecisionDeckCard: React.FC<DecisionDeckCardProps> = ({ deck, onExecute, compactMode = false }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <section
            style={{
                padding: compactMode ? spacing.md : spacing.lg,
                border: `1px solid ${colorTokens.border.subtle}`,
                borderRadius: borderRadius.md,
                backgroundColor: colorTokens.surface3,
                boxShadow: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: spacing.sm,
                overflow: 'hidden',
                position: 'relative',
                animation: `studioEnterUp ${motionTokens.durations.deckEnter}ms ${motionTokens.easing.emphasized} ${motionTokens.delays.deckAfterSurface}ms both`,
            }}
        >
            {/* Always-visible header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
                <span
                    style={{
                        padding: `${spacing.xs} ${spacing.md}`,
                        borderRadius: borderRadius.md,
                        backgroundColor: colorTokens.primaryInverse,
                        border: `1px solid ${colorTokens.primary}40`,
                        color: colorTokens.primary,
                        ...typography.captionSmall,
                    }}
                >
                    Decision Layer
                </span>
                <span style={{ ...typography.h3, color: colorTokens.text.primary }}>{deck.headline}</span>

                <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                    onClick={() => setIsExpanded((v) => !v)}
                    style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.xs,
                        padding: `${spacing.xs} ${spacing.sm}`,
                        border: `1px solid ${colorTokens.border.subtle}`,
                        borderRadius: borderRadius.md,
                        background: 'transparent',
                        color: colorTokens.text.tertiary,
                        cursor: 'pointer',
                        ...typography.captionSmall,
                        transition: `color ${motionTokens.durations.chipFade}ms ease`,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = colorTokens.text.secondary; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = colorTokens.text.tertiary; }}
                >
                    {isExpanded ? 'Less' : 'Details'}
                    <ChevronDown
                        size={12}
                        style={{
                            transition: `transform ${motionTokens.durations.chipFade}ms ${motionTokens.easing.emphasized}`,
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                    />
                </button>
            </div>

            {/* Always-visible summary */}
            <div style={{ ...typography.body, color: colorTokens.text.secondary }}>
                <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ ...typography.captionSmall, color: colorTokens.text.tertiary }}>
                        Status: <span style={{ color: colorTokens.text.primary }}>{deck.status}</span>
                    </span>
                    <span style={{ color: colorTokens.border.medium, ...typography.captionSmall }}>·</span>
                    <span style={{ ...typography.captionSmall, color: colorTokens.text.tertiary }}>
                        Risk: <span style={{ color: deck.risk === 'Low' ? colorTokens.health.ok : deck.risk === 'Moderate' ? colorTokens.health.warning : colorTokens.error }}>{deck.riskLabel}</span>
                    </span>
                    <span style={{ color: colorTokens.border.medium, ...typography.captionSmall }}>·</span>
                    <span style={{ ...typography.captionSmall, color: colorTokens.text.tertiary }}>
                        Next: <span style={{ color: colorTokens.text.primary }}>{deck.nextActionLabel}</span>
                    </span>
                </div>
            </div>

            {/* Always-visible primary CTA */}
            <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={() => onExecute(deck.nextCommand)}
                    style={{
                        padding: `${spacing.sm} ${spacing.md}`,
                        border: 'none',
                        borderRadius: borderRadius.md,
                        background: colorTokens.primary,
                        color: colorTokens.root,
                        cursor: 'pointer',
                        ...typography.label,
                        boxShadow: 'none',
                        transition: transitions.microInteraction,
                    }}
                    onMouseEnter={(e) => setCtaInteractionState(e.currentTarget, 'hover')}
                    onMouseLeave={(e) => setCtaInteractionState(e.currentTarget, 'idle')}
                    onMouseDown={(e) => setCtaInteractionState(e.currentTarget, 'press')}
                    onMouseUp={(e) => setCtaInteractionState(e.currentTarget, 'hover')}
                >
                    Run next step
                </button>
                <span
                    style={{
                        ...typography.captionSmall,
                        color: colorTokens.text.quaternary,
                    }}
                >
                    Confidence {deck.confidence}
                </span>
            </div>

            {/* Expanded details — fields grid, verify button, assumptions */}
            {isExpanded && (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: spacing.sm,
                        animation: `studioFadeIn 220ms ${motionTokens.easing.emphasized} both`,
                    }}
                >
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: spacing.sm,
                        }}
                    >
                        {deck.fields.map((field) => (
                            <div
                                key={field.label}
                                style={{
                                    padding: spacing.md,
                                    borderRadius: borderRadius.md,
                                    backgroundColor: colorTokens.surface2,
                                    border: `1px solid ${colorTokens.border.subtle}`,
                                }}
                            >
                                <div style={{ ...typography.captionSmall, color: colorTokens.text.quaternary }}>
                                    {field.label}
                                </div>
                                <div style={{ ...typography.bodySmall, color: colorTokens.text.primary, marginTop: spacing.xs }}>
                                    {field.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={() => onExecute(deck.verifyCommand)}
                            style={{
                                padding: `${spacing.sm} ${spacing.md}`,
                                border: `1px solid ${colorTokens.border.medium}`,
                                borderRadius: borderRadius.md,
                                backgroundColor: colorTokens.surface2,
                                color: colorTokens.text.primary,
                                cursor: 'pointer',
                                ...typography.label,
                                transition: transitions.microInteraction,
                            }}
                            onMouseEnter={(e) => setCtaInteractionState(e.currentTarget, 'hover')}
                            onMouseLeave={(e) => setCtaInteractionState(e.currentTarget, 'idle')}
                            onMouseDown={(e) => setCtaInteractionState(e.currentTarget, 'press')}
                            onMouseUp={(e) => setCtaInteractionState(e.currentTarget, 'hover')}
                        >
                            Verify: {deck.verifyCommand}
                        </button>
                    </div>

                    <div
                        style={{
                            padding: spacing.md,
                            borderRadius: borderRadius.md,
                            backgroundColor: colorTokens.surface2,
                            border: `1px solid ${colorTokens.border.subtle}`,
                            ...typography.bodySmall,
                            color: colorTokens.text.secondary,
                        }}
                    >
                        Assumptions: {deck.assumptions}
                    </div>
                </div>
            )}
        </section>
    );
};
