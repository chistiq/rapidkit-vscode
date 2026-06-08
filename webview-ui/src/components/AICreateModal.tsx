import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Sparkles, Wand2, ArrowLeft, Check, ChevronRight, Loader2, Minus } from 'lucide-react';

// ─── Plan type (mirrors aiService.ts AICreationPlan) ────────────────────────
export type AICreateProfile =
    | 'minimal'
    | 'python-only'
    | 'node-only'
    | 'go-only'
    | 'java-only'
    | 'dotnet-only'
    | 'polyglot'
    | 'enterprise';

export type AICreateFramework = 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';

export interface AICreationPlan {
    type: 'workspace' | 'project';
    workspaceName: string;
    profile: AICreateProfile;
    installMethod: 'auto' | 'poetry' | 'venv' | 'pipx';
    framework: AICreateFramework;
    kit: string;
    projectName: string;
    suggestedModules: string[];
    description: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface AICreateModalProps {
    isOpen: boolean;
    mode: 'workspace' | 'project';
    framework?: AICreateFramework;
    targetWorkspaceName?: string;
    plan: AICreationPlan | null;
    isThinking: boolean;
    isCreating: boolean;
    creationStage?: 'workspace_done' | null;
    planError: string | null;
    modelId?: string | null;
    onClose: () => void;
    onPromptSubmit: (prompt: string, mode: 'workspace' | 'project', framework?: string) => void;
    onConfirm: (plan: AICreationPlan) => void;
    onManualFallback: () => void;
}

// ─── Static data ──────────────────────────────────────────────────────────────
interface PresetOption {
    id: string;
    text: string;
    tags: string[];
}

interface PresetCategory {
    id: string;
    label: string;
    options: PresetOption[];
}

interface ResolvedPresetOption {
    id: string;
    text: string;
    score: number;
}

interface ResolvedPresetCategory {
    id: string;
    label: string;
    options: ResolvedPresetOption[];
    maxScore: number;
}

const WORKSPACE_PRESET_CATEGORIES: PresetCategory[] = [
    {
        id: 'saas',
        label: 'SaaS and commerce',
        options: [
            {
                id: 'ws-saas-auth-payments',
                text: 'SaaS product with auth + payments + database',
                tags: ['saas', 'auth', 'payment', 'billing', 'database'],
            },
            {
                id: 'ws-ecommerce',
                text: 'E-commerce API with product catalog + orders',
                tags: ['ecommerce', 'catalog', 'orders', 'shop', 'commerce'],
            },
        ],
    },
    {
        id: 'core-backend',
        label: 'Core backend',
        options: [
            {
                id: 'ws-rest-users',
                text: 'REST API backend with user management',
                tags: ['rest', 'api', 'users', 'backend'],
            },
            {
                id: 'ws-admin-rbac',
                text: 'Admin dashboard API with role-based access',
                tags: ['admin', 'rbac', 'roles', 'permissions', 'dashboard'],
            },
        ],
    },
    {
        id: 'platform',
        label: 'Platform and AI',
        options: [
            {
                id: 'ws-microservice-observability',
                text: 'Microservice with caching + observability',
                tags: ['microservice', 'cache', 'observability', 'metrics'],
            },
            {
                id: 'ws-ai-assistant',
                text: 'AI assistant backend with LLM integration',
                tags: ['ai', 'assistant', 'llm', 'chat', 'inference'],
            },
        ],
    },
];

const PROJECT_GENERIC_PRESET_CATEGORIES: PresetCategory[] = [
    {
        id: 'project-general',
        label: 'General API',
        options: [
            {
                id: 'pg-crud-auth',
                text: 'CRUD API with authentication and relational database',
                tags: ['crud', 'auth', 'database', 'api'],
            },
            {
                id: 'pg-rbac-admin',
                text: 'Admin API with role-based access and audit logs',
                tags: ['admin', 'rbac', 'roles', 'audit'],
            },
            {
                id: 'pg-webhook',
                text: 'Webhook processor with retries and idempotency',
                tags: ['webhook', 'retry', 'idempotency', 'events'],
            },
        ],
    },
    {
        id: 'project-domain',
        label: 'Domain specific',
        options: [
            {
                id: 'pg-commerce',
                text: 'E-commerce backend with products, cart, and orders',
                tags: ['ecommerce', 'products', 'cart', 'orders'],
            },
            {
                id: 'pg-ai',
                text: 'AI assistant service with retrieval and chat sessions',
                tags: ['ai', 'assistant', 'retrieval', 'chat', 'rag'],
            },
        ],
    },
];

const PROJECT_PRESET_CATEGORIES: Record<AICreateFramework, PresetCategory[]> = {
    fastapi: [
        {
            id: 'fastapi-core',
            label: 'FastAPI core',
            options: [
                {
                    id: 'fa-crud',
                    text: 'CRUD API with PostgreSQL + JWT auth',
                    tags: ['crud', 'postgres', 'jwt', 'auth', 'fastapi'],
                },
                {
                    id: 'fa-ddd',
                    text: 'Clean architecture DDD service with layered design',
                    tags: ['ddd', 'clean-architecture', 'layers', 'fastapi'],
                },
                {
                    id: 'fa-oauth',
                    text: 'Auth service with OAuth + social login',
                    tags: ['auth', 'oauth', 'social-login', 'fastapi'],
                },
            ],
        },
        {
            id: 'fastapi-platform',
            label: 'Background and files',
            options: [
                {
                    id: 'fa-jobs',
                    text: 'Background task processor with Redis queue',
                    tags: ['background', 'jobs', 'redis', 'queue', 'fastapi'],
                },
                {
                    id: 'fa-files',
                    text: 'File upload + processing service',
                    tags: ['file', 'upload', 'processing', 'storage', 'fastapi'],
                },
            ],
        },
    ],
    nestjs: [
        {
            id: 'nestjs-core',
            label: 'NestJS core',
            options: [
                {
                    id: 'ne-rest',
                    text: 'REST API with TypeORM + authentication',
                    tags: ['rest', 'typeorm', 'auth', 'nestjs'],
                },
                {
                    id: 'ne-realtime',
                    text: 'Real-time WebSocket service with rooms',
                    tags: ['websocket', 'realtime', 'rooms', 'nestjs'],
                },
                {
                    id: 'ne-modular',
                    text: 'GraphQL-like REST API with module architecture',
                    tags: ['graphql', 'module', 'architecture', 'nestjs'],
                },
            ],
        },
        {
            id: 'nestjs-business',
            label: 'Operations',
            options: [
                {
                    id: 'ne-email',
                    text: 'Email notification service with templates',
                    tags: ['email', 'notifications', 'templates', 'nestjs'],
                },
                {
                    id: 'ne-admin',
                    text: 'Admin API with role-based permissions',
                    tags: ['admin', 'rbac', 'permissions', 'nestjs'],
                },
            ],
        },
    ],
    go: [
        {
            id: 'go-core',
            label: 'Go services',
            options: [
                {
                    id: 'go-crud',
                    text: 'High-performance CRUD API with Postgres',
                    tags: ['go', 'crud', 'postgres', 'performance'],
                },
                {
                    id: 'go-micro',
                    text: 'Microservice with health checks + metrics',
                    tags: ['go', 'microservice', 'health', 'metrics'],
                },
                {
                    id: 'go-auth-proxy',
                    text: 'Auth proxy service with JWT validation',
                    tags: ['go', 'auth', 'proxy', 'jwt'],
                },
            ],
        },
        {
            id: 'go-platform',
            label: 'Traffic and streaming',
            options: [
                {
                    id: 'go-gateway',
                    text: 'Rate-limited API gateway',
                    tags: ['go', 'gateway', 'rate-limit', 'api'],
                },
                {
                    id: 'go-stream',
                    text: 'Stream processing service with concurrency',
                    tags: ['go', 'stream', 'concurrency', 'workers'],
                },
            ],
        },
    ],
    springboot: [
        {
            id: 'spring-core',
            label: 'Spring core',
            options: [
                {
                    id: 'sp-rest-crud',
                    text: 'Spring Boot REST API with PostgreSQL + validation',
                    tags: ['spring', 'springboot', 'java', 'crud', 'postgres'],
                },
                {
                    id: 'sp-ddd-layered',
                    text: 'Layered Spring service with clear controller-service boundaries',
                    tags: ['spring', 'java', 'layered', 'service', 'architecture'],
                },
                {
                    id: 'sp-security-jwt',
                    text: 'JWT-secured Spring API with role-based access',
                    tags: ['spring', 'jwt', 'security', 'rbac', 'auth'],
                },
            ],
        },
        {
            id: 'spring-platform',
            label: 'Platform and operations',
            options: [
                {
                    id: 'sp-observability',
                    text: 'Spring service with actuator health, metrics, and OpenAPI docs',
                    tags: ['spring', 'actuator', 'metrics', 'openapi', 'observability'],
                },
                {
                    id: 'sp-worker',
                    text: 'Background-processing Spring service with scheduled jobs',
                    tags: ['spring', 'jobs', 'scheduler', 'worker'],
                },
            ],
        },
    ],
    dotnet: [
        {
            id: 'dotnet-core',
            label: '.NET core',
            options: [
                {
                    id: 'dn-clean-api',
                    text: 'Clean architecture Web API with controllers and services',
                    tags: ['dotnet', 'csharp', 'webapi', 'clean-architecture', 'api'],
                },
                {
                    id: 'dn-crud',
                    text: '.NET CRUD API with validation and health checks',
                    tags: ['dotnet', 'crud', 'validation', 'health', 'webapi'],
                },
                {
                    id: 'dn-enterprise',
                    text: 'Enterprise .NET service with layered boundaries',
                    tags: ['dotnet', 'enterprise', 'layers', 'service', 'architecture'],
                },
            ],
        },
    ],
};

function tokenizeContextHint(raw: string): string[] {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, ' ')
        .split(/[\s_-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 1);
}

function rankPresetCategories(
    categories: PresetCategory[],
    contextHint: string
): ResolvedPresetCategory[] {
    const hintTokens = tokenizeContextHint(contextHint);
    const tokenSet = new Set(hintTokens);

    const scoreOption = (option: PresetOption, index: number): ResolvedPresetOption => {
        const tagsScore = option.tags.reduce((acc, tag) => {
            return acc + (tokenSet.has(tag.toLowerCase()) ? 3 : 0);
        }, 0);
        const textForMatch = option.text.toLowerCase();
        const textScore = hintTokens.reduce((acc, token) => {
            if (token.length < 3) {
                return acc;
            }
            return acc + (textForMatch.includes(token) ? 1 : 0);
        }, 0);
        return {
            id: option.id,
            text: option.text,
            score: tagsScore + textScore + (1000 - index) * 0.00001,
        };
    };

    return categories
        .map((category) => {
            const resolved = category.options.map((option, index) => scoreOption(option, index));
            resolved.sort((a, b) => b.score - a.score);
            const maxScore = resolved.length > 0 ? resolved[0].score : 0;
            return {
                id: category.id,
                label: category.label,
                options: resolved,
                maxScore,
            };
        })
        .sort((a, b) => b.maxScore - a.maxScore);
}

const PROFILE_META: Record<AICreateProfile, { icon: string; iconUri?: string; label: string; color: string }> = {
    minimal: { icon: '⚡', label: 'Minimal', color: '#6b7280' },
    'python-only': { icon: '🐍', label: 'Python', color: '#3b82f6' },
    'node-only': { icon: '🟩', label: 'Node.js', color: '#22c55e' },
    'go-only': { icon: '🔵', label: 'Go', color: '#06b6d4' },
    'java-only': {
        icon: '☕',
        iconUri: (typeof window !== 'undefined' ? (window as any).SPRINGBOOT_ICON_URI : undefined),
        label: 'Java',
        color: '#6db33f',
    },
    'dotnet-only': { icon: '.NET', label: '.NET', color: '#512bd4' },
    polyglot: { icon: '⊞', label: 'Polyglot', color: '#a855f7' },
    enterprise: { icon: '🛡️', label: 'Enterprise', color: '#f59e0b' },
};

const FRAMEWORK_META: Record<AICreateFramework, { icon: string; iconUri?: string; label: string; color: string }> = {
    fastapi: { icon: '⚡', label: 'FastAPI', color: '#009688' },
    nestjs: { icon: '🔴', label: 'NestJS', color: '#E0234E' },
    go: { icon: '🔵', label: 'Go', color: '#00ADD8' },
    springboot: {
        icon: '☕',
        iconUri: (typeof window !== 'undefined' ? (window as any).SPRINGBOOT_ICON_URI : undefined),
        label: 'Spring Boot',
        color: '#6db33f',
    },
    dotnet: { icon: '.NET', label: '.NET', color: '#512bd4' },
};

const MODULE_LABELS: Record<string, string> = {
    'free/auth/core': 'Auth Core',
    'free/auth/oauth': 'OAuth 2.0',
    'free/auth/api_keys': 'API Keys',
    'free/auth/session': 'Sessions',
    'free/database/db_postgres': 'PostgreSQL',
    'free/database/db_mongo': 'MongoDB',
    'free/database/db_sqlite': 'SQLite',
    'free/cache/redis': 'Redis',
    'free/essentials/settings': 'Settings',
    'free/essentials/logging': 'Logging',
    'free/essentials/middleware': 'Middleware',
    'free/essentials/deployment': 'Deployment',
    'free/observability/core': 'Observability',
    'free/billing/stripe_payment': 'Stripe',
    'free/users/users_core': 'Users',
    'free/tasks/celery': 'Celery Jobs',
    'free/ai/ai_assistant': 'AI Assistant',
    'free/security/cors': 'CORS',
    'free/security/security_headers': 'Sec Headers',
    'free/auth/passwordless': 'Passwordless',
    'free/security/rate_limiting': 'Rate Limiting',
    'free/users/users_profiles': 'Profiles',
    'free/business/storage': 'Storage',
    'free/billing/cart': 'Cart',
    'free/billing/inventory': 'Inventory',
    'free/communication/notifications': 'Notifications',
    'free/communication/email': 'Email',
};

// ─── Component ────────────────────────────────────────────────────────────────
export function AICreateModal({
    isOpen,
    mode,
    framework,
    targetWorkspaceName,
    plan,
    isThinking,
    isCreating,
    creationStage,
    planError,
    modelId,
    onClose,
    onPromptSubmit,
    onConfirm,
    onManualFallback,
}: AICreateModalProps) {
    const [prompt, setPrompt] = useState('');
    const [editedWorkspaceName, setEditedWorkspaceName] = useState('');
    const [editedProjectName, setEditedProjectName] = useState('');
    const [isMinimized, setIsMinimized] = useState(false);
    const [showAllPresets, setShowAllPresets] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const copy = {
        modeWorkspace: 'Workspace',
        modeProject: 'Project',
        title: 'Create with AI',
        describe: 'Describe what you want to build',
        quickStart: 'Quick start',
        targetWorkspace: 'Target workspace:',
        noWorkspace: "none selected - you'll be prompted",
        showAll: 'Show all options',
        showLess: 'Show fewer',
        inputHint: 'Cmd+Enter or Ctrl+Enter to submit',
        submit: 'Plan with AI',
        manual: 'Switch to manual form',
        thinking: 'AI is planning your',
    };

    // Derive current step from props
    const step: 'prompt' | 'thinking' | 'preview' | 'creating' =
        isCreating ? 'creating'
            : isThinking ? 'thinking'
                : plan ? 'preview'
                    : 'prompt';

    // Sync editable names when plan arrives
    useEffect(() => {
        if (plan) {
            setEditedWorkspaceName(plan.workspaceName);
            setEditedProjectName(plan.projectName);
        }
    }, [plan]);

    // Auto-restore minimize when creation finishes
    useEffect(() => {
        if (!isCreating && !isThinking) { setIsMinimized(false); }
    }, [isCreating, isThinking]);

    // Reset when modal opens
    useEffect(() => {
        if (isOpen) {
            setPrompt('');
            setEditedWorkspaceName('');
            setEditedProjectName('');
            setIsMinimized(false);
            setShowAllPresets(false);
            document.body.style.overflow = 'hidden';
            setTimeout(() => textareaRef.current?.focus(), 150);
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    const basePresetCategories = useMemo<PresetCategory[]>(() => {
        if (mode === 'workspace') {
            return WORKSPACE_PRESET_CATEGORIES;
        }
        if (framework) {
            return PROJECT_PRESET_CATEGORIES[framework];
        }
        return PROJECT_GENERIC_PRESET_CATEGORIES;
    }, [mode, framework]);

    const rankedPresetCategories = useMemo(() => {
        const contextHint = [targetWorkspaceName ?? '', framework ?? '', mode].join(' ').trim();
        return rankPresetCategories(basePresetCategories, contextHint);
    }, [basePresetCategories, framework, mode, targetWorkspaceName]);

    const presetLimit = showAllPresets ? Number.MAX_SAFE_INTEGER : 3;
    const visiblePresetCategories = rankedPresetCategories
        .map((category) => ({
            ...category,
            options: category.options.slice(0, presetLimit),
        }))
        .filter((category) => category.options.length > 0);

    const hasExtraPresets = rankedPresetCategories.some((category) => category.options.length > 3);

    if (!isOpen) { return null; }

    // ── Minimized pill ────────────────────────────────────────────────────────
    if (isMinimized) {
        const pillLabel = isCreating ? (creationStage ?? 'Creating…') : 'AI is thinking…';
        return (
            <div className="ai-create-pill" onClick={() => setIsMinimized(false)} role="button" aria-label="Restore AI creation panel">
                <Loader2 size={13} className="ai-create-pill-spinner" />
                <span className="ai-create-pill-label">{pillLabel}</span>
                <span className="ai-create-pill-restore">▲ Restore</span>
            </div>
        );
    }

    const handleSubmit = () => {
        if (!prompt.trim() || isThinking) { return; }
        onPromptSubmit(prompt.trim(), mode, framework);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape' && !isThinking && !isCreating) {
            onClose();
        }
    };

    const handleConfirm = () => {
        if (!plan) { return; }
        onConfirm({
            ...plan,
            workspaceName: editedWorkspaceName.trim() || plan.workspaceName,
            projectName: editedProjectName.trim() || plan.projectName,
        });
    };

    const handleStartOver = () => {
        setPrompt('');
        setShowAllPresets(false);
        // Trigger reset by calling with empty plan signal
        onPromptSubmit('__reset__', mode, framework);
    };

    const fwMeta = framework ? FRAMEWORK_META[framework] : null;
    const modeLabel = mode === 'workspace' ? copy.modeWorkspace : copy.modeProject;

    return (
        <>
            {/* Backdrop */}
            <div
                className="ai-create-backdrop"
                onClick={!isThinking && !isCreating ? onClose : undefined}
            />

            {/* Modal */}
            <div
                className="ai-create-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${copy.title} ${modeLabel}`}
            >
                {/* ── Header ── */}
                <div className="ai-create-header">
                    <div className="ai-create-header-left">
                        <div className="ai-create-header-icon">
                            <Sparkles size={15} />
                        </div>
                        <div>
                            <div className="ai-create-header-title">
                                {copy.title} {modeLabel}
                            </div>
                            <div className="ai-create-header-sub">
                                {fwMeta ? (
                                    <>
                                        <span style={{ color: fwMeta.color, display: 'inline-flex', alignItems: 'center' }}>
                                            {fwMeta.iconUri ? (
                                                <img
                                                    src={fwMeta.iconUri}
                                                    alt={fwMeta.label}
                                                    style={{ width: 14, height: 14, objectFit: 'contain' }}
                                                />
                                            ) : (
                                                fwMeta.icon
                                            )}
                                        </span>
                                        &nbsp;{fwMeta.label} &bull; {copy.describe}
                                    </>
                                ) : (
                                    copy.describe
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="ai-create-header-right">
                        {modelId && step === 'preview' && (
                            <span className="ai-create-model-badge">✦ {modelId}</span>
                        )}
                        {(step === 'thinking' || step === 'creating') && (
                            <button
                                type="button"
                                className="ai-create-minimize"
                                onClick={() => setIsMinimized(true)}
                                aria-label="Minimize"
                                title="Minimize — continue using the dashboard"
                            >
                                <Minus size={14} />
                            </button>
                        )}
                        {!isThinking && !isCreating && (
                            <button
                                type="button"
                                className="ai-create-close"
                                onClick={onClose}
                                aria-label="Close"
                            >
                                <X size={15} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Step: Prompt ── */}
                {step === 'prompt' && (
                    <div className="ai-create-body">
                        {planError && (
                            <div className="ai-create-error">
                                <span>⚠ {planError}</span>
                            </div>
                        )}

                        {mode === 'project' && (
                            <div className="ai-create-workspace-target">
                                <span className="ai-create-workspace-target-label">{copy.targetWorkspace}</span>
                                {targetWorkspaceName ? (
                                    <strong className="ai-create-workspace-target-name">{targetWorkspaceName}</strong>
                                ) : (
                                    <span className="ai-create-workspace-target-none">{copy.noWorkspace}</span>
                                )}
                            </div>
                        )}

                        <div className="ai-create-presets-label">{copy.quickStart}</div>
                        <div className="ai-create-presets">
                            {visiblePresetCategories.map((category) => (
                                <div key={category.id} className="ai-create-preset-group">
                                    <div className="ai-create-preset-group-label">{category.label}</div>
                                    <div className="ai-create-preset-group-items">
                                        {category.options.map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                className={`ai-create-preset ${prompt === option.text ? 'ai-create-preset--active' : ''}`}
                                                onClick={() => setPrompt(option.text)}
                                            >
                                                {option.text}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {hasExtraPresets && (
                            <button
                                type="button"
                                className="ai-create-presets-toggle"
                                onClick={() => setShowAllPresets((prev) => !prev)}
                            >
                                {showAllPresets ? copy.showLess : copy.showAll}
                            </button>
                        )}

                        {/* Textarea */}
                        <div className="ai-create-input-wrap">
                            <textarea
                                ref={textareaRef}
                                className="ai-create-textarea"
                                placeholder={
                                    mode === 'workspace'
                                        ? 'e.g. "E-commerce SaaS with user management, Stripe payments, and PostgreSQL"'
                                        : 'e.g. "CRUD API with JWT auth, PostgreSQL, and clean layered architecture"'
                                }
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={3}
                            />
                            <div className="ai-create-input-hint">{copy.inputHint}</div>
                        </div>

                        {/* Actions */}
                        <div className="ai-create-actions">
                            <button
                                type="button"
                                className="ai-create-submit"
                                onClick={handleSubmit}
                                disabled={!prompt.trim()}
                            >
                                <Wand2 size={14} />
                                {copy.submit}
                                <ChevronRight size={14} />
                            </button>
                        </div>

                        <div className="ai-create-manual-link">
                            <button type="button" onClick={onManualFallback}>
                                {copy.manual}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step: Thinking ── */}
                {step === 'thinking' && (
                    <div className="ai-create-body ai-create-body--centered">
                        <div className="ai-create-thinking">
                            <div className="ai-create-thinking-orb">
                                <div className="ai-create-thinking-ring ai-create-thinking-ring--1" />
                                <div className="ai-create-thinking-ring ai-create-thinking-ring--2" />
                                <div className="ai-create-thinking-ring ai-create-thinking-ring--3" />
                                <Sparkles size={22} className="ai-create-thinking-icon" />
                            </div>
                            <div className="ai-create-thinking-label">
                                {copy.thinking} {modeLabel.toLowerCase()}…
                            </div>
                            <div className="ai-create-thinking-prompt">
                                "{prompt}"
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Step: Preview ── */}
                {step === 'preview' && plan && (
                    <div className="ai-create-body">
                        {/* Description */}
                        <div className="ai-create-desc">
                            <Sparkles size={12} className="ai-create-desc-icon" />
                            {plan.description}
                        </div>

                        {/* Badges row */}
                        <div className="ai-create-badges-row">
                            <span
                                className="ai-create-badge"
                                style={{ '--badge-color': PROFILE_META[plan.profile]?.color ?? '#6b7280' } as React.CSSProperties}
                            >
                                {PROFILE_META[plan.profile]?.iconUri ? (
                                    <img
                                        src={PROFILE_META[plan.profile]?.iconUri}
                                        alt={PROFILE_META[plan.profile]?.label ?? plan.profile}
                                        style={{ width: 13, height: 13, objectFit: 'contain', verticalAlign: 'text-bottom', marginRight: 4 }}
                                    />
                                ) : (
                                    `${PROFILE_META[plan.profile]?.icon ?? ''} `
                                )}
                                {PROFILE_META[plan.profile]?.label ?? plan.profile}
                            </span>
                            <span
                                className="ai-create-badge"
                                style={{ '--badge-color': FRAMEWORK_META[plan.framework]?.color ?? '#6b7280' } as React.CSSProperties}
                            >
                                {FRAMEWORK_META[plan.framework]?.iconUri ? (
                                    <img
                                        src={FRAMEWORK_META[plan.framework]?.iconUri}
                                        alt={FRAMEWORK_META[plan.framework]?.label ?? plan.framework}
                                        style={{ width: 13, height: 13, objectFit: 'contain', verticalAlign: 'text-bottom', marginRight: 4 }}
                                    />
                                ) : (
                                    `${FRAMEWORK_META[plan.framework]?.icon ?? ''} `
                                )}
                                {FRAMEWORK_META[plan.framework]?.label ?? plan.framework}
                            </span>
                            <span className="ai-create-badge ai-create-badge--kit">
                                {plan.kit}
                            </span>
                        </div>

                        {/* Editable names */}
                        <div className="ai-create-fields">
                            {mode === 'workspace' && (
                                <div className="ai-create-field">
                                    <label className="ai-create-field-label">Workspace name</label>
                                    <input
                                        type="text"
                                        className="ai-create-field-input"
                                        value={editedWorkspaceName}
                                        onChange={(e) => setEditedWorkspaceName(e.target.value)}
                                        spellCheck={false}
                                    />
                                </div>
                            )}
                            <div className="ai-create-field">
                                <label className="ai-create-field-label">
                                    {mode === 'workspace' ? 'First project name' : 'Project name'}
                                </label>
                                <input
                                    type="text"
                                    className="ai-create-field-input"
                                    value={editedProjectName}
                                    onChange={(e) => setEditedProjectName(e.target.value)}
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        {/* Suggested modules */}
                        {plan.framework === 'go' || plan.framework === 'springboot' || plan.framework === 'dotnet' ? (
                            <div className="ai-create-go-no-modules">
                                <span>ℹ️</span>
                                <span>
                                    {plan.framework === 'go'
                                        ? 'Go projects do not use the RapidKit module system. Extend functionality with native Go packages and internal adapters after creation.'
                                        : plan.framework === 'dotnet'
                                            ? '.NET projects do not use the RapidKit module system. Extend functionality with native NuGet packages and internal adapters after creation.'
                                            : 'Spring Boot projects do not use the RapidKit module system. Extend functionality with native Spring starters/libraries and internal adapters after creation.'}
                                </span>
                            </div>
                        ) : plan.suggestedModules.length > 0 && (
                            <div className="ai-create-modules">
                                <div className="ai-create-modules-label">
                                    Modules to install after creation
                                </div>
                                <div className="ai-create-modules-list">
                                    {plan.suggestedModules.map((slug) => (
                                        <span key={slug} className="ai-create-module-chip">
                                            {MODULE_LABELS[slug] ?? slug.split('/').pop()}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Confirm actions */}
                        <div className="ai-create-actions">
                            <button
                                type="button"
                                className="ai-create-confirm"
                                onClick={handleConfirm}
                                disabled={
                                    mode === 'workspace'
                                        ? !editedWorkspaceName.trim()
                                        : !editedProjectName.trim()
                                }
                            >
                                <Check size={14} />
                                Create {modeLabel}
                            </button>
                            <button
                                type="button"
                                className="ai-create-back"
                                onClick={handleStartOver}
                            >
                                <ArrowLeft size={13} />
                                Start over
                            </button>
                        </div>

                        <div className="ai-create-manual-link">
                            <button type="button" onClick={onManualFallback}>
                                Switch to manual form
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step: Creating ── */}
                {step === 'creating' && (
                    <div className="ai-create-body ai-create-body--centered">
                        <div className="ai-create-thinking">
                            <div className="ai-create-thinking-orb ai-create-thinking-orb--creating">
                                <div className="ai-create-thinking-ring ai-create-thinking-ring--1" />
                                <div className="ai-create-thinking-ring ai-create-thinking-ring--2" />
                                <Loader2 size={22} className="ai-create-thinking-icon animate-spin" />
                            </div>
                            {creationStage === 'workspace_done' ? (
                                <>
                                    <div className="ai-create-thinking-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Check size={16} style={{ color: 'var(--vscode-testing-iconPassed, #4caf50)' }} />
                                        Workspace <strong>{plan?.workspaceName}</strong> created
                                    </div>
                                    <div className="ai-create-thinking-label" style={{ marginTop: '6px' }}>
                                        Creating project <strong>{plan?.projectName}</strong>…
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="ai-create-thinking-label">
                                        Creating workspace <strong>{plan?.workspaceName}</strong>…
                                    </div>
                                    <div className="ai-create-thinking-prompt">
                                        {plan?.projectName ? `Project: ${plan.projectName}` : ''}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
