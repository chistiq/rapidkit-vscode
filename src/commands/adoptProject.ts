import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { WorkspaceUsageTracker } from '../utils/workspaceUsageTracker';
import {
  describeCanonicalCliFailure,
  isCanonicalCliFailure,
  runCanonicalNpmAdopt,
} from '../core/canonicalProjectLifecycle';
import { resolveEnableModulesPreference } from '../core/moduleEnablementPrompt';
import { refreshExtensionAfterNpmProjectOnboard } from '../core/npmProjectOnboardRefresh';
import { gateCompatibleCliVersion } from '../core/cliVersionGate';
import { gateAdoptCli } from '../core/rapidkitCliCapabilities';
import { findWorkspaceRootUp } from '../core/workspacePaths';

interface AdoptProjectInput {
  projectPath: string;
  projectName?: string;
  projectType?: string;
  workspacePath?: string;
  enableModules?: boolean;
  useDefaultWorkspace?: boolean;
}

function resolveExplicitWorkspacePath(input: AdoptProjectInput): string | undefined {
  if (input.useDefaultWorkspace) {
    return undefined;
  }
  if (input.workspacePath?.trim()) {
    return input.workspacePath.trim();
  }
  return findWorkspaceRootUp(input.projectPath);
}

async function hasManagedMarker(projectPath: string): Promise<boolean> {
  const projectMarkerPath = path.join(projectPath, '.rapidkit', 'project.json');
  const contextMarkerPath = path.join(projectPath, '.rapidkit', 'context.json');
  return (await fs.pathExists(projectMarkerPath)) || (await fs.pathExists(contextMarkerPath));
}

/**
 * Adopt an existing project via the canonical npm CLI (`npx rapidkit adopt`).
 * Workspace resolution (including managed default `~/rapidkit/workspaces/workspai`)
 * is delegated to npm unless an explicit workspacePath is supplied.
 */
export async function adoptProjectCommand(input: AdoptProjectInput): Promise<boolean> {
  const logger = Logger.getInstance();

  if (!input.projectPath) {
    vscode.window.showWarningMessage('Select a project first.');
    return false;
  }

  const projectPath = path.resolve(input.projectPath);
  const projectName = input.projectName ?? path.basename(projectPath);
  const explicitWorkspacePath = resolveExplicitWorkspacePath(input);

  try {
    if (!(await gateCompatibleCliVersion({ cwd: projectPath, featureLabel: 'Adopt Project' }))) {
      return false;
    }
    if (!(await gateAdoptCli('Adopt Project', { cwd: projectPath }))) {
      return false;
    }

    const stat = await fs.stat(projectPath).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      vscode.window.showErrorMessage(`Project path is invalid: ${projectPath}`);
      return false;
    }

    if (await hasManagedMarker(projectPath)) {
      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        'workspai.convertProjectToManaged',
        explicitWorkspacePath,
        {
          result: 'already-managed',
          projectName,
          intent: 'npm-adopt-handoff',
        }
      );
      vscode.window.showInformationMessage(
        `Project "${projectName}" is already managed by Workspai.`
      );
      return false;
    }

    const enableModules = await resolveEnableModulesPreference(
      'Adopt project module support',
      input.enableModules
    );
    if (enableModules === undefined) {
      return false;
    }

    const adoptionOutcome = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Adopting ${projectName} via RapidKit CLI...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 20, message: 'Running npx rapidkit adopt...' });

        const adoptionResult = await runCanonicalNpmAdopt({
          projectPath,
          projectName,
          enableModules,
          workspacePath: explicitWorkspacePath,
        });
        if (isCanonicalCliFailure(adoptionResult)) {
          throw new Error(describeCanonicalCliFailure('adopt', adoptionResult));
        }

        return adoptionResult;
      }
    );

    const adoptedProject = adoptionOutcome.adoptedProject;
    const workspacePath = adoptionOutcome.workspacePath ?? explicitWorkspacePath;
    if (!workspacePath || !adoptedProject?.path) {
      throw new Error('Adopt finished without workspacePath or adoptedProject in npm JSON output.');
    }

    await refreshExtensionAfterNpmProjectOnboard({
      workspacePath,
      projectPath: adoptedProject.path,
      projectName: adoptedProject.name ?? projectName,
      projectType: adoptedProject.framework ?? adoptedProject.stack,
    });

    const detectedType = adoptedProject.framework ?? adoptedProject.stack ?? 'unknown';
    const runtime = adoptedProject.runtime ?? 'unknown';
    const supportTier = adoptedProject.supportTier ?? 'unknown';

    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.convertProjectToManaged',
      workspacePath,
      {
        result: 'success',
        projectName,
        detectedType,
        runtime,
        supportTier,
        adoptionEngine: 'rapidkit-npm',
        intent: 'npm-adopt-handoff',
        workspaceResolution: adoptionOutcome.workspaceResolution,
      }
    );

    const createdNote = adoptionOutcome.defaultWorkspaceCreated
      ? ` Default workspace created at ${workspacePath}.`
      : '';
    vscode.window.showInformationMessage(
      `Project "${projectName}" adopted into Workspai.${createdNote}`
    );

    logger.info('Project adopted via npm CLI', {
      projectPath: adoptedProject.path,
      projectName,
      workspacePath,
      detectedType,
      runtime,
      supportTier,
      workspaceResolution: adoptionOutcome.workspaceResolution,
    });

    return true;
  } catch (error) {
    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.convertProjectToManaged',
      explicitWorkspacePath,
      {
        result: 'failed',
        projectName,
        intent: 'npm-adopt-handoff',
      }
    );
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to adopt project: ${message}`);
    logger.error('Adopt project failed', error);
    return false;
  }
}
