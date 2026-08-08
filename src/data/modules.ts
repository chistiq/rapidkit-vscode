/**
 * Workspai Modules Data
 * Source: core/src/modules/free
 */

export interface ModuleData {
  id: string;
  name: string;
  version: string;
  category: string;
  icon: string;
  description: string;
  status: 'stable' | 'beta' | 'experimental';
  dependencies?: string[];
  tags?: string[];
  slug: string; // Full slug like "free/auth/oauth"
}

export const MODULES: ModuleData[] = [
  // AI Modules
  {
    id: 'agent_runtime',
    name: 'Agent Runtime',
    version: '0.1.15',
    category: 'ai',
    icon: '🤖',
    description: 'Agent runtime scaffolding for tools, memory, execution st...',
    status: 'stable',
    tags: ['agents', 'ai', 'memory', 'tools', 'workflow'],
    slug: 'free/ai/agent_runtime',
  },

  {
    id: 'ai_assistant',
    name: 'Ai Assistant',
    version: '0.1.20',
    category: 'ai',
    icon: '🤖',
    description: 'Provider-agnostic...',
    status: 'stable',
    tags: ['ai', 'core'],
    slug: 'free/ai/ai_assistant',
  },

  {
    id: 'ai_guardrails',
    name: 'Ai Guardrails',
    version: '0.1.9',
    category: 'ai',
    icon: '🤖',
    description: 'AI input/output safety policy, PII redaction hooks, and m...',
    status: 'stable',
    tags: ['ai', 'guardrails', 'pii', 'policy', 'safety'],
    slug: 'free/ai/ai_guardrails',
  },

  {
    id: 'llm_gateway',
    name: 'Llm Gateway',
    version: '0.1.18',
    category: 'ai',
    icon: '🤖',
    description: 'Provider-neutral LLM gateway with routing, fallback, budg...',
    status: 'stable',
    tags: ['ai', 'gateway', 'llm', 'routing', 'telemetry'],
    slug: 'free/ai/llm_gateway',
  },

  {
    id: 'prompt_ops',
    name: 'Prompt Ops',
    version: '0.1.9',
    category: 'ai',
    icon: '🤖',
    description: 'Prompt versioning, rollout, evaluation, rollback, and aud...',
    status: 'stable',
    tags: ['ai', 'audit', 'evaluations', 'prompts', 'rollback'],
    slug: 'free/ai/prompt_ops',
  },

  {
    id: 'rag_pipeline',
    name: 'Rag Pipeline',
    version: '0.1.11',
    category: 'ai',
    icon: '🤖',
    description: 'RAG pipeline scaffolding for ingestion, embeddings, retri...',
    status: 'stable',
    tags: ['ai', 'documents', 'embeddings', 'rag', 'retrieval'],
    slug: 'free/ai/rag_pipeline',
  },

  {
    id: 'tool_registry',
    name: 'Tool Registry',
    version: '0.1.9',
    category: 'ai',
    icon: '🤖',
    description: 'Tool registry, schemas, permissions, and audit-safe invoc...',
    status: 'stable',
    tags: ['ai', 'audit', 'permissions', 'schemas', 'tools'],
    slug: 'free/ai/tool_registry',
  },

  {
    id: 'vector_store',
    name: 'Vector Store',
    version: '0.1.11',
    category: 'ai',
    icon: '🤖',
    description: 'Vector store abstraction for pgvector/Qdrant-style indexe...',
    status: 'stable',
    tags: ['ai', 'embeddings', 'pgvector', 'search', 'vectors'],
    slug: 'free/ai/vector_store',
  },

  // Authentication Modules
  {
    id: 'api_keys',
    name: 'API Keys',
    version: '0.1.5',
    category: 'auth',
    icon: '🔐',
    description: 'Deterministic API key issuance, verification, and auditing',
    status: 'stable',
    tags: ['api-keys', 'auditing', 'auth', 'security'],
    slug: 'free/auth/api_keys',
  },

  {
    id: 'auth_core',
    name: 'Authentication Core',
    version: '0.1.14',
    category: 'auth',
    icon: '🔐',
    description: 'Opinionated password hashing, token signing, and runtime ...',
    status: 'stable',
    tags: ['auth', 'passwords', 'security', 'tokens'],
    slug: 'free/auth/core',
  },

  {
    id: 'oauth',
    name: 'OAuth Providers',
    version: '0.1.16',
    category: 'auth',
    icon: '🔐',
    description: 'Lightweight OAuth 2.0 scaffolding with provider registry,...',
    status: 'stable',
    tags: ['auth'],
    slug: 'free/auth/oauth',
  },

  {
    id: 'passwordless',
    name: 'Passwordless Authentication',
    version: '0.1.13',
    category: 'auth',
    icon: '🔐',
    description: 'Magic link and one-time code authentication helpers for f...',
    status: 'stable',
    tags: ['auth'],
    slug: 'free/auth/passwordless',
  },

  {
    id: 'session',
    name: 'Session Management',
    version: '0.1.14',
    category: 'auth',
    icon: '🔐',
    description: 'Opinionated session management utilities offering signed ...',
    status: 'stable',
    tags: ['auth'],
    slug: 'free/auth/session',
  },

  // Billing Modules
  {
    id: 'cart',
    name: 'Cart',
    version: '0.1.18',
    category: 'billing',
    icon: '💳',
    description: 'Shopping cart service for checkout flows',
    status: 'stable',
    tags: ['billing', 'cart'],
    slug: 'free/billing/cart',
  },

  {
    id: 'inventory',
    name: 'Inventory',
    version: '0.1.11',
    category: 'billing',
    icon: '💳',
    description: 'Inventory and pricing service backing Cart + Stripe',
    status: 'stable',
    tags: ['billing', 'inventory'],
    slug: 'free/billing/inventory',
  },

  {
    id: 'stripe_payment',
    name: 'Stripe Payment',
    version: '0.1.6',
    category: 'billing',
    icon: '💳',
    description: 'Stripe payments and subscriptions',
    status: 'stable',
    tags: ['billing', 'stripe-payment'],
    slug: 'free/billing/stripe_payment',
  },

  {
    id: 'usage_billing',
    name: 'Usage Billing',
    version: '0.1.11',
    category: 'billing',
    icon: '💳',
    description: 'Usage metering, quota enforcement, plan limits, and overa...',
    status: 'stable',
    tags: ['billing', 'metering', 'plans', 'quota', 'usage'],
    slug: 'free/billing/usage_billing',
  },

  // Business Modules
  {
    id: 'admin_console',
    name: 'Admin Console',
    version: '0.1.8',
    category: 'business',
    icon: '💼',
    description: 'Reusable admin console foundation with action registry, p...',
    status: 'stable',
    tags: ['admin', 'audit', 'business', 'operations'],
    slug: 'free/business/admin_console',
  },

  {
    id: 'approval_engine',
    name: 'Approval Engine',
    version: '0.1.9',
    category: 'business',
    icon: '💼',
    description: 'Approval workflow engine with policies, required reasons,...',
    status: 'stable',
    tags: ['admin', 'approvals', 'audit', 'business', 'workflow'],
    slug: 'free/business/approval_engine',
  },

  {
    id: 'connector_hub',
    name: 'Connector Hub',
    version: '0.1.11',
    category: 'business',
    icon: '💼',
    description: 'Integration connector hub scaffolding for external apps, ...',
    status: 'stable',
    tags: ['adapters', 'connectors', 'integrations', 'oauth', 'sync'],
    slug: 'free/business/connector_hub',
  },

  {
    id: 'connector_pack_library',
    name: 'Connector Pack Library',
    version: '0.1.8',
    category: 'business',
    icon: '💼',
    description: 'Connector pack registry for provider catalogs, scopes, in...',
    status: 'stable',
    tags: ['business', 'catalog', 'connectors', 'integrations'],
    slug: 'free/business/connector_pack_library',
  },

  {
    id: 'document_pipeline',
    name: 'Document Pipeline',
    version: '0.1.9',
    category: 'business',
    icon: '💼',
    description: 'Document ingestion, extraction, chunking, classification,...',
    status: 'stable',
    tags: ['business', 'chunking', 'classification', 'documents', 'extraction', 'ingestion'],
    slug: 'free/business/document_pipeline',
  },

  {
    id: 'feature_flags',
    name: 'Feature Flags',
    version: '0.1.10',
    category: 'business',
    icon: '💼',
    description: 'Feature flag scaffolding for staged rollout, entitlement-...',
    status: 'stable',
    tags: ['experiments', 'feature-flags', 'kill-switches', 'rollout'],
    slug: 'free/business/feature_flags',
  },

  {
    id: 'forms_engine',
    name: 'Forms Engine',
    version: '0.1.9',
    category: 'business',
    icon: '💼',
    description: 'Schema-driven forms engine with validation, submissions, ...',
    status: 'stable',
    tags: ['business', 'forms', 'submissions', 'validation', 'workflow'],
    slug: 'free/business/forms_engine',
  },

  {
    id: 'media_pipeline',
    name: 'Media Pipeline',
    version: '0.1.9',
    category: 'business',
    icon: '💼',
    description: 'Media ingestion and transformation pipeline with checksum...',
    status: 'stable',
    tags: ['assets', 'business', 'media', 'moderation', 'variants'],
    slug: 'free/business/media_pipeline',
  },

  {
    id: 'multi_tenancy',
    name: 'Multi Tenancy',
    version: '0.1.11',
    category: 'business',
    icon: '💼',
    description: 'Organization, team, tenant isolation, membership, and ten...',
    status: 'stable',
    tags: ['isolation', 'organizations', 'saas', 'teams', 'tenancy'],
    slug: 'free/business/multi_tenancy',
  },

  {
    id: 'org_admin_console',
    name: 'Org Admin Console',
    version: '0.1.8',
    category: 'business',
    icon: '💼',
    description: 'Organization admin console for tenant settings, membershi...',
    status: 'stable',
    tags: ['admin', 'business', 'organizations', 'tenancy'],
    slug: 'free/business/org_admin_console',
  },

  {
    id: 'storage',
    name: 'Storage',
    version: '0.1.14',
    category: 'business',
    icon: '💼',
    description: 'File Storage & Media Management Module - Upload, store, a...',
    status: 'stable',
    tags: ['business', 'file-upload', 'gcs', 'media-management', 's3', 'storage'],
    slug: 'free/business/storage',
  },

  {
    id: 'support_center',
    name: 'Support Center',
    version: '0.1.8',
    category: 'business',
    icon: '💼',
    description: 'Support center foundation with tickets, SLA state, custom...',
    status: 'stable',
    tags: ['audit', 'business', 'sla', 'support', 'tickets'],
    slug: 'free/business/support_center',
  },

  // Cache Modules
  {
    id: 'redis',
    name: 'Redis Cache',
    version: '0.1.23',
    category: 'cache',
    icon: '🔴',
    description: 'Production-ready Redis runtime with async and sync client...',
    status: 'stable',
    tags: ['cache', 'datastore', 'redis'],
    slug: 'free/cache/redis',
  },

  // Communication Modules
  {
    id: 'email',
    name: 'Email',
    version: '0.1.24',
    category: 'communication',
    icon: '📧',
    description: '',
    status: 'stable',
    tags: ['communication', 'email', 'marketing', 'transactional'],
    slug: 'free/communication/email',
  },

  {
    id: 'notifications',
    name: 'Unified Notifications',
    version: '0.1.31',
    category: 'communication',
    icon: '📧',
    description: 'Email-first notifications runtime offering SMTP delivery,...',
    status: 'stable',
    tags: ['communication', 'email', 'notifications'],
    slug: 'free/communication/notifications',
  },

  {
    id: 'webhook_platform',
    name: 'Webhook Platform',
    version: '0.1.11',
    category: 'communication',
    icon: '📧',
    description: 'Inbound and outbound webhook scaffolding with signatures,...',
    status: 'stable',
    tags: ['events', 'integrations', 'replay', 'signatures', 'webhooks'],
    slug: 'free/communication/webhook_platform',
  },

  // Database Modules
  {
    id: 'db_mongo',
    name: 'Db Mongo',
    version: '0.1.10',
    category: 'database',
    icon: '🗄️',
    description: 'MongoDB integration with async driver support, health dia...',
    status: 'stable',
    tags: ['database', 'db-mongo'],
    slug: 'free/database/db_mongo',
  },

  {
    id: 'db_sqlite',
    name: 'Db Sqlite',
    version: '0.1.12',
    category: 'database',
    icon: '🗄️',
    description: 'SQLite database integration for development',
    status: 'stable',
    tags: ['database', 'db-sqlite'],
    slug: 'free/database/db_sqlite',
  },

  {
    id: 'db_postgres',
    name: 'PostgreSQL',
    version: '0.1.31',
    category: 'database',
    icon: '🗄️',
    description: 'SQLAlchemy async+sync Postgres with clean DI, healthcheck...',
    status: 'stable',
    tags: ['asyncpg', 'connection-pool', 'database', 'postgresql', 'sqlalchemy'],
    slug: 'free/database/db_postgres',
  },

  // Essentials Modules
  {
    id: 'settings',
    name: 'Application Settings',
    version: '0.1.45',
    category: 'essentials',
    icon: '🏗️',
    description: 'Centralized, modular configuration management using Pydan...',
    status: 'stable',
    tags: ['config', 'env', 'settings'],
    slug: 'free/essentials/settings',
  },

  {
    id: 'deployment',
    name: 'Deployment Toolkit',
    version: '0.1.13',
    category: 'essentials',
    icon: '🏗️',
    description: 'Portable Docker, Compose, Makefile, and CI assets for Rap...',
    status: 'stable',
    tags: ['deployment', 'devops', 'essentials'],
    slug: 'free/essentials/deployment',
  },

  {
    id: 'middleware',
    name: 'Middleware',
    version: '0.1.24',
    category: 'essentials',
    icon: '🏗️',
    description: 'HTTP middleware pipeline with FastAPI and NestJS support.',
    status: 'stable',
    tags: ['essentials', 'http', 'middleware'],
    slug: 'free/essentials/middleware',
  },

  {
    id: 'logging',
    name: 'Structured Logging & Observability',
    version: '0.1.13',
    category: 'essentials',
    icon: '🏗️',
    description: 'Structured logging runtime with correlation IDs, multi-si...',
    status: 'stable',
    tags: ['logging', 'observability', 'tracing'],
    slug: 'free/essentials/logging',
  },

  // Observability Modules
  {
    id: 'analytics_dashboard',
    name: 'Analytics Dashboard',
    version: '0.1.8',
    category: 'observability',
    icon: '📊',
    description: 'Analytics dashboard foundation with metrics, widgets, das...',
    status: 'stable',
    tags: ['analytics', 'dashboards', 'metrics', 'observability'],
    slug: 'free/observability/analytics_dashboard',
  },

  {
    id: 'observability_core',
    name: 'Observability Core',
    version: '0.1.15',
    category: 'observability',
    icon: '📊',
    description: 'Cohesive metrics, tracing, and structured logging foundat...',
    status: 'stable',
    tags: ['logging', 'metrics', 'observability', 'telemetry', 'tracing'],
    slug: 'free/observability/core',
  },

  // Security Modules
  {
    id: 'audit_policy',
    name: 'Audit Policy',
    version: '0.1.10',
    category: 'security',
    icon: '🛡️',
    description: 'Immutable audit event, admin policy, reason capture, and ...',
    status: 'stable',
    tags: ['admin', 'audit', 'compliance', 'policy', 'security'],
    slug: 'free/security/audit_policy',
  },

  {
    id: 'cors',
    name: 'Cors',
    version: '0.1.16',
    category: 'security',
    icon: '🛡️',
    description: 'Cross-Origin Resource Sharing security module',
    status: 'stable',
    tags: ['security'],
    slug: 'free/security/cors',
  },

  {
    id: 'rate_limiting',
    name: 'Rate Limiting',
    version: '0.1.15',
    category: 'security',
    icon: '🛡️',
    description: 'Production-grade request throttling with configurable rul...',
    status: 'stable',
    tags: ['rate-limiting', 'security', 'throttling'],
    slug: 'free/security/rate_limiting',
  },

  {
    id: 'security_headers',
    name: 'Security Headers',
    version: '0.1.7',
    category: 'security',
    icon: '🛡️',
    description: 'Harden HTTP responses with industry-standard security hea...',
    status: 'stable',
    tags: ['security', 'security-headers'],
    slug: 'free/security/security_headers',
  },

  // Tasks Modules
  {
    id: 'celery',
    name: 'Celery',
    version: '0.1.13',
    category: 'tasks',
    icon: '⚡',
    description: 'Production-ready Celery task orchestration for asynchrono...',
    status: 'stable',
    tags: ['async', 'queue', 'tasks'],
    slug: 'free/tasks/celery',
  },

  {
    id: 'event_bus',
    name: 'Event Bus',
    version: '0.1.9',
    category: 'tasks',
    icon: '⚡',
    description: 'In-process event bus with subscriptions, durable-style ev...',
    status: 'stable',
    tags: ['dead-letter', 'events', 'pubsub', 'replay', 'tasks'],
    slug: 'free/tasks/event_bus',
  },

  {
    id: 'queue_platform',
    name: 'Queue Platform',
    version: '0.1.10',
    category: 'tasks',
    icon: '⚡',
    description: 'Tenant-aware durable queue abstraction with retry, delay,...',
    status: 'stable',
    tags: ['dead-letter', 'queue', 'retry', 'tasks', 'workers'],
    slug: 'free/tasks/queue_platform',
  },

  {
    id: 'workflow_engine',
    name: 'Workflow Engine',
    version: '0.1.13',
    category: 'tasks',
    icon: '⚡',
    description: 'Workflow engine scaffolding for triggers, actions, condit...',
    status: 'stable',
    tags: ['approvals', 'automation', 'scheduler', 'triggers', 'workflow'],
    slug: 'free/tasks/workflow_engine',
  },

  // Users Modules
  {
    id: 'users_core',
    name: 'Users Core',
    version: '0.1.13',
    category: 'users',
    icon: '👥',
    description: 'Opinionated user management backbone that ships immutable...',
    status: 'stable',
    tags: ['application', 'domain', 'users'],
    slug: 'free/users/users_core',
  },

  {
    id: 'users_profiles',
    name: 'Users Profiles',
    version: '0.1.12',
    category: 'users',
    icon: '👥',
    description: 'Extends the Users Core module with rich profile modelling...',
    status: 'stable',
    tags: ['personalization', 'user_profiles', 'users'],
    slug: 'free/users/users_profiles',
  },
];

export const CATEGORY_INFO = {
  ai: { name: 'AI', color: '#9B59B6', icon: '🤖' },
  auth: { name: 'Authentication', color: '#F59E0B', icon: '🔐' },
  billing: { name: 'Billing', color: '#E91E63', icon: '💳' },
  business: { name: 'Business', color: '#FF6B6B', icon: '💼' },
  cache: { name: 'Cache', color: '#CB3837', icon: '🔴' },
  communication: { name: 'Communication', color: '#4ECDC4', icon: '📧' },
  database: { name: 'Database', color: '#3775A9', icon: '🗄️' },
  essentials: { name: 'Essentials', color: '#2196F3', icon: '🏗️' },
  observability: { name: 'Observability', color: '#10B981', icon: '📊' },
  security: { name: 'Security', color: '#F59E0B', icon: '🛡️' },
  tasks: { name: 'Tasks', color: '#8E44AD', icon: '⚡' },
  users: { name: 'Users', color: '#3498DB', icon: '👥' },
};

export function getModulesByCategory(category: string): ModuleData[] {
  if (category === 'all') {
    return MODULES;
  }
  return MODULES.filter((m) => m.category === category);
}

export function getCategories(): string[] {
  return Array.from(new Set(MODULES.map((m) => m.category)));
}

export function getTotalModuleCount(): number {
  return MODULES.length;
}
