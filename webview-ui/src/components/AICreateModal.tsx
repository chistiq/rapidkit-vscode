import { useState, useEffect, useMemo, useRef } from 'react';
import { Sparkles, Wand2, ArrowLeft, Check, ChevronRight, Loader2, Minus } from 'lucide-react';
import { EnterpriseModal, EnterpriseModalNotice } from './EnterpriseModal';

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

import type { ScaffoldFramework } from '@/types';
import { defaultBootstrapProfileForFramework, isFrontendScaffoldFramework } from '@/lib/scaffoldFrameworks';
import {
  STACK_LANES,
  WORKSPACE_PRESET_CATEGORIES,
  defaultProfileForStackLane,
  resolveProjectPlaceholder,
  resolveWorkspacePlaceholder,
  type CreationStackLane,
} from '@/lib/creationPresets';

export type AICreateFramework = ScaffoldFramework;

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
    secondaryProject?: {
        framework: AICreateFramework;
        kit: string;
        projectName: string;
    };
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
    creationStage?: 'workspace_done' | 'first_project_done' | null;
    planError: string | null;
    planSource?: 'llm' | 'heuristic' | null;
    modelId?: string | null;
    onClose: () => void;
    onPromptSubmit: (
        prompt: string,
        mode: 'workspace' | 'project',
        framework?: string,
        stackIntent?: CreationStackLane
    ) => void;
    onConfirm: (plan: AICreationPlan) => void;
    onStartOver: () => void;
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

const PROJECT_PRESET_CATEGORIES: Partial<Record<ScaffoldFramework, PresetCategory[]>> = {
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

const FRONTEND_PRESET_CATEGORIES: PresetCategory[] = [
    {
        id: 'frontend-apps',
        label: 'Frontend apps',
        options: [
            {
                id: 'fe-dashboard',
                text: 'Product dashboard with auth-ready routing and API integration',
                tags: ['dashboard', 'frontend', 'react', 'auth', 'api'],
            },
            {
                id: 'fe-marketing',
                text: 'Marketing site with landing pages and content sections',
                tags: ['marketing', 'landing', 'content', 'frontend', 'astro'],
            },
            {
                id: 'fe-admin',
                text: 'Admin console with tables, forms, and role-aware navigation',
                tags: ['admin', 'console', 'forms', 'tables', 'frontend'],
            },
        ],
    },
];

function resolveProjectPresetCategories(framework?: ScaffoldFramework): PresetCategory[] {
  if (framework && PROJECT_PRESET_CATEGORIES[framework]) {
    return PROJECT_PRESET_CATEGORIES[framework]!;
  }
  if (framework && isFrontendScaffoldFramework(framework)) {
    return FRONTEND_PRESET_CATEGORIES;
  }
  return PROJECT_GENERIC_PRESET_CATEGORIES;
}

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

const PROFILE_META: Record<AICreateProfile, { icon: string; iconUri?: string; label: string; desc: string }> = {
    minimal: { icon: '⚡', label: 'Minimal', desc: 'Workspace foundation' },
    'python-only': { icon: '🐍', label: 'Python runtime', desc: 'FastAPI, data, automation' },
    'node-only': { icon: '🟩', label: 'Node.js runtime', desc: 'Frontend, NestJS, tooling' },
    'go-only': { icon: '🔵', label: 'Go runtime', desc: 'Go services and CLIs' },
    'java-only': {
        icon: '☕',
        iconUri: (typeof window !== 'undefined' ? (window as any).SPRINGBOOT_ICON_URI : undefined),
        label: 'Java runtime',
        desc: 'Spring Boot services',
    },
    'dotnet-only': { icon: '.NET', label: '.NET runtime', desc: 'ASP.NET Core services' },
    polyglot: { icon: '⊞', label: 'Polyglot', desc: 'Mixed runtimes' },
    enterprise: { icon: '🛡️', label: 'Enterprise', desc: 'Governance posture' },
};

const PROFILE_OPTIONS: AICreateProfile[] = [
    'minimal',
    'python-only',
    'node-only',
    'go-only',
    'java-only',
    'dotnet-only',
    'polyglot',
    'enterprise',
];

const FRAMEWORK_META: Partial<Record<ScaffoldFramework, { icon: string; iconUri?: string; label: string }>> = {
    fastapi: { icon: '⚡', label: 'FastAPI' },
    nestjs: { icon: '🔴', label: 'NestJS' },
    go: { icon: '🔵', label: 'Go' },
    springboot: {
        icon: '☕',
        iconUri: (typeof window !== 'undefined' ? (window as any).SPRINGBOOT_ICON_URI : undefined),
        label: 'Spring Boot',
    },
    dotnet: {
        icon: '.NET',
        iconUri: (typeof window !== 'undefined' ? (window as any).DOTNET_ICON_URI : undefined),
        label: '.NET',
    },
    rust: { icon: 'Rs', label: 'Rust Axum' },
    laravel: { icon: 'Lv', label: 'Laravel' },
    nextjs: { icon: '▲', label: 'Next.js' },
    remix: { icon: '◆', label: 'Remix' },
    'vite-react': { icon: '⚛', label: 'Vite + React' },
    'vite-vue': { icon: '💚', label: 'Vite + Vue' },
    'vite-svelte': { icon: '🔥', label: 'Vite + Svelte' },
    'vite-solid': { icon: '◼', label: 'Vite + Solid' },
    'vite-vanilla': { icon: 'TS', label: 'Vite Vanilla' },
    nuxt: { icon: 'Nu', label: 'Nuxt' },
    angular: { icon: 'A', label: 'Angular' },
    astro: { icon: '✦', label: 'Astro' },
    sveltekit: { icon: 'S', label: 'SvelteKit' },
    tauri: { icon: 'Ta', label: 'Tauri' },
    electron: { icon: 'El', label: 'Electron' },
    'vscode-extension': { icon: 'VS', label: 'VS Code Extension' },
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
    planSource,
    modelId,
    onClose,
    onPromptSubmit,
    onConfirm,
    onStartOver,
    onManualFallback,
}: AICreateModalProps) {
    const [prompt, setPrompt] = useState('');
    const [editedWorkspaceName, setEditedWorkspaceName] = useState('');
    const [editedProjectName, setEditedProjectName] = useState('');
    const [editedCompanionProjectName, setEditedCompanionProjectName] = useState('');
    const [editedProfile, setEditedProfile] = useState<AICreateProfile>(
        defaultProfileForStackLane('balanced')
    );
    const [stackLane, setStackLane] = useState<CreationStackLane>('balanced');
    const [isMinimized, setIsMinimized] = useState(false);
    const [showAllPresets, setShowAllPresets] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const copy = {
        modeWorkspace: 'Workspace',
        modeProject: 'Project',
        title: 'Creation plan',
        describe: 'Describe what you want to build',
        quickStart: 'Quick start',
        targetWorkspace: 'Target workspace:',
        noWorkspace: "No workspace selected - you'll be prompted",
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
            setEditedCompanionProjectName(plan.secondaryProject?.projectName ?? '');
            setEditedProfile(plan.profile);
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
            setEditedCompanionProjectName('');
            setEditedProfile(defaultProfileForStackLane('balanced'));
            setStackLane('balanced');
            setIsMinimized(false);
            setShowAllPresets(false);
            setTimeout(() => textareaRef.current?.focus(), 150);
        }
    }, [isOpen]);

    const basePresetCategories = useMemo<PresetCategory[]>(() => {
        if (mode === 'workspace') {
            return WORKSPACE_PRESET_CATEGORIES;
        }
        if (framework) {
            return resolveProjectPresetCategories(framework);
        }
        return PROJECT_GENERIC_PRESET_CATEGORIES;
    }, [mode, framework]);

    const activeFrameworkHint =
        framework ?? STACK_LANES.find((lane) => lane.id === stackLane)?.frameworkHint;

    const rankedPresetCategories = useMemo(() => {
        const contextHint = [targetWorkspaceName ?? '', activeFrameworkHint ?? '', stackLane, mode]
            .join(' ')
            .trim();
        return rankPresetCategories(basePresetCategories, contextHint);
    }, [activeFrameworkHint, basePresetCategories, mode, stackLane, targetWorkspaceName]);

    const presetLimit = showAllPresets ? Number.MAX_SAFE_INTEGER : 3;
    const visiblePresetCategories = rankedPresetCategories
        .map((category) => ({
            ...category,
            options: category.options.slice(0, presetLimit),
        }))
        .filter((category) => category.options.length > 0);

    const hasExtraPresets = rankedPresetCategories.some((category) => category.options.length > 3);

    if (!isOpen) { return null; }

    const handleSubmit = () => {
        if (!prompt.trim() || isThinking) { return; }
        onPromptSubmit(prompt.trim(), mode, activeFrameworkHint, stackLane);
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
            profile: mode === 'workspace' ? editedProfile : plan.profile,
            secondaryProject: plan.secondaryProject
                ? {
                      ...plan.secondaryProject,
                      projectName:
                          editedCompanionProjectName.trim() || plan.secondaryProject.projectName,
                  }
                : undefined,
        });
    };

    const handleStartOver = () => {
        setPrompt('');
        setShowAllPresets(false);
        onStartOver();
    };

    const fwMeta = framework ? FRAMEWORK_META[framework] : null;
    const modeLabel = mode === 'workspace' ? copy.modeWorkspace : copy.modeProject;
    const subtitle = fwMeta
        ? `${fwMeta.label} · ${copy.describe}`
        : copy.describe;

    return (
        <>
            {isMinimized ? (
                <div className="ai-create-pill" onClick={() => setIsMinimized(false)} role="button" aria-label="Restore creation plan panel">
                    <Loader2 size={13} className="ai-create-pill-spinner" />
                    <span className="ai-create-pill-label">
                        {isCreating ? (creationStage ?? 'Creating…') : 'Planning…'}
                    </span>
                    <span className="ai-create-pill-restore">▲ Restore</span>
                </div>
            ) : null}

            <EnterpriseModal
                isOpen={isOpen && !isMinimized}
                kicker="Assist"
                title={`${copy.title} · ${modeLabel}`}
                subtitle={subtitle}
                scope={modeLabel}
                icon={<Sparkles size={15} />}
                size="lg"
                lockClose={isThinking || isCreating}
                onClose={onClose}
                headerActions={
                    <>
                        {modelId && step === 'preview' ? (
                            <span className="ws-chip ws-chip--muted ai-create-model-badge">{modelId}</span>
                        ) : null}
                        {(step === 'thinking' || step === 'creating') && (
                            <button
                                type="button"
                                className="ws-btn ws-btn--ghost ws-btn--icon ai-create-minimize"
                                onClick={() => setIsMinimized(true)}
                                aria-label="Minimize"
                                title="Minimize — continue using the dashboard"
                            >
                                <Minus size={14} />
                            </button>
                        )}
                    </>
                }
            >
                {step === 'prompt' && (
                    <div className="ai-create-body">
                        {planError && (
                            <EnterpriseModalNotice tone="danger">
                                {planError}
                            </EnterpriseModalNotice>
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

                        {mode === 'workspace' && (
                            <div className="ai-create-stack-lanes">
                                <div className="ws-kicker ai-create-stack-lanes-label">Stack focus</div>
                                <div className="ai-create-stack-lane-grid">
                                    {STACK_LANES.map((lane) => (
                                        <button
                                            key={lane.id}
                                            type="button"
                                            className={`modal-option-card ai-create-stack-lane ${stackLane === lane.id ? 'modal-option-card--active' : ''}`}
                                            onClick={() => setStackLane(lane.id)}
                                        >
                                            <span className="modal-option-card__title">{lane.label}</span>
                                            <span className="modal-option-card__desc">{lane.detail}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="ws-kicker ai-create-presets-label">{copy.quickStart}</div>
                        <div className="ai-create-presets">
                            {visiblePresetCategories.map((category) => (
                                <div key={category.id} className="ai-create-preset-group">
                                    <div className="ai-create-preset-group-label">{category.label}</div>
                                    <div className="ai-create-preset-group-items">
                                        {category.options.map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                className={`ws-chip ai-create-preset ${prompt === option.text ? 'is-active' : ''}`}
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
                                className="ws-btn ws-btn--ghost ai-create-presets-toggle"
                                onClick={() => setShowAllPresets((prev) => !prev)}
                            >
                                {showAllPresets ? copy.showLess : copy.showAll}
                            </button>
                        )}

                        {/* Textarea */}
                        <div className="ws-field ai-create-input-wrap">
                            <textarea
                                ref={textareaRef}
                                className="ws-field__control ai-create-textarea"
                                placeholder={
                                    mode === 'workspace'
                                        ? resolveWorkspacePlaceholder(stackLane)
                                        : resolveProjectPlaceholder(framework)
                                }
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={3}
                            />
                            <div className="ws-kicker ai-create-input-hint">{copy.inputHint}</div>
                        </div>

                        <div className="ai-create-actions">
                            <button
                                type="button"
                                className="ws-btn ws-btn--primary ai-create-submit"
                                onClick={handleSubmit}
                                disabled={!prompt.trim()}
                            >
                                <Wand2 size={14} />
                                {copy.submit}
                                <ChevronRight size={14} />
                            </button>
                        </div>

                        <div className="ai-create-manual-link">
                            <button type="button" className="ws-btn ws-btn--ghost" onClick={onManualFallback}>
                                {copy.manual}
                            </button>
                        </div>
                    </div>
                )}

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

                {step === 'preview' && plan && (
                    <div className="ai-create-body">
                        {planError && (
                            <EnterpriseModalNotice tone="danger">
                                {planError}
                            </EnterpriseModalNotice>
                        )}

                        {planSource === 'heuristic' && (
                            <EnterpriseModalNotice tone="warning">
                                AI model output was unavailable or invalid. Plan was inferred locally from your description — review framework and modules before creating.
                            </EnterpriseModalNotice>
                        )}

                        {mode === 'workspace' && (
                            <EnterpriseModalNotice tone="info">
                                {PROFILE_META[editedProfile]?.label ?? editedProfile} profile will
                                bootstrap workspace artifacts for {FRAMEWORK_META[plan.framework]?.label ?? plan.framework}.
                                Adjust below if you need polyglot or enterprise governance.
                            </EnterpriseModalNotice>
                        )}

                        {/* Description */}
                        <div className="ai-create-desc">
                            <Sparkles size={12} className="ai-create-desc-icon" />
                            {plan.description}
                        </div>

                        {/* Badges row */}
                        <div className="ai-create-badges-row">
                            <span className="ws-chip ws-chip--accent ai-create-badge">
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
                            <span className="ws-chip ws-chip--primary ai-create-badge">
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
                            <span className="ws-chip ws-chip--muted ai-create-badge ai-create-badge--kit">
                                {plan.kit}
                            </span>
                        </div>

                        <div className="ai-create-fields">
                            {mode === 'workspace' && (
                                <>
                                    <div className="ws-field ai-create-field">
                                        <label className="ws-field__label ai-create-field-label">Workspace name</label>
                                        <input
                                            type="text"
                                            className="ws-field__control ai-create-field-input"
                                            value={editedWorkspaceName}
                                            onChange={(e) => setEditedWorkspaceName(e.target.value)}
                                            spellCheck={false}
                                        />
                                    </div>
                                    <div className="ws-field ai-create-field">
                                        <label className="ws-field__label ai-create-field-label">
                                            Bootstrap profile
                                            <button
                                                type="button"
                                                className="ws-btn ws-btn--ghost ai-create-profile-hint"
                                                onClick={() =>
                                                    setEditedProfile(
                                                        defaultBootstrapProfileForFramework(plan.framework)
                                                    )
                                                }
                                            >
                                                Match {FRAMEWORK_META[plan.framework]?.label ?? plan.framework}
                                            </button>
                                        </label>
                                        <div className="modal-option-grid modal-option-grid--profiles ai-create-profile-grid">
                                            {PROFILE_OPTIONS.map((profileId) => {
                                                const meta = PROFILE_META[profileId];
                                                return (
                                                    <button
                                                        key={profileId}
                                                        type="button"
                                                        className={`modal-option-card ${editedProfile === profileId ? 'modal-option-card--active' : ''}`}
                                                        onClick={() => setEditedProfile(profileId)}
                                                    >
                                                        <span className="modal-option-card__title">
                                                            {meta.iconUri ? (
                                                                <img
                                                                    src={meta.iconUri}
                                                                    alt={meta.label}
                                                                    style={{ width: 14, height: 14, objectFit: 'contain', marginRight: 4 }}
                                                                />
                                                            ) : (
                                                                `${meta.icon} `
                                                            )}
                                                            {meta.label}
                                                        </span>
                                                        <span className="modal-option-card__desc">{meta.desc}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="ws-field ai-create-field">
                                <label className="ws-field__label ai-create-field-label">
                                    {mode === 'workspace' ? 'First project name' : 'Project name'}
                                </label>
                                <input
                                    type="text"
                                    className="ws-field__control ai-create-field-input"
                                    value={editedProjectName}
                                    onChange={(e) => setEditedProjectName(e.target.value)}
                                    spellCheck={false}
                                />
                            </div>
                            {mode === 'workspace' && plan.secondaryProject && (
                                <div className="ws-field ai-create-field">
                                    <label className="ws-field__label ai-create-field-label">
                                        Companion project
                                    </label>
                                    <div className="ai-create-thinking-prompt">
                                        {FRAMEWORK_META[plan.secondaryProject.framework]?.label ??
                                            plan.secondaryProject.framework}
                                    </div>
                                    <input
                                        type="text"
                                        className="ws-field__control ai-create-field-input"
                                        value={editedCompanionProjectName}
                                        onChange={(e) => setEditedCompanionProjectName(e.target.value)}
                                        spellCheck={false}
                                    />
                                </div>
                            )}
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
                                        <span key={slug} className="ws-chip ws-chip--muted ai-create-module-chip">
                                            {MODULE_LABELS[slug] ?? slug.split('/').pop()}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="ai-create-actions">
                            <button
                                type="button"
                                className="ws-btn ws-btn--primary ai-create-confirm"
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
                                className="ws-btn ai-create-back"
                                onClick={handleStartOver}
                            >
                                <ArrowLeft size={13} />
                                Start over
                            </button>
                        </div>

                        <div className="ai-create-manual-link">
                            <button type="button" className="ws-btn ws-btn--ghost" onClick={onManualFallback}>
                                Switch to manual form
                            </button>
                        </div>
                    </div>
                )}

                {step === 'creating' && (
                    <div className="ai-create-body ai-create-body--centered">
                        <div className="ai-create-thinking">
                            <div className="ai-create-thinking-orb ai-create-thinking-orb--creating">
                                <div className="ai-create-thinking-ring ai-create-thinking-ring--1" />
                                <div className="ai-create-thinking-ring ai-create-thinking-ring--2" />
                                <Loader2 size={22} className="ai-create-thinking-icon animate-spin" />
                            </div>
                            {creationStage === 'first_project_done' ? (
                                <>
                                    <div className="ai-create-thinking-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Check size={16} style={{ color: 'var(--ws-success)' }} />
                                        First project <strong>{plan?.projectName}</strong> created
                                    </div>
                                    <div className="ai-create-thinking-label" style={{ marginTop: '6px' }}>
                                        Creating companion project{' '}
                                        <strong>{plan?.secondaryProject?.projectName}</strong>…
                                    </div>
                                </>
                            ) : creationStage === 'workspace_done' ? (
                                <>
                                    <div className="ai-create-thinking-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Check size={16} style={{ color: 'var(--ws-success)' }} />
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
                                        {plan?.secondaryProject
                                            ? ` + ${plan.secondaryProject.projectName}`
                                            : ''}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </EnterpriseModal>
        </>
    );
}
