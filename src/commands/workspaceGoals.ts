import * as path from 'path';
import * as vscode from 'vscode';

import { Logger } from '../utils/logger.js';
import { revealWorkspaiEvidenceOutputForUser } from '../core/evidenceCommandRunner.js';
import {
  readGoalIndex,
  runGoalCommand,
  summarizeGoal,
  isGoalLifecycleResult,
  isGoalPlanResult,
  type GoalEntry,
  type GoalLifecycleResult,
  type GoalPlanResult,
} from '../core/workspaceGoals.js';

type WorkspaceExplorerLike = {
  getSelectedWorkspace?: () => { path: string; name?: string } | null | undefined;
};

type GoalCommandItem = {
  workspace?: { path?: unknown; name?: unknown };
  project?: { name?: unknown; path?: unknown; workspacePath?: unknown };
  path?: unknown;
  name?: unknown;
  projectName?: unknown;
  scope?: unknown;
  intent?: unknown;
  goalId?: unknown;
  forAgent?: unknown;
};

function asItem(value: unknown): GoalCommandItem | undefined {
  return value && typeof value === 'object' ? (value as GoalCommandItem) : undefined;
}

function resolveTarget(
  item: unknown,
  explorer: WorkspaceExplorerLike
): {
  workspacePath: string;
  invocationPath: string;
  workspaceName: string;
  scope?: string;
} | null {
  const typed = asItem(item);
  const selected = explorer.getSelectedWorkspace?.();
  const candidateWorkspacePath =
    typed?.workspace?.path ?? typed?.project?.workspacePath ?? selected?.path ?? typed?.path;
  const candidateInvocationPath = typed?.project?.path ?? typed?.path ?? candidateWorkspacePath;
  if (
    typeof candidateWorkspacePath !== 'string' ||
    !candidateWorkspacePath.trim() ||
    typeof candidateInvocationPath !== 'string' ||
    !candidateInvocationPath.trim()
  ) {
    return null;
  }
  const candidateName = typed?.workspace?.name ?? typed?.name ?? selected?.name;
  const explicitScope = typeof typed?.scope === 'string' ? typed.scope.trim() : '';
  const projectName = typed?.project?.name ?? typed?.projectName;
  return {
    workspacePath: candidateWorkspacePath,
    workspaceName:
      typeof candidateName === 'string' && candidateName.trim()
        ? candidateName.trim()
        : path.basename(candidateWorkspacePath),
    invocationPath: candidateInvocationPath,
    scope:
      explicitScope ||
      (typeof projectName === 'string' && projectName.trim()
        ? `project:${projectName.trim()}`
        : undefined),
  };
}

function formatPlanMessage(value: GoalPlanResult): string {
  const labels: Record<GoalPlanResult['result'], string> = {
    planned: 'Goal planned and ready for governed work.',
    'needs-confirmation': 'Goal needs a decision before preparation.',
    'needs-evidence': 'Goal needs measurable evidence before preparation.',
    blocked: 'Goal planning is blocked by current workspace evidence.',
  };
  return labels[value.result];
}

async function showGoalFailure(error: string): Promise<void> {
  const choice = await vscode.window.showErrorMessage(
    `Governed Goal stopped safely: ${error}`,
    'Open Evidence Output'
  );
  if (choice === 'Open Evidence Output') {
    revealWorkspaiEvidenceOutputForUser();
  }
}

async function runLifecycle(
  workspacePath: string,
  operation: 'activate' | 'cancel' | 'prepare' | 'verify',
  goal: GoalEntry
): Promise<boolean> {
  const verb = operation[0].toUpperCase() + operation.slice(1);
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `${verb} Goal — ${goal.objective}`,
      cancellable: false,
    },
    () =>
      runGoalCommand({
        workspacePath,
        args: [`--${operation}`, goal.id],
        label: `Goal ${verb}`,
      })
  );
  if (!result.ok) {
    await showGoalFailure(result.error);
    return false;
  }
  if (!isGoalLifecycleResult(result.value)) {
    await showGoalFailure('CLI returned a Goal planning result for a lifecycle operation.');
    return false;
  }
  const lifecycle: GoalLifecycleResult = result.value;
  vscode.window.showInformationMessage(
    `${verb} complete: ${lifecycle.goal?.objective ?? goal.objective} · ${lifecycle.goal?.lifecycle ?? operation}`
  );
  return true;
}

async function pickGoalAction(workspacePath: string, goal: GoalEntry): Promise<void> {
  const options: Array<
    vscode.QuickPickItem & {
      operation?: 'activate' | 'cancel' | 'prepare' | 'verify';
      command?: string;
    }
  > = [
    {
      label: '$(eye) Open Goal Pack',
      description: 'Open canonical goal-pack.json',
      command: goal.goalPack,
    },
    {
      label: '$(hubot) Open Agent Handoff',
      description: 'Open bounded agent-handoff.json',
      command: goal.agentHandoff,
    },
  ];
  if (
    goal.state === 'ready-to-plan' &&
    goal.lifecycle !== 'active' &&
    goal.lifecycle !== 'verified' &&
    goal.lifecycle !== 'cancelled'
  ) {
    options.unshift({
      label: '$(target) Activate',
      description: 'Make this the active objective',
      operation: 'activate',
    });
  }
  if (goal.state !== 'ready-to-plan' && !['cancelled', 'verified'].includes(goal.lifecycle)) {
    options.unshift({
      label: '$(question) Review required input',
      description:
        goal.state === 'needs-confirmation'
          ? 'Clarify scope or intent before activation'
          : goal.state === 'needs-evidence'
            ? 'Configure the required measurement evidence'
            : 'Inspect the blocker recorded by the CLI',
      command: goal.goalPack,
    });
  }
  if (goal.lifecycle === 'active') {
    options.unshift({
      label: '$(checklist) Prepare',
      description: 'Link deterministic verification evidence',
      operation: 'prepare',
    });
  }
  if (goal.lifecycle === 'verification-ready') {
    options.unshift({
      label: '$(verified) Verify',
      description: 'Run CLI-owned goal verification',
      operation: 'verify',
    });
  }
  if (!['cancelled', 'verified'].includes(goal.lifecycle)) {
    options.push({
      label: '$(circle-slash) Cancel',
      description: 'Cancel without deleting evidence',
      operation: 'cancel',
    });
  }
  const selected = await vscode.window.showQuickPick(options, {
    title: goal.objective,
    placeHolder: summarizeGoal(goal),
    ignoreFocusOut: true,
  });
  if (!selected) {
    return;
  }
  if (selected.operation) {
    await runLifecycle(workspacePath, selected.operation, goal);
    return;
  }
  if (selected.command) {
    const absolutePath = path.resolve(workspacePath, selected.command);
    const relative = path.relative(workspacePath, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      await showGoalFailure('Goal artifact path escaped the canonical workspace boundary.');
      return;
    }
    await vscode.window.showTextDocument(vscode.Uri.file(absolutePath), { preview: false });
  }
}

export function registerWorkspaceGoalCommands(options: {
  logger: Logger;
  getWorkspaceExplorer: () => WorkspaceExplorerLike;
}): vscode.Disposable[] {
  const requireTarget = (item?: unknown) => {
    const target = resolveTarget(item, options.getWorkspaceExplorer());
    if (!target) {
      vscode.window.showWarningMessage('Select a Workspai workspace before managing a Goal.');
    }
    return target;
  };

  return [
    vscode.commands.registerCommand('workspai.workspaceGoalCreate', async (item?: unknown) => {
      const target = requireTarget(item);
      if (!target) {
        return;
      }
      const typed = asItem(item);
      const explicitIntent = typeof typed?.intent === 'string' ? typed.intent.trim() : '';
      const intent =
        explicitIntent ||
        (
          await vscode.window.showInputBox({
            title: `New Governed Goal — ${target.workspaceName}`,
            prompt: 'Describe one measurable engineering outcome in plain language.',
            placeHolder: 'e.g. Raise test coverage to 85%',
            ignoreFocusOut: true,
            validateInput: (value) =>
              value.trim().length < 8
                ? 'Describe the outcome in at least 8 characters.'
                : undefined,
          })
        )?.trim();
      if (!intent) {
        return;
      }
      const explicitConsumer =
        typeof typed?.forAgent === 'string' &&
        ['generic', 'codex', 'claude'].includes(typed.forAgent)
          ? typed.forAgent
          : undefined;
      const consumer = explicitConsumer
        ? { label: explicitConsumer, value: explicitConsumer }
        : await vscode.window.showQuickPick(
            [
              { label: 'Generic agent', value: 'generic' },
              { label: 'Codex', value: 'codex' },
              { label: 'Claude', value: 'claude' },
            ],
            {
              title: 'Agent handoff',
              placeHolder: 'Choose the consumer projection',
              ignoreFocusOut: true,
            }
          );
      if (!consumer) {
        return;
      }
      const args = [intent, '--for-agent', consumer.value];
      if (target.scope) {
        args.push('--scope', target.scope);
      }
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Planning governed Goal — ${target.workspaceName}`,
          cancellable: false,
        },
        () => runGoalCommand({ workspacePath: target.invocationPath, args, label: 'Goal Plan' })
      );
      if (!result.ok) {
        await showGoalFailure(result.error);
        return;
      }
      if (!isGoalPlanResult(result.value)) {
        await showGoalFailure('CLI returned a Goal lifecycle result for a planning operation.');
        return;
      }
      const value: GoalPlanResult = result.value;
      const action = await vscode.window.showInformationMessage(
        `${formatPlanMessage(value)} ${intent}`,
        'Review Goal'
      );
      if (action === 'Review Goal') {
        await vscode.commands.executeCommand('workspai.workspaceGoalShow', {
          workspace: { path: target.workspacePath, name: target.workspaceName },
          goalId: value.goalPack.id,
        });
      }
      options.logger.info(`Governed Goal ${value.goalPack.id} planned for ${target.workspaceName}`);
    }),
    vscode.commands.registerCommand('workspai.workspaceGoalShow', async (item?: unknown) => {
      const target = requireTarget(item);
      if (!target) {
        return;
      }
      const index = await readGoalIndex(target.workspacePath);
      if (index.kind === 'missing') {
        const action = await vscode.window.showInformationMessage(
          'No governed Goals exist in this workspace yet.',
          'Create Goal'
        );
        if (action === 'Create Goal') {
          await vscode.commands.executeCommand('workspai.workspaceGoalCreate', item);
        }
        return;
      }
      if (index.kind !== 'valid') {
        await showGoalFailure(index.error);
        return;
      }
      const explicitGoalId = asItem(item)?.goalId;
      const explicitGoal =
        typeof explicitGoalId === 'string'
          ? index.value.goals.find((goal) => goal.id === explicitGoalId)
          : undefined;
      if (explicitGoal) {
        await pickGoalAction(target.workspacePath, explicitGoal);
        return;
      }
      const selected = await vscode.window.showQuickPick(
        index.value.goals.map((goal) => ({
          label: `${goal.id === index.value.activeGoalId ? '$(target) ' : ''}${goal.objective}`,
          description: summarizeGoal(goal),
          detail: `${goal.category} · ${goal.id}`,
          goal,
        })),
        {
          title: `Governed Goals — ${target.workspaceName}`,
          placeHolder: index.value.activeGoalId
            ? 'Select a Goal or its next lifecycle action'
            : 'No active Goal selected',
          ignoreFocusOut: true,
        }
      );
      if (selected) {
        await pickGoalAction(target.workspacePath, selected.goal);
      }
    }),
  ];
}
