import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';

import { Logger } from '../utils/logger';
import { gateWorkspaceIntelligenceCli } from '../core/rapidkitCliCapabilities';
import { presentCliVersionGate } from '../core/cliVersionGate';
import {
  dispatchWorkspaceImpactLens,
  dispatchWorkspaceIntelligenceChain,
} from '../core/workspaceIntelligenceRuntime';
import { runWorkspaceIntelligenceCommandWithProgress } from '../core/workspaceIntelligenceProgressRunner';
import {
  WORKSPACE_INTELLIGENCE_DIFF_FROM_CANDIDATES,
  WORKSPACE_INTELLIGENCE_IMPACT_FROM_CANDIDATES,
  WORKSPACE_MODEL_DIFF_REPORT_PATH,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
  WORKSPACE_IMPACT_REPORT_PATH,
} from '../core/workspaceIntelligencePaths';
import {
  buildWorkspaceAgentContextCliArgs,
  buildWorkspaceAgentSyncCliArgs,
} from '../core/agentContextPack';
import { resolveAgentSyncCliOptions } from '../core/agentSyncSettings';
import { sendWorkspaceIntelligenceToCopilot } from '../core/sendToCopilot';
import { ensureFreshEvidenceForAIAction } from '../core/workspaceEvidenceFreshnessGate';

type WorkspaceExplorerLike = {
  getSelectedWorkspace?: () => { path: string; name?: string } | null | undefined;
};

type WorkspaceCommandItem = {
  workspace?: { path?: unknown; name?: unknown };
  path?: unknown;
  name?: unknown;
  from?: unknown;
  scope?: unknown;
};

type WorkspaceTarget = {
  workspacePath?: string;
  workspaceName?: string;
};

function asWorkspaceCommandItem(item: unknown): WorkspaceCommandItem | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  return item as WorkspaceCommandItem;
}

function getWorkspaceItemPath(item: unknown): string | undefined {
  if (typeof item === 'string') {
    return item;
  }

  const typed = asWorkspaceCommandItem(item);
  const candidate = typed?.workspace?.path ?? typed?.path;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function getWorkspaceItemName(item: unknown): string | undefined {
  const typed = asWorkspaceCommandItem(item);
  const candidate = typed?.workspace?.name ?? typed?.name;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function resolveImpactScope(item?: unknown): string | undefined {
  const typed = asWorkspaceCommandItem(item);
  if (typeof typed?.scope === 'string' && typed.scope.trim().length > 0) {
    return typed.scope.trim();
  }

  if (!item || typeof item !== 'object') {
    return undefined;
  }

  const record = item as Record<string, unknown>;
  const explicitScope = typeof record.scope === 'string' ? record.scope.trim() : '';
  if (explicitScope) {
    return explicitScope;
  }

  const project =
    record.project && typeof record.project === 'object'
      ? (record.project as Record<string, unknown>)
      : undefined;
  const projectName =
    typeof project?.name === 'string'
      ? project.name
      : typeof record.projectName === 'string'
        ? record.projectName
        : undefined;
  return projectName ? `project:${projectName}` : undefined;
}

function resolveWorkspaceTarget(
  item: unknown,
  workspaceExplorer?: WorkspaceExplorerLike
): WorkspaceTarget {
  const selectedWorkspace = workspaceExplorer?.getSelectedWorkspace?.();
  const itemWorkspacePath = getWorkspaceItemPath(item);
  const itemWorkspaceName = getWorkspaceItemName(item);

  const workspacePath =
    typeof itemWorkspacePath === 'string' && itemWorkspacePath.length > 0
      ? itemWorkspacePath
      : selectedWorkspace?.path;

  const workspaceName =
    typeof itemWorkspaceName === 'string' && itemWorkspaceName.length > 0
      ? itemWorkspaceName
      : selectedWorkspace?.name;

  return { workspacePath, workspaceName };
}

function requireWorkspaceTarget(
  item: unknown,
  workspaceExplorer?: WorkspaceExplorerLike
): Required<WorkspaceTarget> | undefined {
  const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
  if (!workspacePath) {
    vscode.window.showErrorMessage(
      'No workspace selected. Select a workspace in the sidebar first.'
    );
    return undefined;
  }

  return {
    workspacePath,
    workspaceName: workspaceName || path.basename(workspacePath),
  };
}

async function requireWorkspaceIntelligenceCli(
  featureLabel: string,
  workspacePath: string
): Promise<boolean> {
  // Surface a CLI version mismatch banner (once per session) before gating on
  // capabilities, so users on an older CLI get an actionable "Update CLI" path.
  await presentCliVersionGate({ cwd: workspacePath });
  return gateWorkspaceIntelligenceCli(featureLabel, { cwd: workspacePath });
}

function toPosixRelativePath(workspacePath: string, candidatePath: string): string {
  const resolved = path.isAbsolute(candidatePath)
    ? candidatePath
    : path.join(workspacePath, candidatePath);
  const relative = path.relative(workspacePath, resolved);
  return relative.split(path.sep).join(path.posix.sep);
}

async function resolveIntelligenceFromPath(input: {
  workspacePath: string;
  item?: unknown;
  candidates: readonly string[];
  title: string;
  prompt: string;
}): Promise<string | undefined> {
  const typed = asWorkspaceCommandItem(input.item);
  const explicitFrom = typeof typed?.from === 'string' ? typed.from.trim() : '';
  if (explicitFrom) {
    return toPosixRelativePath(input.workspacePath, explicitFrom);
  }

  const existingCandidates: Array<{ label: string; value: string }> = [];
  for (const candidate of input.candidates) {
    const absolutePath = path.join(input.workspacePath, candidate);
    if (await fs.pathExists(absolutePath)) {
      existingCandidates.push({
        label: candidate,
        value: candidate,
      });
    }
  }

  if (existingCandidates.length === 1) {
    return existingCandidates[0].value;
  }

  if (existingCandidates.length > 1) {
    const picked = await vscode.window.showQuickPick(existingCandidates, {
      title: input.title,
      placeHolder: input.prompt,
      ignoreFocusOut: true,
    });
    return picked?.value;
  }

  const pickedFile = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(path.join(input.workspacePath, '.rapidkit', 'reports')),
    openLabel: 'Select baseline report',
    title: input.title,
  });

  const filePath = pickedFile?.[0]?.fsPath;
  if (!filePath) {
    return undefined;
  }

  return toPosixRelativePath(input.workspacePath, filePath);
}

export function registerWorkspaceIntelligenceCommands(options: {
  logger: Logger;
  getWorkspaceExplorer: () => WorkspaceExplorerLike | undefined;
}): vscode.Disposable[] {
  const { logger, getWorkspaceExplorer } = options;

  return [
    vscode.commands.registerCommand('workspai.workspaceModel', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Workspace Model', target.workspacePath))) {
        return;
      }

      await runWorkspaceIntelligenceCommandWithProgress({
        command: ['workspace', 'model', '--json', '--write'],
        cwd: target.workspacePath,
        title: `Workspace Model — ${target.workspaceName}`,
        featureLabel: 'Workspace Model',
      });
      logger.info(`Workspace model command dispatched for ${target.workspacePath}`);
    }),

    vscode.commands.registerCommand(
      'workspai.workspaceIntelligenceSnapshot',
      async (item?: unknown) => {
        const workspaceExplorer = getWorkspaceExplorer();
        const target = requireWorkspaceTarget(item, workspaceExplorer);
        if (!target) {
          return;
        }

        if (
          !(await requireWorkspaceIntelligenceCli('Intelligence Snapshot', target.workspacePath))
        ) {
          return;
        }

        await runWorkspaceIntelligenceCommandWithProgress({
          command: ['workspace', 'snapshot', '--json'],
          cwd: target.workspacePath,
          title: `Intelligence Snapshot — ${target.workspaceName}`,
          featureLabel: 'Intelligence Snapshot',
        });
        logger.info(`Workspace intelligence snapshot dispatched for ${target.workspacePath}`);
      }
    ),

    vscode.commands.registerCommand('workspai.workspaceDiff', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Workspace Diff', target.workspacePath))) {
        return;
      }

      const fromPath = await resolveIntelligenceFromPath({
        workspacePath: target.workspacePath,
        item,
        candidates: WORKSPACE_INTELLIGENCE_DIFF_FROM_CANDIDATES,
        title: 'Workspace Model Diff',
        prompt: 'Select baseline snapshot or model report',
      });
      if (!fromPath) {
        vscode.window.showWarningMessage(
          `Workspace diff requires a baseline report (e.g. ${WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH}).`
        );
        return;
      }

      await runWorkspaceIntelligenceCommandWithProgress({
        command: ['workspace', 'diff', '--from', fromPath, '--json'],
        cwd: target.workspacePath,
        title: `Workspace Diff — ${target.workspaceName}`,
        featureLabel: 'Workspace Diff',
      });
      logger.info(`Workspace diff dispatched for ${target.workspacePath} from ${fromPath}`);
    }),

    vscode.commands.registerCommand('workspai.workspaceImpact', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Workspace Impact', target.workspacePath))) {
        return;
      }

      const typed = asWorkspaceCommandItem(item);
      const scope =
        typeof typed?.scope === 'string' && typed.scope.trim().length > 0
          ? typed.scope.trim()
          : undefined;

      const fromPath = await resolveIntelligenceFromPath({
        workspacePath: target.workspacePath,
        item,
        candidates: WORKSPACE_INTELLIGENCE_IMPACT_FROM_CANDIDATES,
        title: 'Workspace Impact',
        prompt: 'Select diff, snapshot, or model report',
      });
      if (!fromPath) {
        vscode.window.showWarningMessage(
          `Workspace impact requires a baseline report (e.g. ${WORKSPACE_MODEL_DIFF_REPORT_PATH}).`
        );
        return;
      }

      const command: string[] = ['workspace', 'impact', '--from', fromPath, '--json'];
      if (scope) {
        command.push('--scope', scope);
      }

      await runWorkspaceIntelligenceCommandWithProgress({
        command,
        cwd: target.workspacePath,
        title: `Workspace Impact — ${target.workspaceName}`,
        featureLabel: 'Workspace Impact',
      });
      logger.info(`Workspace impact dispatched for ${target.workspacePath} from ${fromPath}`);
    }),

    vscode.commands.registerCommand('workspai.workspaceContextAgent', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Agent Context Pack', target.workspacePath))) {
        return;
      }

      const typed = asWorkspaceCommandItem(item);
      const scope =
        typeof typed?.scope === 'string' && typed.scope.trim().length > 0
          ? typed.scope.trim()
          : undefined;

      const command = buildWorkspaceAgentContextCliArgs(scope);

      await runWorkspaceIntelligenceCommandWithProgress({
        command,
        cwd: target.workspacePath,
        title: `Agent Context — ${target.workspaceName}`,
        featureLabel: 'Agent Context Pack',
      });
      logger.info(`Workspace agent context dispatched for ${target.workspacePath}`);
    }),

    vscode.commands.registerCommand('workspai.workspaceAgentSync', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Agent Grounding Sync', target.workspacePath))) {
        return;
      }

      const typed = asWorkspaceCommandItem(item);
      const scope =
        typeof typed?.scope === 'string' && typed.scope.trim().length > 0
          ? typed.scope.trim()
          : undefined;
      const record =
        item && typeof item === 'object' ? (item as Record<string, unknown>) : undefined;
      const presetOverride = record?.preset === 'minimal' ? 'minimal' : undefined;
      const experimentalHooksOverride = record?.experimentalHooks === true ? true : undefined;

      const command = buildWorkspaceAgentSyncCliArgs(
        resolveAgentSyncCliOptions({
          scope,
          preset: presetOverride,
          experimentalHooks: experimentalHooksOverride,
        })
      );

      await runWorkspaceIntelligenceCommandWithProgress({
        command,
        cwd: target.workspacePath,
        title: `Agent Grounding — ${target.workspaceName}`,
        featureLabel: 'Agent Grounding Sync',
      });
      logger.info(`Workspace agent grounding sync dispatched for ${target.workspacePath}`);
    }),

    vscode.commands.registerCommand(
      'workspai.workspaceIntelligenceChain',
      async (item?: unknown) => {
        const workspaceExplorer = getWorkspaceExplorer();
        const target = requireWorkspaceTarget(item, workspaceExplorer);
        if (!target) {
          return;
        }

        if (!(await requireWorkspaceIntelligenceCli('Intelligence Chain', target.workspacePath))) {
          return;
        }

        await dispatchWorkspaceIntelligenceChain({
          workspacePath: target.workspacePath,
          workspaceName: target.workspaceName,
        });
        logger.info(`Workspace intelligence chain dispatched for ${target.workspacePath}`);
      }
    ),

    vscode.commands.registerCommand('workspai.workspaceVerify', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Workspace Verify', target.workspacePath))) {
        return;
      }

      const typed = asWorkspaceCommandItem(item);
      const fromImpact =
        typeof typed?.from === 'string' && typed.from.trim().length > 0
          ? toPosixRelativePath(target.workspacePath, typed.from.trim())
          : WORKSPACE_IMPACT_REPORT_PATH;
      const scope =
        typeof typed?.scope === 'string' && typed.scope.trim().length > 0
          ? typed.scope.trim()
          : undefined;

      const command: string[] = ['workspace', 'verify', '--from-impact', fromImpact, '--json'];
      if (scope) {
        command.push('--scope', scope);
      }

      await runWorkspaceIntelligenceCommandWithProgress({
        command,
        cwd: target.workspacePath,
        title: `Workspace Verify — ${target.workspaceName}`,
        featureLabel: 'Workspace Verify',
      });
      logger.info(`Workspace verify dispatched for ${target.workspacePath}`);
    }),

    vscode.commands.registerCommand('workspai.workspaceImpactLens', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Workspace Advisor', target.workspacePath))) {
        return;
      }

      const scope = resolveImpactScope(item);
      await dispatchWorkspaceImpactLens({
        workspacePath: target.workspacePath,
        workspaceName: target.workspaceName,
        scope,
        label: scope
          ? `Workspace Advisor (${scope}) — ${target.workspaceName}`
          : `Workspace Advisor — ${target.workspaceName}`,
      });
      logger.info(`Workspace Advisor dispatched for ${target.workspacePath}`);
    }),

    vscode.commands.registerCommand('workspai.architectureImpactLens', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (
        !(await requireWorkspaceIntelligenceCli(
          'Architecture Workspace Advisor',
          target.workspacePath
        ))
      ) {
        return;
      }

      const scope = resolveImpactScope(item);
      await dispatchWorkspaceImpactLens({
        workspacePath: target.workspacePath,
        workspaceName: target.workspaceName,
        scope,
        label: scope
          ? `Architecture Workspace Advisor (${scope}) — ${target.workspaceName}`
          : `Architecture Workspace Advisor — ${target.workspaceName}`,
      });
      logger.info(
        `Architecture Workspace Advisor dispatched for ${target.workspacePath}${scope ? ` (${scope})` : ''}`
      );
    }),

    vscode.commands.registerCommand('workspai.copyCopilotContextPrompt', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }
      const freshness = await ensureFreshEvidenceForAIAction({
        workspacePath: target.workspacePath,
        actionLabel: 'Send to Copilot',
        refresh: async () => {
          await vscode.commands.executeCommand('workspai.workspaceIntelligenceChain', {
            path: target.workspacePath,
          });
        },
      });
      if (freshness === 'cancelled') {
        return;
      }
      await sendWorkspaceIntelligenceToCopilot({
        workspacePath: target.workspacePath,
        workspaceName: target.workspaceName,
      });
    }),
  ];
}
