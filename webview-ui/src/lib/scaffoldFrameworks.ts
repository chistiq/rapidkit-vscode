import type {
  BackendScaffoldFramework,
  FrontendScaffoldFramework,
  ScaffoldFramework,
} from '@/types';

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
];

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

export const SCAFFOLD_STARTERS = [...BACKEND_STARTERS, ...FRONTEND_STARTERS] as Array<{
  framework: ScaffoldFramework;
  title: string;
  detail: string;
}>;

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
  if (isFrontendScaffoldFramework(framework) || framework === 'nestjs') {
    return 'node-only';
  }
  if (framework === 'go') {
    return 'go-only';
  }
  if (framework === 'springboot') {
    return 'java-only';
  }
  if (framework === 'dotnet') {
    return 'dotnet-only';
  }
  return 'python-only';
}
