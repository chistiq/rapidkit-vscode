/**
 * Dashboard/webview module policy — keep aligned with contracts/module-support.v1.json
 * and src/core/moduleSupportContract.ts (extension host).
 */
import moduleSupportContract from '../../../contracts/module-support.v1.json';

export type ModuleSupportedProjectType = 'fastapi' | 'nestjs';

type CapabilitySlice = {
  available?: boolean;
  moduleSupport?: boolean;
  commandMap?: Record<string, { status: string }>;
  supportedCommands?: string[];
};

/** Only these project types can install RapidKit modules. */
export const MODULE_CAPABLE_PROJECT_TYPES =
  moduleSupportContract.moduleCapableProjectTypes as ModuleSupportedProjectType[];

/** Extended backend kits without Core module marketplace support. */
export const MODULE_UNSUPPORTED_BACKEND_PROJECT_TYPES =
  moduleSupportContract.moduleUnsupportedBackendProjectTypes;

/** All frontend scaffold frameworks — no RapidKit module support. */
export const MODULE_UNSUPPORTED_FRONTEND_PROJECT_TYPES =
  moduleSupportContract.moduleUnsupportedFrontendProjectTypes;

/** Explicit deny-list used by UI heuristics when npm capabilities are unavailable. */
export const MODULE_UNSUPPORTED_PROJECT_TYPES = [
  ...MODULE_UNSUPPORTED_BACKEND_PROJECT_TYPES,
  ...MODULE_UNSUPPORTED_FRONTEND_PROJECT_TYPES,
] as const;

function isAddModuleSupported(capabilities?: CapabilitySlice): boolean {
  if (capabilities?.available !== true) {
    return false;
  }
  const entry = capabilities.commandMap?.add;
  if (entry) {
    return entry.status === 'supported';
  }
  return capabilities.supportedCommands?.includes('add') ?? false;
}

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

export function isModuleInstallSupported(
  projectType?: string,
  hasProjectSelected = false,
  projectCapabilities?: CapabilitySlice
): boolean {
  if (!hasProjectSelected) {
    return false;
  }
  if (projectCapabilities?.available === true) {
    return projectCapabilities.moduleSupport === true && isAddModuleSupported(projectCapabilities);
  }
  return isModuleSupportedProjectType(projectType);
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

export function isUnsupportedModuleProjectType(
  projectType?: string,
  projectCapabilities?: CapabilitySlice
): boolean {
  if (projectCapabilities?.available === true) {
    return !isModuleInstallSupported(projectType, true, projectCapabilities);
  }
  if (!projectType) {
    return false;
  }
  if (isExplicitlyUnsupportedModuleProjectType(projectType)) {
    return true;
  }
  return !isModuleSupportedProjectType(projectType);
}
