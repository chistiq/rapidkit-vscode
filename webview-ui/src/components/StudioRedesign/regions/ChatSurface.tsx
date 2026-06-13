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
    MessageSquare,
} from 'lucide-react';
import { studioClass, riskToneClass, chipFadeClass } from '../styles/studioUi';
import { buildActionOutcomePresentation } from '../../../lib/incidentStudioActionOutcomePresentation';
import type {
    NormalizedIncidentActionResultPayload,
    IncidentReproPackEvidence,
    IncidentReleaseReadinessCommanderArtifact,
} from '../../../lib/incidentStudioPayload';
import {
    resolveGuidedIntentChipsFromStudioContext,
    type GuidedIntentChip,
} from '../../../lib/incidentStudioGuidedActions';
import { ActionOutcomePanel, type ActionOutcomeCallbacks } from './ActionOutcomePanel';
import {
    ChatMessage,
    SourcePill,
    IncidentPhase,
    ScopeType,
    StudioEvidenceSummary,
    AIActionRegistryView,
    PHASE_LABELS,
    PHASE_SEQUENCE,
} from '../state/studioState';
import { STUDIO_ACTION_COMMANDS, StudioActionCommand } from '../state/studioActions';

interface ChatSurfaceProps {
    messages: ChatMessage[];
    isStreaming: boolean;
    currentPhase: IncidentPhase;
    scopeType: ScopeType;
    onSendMessage: (content: string) => void;
    onCopyText?: (text: string) => void;
    onPhaseAdvance?: (phase: IncidentPhase) => void;
    onAddActionItem?: (text: string) => void;
    userMode: 'guided' | 'standard' | 'expert';
    compactMode?: boolean;
    guidedMode?: boolean;
    showDemoScenario?: boolean;
    studioEvidence?: StudioEvidenceSummary;
    aiActionRegistry?: AIActionRegistryView | null;
    actionResult?: NormalizedIncidentActionResultPayload | null;
    verifyGateBlockedReasons?: string[];
    actionOutcomeCallbacks?: ActionOutcomeCallbacks;
    onLearnExportArchive?: {
        onExportReproPack?: (reproPack: IncidentReproPackEvidence) => void;
        onExportReleaseReadiness?: (
            releaseReadiness: IncidentReleaseReadinessCommanderArtifact,
        ) => void;
    };
    guidedPrimaryBoardAction?: { label: string; command?: string } | null;
    onRunGuidedCommand?: (command: string) => void;
}

export const ChatSurface: React.FC<ChatSurfaceProps> = ({
    messages,
    isStreaming,
    currentPhase,
    scopeType,
    onSendMessage,
    onCopyText,
    onPhaseAdvance,
    onAddActionItem,
    userMode,
    compactMode = false,
    guidedMode = false,
    showDemoScenario = false,
    studioEvidence,
    aiActionRegistry,
    actionResult,
    verifyGateBlockedReasons = [],
    actionOutcomeCallbacks,
    onLearnExportArchive,
    guidedPrimaryBoardAction = null,
    onRunGuidedCommand,
}) => {
    const [input, setInput] = useState('');
    const [expandedSourceMessageId, setExpandedSourceMessageId] = useState<string | null>(null);
    void showDemoScenario;
    const [showQuickActions, setShowQuickActions] = useState(false);
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
    const actionOutcome = buildActionOutcomePresentation(actionResult, verifyGateBlockedReasons);
    const guidedIntentChips = guidedMode
        ? resolveGuidedIntentChipsFromStudioContext({
              scopeType,
              primaryBoardAction: guidedPrimaryBoardAction,
              actionResult,
          })
        : [];
    const decisionDeck = buildDecisionDeck(currentPhase, scopeType, userMode, studioEvidence, aiActionRegistry);
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

    const isSparseChat = messages.length === 0;

    return (
        <div className={`${studioClass.chatSurface}${isSparseChat ? ' is-sparse' : ''}`}>
            {/* Conversation header */}
            <div className={studioClass.chatHeader}>
                <div className={`${studioClass.rowSm} ${studioClass.minW0}`}>
                    <span className={studioClass.kicker}>Conversation</span>
                    <span className={`${studioClass.chip} is-active`}>{PHASE_LABELS[currentPhase]}</span>
                </div>
                <div className={`${studioClass.rowMd} ${studioClass.flexShrink0}`}>
                    <div className={studioClass.metric}>
                        <span className={studioClass.metricLabel}>Messages</span>
                        <span className={studioClass.metricValue}>{messages.length}</span>
                    </div>
                    {isStreaming ? (
                        <span className={studioClass.streaming}>
                            <span className="studio-streaming__dot" aria-hidden="true" />
                            Thinking
                        </span>
                    ) : null}
                </div>
            </div>

            {guidedMode ? (
                <div className={`${studioClass.banner} studio-guided-banner`}>
                    <strong>Guided route</strong>
                    <span>
                        One safe next step and one verify command — no dense action board in this mode.
                    </span>
                </div>
            ) : null}

            {/* Quick Action Chips */}
            {messages.length > 0 && !guidedMode && (
                <div className={`${studioClass.quickBar}${compactMode ? ' is-compact' : ''}`}>
                    <button
                        type="button"
                        onClick={() => setShowQuickActions((v) => !v)}
                        className={studioClass.btnGhost}
                    >
                        Quick actions
                        <ChevronDown
                            size={12}
                            className={`${studioClass.chevron}${showQuickActions ? ' is-open' : ''}`}
                        />
                    </button>
                    {showQuickActions && (
                        <div className="studio-quick-bar__actions">
                            <ActionChip
                                icon={<Zap size={16} />}
                                label="Terminal Bridge"
                                onClick={() => onSendMessage(STUDIO_ACTION_COMMANDS.terminalBridge)}
                                staggerIndex={0}
                            />
                            <ActionChip
                                icon={<Code size={16} />}
                                label="Fix Lens"
                                onClick={() => onSendMessage(STUDIO_ACTION_COMMANDS.fixLens)}
                                staggerIndex={1}
                            />
                            <ActionChip
                                icon={<Lightbulb size={16} />}
                                label="Impact Lens"
                                onClick={() => onSendMessage(STUDIO_ACTION_COMMANDS.impactLens)}
                                staggerIndex={2}
                            />
                        </div>
                    )}
                </div>
            )}

            {currentPhase === 'learn' ? (
                <div className={studioClass.chatContext}>
                    <PostmortemCard
                        deck={decisionDeck}
                        onExecute={(command) => onSendMessage(command)}
                        onAddActionItem={onAddActionItem}
                        onLearnExportArchive={onLearnExportArchive}
                        actionResult={actionResult}
                    />
                </div>
            ) : !guidedMode ? (
                <div className={studioClass.chatContext}>
                    <DecisionDeckCard
                        deck={decisionDeck}
                        onExecute={(command) => onSendMessage(command)}
                        compactMode={compactMode}
                        guidedMode={guidedMode}
                    />
                </div>
            ) : null}

            {/* Messages Timeline */}
            <div
                role="log"
                aria-live="polite"
                aria-busy={isStreaming}
                ref={timelineRef}
                onScroll={handleTimelineScroll}
                className={`${studioClass.chatTimeline}${compactMode ? ' is-compact' : ''}${isSparseChat ? ' is-sparse' : ''}`}
            >
                {messages.length === 0 ? (
                    <div className={studioClass.emptyState}>
                        <div className="studio-empty-state__icon" aria-hidden="true">
                            <MessageSquare size={18} />
                        </div>
                        <div className={studioClass.emptyStateTitle}>
                            {guidedMode ? 'One safe route to resolution' : 'Start the incident review'}
                        </div>
                        <div className={studioClass.emptyStateBody}>
                            {guidedMode
                                ? 'Evidence is ready. Use the guided chips below for the next deterministic step, then verify before claiming completion.'
                                : 'Evidence is loaded. Ask Studio to explain findings, map blast radius, or validate release gates with explicit proof.'}
                        </div>
                        {guidedMode && guidedIntentChips.length > 0 && onRunGuidedCommand ? (
                            <div
                                className="studio-empty-state__guided-actions"
                                aria-label="Guided intent chips"
                            >
                                {guidedIntentChips.map((chip) => (
                                    <GuidedIntentChipButton
                                        key={chip.id}
                                        chip={chip}
                                        onRun={onRunGuidedCommand}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className={studioClass.starterActions}>
                                <ActionChip
                                    icon={<Zap size={14} />}
                                    label="Run Analyze"
                                    onClick={() => onSendMessage(STUDIO_ACTION_COMMANDS.runAnalyze)}
                                />
                                <ActionChip
                                    icon={<Lightbulb size={14} />}
                                    label="Impact Lens"
                                    onClick={() => onSendMessage(STUDIO_ACTION_COMMANDS.impactLens)}
                                />
                                <ActionChip
                                    icon={<Code size={14} />}
                                    label="Verify Gates"
                                    onClick={() => onSendMessage(STUDIO_ACTION_COMMANDS.verifyGates)}
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} className={studioClass.messageThread}>
                            {msg.phase && msg.role === 'assistant' && (
                                <PhaseCard phase={msg.phase} />
                            )}
                            <MessageBubble
                                message={msg}
                                onCopyText={onCopyText}
                                onAddActionItem={onAddActionItem}
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
                {showJumpToLatest && (
                    <div className={studioClass.jumpLatest}>
                        <button
                            type="button"
                            onClick={jumpToLatest}
                            className={studioClass.btnGhost}
                        >
                            Jump to latest
                        </button>
                    </div>
                )}
                <div ref={bottomAnchorRef} aria-hidden="true" />
            </div>

            {actionOutcome ? (
                <ActionOutcomePanel
                    presentation={actionOutcome}
                    actionResult={actionResult}
                    callbacks={actionOutcomeCallbacks}
                    guidedMode={guidedMode}
                />
            ) : null}

            {/* Input Area */}
            <div className={studioClass.composer}>
                {/* Phase Advancement Gate — shown after ≥2 messages, not on 'learn' */}
                {messages.length >= 2 && currentPhase !== 'learn' && onPhaseAdvance && (() => {
                    const nextIdx = PHASE_SEQUENCE.indexOf(currentPhase) + 1;
                    const nextPhase = PHASE_SEQUENCE[nextIdx] as IncidentPhase | undefined;
                    if (!nextPhase) { return null; }
                    return (
                        <PhaseAdvancementGate
                            currentPhase={currentPhase}
                            nextPhase={nextPhase}
                            guidedMode={guidedMode}
                            onAdvance={() => onPhaseAdvance(nextPhase)}
                        />
                    );
                })()}

                {/* Guided intent chips — deterministic next + verify only */}
                {guidedMode && guidedIntentChips.length > 0 && onRunGuidedCommand ? (
                    <div className={studioClass.suggestionRow} aria-label="Guided intent chips">
                        {guidedIntentChips.map((chip) => (
                            <GuidedIntentChipButton
                                key={chip.id}
                                chip={chip}
                                onRun={onRunGuidedCommand}
                            />
                        ))}
                    </div>
                ) : null}

                {/* Suggestion chips — expert mode only */}
                {messages.length > 0 && userMode === 'expert' && !guidedMode && (
                    <div className={studioClass.suggestionRow}>
                        <SuggestionChip label="Analyze git log" command={STUDIO_ACTION_COMMANDS.runAnalyze} onSelect={onSendMessage} />
                        <SuggestionChip label="Check dependencies" command={STUDIO_ACTION_COMMANDS.impactLens} onSelect={onSendMessage} />
                        <SuggestionChip label="Generate fix" command={STUDIO_ACTION_COMMANDS.fixLens} onSelect={onSendMessage} />
                        <SuggestionChip label="Verify gates" command={STUDIO_ACTION_COMMANDS.verifyGates} onSelect={onSendMessage} />
                    </div>
                )}

                {/* Status line — slim bar replacing the metadata card */}
                {userMode === 'expert' ? (
                    <div className={studioClass.composerMeta}>
                        <MetadataItem label="Scope" value={scopeType === 'workspace' ? 'Workspace' : 'Project'} />
                        <MetadataItem label="Phase" value={PHASE_LABELS[currentPhase]} />
                        <MetadataItem label="Model" value="WorkspAI" />
                    </div>
                ) : null}

                {/* Input */}
                <div className={studioClass.composerField}>
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
                        className={studioClass.composerInput}
                    />
                    <button
                        onClick={handleSend}
                        disabled={sendDisabled}
                        aria-disabled={sendDisabled}
                        aria-label="Send message"
                        className={`${studioClass.btnAccent}${sendDisabled ? ' studio-composer__send is-disabled' : ''}`}
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
    guidedMode?: boolean;
    onAdvance: () => void;
}

const PhaseAdvancementGate: React.FC<PhaseAdvancementGateProps> = ({
    currentPhase,
    nextPhase,
    guidedMode = false,
    onAdvance,
}) => {
    const currentLabel = PHASE_LABELS[currentPhase];
    const nextLabel = PHASE_LABELS[nextPhase];
    return (
        <div className={`${studioClass.phaseGate}${guidedMode ? ' is-guided' : ''}`}>
            <span className="studio-phase-gate__label">
                {guidedMode ? (
                    <>
                        <strong>{currentLabel}</strong> complete — ready for {nextLabel}?
                    </>
                ) : (
                    <>
                        ✓ <strong>{currentLabel}</strong> context gathered
                    </>
                )}
            </span>
            <button type="button" onClick={onAdvance} className={studioClass.btnSuccess}>
                {guidedMode ? `Continue to ${nextLabel}` : `Advance to ${nextLabel} →`}
            </button>
        </div>
    );
};

// ─── Postmortem Summary Card ──────────────────────────────────────────────────

interface PostmortemCardProps {
    deck: DecisionDeckContent;
    onExecute: (command: string) => void;
    onAddActionItem?: (text: string) => void;
    onLearnExportArchive?: {
        onExportReproPack?: (reproPack: IncidentReproPackEvidence) => void;
        onExportReleaseReadiness?: (
            releaseReadiness: IncidentReleaseReadinessCommanderArtifact,
        ) => void;
    };
    actionResult?: NormalizedIncidentActionResultPayload | null;
}

const PostmortemCard: React.FC<PostmortemCardProps> = ({
    deck,
    onExecute,
    onAddActionItem,
    onLearnExportArchive,
    actionResult = null,
}) => {
    const [actionInput, setActionInput] = useState('');

    const submitAction = () => {
        const trimmed = actionInput.trim();
        if (!trimmed || !onAddActionItem) { return; }
        onAddActionItem(trimmed);
        setActionInput('');
    };

    return (
        <div className={studioClass.postmortemCard}>
            <div className="studio-postmortem-card__header">
                <span className={studioClass.postmortemEmoji} aria-hidden="true">✅</span>
                <span className="studio-postmortem-card__title">Incident Resolved · Learn</span>
            </div>
            <div className="studio-postmortem-card__meta">
                <span>Status: <strong>{deck.status}</strong></span>
                <span className="studio-summary-meta__sep">·</span>
                <span>Risk: <span className="is-ok">{deck.riskLabel}</span></span>
                <span className="studio-summary-meta__sep">·</span>
                <span>Next: <strong>{deck.nextActionLabel}</strong></span>
            </div>
            {onAddActionItem && (
                <div className="studio-inline-form">
                    <input
                        value={actionInput}
                        onChange={(e) => setActionInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { submitAction(); } }}
                        placeholder="Add follow-up action…"
                        className={studioClass.field}
                    />
                    <button
                        type="button"
                        onClick={submitAction}
                        disabled={!actionInput.trim()}
                        className={studioClass.btnSuccess}
                    >
                        + Add
                    </button>
                </div>
            )}
            <div className={`${studioClass.rowSm} ${studioClass.wrap}`}>
                <button
                    type="button"
                    onClick={() => onAddActionItem?.('Draft postmortem from current Studio audit trail, evidence, and approval events.')}
                    disabled={!onAddActionItem}
                    className={studioClass.btnSuccess}
                >
                    Add Postmortem Task
                </button>
                <button
                    type="button"
                    onClick={() => onExecute(STUDIO_ACTION_COMMANDS.verifyGates)}
                    className={studioClass.btnOutlineSuccess}
                >
                    Verify Evidence
                </button>
                {onLearnExportArchive?.onExportReproPack && actionResult?.incidentReproPack ? (
                    <button
                        type="button"
                        onClick={() =>
                            onLearnExportArchive.onExportReproPack!(actionResult.incidentReproPack!)
                        }
                        className={studioClass.btnOutlineSuccess}
                    >
                        Export repro pack
                    </button>
                ) : null}
                {onLearnExportArchive?.onExportReleaseReadiness &&
                actionResult?.releaseReadinessCommander ? (
                    <button
                        type="button"
                        onClick={() =>
                            onLearnExportArchive.onExportReleaseReadiness!(
                                actionResult.releaseReadinessCommander!,
                            )
                        }
                        className={studioClass.btnOutlineSuccess}
                    >
                        Export release readiness
                    </button>
                ) : null}
            </div>
        </div>
    );
};

interface MessageBubbleProps {
    message: ChatMessage;
    onCopyText?: (text: string) => void;
    onAddActionItem?: (text: string) => void;
    onSourceToggle: () => void;
    isSourceExpanded: boolean;
    userMode: 'guided' | 'standard' | 'expert';
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
    message,
    onCopyText,
    onAddActionItem,
    onSourceToggle,
    isSourceExpanded,
    userMode,
}) => {
    const isUser = message.role === 'user';
    const actionText = message.content
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean)
        ?.replace(/^[-*]\s*/, '')
        .slice(0, 160) || 'Review Studio recommendation';

    return (
        <div className={`${studioClass.messageRow}${isUser ? ' is-user' : ''}`}>
            <div className={isUser ? studioClass.messageUser : studioClass.messageAssistant}>
                <span className="studio-message__role">{isUser ? 'You' : 'Studio'}</span>
                <div className={studioClass.preWrap}>{message.content}</div>

                {!isUser && (
                    <>
                        {message.content.includes('```') && (
                            <div className="studio-message-toolbar">
                                <button
                                    type="button"
                                    onClick={() => onCopyText?.(message.content)}
                                    disabled={!onCopyText}
                                    className={studioClass.btnGhost}
                                >
                                    <Copy size={14} /> Copy
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onAddActionItem?.(actionText)}
                                    disabled={!onAddActionItem}
                                    className={studioClass.btnPrimary}
                                >
                                    <Play size={14} /> Add to actions
                                </button>
                            </div>
                        )}

                        {message.sources && message.sources.length > 0 && (
                            <div className="studio-message-sources">
                                <div className="studio-message-sources__row">
                                    <SourcePillComponent source={message.sources[0]} />
                                    {message.confidence && (
                                        <span className={`${studioClass.captionSmall} studio-u-text-subtle`}>
                                            {message.confidence}% confident
                                        </span>
                                    )}
                                    {message.sources.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={onSourceToggle}
                                            className={`studio-link-btn${isSourceExpanded ? ' is-expanded' : ''}`}
                                        >
                                            <ChevronDown size={12} />
                                            +{message.sources.length - 1} more
                                        </button>
                                    )}
                                </div>
                                {isSourceExpanded && userMode !== 'guided' && message.sources.length > 1 && (
                                    <div className={`${studioClass.mtSm} ${studioClass.stackSm}`}>
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
    onClick: () => void;
    staggerIndex?: number;
}

const ActionChip: React.FC<ActionChipProps> = ({ icon, label, onClick, staggerIndex }) => {
    const fadeClass = chipFadeClass(staggerIndex);

    return (
        <button
            type="button"
            onClick={onClick}
            className={`${studioClass.chip}${fadeClass ? ` ${fadeClass}` : ''}`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
};

interface SuggestionChipProps {
    label: string;
    command: StudioActionCommand;
    onSelect: (command: string) => void;
}

const SuggestionChip: React.FC<SuggestionChipProps> = ({ label, command, onSelect }) => (
    <button type="button" className={studioClass.chip} onClick={() => onSelect(command)}>
        {label}
    </button>
);

interface GuidedIntentChipButtonProps {
    chip: GuidedIntentChip;
    onRun: (command: string) => void;
}

const GuidedIntentChipButton: React.FC<GuidedIntentChipButtonProps> = ({ chip, onRun }) => (
    <button
        type="button"
        className={chip.isPrimary ? studioClass.chipActive : studioClass.chip}
        title={chip.detail}
        aria-label={`${chip.label}: ${chip.detail}`}
        onClick={() => onRun(chip.command)}
    >
        {chip.label}
    </button>
);

interface PhaseCardProps {
    phase: IncidentPhase;
}

const PhaseCard: React.FC<PhaseCardProps> = ({ phase }) => (
    <span className={`${studioClass.chip} is-active ${studioClass.selfStart}`}>
        Phase · {PHASE_LABELS[phase]}
    </span>
);

interface SourcePillComponentProps {
    source: SourcePill;
}

const SourcePillComponent: React.FC<SourcePillComponentProps> = ({ source }) => (
    <div className="studio-source-pill">
        <span className="studio-source-pill__type">{source.type}</span>
        <span>{source.label}</span>
        {source.freshness ? (
            <span className={`${studioClass.captionSmall} studio-u-text-subtle`}>{source.freshness}</span>
        ) : null}
    </div>
);

interface MetadataItemProps {
    label: string;
    value: string;
}

const MetadataItem: React.FC<MetadataItemProps> = ({ label, value }) => (
    <div className={studioClass.metric}>
        <span className={studioClass.metricLabel}>{label}</span>
        <span className={studioClass.metricValue}>{value}</span>
    </div>
);

interface DecisionDeckContent {
    headline: string;
    status: string;
    riskLabel: string;
    nextActionLabel: string;
    nextCommand: StudioActionCommand;
    verifyCommand: StudioActionCommand;
    confidence: string;
    risk: 'Low' | 'Moderate' | 'High';
    assumptions: string;
    fields: Array<{ label: string; value: string; }>;
}

const buildDecisionDeck = (
    phase: IncidentPhase,
    scopeType: ScopeType,
    userMode: 'guided' | 'standard' | 'expert',
    studioEvidence?: StudioEvidenceSummary,
    aiActionRegistry?: AIActionRegistryView | null,
): DecisionDeckContent => {
    const scopeLabel = scopeType === 'workspace' ? 'Workspace aggregate' : 'Project focus';
    const findingCounts = studioEvidence?.findings ?? { fail: 0, warn: 0, info: 0 };
    const failCount = Math.max(0, findingCounts.fail);
    const warnCount = Math.max(0, findingCounts.warn);
    const infoCount = Math.max(0, findingCounts.info);
    const totalFindings = failCount + warnCount + infoCount;
    const evidenceReady = Boolean(studioEvidence?.generatedAt || totalFindings > 0 || typeof studioEvidence?.score === 'number');
    const verdict = studioEvidence?.verdict ?? (evidenceReady ? 'needs-attention' : undefined);
    const scoreValue = typeof studioEvidence?.score === 'number' ? `${studioEvidence.score}` : 'Pending';
    const primaryFinding =
        studioEvidence?.topFindings.find((finding) => finding.severity === 'fail') ??
        studioEvidence?.topFindings.find((finding) => finding.severity === 'warn') ??
        studioEvidence?.topFindings[0];
    const latestAction = aiActionRegistry?.entries[0];
    const latestExecution = latestAction?.executions[0];
    const registryLabel = latestAction
        ? `${latestAction.actionType}/${latestAction.lifecycleStatus}`
        : 'No governed action yet';
    const evidenceFreshness = studioEvidence?.generatedAt ?? 'No analyze evidence loaded';
    const releaseCommand = studioEvidence?.releaseGateCommand || STUDIO_ACTION_COMMANDS.verifyGates;

    const risk: DecisionDeckContent['risk'] =
        verdict === 'blocked' || failCount > 0 ? 'High' :
            verdict === 'needs-attention' || warnCount > 0 ? 'Moderate' :
                'Low';
    const riskLabel =
        risk === 'High' ? `${failCount || 1} blocker${failCount === 1 ? '' : 's'}` :
            risk === 'Moderate' ? `${warnCount || totalFindings || 1} item${(warnCount || totalFindings) === 1 ? '' : 's'} need review` :
                'Ready posture';
    const confidence =
        !evidenceReady ? 'Pending' :
            verdict === 'ready' ? (userMode === 'expert' ? '94%' : '91%') :
                verdict === 'blocked' ? '76%' :
                    '84%';
    const defaultNextCommand: StudioActionCommand =
        !evidenceReady ? STUDIO_ACTION_COMMANDS.runAnalyze :
            failCount > 0 ? STUDIO_ACTION_COMMANDS.impactLens :
                warnCount > 0 ? STUDIO_ACTION_COMMANDS.verifyGates :
                    STUDIO_ACTION_COMMANDS.verifyGates;
    const defaultNextAction =
        !evidenceReady ? 'Load evidence' :
            failCount > 0 ? 'Map impact' :
                warnCount > 0 ? 'Verify gates' :
                    'Confirm release gate';
    const commonFields: DecisionDeckContent['fields'] = [
        { label: 'Evidence', value: evidenceFreshness },
        { label: 'Score', value: scoreValue },
        { label: 'Findings', value: `${failCount} fail / ${warnCount} warn / ${infoCount} info` },
        { label: 'Top Target', value: primaryFinding ? `${primaryFinding.target}: ${primaryFinding.title}` : 'No top finding reported' },
        { label: 'AI Action', value: registryLabel },
        { label: 'Verification', value: latestExecution?.evidenceSha256 ? `Evidence ${latestExecution.evidenceSha256.slice(0, 12)}` : releaseCommand },
    ];
    const findingRemediation = primaryFinding?.remediation
        ? ` Primary remediation: ${primaryFinding.remediation}`
        : '';
    const assumptions = `${scopeLabel} context is based on ${evidenceFreshness}. ${evidenceReady ? 'Actions remain approval-gated with verify and rollback evidence.' : 'Run analyze before making a release or fix claim.'}${findingRemediation}`;

    switch (phase) {
        case 'detect':
            return {
                headline: 'Detect',
                status: evidenceReady ? `Evidence ${verdict}` : 'Evidence missing',
                riskLabel,
                nextActionLabel: evidenceReady ? defaultNextAction : 'Run analyze',
                nextCommand: defaultNextCommand,
                verifyCommand: STUDIO_ACTION_COMMANDS.verifyGates,
                confidence,
                risk,
                assumptions,
                fields: commonFields,
            };
        case 'diagnose':
            return {
                headline: 'Diagnose',
                status: primaryFinding ? `Focus: ${primaryFinding.target}` : 'Evidence review',
                riskLabel,
                nextActionLabel: failCount > 0 ? 'Map blast radius' : defaultNextAction,
                nextCommand: STUDIO_ACTION_COMMANDS.impactLens,
                verifyCommand: STUDIO_ACTION_COMMANDS.verifyGates,
                confidence,
                risk,
                assumptions,
                fields: commonFields,
            };
        case 'plan':
            return {
                headline: 'Plan',
                status: latestAction ? `Contract ${latestAction.validationStatus}` : 'Action contract needed',
                riskLabel: latestAction?.riskLevel ? `${latestAction.riskLevel} contract risk` : riskLabel,
                nextActionLabel: latestAction?.validationStatus === 'valid' ? 'Review governed fix' : 'Draft action contract',
                nextCommand: latestAction?.validationStatus === 'valid' ? STUDIO_ACTION_COMMANDS.verifyGates : STUDIO_ACTION_COMMANDS.fixLens,
                verifyCommand: STUDIO_ACTION_COMMANDS.impactLens,
                confidence,
                risk: latestAction?.riskLevel === 'high' ? 'High' : risk,
                assumptions,
                fields: commonFields,
            };
        case 'verify':
            return {
                headline: 'Verify',
                status: verdict === 'ready' ? 'Release evidence ready' : 'Gate requires proof',
                riskLabel,
                nextActionLabel: 'Execute verification',
                nextCommand: STUDIO_ACTION_COMMANDS.verifyGates,
                verifyCommand: STUDIO_ACTION_COMMANDS.runAnalyze,
                confidence,
                risk,
                assumptions,
                fields: commonFields,
            };
        default:
            return {
                headline: 'Learn',
                status: latestExecution?.ok ? 'Outcome evidence captured' : 'Outcome review pending',
                riskLabel,
                nextActionLabel: 'Archive evidence',
                nextCommand: STUDIO_ACTION_COMMANDS.runAnalyze,
                verifyCommand: STUDIO_ACTION_COMMANDS.verifyGates,
                confidence,
                risk,
                assumptions,
                fields: commonFields,
            };
    }
};

interface DecisionDeckCardProps {
    deck: DecisionDeckContent;
    onExecute: (command: string) => void;
    compactMode?: boolean;
    guidedMode?: boolean;
}

const DecisionDeckCard: React.FC<DecisionDeckCardProps> = ({
    deck,
    onExecute,
    compactMode = false,
    guidedMode = false,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (guidedMode) {
            setIsExpanded(false);
        }
    }, [guidedMode]);

    return (
        <section className={`${studioClass.card} ${studioClass.decisionDeckCard}`}>
            <div className={studioClass.decisionDeckHead}>
                <span className={`${studioClass.chip} is-active`}>Decision Layer</span>
                <span className="studio-decision-headline">{deck.headline}</span>

                <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                    onClick={() => setIsExpanded((v) => !v)}
                    className={`${studioClass.btnGhost} ${studioClass.mlAuto}`}
                >
                    {isExpanded ? 'Less' : 'Details'}
                    <ChevronDown
                        size={12}
                        className={`${studioClass.chevron}${isExpanded ? ' is-open' : ''}`}
                    />
                </button>
            </div>

            <div className={studioClass.decisionDeckSummary}>
                <div className="studio-summary-meta">
                    <span>Status: <strong>{deck.status}</strong></span>
                    <span className="studio-summary-meta__sep">·</span>
                    <span>
                        Risk:{' '}
                        <span className={`${riskToneClass(deck.risk)} ${studioClass.fw650}`}>
                            {deck.riskLabel}
                        </span>
                    </span>
                    <span className="studio-summary-meta__sep">·</span>
                    <span>Next: <strong>{deck.nextActionLabel}</strong></span>
                </div>
            </div>

            {!guidedMode ? (
                <div className={studioClass.decisionDeckActions}>
                    <button
                        type="button"
                        onClick={() => onExecute(deck.nextCommand)}
                        className={studioClass.btnPrimary}
                    >
                        Run next step
                    </button>
                    <span className={`${studioClass.captionSmall} studio-u-text-subtle`}>
                        Confidence {deck.confidence}
                    </span>
                </div>
            ) : null}

            {isExpanded && (
                <div className={studioClass.decisionDeckExpanded}>
                    <div className={studioClass.traceGrid}>
                        {deck.fields.map((field) => (
                            <div key={field.label} className="studio-trace-tile">
                                <div className="studio-trace-tile__label">{field.label}</div>
                                <div className="studio-trace-tile__value">{field.value}</div>
                            </div>
                        ))}
                    </div>

                    <div className={`${studioClass.rowSm} ${studioClass.wrap}`}>
                        <button
                            type="button"
                            onClick={() => onExecute(deck.verifyCommand)}
                            className={studioClass.btnGhost}
                        >
                            Verify: {deck.verifyCommand}
                        </button>
                    </div>

                    <div className={studioClass.decisionDeckAssumptions}>
                        Assumptions: {deck.assumptions}
                    </div>
                </div>
            )}
        </section>
    );
};
