import {
  ExternalLink,
  KeyRound,
  Loader2,
  Palette,
  RefreshCw,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ModelSelect } from '@/components/ModelSelect';
import type { ThemeMode } from '@/components/StudioRedesign/styles/themeSystem';
import { vscode } from '@/vscode';
import type { ProviderSettingsNotice } from '@/lib/useAIProviderSettingsActions';

export interface WorkspaiSettingsModel {
  id: string;
  name: string;
  vendor: string;
}

export interface WorkspaiAIProviderDefinition {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  protocol: 'vscode-lm' | 'openai-compatible' | 'anthropic-messages';
  defaultBaseUrl: string;
  defaultModel: string;
  modelSuggestions: readonly string[];
  requiresApiKey: boolean;
  apiKeyLabel: string;
  docsUrl?: string;
  apiKeyUrl?: string;
  configurableBaseUrl: boolean;
}

interface WorkspaiSettingsPanelProps {
  availableModels: WorkspaiSettingsModel[];
  preferredModelId: string;
  aiProvider: string;
  aiProviderCatalog: WorkspaiAIProviderDefinition[];
  customAIBaseUrl: string;
  customAIModel: string;
  aiProviderStatus: {
    provider: string;
    ready: boolean;
    label: string;
    reason?: string;
    hasApiKey?: boolean;
  } | null;
  aiProviderHealthCheck: {
    ok: boolean;
    label: string;
    latencyMs?: number;
    model?: string;
    reason?: string;
  } | null;
  providerHealthChecking: boolean;
  providerSettingsPending?: string | null;
  providerSettingsNotice?: ProviderSettingsNotice | null;
  modelsLoading: boolean;
  onPreferredModelChange: (modelId: string) => void;
  onProviderChange: (provider: string) => void;
  onCustomAIConfigSave: (input: { baseUrl: string; model: string }) => void;
  onCustomAIAPIKeySave: (apiKey: string) => void;
  onCustomAIAPIKeyClear: () => void;
  onTestAIProvider: () => void;
  onRefreshModels: () => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}

export function WorkspaiSettingsPanel({
  availableModels,
  preferredModelId,
  aiProvider,
  aiProviderCatalog,
  customAIBaseUrl,
  customAIModel,
  aiProviderStatus,
  aiProviderHealthCheck,
  providerHealthChecking,
  providerSettingsPending,
  providerSettingsNotice,
  modelsLoading,
  onPreferredModelChange,
  onProviderChange,
  onCustomAIConfigSave,
  onCustomAIAPIKeySave,
  onCustomAIAPIKeyClear,
  onTestAIProvider,
  onRefreshModels,
  themeMode,
  onThemeModeChange,
}: WorkspaiSettingsPanelProps) {
  const selectedModel = availableModels.find((model) => model.id === preferredModelId);
  const selectedProvider = useMemo(
    () => aiProviderCatalog.find((provider) => provider.id === aiProvider),
    [aiProvider, aiProviderCatalog]
  );
  const usesVSCodeModels =
    selectedProvider?.protocol === 'vscode-lm' || (!selectedProvider && aiProvider === 'vscode-lm');
  const [customBaseUrlDraft, setCustomBaseUrlDraft] = useState(customAIBaseUrl);
  const [customModelDraft, setCustomModelDraft] = useState(customAIModel);
  const [apiKeyDraft, setApiKeyDraft] = useState('');

  const savedConfig = useRef({
    provider: aiProvider,
    baseUrl: customAIBaseUrl,
    model: customAIModel,
  });
  const busy = Boolean(providerSettingsPending) || providerHealthChecking;
  const configDirty =
    customBaseUrlDraft.trim() !== customAIBaseUrl || customModelDraft.trim() !== customAIModel;
  const unsaved = configDirty || Boolean(apiKeyDraft.trim());

  useEffect(() => {
    const previous = savedConfig.current;
    const changedProvider = previous.provider !== aiProvider;
    setCustomBaseUrlDraft((draft) =>
      changedProvider || draft.trim() === previous.baseUrl || draft.trim() === customAIBaseUrl
        ? customAIBaseUrl
        : draft
    );
    setCustomModelDraft((draft) =>
      changedProvider || draft.trim() === previous.model || draft.trim() === customAIModel
        ? customAIModel
        : draft
    );
    if (changedProvider) {
      setApiKeyDraft('');
    }
    savedConfig.current = { provider: aiProvider, baseUrl: customAIBaseUrl, model: customAIModel };
  }, [aiProvider, customAIBaseUrl, customAIModel]);

  useEffect(() => {
    if (
      providerSettingsNotice?.ok &&
      providerSettingsNotice.provider === aiProvider &&
      providerSettingsNotice.command === 'setCustomAIAPIKey'
    ) {
      setApiKeyDraft('');
    }
  }, [providerSettingsNotice, aiProvider]);

  const testProviderRow = (
    <div className="ws-settings-row">
      <button
        type="button"
        className="ws-btn"
        onClick={onTestAIProvider}
        disabled={busy || unsaved || !aiProviderStatus?.ready}
      >
        {providerHealthChecking ? (
          <Loader2 size={13} className="workspai-spinner" />
        ) : (
          <RefreshCw size={13} />
        )}
        Test provider
      </button>
      <span className="ws-settings-meta">
        {unsaved
          ? 'Save your config and API key before testing.'
          : aiProviderHealthCheck
            ? aiProviderHealthCheck.ok
              ? `Healthy${aiProviderHealthCheck.latencyMs ? ` · ${aiProviderHealthCheck.latencyMs}ms` : ''}`
              : aiProviderHealthCheck.reason || 'Health check failed'
            : 'Tests the saved configuration with a minimal live request.'}
      </span>
    </div>
  );

  return (
    <section className="ws-settings-shell" aria-label="Workspai settings">
      <div className="ws-settings-header">
        <div>
          <div className="ws-kicker">Configuration</div>
          <h2 className="ws-settings-title">Workspai Settings</h2>
          <p className="ws-settings-subtitle">
            Choose your AI provider, connection, model, and appearance.
          </p>
        </div>
        <button
          type="button"
          className="ws-btn ws-btn--ghost"
          onClick={() => vscode.postMessage('openWorkspaiExtensionSettings')}
        >
          <ExternalLink size={13} />
          VS Code settings
        </button>
      </div>

      <div className="ws-settings-grid">
        <article className="ws-card ws-settings-card">
          <div className="ws-settings-card-head">
            <Sparkles size={15} />
            <div>
              <h3>AI &amp; Models</h3>
              <p>Choose the model source used by Create, Assistant, and governed repair flows.</p>
            </div>
          </div>

          <label className="ws-field">
            <span className="ws-field__label">Provider</span>
            <select
              value={aiProvider}
              disabled={busy || aiProviderCatalog.length === 0}
              onChange={(event) => onProviderChange(event.target.value)}
            >
              {aiProviderCatalog.length === 0 ? (
                <option value={aiProvider}>Loading providers...</option>
              ) : null}
              {aiProviderCatalog.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
            <small className="ws-field__hint">
              {selectedProvider?.description ?? 'Choose how Workspai reaches your model.'}
            </small>
          </label>

          <div className="ws-settings-provider-summary">
            <div>
              <span
                className={`ws-settings-provider-state ${
                  aiProviderStatus?.ready ? 'is-ready' : 'needs-setup'
                }`}
              >
                {aiProviderStatus?.ready ? 'Configured' : 'Setup required'}
              </span>
              <strong>{selectedProvider?.shortLabel ?? aiProviderStatus?.label}</strong>
            </div>
            <div className="ws-settings-provider-links">
              {selectedProvider?.docsUrl ? (
                <button
                  type="button"
                  className="ws-btn ws-btn--ghost"
                  onClick={() =>
                    vscode.postMessage('openAIProviderLink', {
                      provider: aiProvider,
                      destination: 'docs',
                    })
                  }
                >
                  <ExternalLink size={12} />
                  Setup guide
                </button>
              ) : null}
              {selectedProvider?.apiKeyUrl ? (
                <button
                  type="button"
                  className="ws-btn ws-btn--ghost"
                  onClick={() =>
                    vscode.postMessage('openAIProviderLink', {
                      provider: aiProvider,
                      destination: 'api-key',
                    })
                  }
                >
                  <KeyRound size={12} />
                  Get API key
                </button>
              ) : null}
            </div>
          </div>

          {aiProviderStatus?.reason ? (
            <p className="ws-field__hint" role="status">
              {aiProviderStatus.reason}
            </p>
          ) : null}
          {providerSettingsPending ? (
            <p className="ws-field__hint" role="status">
              {providerHealthChecking ? 'Testing provider...' : 'Saving provider settings...'}
            </p>
          ) : null}
          {providerSettingsNotice && providerSettingsNotice.provider === aiProvider ? (
            <p className="ws-field__hint" role={providerSettingsNotice.ok ? 'status' : 'alert'}>
              {providerSettingsNotice.message}
            </p>
          ) : null}

          {usesVSCodeModels ? (
            <>
              <label className="ws-field">
                <span className="ws-field__label">Default model</span>
                <ModelSelect
                  disabled={busy}
                  value={preferredModelId === 'auto' ? null : preferredModelId}
                  models={availableModels}
                  orphanValue={preferredModelId}
                  showVendor
                  autoLabel="Auto — available VS Code model"
                  ariaLabel="Default AI model"
                  onChange={(modelId) => onPreferredModelChange(modelId ?? 'auto')}
                />
                <small className="ws-field__hint">
                  {preferredModelId === 'auto'
                    ? 'Use provider Auto when available, otherwise an available VS Code model.'
                    : selectedModel
                      ? `Using ${selectedModel.name}${selectedModel.vendor ? ` · ${selectedModel.vendor}` : ''}.`
                      : 'Selected model is not currently entitled in this VS Code session.'}
                </small>
              </label>

              <div className="ws-settings-row">
                <button
                  type="button"
                  className="ws-btn"
                  onClick={onRefreshModels}
                  disabled={busy || modelsLoading}
                >
                  {modelsLoading ? (
                    <Loader2 size={13} className="workspai-spinner" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Refresh available models
                </button>
                <span className="ws-settings-meta">
                  {availableModels.length === 0
                    ? 'No language models detected — install GitHub Copilot or another LM extension.'
                    : `${availableModels.length} entitled model(s) in this VS Code session`}
                </span>
              </div>
              {testProviderRow}
            </>
          ) : null}
        </article>

        {usesVSCodeModels ? null : (
          <article className="ws-card ws-settings-card ws-settings-card--muted">
            <div className="ws-settings-card-head">
              <KeyRound size={15} />
              <div>
                <h3>{selectedProvider?.shortLabel ?? 'API provider'} connection</h3>
                <p>
                  Model and endpoint settings stay in VS Code. Credentials stay in Secret Storage.
                </p>
              </div>
            </div>

            <label className="ws-field">
              <span className="ws-field__label">Base URL</span>
              <input
                value={customBaseUrlDraft}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setCustomBaseUrlDraft(event.target.value)}
                placeholder={selectedProvider?.defaultBaseUrl || 'https://api.example.com/v1'}
                readOnly={!selectedProvider?.configurableBaseUrl}
              />
              <small className="ws-field__hint">
                {selectedProvider?.configurableBaseUrl
                  ? 'Use HTTPS for hosted providers; HTTP is accepted only for localhost.'
                  : 'Official provider endpoint. Choose Custom API to enter another endpoint.'}
              </small>
            </label>

            <label className="ws-field">
              <span className="ws-field__label">Model</span>
              <input
                value={customModelDraft}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setCustomModelDraft(event.target.value)}
                placeholder={selectedProvider?.defaultModel || 'provider-model-id'}
                list={`workspai-provider-models-${aiProvider}`}
              />
              {selectedProvider?.modelSuggestions.length ? (
                <datalist id={`workspai-provider-models-${aiProvider}`}>
                  {selectedProvider.modelSuggestions.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              ) : null}
              <small className="ws-field__hint">
                Enter the exact model ID exposed by {selectedProvider?.shortLabel ?? 'the provider'}
                .
              </small>
            </label>

            <div className="ws-settings-row">
              <button
                type="button"
                className="ws-btn"
                disabled={busy || !configDirty}
                onClick={() =>
                  onCustomAIConfigSave({
                    baseUrl: customBaseUrlDraft,
                    model: customModelDraft,
                  })
                }
              >
                Save provider config
              </button>
              <span className="ws-settings-meta">
                API keys are stored in VS Code Secret Storage only.
              </span>
            </div>

            <label className="ws-field">
              <span className="ws-field__label">{selectedProvider?.apiKeyLabel ?? 'API key'}</span>
              <input
                type="password"
                disabled={busy}
                autoComplete="new-password"
                spellCheck={false}
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder={
                  aiProviderStatus?.hasApiKey
                    ? 'Key saved'
                    : selectedProvider?.requiresApiKey
                      ? 'Paste key to save'
                      : 'Optional for this local provider'
                }
              />
            </label>

            <div className="ws-settings-row">
              <button
                type="button"
                className="ws-btn"
                onClick={() => {
                  onCustomAIAPIKeySave(apiKeyDraft);
                }}
                disabled={busy || !apiKeyDraft.trim()}
              >
                Save API key
              </button>
              <button
                type="button"
                className="ws-btn ws-btn--ghost"
                onClick={onCustomAIAPIKeyClear}
                disabled={busy || !aiProviderStatus?.hasApiKey}
              >
                Clear key
              </button>
            </div>

            {testProviderRow}
          </article>
        )}

        <article className="ws-card ws-settings-card">
          <div className="ws-settings-card-head">
            <Palette size={15} />
            <div>
              <h3>Appearance</h3>
              <p>Choose how Workspai webviews follow your editor color theme.</p>
            </div>
          </div>

          <label className="ws-field">
            <span className="ws-field__label">Theme mode</span>
            <select
              value={themeMode}
              onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}
            >
              <option value="auto">Auto — follow VS Code theme</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <small className="ws-field__hint">
              {themeMode === 'auto'
                ? 'Dashboard, Setup, Settings, and Incident Studio track your active VS Code color theme.'
                : themeMode === 'light'
                  ? 'Workspai webviews stay on the light palette regardless of your editor theme.'
                  : 'Workspai webviews stay on the dark palette regardless of your editor theme.'}
            </small>
          </label>
        </article>

        <article className="ws-card ws-settings-card ws-settings-card--muted">
          <div className="ws-settings-card-head">
            <Settings2 size={15} />
            <div>
              <h3>More settings</h3>
              <p>Timeouts, telemetry, and advanced AI controls stay in VS Code settings for now.</p>
            </div>
          </div>
          <button
            type="button"
            className="ws-btn"
            onClick={() => vscode.postMessage('openWorkspaiExtensionSettings')}
          >
            <ExternalLink size={13} />
            Open Workspai extension settings
          </button>
        </article>
      </div>
    </section>
  );
}
