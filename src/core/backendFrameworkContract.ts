export type StackConfidence = 'high' | 'medium' | 'low';
export type DetectedStack =
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'nestjs'
  | 'express'
  | 'koa'
  | 'go'
  | 'springboot'
  | 'rails'
  | 'dotnet'
  | 'unknown';

export interface StackDetection {
  stack: DetectedStack;
  confidence: StackConfidence;
}

export interface BackendImportHints {
  framework?: string;
  runtime?: string;
  confidenceLevel?: StackConfidence;
}

export interface BackendImportMarkerSignals {
  hasPyProject: boolean;
  hasGoMod: boolean;
  hasPomXml: boolean;
  hasGradle: boolean;
  hasGradleKts: boolean;
  hasCsproj?: boolean;
  hasSln?: boolean;
  hasPackageJson: boolean;
  hasNestDependency: boolean;
}

type BackendRuntime = 'python' | 'node' | 'go' | 'java' | 'ruby' | 'dotnet' | 'unknown';
type BackendKey =
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'python'
  | 'nestjs'
  | 'express'
  | 'fastify'
  | 'koa'
  | 'node'
  | 'gofiber'
  | 'gogin'
  | 'echo'
  | 'go'
  | 'springboot'
  | 'java'
  | 'rails'
  | 'ruby'
  | 'dotnet'
  | 'unknown';

interface BackendImportContractDescriptor {
  key: BackendKey;
  runtime: BackendRuntime;
  stack: DetectedStack;
  aliases: string[];
}

const BACKEND_IMPORT_CONTRACTS: Record<BackendKey, BackendImportContractDescriptor> = {
  fastapi: { key: 'fastapi', runtime: 'python', stack: 'fastapi', aliases: ['fastapi'] },
  django: { key: 'django', runtime: 'python', stack: 'django', aliases: ['django'] },
  flask: { key: 'flask', runtime: 'python', stack: 'flask', aliases: ['flask'] },
  python: { key: 'python', runtime: 'python', stack: 'unknown', aliases: ['python'] },
  nestjs: { key: 'nestjs', runtime: 'node', stack: 'nestjs', aliases: ['nestjs', 'nest'] },
  express: { key: 'express', runtime: 'node', stack: 'express', aliases: ['express'] },
  fastify: { key: 'fastify', runtime: 'node', stack: 'unknown', aliases: ['fastify'] },
  koa: { key: 'koa', runtime: 'node', stack: 'koa', aliases: ['koa'] },
  node: {
    key: 'node',
    runtime: 'node',
    stack: 'unknown',
    aliases: ['node', 'nodejs', 'typescript'],
  },
  gofiber: {
    key: 'gofiber',
    runtime: 'go',
    stack: 'go',
    aliases: ['gofiber', 'fiber', 'go-fiber', 'go/fiber'],
  },
  gogin: {
    key: 'gogin',
    runtime: 'go',
    stack: 'go',
    aliases: ['gogin', 'gin', 'go-gin', 'go/gin'],
  },
  echo: { key: 'echo', runtime: 'go', stack: 'go', aliases: ['echo'] },
  go: { key: 'go', runtime: 'go', stack: 'go', aliases: ['go', 'golang'] },
  springboot: {
    key: 'springboot',
    runtime: 'java',
    stack: 'springboot',
    aliases: ['springboot', 'spring', 'spring-boot'],
  },
  java: { key: 'java', runtime: 'java', stack: 'unknown', aliases: ['java'] },
  rails: {
    key: 'rails',
    runtime: 'ruby',
    stack: 'rails',
    aliases: ['rails', 'ruby on rails', 'ruby-on-rails'],
  },
  ruby: { key: 'ruby', runtime: 'ruby', stack: 'unknown', aliases: ['ruby'] },
  dotnet: {
    key: 'dotnet',
    runtime: 'dotnet',
    stack: 'dotnet',
    aliases: ['dotnet', 'aspnet', 'asp.net', 'csharp', 'c#'],
  },
  unknown: { key: 'unknown', runtime: 'unknown', stack: 'unknown', aliases: ['unknown'] },
};

const BACKEND_IMPORT_ALIAS_MAP = new Map<string, BackendKey>();
for (const descriptor of Object.values(BACKEND_IMPORT_CONTRACTS)) {
  for (const alias of descriptor.aliases) {
    BACKEND_IMPORT_ALIAS_MAP.set(alias, descriptor.key);
  }
}

function normalizeLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

export function normalizeBackendFrameworkLabel(raw: string | undefined | null): BackendKey {
  if (!raw) {
    return 'unknown';
  }

  return BACKEND_IMPORT_ALIAS_MAP.get(normalizeLabel(raw)) ?? 'unknown';
}

export function normalizeBackendRuntimeLabel(raw: string | undefined | null): BackendRuntime {
  const key = normalizeBackendFrameworkLabel(raw);
  if (key !== 'unknown') {
    return BACKEND_IMPORT_CONTRACTS[key].runtime;
  }

  return 'unknown';
}

export function detectStackFromBackendHints(hints: BackendImportHints): StackDetection {
  const confidence: StackConfidence =
    hints.confidenceLevel === 'high' ||
    hints.confidenceLevel === 'medium' ||
    hints.confidenceLevel === 'low'
      ? hints.confidenceLevel
      : 'low';

  const frameworkKey = normalizeBackendFrameworkLabel(hints.framework);
  if (frameworkKey !== 'unknown') {
    return {
      stack: BACKEND_IMPORT_CONTRACTS[frameworkKey].stack,
      confidence,
    };
  }

  const runtimeKey = normalizeBackendFrameworkLabel(hints.runtime);
  if (runtimeKey !== 'unknown') {
    return {
      stack: BACKEND_IMPORT_CONTRACTS[runtimeKey].stack,
      confidence,
    };
  }

  return { stack: 'unknown', confidence };
}

export function detectStackFromMarkerSignals(signals: BackendImportMarkerSignals): StackDetection {
  if (signals.hasPyProject) {
    return { stack: 'unknown', confidence: 'medium' };
  }

  if (signals.hasNestDependency) {
    return { stack: 'nestjs', confidence: 'high' };
  }

  if (signals.hasPackageJson) {
    return { stack: 'unknown', confidence: 'medium' };
  }

  if (signals.hasGoMod) {
    return detectStackFromBackendHints({ runtime: 'go', confidenceLevel: 'high' });
  }

  if (signals.hasPomXml || signals.hasGradle || signals.hasGradleKts) {
    return detectStackFromBackendHints({ framework: 'springboot', confidenceLevel: 'high' });
  }

  if (signals.hasCsproj || signals.hasSln) {
    return detectStackFromBackendHints({ framework: 'dotnet', confidenceLevel: 'high' });
  }

  return { stack: 'unknown', confidence: 'low' };
}
