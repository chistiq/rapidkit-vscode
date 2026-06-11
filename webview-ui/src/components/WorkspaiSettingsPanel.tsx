import { ExternalLink, KeyRound, Loader2, RefreshCw, Settings2, Sparkles } from 'lucide-react';
import { ModelSelect } from '@/components/ModelSelect';
import { vscode } from '@/vscode';

export interface WorkspaiSettingsModel {
  id: string;
  name: string;
  vendor: string;
}

interface WorkspaiSettingsPanelProps {
  availableModels: WorkspaiSettingsModel[];
  preferredModelId: string;
  modelsLoading: boolean;
  onPreferredModelChange: (modelId: string) => void;
  onRefreshModels: () => void;
}

export function WorkspaiSettingsPanel({
  availableModels,
  preferredModelId,
  modelsLoading,
  onPreferredModelChange,
  onRefreshModels,
}: WorkspaiSettingsPanelProps) {
  const selectedModel = availableModels.find((model) => model.id === preferredModelId);

  return (
    <section className="workspai-settings" aria-label="Workspai settings">
      <div className="workspai-settings-header">
        <div>
          <div className="workspai-settings-kicker">Configuration</div>
          <h2 className="workspai-settings-title">Workspai Settings</h2>
          <p className="workspai-settings-subtitle">
            Manage AI defaults and extension preferences. More workspace controls will land here.
          </p>
        </div>
        <button
          type="button"
          className="workspai-settings-link-btn"
          onClick={() => vscode.postMessage('openWorkspaiExtensionSettings')}
        >
          <ExternalLink size={13} />
          VS Code settings
        </button>
      </div>

      <div className="workspai-settings-grid">
        <article className="workspai-settings-card">
          <div className="workspai-settings-card-head">
            <Sparkles size={15} />
            <div>
              <h3>AI &amp; Models</h3>
              <p>Default model for AIModal, Incident Studio, and background AI flows.</p>
            </div>
          </div>

          <label className="workspai-settings-field">
            <span>Default model</span>
            <ModelSelect
              value={preferredModelId === 'auto' ? null : preferredModelId}
              models={availableModels}
              orphanValue={preferredModelId}
              showVendor
              autoLabel="Auto — best available Copilot / LM model"
              ariaLabel="Default AI model"
              onChange={(modelId) => onPreferredModelChange(modelId ?? 'auto')}
            />
            <small>
              {preferredModelId === 'auto'
                ? 'Workspai picks the best entitled model registered in VS Code.'
                : selectedModel
                  ? `Using ${selectedModel.name}${selectedModel.vendor ? ` · ${selectedModel.vendor}` : ''}.`
                  : 'Selected model is not currently entitled in this VS Code session.'}
            </small>
          </label>

          <div className="workspai-settings-row">
            <button
              type="button"
              className="workspai-settings-secondary-btn"
              onClick={onRefreshModels}
              disabled={modelsLoading}
            >
              {modelsLoading ? <Loader2 size={13} className="workspai-spinner" /> : <RefreshCw size={13} />}
              Refresh entitled models
            </button>
            <span className="workspai-settings-meta">
              {availableModels.length === 0
                ? 'No language models detected — install GitHub Copilot or another LM extension.'
                : `${availableModels.length} entitled model(s) in this VS Code session`}
            </span>
          </div>

          {availableModels.length > 0 && (
            <div className="workspai-settings-model-list" role="list" aria-label="Available models">
              {availableModels.map((model) => (
                <div key={model.id} className="workspai-settings-model-row" role="listitem">
                  <strong>{model.name}</strong>
                  <span>{model.vendor || 'unknown vendor'}</span>
                  <code>{model.id}</code>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="workspai-settings-card workspai-settings-card--muted">
          <div className="workspai-settings-card-head">
            <KeyRound size={15} />
            <div>
              <h3>Custom API providers</h3>
              <p>Bring your own OpenAI-compatible endpoint, Ollama, or Azure OpenAI.</p>
            </div>
          </div>
          <div className="workspai-settings-coming-soon">
            <span className="workspai-settings-badge">Coming soon</span>
            <p>
              Custom providers will use VS Code Secret Storage for API keys — never the webview. Prompts
              may leave your machine, so this will ship with explicit privacy controls and opt-in scopes.
            </p>
            <ul>
              <li>Keys stored in Secret Storage only</li>
              <li>Clear data-leaves-workspace warning before enable</li>
              <li>OpenAI-compatible, Ollama, and Azure OpenAI adapters</li>
            </ul>
          </div>
        </article>

        <article className="workspai-settings-card workspai-settings-card--muted">
          <div className="workspai-settings-card-head">
            <Settings2 size={15} />
            <div>
              <h3>More settings</h3>
              <p>Timeouts, telemetry, and advanced AI controls stay in VS Code settings for now.</p>
            </div>
          </div>
          <button
            type="button"
            className="workspai-settings-secondary-btn"
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
