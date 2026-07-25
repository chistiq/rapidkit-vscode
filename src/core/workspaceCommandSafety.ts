export type WorkspaceCommandRisk = 'read' | 'write' | 'destructive';

export type WorkspaceCommandSafetyPolicy = {
  commandId: string;
  risk: WorkspaceCommandRisk;
  confirmation?: {
    title: string;
    detail: string;
    confirmLabel: string;
  };
  refreshCommands?: string[][];
};

export const WORKSPACE_COMMAND_SAFETY_POLICIES: Record<string, WorkspaceCommandSafetyPolicy> = {
  workspaceFoundationEnsure: {
    commandId: 'workspaceFoundationEnsure',
    risk: 'write',
    refreshCommands: [['workspace', 'contract', 'inspect', '--json']],
  },
  workspaceContractInit: {
    commandId: 'workspaceContractInit',
    risk: 'write',
    refreshCommands: [['workspace', 'contract', 'inspect', '--json']],
  },
  workspacePolicySet: {
    commandId: 'workspacePolicySet',
    risk: 'write',
    confirmation: {
      title: 'Update workspace policy?',
      detail:
        'This changes governance behavior for this workspace. Workspai will show the policy after the update so you can verify the result.',
      confirmLabel: 'Update Policy',
    },
    refreshCommands: [['workspace', 'policy', 'show']],
  },
  cacheClear: {
    commandId: 'cacheClear',
    risk: 'destructive',
    confirmation: {
      title: 'Clear RapidKit caches?',
      detail:
        'This removes local RapidKit cache state for the workspace. It cannot be undone, but Workspai will refresh cache status after the command.',
      confirmLabel: 'Clear Cache',
    },
    refreshCommands: [['cache', 'status']],
  },
  cachePrune: {
    commandId: 'cachePrune',
    risk: 'write',
    refreshCommands: [['cache', 'status']],
  },
  cacheRepair: {
    commandId: 'cacheRepair',
    risk: 'write',
    refreshCommands: [['cache', 'status']],
  },
  workspaceSnapshotRestore: {
    commandId: 'workspaceSnapshotRestore',
    risk: 'destructive',
    confirmation: {
      title: 'Restore workspace snapshot?',
      detail:
        'This can overwrite workspace files. RapidKit will create a safety snapshot before force restore when available.',
      confirmLabel: 'Restore Snapshot',
    },
    refreshCommands: [['snapshot', 'list']],
  },
  mirrorSync: {
    commandId: 'mirrorSync',
    risk: 'write',
    refreshCommands: [['mirror', 'status']],
  },
  mirrorVerify: {
    commandId: 'mirrorVerify',
    risk: 'read',
    refreshCommands: [['mirror', 'status']],
  },
  mirrorRotate: {
    commandId: 'mirrorRotate',
    risk: 'destructive',
    confirmation: {
      title: 'Rotate mirror signing keys?',
      detail:
        'This re-signs pinned mirror artifacts. Existing rotation snapshots may be archived by RapidKit.',
      confirmLabel: 'Rotate Keys',
    },
    refreshCommands: [['mirror', 'status']],
  },
  infraUp: {
    commandId: 'infraUp',
    risk: 'write',
    refreshCommands: [['infra', 'status']],
  },
  infraDown: {
    commandId: 'infraDown',
    risk: 'write',
    refreshCommands: [['infra', 'status']],
  },
};

export function resolveWorkspaceCommandSafetyPolicy(
  commandId: string
): WorkspaceCommandSafetyPolicy | undefined {
  return WORKSPACE_COMMAND_SAFETY_POLICIES[commandId];
}

export function appendWorkspaceCommandRefresh(commandId: string, commands: string[][]): string[][] {
  const policy = resolveWorkspaceCommandSafetyPolicy(commandId);
  const refreshCommands = policy?.refreshCommands ?? [];
  return refreshCommands.length > 0 ? [...commands, ...refreshCommands] : commands;
}

export async function confirmWorkspaceCommandSafety(input: {
  commandId: string;
  workspaceName: string;
  detailOverride?: string;
}): Promise<boolean> {
  const policy = resolveWorkspaceCommandSafetyPolicy(input.commandId);
  const confirmation = policy?.confirmation;
  if (!confirmation) {
    return true;
  }

  const vscode = await import('vscode');
  const message = `${confirmation.title}\n\nWorkspace: ${input.workspaceName}\n\n${
    input.detailOverride ?? confirmation.detail
  }`;
  const selected = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    confirmation.confirmLabel,
    'Cancel'
  );
  return selected === confirmation.confirmLabel;
}
