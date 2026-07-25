import { Boxes, Check, ChevronUp, FolderPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type CreateTarget = 'workspace' | 'project';

const TARGETS = [
  {
    id: 'workspace' as const,
    label: 'Workspace',
    description: 'Create a governed workspace and its first project',
    icon: Boxes,
  },
  {
    id: 'project' as const,
    label: 'Project',
    description: 'Create one project in the selected or default workspace',
    icon: FolderPlus,
  },
] as const;

export function CreateTargetSelector(props: {
  value: CreateTarget;
  onChange: (target: CreateTarget) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = TARGETS.find((target) => target.id === props.value) ?? TARGETS[0];
  const SelectedIcon = selected.icon;

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="ws-assistant-mode" ref={rootRef}>
      <button
        type="button"
        className="ws-assistant-mode__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Create target: ${selected.label}`}
        title={selected.description}
        disabled={props.disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <SelectedIcon size={13} strokeWidth={1.8} aria-hidden={true} />
        <span>{selected.label}</span>
        <ChevronUp
          size={11}
          strokeWidth={1.8}
          aria-hidden={true}
          className={open ? '' : 'is-closed'}
        />
      </button>
      {open ? (
        <div className="ws-assistant-mode__menu" role="menu" aria-label="Select create target">
          {TARGETS.map((target) => {
            const Icon = target.icon;
            const active = target.id === props.value;
            return (
              <button
                key={target.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className="ws-assistant-mode__option"
                onClick={() => {
                  props.onChange(target.id);
                  setOpen(false);
                }}
              >
                <Icon size={14} strokeWidth={1.75} aria-hidden={true} />
                <span>
                  <strong>{target.label}</strong>
                  <small>{target.description}</small>
                </span>
                {active ? <Check size={13} strokeWidth={2} aria-hidden={true} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
