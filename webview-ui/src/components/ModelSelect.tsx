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
}: ModelSelectProps) {
  const selectedId = value ?? '';
  const hasSelected = selectedId.length > 0;
  const selectedInList = hasSelected && models.some((model) => model.id === selectedId);
  const orphanId =
    orphanValue && orphanValue !== 'auto' && !models.some((model) => model.id === orphanValue)
      ? orphanValue
      : null;

  return (
    <select
      className={className}
      value={hasSelected ? selectedId : ''}
      onChange={(event) => onChange(event.target.value.trim() ? event.target.value : null)}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <option value="">{autoLabel}</option>
      {orphanId && !selectedInList && selectedId === orphanId ? (
        <option value={orphanId}>{orphanId} (not entitled in this session)</option>
      ) : null}
      {models.map((model) => (
        <option key={model.id} value={model.id}>
          {showVendor && model.vendor ? `${model.name} (${model.vendor})` : model.name}
        </option>
      ))}
    </select>
  );
}
