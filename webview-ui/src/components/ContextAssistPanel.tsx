import { useState, useEffect, useRef } from 'react';
import { ArrowRight, Bug, BrainCircuit, PanelRightClose, Sparkles } from 'lucide-react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ChatComposer } from '@/components/ChatComposer';
import type { ModelSelectOption } from '@/components/ModelSelect';
import {
    CONTEXT_ASSIST_FRAMEWORK_LABELS,
    CONTEXT_ASSIST_TYPE_LABELS,
    getContextAssistQuickPrompts,
    type ContextAssistContext,
    type ContextAssistContractSummary,
    type ContextAssistMode,
} from '@/lib/contextAssist';

interface ContextAssistPanelProps {
    isOpen: boolean;
    context: ContextAssistContext | null;
    isStreaming: boolean;
    streamContent: string;
    streamError: string | null;
    availableModels?: ModelSelectOption[];
    selectedModelId?: string | null;
    preferredModelId?: string;
    modelsLoading?: boolean;
    contextContract?: ContextAssistContractSummary | null;
    onModelChange?: (modelId: string | null) => void;
    onClose: () => void;
    onCancel: () => void;
    onQuery: (mode: ContextAssistMode, question: string, context: ContextAssistContext) => void;
    onStartNewQuery?: () => void;
    onOpenIncidentStudio?: (initialQuery?: string) => void;
}

export function ContextAssistPanel({
    isOpen,
    context,
    isStreaming,
    streamContent,
    streamError,
    availableModels = [],
    selectedModelId,
    preferredModelId = 'auto',
    modelsLoading = false,
    contextContract,
    onModelChange,
    onClose,
    onCancel,
    onQuery,
    onStartNewQuery,
    onOpenIncidentStudio,
}: ContextAssistPanelProps) {
    const [mode, setMode] = useState<ContextAssistMode>('ask');
    const [input, setInput] = useState('');
    const responseRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && context) {
            if (context.prefillQuestion) {
                setMode(context.prefillMode ?? 'debug');
                setInput(context.prefillQuestion);
            } else {
                setMode('ask');
                setInput('');
            }
        }
    }, [isOpen, context]);

    useEffect(() => {
        if (responseRef.current) {
            responseRef.current.scrollTop = responseRef.current.scrollHeight;
        }
    }, [streamContent]);

    if (!isOpen || !context) {
        return null;
    }

    const quickPrompts = getContextAssistQuickPrompts(context, mode);

    const handleSubmit = () => {
        if (!input.trim() || isStreaming) { return; }
        onQuery(mode, input.trim(), context);
    };

    const handleComposerKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (isStreaming) {
                onCancel();
            } else {
                onClose();
            }
        }
    };

    const fwLabel = context.framework
        ? CONTEXT_ASSIST_FRAMEWORK_LABELS[context.framework] || context.framework
        : null;
    const hasResponse = streamContent.length > 0 || streamError;
    const activeSafetyFlags = contextContract?.safetyFlags
        ? Object.entries(contextContract.safetyFlags)
            .filter(([, value]) => value)
            .map(([key]) => key)
        : [];

    const studioQuery = input.trim() || streamContent.trim().slice(0, 2000) || undefined;

    return (
        <aside
            className="ws-assist-panel"
            aria-label={`Context assist — ${context.name}`}
        >
            <header className="ws-assist-panel__header">
                <div className="ws-assist-panel__title-block">
                    <div className="ws-kicker ws-assist-panel__kicker">Impact Lens</div>
                    <div className="ws-assist-panel__title">{context.name}</div>
                    <div className="ws-assist-panel__meta">
                        <span className="ws-chip ws-chip--muted">
                            {CONTEXT_ASSIST_TYPE_LABELS[context.type] || context.type}
                        </span>
                        {fwLabel ? <span className="ws-chip ws-chip--muted">{fwLabel}</span> : null}
                        {contextContract?.evidence_confidence ? (
                            <span className="ws-chip ws-chip--accent">
                                Evidence {contextContract.evidence_confidence}
                            </span>
                        ) : null}
                    </div>
                </div>
                <div className="ws-assist-panel__header-actions">
                    <button
                        type="button"
                        className="ws-btn ws-btn--ghost ws-btn--icon ws-assist-panel__close"
                        onClick={onClose}
                        disabled={isStreaming}
                        aria-label="Close context assist"
                        title="Close panel"
                    >
                        <PanelRightClose size={15} />
                    </button>
                </div>
            </header>

            <div className="ws-assist-panel__toolbar">
                <div className="ws-assist-panel__tabs" role="tablist" aria-label="Assist mode">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'ask'}
                        className={`ws-chip ${mode === 'ask' ? 'is-active' : ''}`}
                        onClick={() => {
                            setMode('ask');
                            setInput('');
                            onStartNewQuery?.();
                        }}
                    >
                        <BrainCircuit size={13} />
                        Inquire
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'debug'}
                        className={`ws-chip ${mode === 'debug' ? 'is-active' : ''}`}
                        onClick={() => {
                            setMode('debug');
                            setInput('');
                            onStartNewQuery?.();
                        }}
                    >
                        <Bug size={13} />
                        Diagnose
                    </button>
                </div>
                {onOpenIncidentStudio ? (
                    <button
                        type="button"
                        className="ws-btn ws-btn--ghost ws-assist-panel__studio-link"
                        onClick={() => onOpenIncidentStudio(studioQuery)}
                        title="Open governed repair flow in Incident Studio"
                    >
                        <Sparkles size={13} />
                        Incident Studio
                        <ArrowRight size={12} />
                    </button>
                ) : null}
            </div>

            <div className="ws-assist-panel__body">
                {contextContract ? (
                    <div className="ws-assist-panel__contract">
                        <span className="ws-chip ws-chip--muted">
                            Persona: {contextContract.persona_level || 'standard'}
                        </span>
                        <span className="ws-chip ws-chip--muted">
                            Scope: {contextContract.commandScope || context.type}
                        </span>
                        {activeSafetyFlags.length > 0 ? (
                            <span className="ws-chip ws-chip--warn">
                                Safety: {activeSafetyFlags.join(', ')}
                            </span>
                        ) : (
                            <span className="ws-chip ws-chip--success">Safety: clear</span>
                        )}
                    </div>
                ) : null}

                {mode === 'debug' && onOpenIncidentStudio ? (
                    <div className="ws-assist-panel__notice">
                        Quick triage here, or continue with evidence-backed repair in Incident Studio.
                    </div>
                ) : null}

                {!hasResponse && !isStreaming && quickPrompts.length > 0 ? (
                    <div className="ws-assist-panel__prompts">
                        {quickPrompts.map((prompt) => (
                            <button
                                key={prompt}
                                type="button"
                                className="ws-chip ws-assist-panel__prompt"
                                onClick={() => setInput(prompt)}
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                ) : null}

                {isStreaming && !hasResponse ? (
                    <div className="ws-assist-panel__thinking">
                        <span className="ai-thinking-dots">
                            <span className="ai-thinking-dot" />
                            <span className="ai-thinking-dot" />
                            <span className="ai-thinking-dot" />
                        </span>
                        <span className="ai-thinking-label">Analyzing context…</span>
                    </div>
                ) : null}

                {hasResponse ? (
                    <div ref={responseRef} className="ws-assist-panel__response">
                        {streamError ? (
                            <div className="ws-assist-panel__error">⚠ {streamError}</div>
                        ) : (
                            <MarkdownRenderer content={streamContent} isStreaming={isStreaming} />
                        )}
                    </div>
                ) : null}

                {hasResponse && !isStreaming ? (
                    <button
                        type="button"
                        className="ws-btn ws-btn--ghost ws-assist-panel__new-query"
                        onClick={() => {
                            setInput('');
                            onStartNewQuery?.();
                        }}
                    >
                        ↩ New inquiry
                    </button>
                ) : null}
            </div>

            <footer className="ws-assist-panel__footer" onKeyDown={handleComposerKeyDown}>
                <ChatComposer
                    variant="assist"
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    onStop={onCancel}
                    isStreaming={isStreaming}
                    disabled={false}
                    placeholder={
                        mode === 'debug'
                            ? 'Paste error output or describe the failure…'
                            : `Governance, structure, or next steps for "${context.name}"…`
                    }
                    submitDisabled={!input.trim()}
                    availableModels={availableModels}
                    selectedModelId={selectedModelId ?? null}
                    preferredModelId={preferredModelId}
                    modelsLoading={modelsLoading}
                    onModelChange={onModelChange}
                    hint="Enter to send"
                    inputAriaLabel="Impact Lens message input"
                />
            </footer>
        </aside>
    );
}
