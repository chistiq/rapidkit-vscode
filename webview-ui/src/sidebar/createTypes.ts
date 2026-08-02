/**
 * Create-tab types + option tables (roadmap 2.11d).
 *
 * Mirrors the `AICreationPlan` host contract and the manual-create form options
 * that the raw-HTML sidebar exposed, so the React port is protocol-faithful.
 */

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
}

export interface CreatedProject {
  name?: string;
  framework?: string;
  kit?: string;
  path?: string;
}

export type CreateMessage =
  | { id: string; role: 'user' | 'ai'; kind: 'text'; text: string }
  | { id: string; role: 'ai'; kind: 'thinking'; label: string }
  | { id: string; role: 'ai'; kind: 'progress'; title: string; detail?: string }
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

export const FRAMEWORK_OPTIONS: { value: string; label: string }[] = [
  { value: 'fastapi-standard', label: 'FastAPI Standard Kit' },
  { value: 'fastapi-ddd', label: 'FastAPI DDD Kit' },
  { value: 'nestjs-standard', label: 'NestJS Standard Kit' },
  { value: 'springboot-standard', label: 'Spring Boot Standard Kit' },
  { value: 'gofiber-standard', label: 'Go Fiber Standard Kit' },
  { value: 'gogin-standard', label: 'Go Gin Standard Kit' },
  { value: 'dotnet-webapi-clean', label: 'ASP.NET Core Clean Web API' },
  { value: 'rust-axum', label: 'Rust Axum' },
  { value: 'php-laravel', label: 'Laravel' },
  { value: 'nextjs', label: 'Next.js' },
  { value: 'react-router', label: 'React Router' },
  { value: 'vite-react', label: 'React + Vite' },
  { value: 'vite-vue', label: 'Vue + Vite' },
  { value: 'vite-svelte', label: 'Svelte + Vite' },
  { value: 'vite-solid', label: 'Solid + Vite' },
  { value: 'vite-vanilla', label: 'Vite' },
  { value: 'nuxt', label: 'Nuxt' },
  { value: 'angular', label: 'Angular' },
  { value: 'astro', label: 'Astro' },
  { value: 'sveltekit', label: 'SvelteKit' },
  { value: 'desktop-tauri', label: 'Tauri Desktop' },
  { value: 'desktop-electron', label: 'Electron Forge' },
  { value: 'vscode-extension', label: 'VS Code Extension' },
];
