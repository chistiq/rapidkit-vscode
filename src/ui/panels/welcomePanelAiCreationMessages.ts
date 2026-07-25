import path from 'node:path';
import fs from 'fs-extra';
import * as vscode from 'vscode';

import { askConfiguredAIProvider } from '../../core/aiProviderService';
import type { ScaffoldFramework } from '../../core/scaffoldKits';
import { resolveNewWorkspacePath } from '../../core/workspacePaths';
import {
  getWebviewMessageDataRecord,
  readAICreationMode,
  readAICreationStackIntent,
  readStringField,
} from '../../contracts/webviewProtocol';
import { asRecord } from './welcomePanel.shared.js';

const PYTHON_ENGINE_REQUIRED_CREATION_PROFILES = new Set(['python-only', 'polyglot', 'enterprise']);

function shouldSkipPythonEngineForCreationProfile(profile: string | undefined): boolean {
  return !PYTHON_ENGINE_REQUIRED_CREATION_PROFILES.has(profile ?? 'minimal');
}

export type AiCreationMessageHost = {
  context: vscode.ExtensionContext;
  postWebviewMessage: (command: string, data?: unknown) => void;
  getSelectedProject: () =>
    | {
        path: string;
        workspacePath?: string;
      }
    | null
    | undefined;
  getSelectedWorkspacePath: () => string | undefined;
  beginGovernanceChainForWorkspace: (
    workspacePath: string,
    workspaceName: string | undefined,
    triggeredBy: 'clone' | 'ai-create' | 'import' | 'create' | 'add'
  ) => Promise<void>;
};

export type AiCreationDispatchHost = AiCreationMessageHost & {
  runOptionalMessageLane: (laneName: string, lane: () => Promise<void> | void) => Promise<void>;
};

const AI_CREATION_WEBVIEW_COMMANDS = new Set(['aiParseCreation', 'aiCreateConfirm']);

export function isAiCreationWebviewCommand(command: string): boolean {
  return AI_CREATION_WEBVIEW_COMMANDS.has(command);
}

export async function tryDispatchAiCreationWebviewMessage(
  host: AiCreationDispatchHost,
  command: string,
  data: unknown
): Promise<boolean> {
  if (!isAiCreationWebviewCommand(command)) {
    return false;
  }

  switch (command) {
    case 'aiParseCreation':
      await host.runOptionalMessageLane('aiParseCreation', async () => {
        await handleAiParseCreationMessage(host, data);
      });
      break;
    case 'aiCreateConfirm':
      await host.runOptionalMessageLane('aiCreateConfirm', async () => {
        await handleAiCreationConfirmMessage(host, asRecord(data));
      });
      break;
  }

  return true;
}

export async function handleAiParseCreationMessage(
  host: AiCreationMessageHost,
  messageData: unknown
): Promise<void> {
  const payload = getWebviewMessageDataRecord({ command: 'aiParseCreation', data: messageData });
  const creationPrompt = readStringField(payload, 'prompt');
  const creationMode = readAICreationMode(payload);
  const creationFw = readStringField(payload, 'framework');
  const stackIntent = readAICreationStackIntent(payload);

  if (!creationPrompt || creationPrompt === '__reset__') {
    host.postWebviewMessage('aiCreationReset');
    return;
  }

  host.postWebviewMessage('aiCreationThinking', { thinking: true });
  try {
    const { parseCreationIntent } = await import('../../core/aiService.js');
    let workspacePath: string | undefined;
    const selectedProject = host.getSelectedProject();
    if (selectedProject) {
      workspacePath = selectedProject.workspacePath || path.dirname(selectedProject.path);
    } else {
      workspacePath = host.getSelectedWorkspacePath();
    }
    if (
      !workspacePath &&
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 0
    ) {
      workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    const { plan, modelId, planSource } = await parseCreationIntent(
      creationPrompt,
      creationMode,
      creationFw,
      workspacePath,
      undefined,
      async (messages, token) => {
        const response = await askConfiguredAIProvider(host.context, messages, token);
        return {
          text: response.text,
          modelId: response.provider,
        };
      },
      stackIntent
    );
    host.postWebviewMessage('aiCreationPlan', { plan, modelId, planSource });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    host.postWebviewMessage('aiCreationError', { error: errMsg });
  } finally {
    host.postWebviewMessage('aiCreationThinking', { thinking: false });
  }
}

export async function handleAiCreationConfirmMessage(
  host: AiCreationMessageHost,
  plan: Record<string, unknown> | undefined
): Promise<void> {
  if (!plan) {
    return;
  }

  host.postWebviewMessage('aiCreationStarted');
  try {
    if (plan.type === 'workspace') {
      const { resolveCreationProfile } = await import('../../core/aiService.js');
      const profile = resolveCreationProfile(
        plan.profile as string | undefined,
        plan.framework as string | undefined
      );
      const wsConfig = {
        name: plan.workspaceName,
        profile,
        installMethod: (plan.installMethod as string | undefined) ?? 'auto',
        skipPythonEngine: shouldSkipPythonEngineForCreationProfile(profile),
        initGit: true,
        policyMode: 'warn' as const,
        dependencySharing: 'isolated' as const,
        suppressPostCreatePrompt: true,
      };
      await vscode.commands.executeCommand('workspai.createWorkspace', wsConfig);

      const workspaceName = String(plan.workspaceName ?? '');
      const wsPath = resolveNewWorkspacePath(workspaceName);
      const wsExists = await fs.pathExists(wsPath);

      if (wsExists && plan.projectName) {
        host.postWebviewMessage('aiCreationProgress', {
          stage: 'workspace_done',
          workspacePath: wsPath,
        });
        try {
          const { createProjectCommand } = await import('../../commands/createProject.js');
          await createProjectCommand(
            wsPath,
            plan.framework as ScaffoldFramework,
            String(plan.projectName),
            plan.kit as string | undefined,
            {
              suppressPostCreatePrompt: true,
            }
          );

          const secondaryProject = plan.secondaryProject as
            | {
                framework: string;
                projectName: string;
                kit?: string;
              }
            | undefined;
          if (secondaryProject) {
            host.postWebviewMessage('aiCreationProgress', {
              stage: 'first_project_done',
              workspacePath: wsPath,
            });
            await createProjectCommand(
              wsPath,
              secondaryProject.framework as ScaffoldFramework,
              secondaryProject.projectName,
              secondaryProject.kit,
              { suppressPostCreatePrompt: true }
            );
          }
        } catch (projErr) {
          const projErrMsg = projErr instanceof Error ? projErr.message : String(projErr);
          host.postWebviewMessage('aiCreationDone', {
            plan,
            workspaceCreated: true,
            projectError: projErrMsg,
            workspacePath: wsPath,
          });
          return;
        }
      }

      host.postWebviewMessage('aiCreationDone', { plan, workspaceCreated: wsExists });
      if (wsExists) {
        void host.beginGovernanceChainForWorkspace(wsPath, workspaceName, 'ai-create');
      }
      return;
    }

    const workspacePath =
      (typeof plan.targetWorkspacePath === 'string' ? plan.targetWorkspacePath : undefined) ||
      host.getSelectedWorkspacePath();
    const { createProjectCommand } = await import('../../commands/createProject.js');
    await createProjectCommand(
      workspacePath,
      plan.framework as ScaffoldFramework,
      String(plan.projectName ?? ''),
      plan.kit as string | undefined
    );
    host.postWebviewMessage('aiCreationDone', { plan });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    host.postWebviewMessage('aiCreationError', { error: errMsg });
    host.postWebviewMessage('aiCreationThinking', { thinking: false });
  }
}
