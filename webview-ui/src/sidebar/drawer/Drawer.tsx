import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  icon?: ReactNode;
  /** `auto` grows to fit content (no internal scroll). Default for create forms. */
  sizing?: 'auto' | 'compact';
}

/**
 * Bottom-anchored drawer that stacks above the fixed composer (Cursor-style).
 * Opens on user action and closes after submit or Cancel.
 */
export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  icon,
  sizing = 'auto',
}: DrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={`ws-drawer${sizing === 'auto' ? ' ws-drawer--auto' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="ws-drawer__head">
        <div className="ws-drawer__title-row">
          {icon ? <span className="ws-drawer__icon">{icon}</span> : null}
          <div>
            <strong className="ws-drawer__title">{title}</strong>
            {subtitle ? <p className="ws-drawer__subtitle">{subtitle}</p> : null}
          </div>
        </div>
        <button type="button" className="ws-drawer__close" aria-label="Close" onClick={onClose}>
          <X size={14} aria-hidden={true} />
        </button>
      </header>
      <div className="ws-drawer__body">{children}</div>
      {footer ? <footer className="ws-drawer__foot">{footer}</footer> : null}
    </div>
  );
}
