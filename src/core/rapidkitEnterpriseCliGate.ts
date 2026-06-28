import { parseRapidkitInlineCommand } from './incidentInlineCommandRunner';
import { gateCompatibleCliVersion } from './cliVersionGate';
import {
  gateTopLevelRapidkitCli,
  gateWorkspaceIntelligenceCli,
  gateWorkspaceSubcommandCli,
  REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS,
} from './rapidkitCliCapabilities';

const WORKSPACE_INTELLIGENCE_SUBCOMMANDS = new Set<string>(
  REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS
);

function isRapidkitCommand(command: string): boolean {
  return /(?:^|\s)(?:npx\s+(?:--yes\s+)?rapidkit|rapidkit)\b/i.test(command.trim());
}

export type EnterpriseCliGateResult =
  | { allowed: true }
  | {
      allowed: false;
      error: string;
    };

export async function gateIncidentStudioRapidkitCommand(input: {
  command: string;
  cwd: string;
  featureLabel: string;
}): Promise<EnterpriseCliGateResult> {
  const parsed = parseRapidkitInlineCommand(input.command);
  if ('error' in parsed) {
    return {
      allowed: false,
      error: parsed.error,
    };
  }

  const versionAllowed = await gateCompatibleCliVersion({
    cwd: input.cwd,
    featureLabel: input.featureLabel,
  });
  if (!versionAllowed) {
    return {
      allowed: false,
      error: `${input.featureLabel} is blocked until the linked RapidKit CLI is updated.`,
    };
  }

  const [root, subcommand] = parsed.rapidkitArgs;
  if (root === 'workspace' && subcommand) {
    const capabilityAllowed = WORKSPACE_INTELLIGENCE_SUBCOMMANDS.has(subcommand)
      ? await gateWorkspaceIntelligenceCli(input.featureLabel, { cwd: input.cwd })
      : await gateWorkspaceSubcommandCli(input.featureLabel, subcommand, { cwd: input.cwd });
    if (!capabilityAllowed) {
      return {
        allowed: false,
        error: `${input.featureLabel} is blocked because the linked RapidKit CLI does not advertise workspace ${subcommand}.`,
      };
    }
    return { allowed: true };
  }

  const capabilityAllowed = await gateTopLevelRapidkitCli(input.featureLabel, root, {
    cwd: input.cwd,
  });
  if (!capabilityAllowed) {
    return {
      allowed: false,
      error: `${input.featureLabel} is blocked because the linked RapidKit CLI does not advertise ${root}.`,
    };
  }

  return { allowed: true };
}

export async function gateRapidkitCliArgs(input: {
  args: readonly string[];
  cwd?: string;
  featureLabel: string;
}): Promise<EnterpriseCliGateResult> {
  const [root, subcommand] = input.args;
  if (!root) {
    return {
      allowed: false,
      error: `${input.featureLabel} is blocked because no RapidKit CLI command was provided.`,
    };
  }

  const versionAllowed = await gateCompatibleCliVersion({
    cwd: input.cwd,
    featureLabel: input.featureLabel,
  });
  if (!versionAllowed) {
    return {
      allowed: false,
      error: `${input.featureLabel} is blocked until the linked RapidKit CLI is updated.`,
    };
  }

  if (root === 'workspace' && subcommand) {
    const capabilityAllowed = WORKSPACE_INTELLIGENCE_SUBCOMMANDS.has(subcommand)
      ? await gateWorkspaceIntelligenceCli(input.featureLabel, { cwd: input.cwd })
      : await gateWorkspaceSubcommandCli(input.featureLabel, subcommand, { cwd: input.cwd });
    if (!capabilityAllowed) {
      return {
        allowed: false,
        error: `${input.featureLabel} is blocked because the linked RapidKit CLI does not advertise workspace ${subcommand}.`,
      };
    }
    return { allowed: true };
  }

  const capabilityAllowed = await gateTopLevelRapidkitCli(input.featureLabel, root, {
    cwd: input.cwd,
  });
  if (!capabilityAllowed) {
    return {
      allowed: false,
      error: `${input.featureLabel} is blocked because the linked RapidKit CLI does not advertise ${root}.`,
    };
  }

  return { allowed: true };
}

export async function gateRapidkitCommandsInStudioAction(input: {
  commands: readonly string[];
  cwd: string;
  featureLabel: string;
}): Promise<EnterpriseCliGateResult> {
  for (const command of input.commands) {
    if (!isRapidkitCommand(command)) {
      continue;
    }
    const gate = await gateIncidentStudioRapidkitCommand({
      command,
      cwd: input.cwd,
      featureLabel: input.featureLabel,
    });
    if (!gate.allowed) {
      return gate;
    }
  }

  return { allowed: true };
}
