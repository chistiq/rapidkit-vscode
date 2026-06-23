import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface ModelSelectOption {
  id: string;
  name: string;
  vendor: string;
}

interface ModelSelectProps {
  value: string | null;
  models: ModelSelectOption[];
  onChange: (modelId: string | null) => void;
  disabled?: boolean;
  className?: string;
  showVendor?: boolean;
  /** Saved preferred id that may not be in the entitled list (Settings). */
  orphanValue?: string | null;
  autoLabel?: string;
  ariaLabel?: string;
  /** Overlay trigger for styled parents (e.g. chat composer pill). */
  variant?: 'field' | 'overlay';
}

interface OverlayMenuPosition {
  left: number;
  top: number;
  minWidth: number;
}

function formatModelLabel(model: ModelSelectOption, showVendor: boolean): string {
  if (showVendor && model.vendor) {
    return `${model.name} (${model.vendor})`;
  }
  return model.name;
}

function resolveFieldTriggerLabel(
  value: string | null,
  models: ModelSelectOption[],
  autoLabel: string,
  showVendor: boolean,
  orphanValue?: string | null
): string {
  const selectedId = value ?? '';
  if (!selectedId) {
    return autoLabel;
  }

  const selected = models.find((model) => model.id === selectedId);
  if (selected) {
    return formatModelLabel(selected, showVendor);
  }

  if (orphanValue && orphanValue === selectedId) {
    return `${orphanValue} (not entitled in this session)`;
  }

  return selectedId;
}

export function ModelSelect({
  value,
  models,
  onChange,
  disabled = false,
  className = 'workspai-model-select',
  showVendor = false,
  orphanValue,
  autoLabel = 'Auto — best available model',
  ariaLabel = 'AI model',
  variant = 'field',
}: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [overlayMenuPosition, setOverlayMenuPosition] = useState<OverlayMenuPosition | null>(null);

  const selectedId = value ?? '';
  const hasSelected = selectedId.length > 0;
  const selectedInList = hasSelected && models.some((model) => model.id === selectedId);
  const orphanId =
    orphanValue && orphanValue !== 'auto' && !models.some((model) => model.id === orphanValue)
      ? orphanValue
      : null;
  const isOverlay = variant === 'overlay';
  const fieldLabel = resolveFieldTriggerLabel(
    value,
    models,
    autoLabel,
    showVendor,
    orphanValue
  );

  const updateOverlayMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    setOverlayMenuPosition({
      left: rect.left,
      top: rect.top - 6,
      minWidth: Math.max(220, rect.width),
    });
  }, []);

  useEffect(() => {
    if (!open || !isOverlay) {
      return;
    }

    updateOverlayMenuPosition();
    window.addEventListener('resize', updateOverlayMenuPosition);
    document.addEventListener('scroll', updateOverlayMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateOverlayMenuPosition);
      document.removeEventListener('scroll', updateOverlayMenuPosition, true);
    };
  }, [open, isOverlay, updateOverlayMenuPosition, models.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
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

  const handleSelect = (modelId: string | null) => {
    onChange(modelId);
    setOpen(false);
  };

  const toggleOpen = () => {
    if (disabled) {
      return;
    }
    setOpen((current) => !current);
  };

  const rootClassName = [
    'ws-model-picker',
    isOverlay ? 'ws-model-picker--overlay' : 'ws-model-picker--field',
    open ? 'is-open' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const menuClassName = isOverlay
    ? 'ws-model-picker__menu ws-model-picker__menu--portal'
    : 'ws-model-picker__menu';

  const menuContent = open ? (
    <div
      ref={menuRef}
      id={listId}
      role="listbox"
      className={menuClassName}
      aria-label={ariaLabel}
      style={
        isOverlay && overlayMenuPosition
          ? {
              position: 'fixed',
              left: overlayMenuPosition.left,
              top: overlayMenuPosition.top,
              minWidth: overlayMenuPosition.minWidth,
              transform: 'translateY(-100%)',
            }
          : undefined
      }
    >
      <button
        type="button"
        role="option"
        aria-selected={!hasSelected}
        className={`ws-model-picker__option${!hasSelected ? ' is-selected' : ''}`}
        onClick={() => handleSelect(null)}
      >
        {autoLabel}
      </button>
      {orphanId && !selectedInList && selectedId === orphanId ? (
        <button
          type="button"
          role="option"
          aria-selected={true}
          className="ws-model-picker__option is-selected"
          onClick={() => handleSelect(orphanId)}
        >
          {orphanId} (not entitled in this session)
        </button>
      ) : null}
      {models.map((model) => {
        const isSelected = selectedId === model.id;
        return (
          <button
            key={model.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            className={`ws-model-picker__option${isSelected ? ' is-selected' : ''}`}
            onClick={() => handleSelect(model.id)}
          >
            <span className="ws-model-picker__option-name">
              {formatModelLabel(model, showVendor)}
            </span>
            {model.vendor ? (
              <span className="ws-model-picker__option-meta">{model.vendor}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={rootClassName}>
      {isOverlay ? (
        <button
          ref={triggerRef}
          type="button"
          className="ws-model-picker__overlay-trigger"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={toggleOpen}
        />
      ) : (
        <button
          type="button"
          className="ws-model-picker__field-trigger workspai-model-select"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={toggleOpen}
        >
          <span className="ws-model-picker__field-label">{fieldLabel}</span>
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={`ws-model-picker__chevron${open ? ' is-open' : ''}`}
          />
        </button>
      )}

      {isOverlay && open && overlayMenuPosition
        ? createPortal(menuContent, document.body)
        : !isOverlay
          ? menuContent
          : null}
    </div>
  );
}
