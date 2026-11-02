import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { ArrowUp, Plus, Square, Paperclip } from 'lucide-react';
import { ModelPicker } from '../ModelPicker';
import type { SidebarModel } from '../sidebarModels';

interface ComposerShellProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled?: boolean;
  models: SidebarModel[];
  modelLoadError?: string | null;
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
  onAttach?: (files: File[]) => void;
  attachments?: ReactNode;
  hasAttachments?: boolean;
}

const MIN_INPUT_HEIGHT = 48;
const MAX_INPUT_HEIGHT = 160;

/** Fixed composer with a rounded surface, standard input height, and warm hover states. */
export function ComposerShell(props: ComposerShellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (props.disabled || (!props.value.trim() && !props.hasAttachments)) {
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
  const canStop = Boolean(props.running && props.onCancel);

  return (
    <div className="ws-composer-dock">
      {props.drawer}
      <div
        className={`ws-composer__surface${props.disabled ? ' is-disabled' : ''}`}
        aria-label="Message composer"
        onDragOver={(event) => {
          if (props.onAttach && !props.disabled) event.preventDefault();
        }}
        onDrop={(event) => {
          if (props.onAttach && !props.disabled && event.dataTransfer.files.length) {
            event.preventDefault();
            props.onAttach(Array.from(event.dataTransfer.files));
          }
        }}
      >
        {props.attachments}
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
          aria-label={props.contextLabel ? `Message ${props.contextLabel}` : props.placeholder}
          disabled={props.disabled}
          onChange={(e) => handleChange(e.target.value)}
          onInput={syncHeight}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length && props.onAttach && !props.disabled) {
              event.preventDefault();
              props.onAttach(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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
            loadError={props.modelLoadError}
            onSelect={props.onSelectModel}
            onRefreshModels={props.onRefreshModels}
          />
          <div className="ws-composer__toolbar-spacer" />
          {props.onAttach ? (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  props.onAttach?.(files);
                }}
              />
              <button
                type="button"
                className="ws-composer__icon-btn"
                disabled={props.disabled}
                aria-label="Attach files"
                title="Attach files or images"
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip size={15} aria-hidden="true" />
              </button>
            </>
          ) : null}
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
          {canStop && (
            <button
              type="button"
              className="ws-composer__send"
              aria-label="Stop"
              title="Stop"
              onClick={props.onCancel}
            >
              <Square size={12} fill="currentColor" aria-hidden="true" />
            </button>
          )}
          {(!canStop || props.value.trim() || props.hasAttachments) && (
            <button
              type="button"
              className="ws-composer__send"
              aria-label="Send"
              title="Send"
              disabled={props.disabled || (!props.value.trim() && !props.hasAttachments)}
              onClick={submit}
            >
              <ArrowUp size={15} strokeWidth={2.5} aria-hidden={true} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
