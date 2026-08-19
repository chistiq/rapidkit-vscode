import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { ArrowUp, Plus, Square } from 'lucide-react';
import { ModelPicker } from '../ModelPicker';
import type { SidebarModel } from '../sidebarModels';

interface ComposerShellProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled?: boolean;
  models: SidebarModel[];
  selectedModelId: string | null;
  onSelectModel: (id: string | null) => void;
  onRefreshModels?: () => void;
  onOpenAdd?: () => void;
  addLabel?: string;
  contextLabel?: string;
  drawer?: React.ReactNode;
  modeSelector?: ReactNode;
  running?: boolean;
  onCancel?: () => void;
}

const MIN_INPUT_HEIGHT = 48;
const MAX_INPUT_HEIGHT = 160;

/** Fixed composer with a rounded surface, standard input height, and warm hover states. */
export function ComposerShell(props: ComposerShellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    syncHeight();
  }, [props.value, syncHeight]);

  const handleChange = (next: string) => {
    props.onChange(next);
    requestAnimationFrame(syncHeight);
  };

  const submit = () => {
    if (props.disabled || !props.value.trim()) {
      return;
    }
    props.onSubmit();
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = `${MIN_INPUT_HEIGHT}px`;
        textareaRef.current.style.overflowY = 'hidden';
      }
    });
  };

  return (
    <div className="ws-composer-dock">
      {props.drawer}
      <div
        className={`ws-composer__surface${props.disabled ? ' is-disabled' : ''}`}
        aria-label="Message composer"
      >
        {props.contextLabel ? (
          <div className="ws-composer__context" title={props.contextLabel}>
            {props.contextLabel}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          className="ws-composer__input"
          rows={2}
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          onChange={(e) => handleChange(e.target.value)}
          onInput={syncHeight}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="ws-composer__toolbar">
          {props.modeSelector}
          <ModelPicker
            models={props.models}
            selectedId={props.selectedModelId}
            onSelect={props.onSelectModel}
            onRefreshModels={props.onRefreshModels}
          />
          <div className="ws-composer__toolbar-spacer" />
          {props.onOpenAdd ? (
            <button
              type="button"
              className="ws-composer__icon-btn"
              aria-label={props.addLabel ?? 'Add'}
              title={props.addLabel ?? 'Add'}
              onClick={props.onOpenAdd}
            >
              <Plus size={16} aria-hidden={true} />
            </button>
          ) : null}
          <button
            type="button"
            className="ws-composer__send"
            aria-label={props.running && !props.value.trim() ? 'Stop' : 'Send'}
            title={props.running && !props.value.trim() ? 'Stop' : 'Send'}
            disabled={props.disabled || (!props.value.trim() && !props.running)}
            onClick={() => {
              if (props.running && !props.value.trim()) {
                props.onCancel?.();
                return;
              }
              submit();
            }}
          >
            {props.running && !props.value.trim() ? (
              <Square size={12} fill="currentColor" aria-hidden={true} />
            ) : (
              <ArrowUp size={15} strokeWidth={2.5} aria-hidden={true} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
