import { ArrowLeftRight, ArrowRight, FolderInput, FolderOpen } from 'lucide-react';
import type { WorkspaceStatus } from '@/types';

interface HomeImportAdoptHandoffProps {
  workspaceStatus: WorkspaceStatus;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
}

/**
 * Home handoff for onboarding existing code.
 *
 * Import Projects → `workspai.importProject` (copy/clone via Workspai CLI `import`)
 * Adopt Projects  → `workspai.adoptProject` (in-place link via Workspai CLI `adopt`)
 *
 * When no workspace is active yet, the extension creates or reuses the managed
 * default slot (`~/.workspai/workspaces/workspai`) — same as the npm CLI.
 */
export function HomeImportAdoptHandoff({
  workspaceStatus,
  onRunCommand,
}: HomeImportAdoptHandoffProps) {
  const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);

  const runHandoff = (command: 'importProject' | 'adoptProject') => {
    const workspacePayload =
      hasWorkspace && workspaceStatus.workspacePath
        ? {
            path: workspaceStatus.workspacePath,
            name: workspaceStatus.workspaceName,
            useDefaultWorkspace: false,
          }
        : { useDefaultWorkspace: true };

    onRunCommand(command, {
      ...workspacePayload,
      trigger:
        command === 'importProject'
          ? 'dashboard-import-handoff'
          : 'dashboard-adopt-handoff',
    });
  };

  return (
    <section className="home-create-handoff" aria-label="Import and adopt">
      <div className="home-create-handoff__head">
        <FolderOpen size={14} aria-hidden="true" />
        <div>
          <strong className="home-create-handoff__title">Import / Adopt Projects</strong>
          <small className="home-create-handoff__hint">
            Onboard existing code into workspace intelligence
          </small>
        </div>
      </div>
      <div className="home-create-handoff__actions">
        <button
          type="button"
          className="home-create-handoff__action home-create-handoff__action--primary"
          onClick={() => runHandoff('importProject')}
          title={
            hasWorkspace
              ? 'Copy or clone a folder or Git repo into this workspace'
              : 'Import into the default Workspai workspace (created automatically if needed)'
          }
        >
          <FolderInput size={15} aria-hidden="true" />
          <span>
            <strong>Import</strong>
            <small>Copy or clone into workspace</small>
          </span>
          <ArrowRight size={13} aria-hidden="true" className="home-create-handoff__chevron" />
        </button>
        <button
          type="button"
          className="home-create-handoff__action"
          onClick={() => runHandoff('adoptProject')}
          title={
            hasWorkspace
              ? 'Register a project where it already lives — no copy or move'
              : 'Adopt into the default Workspai workspace (created automatically if needed)'
          }
        >
          <ArrowLeftRight size={15} aria-hidden="true" />
          <span>
            <strong>Adopt</strong>
            <small>Link in place — files stay put</small>
          </span>
          <ArrowRight size={13} aria-hidden="true" className="home-create-handoff__chevron" />
        </button>
      </div>
    </section>
  );
}
