import type { ScaffoldFramework } from '@/types';
import { isFrontendScaffoldFramework } from '@/lib/scaffoldFrameworks';

export type CreationStackLane = 'balanced' | 'frontend' | 'backend' | 'polyglot' | 'enterprise';

export type PresetOption = {
  id: string;
  text: string;
  tags: string[];
};

export type PresetCategory = {
  id: string;
  label: string;
  options: PresetOption[];
};

export const STACK_LANES: Array<{
  id: CreationStackLane;
  label: string;
  detail: string;
  frameworkHint?: ScaffoldFramework;
}> = [
  { id: 'balanced', label: 'Any stack', detail: 'Let AI infer the best runtime' },
  {
    id: 'frontend',
    label: 'Frontend',
    detail: 'React, Vue, Next, Astro…',
    frameworkHint: 'nextjs',
  },
  {
    id: 'backend',
    label: 'Backend API',
    detail: 'FastAPI, NestJS, Go, Java, .NET',
    frameworkHint: 'nestjs',
  },
  { id: 'polyglot', label: 'Full-stack', detail: 'Frontend + API in one workspace' },
  { id: 'enterprise', label: 'Enterprise', detail: 'Governance and release gates' },
];

export const MANUAL_STACK_LANES: typeof STACK_LANES = STACK_LANES.map((lane) =>
  lane.id === 'balanced' ? { ...lane, detail: 'Choose bootstrap profile explicitly below' } : lane
);

export type WorkspaceBootstrapProfile =
  | 'minimal'
  | 'python-only'
  | 'node-only'
  | 'go-only'
  | 'java-only'
  | 'dotnet-only'
  | 'polyglot'
  | 'enterprise';

export function defaultProfileForStackLane(lane: CreationStackLane): WorkspaceBootstrapProfile {
  switch (lane) {
    case 'frontend':
      return 'node-only';
    case 'backend':
      return 'node-only';
    case 'polyglot':
      return 'polyglot';
    case 'enterprise':
      return 'enterprise';
    default:
      return 'minimal';
  }
}

export function recommendedProfilesForStackLane(
  lane: CreationStackLane
): WorkspaceBootstrapProfile[] | undefined {
  switch (lane) {
    case 'frontend':
      return ['node-only'];
    case 'backend':
      return ['python-only', 'node-only', 'go-only', 'java-only', 'dotnet-only'];
    case 'polyglot':
      return ['polyglot'];
    case 'enterprise':
      return ['enterprise', 'polyglot'];
    default:
      return undefined;
  }
}

export function stackLaneGuidance(lane: CreationStackLane): string {
  switch (lane) {
    case 'frontend':
      return 'Node.js profile bootstraps artifacts for Next.js, Vite, Nuxt, Astro, and other frontend generators.';
    case 'backend':
      return 'Pick the runtime profile that matches your first API service. You can add other runtimes later with polyglot.';
    case 'polyglot':
      return 'Polyglot profile keeps frontend and backend projects under one governed workspace boundary.';
    case 'enterprise':
      return 'Enterprise profile enables governance-heavy bootstrap artifacts and release evidence posture.';
    default:
      return 'Select the bootstrap profile that matches how you plan to scaffold the first project.';
  }
}

export function resolveManualWorkspaceNamePlaceholder(lane: CreationStackLane): string {
  return resolveDefaultWorkspaceName(lane, defaultProfileForStackLane(lane));
}

const PYTHON_FREE_PROFILES = new Set<WorkspaceBootstrapProfile>([
  'minimal',
  'node-only',
  'go-only',
  'java-only',
  'dotnet-only',
]);

export function profileRequiresPythonInstallMethod(profile: WorkspaceBootstrapProfile): boolean {
  return !PYTHON_FREE_PROFILES.has(profile);
}

export function defaultInstallPythonEngineForProfile(profile: WorkspaceBootstrapProfile): boolean {
  return profileRequiresPythonInstallMethod(profile);
}

export function resolveDefaultWorkspaceName(
  lane: CreationStackLane,
  profile: WorkspaceBootstrapProfile
): string {
  switch (profile) {
    case 'python-only':
      return 'python-api-wsp';
    case 'node-only':
      return lane === 'frontend' ? 'web-platform-wsp' : 'node-api-wsp';
    case 'go-only':
      return 'go-service-wsp';
    case 'java-only':
      return 'java-service-wsp';
    case 'dotnet-only':
      return 'dotnet-api-wsp';
    case 'polyglot':
      return 'saas-platform-wsp';
    case 'enterprise':
      return 'enterprise-platform-wsp';
    case 'minimal':
    default:
      switch (lane) {
        case 'frontend':
          return 'web-platform-wsp';
        case 'backend':
          return 'api-platform-wsp';
        case 'polyglot':
          return 'saas-platform-wsp';
        case 'enterprise':
          return 'enterprise-platform-wsp';
        default:
          return 'my-workspace-wsp';
      }
  }
}

export const WORKSPACE_PRESET_CATEGORIES: PresetCategory[] = [
  {
    id: 'frontend-products',
    label: 'Frontend products',
    options: [
      {
        id: 'ws-next-dashboard',
        text: 'Next.js product dashboard with auth-ready routing and API integration',
        tags: ['nextjs', 'react', 'dashboard', 'frontend', 'auth', 'api'],
      },
      {
        id: 'ws-vite-react',
        text: 'Vite + React SPA for a customer-facing web application',
        tags: ['vite', 'react', 'spa', 'frontend', 'webapp'],
      },
      {
        id: 'ws-astro-marketing',
        text: 'Astro marketing site with landing pages and content sections',
        tags: ['astro', 'marketing', 'landing', 'frontend', 'content'],
      },
    ],
  },
  {
    id: 'backend-services',
    label: 'Backend services',
    options: [
      {
        id: 'ws-rest-users',
        text: 'REST API backend with user management and PostgreSQL',
        tags: ['rest', 'api', 'users', 'backend', 'postgres', 'nestjs'],
      },
      {
        id: 'ws-fastapi-saas',
        text: 'FastAPI SaaS API with auth, billing, and database modules',
        tags: ['fastapi', 'saas', 'auth', 'billing', 'python', 'backend'],
      },
      {
        id: 'ws-admin-rbac',
        text: 'Admin API with role-based access and audit-friendly boundaries',
        tags: ['admin', 'rbac', 'roles', 'permissions', 'backend'],
      },
    ],
  },
  {
    id: 'systems-runtimes',
    label: 'Go, Java, and .NET',
    options: [
      {
        id: 'ws-go-service',
        text: 'Go microservice with HTTP API and production-ready project layout',
        tags: ['go', 'golang', 'microservice', 'api', 'backend'],
      },
      {
        id: 'ws-spring-service',
        text: 'Spring Boot service with REST endpoints and health checks',
        tags: ['spring', 'springboot', 'java', 'backend', 'api'],
      },
      {
        id: 'ws-dotnet-api',
        text: '.NET Web API with clean architecture and validation',
        tags: ['dotnet', 'csharp', 'webapi', 'backend'],
      },
    ],
  },
  {
    id: 'full-stack',
    label: 'Full-stack workspace',
    options: [
      {
        id: 'ws-polyglot-next-nest',
        text: 'Polyglot workspace: Next.js frontend + NestJS API with shared governance',
        tags: ['polyglot', 'nextjs', 'nestjs', 'frontend', 'backend', 'full-stack'],
      },
      {
        id: 'ws-polyglot-react-fastapi',
        text: 'Polyglot workspace: React app + FastAPI services in one governed workspace',
        tags: ['polyglot', 'react', 'fastapi', 'frontend', 'backend', 'full-stack'],
      },
      {
        id: 'ws-saas-commerce',
        text: 'SaaS commerce platform with catalog API and customer-facing web app',
        tags: ['saas', 'ecommerce', 'catalog', 'frontend', 'backend', 'polyglot'],
      },
    ],
  },
  {
    id: 'platform-ai',
    label: 'Platform and AI',
    options: [
      {
        id: 'ws-microservice-observability',
        text: 'Microservice platform with caching, observability, and health evidence',
        tags: ['microservice', 'cache', 'observability', 'metrics', 'backend'],
      },
      {
        id: 'ws-ai-assistant',
        text: 'AI assistant platform with LLM integration and retrieval workflows',
        tags: ['ai', 'assistant', 'llm', 'chat', 'inference', 'backend'],
      },
    ],
  },
  {
    id: 'enterprise-governance',
    label: 'Enterprise governance',
    options: [
      {
        id: 'ws-enterprise-gov',
        text: 'Enterprise multi-team workspace with compliance and release governance',
        tags: ['enterprise', 'governance', 'compliance', 'multi-team', 'release'],
      },
    ],
  },
];

export function resolveWorkspacePlaceholder(lane: CreationStackLane): string {
  switch (lane) {
    case 'frontend':
      return 'e.g. "Next.js admin dashboard with role-aware navigation and API hooks"';
    case 'backend':
      return 'e.g. "NestJS REST API with JWT auth, PostgreSQL, and audit-ready modules"';
    case 'polyglot':
      return 'e.g. "Polyglot SaaS: Next.js web app + FastAPI services with shared governance"';
    case 'enterprise':
      return 'e.g. "Enterprise workspace for multi-team release gates and compliance evidence"';
    default:
      return 'e.g. "Product platform with the runtime mix you need — frontend, API, or full-stack"';
  }
}

export function resolveProjectPlaceholder(framework?: ScaffoldFramework): string {
  if (framework && isFrontendScaffoldFramework(framework)) {
    return 'e.g. "Customer dashboard with protected routes and API-backed tables"';
  }
  if (framework === 'tauri' || framework === 'electron') {
    return 'e.g. "Cross-platform desktop client with settings and secure API access"';
  }
  if (framework === 'vscode-extension') {
    return 'e.g. "VS Code extension with commands, a sidebar view, and tests"';
  }
  return 'e.g. "CRUD API with JWT auth, PostgreSQL, and clean layered architecture"';
}

export function resolveCreatePlaceholder(
  lane: CreationStackLane,
  target: 'workspace' | 'project',
  workspaceName?: string
): string {
  if (target === 'workspace') {
    return resolveWorkspacePlaceholder(lane);
  }

  const scope = workspaceName?.trim() ? ` to ${workspaceName.trim()}` : '';
  switch (lane) {
    case 'frontend':
      return `Describe a frontend project to add${scope} — Next.js, React, Vue, Astro…`;
    case 'backend':
      return `Describe an API or backend service to add${scope} — Node, Python, Go, Java, .NET…`;
    case 'polyglot':
      return `Describe one full-stack or cross-runtime project to add${scope}…`;
    case 'enterprise':
      return `Describe one governed, release-ready project to add${scope}…`;
    default:
      return `Describe one project to add${scope} — web, API, desktop, extension, or CLI…`;
  }
}

/** Quick-start prompts shown in the sidebar Add drawer, keyed by stack lane. */
export function quickStartsForStackLane(lane: CreationStackLane): string[] {
  const pick = (categoryId: string) =>
    WORKSPACE_PRESET_CATEGORIES.find((c) => c.id === categoryId)?.options.map((o) => o.text) ?? [];

  switch (lane) {
    case 'frontend':
      return pick('frontend-products');
    case 'backend':
      return [...pick('backend-services'), ...pick('systems-runtimes')].slice(0, 5);
    case 'polyglot':
      return pick('full-stack');
    case 'enterprise':
      return [...pick('enterprise-governance'), ...pick('platform-ai').slice(0, 2)];
    default:
      return [
        pick('full-stack')[0],
        pick('frontend-products')[0],
        pick('backend-services')[0],
        pick('platform-ai')[0],
        pick('enterprise-governance')[0],
      ].filter(Boolean) as string[];
  }
}

/**
 * Target-aware quick starts for the Create composer.
 *
 * Workspace prompts may describe multiple projects. Project prompts must remain
 * executable as one scaffold so selecting Project never silently expands into
 * a second project or a new workspace.
 */
export function quickStartsForCreateTarget(
  lane: CreationStackLane,
  target: 'workspace' | 'project'
): string[] {
  if (target === 'workspace') {
    return quickStartsForStackLane(lane);
  }

  const pick = (categoryId: string) =>
    WORKSPACE_PRESET_CATEGORIES.find((category) => category.id === categoryId)?.options.map(
      (option) => option.text
    ) ?? [];

  switch (lane) {
    case 'frontend':
      return pick('frontend-products');
    case 'backend':
      return [...pick('backend-services'), ...pick('systems-runtimes')].slice(0, 5);
    case 'polyglot':
      return [
        'Next.js full-stack application with authenticated routes and server-side API handlers',
        'Nuxt full-stack application with a governed server API and shared validation',
        'Electron desktop application with a TypeScript UI and secure backend integration',
      ];
    case 'enterprise':
      return [
        'NestJS service with audit logging, policy boundaries, and release-ready tests',
        'Spring Boot service with health checks, validation, and compliance-ready evidence',
        'VS Code extension with governed commands, a sidebar view, and automated tests',
      ];
    default:
      return [
        pick('frontend-products')[0],
        pick('backend-services')[0],
        pick('systems-runtimes')[0],
        'Tauri desktop application with a TypeScript interface and secure local commands',
        'VS Code extension with commands, a sidebar view, and automated tests',
      ].filter(Boolean) as string[];
  }
}

export function stackLaneLabel(lane: CreationStackLane): string {
  return STACK_LANES.find((l) => l.id === lane)?.label ?? 'Any stack';
}
