import { ArchiveRestore, FolderInput, FolderPlus, GitMerge, Package, Sparkles } from 'lucide-react';
import { Drawer } from '../drawer/Drawer';
import type { CreateTarget } from '../composer/CreateTargetSelector';
import {
  STACK_LANES,
  quickStartsForCreateTarget,
  type CreationStackLane,
} from '@/lib/creationPresets';

export type CreateDrawerId = 'add' | 'workspace' | 'project' | null;

interface CreateAddDrawerProps {
  open: boolean;
  target: CreateTarget;
  stackLane: CreationStackLane;
  onTargetChange: (target: CreateTarget) => void;
  onStackLaneChange: (lane: CreationStackLane) => void;
  onClose: () => void;
  onOpenWorkspace: () => void;
  onOpenProject: () => void;
  onAdoptProject: () => void;
  onImportProject: () => void;
  onImportWorkspace: () => void;
  onPickQuickStart: (text: string) => void;
}

/**
 * Primary Add drawer: inline stack-focus pills + quick starts that react to the
 * selected lane, plus one-tap workspace / project create. No nested stack drawer.
 */
export function CreateAddDrawer({
  open,
  target,
  stackLane,
  onTargetChange,
  onStackLaneChange,
  onClose,
  onOpenWorkspace,
  onOpenProject,
  onAdoptProject,
  onImportProject,
  onImportWorkspace,
  onPickQuickStart,
}: CreateAddDrawerProps) {
  const quickStarts = quickStartsForCreateTarget(stackLane, target);

  return (
    <Drawer
      open={open}
      sizing="auto"
      title="Create"
      subtitle={
        target === 'project'
          ? 'Add one project to the selected or default workspace.'
          : 'Create a governed workspace boundary.'
      }
      onClose={onClose}
    >
      <section className="ws-drawer-section ws-drawer-section--flush">
        <span className="ws-drawer-section__label">Create target</span>
        <div className="ws-drawer-pills" role="radiogroup" aria-label="Create target">
          <button
            type="button"
            role="radio"
            aria-checked={target === 'workspace'}
            className={`ws-drawer-pill${target === 'workspace' ? ' is-selected' : ''}`}
            onClick={() => onTargetChange('workspace')}
          >
            Workspace
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={target === 'project'}
            className={`ws-drawer-pill${target === 'project' ? ' is-selected' : ''}`}
            onClick={() => onTargetChange('project')}
          >
            Project
          </button>
        </div>
      </section>

      <section className="ws-drawer-section ws-drawer-section--flush">
        <span className="ws-drawer-section__label">Stack focus</span>
        <div className="ws-drawer-pills" role="tablist" aria-label="Stack focus">
          {STACK_LANES.map((lane) => (
            <button
              key={lane.id}
              type="button"
              role="tab"
              aria-selected={stackLane === lane.id}
              className={`ws-drawer-pill${stackLane === lane.id ? ' is-selected' : ''}`}
              onClick={() => onStackLaneChange(lane.id)}
            >
              {lane.label}
            </button>
          ))}
        </div>
      </section>

      <section className="ws-drawer-section">
        <span className="ws-drawer-section__label">
          {target === 'project' ? 'Project quick starts' : 'Workspace quick starts'}
        </span>
        <div className="ws-drawer-quick-list">
          {quickStarts.map((example) => (
            <button
              key={example}
              type="button"
              className="ws-drawer-quick-item"
              onClick={() => onPickQuickStart(example)}
            >
              <Sparkles size={12} aria-hidden={true} className="ws-drawer-quick-item__icon" />
              <span>{example}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="ws-drawer-section">
        <span className="ws-drawer-section__label">Existing software</span>
        <div className="ws-drawer-action-row">
          <button type="button" className="ws-drawer-action" onClick={onAdoptProject}>
            <GitMerge size={14} aria-hidden={true} />
            <span>
              <strong>Adopt project</strong>
              <small>Keep it in place</small>
            </span>
          </button>
          <button type="button" className="ws-drawer-action" onClick={onImportProject}>
            <FolderInput size={14} aria-hidden={true} />
            <span>
              <strong>Import project</strong>
              <small>Bring it into a workspace</small>
            </span>
          </button>
          <button type="button" className="ws-drawer-action" onClick={onImportWorkspace}>
            <ArchiveRestore size={14} aria-hidden={true} />
            <span>
              <strong>Import workspace</strong>
              <small>Folder or archive</small>
            </span>
          </button>
        </div>
      </section>

      <section className="ws-drawer-section">
        <span className="ws-drawer-section__label">Manual</span>
        <div className="ws-drawer-action-row">
          <button type="button" className="ws-drawer-action" onClick={onOpenWorkspace}>
            <FolderPlus size={14} aria-hidden={true} />
            <span>
              <strong>Workspace</strong>
              <small>Governed shell</small>
            </span>
          </button>
          <button type="button" className="ws-drawer-action" onClick={onOpenProject}>
            <Package size={14} aria-hidden={true} />
            <span>
              <strong>Project</strong>
              <small>Scaffold a kit</small>
            </span>
          </button>
        </div>
      </section>
    </Drawer>
  );
}
