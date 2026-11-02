import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { vscode } from '@/vscode';
import type { SidebarModel } from './sidebarModels';
import { modelLabel } from './sidebarModels';

const SIDEBAR_META = { source: 'workspai-sidebar-react', version: '1' } as const;

interface ModelPickerProps {
  models: SidebarModel[];
  selectedId: string | null;
  loadError?: string | null;
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
export function ModelPicker({
  models,
  selectedId,
  loadError,
  onSelect,
  onRefreshModels,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initializedMenuFocusRef = useRef(false);
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
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      initializedMenuFocusRef.current = false;
      return;
    }
    if (!menuPosition || initializedMenuFocusRef.current) {
      return;
    }
    initializedMenuFocusRef.current = true;
    const options = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    const selectedIndex = Array.from(options ?? []).findIndex(
      (option) => option.getAttribute('aria-selected') === 'true'
    );
    options?.[selectedIndex < 0 ? 0 : selectedIndex]?.focus();
  }, [menuPosition, open]);

  const choose = (id: string | null) => {
    onSelect(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const options = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
    );
    if (options.length === 0) {
      return;
    }
    const currentIndex = options.findIndex((option) => option === document.activeElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : currentIndex < 0
            ? event.key === 'ArrowDown'
              ? 0
              : options.length - 1
            : (currentIndex + (event.key === 'ArrowDown' ? 1 : options.length - 1)) %
              options.length;
    event.preventDefault();
    options[nextIndex < 0 ? 0 : nextIndex]?.focus();
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    if (!open) {
      setOpen(true);
      return;
    }
    const options = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
    );
    const selected = options.find((option) => option.getAttribute('aria-selected') === 'true');
    (selected ?? options[0])?.focus();
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
            onKeyDown={handleMenuKeyDown}
          >
            <button
              type="button"
              role="option"
              tabIndex={-1}
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
                tabIndex={-1}
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
                <p>
                  {loadError
                    ? `Could not load available models: ${loadError}`
                    : 'No compatible AI models are available in this VS Code session.'}
                </p>
                <button type="button" className="ws-sidebar__model-refresh" onClick={refreshModels}>
                  <RefreshCw size={11} aria-hidden={true} />
                  {loadError ? 'Retry loading models' : 'Refresh models'}
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
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{label}</span>
        <ChevronDown size={12} aria-hidden={true} className={open ? 'is-open' : ''} />
      </button>
      {menu}
    </div>
  );
}
