import { useState, useMemo } from 'react';
import {
  RefreshCw,
  Folder,
  AlertTriangle,
  Package,
  Info,
  Copy,
  Database,
  Zap,
  Lock,
  Eye,
  Shield,
  FileText,
  CreditCard,
  MessageSquare,
  Users,
  Calendar,
  Brain,
  Download,
  CheckCircle,
  ArrowUp,
  Sparkles,
  Check,
  History,
  Trash2,
  GitCompare,
} from 'lucide-react';
import type { ModuleData, CategoryInfo, WorkspaceStatus } from '@/types';
import { getProjectFrameworkLabel, isUnsupportedModuleProjectType } from '@/lib/moduleSupport';
import { ProjectActions } from './ProjectActions';
import { WorkspaiEmptyState } from './WorkspaiEmptyState';
import { SectionHeader } from './SectionHeader';

// Icon mapping based on category
const categoryIcons: Record<string, any> = {
  ai: Brain,
  database: Database,
  cache: Zap,
  auth: Lock,
  observability: Eye,
  security: Shield,
  essentials: FileText,
  billing: CreditCard,
  communication: MessageSquare,
  users: Users,
  tasks: Calendar,
  business: Package,
};

interface ModuleBrowserProps {
  modules: ModuleData[];
  workspaceStatus: WorkspaceStatus;
  categoryInfo: CategoryInfo;
  onRefresh: () => void;
  onInstall: (module: ModuleData) => void;
  onShowDetails: (module: ModuleData) => void;
  onModuleDiff?: (module: ModuleData) => void;
  onModuleRollback?: (module: ModuleData) => void;
  onModuleUninstall?: (module: ModuleData) => void;
  onAI?: (module: ModuleData) => void;
  onProjectTerminal?: () => void;
  onProjectInit?: () => void;
  onProjectDev?: () => void;
  onProjectStop?: () => void;
  onProjectTest?: () => void;
  onProjectDoctor?: () => void;
  onProjectArchitecture?: () => void;
  onProjectIncident?: () => void;
  onProjectAI?: () => void;
  onProjectRelease?: () => void;
  onProjectImpact?: () => void;
  onProjectBrowser?: () => void;
  onProjectBuild?: () => void;
  modulesDisabled?: boolean;
  /** Console = project-scoped installs; Catalog = browse-only catalog surface */
  surface?: 'console' | 'catalog';
  /** When false, ProjectActions must be rendered by the parent (Console tab). */
  includeProjectActions?: boolean;
}

export function ModuleBrowser({
  modules,
  workspaceStatus,
  categoryInfo: _categoryInfo,
  onRefresh,
  onInstall,
  onShowDetails,
  onModuleDiff,
  onModuleRollback,
  onModuleUninstall,
  onAI,
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
  modulesDisabled = false,
  surface = 'console',
  includeProjectActions = true,
}: ModuleBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedModuleId, setCopiedModuleId] = useState<string | null>(null);
  const [loadingModuleId, setLoadingModuleId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [moduleView, setModuleView] = useState<'all' | 'installed' | 'available' | 'updates'>(
    'all'
  );
  const [showAllModules, setShowAllModules] = useState(false);
  const hasProjectSelected = workspaceStatus.hasProjectSelected === true;
  const isCatalogSurface = surface === 'catalog';
  const unsupportedProject =
    modulesDisabled || isUnsupportedModuleProjectType(workspaceStatus.projectType);
  const unsupportedFrameworkLabel = getProjectFrameworkLabel(workspaceStatus.projectType);
  const canInstall = hasProjectSelected && !unsupportedProject;
  const showModuleControls =
    modules.length > 0 && (isCatalogSurface || (hasProjectSelected && !unsupportedProject));
  const showModuleList =
    modules.length > 0 && (isCatalogSurface || (hasProjectSelected && !unsupportedProject));

  const installBlockedReason = !hasProjectSelected
    ? 'Select a FastAPI or NestJS project in Console to install modules'
    : unsupportedProject
      ? `Module installs are not supported for ${unsupportedFrameworkLabel} projects yet`
      : undefined;

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(modules.map((m) => m.category));
    return ['all', ...Array.from(cats)];
  }, [modules]);

  // Get installed module info
  const getInstalledModule = (moduleSlug: string) => {
    return workspaceStatus.installedModules?.find((m) => m.slug === moduleSlug);
  };

  // Check if newer version is available
  const isNewerVersion = (available: string, installed: string): boolean => {
    const parseVersion = (v: string) => {
      const cleaned = v.replace(/^v/, '');
      const parts = cleaned.split('.').map((p) => parseInt(p, 10) || 0);
      return parts;
    };

    const availParts = parseVersion(available);
    const instParts = parseVersion(installed);

    for (let i = 0; i < Math.max(availParts.length, instParts.length); i++) {
      const a = availParts[i] || 0;
      const b = instParts[i] || 0;
      if (a > b) {
        return true;
      }
      if (a < b) {
        return false;
      }
    }
    return false;
  };

  const moduleRows = useMemo(() => {
    return modules.map((module) => {
      const installedInfo = module.slug ? getInstalledModule(module.slug) : undefined;
      const hasUpdate =
        Boolean(installedInfo) &&
        Boolean(module.version) &&
        isNewerVersion(module.version || '0.0.0', installedInfo!.version);
      return {
        module,
        installedInfo,
        installed: Boolean(installedInfo),
        hasUpdate,
      };
    });
  }, [modules, workspaceStatus.installedModules]);

  const moduleViewCounts = useMemo(
    () => ({
      all: moduleRows.length,
      installed: moduleRows.filter((row) => row.installed).length,
      available: moduleRows.filter((row) => !row.installed).length,
      updates: moduleRows.filter((row) => row.hasUpdate).length,
    }),
    [moduleRows]
  );

  // Filter modules
  const filteredRows = useMemo(() => {
    return moduleRows.filter((row) => {
      const module = row.module;
      const matchesSearch =
        searchQuery === '' ||
        module.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (module.display_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        module.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = selectedCategory === 'all' || module.category === selectedCategory;
      const matchesView =
        moduleView === 'all' ||
        (moduleView === 'installed' && row.installed) ||
        (moduleView === 'available' && !row.installed) ||
        (moduleView === 'updates' && row.hasUpdate);

      return matchesSearch && matchesCategory && matchesView;
    });
  }, [moduleRows, moduleView, searchQuery, selectedCategory]);

  const visibleRows = showAllModules ? filteredRows : filteredRows.slice(0, 16);
  const hiddenModuleCount = filteredRows.length - visibleRows.length;
  const selectedProjectName =
    workspaceStatus.projectName || workspaceStatus.projectType || 'Selected project';
  const selectedWorkspaceName = workspaceStatus.workspaceName || 'Selected workspace';
  const selectedProjectMeta = [
    `Workspace: ${selectedWorkspaceName}`,
    workspaceStatus.projectType ? `Framework: ${workspaceStatus.projectType}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleCopyCommand = (moduleId: string, slug: string) => {
    const command = `npx --yes --package rapidkit rapidkit add module ${slug}`;
    navigator.clipboard.writeText(command);
    setCopiedModuleId(moduleId);
    setTimeout(() => setCopiedModuleId(null), 2000);
  };

  const handleShowDetails = (module: ModuleData) => {
    const moduleId = module.id || module.slug || module.name;
    setLoadingModuleId(moduleId);
    onShowDetails(module);
    setTimeout(() => setLoadingModuleId(null), 1500);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <div className="section module-browser">
      <SectionHeader
        icon={<Package className="w-6 h-6" />}
        title={isCatalogSurface ? 'Module Catalog' : 'Module Browser'}
        scope="catalog"
        count={
          <>
            {modules.length} free
            {hasProjectSelected && workspaceStatus.installedModules
              ? ` · ${workspaceStatus.installedModules.length} installed`
              : ''}
          </>
        }
        actions={
          <button className="refresh-btn" onClick={handleRefresh} title="Refresh modules" aria-label="Refresh modules">
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'spinning' : ''}`} />
          </button>
        }
      />

      {isCatalogSurface ? (
        <div className="workspace-warning workspace-warning--info">
          <Info className="warning-icon" />
          <div className="warning-content">
            <div className="warning-title">FastAPI & NestJS modules</div>
            <div className="warning-desc">
              The catalog below lists Workspai modules built for{' '}
              <strong>FastAPI</strong> and <strong>NestJS</strong> projects. Browse freely here;
              install or update from the <strong>Console</strong> tab with a supported project
              selected.
            </div>
          </div>
        </div>
      ) : null}

      {hasProjectSelected && unsupportedProject ? (
        <div className="workspace-warning">
          <AlertTriangle className="warning-icon" />
          <div className="warning-content">
            <div className="warning-title">Module installs not supported yet</div>
            <div className="warning-desc">
              <strong>{unsupportedFrameworkLabel}</strong> projects are not supported for Workspai
              module installs at this time. Select a <strong>FastAPI</strong> or{' '}
              <strong>NestJS</strong> project from the <strong>PROJECTS</strong> panel to use
              modules.
              {isCatalogSurface ? (
                <>
                  {' '}
                  You can still browse the catalog below — modules are specific to those two
                  frameworks.
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {!isCatalogSurface && hasProjectSelected ? (
        <div className="workspace-info-box">
          <Folder className="workspace-info-icon" />
          <div className="workspace-details">
            <div className="workspace-name-info">{selectedProjectName}</div>
            <div className="workspace-path-info">{selectedProjectMeta}</div>
          </div>
        </div>
      ) : null}

      {!isCatalogSurface && !hasProjectSelected ? (
        <div className="workspace-warning">
          <AlertTriangle className="warning-icon" />
          <div className="warning-content">
            <div className="warning-title">No Project Selected</div>
            <div className="warning-desc">
              Select a FastAPI or NestJS project from the <strong>PROJECTS</strong> panel in the
              sidebar to install modules, or create a new supported project.
            </div>
          </div>
        </div>
      ) : null}

      {!isCatalogSurface &&
        includeProjectActions &&
        hasProjectSelected &&
        onProjectTerminal &&
        onProjectInit &&
        onProjectDev &&
        onProjectStop &&
        onProjectTest &&
        onProjectDoctor &&
        onProjectArchitecture &&
        onProjectIncident &&
        onProjectAI &&
        onProjectRelease &&
        onProjectImpact &&
        onProjectBrowser &&
        onProjectBuild && (
          <ProjectActions
            workspaceStatus={workspaceStatus}
            onTerminal={onProjectTerminal}
            onInit={onProjectInit}
            onDev={onProjectDev}
            onStop={onProjectStop}
            onTest={onProjectTest}
            onDoctor={onProjectDoctor}
            onArchitecture={onProjectArchitecture}
            onIncident={onProjectIncident}
            onAI={onProjectAI}
            onRelease={onProjectRelease}
            onImpact={onProjectImpact}
            onBrowser={onProjectBrowser}
            onBuild={onProjectBuild}
          />
        )}

      {/* Always show search and filters when modules exist */}
      {showModuleControls && (
        <div className="module-controls">
          <div className="module-view-tabs" aria-label="Module status filter">
            {[
              ['all', 'All'],
              ['installed', 'Installed'],
              ['available', 'Available'],
              ['updates', 'Updates'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={moduleView === value ? 'is-active' : ''}
                onClick={() => {
                  setModuleView(value as typeof moduleView);
                  setShowAllModules(false);
                }}
              >
                {label}
                <span>{moduleViewCounts[value as keyof typeof moduleViewCounts]}</span>
              </button>
            ))}
          </div>
          <input
            type="text"
            className="module-search"
            placeholder="Search modules by name or description..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowAllModules(false);
            }}
          />
          <div className="module-filters">
            {categories.map((cat) => (
              <button
                key={cat}
                className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => {
                  setSelectedCategory(cat);
                  setShowAllModules(false);
                }}
              >
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!showModuleList ? null : filteredRows.length === 0 && modules.length > 0 ? (
        <WorkspaiEmptyState
          icon={<Package size={18} />}
          title="No modules match your filters"
          description="Try a different search term or category."
        />
      ) : (
        <>
          <div className="module-row-header" aria-hidden="true">
            <span>Module</span>
            <span>Purpose</span>
            <span>Status / Actions</span>
          </div>
          <div className="modules-grid">
            {visibleRows.map((row) => {
              const module: any = row.module;
              const installed = row.installed;
              const IconComponent = categoryIcons[module.category] || Package;
              return (
                <div key={module.id} className={`module-card ${installed ? 'installed' : ''}`}>
                  <div className="module-header">
                    <div className="module-icon-wrapper">
                      <IconComponent className="module-icon-lucide" size={24} />
                    </div>
                    <div className="module-info">
                      <div className="module-name">{module.display_name || module.name}</div>
                      <div className="module-version">v{module.version}</div>
                    </div>
                    <span className={`module-badge ${module.category}`}>{module.category}</span>
                  </div>
                  <div className="module-desc">{module.description}</div>
                  <div className="module-actions">
                    {(() => {
                      const installedInfo = row.installedInfo;
                      const hasUpdate = row.hasUpdate;

                      if (hasUpdate && installedInfo) {
                        return (
                          <button
                            className="module-install-btn update"
                            onClick={() => onInstall(module)}
                            disabled={!canInstall}
                            title={
                              canInstall
                                ? `Update from v${installedInfo.version} to v${module.version}`
                                : installBlockedReason
                            }
                          >
                            <ArrowUp size={16} /> Update
                          </button>
                        );
                      } else if (installedInfo) {
                        return (
                          <button className="module-install-btn installed" disabled>
                            <CheckCircle size={16} /> Installed v{installedInfo.version}
                          </button>
                        );
                      } else {
                        return (
                          <button
                            className="module-install-btn"
                            onClick={() => onInstall(module)}
                            disabled={!canInstall}
                            title={canInstall ? 'Install module' : installBlockedReason}
                          >
                            <Download size={16} /> Install
                          </button>
                        );
                      }
                    })()}
                    <button
                      className={`module-action-btn ${loadingModuleId === module.id ? 'loading' : ''}`}
                      onClick={() => handleShowDetails(module)}
                      title="View Details"
                      disabled={loadingModuleId === module.id}
                    >
                      {loadingModuleId === module.id ? (
                        <RefreshCw size={14} className="spinning" />
                      ) : (
                        <Info size={14} />
                      )}
                    </button>
                    <button
                      className={`module-action-btn ${copiedModuleId === module.id ? 'copied' : ''}`}
                      onClick={() => handleCopyCommand(module.id, module.slug)}
                      title={copiedModuleId === module.id ? 'Copied!' : 'Copy install command'}
                    >
                      {copiedModuleId === module.id ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                    {onAI && (
                      <button
                        className="module-action-btn module-ai-btn"
                        onClick={() => onAI(module)}
                        title="Ask AI about this module"
                      >
                        <Sparkles size={14} aria-hidden="true" />
                      </button>
                    )}
                    {!isCatalogSurface && row.installed && onModuleDiff ? (
                      <button
                        className="module-action-btn"
                        onClick={() => onModuleDiff(module)}
                        title="Diff installed module against catalog template"
                      >
                        <GitCompare size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                    {!isCatalogSurface && row.installed && onModuleRollback ? (
                      <button
                        className="module-action-btn"
                        onClick={() => onModuleRollback(module)}
                        title="Rollback module from last checkpoint"
                      >
                        <History size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                    {!isCatalogSurface && row.installed && onModuleUninstall ? (
                      <button
                        className="module-action-btn module-action-btn--danger"
                        onClick={() => onModuleUninstall(module)}
                        title="Uninstall module from project"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {hiddenModuleCount > 0 || showAllModules ? (
            <div className="module-browser-footer">
              <span>
                Showing {visibleRows.length} of {filteredRows.length} modules.
              </span>
              <button type="button" onClick={() => setShowAllModules((value) => !value)}>
                {showAllModules ? 'Show less' : `Show ${hiddenModuleCount} more`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
