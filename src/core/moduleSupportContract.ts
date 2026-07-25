import * as fs from 'fs';
import * as path from 'path';

export type ModuleSupportContract = {
  schemaVersion: string;
  moduleCapableProjectTypes: string[];
  moduleCapableKitIds: string[];
  moduleUnsupportedBackendProjectTypes: string[];
  moduleUnsupportedFrontendProjectTypes: string[];
  policyNote: string;
};

export type ModuleSupportedProjectType = 'fastapi' | 'nestjs';

const EMBEDDED_MODULE_SUPPORT_CONTRACT: ModuleSupportContract = {
  schemaVersion: 'rapidkit-module-support-v1',
  moduleCapableProjectTypes: ['fastapi', 'nestjs'],
  moduleCapableKitIds: ['fastapi.standard', 'fastapi.ddd', 'nestjs.standard'],
  moduleUnsupportedBackendProjectTypes: ['go', 'springboot', 'dotnet'],
  moduleUnsupportedFrontendProjectTypes: [
    'nextjs',
    'remix',
    'vite-react',
    'vite-vue',
    'vite-svelte',
    'vite-solid',
    'vite-vanilla',
    'nuxt',
    'angular',
    'astro',
    'sveltekit',
  ],
  policyNote:
    'RapidKit Core modules are Core-backed templates for FastAPI and NestJS backends only. Frontend scaffolds and extended backend kits use native package ecosystems.',
};

let cachedContract: ModuleSupportContract | null = null;

function resolveModuleSupportContractPath(): string {
  const explicitPath = process.env.RAPIDKIT_MODULE_SUPPORT_CONTRACT;
  if (explicitPath?.trim()) {
    return path.resolve(explicitPath.trim());
  }

  const candidates = [
    path.resolve(__dirname, '../../contracts/module-support.v1.json'),
    path.resolve(process.cwd(), 'contracts', 'module-support.v1.json'),
    path.resolve(process.cwd(), '..', 'contracts', 'module-support.v1.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function loadModuleSupportContract(): ModuleSupportContract {
  if (cachedContract) {
    return cachedContract;
  }

  const contractPath = resolveModuleSupportContractPath();
  if (!fs.existsSync(contractPath)) {
    console.warn(
      `[Workspai] Module support contract not found at ${contractPath}; using embedded defaults.`
    );
    cachedContract = EMBEDDED_MODULE_SUPPORT_CONTRACT;
    return cachedContract;
  }

  try {
    cachedContract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as ModuleSupportContract;
    return cachedContract;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[Workspai] Failed to read module support contract from ${contractPath}: ${message}. Using embedded defaults.`
    );
    cachedContract = EMBEDDED_MODULE_SUPPORT_CONTRACT;
    return cachedContract;
  }
}

export function readModuleSupportContract(): ModuleSupportContract {
  return loadModuleSupportContract();
}

export const MODULE_CAPABLE_PROJECT_TYPES = loadModuleSupportContract()
  .moduleCapableProjectTypes as ModuleSupportedProjectType[];
export const MODULE_CAPABLE_KIT_IDS = loadModuleSupportContract().moduleCapableKitIds;
export const MODULE_UNSUPPORTED_BACKEND_PROJECT_TYPES =
  loadModuleSupportContract().moduleUnsupportedBackendProjectTypes;
export const MODULE_UNSUPPORTED_FRONTEND_PROJECT_TYPES =
  loadModuleSupportContract().moduleUnsupportedFrontendProjectTypes;
export const MODULE_UNSUPPORTED_PROJECT_TYPES = [
  ...MODULE_UNSUPPORTED_BACKEND_PROJECT_TYPES,
  ...MODULE_UNSUPPORTED_FRONTEND_PROJECT_TYPES,
] as const;

export function isModuleSupportedProjectType(
  projectType?: string
): projectType is ModuleSupportedProjectType {
  return (
    projectType === MODULE_CAPABLE_PROJECT_TYPES[0] ||
    projectType === MODULE_CAPABLE_PROJECT_TYPES[1]
  );
}

export function isExplicitlyUnsupportedModuleProjectType(projectType?: string): boolean {
  if (!projectType) {
    return false;
  }
  return (MODULE_UNSUPPORTED_PROJECT_TYPES as readonly string[]).includes(projectType);
}

export function isModuleCapableKit(kitId?: string | null): boolean {
  if (!kitId?.trim()) {
    return false;
  }
  return MODULE_CAPABLE_KIT_IDS.includes(kitId.trim());
}

export function isModuleInstallSupportedForProjectType(projectType?: string): boolean {
  return isModuleSupportedProjectType(projectType);
}

export function isUnsupportedModuleProjectType(projectType?: string): boolean {
  if (!projectType) {
    return false;
  }
  if (isExplicitlyUnsupportedModuleProjectType(projectType)) {
    return true;
  }
  return !isModuleSupportedProjectType(projectType);
}

export function getProjectFrameworkLabel(projectType?: string): string {
  switch (projectType) {
    case 'fastapi':
      return 'FastAPI';
    case 'nestjs':
      return 'NestJS';
    case 'go':
      return 'Go';
    case 'springboot':
      return 'Spring Boot';
    case 'dotnet':
      return '.NET';
    case 'nextjs':
      return 'Next.js';
    case 'remix':
      return 'Remix';
    case 'vite-react':
      return 'Vite React';
    case 'vite-vue':
      return 'Vite Vue';
    case 'vite-svelte':
      return 'Vite Svelte';
    case 'vite-solid':
      return 'Vite Solid';
    case 'vite-vanilla':
      return 'Vite Vanilla';
    case 'nuxt':
      return 'Nuxt';
    case 'angular':
      return 'Angular';
    case 'astro':
      return 'Astro';
    case 'sveltekit':
      return 'SvelteKit';
    default:
      return 'This project type';
  }
}
