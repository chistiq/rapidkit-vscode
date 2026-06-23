import {
  defaultKitForFramework,
  inferCreationNames,
  inferFrameworkFromCreationPrompt,
  inferPolyglotCompanionProject,
  inferWorkspaceProfileFromCreationPrompt,
  type AICreateProfile,
  type CreationStackIntent,
} from './creationStackIntent';
import { isFrontendScaffoldFramework, type ScaffoldFramework } from './scaffoldKits';

type HeuristicModuleRule = {
  slug: string;
  keywords: string[];
};

const MODULE_RULES: HeuristicModuleRule[] = [
  { slug: 'free/auth/core', keywords: ['auth', 'login', 'jwt', 'session', 'user management'] },
  { slug: 'free/auth/oauth', keywords: ['oauth', 'social login', 'google login', 'github login'] },
  {
    slug: 'free/database/db_postgres',
    keywords: ['postgres', 'postgresql', 'relational', 'sql database'],
  },
  { slug: 'free/database/db_mongo', keywords: ['mongo', 'mongodb', 'document store'] },
  { slug: 'free/cache/redis', keywords: ['redis', 'cache', 'rate limit', 'rate-limit', 'queue'] },
  {
    slug: 'free/billing/stripe_payment',
    keywords: ['stripe', 'payment', 'billing', 'subscription', 'saas'],
  },
  { slug: 'free/communication/email', keywords: ['email', 'smtp', 'mail'] },
  { slug: 'free/communication/notifications', keywords: ['notification', 'push', 'alert'] },
  { slug: 'free/ai/ai_assistant', keywords: ['ai', 'llm', 'gpt', 'chatbot', 'assistant', 'rag'] },
  { slug: 'free/business/storage', keywords: ['upload', 'file storage', 's3', 'blob'] },
  { slug: 'free/users/users_core', keywords: ['users', 'profiles', 'accounts'] },
  { slug: 'free/essentials/logging', keywords: ['logging', 'observability', 'metrics', 'tracing'] },
];

function inferSuggestedModules(promptLower: string, framework: ScaffoldFramework): string[] {
  if (
    framework === 'go' ||
    framework === 'springboot' ||
    framework === 'dotnet' ||
    isFrontendScaffoldFramework(framework)
  ) {
    return [];
  }

  const modules = new Set<string>(['free/essentials/settings']);
  for (const rule of MODULE_RULES) {
    if (rule.keywords.some((keyword) => promptLower.includes(keyword))) {
      modules.add(rule.slug);
    }
  }

  if (
    promptLower.includes('database') ||
    promptLower.includes('persist') ||
    promptLower.includes('store data')
  ) {
    modules.add('free/database/db_postgres');
  }

  return [...modules].slice(0, 6);
}

export function buildHeuristicCreationDraft(
  prompt: string,
  mode: 'workspace' | 'project',
  frameworkHint?: string,
  stackIntent?: CreationStackIntent
): {
  type: 'workspace' | 'project';
  workspaceName: string;
  profile: AICreateProfile;
  installMethod: 'auto';
  framework: ScaffoldFramework;
  kit: string;
  projectName: string;
  suggestedModules: string[];
  description: string;
  secondaryProject?: {
    framework: ScaffoldFramework;
    kit: string;
    projectName: string;
  };
} {
  const trimmedPrompt = prompt.trim();
  const promptLower = trimmedPrompt.toLowerCase();
  const framework = inferFrameworkFromCreationPrompt(promptLower, frameworkHint, stackIntent);
  const names = inferCreationNames(trimmedPrompt, framework);
  const secondaryProject =
    mode === 'workspace'
      ? inferPolyglotCompanionProject(trimmedPrompt, framework, stackIntent)
      : undefined;

  return {
    type: mode,
    workspaceName: names.workspaceName,
    profile: inferWorkspaceProfileFromCreationPrompt(framework, promptLower, stackIntent),
    installMethod: 'auto',
    framework,
    kit: defaultKitForFramework(framework, promptLower),
    projectName: names.projectName,
    suggestedModules: inferSuggestedModules(promptLower, framework),
    description: trimmedPrompt.slice(0, 240),
    secondaryProject,
  };
}
