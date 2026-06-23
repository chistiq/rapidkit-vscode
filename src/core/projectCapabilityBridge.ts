import {
  fetchProjectCommandCapabilities,
  type ProjectCommandCapabilitiesSnapshot,
} from './projectCommandCapabilities';

export type WebviewProjectCapabilitiesPayload = {
  available: boolean;
  runtime?: string;
  framework?: string;
  frameworkDisplayName?: string;
  moduleSupport?: boolean;
  fleetStages?: string[];
  supportedCommands?: string[];
  unsupportedCommands?: string[];
  commandMap?: Record<string, { status: string; reason?: string; fleetEligible?: boolean }>;
};

export function serializeProjectCapabilitiesForWebview(
  capabilities: ProjectCommandCapabilitiesSnapshot | null
): WebviewProjectCapabilitiesPayload {
  if (!capabilities) {
    return { available: false };
  }

  const commandMap = Object.fromEntries(
    Object.entries(capabilities.commandMap).map(([command, entry]) => [
      command,
      {
        status: entry.status,
        reason: entry.reason,
        fleetEligible: entry.fleetEligible,
      },
    ])
  );

  return {
    available: true,
    runtime: capabilities.runtime,
    framework: capabilities.framework,
    frameworkDisplayName: capabilities.frameworkDisplayName,
    moduleSupport: capabilities.moduleSupport,
    fleetStages: capabilities.fleetStages,
    supportedCommands: capabilities.supportedCommands,
    unsupportedCommands: capabilities.unsupportedCommands,
    commandMap,
  };
}

export async function resolveProjectCapabilitiesPayload(
  projectPath: string,
  options: { forceRefresh?: boolean } = {}
): Promise<WebviewProjectCapabilitiesPayload> {
  const capabilities = await fetchProjectCommandCapabilities(projectPath, options);
  return serializeProjectCapabilitiesForWebview(capabilities);
}
