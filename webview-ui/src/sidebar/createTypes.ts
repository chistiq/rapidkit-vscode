/**
 * Create-tab types + option tables (roadmap 2.11d).
 *
 * Mirrors the `AICreationPlan` host contract and the manual-create form options
 * that the raw-HTML sidebar exposed, so the React port is protocol-faithful.
 */

import createContract from '@workspai-contracts/create-planner-capabilities.v1.json';

export interface CreationPlanSecondaryProject {
  framework: string;
  kit: string;
  projectName: string;
}

export interface CreationPlan {
  type?: 'workspace' | 'project';
  workspaceName: string;
  profile: string;
  installMethod?: string;
  framework: string;
  kit: string;
  projectName: string;
  suggestedModules: string[];
  description?: string;
  secondaryProject?: CreationPlanSecondaryProject;
  authorization?: {
    schemaVersion: 'workspai.create-plan-authorization.v1';
    planId: string;
    planHash: string;
    issuedAt: string;
    expiresAt: string;
  };
}

export interface CreatedProject {
  name?: string;
  framework?: string;
  kit?: string;
  path?: string;
}

export type CreateGuidanceAction =
  | 'none'
  | 'plan-workspace'
  | 'plan-project'
  | 'adopt-project'
  | 'import-project'
  | 'import-workspace'
  | 'continue-in-agent';

export type CreateMessage =
  | { id: string; role: 'user' | 'ai'; kind: 'text'; text: string }
  | { id: string; role: 'ai'; kind: 'thinking'; label: string }
  | { id: string; role: 'ai'; kind: 'progress'; title: string; detail?: string }
  | {
      id: string;
      role: 'ai';
      kind: 'guidance';
      response: string;
      intent: string;
      confidence: 'high' | 'medium' | 'low';
      action: CreateGuidanceAction;
      request: string;
    }
  | {
      id: string;
      role: 'ai';
      kind: 'plan';
      plan: CreationPlan;
      planSource?: 'llm' | 'heuristic';
      resolved?: boolean;
    }
  | {
      id: string;
      role: 'ai';
      kind: 'done';
      workspacePath?: string;
      projects?: CreatedProject[];
    }
  | {
      id: string;
      role: 'ai';
      kind: 'manual-done';
      mode: 'workspace' | 'project';
      name?: string;
      kit?: string;
      summary?: string;
      profile?: string;
      workspacePath?: string;
      projectPath?: string;
    }
  | {
      id: string;
      role: 'ai';
      kind: 'error';
      error: string;
      unsupportedStack?: boolean;
      failureCode?: string;
      setupRequired?: boolean;
      retryable?: boolean;
      retryPlan?: CreationPlan;
    };

export type CreateSessionStatus = 'planning' | 'ready' | 'running' | 'done' | 'error';

export interface CreateSession {
  sessionId: string;
  title: string;
  target: 'workspace' | 'project';
  method: 'ai' | 'manual';
  status: CreateSessionStatus;
  messages: CreateMessage[];
  createdAt: string;
  updatedAt: string;
}

export const STACK_FOCUS_OPTIONS = [
  'Any stack',
  'Frontend',
  'Backend API',
  'Full-stack',
  'AI Agent',
  'Enterprise',
];

export const PROFILE_OPTIONS: { value: string; label: string }[] = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'python-only', label: 'Python runtime' },
  { value: 'node-only', label: 'Node only' },
  { value: 'go-only', label: 'Go runtime' },
  { value: 'java-only', label: 'Java runtime' },
  { value: 'dotnet-only', label: '.NET runtime' },
  { value: 'polyglot', label: 'Polyglot' },
  { value: 'enterprise', label: 'Enterprise' },
];

export type CreateKitCategory =
  | 'backend'
  | 'frontend'
  | 'desktop'
  | 'agent'
  | 'gateway'
  | 'extension';

type ContractCreateEntry = {
  id: string;
  plannerFramework: string;
  runtime: string;
  category: string;
  canExecuteCreate?: boolean;
};

const KIT_LABELS: Record<string, string> = {
  'fastapi.standard': 'FastAPI Standard',
  'fastapi.ddd': 'FastAPI DDD',
  'nestjs.standard': 'NestJS Standard',
  'springboot.standard': 'Spring Boot Standard',
  'gofiber.standard': 'Go Fiber Standard',
  'gogin.standard': 'Go Gin Standard',
  'dotnet.webapi.clean': 'ASP.NET Core Clean Web API',
  'rust.axum': 'Rust Axum',
  'php.laravel': 'Laravel',
  'agent.microsoft.python': 'Microsoft Agent Framework · Python',
  'agent.microsoft.dotnet': 'Microsoft Agent Framework · .NET',
  'agent.openai.python': 'OpenAI Agents SDK · Python',
  'agent.openai.typescript': 'OpenAI Agents SDK · TypeScript',
  'gateway.openrouter.typescript': 'OpenRouter AI Gateway · TypeScript',
  'gateway.openrouter.python': 'OpenRouter AI Gateway · Python',
  'frontend.nextjs': 'Next.js',
  'frontend.remix': 'React Router',
  'frontend.vite-react': 'React + Vite',
  'frontend.vite-vue': 'Vue + Vite',
  'frontend.vite-svelte': 'Svelte + Vite',
  'frontend.vite-solid': 'Solid + Vite',
  'frontend.vite-vanilla': 'Vite',
  'frontend.nuxt': 'Nuxt',
  'frontend.angular': 'Angular',
  'frontend.astro': 'Astro',
  'frontend.sveltekit': 'SvelteKit',
  'desktop.tauri': 'Tauri Desktop',
  'desktop.electron': 'Electron Forge',
  'extension.vscode': 'VS Code Extension',
};

const EXECUTABLE_CREATE_ENTRIES = [
  ...(createContract.nativeCreate as ContractCreateEntry[]),
  ...(createContract.officialCreate as ContractCreateEntry[]).filter(
    (entry) => entry.canExecuteCreate
  ),
];

export const CREATE_KIT_OPTIONS = EXECUTABLE_CREATE_ENTRIES.filter((entry) =>
  ['backend', 'frontend', 'desktop', 'agent', 'gateway', 'extension'].includes(entry.category)
).map((entry) => ({
  value: entry.id,
  label: KIT_LABELS[entry.id] ?? entry.id,
  framework: entry.plannerFramework,
  runtime: entry.runtime,
  category: entry.category as CreateKitCategory,
}));

/** @deprecated Use CREATE_KIT_OPTIONS; retained for label lookup compatibility. */
export const FRAMEWORK_OPTIONS: { value: string; label: string }[] = CREATE_KIT_OPTIONS.map(
  ({ value, label }) => ({ value, label })
);

export type ManualProjectInput = {
  mode: 'project';
  name: string;
  framework: string;
  kit: string;
};
