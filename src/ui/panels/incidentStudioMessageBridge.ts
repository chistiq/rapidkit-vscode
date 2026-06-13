/**
 * Shared Incident Studio webview message commands that must stay in parity
 * between the embedded dashboard host and the standalone vNext panel.
 */
export const INCIDENT_STUDIO_SHARED_MESSAGE_COMMANDS = [
  'requestIncidentStudioTelemetry',
  'getUiPreferences',
  'setUiPreference',
  'exportIncidentReproPack',
  'importIncidentReproPack',
  'runIncidentInlineCommand',
  'runStudioAction',
  'studioMessage',
  'runAIActionContractCommand',
  'loadAIActionRegistry',
  'runAnalyze',
  'checkReportExists',
  'loadReport',
  'copyText',
  'revealEvidence',
  'aiChatStart',
  'aiChatSyncWorkspace',
  'aiChatQuery',
  'aiChatExecuteAction',
  'aiChatApplyPatch',
  'aiChatFeedback',
  'aiChatClose',
  'requestIncidentStudioShipEvidence',
  'runShipLoopStep',
  'exportSandboxSimulationEvidence',
  'exportReleaseReadinessCommander',
  'loadIncidentStudioSession',
  'saveIncidentStudioSession',
] as const;

export type IncidentStudioSharedMessageCommand =
  (typeof INCIDENT_STUDIO_SHARED_MESSAGE_COMMANDS)[number];

export function isIncidentStudioSharedMessageCommand(
  value: string
): value is IncidentStudioSharedMessageCommand {
  return (INCIDENT_STUDIO_SHARED_MESSAGE_COMMANDS as readonly string[]).includes(value);
}
