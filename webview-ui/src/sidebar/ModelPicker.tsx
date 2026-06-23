import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { vscode } from '@/vscode';
import type { SidebarModel } from './sidebarModels';
import { modelLabel } from './sidebarModels';

const SIDEBAR_META = { source: 'workspai-sidebar-react', version: '1' } as const;

interface ModelPickerProps {
  models: SidebarModel[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRefreshModels?: () => void;
}

interface MenuPosition {
  left: number;
  top: number;
  minWidth: number;
  placement: 'up' | 'down';
}

/** AI model dropdown (Auto + entitled models), portal-mounted so the list is never clipped. */
export function ModelPicker({ models, selectedId, onSelect, onRefreshModels }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const label = modelLabel(models, selectedId);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceAbove >= spaceBelow && spaceAbove >= 120;
    setMenuPosition({
      left: rect.left,
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      minWidth: Math.max(220, rect.width),
      placement: openUp ? 'up' : 'down',
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    document.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      document.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, updateMenuPosition, models.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const choose = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  const refreshModels = () => {
    if (onRefreshModels) {
      onRefreshModels();
      return;
    }
    vscode.postMessage('sidebarRefreshModels', {}, SIDEBAR_META);
  };

  const toggleOpen = () => {
    setOpen((current) => {
      const next = !current;
      if (next) {
        requestAnimationFrame(updateMenuPosition);
      }
      return next;
    });
  };

  const menu =
    open && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label="AI model"
            className="ws-sidebar__model-menu ws-sidebar__model-menu--portal"
            style={{
              position: 'fixed',
              left: menuPosition.left,
              top: menuPosition.top,
              minWidth: menuPosition.minWidth,
              transform: menuPosition.placement === 'up' ? 'translateY(-100%)' : undefined,
            }}
          >
            <button
              type="button"
              role="option"
              aria-selected={selectedId === null}
              className="ws-sidebar__model-option"
              onClick={() => choose(null)}
            >
              <span>Auto</span>
              {selectedId === null ? <Check size={12} aria-hidden={true} /> : null}
            </button>
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                role="option"
                aria-selected={selectedId === model.id}
                className="ws-sidebar__model-option"
                onClick={() => choose(model.id)}
              >
                <span className="ws-sidebar__model-option-copy">
                  <span>{model.name ?? model.id}</span>
                  {model.vendor ? (
                    <small className="ws-sidebar__model-option-vendor">{model.vendor}</small>
                  ) : null}
                </span>
                {selectedId === model.id ? <Check size={12} aria-hidden={true} /> : null}
              </button>
            ))}
            {models.length === 0 ? (
              <div className="ws-sidebar__model-empty" role="note">
                <p>No entitled models in this VS Code session.</p>
                <button type="button" className="ws-sidebar__model-refresh" onClick={refreshModels}>
                  <RefreshCw size={11} aria-hidden={true} />
                  Refresh models
                </button>
              </div>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="ws-sidebar__model" data-open={open}>
      <button
        ref={triggerRef}
        type="button"
        className="ws-sidebar__model-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={toggleOpen}
      >
        <span>{label}</span>
        <ChevronDown size={12} aria-hidden={true} className={open ? 'is-open' : ''} />
      </button>
      {menu}
    </div>
  );
}
