import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockUpdate, mockShowInfo, mockExecuteCommand, envState } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
  mockShowInfo: vi.fn(),
  mockExecuteCommand: vi.fn(),
  envState: { isTelemetryEnabled: true },
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({ get: mockGet, update: mockUpdate }),
  },
  window: {
    showInformationMessage: mockShowInfo,
  },
  commands: {
    executeCommand: mockExecuteCommand,
  },
  env: {
    get isTelemetryEnabled() {
      return envState.isTelemetryEnabled;
    },
    onDidChangeTelemetryEnabled: () => ({ dispose: vi.fn() }),
  },
  ConfigurationTarget: { Global: 1 },
}));

vi.mock('../utils/logger', () => ({
  Logger: { getInstance: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import {
  ANALYTICS_CONSENT_SHOWN_KEY,
  ANALYTICS_OPT_IN_KEY,
  RETENTION_ANALYTICS_ENABLED,
  resolveAnalyticsOptIn,
  shouldShowAnalyticsConsentPrompt,
  showAnalyticsConsentPrompt,
} from '../core/analyticsConsent';

function configValue(values: Record<string, unknown>) {
  mockGet.mockImplementation((key: string, fallback?: unknown) =>
    key in values ? values[key] : fallback
  );
}

describe('resolveAnalyticsOptIn', () => {
  beforeEach(() => {
    mockGet.mockReset();
    envState.isTelemetryEnabled = true;
  });

  it('stays false when a legacy installation has opt-in enabled', () => {
    configValue({ [ANALYTICS_OPT_IN_KEY]: true });
    expect(resolveAnalyticsOptIn()).toBe(false);
    expect(RETENTION_ANALYTICS_ENABLED).toBe(false);
  });

  it('is false when VS Code telemetry is disabled even if opted in', () => {
    configValue({ [ANALYTICS_OPT_IN_KEY]: true });
    envState.isTelemetryEnabled = false;
    expect(resolveAnalyticsOptIn()).toBe(false);
  });

  it('is false when not opted in', () => {
    configValue({ [ANALYTICS_OPT_IN_KEY]: false });
    expect(resolveAnalyticsOptIn()).toBe(false);
  });
});

describe('shouldShowAnalyticsConsentPrompt', () => {
  beforeEach(() => {
    mockGet.mockReset();
    envState.isTelemetryEnabled = true;
  });

  it('is false when the legacy prompt has not been shown', () => {
    configValue({ [ANALYTICS_CONSENT_SHOWN_KEY]: false, [ANALYTICS_OPT_IN_KEY]: false });
    expect(shouldShowAnalyticsConsentPrompt()).toBe(false);
  });

  it('is false once the prompt was already shown', () => {
    configValue({ [ANALYTICS_CONSENT_SHOWN_KEY]: true, [ANALYTICS_OPT_IN_KEY]: false });
    expect(shouldShowAnalyticsConsentPrompt()).toBe(false);
  });

  it('is false when VS Code telemetry is disabled', () => {
    configValue({ [ANALYTICS_CONSENT_SHOWN_KEY]: false, [ANALYTICS_OPT_IN_KEY]: false });
    envState.isTelemetryEnabled = false;
    expect(shouldShowAnalyticsConsentPrompt()).toBe(false);
  });
});

describe('showAnalyticsConsentPrompt', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockUpdate.mockReset();
    mockShowInfo.mockReset();
    mockExecuteCommand.mockReset();
    envState.isTelemetryEnabled = true;
  });

  it('does not show UI or mutate settings for a legacy eligible state', async () => {
    configValue({ [ANALYTICS_CONSENT_SHOWN_KEY]: false, [ANALYTICS_OPT_IN_KEY]: false });
    mockShowInfo.mockResolvedValue('Enable anonymous analytics');

    expect(await showAnalyticsConsentPrompt()).toBe(false);

    expect(mockShowInfo).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not mark consent as shown when called', async () => {
    configValue({ [ANALYTICS_CONSENT_SHOWN_KEY]: false, [ANALYTICS_OPT_IN_KEY]: false });
    mockShowInfo.mockResolvedValue(undefined);

    expect(await showAnalyticsConsentPrompt()).toBe(false);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not prompt again when already shown', async () => {
    configValue({ [ANALYTICS_CONSENT_SHOWN_KEY]: true, [ANALYTICS_OPT_IN_KEY]: false });
    await showAnalyticsConsentPrompt();
    expect(mockShowInfo).not.toHaveBeenCalled();
  });
});
