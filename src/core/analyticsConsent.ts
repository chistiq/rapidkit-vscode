import * as vscode from 'vscode';

import { Logger } from '../utils/logger';

/**
 * Privacy-first consent gate for optional retention/cohort analytics
 * (roadmap item 2.10).
 *
 * Design principles:
 * - Outbound analytics are **opt-in and default OFF** (`workspai.analytics.optIn`).
 * - A **double gate** is enforced: the user's opt-in AND VS Code's global
 *   telemetry setting (`vscode.env.isTelemetryEnabled`). If the user disables
 *   telemetry globally, analytics are effectively off regardless of our setting.
 * - The consent prompt is shown **at most once** and is non-blocking.
 * - This module only governs *consent*; the aggregation/payload lives in
 *   `retentionAnalytics.ts`, and there is intentionally no real network sink.
 */

export const ANALYTICS_OPT_IN_KEY = 'analytics.optIn';
export const ANALYTICS_CONSENT_SHOWN_KEY = 'analytics.consentPromptShown';

/** True only when the user opted in AND VS Code global telemetry is enabled. */
export function resolveAnalyticsOptIn(): boolean {
  const optedIn = vscode.workspace
    .getConfiguration('workspai')
    .get<boolean>(ANALYTICS_OPT_IN_KEY, false);
  return optedIn === true && vscode.env.isTelemetryEnabled === true;
}

/**
 * Whether the one-time consent prompt should fire: not previously shown, VS Code
 * telemetry is enabled (no point asking otherwise), and not already opted in.
 */
export function shouldShowAnalyticsConsentPrompt(): boolean {
  const config = vscode.workspace.getConfiguration('workspai');
  if (config.get<boolean>(ANALYTICS_CONSENT_SHOWN_KEY, false) === true) {
    return false;
  }
  if (vscode.env.isTelemetryEnabled !== true) {
    return false;
  }
  return config.get<boolean>(ANALYTICS_OPT_IN_KEY, false) !== true;
}

async function markConsentShown(): Promise<void> {
  await vscode.workspace
    .getConfiguration('workspai')
    .update(ANALYTICS_CONSENT_SHOWN_KEY, true, vscode.ConfigurationTarget.Global);
}

/**
 * Present the one-time, non-blocking consent prompt. Marks the prompt as shown
 * regardless of the choice (so it never repeats), and only enables analytics on
 * an explicit "Enable" click. Returns the resulting opt-in decision.
 */
export async function showAnalyticsConsentPrompt(): Promise<boolean> {
  if (!shouldShowAnalyticsConsentPrompt()) {
    return resolveAnalyticsOptIn();
  }

  const enable = 'Enable anonymous analytics';
  const notNow = 'Not now';
  const learnMore = 'Open Settings';

  const selected = await vscode.window.showInformationMessage(
    'Help improve Workspai by sharing anonymous, aggregated retention metrics ' +
      '(time-to-first-value, command counts — never code, paths, or names)? ' +
      'You can change this anytime in Settings.',
    { modal: false },
    enable,
    notNow,
    learnMore
  );

  await markConsentShown();

  const config = vscode.workspace.getConfiguration('workspai');
  if (selected === enable) {
    await config.update(ANALYTICS_OPT_IN_KEY, true, vscode.ConfigurationTarget.Global);
    Logger.getInstance().info('[Analytics] Anonymous retention analytics enabled by user.');
  } else if (selected === learnMore) {
    await vscode.commands.executeCommand(
      'workbench.action.openSettings',
      `workspai.${ANALYTICS_OPT_IN_KEY}`
    );
  }

  return resolveAnalyticsOptIn();
}

/**
 * Register a listener that logs when VS Code's global telemetry setting changes,
 * so the effective opt-in is re-evaluated. The disposable is owned by the caller.
 */
export function registerTelemetryEnablementListener(
  context: vscode.ExtensionContext
): vscode.Disposable {
  const disposable = vscode.env.onDidChangeTelemetryEnabled((enabled) => {
    Logger.getInstance().info(
      `[Analytics] VS Code telemetry ${enabled ? 'enabled' : 'disabled'}; ` +
        `effective analytics opt-in is now ${resolveAnalyticsOptIn()}.`
    );
  });
  context.subscriptions.push(disposable);
  return disposable;
}
