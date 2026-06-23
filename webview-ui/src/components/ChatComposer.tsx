import { useCallback, useEffect, useRef } from 'react';
import { ChevronDown, Send, Sparkles, Square } from 'lucide-react';
import { ModelSelect, type ModelSelectOption } from '@/components/ModelSelect';
import { resolveChatModelLabel } from '@/lib/chatModelLabel';

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  submitDisabled?: boolean;
  submitDisabledReason?: string;
  availableModels?: ModelSelectOption[];
  selectedModelId?: string | null;
  preferredModelId?: string;
  onModelChange?: (modelId: string | null) => void;
  modelsLoading?: boolean;
  showModelPicker?: boolean;
  hint?: string;
  variant?: 'studio' | 'assist';
  inputAriaLabel?: string;
  focusRequestToken?: number;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = 'Ask anything… (Shift+Enter for new line)',
  submitDisabled = false,
  submitDisabledReason,
  availableModels = [],
  selectedModelId = null,
  preferredModelId = 'auto',
  onModelChange,
  modelsLoading = false,
  showModelPicker = true,
  hint,
  variant = 'studio',
  inputAriaLabel = 'Message input',
  focusRequestToken = 0,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [value, adjustTextareaHeight]);

  useEffect(() => {
    if (!focusRequestToken) {
      return;
    }
    textareaRef.current?.focus();
    adjustTextareaHeight();
  }, [focusRequestToken, adjustTextareaHeight]);

  const sendBlocked = submitDisabled || (!isStreaming && !value.trim()) || disabled;
  const modelLabel = resolveChatModelLabel(selectedModelId, availableModels, preferredModelId);
  const showModels = showModelPicker && availableModels.length > 0 && onModelChange;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (isStreaming) {
        onStop?.();
        return;
      }
      if (!sendBlocked) {
        onSubmit();
      }
    }
  };

  return (
    <div className={`ws-chat-composer ws-chat-composer--${variant}`}>
      <div className="ws-chat-composer__box">
        <textarea
          ref={textareaRef}
          className="ws-chat-composer__input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || (isStreaming && !onStop)}
          aria-label={inputAriaLabel}
          aria-multiline="true"
          rows={1}
        />
        <div className="ws-chat-composer__toolbar">
          <div className="ws-chat-composer__toolbar-left">
            {showModels ? (
              <label className="ws-chat-composer__model-pill" title="AI model">
                <Sparkles size={12} aria-hidden="true" />
                <span className="ws-chat-composer__model-label">
                  {modelsLoading ? 'Loading…' : modelLabel}
                </span>
                <ChevronDown size={12} aria-hidden="true" />
                <ModelSelect
                  variant="overlay"
                  className="ws-chat-composer__model-select"
                  value={selectedModelId}
                  models={availableModels}
                  orphanValue={preferredModelId}
                  disabled={disabled || isStreaming || modelsLoading}
                  autoLabel="Auto"
                  ariaLabel="AI model"
                  onChange={onModelChange}
                />
              </label>
            ) : null}
          </div>
          <div className="ws-chat-composer__toolbar-right">
            {hint ? <span className="ws-chat-composer__hint">{hint}</span> : null}
            <button
              type="button"
              className={`ws-chat-composer__send${sendBlocked && !isStreaming ? ' is-disabled' : ''}`}
              onClick={isStreaming ? onStop : onSubmit}
              disabled={isStreaming ? !onStop : sendBlocked}
              aria-disabled={isStreaming ? !onStop : sendBlocked}
              title={
                isStreaming
                  ? 'Stop generation'
                  : submitDisabledReason || (sendBlocked ? 'Enter a message first' : 'Send message')
              }
              aria-label={isStreaming ? 'Stop generation' : 'Send message'}
            >
              {isStreaming ? <Square size={14} /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
