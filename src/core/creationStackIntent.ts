import {
  defaultScaffoldKitForFramework,
  defaultWorkspaceProfileForKit,
  defaultWorkspaceProfileForFramework,
  isAgentScaffoldFramework,
  isBackendScaffoldFramework,
  isScaffoldFramework,
  isDesktopScaffoldFramework,
  isExtensionScaffoldFramework,
  isFrontendScaffoldFramework,
  scaffoldRuntimeCandidatesForKit,
  scaffoldRuntimeForFramework,
  type ScaffoldFramework,
} from './scaffoldKits';

export type AICreateProfile =
  | 'minimal'
  | 'python-only'
  | 'node-only'
  | 'go-only'
  | 'java-only'
  | 'dotnet-only'
  | 'polyglot'
  | 'enterprise';

export type CreationStackIntent =
  | 'balanced'
  | 'frontend'
  | 'backend'
  | 'agent'
  | 'polyglot'
  | 'enterprise';

const FRAMEWORK_KEYWORDS: Record<ScaffoldFramework, string[]> = {
  openrouter: ['openrouter', 'ai gateway', 'model gateway', 'llm gateway'],
  'openai-agents': ['openai agents', 'openai agent', 'agents sdk'],
  'microsoft-agent-framework': [
    'microsoft agent framework',
    'ai agent',
    'agent workflow',
    'agent automation',
    'agent runtime',
  ],
  nestjs: ['nestjs', 'nest.js', 'nest js', 'typeorm', 'node api', 'node service', 'typescript api'],
  fastapi: ['fastapi', 'python', 'uvicorn', 'pydantic', 'django', 'flask'],
  go: [' golang', ' go ', 'gin ', 'fiber ', 'go.mod', 'go service', 'go api', 'golang'],
  springboot: ['spring boot', 'springboot', 'spring', 'java', 'kotlin', 'maven', 'gradle'],
  dotnet: ['dotnet', '.net', 'csharp', 'c#', 'asp.net', 'web api', 'nuget'],
  rust: ['rust', 'axum', 'cargo'],
  laravel: ['laravel', 'php laravel'],
  tauri: ['tauri', 'tauri app', 'rust desktop'],
  electron: ['electron', 'electron forge', 'electron app'],
  'vscode-extension': [
    'vscode extension',
    'vs code extension',
    'visual studio code extension',
    'editor extension',
  ],
  nextjs: ['next.js', 'nextjs', 'next js', 'react app', 'app router', 'next app'],
  remix: ['remix', 'remix.run', 'remix app'],
  'vite-react': [
    'vite react',
    'react vite',
    'react spa',
    'react frontend',
    'react dashboard',
    'react ui',
  ],
  'vite-vue': ['vite vue', 'vue vite', 'vue spa', 'vue frontend', 'vue app'],
  'vite-svelte': ['vite svelte', 'svelte vite', 'svelte app'],
  'vite-solid': ['vite solid', 'solidjs', 'solid js', 'solid app'],
  'vite-vanilla': ['vite vanilla', 'vanilla ts', 'static site', 'vanilla frontend'],
  nuxt: ['nuxt', 'nuxtjs', 'nuxt.js', 'nuxt app'],
  angular: ['angular', 'angular app'],
  astro: ['astro', 'content site', 'marketing site', 'landing pages'],
  sveltekit: ['sveltekit', 'svelte kit', 'sveltekit app'],
};

const GENERIC_FRONTEND_SIGNALS = [
  'frontend',
  'front-end',
  'front end',
  'web app',
  'webapp',
  ' ui ',
  'user interface',
  'dashboard',
  'admin console',
  'admin panel',
  'design system',
  'component library',
  'single page',
  'spa ',
  'client app',
  'browser app',
];

const GENERIC_BACKEND_SIGNALS = [
  'backend',
  'back-end',
  'back end',
  ' api ',
  'rest api',
  'graphql',
  'microservice',
  'micro-service',
  'service layer',
  'server side',
];

const GENERIC_AGENT_SIGNALS = [
  'ai agent',
  'agent workflow',
  'agent runtime',
  'agent automation',
  'multi-agent',
  'multi agent',
  'microsoft agent framework',
];

const POLYGLOT_SIGNALS = [
  'full-stack',
  'full stack',
  'fullstack',
  'polyglot',
  'frontend and backend',
  'front and back',
  'web + api',
  'app + api',
  'multiple runtimes',
  'multi-runtime',
];

const EXPLICIT_MULTI_RUNTIME_SIGNALS = [
  'polyglot',
  'multiple runtimes',
  'multi-runtime',
  'multi runtime',
];

const ENTERPRISE_SIGNALS = [
  'enterprise',
  'governance',
  'compliance',
  'multi-team',
  'multi team',
  'release gate',
  'audit',
  'soc2',
  'regulated',
];

export function defaultProfileForFramework(framework: ScaffoldFramework): AICreateProfile {
  return defaultWorkspaceProfileForFramework(framework);
}

export function defaultKitForFramework(framework: ScaffoldFramework, promptLower: string): string {
  if (framework === 'microsoft-agent-framework') {
    return ['.net', 'dotnet', 'csharp', 'c#'].some((signal) => promptLower.includes(signal))
      ? 'agent.microsoft.dotnet'
      : 'agent.microsoft.python';
  }
  if (framework === 'openai-agents') {
    return ['typescript', ' node', 'nodejs'].some((signal) => promptLower.includes(signal))
      ? 'agent.openai.typescript'
      : 'agent.openai.python';
  }
  if (framework === 'openrouter') {
    return promptLower.includes('python')
      ? 'gateway.openrouter.python'
      : 'gateway.openrouter.typescript';
  }
  if (framework === 'go') {
    return promptLower.includes('gin') ? 'gogin.standard' : 'gofiber.standard';
  }
  if (
    framework === 'fastapi' &&
    ['ddd', 'clean arch', 'domain driven', 'layered'].some((signal) => promptLower.includes(signal))
  ) {
    return 'fastapi.ddd';
  }
  return defaultScaffoldKitForFramework(framework);
}

function countSignals(promptLower: string, signals: string[]): number {
  return signals.reduce((count, signal) => count + (promptLower.includes(signal) ? 1 : 0), 0);
}

function countFrameworkSignals(promptLower: string, kind: 'frontend' | 'backend'): number {
  let count = 0;
  for (const [framework, keywords] of Object.entries(FRAMEWORK_KEYWORDS) as Array<
    [ScaffoldFramework, string[]]
  >) {
    if (kind === 'frontend' && !isFrontendScaffoldFramework(framework)) {
      continue;
    }
    if (kind === 'backend' && !isBackendScaffoldFramework(framework)) {
      continue;
    }
    count += keywords.reduce((acc, keyword) => acc + (promptLower.includes(keyword) ? 1 : 0), 0);
  }
  return count;
}

export function inferStackIntentFromPrompt(
  promptLower: string,
  explicitIntent?: CreationStackIntent
): CreationStackIntent | undefined {
  if (explicitIntent && explicitIntent !== 'balanced') {
    return explicitIntent;
  }

  const enterpriseScore = countSignals(promptLower, ENTERPRISE_SIGNALS);
  const agentScore = countSignals(promptLower, GENERIC_AGENT_SIGNALS);
  const polyglotScore = countSignals(promptLower, POLYGLOT_SIGNALS);
  const frontendScore =
    countSignals(promptLower, GENERIC_FRONTEND_SIGNALS) +
    countFrameworkSignals(promptLower, 'frontend');
  const backendScore =
    countSignals(promptLower, GENERIC_BACKEND_SIGNALS) +
    countFrameworkSignals(promptLower, 'backend');

  // An explicit agent request is its own runtime category, not a backend synonym.
  if (agentScore > 0) {
    return 'agent';
  }
  // Full-stack signals win over governance-only enterprise cues (e.g. governance portal + Next + Nest).
  if (polyglotScore > 0 || (frontendScore > 0 && backendScore > 0)) {
    return 'polyglot';
  }
  if (enterpriseScore > 0) {
    return 'enterprise';
  }
  if (frontendScore > backendScore) {
    return 'frontend';
  }
  if (backendScore > frontendScore) {
    return 'backend';
  }
  return explicitIntent === 'balanced' ? 'balanced' : undefined;
}

function isScaffoldFrameworkHint(value: string | undefined): value is ScaffoldFramework {
  return isScaffoldFramework(value);
}

export function inferFrameworkFromCreationPrompt(
  promptLower: string,
  frameworkHint?: string,
  stackIntent?: CreationStackIntent
): ScaffoldFramework {
  if (isScaffoldFrameworkHint(frameworkHint)) {
    return frameworkHint;
  }
  if (
    promptLower.includes('openrouter') ||
    promptLower.includes('ai gateway') ||
    promptLower.includes('model gateway')
  ) {
    return 'openrouter';
  }
  if (promptLower.includes('openai agent') || promptLower.includes('openai agents')) {
    return 'openai-agents';
  }

  let bestFramework: ScaffoldFramework = 'nestjs';
  let bestScore = 0;

  for (const [framework, keywords] of Object.entries(FRAMEWORK_KEYWORDS) as Array<
    [ScaffoldFramework, string[]]
  >) {
    const score = keywords.reduce(
      (acc, keyword) => acc + (promptLower.includes(keyword) ? 1 : 0),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      bestFramework = framework;
    }
  }

  if (bestScore > 0) {
    return bestFramework;
  }

  const resolvedIntent = inferStackIntentFromPrompt(promptLower, stackIntent);
  if (resolvedIntent === 'agent') {
    return 'microsoft-agent-framework';
  }
  if (resolvedIntent === 'frontend') {
    if (promptLower.includes('vue')) {
      return 'vite-vue';
    }
    if (promptLower.includes('svelte')) {
      return 'sveltekit';
    }
    if (promptLower.includes('angular')) {
      return 'angular';
    }
    if (promptLower.includes('marketing') || promptLower.includes('landing')) {
      return 'astro';
    }
    return 'nextjs';
  }
  if (resolvedIntent === 'backend') {
    if (promptLower.includes('python')) {
      return 'fastapi';
    }
    if (promptLower.includes('java') || promptLower.includes('spring')) {
      return 'springboot';
    }
    if (promptLower.includes('go') || promptLower.includes('golang')) {
      return 'go';
    }
    if (promptLower.includes('.net') || promptLower.includes('csharp')) {
      return 'dotnet';
    }
    if (promptLower.includes('laravel')) {
      return 'laravel';
    }
    if (promptLower.includes('rust') || promptLower.includes('axum')) {
      return 'rust';
    }
    return 'nestjs';
  }
  if (resolvedIntent === 'polyglot') {
    if (promptLower.includes('python') || promptLower.includes('fastapi')) {
      return 'fastapi';
    }
    if (promptLower.includes('next') || promptLower.includes('react')) {
      return 'nextjs';
    }
    return 'nestjs';
  }

  if (countSignals(promptLower, GENERIC_FRONTEND_SIGNALS) > 0) {
    return promptLower.includes('next') ? 'nextjs' : 'vite-react';
  }
  if (countSignals(promptLower, GENERIC_BACKEND_SIGNALS) > 0) {
    return promptLower.includes('python') ? 'fastapi' : 'nestjs';
  }

  return 'nestjs';
}

export function inferWorkspaceProfileFromCreationPrompt(
  framework: ScaffoldFramework,
  promptLower: string,
  stackIntent?: CreationStackIntent,
  companionFramework?: ScaffoldFramework,
  primaryKit?: string,
  companionKit?: string
): AICreateProfile {
  const resolvedIntent = inferStackIntentFromPrompt(promptLower, stackIntent);
  if (resolvedIntent === 'enterprise') {
    return 'enterprise';
  }
  const primaryRuntime =
    (primaryKit && scaffoldRuntimeCandidatesForKit(primaryKit)[0]) ??
    scaffoldRuntimeForFramework(framework);
  const companionRuntime = companionFramework
    ? ((companionKit && scaffoldRuntimeCandidatesForKit(companionKit)[0]) ??
      scaffoldRuntimeForFramework(companionFramework))
    : undefined;
  if (
    (companionRuntime && companionRuntime !== primaryRuntime) ||
    countSignals(promptLower, EXPLICIT_MULTI_RUNTIME_SIGNALS) > 0
  ) {
    return 'polyglot';
  }
  return primaryKit
    ? defaultWorkspaceProfileForKit(primaryKit, framework)
    : defaultProfileForFramework(framework);
}

export function projectNameSuffixForFramework(
  framework: ScaffoldFramework
): 'app' | 'api' | 'service' {
  if (
    isFrontendScaffoldFramework(framework) ||
    isDesktopScaffoldFramework(framework) ||
    isExtensionScaffoldFramework(framework) ||
    isAgentScaffoldFramework(framework)
  ) {
    return 'app';
  }
  if (framework === 'go' || framework === 'springboot' || framework === 'dotnet') {
    return 'service';
  }
  return 'api';
}

export function inferCreationNames(
  prompt: string,
  framework: ScaffoldFramework
): {
  workspaceName: string;
  projectName: string;
} {
  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .filter(
      (token) =>
        ![
          'with',
          'and',
          'the',
          'for',
          'api',
          'service',
          'backend',
          'frontend',
          'create',
          'build',
          'project',
          'workspace',
          'app',
          'web',
          'site',
        ].includes(token)
    );

  const suffix = projectNameSuffixForFramework(framework);
  const base =
    tokens.slice(0, 2).join('-') ||
    (isFrontendScaffoldFramework(framework) ? 'web-platform' : 'product-platform');

  return {
    workspaceName: base,
    projectName: `${tokens[0] || 'product'}-${suffix}`,
  };
}

function scoreFrameworkInPrompt(promptLower: string, framework: ScaffoldFramework): number {
  return FRAMEWORK_KEYWORDS[framework].reduce(
    (acc, keyword) => acc + (promptLower.includes(keyword) ? 1 : 0),
    0
  );
}

/**
 * Return only frameworks that the user named explicitly. Generic words such as
 * "frontend" and "API" intentionally do not participate: those are useful for
 * selecting defaults, but must not override a valid model choice.
 */
export function inferExplicitCreationFrameworks(prompt: string): ScaffoldFramework[] {
  const promptLower = prompt.trim().toLowerCase();
  if (!promptLower) {
    return [];
  }

  return (Object.keys(FRAMEWORK_KEYWORDS) as ScaffoldFramework[]).filter(
    (framework) => scoreFrameworkInPrompt(promptLower, framework) > 0
  );
}

function bestFrontendFrameworkInPrompt(promptLower: string): ScaffoldFramework | undefined {
  let bestFramework: ScaffoldFramework | undefined;
  let bestScore = 0;

  for (const framework of Object.keys(FRAMEWORK_KEYWORDS) as ScaffoldFramework[]) {
    if (!isFrontendScaffoldFramework(framework)) {
      continue;
    }
    const score = scoreFrameworkInPrompt(promptLower, framework);
    if (score > bestScore) {
      bestScore = score;
      bestFramework = framework;
    }
  }

  if (bestFramework) {
    return bestFramework;
  }

  if (countSignals(promptLower, GENERIC_FRONTEND_SIGNALS) > 0) {
    return inferFrameworkFromCreationPrompt(promptLower, undefined, 'frontend');
  }

  return undefined;
}

function bestBackendFrameworkInPrompt(promptLower: string): ScaffoldFramework | undefined {
  let bestFramework: ScaffoldFramework | undefined;
  let bestScore = 0;

  for (const framework of Object.keys(FRAMEWORK_KEYWORDS) as ScaffoldFramework[]) {
    if (
      isFrontendScaffoldFramework(framework) ||
      isDesktopScaffoldFramework(framework) ||
      isExtensionScaffoldFramework(framework) ||
      isAgentScaffoldFramework(framework)
    ) {
      continue;
    }
    const score = scoreFrameworkInPrompt(promptLower, framework);
    if (score > bestScore) {
      bestScore = score;
      bestFramework = framework;
    }
  }

  if (bestFramework) {
    return bestFramework;
  }

  if (countSignals(promptLower, GENERIC_BACKEND_SIGNALS) > 0) {
    return inferFrameworkFromCreationPrompt(promptLower, undefined, 'backend');
  }

  return undefined;
}

export function inferPolyglotCompanionProject(
  prompt: string,
  primaryFramework: ScaffoldFramework,
  stackIntent?: CreationStackIntent
): { framework: ScaffoldFramework; kit: string; projectName: string } | undefined {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return undefined;
  }

  const promptLower = trimmedPrompt.toLowerCase();
  if (inferStackIntentFromPrompt(promptLower, stackIntent) !== 'polyglot') {
    return undefined;
  }

  const frontendFramework = bestFrontendFrameworkInPrompt(promptLower) ?? 'nextjs';
  // Node is guaranteed by the extension host and provides the smallest
  // dependency surface for delegated full-stack choices. Explicit Python,
  // Go, Java, .NET, Rust, or PHP wording still selects that runtime above.
  const backendFramework = bestBackendFrameworkInPrompt(promptLower) ?? 'nestjs';
  if (!frontendFramework || !backendFramework) {
    return undefined;
  }

  const primaryIsFrontend = isFrontendScaffoldFramework(primaryFramework);
  if (
    isDesktopScaffoldFramework(primaryFramework) ||
    isExtensionScaffoldFramework(primaryFramework) ||
    isAgentScaffoldFramework(primaryFramework)
  ) {
    return undefined;
  }
  const companionFramework = primaryIsFrontend ? backendFramework : frontendFramework;
  if (companionFramework === primaryFramework) {
    return undefined;
  }

  const names = inferCreationNames(trimmedPrompt, companionFramework);
  return {
    framework: companionFramework,
    kit: defaultKitForFramework(companionFramework, promptLower),
    projectName: names.projectName,
  };
}

export function profileRecommendationCopy(
  profile: AICreateProfile,
  framework: ScaffoldFramework
): string {
  const profileLabels: Record<AICreateProfile, string> = {
    minimal: 'Minimal',
    'python-only': 'Python',
    'node-only': 'Node.js',
    'go-only': 'Go',
    'java-only': 'Java',
    'dotnet-only': '.NET',
    polyglot: 'Polyglot',
    enterprise: 'Enterprise',
  };

  const frameworkLabel = isFrontendScaffoldFramework(framework)
    ? 'frontend'
    : framework === 'nestjs'
      ? 'Node.js'
      : framework;

  return `${profileLabels[profile]} profile aligns with ${frameworkLabel} bootstrap artifacts and workspace governance.`;
}
