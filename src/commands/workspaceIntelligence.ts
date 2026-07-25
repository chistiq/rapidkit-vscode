import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';

import { Logger } from '../utils/logger';
import { gateWorkspaceIntelligenceCli } from '../core/rapidkitCliCapabilities';
import { gateCompatibleCliVersion } from '../core/cliVersionGate';
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
  WORKSPAI_REPORTS_DIR,
} from '../core/workspaceIntelligencePaths';
import { sendWorkspaceIntelligenceToCopilot } from '../core/sendToCopilot';
import { ensureFreshEvidenceForAIAction } from '../core/workspaceEvidenceFreshnessGate';
import {
  getWorkspaceCommandPreset,
  getWorkspaceCommandPresetGroup,
  shouldPromptForWorkspaceCommandPreset,
  type WorkspaceCommandPreset,
} from '../core/workspaceCommandPresets';

type WorkspaceExplorerLike = {
  getSelectedWorkspace?: () => { path: string; name?: string } | null | undefined;
};

type WorkspaceCommandItem = {
  workspace?: { path?: unknown; name?: unknown };
  path?: unknown;
  name?: unknown;
  from?: unknown;
  scope?: unknown;
  target?: unknown;
  source?: unknown;
  preset?: unknown;
  forcePresetPrompt?: unknown;
  experimentalHooks?: unknown;
  query?: unknown;
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
  const versionAllowed = await gateCompatibleCliVersion({ cwd: workspacePath, featureLabel });
  if (!versionAllowed) {
    return false;
  }
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
    defaultUri: vscode.Uri.file(path.join(input.workspacePath, WORKSPAI_REPORTS_DIR)),
    openLabel: 'Select baseline report',
    title: input.title,
  });

  const filePath = pickedFile?.[0]?.fsPath;
  if (!filePath) {
    return undefined;
  }

  return toPosixRelativePath(input.workspacePath, filePath);
}

async function resolveWorkspaceCommandPreset(input: {
  commandId: string;
  item?: unknown;
  workspaceName: string;
}): Promise<WorkspaceCommandPreset | undefined> {
  const typed = asWorkspaceCommandItem(input.item);
  const presetId =
    input.commandId === 'workspaceAgentSync' && typed?.experimentalHooks === true
      ? 'hooks'
      : typeof typed?.preset === 'string'
        ? typed.preset.trim()
        : '';
  const explicitPreset = getWorkspaceCommandPreset(input.commandId, presetId);
  if (explicitPreset) {
    return explicitPreset;
  }

  const group = getWorkspaceCommandPresetGroup(input.commandId);
  if (!group) {
    return undefined;
  }

  if (
    !shouldPromptForWorkspaceCommandPreset({
      source: typed?.source,
      preset: typed?.preset,
      forcePresetPrompt: typed?.forcePresetPrompt,
    })
  ) {
    return group.presets[0];
  }

  const picked = await vscode.window.showQuickPick<WorkspaceCommandPreset>(group.presets, {
    title: `${group.title} — ${input.workspaceName}`,
    placeHolder: group.placeHolder,
    ignoreFocusOut: true,
  });
  return picked;
}

function appendScopeArg(command: string[], scope?: string): string[] {
  if (scope?.trim()) {
    command.push('--scope', scope.trim());
  }
  return command;
}

function applyCommandPlaceholders(
  args: string[],
  replacements: Record<string, string | undefined>
): string[] {
  return args.map((arg) => replacements[arg] ?? arg);
}

export function registerWorkspaceIntelligenceCommands(options: {
  logger: Logger;
  getWorkspaceExplorer: () => WorkspaceExplorerLike | undefined;
}): vscode.Disposable[] {
  const { logger, getWorkspaceExplorer } = options;

  const exportWorkspaceGraph = async (
    format: 'jsonld' | 'graphml' | 'gexf',
    item?: unknown
  ): Promise<void> => {
    const target = requireWorkspaceTarget(item, getWorkspaceExplorer());
    if (!target) {
      return;
    }
    if (
      !(await requireWorkspaceIntelligenceCli(
        `Workspace Graph ${format.toUpperCase()} Export`,
        target.workspacePath
      ))
    ) {
      return;
    }
    const output = await vscode.window.showSaveDialog({
      title: `Export Workspace Graph as ${format.toUpperCase()}`,
      defaultUri: vscode.Uri.file(
        path.join(target.workspacePath, WORKSPAI_REPORTS_DIR, `workspace-graph.${format}`)
      ),
      saveLabel: 'Export graph',
      filters: { [format.toUpperCase()]: [format] },
    });
    if (!output) {
      return;
    }
    await runWorkspaceIntelligenceCommandWithProgress({
      command: ['workspace', 'graph', format, '--output', output.fsPath, '--json'],
      cwd: target.workspacePath,
      title: `Graph Export — ${target.workspaceName}`,
      featureLabel: `Workspace Graph ${format.toUpperCase()} Export`,
    });
    logger.info(`Workspace graph ${format} export dispatched for ${target.workspacePath}`);
  };

  return [
    vscode.commands.registerCommand('workspai.workspaceGraphSearch', async (item?: unknown) => {
      const target = requireWorkspaceTarget(item, getWorkspaceExplorer());
      if (!target) {
        return;
      }
      if (
        !(await requireWorkspaceIntelligenceCli('Workspace Graph Search', target.workspacePath))
      ) {
        return;
      }
      const typed = asWorkspaceCommandItem(item);
      const explicitQuery =
        typeof typed?.query === 'string'
          ? typed.query.trim()
          : typeof typed?.target === 'string'
            ? typed.target.trim()
            : '';
      const query =
        explicitQuery ||
        (
          await vscode.window.showInputBox({
            title: 'Search Workspace Graph',
            prompt: 'Find projects, services, APIs, symbols, ownership, or evidence',
            placeHolder: 'e.g. authentication API dependencies',
            ignoreFocusOut: true,
            validateInput: (value) => (value.trim() ? undefined : 'Enter a graph search query.'),
          })
        )?.trim();
      if (!query) {
        return;
      }
      await runWorkspaceIntelligenceCommandWithProgress({
        command: ['workspace', 'graph', 'search', query, '--limit', '12', '--json'],
        cwd: target.workspacePath,
        title: `Graph Search — ${target.workspaceName}`,
        featureLabel: 'Workspace Graph Search',
      });
      logger.info(`Workspace graph search dispatched for ${target.workspacePath}`);
    }),

    vscode.commands.registerCommand('workspai.workspaceGraphExport.jsonld', (item?: unknown) =>
      exportWorkspaceGraph('jsonld', item)
    ),
    vscode.commands.registerCommand('workspai.workspaceGraphExport.graphml', (item?: unknown) =>
      exportWorkspaceGraph('graphml', item)
    ),
    vscode.commands.registerCommand('workspai.workspaceGraphExport.gexf', (item?: unknown) =>
      exportWorkspaceGraph('gexf', item)
    ),

    vscode.commands.registerCommand(
      'workspai.workspaceEvaluationStatus',
      async (item?: unknown) => {
        const target = requireWorkspaceTarget(item, getWorkspaceExplorer());
        if (!target) {
          return;
        }
        if (
          !(await requireWorkspaceIntelligenceCli(
            'Workspace Evaluation Status',
            target.workspacePath
          ))
        ) {
          return;
        }
        await runWorkspaceIntelligenceCommandWithProgress({
          command: ['workspace', 'eval', 'status', '--json'],
          cwd: target.workspacePath,
          title: `Evaluation Status — ${target.workspaceName}`,
          featureLabel: 'Workspace Evaluation Status',
          suppressFailureMessage: true,
        });
        logger.info(`Workspace evaluation status dispatched for ${target.workspacePath}`);
      }
    ),

    vscode.commands.registerCommand(
      'workspai.workspaceEvaluationReport',
      async (item?: unknown) => {
        const target = requireWorkspaceTarget(item, getWorkspaceExplorer());
        if (!target) {
          return;
        }
        if (
          !(await requireWorkspaceIntelligenceCli(
            'Workspace Evaluation Report',
            target.workspacePath
          ))
        ) {
          return;
        }
        await runWorkspaceIntelligenceCommandWithProgress({
          command: ['workspace', 'eval', 'report', '--json'],
          cwd: target.workspacePath,
          title: `Evaluation Report — ${target.workspaceName}`,
          featureLabel: 'Workspace Evaluation Report',
        });
        logger.info(`Workspace evaluation report dispatched for ${target.workspacePath}`);
      }
    ),

    vscode.commands.registerCommand('workspai.workspaceModel', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Workspace Model', target.workspacePath))) {
        return;
      }

      const preset = await resolveWorkspaceCommandPreset({
        commandId: 'workspaceModel',
        item,
        workspaceName: target.workspaceName,
      });
      if (!preset) {
        return;
      }

      await runWorkspaceIntelligenceCommandWithProgress({
        command: [...preset.args],
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

      const preset = await resolveWorkspaceCommandPreset({
        commandId: 'workspaceDiff',
        item,
        workspaceName: target.workspaceName,
      });
      if (!preset) {
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
      const command = applyCommandPlaceholders([...preset.args], {
        '<baseline-report>': fromPath,
      });

      await runWorkspaceIntelligenceCommandWithProgress({
        command,
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

      const preset = await resolveWorkspaceCommandPreset({
        commandId: 'workspaceImpact',
        item,
        workspaceName: target.workspaceName,
      });
      if (!preset) {
        return;
      }

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

      const command = appendScopeArg(
        applyCommandPlaceholders([...preset.args], {
          '<change-report>': fromPath,
        }),
        scope
      );

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

      const preset = await resolveWorkspaceCommandPreset({
        commandId: 'workspaceContextAgent',
        item,
        workspaceName: target.workspaceName,
      });
      if (!preset) {
        return;
      }
      const command = appendScopeArg([...preset.args], scope);

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
      const preset = await resolveWorkspaceCommandPreset({
        commandId: 'workspaceAgentSync',
        item,
        workspaceName: target.workspaceName,
      });
      if (!preset) {
        return;
      }
      const command = appendScopeArg([...preset.args], scope);

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
          : undefined;
      const scope =
        typeof typed?.scope === 'string' && typed.scope.trim().length > 0
          ? typed.scope.trim()
          : undefined;

      const preset = await resolveWorkspaceCommandPreset({
        commandId: 'workspaceVerify',
        item,
        workspaceName: target.workspaceName,
      });
      if (!preset) {
        return;
      }

      let resolvedFromImpact = fromImpact;
      if (preset.requiresArtifact && !resolvedFromImpact) {
        resolvedFromImpact = await resolveIntelligenceFromPath({
          workspacePath: target.workspacePath,
          item,
          candidates: WORKSPACE_INTELLIGENCE_IMPACT_FROM_CANDIDATES,
          title: 'Workspace Verify',
          prompt: 'Select workspace impact report',
        });
        if (!resolvedFromImpact) {
          vscode.window.showWarningMessage(
            'Workspace verify from impact requires a workspace impact report.'
          );
          return;
        }
      }

      const command: string[] = ['workspace', 'verify'];
      if (preset.id === 'strict') {
        command.push('--strict');
      }
      if (resolvedFromImpact) {
        command.push('--from-impact', resolvedFromImpact);
      }
      command.push('--json');
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

    vscode.commands.registerCommand('workspai.workspaceExplain', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Workspace Explain', target.workspacePath))) {
        return;
      }

      const typed = asWorkspaceCommandItem(item);
      const explainTarget =
        typeof typed?.target === 'string' && typed.target.trim().length > 0
          ? typed.target.trim()
          : 'release-blocked';
      const preset = await resolveWorkspaceCommandPreset({
        commandId: 'workspaceExplain',
        item,
        workspaceName: target.workspaceName,
      });
      if (!preset) {
        return;
      }
      const command = applyCommandPlaceholders([...preset.args], {
        '<target>': explainTarget,
      });

      await runWorkspaceIntelligenceCommandWithProgress({
        command,
        cwd: target.workspacePath,
        title: `Workspace Explain — ${target.workspaceName}`,
        featureLabel: 'Workspace Explain',
      });
      logger.info(`Workspace explain dispatched for ${target.workspacePath}`);
    }),

    vscode.commands.registerCommand('workspai.workspaceWhy', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Workspace Why', target.workspacePath))) {
        return;
      }

      const typed = asWorkspaceCommandItem(item);
      const explainTarget =
        typeof typed?.target === 'string' && typed.target.trim().length > 0
          ? typed.target.trim()
          : 'release-blocked';
      const preset = await resolveWorkspaceCommandPreset({
        commandId: 'workspaceWhy',
        item,
        workspaceName: target.workspaceName,
      });
      if (!preset) {
        return;
      }
      const command = applyCommandPlaceholders([...preset.args], {
        '<target>': explainTarget,
      });

      await runWorkspaceIntelligenceCommandWithProgress({
        command,
        cwd: target.workspacePath,
        title: `Workspace Why — ${target.workspaceName}`,
        featureLabel: 'Workspace Why',
      });
      logger.info(`Workspace why dispatched for ${target.workspacePath}`);
    }),

    vscode.commands.registerCommand('workspai.workspaceTrace', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Workspace Trace', target.workspacePath))) {
        return;
      }

      const preset = await resolveWorkspaceCommandPreset({
        commandId: 'workspaceTrace',
        item,
        workspaceName: target.workspaceName,
      });
      if (!preset) {
        return;
      }
      const fromRef = await resolveIntelligenceFromPath({
        workspacePath: target.workspacePath,
        item,
        candidates: [WORKSPACE_MODEL_DIFF_REPORT_PATH],
        title: 'Workspace Trace',
        prompt: 'Select workspace diff report',
      });
      if (!fromRef) {
        vscode.window.showWarningMessage(
          `Workspace trace requires a diff report (e.g. ${WORKSPACE_MODEL_DIFF_REPORT_PATH}).`
        );
        return;
      }
      const command = applyCommandPlaceholders([...preset.args], {
        '<diff-report>': fromRef,
      });

      await runWorkspaceIntelligenceCommandWithProgress({
        command,
        cwd: target.workspacePath,
        title: `Workspace Trace — ${target.workspaceName}`,
        featureLabel: 'Workspace Trace',
      });
      logger.info(`Workspace trace dispatched for ${target.workspacePath}`);
    }),

    vscode.commands.registerCommand('workspai.workspaceRemediationPlan', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = requireWorkspaceTarget(item, workspaceExplorer);
      if (!target) {
        return;
      }

      if (!(await requireWorkspaceIntelligenceCli('Workspace Repair Plan', target.workspacePath))) {
        return;
      }

      const preset = await resolveWorkspaceCommandPreset({
        commandId: 'workspaceRemediationPlan',
        item,
        workspaceName: target.workspaceName,
      });
      if (!preset) {
        return;
      }

      await runWorkspaceIntelligenceCommandWithProgress({
        command: [...preset.args],
        cwd: target.workspacePath,
        title: `Workspace Repair Plan — ${target.workspaceName}`,
        featureLabel: 'Workspace Repair Plan',
      });
      logger.info(`Workspace repair plan dispatched for ${target.workspacePath}`);
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
