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

  it('is true only when opted in AND VS Code telemetry is enabled', () => {
    configValue({ [ANALYTICS_OPT_IN_KEY]: true });
    expect(resolveAnalyticsOptIn()).toBe(true);
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

  it('is true when not shown, telemetry enabled, not opted in', () => {
    configValue({ [ANALYTICS_CONSENT_SHOWN_KEY]: false, [ANALYTICS_OPT_IN_KEY]: false });
    expect(shouldShowAnalyticsConsentPrompt()).toBe(true);
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

  it('enables opt-in and marks shown when the user clicks Enable', async () => {
    configValue({ [ANALYTICS_CONSENT_SHOWN_KEY]: false, [ANALYTICS_OPT_IN_KEY]: false });
    mockShowInfo.mockResolvedValue('Enable anonymous analytics');

    await showAnalyticsConsentPrompt();

    expect(mockUpdate).toHaveBeenCalledWith(ANALYTICS_CONSENT_SHOWN_KEY, true, 1);
    expect(mockUpdate).toHaveBeenCalledWith(ANALYTICS_OPT_IN_KEY, true, 1);
  });

  it('marks shown but does not opt in when dismissed', async () => {
    configValue({ [ANALYTICS_CONSENT_SHOWN_KEY]: false, [ANALYTICS_OPT_IN_KEY]: false });
    mockShowInfo.mockResolvedValue(undefined);

    await showAnalyticsConsentPrompt();

    expect(mockUpdate).toHaveBeenCalledWith(ANALYTICS_CONSENT_SHOWN_KEY, true, 1);
    expect(mockUpdate).not.toHaveBeenCalledWith(ANALYTICS_OPT_IN_KEY, true, 1);
  });

  it('does not prompt again when already shown', async () => {
    configValue({ [ANALYTICS_CONSENT_SHOWN_KEY]: true, [ANALYTICS_OPT_IN_KEY]: false });
    await showAnalyticsConsentPrompt();
    expect(mockShowInfo).not.toHaveBeenCalled();
  });
});
