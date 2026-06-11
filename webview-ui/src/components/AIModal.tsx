import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Bug, BrainCircuit, Sparkles, Send, Square } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ModelSelect } from './ModelSelect';

export interface AIModalContext {
    type: 'workspace' | 'project' | 'module';
    name: string;
    path?: string;
    framework?: string;
    moduleSlug?: string;
    moduleDescription?: string;
    prefillQuestion?: string;
    prefillMode?: 'debug' | 'ask';
}

export interface AIContextContractSummary {
    persona_level?: string;
    evidence_confidence?: string;
    commandScope?: string;
    missingFields?: string[];
    safetyFlags?: Record<string, boolean>;
}

interface AIModalProps {
    isOpen: boolean;
    context: AIModalContext | null;
    isStreaming: boolean;
    streamContent: string;
    streamError: string | null;
    modelId?: string | null;
    availableModels?: { id: string; name: string; vendor: string }[];
    selectedModelId?: string | null;
    contextContract?: AIContextContractSummary | null;
    onModelChange?: (modelId: string | null) => void;
    onClose: () => void;
    onCancel: () => void;
    onQuery: (mode: 'debug' | 'ask', question: string, context: AIModalContext) => void;
    onStartNewQuery?: () => void;
}

type Mode = 'debug' | 'ask';

const TYPE_LABELS: Record<string, string> = {
    workspace: 'Workspace',
    project: 'Project',
    module: 'Module',
};

const FRAMEWORK_LABELS: Record<string, string> = {
    fastapi: 'FastAPI',
    nestjs: 'NestJS',
    go: 'Go',
    springboot: 'Spring Boot',
};

function getQuickPrompts(ctx: AIModalContext, mode: Mode): string[] {
    if (mode === 'debug') {
        return [
            'Paste the full stack trace here and I will analyse it…',
            'Paste the test failure output here…',
        ];
    }
    if (ctx.type === 'workspace') {
        return [
            'What is the best way to share code between projects in this workspace?',
            'How should I set up a shared database for all projects?',
            'What deployment strategy fits a multi-project Workspai workspace?',
        ];
    }
    if (ctx.type === 'project') {
        const fw = ctx.framework || '';
        if (fw === 'fastapi') {
            return [
                'How do I add a new endpoint following this project\'s DDD structure?',
                'What is the correct way to add a new SQLAlchemy model here?',
                'How should I add a new Workspai module to this project?',
                'How do I write a unit test for a use-case in the application layer?',
            ];
        }
        if (fw === 'nestjs') {
            return [
                'How do I create a new feature module following NestJS conventions here?',
                'How should I add a new database table with TypeORM in this project?',
                'How do I add a new Workspai module to this project?',
            ];
        }
        if (fw === 'go') {
            return [
                'How do I add a new HTTP handler in internal/handlers following this project\'s conventions?',
                'How should I add a new service function with dependency injection here?',
                'How do I add a new Workspai module to this Go project?',
            ];
        }
        if (fw === 'springboot') {
            return [
                'How do I add a new Spring REST controller following this project\'s package structure?',
                'How should I add a service class and constructor-based dependency injection here?',
                'How do I expose a new endpoint in OpenAPI/Swagger for this Spring project?',
            ];
        }
        return [
            'How do I add a feature to this project following its conventions?',
            'What Workspai modules should I add to this project?',
        ];
    }
    if (ctx.type === 'module') {
        return [
            `How do I configure the ${ctx.name} module after installation?`,
            `Show me an example of using the ${ctx.name} module in a route handler.`,
            `What does the ${ctx.name} module add to my project structure?`,
        ];
    }
    return [];
}

export function AIModal({
    isOpen,
    context,
    isStreaming,
    streamContent,
    streamError,
    modelId: _modelId,
    availableModels = [],
    selectedModelId,
    contextContract,
    onModelChange,
    onClose,
    onCancel,
    onQuery,
    onStartNewQuery,
}: AIModalProps) {
    const [mode, setMode] = useState<Mode>('ask');
    const [input, setInput] = useState('');
    const responseRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustTextareaHeight = useCallback(() => {
        const el = textareaRef.current;
        if (!el) { return; }
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }, []);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            if (context?.prefillQuestion) {
                setMode(context.prefillMode ?? 'debug');
                setInput(context.prefillQuestion);
            } else {
                setMode('ask');
                setInput('');
            }
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen, context]);

    // Auto-grow textarea whenever input changes
    useEffect(() => {
        adjustTextareaHeight();
    }, [input, adjustTextareaHeight]);

    // Auto-scroll streaming output
    useEffect(() => {
        if (responseRef.current) {
            responseRef.current.scrollTop = responseRef.current.scrollHeight;
        }
    }, [streamContent]);

    if (!isOpen || !context) { return null; }

    const quickPrompts = getQuickPrompts(context, mode);

    const handleSubmit = () => {
        if (!input.trim() || isStreaming) { return; }
        onQuery(mode, input.trim(), context);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape') {
            if (isStreaming) {
                onCancel();
            } else {
                onClose();
            }
        }
    };

    const fwLabel = context.framework ? FRAMEWORK_LABELS[context.framework] || context.framework : null;
    const hasResponse = streamContent.length > 0 || streamError;
    const activeSafetyFlags = contextContract?.safetyFlags
        ? Object.entries(contextContract.safetyFlags)
            .filter(([, value]) => value)
            .map(([key]) => key)
        : [];

    return (
        <>
            {/* Backdrop */}
            <div
                className="ai-modal-backdrop"
                onClick={!isStreaming ? onClose : undefined}
            />

            {/* Modal */}
            <div
                className="ai-modal-container"
                role="dialog"
                aria-modal="true"
                aria-label={`AI Assistant — ${context.name}`}
            >
                {/* Header */}
                <div className="ai-modal-header">
                    <div className="ai-modal-header-left">
                        <Sparkles size={16} className="ai-modal-sparkle" />
                        <div>
                            <div className="ai-modal-title">AI Assistant</div>
                            <div className="ai-modal-subtitle">
                                <span className="ai-modal-ctx-badge">
                                    {TYPE_LABELS[context.type] || context.type}
                                </span>
                                <span className="ai-modal-ctx-name">{context.name}</span>
                                {fwLabel && (
                                    <span className="ai-modal-fw-badge">{fwLabel}</span>
                                )}
                                {contextContract?.evidence_confidence && (
                                    <span className={`ai-modal-evidence-badge ai-modal-evidence-badge--${contextContract.evidence_confidence}`}>
                                        Evidence: {contextContract.evidence_confidence}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="ai-modal-header-right">
                        {availableModels.length > 0 && (
                            <ModelSelect
                                className="ai-model-selector-inline workspai-model-select"
                                value={selectedModelId ?? null}
                                models={availableModels}
                                disabled={isStreaming}
                                ariaLabel="AI model"
                                autoLabel="Auto"
                                onChange={onModelChange}
                            />
                        )}
                        <button
                            type="button"
                            className="ai-modal-close"
                            onClick={onClose}
                            title="Close"
                            aria-label="Close AI modal"
                            disabled={isStreaming}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Mode Tabs */}
                <div className="ai-modal-tabs">
                    <button
                        type="button"
                        className={`ai-modal-tab ${mode === 'ask' ? 'ai-modal-tab--active' : ''}`}
                        onClick={() => {
                            setMode('ask');
                            setInput('');
                            onStartNewQuery?.();
                        }}
                    >
                        <BrainCircuit size={13} />
                        Ask AI
                    </button>
                    <button
                        type="button"
                        className={`ai-modal-tab ${mode === 'debug' ? 'ai-modal-tab--active' : ''}`}
                        onClick={() => {
                            setMode('debug');
                            setInput('');
                            onStartNewQuery?.();
                        }}
                    >
                        <Bug size={13} />
                        Debug
                    </button>
                </div>

                {/* Body */}
                <div className="ai-modal-body">
                    {contextContract && (
                        <div className="ai-modal-contract-strip">
                            <span>Persona: {contextContract.persona_level || 'standard'}</span>
                            <span>Scope: {contextContract.commandScope || context.type}</span>
                            {activeSafetyFlags.length > 0 ? (
                                <span>Safety flags: {activeSafetyFlags.join(', ')}</span>
                            ) : (
                                <span>Safety flags: clear</span>
                            )}
                        </div>
                    )}

                    {/* Quick prompts (only when idle — hidden while thinking/streaming) */}
                    {!hasResponse && !isStreaming && quickPrompts.length > 0 && (
                        <div className="ai-modal-chips">
                            {quickPrompts.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    className="ai-modal-chip"
                                    onClick={() => setInput(prompt)}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Thinking indicator — context scan phase before first chunk */}
                    {isStreaming && !hasResponse && (
                        <div className="ai-modal-thinking">
                            <span className="ai-thinking-dots">
                                <span className="ai-thinking-dot" />
                                <span className="ai-thinking-dot" />
                                <span className="ai-thinking-dot" />
                            </span>
                            <span className="ai-thinking-label">Analyzing context…</span>
                        </div>
                    )}

                    {/* Streaming response */}
                    {hasResponse && (
                        <div ref={responseRef} className="ai-modal-response">
                            {streamError ? (
                                <div className="ai-modal-error">
                                    <span>⚠ {streamError}</span>
                                </div>
                            ) : (
                                <MarkdownRenderer
                                    content={streamContent}
                                    isStreaming={isStreaming}
                                />
                            )}
                        </div>
                    )}

                    {/* Ask another question link after completion */}
                    {hasResponse && !isStreaming && (
                        <button
                            type="button"
                            className="ai-modal-new-query"
                            onClick={() => {
                                setInput('');
                                onStartNewQuery?.();
                            }}
                        >
                            ↩ Ask another question
                        </button>
                    )}
                </div>

                {/* Input */}
                <div className="ai-modal-input-area">
                    <textarea
                        ref={textareaRef}
                        className="ai-modal-textarea"
                        value={input}
                        onChange={(e) => { setInput(e.target.value); }}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            mode === 'debug'
                                ? 'Paste your error, stack trace, or failing test output…'
                                : `Ask anything about "${context.name}"…`
                        }
                        disabled={isStreaming}
                    />
                    <div className="ai-modal-input-footer">
                        <span className="ai-modal-hint">⌘ Enter to send</span>
                        <button
                            type="button"
                            className="ai-modal-send"
                            onClick={isStreaming ? onCancel : handleSubmit}
                            disabled={!isStreaming && !input.trim()}
                            title={isStreaming ? 'Stop generation' : 'Send query'}
                        >
                            {isStreaming ? (
                                <Square size={14} />
                            ) : (
                                <Send size={14} />
                            )}
                            {isStreaming ? 'Stop' : 'Send'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
