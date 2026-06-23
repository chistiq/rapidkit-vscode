import { resolveDashboardCommandContract } from './dashboardCommandContracts';

const EVIDENCE_DIRECT_COMMAND_FLAGS: Record<string, Record<string, unknown>> = {
  workspaceBootstrap: { preferExistingProfile: true },
  checkWorkspaceHealth: { preferredAction: 'check' },
  workspaceFoundationEnsure: { mode: 'ensure', json: true },
  workspaceSetup: { preferProfileSetupRuntimes: true },
  projectDoctor: { preferredAction: 'check' },
};

export function enrichDashboardEvidenceCommandData(
  command: string,
  data?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (data?.source !== 'evidence' && data?.evidenceDirectRun !== true) {
    return data;
  }

  const contract = resolveDashboardCommandContract(command);
  const enriched: Record<string, unknown> = {
    ...contract?.payloadDefaults,
    ...data,
    evidenceDirectRun: true,
  };
  const flags = EVIDENCE_DIRECT_COMMAND_FLAGS[command];
  if (flags) {
    for (const [key, value] of Object.entries(flags)) {
      if (enriched[key] === undefined) {
        enriched[key] = value;
      }
    }
  }
  if (
    command === 'workspaceBootstrap' &&
    typeof data?.profile === 'string' &&
    (data.profile as string).trim()
  ) {
    enriched.profile = (data.profile as string).trim();
  }
  return enriched;
}
