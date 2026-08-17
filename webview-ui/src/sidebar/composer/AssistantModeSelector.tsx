import { useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronUp, ListChecks, MessageCircle, Target } from 'lucide-react';

export type AssistantMode = 'agent' | 'ask' | 'plan' | 'goal';

const MODES = [
  {
    id: 'agent' as const,
    label: 'Agent',
    description: 'Investigate, apply safe fixes, and verify automatically',
    icon: Bot,
  },
  {
    id: 'ask' as const,
    label: 'Ask',
    description: 'Answer from workspace evidence without changing files',
    icon: MessageCircle,
  },
  {
    id: 'plan' as const,
    label: 'Plan',
    description: 'Prepare a rollback-aware plan without applying it',
    icon: ListChecks,
  },
  {
    id: 'goal' as const,
    label: 'Goal',
    description: 'Pursue any bounded outcome with governed evidence and verification',
    icon: Target,
  },
] as const;

export function AssistantModeSelector(props: {
  value: AssistantMode;
  onChange: (mode: AssistantMode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = MODES.find((mode) => mode.id === props.value) ?? MODES[0];
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
        aria-label={`Assistant mode: ${selected.label}`}
        title={selected.description}
        disabled={props.disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <SelectedIcon size={13} strokeWidth={1.8} aria-hidden="true" />
        <span>{selected.label}</span>
        <ChevronUp
          size={11}
          strokeWidth={1.8}
          aria-hidden="true"
          className={open ? '' : 'is-closed'}
        />
      </button>
      {open ? (
        <div className="ws-assistant-mode__menu" role="menu" aria-label="Select assistant mode">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            const active = mode.id === props.value;
            return (
              <button
                key={mode.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className="ws-assistant-mode__option"
                onClick={() => {
                  props.onChange(mode.id);
                  setOpen(false);
                }}
              >
                <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>
                  <strong>{mode.label}</strong>
                  <small>{mode.description}</small>
                </span>
                {active ? <Check size={13} strokeWidth={2} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
