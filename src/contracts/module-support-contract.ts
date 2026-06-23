import type { ModuleSupportContract } from '../core/moduleSupportContract';

const MODULE_SUPPORT_SCHEMA_VERSION = 'rapidkit-module-support-v1';
const MODULE_CAPABLE_KIT_ORDER = ['fastapi.standard', 'fastapi.ddd', 'nestjs.standard'] as const;
const MODULE_UNSUPPORTED_BACKEND_FRAMEWORKS = new Set(['go', 'springboot', 'dotnet']);

const MODULE_SUPPORT_POLICY_NOTE =
  'RapidKit modules are Core-backed templates for FastAPI and NestJS backends only. Frontend scaffolds and extended backend kits use native package ecosystems.';

type RuntimeSurfaceModuleSlice = {
  moduleSuggestionFrameworks: string[];
  moduleUnsupportedFrameworks: string[];
  scaffoldKits: string[];
};

export function buildModuleSupportContractFromRuntimeSurface(
  surface: RuntimeSurfaceModuleSlice
): ModuleSupportContract {
  const moduleUnsupportedBackendProjectTypes = surface.moduleUnsupportedFrameworks.filter(
    (framework) => MODULE_UNSUPPORTED_BACKEND_FRAMEWORKS.has(framework)
  );
  const moduleUnsupportedFrontendProjectTypes = surface.moduleUnsupportedFrameworks.filter(
    (framework) => !MODULE_UNSUPPORTED_BACKEND_FRAMEWORKS.has(framework)
  );

  return {
    schemaVersion: MODULE_SUPPORT_SCHEMA_VERSION,
    moduleCapableProjectTypes: [...surface.moduleSuggestionFrameworks],
    moduleCapableKitIds: MODULE_CAPABLE_KIT_ORDER.filter((kitId) =>
      surface.scaffoldKits.includes(kitId)
    ),
    moduleUnsupportedBackendProjectTypes,
    moduleUnsupportedFrontendProjectTypes,
    policyNote: MODULE_SUPPORT_POLICY_NOTE,
  };
}
