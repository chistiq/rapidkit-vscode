import type {
  AgentScaffoldFramework,
  BackendScaffoldFramework,
  DesktopScaffoldFramework,
  ExtensionScaffoldFramework,
  FrontendScaffoldFramework,
  GatewayScaffoldFramework,
  ScaffoldFramework,
} from '@/types';
import createContract from '@workspai-contracts/create-planner-capabilities.v1.json';

type ExecutableCreateEntry = {
  id: string;
  category: string;
  plannerFramework: string;
  runtime: string;
  canExecuteCreate?: boolean;
};

const EXECUTABLE_CREATE_ENTRIES: ExecutableCreateEntry[] = [
  ...(createContract.nativeCreate as ExecutableCreateEntry[]),
  ...(createContract.officialCreate as ExecutableCreateEntry[]).filter(
    (entry) => entry.canExecuteCreate
  ),
];

export const BACKEND_STARTERS: Array<{
  framework: BackendScaffoldFramework;
  title: string;
  detail: string;
}> = [
  { framework: 'fastapi', title: 'FastAPI', detail: 'Python API' },
  { framework: 'nestjs', title: 'NestJS', detail: 'TypeScript service' },
  { framework: 'go', title: 'Go', detail: 'Go service' },
  { framework: 'springboot', title: 'Spring Boot', detail: 'Java service' },
  { framework: 'dotnet', title: '.NET', detail: 'C# Web API' },
  { framework: 'rust', title: 'Rust Axum', detail: 'Rust backend' },
  { framework: 'laravel', title: 'Laravel', detail: 'PHP backend' },
];

export const DESKTOP_STARTERS: Array<{
  framework: DesktopScaffoldFramework;
  title: string;
  detail: string;
}> = [
  { framework: 'tauri', title: 'Tauri', detail: 'Rust desktop app' },
  { framework: 'electron', title: 'Electron', detail: 'TypeScript desktop app' },
];

export const EXTENSION_STARTERS: Array<{
  framework: ExtensionScaffoldFramework;
  title: string;
  detail: string;
}> = [
  { framework: 'vscode-extension', title: 'VS Code Extension', detail: 'TypeScript extension' },
];

export const AGENT_STARTERS: Array<{
  framework: AgentScaffoldFramework;
  title: string;
  detail: string;
}> = [
  ...(EXECUTABLE_CREATE_ENTRIES.some(
    (entry) => entry.plannerFramework === 'microsoft-agent-framework'
  )
    ? [
        {
          framework: 'microsoft-agent-framework' as const,
          title: 'Microsoft Agent Framework',
          detail: 'Governed Python or .NET agent',
        },
      ]
    : []),
  ...(EXECUTABLE_CREATE_ENTRIES.some((entry) => entry.plannerFramework === 'openai-agents')
    ? [
        {
          framework: 'openai-agents' as const,
          title: 'OpenAI Agents SDK',
          detail: 'Governed Python or TypeScript agent',
        },
      ]
    : []),
];

export const GATEWAY_STARTERS: Array<{
  framework: GatewayScaffoldFramework;
  title: string;
  detail: string;
}> = EXECUTABLE_CREATE_ENTRIES.some((entry) => entry.category === 'gateway')
  ? [
      {
        framework: 'openrouter',
        title: 'OpenRouter AI Gateway',
        detail: 'Source-ready TypeScript or Python gateway',
      },
    ]
  : [];

export const FRONTEND_STARTERS: Array<{
  framework: FrontendScaffoldFramework;
  title: string;
  detail: string;
}> = [
  { framework: 'nextjs', title: 'Next.js', detail: 'React app' },
  { framework: 'remix', title: 'Remix', detail: 'React app' },
  { framework: 'vite-react', title: 'Vite React', detail: 'React starter' },
  { framework: 'vite-vue', title: 'Vite Vue', detail: 'Vue starter' },
  { framework: 'vite-svelte', title: 'Vite Svelte', detail: 'Svelte starter' },
  { framework: 'vite-solid', title: 'Vite Solid', detail: 'Solid starter' },
  { framework: 'vite-vanilla', title: 'Vite Vanilla', detail: 'Vanilla TS' },
  { framework: 'nuxt', title: 'Nuxt', detail: 'Vue app' },
  { framework: 'angular', title: 'Angular', detail: 'TypeScript app' },
  { framework: 'astro', title: 'Astro', detail: 'Content app' },
  { framework: 'sveltekit', title: 'SvelteKit', detail: 'Svelte app' },
];

export const SCAFFOLD_STARTERS = [
  ...BACKEND_STARTERS,
  ...FRONTEND_STARTERS,
  ...DESKTOP_STARTERS,
  ...AGENT_STARTERS,
  ...EXTENSION_STARTERS,
] as Array<{ framework: ScaffoldFramework; title: string; detail: string }>;

export type ScaffoldCategory =
  | 'backend'
  | 'frontend'
  | 'desktop'
  | 'agent'
  | 'gateway'
  | 'extension';

export const SCAFFOLD_CATEGORY_LABELS: ReadonlyArray<{
  id: ScaffoldCategory;
  label: string;
}> = [
  { id: 'backend', label: 'Backend' },
  { id: 'frontend', label: 'Frontend' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'agent', label: 'AI Agent' },
  { id: 'gateway', label: 'AI Gateway' },
  { id: 'extension', label: 'Extension' },
];

export function scaffoldCategoryForFramework(framework: ScaffoldFramework): ScaffoldCategory {
  const category = EXECUTABLE_CREATE_ENTRIES.find(
    (entry) => entry.plannerFramework === framework
  )?.category;
  return SCAFFOLD_CATEGORY_LABELS.some((candidate) => candidate.id === category)
    ? (category as ScaffoldCategory)
    : 'backend';
}

export function isBackendScaffoldFramework(
  framework: ScaffoldFramework
): framework is BackendScaffoldFramework {
  return BACKEND_STARTERS.some((starter) => starter.framework === framework);
}

export function isFrontendScaffoldFramework(
  framework: ScaffoldFramework
): framework is FrontendScaffoldFramework {
  return FRONTEND_STARTERS.some((starter) => starter.framework === framework);
}

export type WorkspaceBootstrapProfile =
  | 'minimal'
  | 'python-only'
  | 'node-only'
  | 'go-only'
  | 'java-only'
  | 'dotnet-only'
  | 'polyglot'
  | 'enterprise';

export function defaultBootstrapProfileForFramework(
  framework: ScaffoldFramework
): WorkspaceBootstrapProfile {
  const entries = [
    ...createContract.nativeCreate,
    ...createContract.officialCreate.filter((entry) => entry.canExecuteCreate),
  ] as Array<{ plannerFramework: string; runtime: string }>;
  const runtime = entries.find((entry) => entry.plannerFramework === framework)?.runtime;
  return (
    (
      {
        python: 'python-only',
        node: 'node-only',
        go: 'go-only',
        java: 'java-only',
        dotnet: 'dotnet-only',
      } as Partial<Record<string, WorkspaceBootstrapProfile>>
    )[runtime ?? ''] ?? 'minimal'
  );
}

export function defaultBootstrapProfileForKit(
  kit: string,
  fallbackFramework: ScaffoldFramework
): WorkspaceBootstrapProfile {
  const runtime = EXECUTABLE_CREATE_ENTRIES.find((entry) => entry.id === kit)?.runtime;
  return (
    (
      {
        python: 'python-only',
        node: 'node-only',
        go: 'go-only',
        java: 'java-only',
        dotnet: 'dotnet-only',
      } as Partial<Record<string, WorkspaceBootstrapProfile>>
    )[runtime ?? ''] ?? defaultBootstrapProfileForFramework(fallbackFramework)
  );
}
