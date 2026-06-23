import { FolderPlus, Package, Sparkles } from 'lucide-react';
import { Drawer } from '../drawer/Drawer';
import {
  STACK_LANES,
  quickStartsForStackLane,
  type CreationStackLane,
} from '@/lib/creationPresets';

export type CreateDrawerId = 'add' | 'workspace' | 'project' | null;

interface CreateAddDrawerProps {
  open: boolean;
  stackLane: CreationStackLane;
  onStackLaneChange: (lane: CreationStackLane) => void;
  onClose: () => void;
  onOpenWorkspace: () => void;
  onOpenProject: () => void;
  onPickQuickStart: (text: string) => void;
}

/**
 * Primary Add drawer: inline stack-focus pills + quick starts that react to the
 * selected lane, plus one-tap workspace / project create. No nested stack drawer.
 */
export function CreateAddDrawer({
  open,
  stackLane,
  onStackLaneChange,
  onClose,
  onOpenWorkspace,
  onOpenProject,
  onPickQuickStart,
}: CreateAddDrawerProps) {
  const quickStarts = quickStartsForStackLane(stackLane);

  return (
    <Drawer
      open={open}
      sizing="auto"
      title="Create"
      subtitle="Pick a stack focus, quick start, or scaffold manually."
      onClose={onClose}
    >
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
        <span className="ws-drawer-section__label">Quick starts</span>
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
