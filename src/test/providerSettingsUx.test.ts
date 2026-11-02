// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaiSettingsPanel } from '../../webview-ui/src/components/WorkspaiSettingsPanel';
import { useAIProviderSettingsActions } from '../../webview-ui/src/lib/useAIProviderSettingsActions';
import { listAIProviderDefinitions } from '../core/aiProviderCatalog';

const { postMessage } = vi.hoisted(() => ({ postMessage: vi.fn() }));
vi.mock('@/vscode', () => ({ vscode: { postMessage } }));

describe('provider settings interactions', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const props = () => ({
    availableModels: [],
    preferredModelId: 'auto',
    aiProvider: 'openai-compatible',
    aiProviderCatalog: [...listAIProviderDefinitions()],
    customAIBaseUrl: 'https://api.example.test/v1',
    customAIModel: 'model-a',
    aiProviderStatus: {
      provider: 'openai-compatible',
      ready: true,
      label: 'Custom',
      hasApiKey: true,
    },
    aiProviderHealthCheck: null,
    providerHealthChecking: false,
    modelsLoading: false,
    onPreferredModelChange: vi.fn(),
    onProviderChange: vi.fn(),
    onCustomAIConfigSave: vi.fn(),
    onCustomAIAPIKeySave: vi.fn(),
    onCustomAIAPIKeyClear: vi.fn(),
    onTestAIProvider: vi.fn(),
    onRefreshModels: vi.fn(),
    themeMode: 'auto' as const,
    onThemeModeChange: vi.fn(),
  });
  const button = (name: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent === name)!;
  const change = async (input: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('preserves unsaved config and keys through refresh; tests only saved values', async () => {
    const p = props();
    await act(async () => root.render(createElement(WorkspaiSettingsPanel, p)));
    const inputs = container.querySelectorAll<HTMLInputElement>('input');
    await change(inputs[0], 'https://another.example.test/v1');
    await change(inputs[1], 'model-b');
    await change(inputs[2], 'fixture-key');
    await act(async () =>
      root.render(createElement(WorkspaiSettingsPanel, { ...p, customAIModel: 'model-c' }))
    );
    expect(inputs[0].value).toBe('https://another.example.test/v1');
    expect(inputs[1].value).toBe('model-b');
    expect(inputs[2].value).toBe('fixture-key');
    expect(button('Test provider').disabled).toBe(true);
    await act(async () => button('Save provider config').click());
    expect(p.onCustomAIConfigSave).toHaveBeenCalledWith({
      baseUrl: inputs[0].value,
      model: 'model-b',
    });
  });

  it('retains a key after save failure and clears it only after an acknowledged success', async () => {
    const p = props();
    await act(async () => root.render(createElement(WorkspaiSettingsPanel, p)));
    const input = container.querySelector<HTMLInputElement>('input[type=password]')!;
    await change(input, 'fixture-key');
    await act(async () => button('Save API key').click());
    expect(p.onCustomAIAPIKeySave).toHaveBeenCalledWith('fixture-key');
    expect(input.value).toBe('fixture-key');
    const notice = {
      provider: p.aiProvider,
      command: 'setCustomAIAPIKey',
      ok: false,
      message: 'Storage unavailable',
    };
    await act(async () =>
      root.render(createElement(WorkspaiSettingsPanel, { ...p, providerSettingsNotice: notice }))
    );
    expect(input.value).toBe('fixture-key');
    expect(container.querySelector('[role=alert]')?.textContent).toBe('Storage unavailable');
    await act(async () =>
      root.render(
        createElement(WorkspaiSettingsPanel, {
          ...p,
          providerSettingsNotice: { ...notice, ok: true },
        })
      )
    );
    expect(input.value).toBe('');
  });

  it('locks provider writes while pending and never carries a key to another provider', async () => {
    const p = props();
    await act(async () => root.render(createElement(WorkspaiSettingsPanel, p)));
    await change(container.querySelector<HTMLInputElement>('input[type=password]')!, 'fixture-key');
    await act(async () =>
      root.render(
        createElement(WorkspaiSettingsPanel, { ...p, providerSettingsPending: 'setCustomAIAPIKey' })
      )
    );
    expect((container.querySelector('select') as HTMLSelectElement).disabled).toBe(true);
    expect(button('Save API key').disabled).toBe(true);
    await act(async () =>
      root.render(
        createElement(WorkspaiSettingsPanel, {
          ...p,
          aiProvider: 'ollama',
          customAIBaseUrl: 'http://localhost:11434/v1',
          customAIModel: 'local-model',
        })
      )
    );
    expect(container.querySelector<HTMLInputElement>('input[type=password]')!.value).toBe('');
    expect(container.querySelector<HTMLInputElement>('input')!.value).toBe(
      'http://localhost:11434/v1'
    );
  });

  it('correlates replies by request and provider, suppresses duplicates, and ends pending on errors', async () => {
    let actions!: ReturnType<typeof useAIProviderSettingsActions>;
    function Harness() {
      actions = useAIProviderSettingsActions('gemini');
      return null;
    }
    await act(async () => root.render(createElement(Harness)));
    await act(async () => {
      actions.dispatch('setCustomAIAPIKey', { apiKey: 'fixture-key' });
      actions.dispatch('clearCustomAIAPIKey');
    });
    expect(postMessage).toHaveBeenCalledTimes(1);
    const request = postMessage.mock.calls[0][1];
    expect(request.provider).toBe('gemini');
    const reply = async (data: object) =>
      act(async () => {
        window.dispatchEvent(
          new MessageEvent('message', { data: { command: 'aiProviderSettingsResult', data } })
        );
      });
    await reply({ ...request, provider: 'openai', ok: true });
    expect(actions.pending).toBe('setCustomAIAPIKey');
    await reply({ ...request, requestId: 'stale', ok: true });
    expect(actions.pending).toBe('setCustomAIAPIKey');
    await reply({ ...request, ok: false, message: 'Storage unavailable' });
    expect(actions.pending).toBeNull();
    expect(actions.notice?.message).toBe('Storage unavailable');
    expect(actions.notice).not.toHaveProperty('apiKey');
  });

  it('recovers from a missing acknowledgement without an endless spinner', async () => {
    vi.useFakeTimers();
    let actions!: ReturnType<typeof useAIProviderSettingsActions>;
    function Harness() {
      actions = useAIProviderSettingsActions('gemini');
      return null;
    }
    await act(async () => root.render(createElement(Harness)));
    await act(async () => actions.dispatch('testAIProvider'));
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(actions.pending).toBeNull();
    expect(actions.notice?.message).toContain('Refresh settings');
  });
  it('invalidates an in-flight health test when saved config changes under the same provider', async () => {
    let actions!: ReturnType<typeof useAIProviderSettingsActions>;
    function Harness({ version }: { version: string }) {
      actions = useAIProviderSettingsActions('gemini', version);
      return null;
    }
    await act(async () => root.render(createElement(Harness, { version: 'model-a' })));
    await act(async () => actions.dispatch('testAIProvider'));
    const request = postMessage.mock.calls[0][1];
    await act(async () => root.render(createElement(Harness, { version: 'model-b' })));
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            command: 'aiProviderSettingsResult',
            data: { ...request, ok: true, healthCheck: { provider: 'gemini', ok: true } },
          },
        })
      );
    });
    expect(actions.healthCheck).toBeNull();
    expect(actions.pending).toBeNull();
  });
});
