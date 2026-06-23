import { ArrowRight, FolderKanban, Loader2, Package, Sparkles } from 'lucide-react';
import type { WorkspaceStatus } from '@/types';

interface HomeCreateHandoffProps {
  workspaceStatus: WorkspaceStatus;
  isCreatingWorkspace?: boolean;
  onCreateAIWorkspace: () => void;
  onCreateAIProject: () => void;
}

/** Home-only handoff to the secondary sidebar Create tab — not an inline chat surface. */
export function HomeCreateHandoff({
  workspaceStatus,
  isCreatingWorkspace = false,
  onCreateAIWorkspace,
  onCreateAIProject,
}: HomeCreateHandoffProps) {
  const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);

  return (
    <section className="home-create-handoff" aria-label="Create with AI">
      <div className="home-create-handoff__head">
        <Sparkles size={14} aria-hidden="true" />
        <div>
          <strong className="home-create-handoff__title">Create with AI</strong>
          <small className="home-create-handoff__hint">
            Opens the Workspai sidebar — Create tab
          </small>
        </div>
      </div>
      <div className="home-create-handoff__actions">
        <button
          type="button"
          className="home-create-handoff__action home-create-handoff__action--primary"
          onClick={isCreatingWorkspace ? undefined : onCreateAIWorkspace}
          aria-busy={isCreatingWorkspace}
          title="Plan and create a workspace in the sidebar"
        >
          {isCreatingWorkspace ? (
            <Loader2 className="spinning" size={15} aria-hidden="true" />
          ) : (
            <FolderKanban size={15} aria-hidden="true" />
          )}
          <span>
            <strong>Workspace</strong>
            <small>Profile, bootstrap, first project</small>
          </span>
          <ArrowRight size={13} aria-hidden="true" className="home-create-handoff__chevron" />
        </button>
        <button
          type="button"
          className="home-create-handoff__action"
          onClick={onCreateAIProject}
          title={
            hasWorkspace
              ? 'Plan and create a project in the sidebar'
              : 'Plan and create a project in the default workspace'
          }
        >
          <Package size={15} aria-hidden="true" />
          <span>
            <strong>Project</strong>
            <small>
              {hasWorkspace ? 'Scaffold inside this workspace' : 'Uses the default workspace'}
            </small>
          </span>
          <ArrowRight size={13} aria-hidden="true" className="home-create-handoff__chevron" />
        </button>
      </div>
    </section>
  );
}
