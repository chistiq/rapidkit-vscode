import { useEffect, useRef, useState } from 'react';
import { normalizeExtensionWebviewMessage } from '@workspai-contracts/webviewProtocol';
import { vscode } from '@/vscode';

export interface ProviderSettingsNotice {
  provider: string;
  command: string;
  ok: boolean;
  message: string;
}

export interface ProviderHealthCheck {
  provider: string;
  ok: boolean;
  label: string;
  latencyMs?: number;
  model?: string;
  reason?: string;
}

export function useAIProviderSettingsActions(provider: string, configurationKey = '') {
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<ProviderSettingsNotice | null>(null);
  const [healthCheck, setHealthCheck] = useState<ProviderHealthCheck | null>(null);
  const previousConfiguration = useRef(configurationKey);
  const active = useRef<{ requestId: string; provider: string; command: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const configurationChanged = previousConfiguration.current !== configurationKey;
    previousConfiguration.current = configurationKey;
    setHealthCheck(null);
    setNotice(null);
    if (
      active.current &&
      active.current.command !== 'setAIProvider' &&
      (active.current.provider !== provider ||
        (active.current.command === 'testAIProvider' && configurationChanged))
    ) {
      active.current = null;
      clearTimeout(timer.current);
      setPending(null);
    }
  }, [provider, configurationKey]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const message = normalizeExtensionWebviewMessage(event.data);
      if (message?.command !== 'aiProviderSettingsResult') {
        return;
      }
      const result = message.data;
      const request = active.current;
      if (
        !request ||
        result?.requestId !== request.requestId ||
        result?.provider !== request.provider
      ) {
        return;
      }
      clearTimeout(timer.current);
      active.current = null;
      setPending(null);
      setNotice({
        provider: request.provider,
        command: request.command,
        ok: result.ok === true,
        message: typeof result.message === 'string' ? result.message : 'Provider update finished.',
      });
      if (
        request.command === 'testAIProvider' &&
        result.healthCheck &&
        typeof result.healthCheck === 'object'
      ) {
        const health = result.healthCheck as ProviderHealthCheck;
        if (health.provider === request.provider) {
          setHealthCheck(health);
        }
      }
    };
    window.addEventListener('message', receive);
    return () => {
      window.removeEventListener('message', receive);
      clearTimeout(timer.current);
      active.current = null;
    };
  }, []);

  const dispatch = (command: string, data: Record<string, unknown> = {}) => {
    if (active.current) {
      return;
    }
    const target =
      command === 'setAIProvider' && typeof data.provider === 'string' ? data.provider : provider;
    const request = { requestId: crypto.randomUUID(), provider: target, command };
    active.current = request;
    setPending(command);
    setNotice(null);
    setHealthCheck(null);
    timer.current = setTimeout(() => {
      if (active.current !== request) {
        return;
      }
      active.current = null;
      setPending(null);
      setNotice({
        ...request,
        ok: false,
        message: 'No confirmation received. Refresh settings before repeating this action.',
      });
    }, 60_000);
    vscode.postMessage(command, { ...data, ...request });
  };

  return { pending, notice, healthCheck, dispatch };
}
