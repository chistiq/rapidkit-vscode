type AICreateFramework = 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';
type AICreateProfile =
  | 'minimal'
  | 'python-only'
  | 'node-only'
  | 'go-only'
  | 'java-only'
  | 'dotnet-only'
  | 'polyglot'
  | 'enterprise';

type HeuristicModuleRule = {
  slug: string;
  keywords: string[];
};

const FRAMEWORK_KEYWORDS: Record<AICreateFramework, string[]> = {
  nestjs: ['nestjs', 'nest.js', 'nest js', 'typescript', 'typeorm', 'node.js', 'node '],
  fastapi: ['fastapi', 'python', 'uvicorn', 'pydantic', 'django'],
  go: [' golang', ' go ', 'gin ', 'fiber ', 'go.mod', 'go service', 'go api'],
  springboot: ['spring boot', 'springboot', 'spring', 'java', 'kotlin', 'maven', 'gradle'],
  dotnet: ['dotnet', '.net', 'csharp', 'c#', 'asp.net', 'web api'],
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

function defaultProfileForFramework(framework: AICreateFramework): AICreateProfile {
  if (framework === 'nestjs') {
    return 'node-only';
  }
  if (framework === 'go') {
    return 'go-only';
  }
  if (framework === 'springboot') {
    return 'java-only';
  }
  if (framework === 'dotnet') {
    return 'polyglot';
  }
  return 'python-only';
}

function defaultKitForFramework(framework: AICreateFramework, promptLower: string): string {
  if (framework === 'nestjs') {
    return 'nestjs.standard';
  }
  if (framework === 'go') {
    return promptLower.includes('gin') ? 'gogin.standard' : 'gofiber.standard';
  }
  if (framework === 'springboot') {
    return 'springboot.standard';
  }
  if (framework === 'dotnet') {
    return 'dotnet.webapi.clean';
  }
  if (
    promptLower.includes('ddd') ||
    promptLower.includes('clean arch') ||
    promptLower.includes('domain driven') ||
    promptLower.includes('layered')
  ) {
    return 'fastapi.ddd';
  }
  return 'fastapi.standard';
}

function inferFrameworkFromPrompt(promptLower: string, frameworkHint?: string): AICreateFramework {
  if (
    frameworkHint === 'fastapi' ||
    frameworkHint === 'nestjs' ||
    frameworkHint === 'go' ||
    frameworkHint === 'springboot' ||
    frameworkHint === 'dotnet'
  ) {
    return frameworkHint;
  }

  let bestFramework: AICreateFramework = 'fastapi';
  let bestScore = 0;

  for (const [framework, keywords] of Object.entries(FRAMEWORK_KEYWORDS) as Array<
    [AICreateFramework, string[]]
  >) {
    const score = keywords.reduce((acc, keyword) => {
      return acc + (promptLower.includes(keyword) ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestFramework = framework;
    }
  }

  return bestFramework;
}

function inferSuggestedModules(promptLower: string, framework: AICreateFramework): string[] {
  if (framework === 'go' || framework === 'springboot' || framework === 'dotnet') {
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

function inferNames(
  prompt: string,
  framework: AICreateFramework
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
          'create',
          'build',
          'project',
          'workspace',
        ].includes(token)
    );

  const base =
    tokens.slice(0, 2).join('-') || (framework === 'nestjs' ? 'node-platform' : 'product-platform');
  return {
    workspaceName: base,
    projectName: `${tokens[0] || 'product'}-api`,
  };
}

export function buildHeuristicCreationDraft(
  prompt: string,
  mode: 'workspace' | 'project',
  frameworkHint?: string
): {
  type: 'workspace' | 'project';
  workspaceName: string;
  profile: AICreateProfile;
  installMethod: 'auto';
  framework: AICreateFramework;
  kit: string;
  projectName: string;
  suggestedModules: string[];
  description: string;
} {
  const trimmedPrompt = prompt.trim();
  const promptLower = trimmedPrompt.toLowerCase();
  const framework = inferFrameworkFromPrompt(promptLower, frameworkHint);
  const names = inferNames(trimmedPrompt, framework);

  return {
    type: mode,
    workspaceName: names.workspaceName,
    profile: defaultProfileForFramework(framework),
    installMethod: 'auto',
    framework,
    kit: defaultKitForFramework(framework, promptLower),
    projectName: names.projectName,
    suggestedModules: inferSuggestedModules(promptLower, framework),
    description: trimmedPrompt.slice(0, 240),
  };
}
