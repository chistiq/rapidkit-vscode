import type { CategoryInfo, ModuleData, ModulesCatalogMeta, WorkspaceStatus } from '@/types';
import type { DashboardScopeDescriptor } from '@/lib/dashboardScope';
import { ModuleBrowser } from '@/components/ModuleBrowser';

type DashboardModuleCatalogSurfaceName = 'console' | 'catalog';

export type DashboardModuleCatalogSurfaceProps = {
  surface: DashboardModuleCatalogSurfaceName;
  modules: ModuleData[];
  catalogMeta?: ModulesCatalogMeta | null;
  workspaceStatus: WorkspaceStatus;
  scope: DashboardScopeDescriptor;
  categoryInfo: CategoryInfo;
  modulesDisabled?: boolean;
  onCopyText: (text: string) => void;
  onRefresh: () => void;
  onInstall: (module: ModuleData) => void;
  onShowDetails: (module: ModuleData) => void;
  onAI: (module: ModuleData) => void;
  onModuleDiff?: (module: ModuleData) => void;
  onModuleRollback?: (module: ModuleData) => void;
  onModuleUninstall?: (module: ModuleData) => void;
  onProjectTerminal: () => void;
  onProjectInit: () => void;
  onProjectDev: () => void;
  onProjectStop: () => void;
  onProjectTest: () => void;
  onProjectDoctor: () => void;
  onProjectArchitecture: () => void;
  onProjectIncident: () => void;
  onProjectAI: () => void;
  onProjectRelease: () => void;
  onProjectImpact: () => void;
  onProjectBrowser: () => void;
  onProjectBuild: () => void;
};

export function DashboardModuleCatalogSurface({
  surface,
  modules,
  catalogMeta,
  workspaceStatus,
  scope,
  categoryInfo,
  modulesDisabled,
  onCopyText,
  onRefresh,
  onInstall,
  onShowDetails,
  onAI,
  onModuleDiff,
  onModuleRollback,
  onModuleUninstall,
  onProjectTerminal,
  onProjectInit,
  onProjectDev,
  onProjectStop,
  onProjectTest,
  onProjectDoctor,
  onProjectArchitecture,
  onProjectIncident,
  onProjectAI,
  onProjectRelease,
  onProjectImpact,
  onProjectBrowser,
  onProjectBuild,
}: DashboardModuleCatalogSurfaceProps) {
  return (
    <ModuleBrowser
      modules={modules}
      catalogMeta={catalogMeta}
      workspaceStatus={workspaceStatus}
      scope={scope}
      categoryInfo={categoryInfo}
      surface={surface}
      includeProjectActions={false}
      onCopyText={onCopyText}
      onRefresh={onRefresh}
      onInstall={onInstall}
      onShowDetails={onShowDetails}
      onModuleDiff={onModuleDiff}
      onModuleRollback={onModuleRollback}
      onModuleUninstall={onModuleUninstall}
      onAI={onAI}
      onProjectTerminal={onProjectTerminal}
      onProjectInit={onProjectInit}
      onProjectDev={onProjectDev}
      onProjectStop={onProjectStop}
      onProjectTest={onProjectTest}
      onProjectDoctor={onProjectDoctor}
      onProjectArchitecture={onProjectArchitecture}
      onProjectIncident={onProjectIncident}
      onProjectAI={onProjectAI}
      onProjectRelease={onProjectRelease}
      onProjectImpact={onProjectImpact}
      onProjectBrowser={onProjectBrowser}
      onProjectBuild={onProjectBuild}
      modulesDisabled={modulesDisabled}
    />
  );
}

export function DashboardCatalogLoadingShell({
  variant,
}: {
  variant: 'templates' | 'modules';
}) {
  return (
    <section
      className={`catalog-loading-shell catalog-loading-shell--${variant}`}
      aria-live="polite"
      aria-label={
        variant === 'templates' ? 'Loading workspace catalogs' : 'Preparing module catalog'
      }
    >
      <div className="catalog-loading-header">
        <span>
          {variant === 'templates' ? 'Loading workspace catalogs' : 'Preparing module catalog'}
        </span>
        <small>
          {variant === 'templates'
            ? 'Templates, examples, and module inventory'
            : 'Package manager surface'}
        </small>
      </div>
      <div
        className={`catalog-skeleton-grid ${
          variant === 'templates' ? 'catalog-skeleton-grid--templates' : ''
        }`}
      >
        {Array.from({ length: variant === 'templates' ? 3 : 4 }).map((_, index) => (
          <span key={index} className="catalog-skeleton-card" />
        ))}
      </div>
    </section>
  );
}
