import { ExternalLink, KeyRound, Loader2, Palette, RefreshCw, Settings2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { ModelSelect } from '@/components/ModelSelect';
import type { ThemeMode } from '@/components/StudioRedesign/styles/themeSystem';
import { vscode } from '@/vscode';

export interface WorkspaiSettingsModel {
  id: string;
  name: string;
  vendor: string;
}

interface WorkspaiSettingsPanelProps {
  availableModels: WorkspaiSettingsModel[];
  preferredModelId: string;
  aiProvider: 'vscode-lm' | 'openai-compatible';
  customAIBaseUrl: string;
  customAIModel: string;
  aiProviderStatus: {
    provider: 'vscode-lm' | 'openai-compatible';
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
  onProviderChange: (provider: 'vscode-lm' | 'openai-compatible') => void;
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
  const [customBaseUrlDraft, setCustomBaseUrlDraft] = useState(customAIBaseUrl);
  const [customModelDraft, setCustomModelDraft] = useState(customAIModel);
  const [apiKeyDraft, setApiKeyDraft] = useState('');

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
              <p>Default model for Create with AI, Workspace Advisor, Studio, and background AI flows.</p>
            </div>
          </div>

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
              {modelsLoading ? <Loader2 size={13} className="workspai-spinner" /> : <RefreshCw size={13} />}
              Refresh entitled models
            </button>
            <span className="ws-settings-meta">
              {availableModels.length === 0
                ? 'No language models detected — install GitHub Copilot or another LM extension.'
                : `${availableModels.length} entitled model(s) in this VS Code session`}
            </span>
          </div>

          {availableModels.length > 0 && (
            <div className="ws-settings-model-list" role="list" aria-label="Available models">
              {availableModels.map((model) => (
                <div key={model.id} className="ws-settings-model-row" role="listitem">
                  <strong>{model.name}</strong>
                  <span>{model.vendor || 'unknown vendor'}</span>
                  <code>{model.id}</code>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="ws-card ws-settings-card ws-settings-card--muted">
          <div className="ws-settings-card-head">
            <KeyRound size={15} />
            <div>
              <h3>Custom API providers</h3>
              <p>Bring your own OpenAI-compatible endpoint for Studio and AI workflows.</p>
            </div>
          </div>
          <label className="ws-field">
            <span className="ws-field__label">AI provider</span>
            <select
              value={aiProvider}
              onChange={(event) =>
                onProviderChange(
                  event.target.value === 'openai-compatible' ? 'openai-compatible' : 'vscode-lm'
                )
              }
            >
              <option value="vscode-lm">VS Code Language Model</option>
              <option value="openai-compatible">OpenAI-compatible API</option>
            </select>
            <small className="ws-field__hint">
              {aiProviderStatus?.ready
                ? `${aiProviderStatus.label} is ready.`
                : aiProviderStatus?.reason || 'Provider setup required before AI actions can run.'}
            </small>
          </label>

          <label className="ws-field">
            <span className="ws-field__label">Base URL</span>
            <input
              value={customBaseUrlDraft}
              onChange={(event) => setCustomBaseUrlDraft(event.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </label>

          <label className="ws-field">
            <span className="ws-field__label">Model</span>
            <input
              value={customModelDraft}
              onChange={(event) => setCustomModelDraft(event.target.value)}
              placeholder="gpt-4o-mini"
            />
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
            <span className="ws-field__label">API key</span>
            <input
              type="password"
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder={aiProviderStatus?.hasApiKey ? 'Key saved' : 'Paste key to save'}
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
            <button type="button" className="ws-btn ws-btn--ghost" onClick={onCustomAIAPIKeyClear}>
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
