/** Parity with host `isMutatingRapidkitCliCommand` in incidentStudioInlineCommandBridge.ts */

const MUTATING_RAPIDKIT_CLI_COMMAND =
  /(?:\bdoctor\b[^\n]*--fix\b|\bworkspace\s+sync\b|\bworkspace\s+run\s+init\b|\bworkspace\s+archive\b|\bautopilot\s+release\b|\binit\b|\bbuild\b|\bdev\b)/i;

export function isMutatingRapidkitCliCommandText(command: string): boolean {
  const normalized = command.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (
    !/(?:^|\s)rapidkit\b/.test(normalized) &&
    !/^(doctor|readiness|pipeline|workspace|analyze|autopilot|init|test|build|dev|shell)\b/.test(
      normalized
    )
  ) {
    return false;
  }
  return MUTATING_RAPIDKIT_CLI_COMMAND.test(normalized);
}
