import {
  ExternalLink,
  KeyRound,
  Loader2,
  Palette,
  RefreshCw,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ModelSelect } from '@/components/ModelSelect';
import type { ThemeMode } from '@/components/StudioRedesign/styles/themeSystem';
import { vscode } from '@/vscode';

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

  useEffect(() => {
    setCustomBaseUrlDraft(customAIBaseUrl);
    setCustomModelDraft(customAIModel);
    setApiKeyDraft('');
  }, [aiProvider, customAIBaseUrl, customAIModel]);

  return (
    <section className="ws-settings-shell" aria-label="Workspai settings">
      <div className="ws-settings-header">
        <div>
          <div className="ws-kicker">Configuration</div>
          <h2 className="ws-settings-title">Workspai Settings</h2>
          <p className="ws-settings-subtitle">
            Manage AI defaults and extension preferences. More workspace controls will land here.
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
            <select value={aiProvider} onChange={(event) => onProviderChange(event.target.value)}>
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
                {aiProviderStatus?.ready ? 'Ready' : 'Setup required'}
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

          {usesVSCodeModels ? (
            <>
              <label className="ws-field">
                <span className="ws-field__label">Default model</span>
                <ModelSelect
                  value={preferredModelId === 'auto' ? null : preferredModelId}
                  models={availableModels}
                  orphanValue={preferredModelId}
                  showVendor
                  autoLabel="Auto — best available Copilot / LM model"
                  ariaLabel="Default AI model"
                  onChange={(modelId) => onPreferredModelChange(modelId ?? 'auto')}
                />
                <small className="ws-field__hint">
                  {preferredModelId === 'auto'
                    ? 'Workspai picks the best entitled model registered in VS Code.'
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
                  disabled={modelsLoading}
                >
                  {modelsLoading ? (
                    <Loader2 size={13} className="workspai-spinner" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Refresh entitled models
                </button>
                <span className="ws-settings-meta">
                  {availableModels.length === 0
                    ? 'No language models detected — install GitHub Copilot or another LM extension.'
                    : `${availableModels.length} entitled model(s) in this VS Code session`}
                </span>
              </div>
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
                  setApiKeyDraft('');
                }}
                disabled={!apiKeyDraft.trim()}
              >
                Save API key
              </button>
              <button
                type="button"
                className="ws-btn ws-btn--ghost"
                onClick={onCustomAIAPIKeyClear}
              >
                Clear key
              </button>
            </div>

            <div className="ws-settings-row">
              <button
                type="button"
                className="ws-btn"
                onClick={onTestAIProvider}
                disabled={providerHealthChecking}
              >
                {providerHealthChecking ? (
                  <Loader2 size={13} className="workspai-spinner" />
                ) : (
                  <RefreshCw size={13} />
                )}
                Test provider
              </button>
              <span className="ws-settings-meta">
                {aiProviderHealthCheck
                  ? aiProviderHealthCheck.ok
                    ? `Healthy${aiProviderHealthCheck.latencyMs ? ` · ${aiProviderHealthCheck.latencyMs}ms` : ''}`
                    : aiProviderHealthCheck.reason || 'Health check failed'
                  : 'Runs a minimal live request without storing response content.'}
              </span>
            </div>
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
