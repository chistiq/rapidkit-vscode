import {
  RefreshCw,
  Folder,
  FolderOpen,
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  ArrowUpCircle,
  Stethoscope,
  Upload,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Activity,
  ShieldCheck,
  Database,
} from 'lucide-react';
import { useState } from 'react';
import type { Workspace } from '@/types';
import { WorkspaiEmptyState } from './WorkspaiEmptyState';
import { SectionHeader } from './SectionHeader';

const PAGE_SIZE = 5;

interface RecentWorkspacesProps {
  workspaces: Workspace[];
  isRefreshing?: boolean;
  onRefresh: () => void;
  onSelect: (workspace: Workspace) => void;
  onRemove: (workspace: Workspace) => void;
  onUpgrade?: (workspace: Workspace) => void;
  onCheckHealth?: (workspace: Workspace) => void;
  onExport?: (workspace: Workspace) => void;
  onAI?: (workspace: Workspace) => void;
  onAnalyze?: (workspace: Workspace) => void;
  onBootstrap?: (workspace: Workspace) => void;
  onMirrorSync?: (workspace: Workspace) => void;
}

const getStatusIcon = (status?: string) => {
  switch (status) {
    case 'up-to-date':
    case 'ok':
      return (
        <span title="RapidKit Core installed and up to date" aria-label="Up to date">
          <CheckCircle2 className="ws-status-icon ws-status-icon--pass" />
        </span>
      );
    case 'update-available':
      return (
        <span title="Update available for RapidKit Core" aria-label="Update available">
          <ArrowUpCircle className="ws-status-icon ws-status-icon--warn" />
        </span>
      );
    case 'outdated':
      return (
        <span title="RapidKit Core is outdated" aria-label="Outdated">
          <AlertCircle className="ws-status-icon ws-status-icon--warn" />
        </span>
      );
    case 'not-installed':
      return (
        <span title="RapidKit Core not installed" aria-label="Not installed">
          <XCircle className="ws-status-icon ws-status-icon--error" />
        </span>
      );
    case 'error':
      return (
        <span title="Error checking RapidKit Core status" aria-label="Status error">
          <AlertCircle className="ws-status-icon ws-status-icon--muted" />
        </span>
      );
    default:
      return null;
  }
};

const formatDate = (timestamp?: number): string => {
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString();
};

export function RecentWorkspaces({
  workspaces,
  isRefreshing = false,
  onRefresh,
  onSelect,
  onRemove,
  onUpgrade,
  onCheckHealth,
  onExport,
  onAI,
  onAnalyze,
  onBootstrap,
  onMirrorSync,
}: RecentWorkspacesProps) {
  const [showAll, setShowAll] = useState(false);
  /** path of workspace currently performing an action (health/export/upgrade) */
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const sorted = [...workspaces].sort((left, right) => {
    const leftTs = left.lastAccessed ?? left.lastModified ?? 0;
    const rightTs = right.lastAccessed ?? right.lastModified ?? 0;
    return rightTs - leftTs;
  });
  const visible = showAll ? sorted : sorted.slice(0, PAGE_SIZE);
  const hiddenCount = sorted.length - PAGE_SIZE;

  const withBusy = (path: string, fn: () => void) => {
    setBusyPath(path);
    fn();
    // Clear after a generous timeout so it doesn't stick if extension never replies
    setTimeout(() => setBusyPath((prev) => (prev === path ? null : prev)), 8000);
  };

  return (
    <div className="section">
      <SectionHeader
        icon={<Folder className="w-6 h-6" />}
        title="Recent Workspaces"
        scope="workspace"
        actions={
          <button
            className="ws-btn ws-btn--ghost ws-btn--icon refresh-btn"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh workspaces"
            aria-label="Refresh workspaces"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'spinning' : ''}`} />
          </button>
        }
      />

      <div className="workspace-list">
        {workspaces.length === 0 ? (
          <WorkspaiEmptyState
            icon={<FolderOpen size={18} />}
            title="No recent workspaces"
            description="Add or import a workspace to get started."
          />
        ) : (
          <>
            {visible.map((workspace) => {
              const shouldShowUpgrade =
                workspace.coreStatus === 'update-available' &&
                !!onUpgrade &&
                !!workspace.coreLatestVersion;
              const isBusy = busyPath === workspace.path;

              return (
                <div
                  key={workspace.path}
                  className={`ws-card${isBusy ? ' ws-card--busy' : ''}`}
                  onClick={() => !isBusy && onSelect(workspace)}
                  onKeyDown={(event) => {
                    if (isBusy) {
                      return;
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(workspace);
                    }
                  }}
                  role="button"
                  tabIndex={isBusy ? -1 : 0}
                  aria-label={`Open workspace ${workspace.name}`}
                  aria-busy={isBusy}
                >
                  <div className="ws-row-top">
                    <div className="ws-name-row">
                      <span className="ws-name">{workspace.name}</span>
                    </div>

                    {/* Busy spinner — replaces action buttons while an action is running */}
                    {isBusy && (
                      <span className="ws-busy-spinner" aria-label="Working…">
                        <Loader2 size={13} className="spinning" />
                      </span>
                    )}

                    {/* Phase 4: compliance failure badge */}
                    {workspace.complianceStatus === 'failing' && (
                      <span
                        className="ws-tag ws-tag--danger"
                        title="Bootstrap compliance failing — run: rapidkit bootstrap"
                      >
                        <AlertTriangle size={11} aria-hidden="true" /> Policy
                      </span>
                    )}

                    {/* Phase 4: bootstrap profile badge */}
                    {workspace.bootstrapProfile && (
                      <span
                        className="ws-tag ws-tag--profile"
                        title={`Bootstrap profile: ${workspace.bootstrapProfile}`}
                      >
                        {workspace.bootstrapProfile}
                      </span>
                    )}

                    {/* Phase 4: stale mirror warning */}
                    {workspace.mirrorStatus === 'stale' && (
                      <span
                        className="ws-tag ws-tag--mirror-stale ws-hover-show"
                        title="Mirror is stale — run: rapidkit mirror sync"
                      >
                        mirror stale
                      </span>
                    )}

                    {/* Version badge - only on hover */}
                    {workspace.coreVersion && (
                      <span
                        className="ws-tag ws-tag--version ws-hover-show"
                        title={`RapidKit Core ${workspace.coreVersion} (${workspace.coreLocation || 'unknown'})`}
                      >
                        v{workspace.coreVersion}
                      </span>
                    )}

                    {/* Project count - always visible */}
                    {workspace.projectCount !== undefined && (
                      <span
                        className="ws-tag ws-tag--projects"
                        title={`${workspace.projectCount} project${workspace.projectCount !== 1 ? 's' : ''}`}
                      >
                        {workspace.projectCount}{' '}
                        {workspace.projectCount === 1 ? 'project' : 'projects'}
                      </span>
                    )}

                    <span className="ws-fill" />

                    {/* Time - only on hover */}
                    {workspace.lastModified && (
                      <span
                        className="ws-time ws-hover-show"
                        title={new Date(workspace.lastModified).toLocaleString()}
                      >
                        {formatDate(workspace.lastModified)}
                      </span>
                    )}

                    {/* Status icon - always visible */}
                    {!shouldShowUpgrade && !isBusy && getStatusIcon(workspace.coreStatus)}

                    {/* Always-visible inline actions on the right */}
                    {!isBusy && (
                      <span className="ws-inline-actions">
                        {onAnalyze && (
                          <button
                            className="ws-inline-action ws-inline-action--analyze"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAnalyze(workspace);
                            }}
                            title="Analyze workspace in Incident Studio"
                            aria-label={`Analyze ${workspace.name} in Incident Studio`}
                          >
                            <Activity size={12} />
                          </button>
                        )}
                        {onAI && (
                          <button
                            className="ws-inline-action ws-inline-action--ai"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAI(workspace);
                            }}
                            title="Ask AI about this workspace"
                            aria-label={`AI actions for ${workspace.name}`}
                          >
                            <Sparkles size={12} />
                          </button>
                        )}
                        {onCheckHealth && (
                          <button
                            className="ws-inline-action ws-inline-action--doctor"
                            onClick={(e) => {
                              e.stopPropagation();
                              withBusy(workspace.path, () => onCheckHealth(workspace));
                            }}
                            title="Check Workspace Health (Doctor)"
                            aria-label={`Check health of ${workspace.name}`}
                          >
                            <Stethoscope size={12} />
                          </button>
                        )}
                        {onBootstrap && workspace.complianceStatus === 'failing' && (
                          <button
                            className="ws-inline-action ws-inline-action--bootstrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              withBusy(workspace.path, () => onBootstrap(workspace));
                            }}
                            title="Fix bootstrap compliance (rapidkit bootstrap)"
                            aria-label={`Bootstrap ${workspace.name}`}
                          >
                            <ShieldCheck size={12} />
                          </button>
                        )}
                        {onMirrorSync && workspace.mirrorStatus === 'stale' && (
                          <button
                            className="ws-inline-action ws-inline-action--mirror"
                            onClick={(e) => {
                              e.stopPropagation();
                              withBusy(workspace.path, () => onMirrorSync(workspace));
                            }}
                            title="Sync stale mirror (rapidkit mirror sync)"
                            aria-label={`Sync mirror for ${workspace.name}`}
                          >
                            <Database size={12} />
                          </button>
                        )}
                        {onExport && (
                          <button
                            className="ws-inline-action ws-inline-action--export"
                            onClick={(e) => {
                              e.stopPropagation();
                              withBusy(workspace.path, () => onExport(workspace));
                            }}
                            title="Export Workspace"
                            aria-label={`Export workspace ${workspace.name}`}
                          >
                            <Upload size={12} />
                          </button>
                        )}
                        {shouldShowUpgrade && (
                          <button
                            className="ws-inline-action ws-inline-action--upgrade"
                            onClick={(e) => {
                              e.stopPropagation();
                              withBusy(workspace.path, () => onUpgrade!(workspace));
                            }}
                            title={`Upgrade to v${workspace.coreLatestVersion}`}
                            aria-label={`Upgrade ${workspace.name} to v${workspace.coreLatestVersion}`}
                          >
                            <ArrowUpCircle size={12} />
                          </button>
                        )}
                      </span>
                    )}

                    <button
                      className="ws-close ws-hover-show"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(workspace);
                      }}
                      title="Remove from list"
                      aria-label={`Remove ${workspace.name} from list`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {/* <div className="ws-row-bottom">
                                        {workspace.path}
                                    </div> */}
                </div>
              );
            })}

            {/* Show more / less toggle */}
            {sorted.length > PAGE_SIZE && (
              <button
                className="ws-btn ws-btn--ghost ws-show-more-btn"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
              >
                {showAll ? (
                  <>
                    <ChevronUp size={13} /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown size={13} /> Show {hiddenCount} more
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
