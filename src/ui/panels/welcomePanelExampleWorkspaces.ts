import path from 'node:path';
import fs from 'fs-extra';
import * as vscode from 'vscode';

import { ExamplesService } from '../../core/examplesService';
import { WorkspaceManager } from '../../core/workspaceManager';
import { run } from '../../utils/exec';
import { runCommandsInTerminal, runShellCommandInTerminal } from '../../utils/terminalExecutor';
import type { ExampleWorkspaceDescriptor } from './welcomePanelWorkspaceSelectionMessages';

export type ExampleWorkspacesHost = {
  postWebviewMessage: (command: string, data?: unknown) => void;
  sendRecentWorkspaces: () => void | Promise<void>;
  sendExampleWorkspaces: () => void | Promise<void>;
  beginGovernanceChainForWorkspace: (
    workspacePath: string,
    workspaceName: string | undefined,
    triggeredBy: 'clone' | 'ai-create' | 'import' | 'create' | 'add'
  ) => Promise<void>;
};

async function checkGitStatus(repoPath: string): Promise<boolean> {
  try {
    const result = await run('git', ['status', '--porcelain'], { cwd: repoPath });
    if (result.exitCode !== 0) {
      return false;
    }
    return result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function cloneExampleWorkspace(
  host: ExampleWorkspacesHost,
  example: ExampleWorkspaceDescriptor
): Promise<void> {
  try {
    host.postWebviewMessage('setCloning', { exampleName: example.name });

    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Clone Location',
      title: `Clone ${example.title}`,
    });

    if (!result || result.length === 0) {
      host.postWebviewMessage('setCloning', { exampleName: null });
      return;
    }

    const parentFolder = result[0].fsPath;
    const targetPath = path.join(parentFolder, example.name);

    if (await fs.pathExists(targetPath)) {
      const overwrite = await vscode.window.showWarningMessage(
        `Folder "${example.name}" already exists at this location.`,
        'Cancel',
        'Open Existing'
      );

      if (overwrite === 'Open Existing') {
        const workspaceManager = WorkspaceManager.getInstance();
        await workspaceManager.addWorkspace(targetPath);
        await host.sendRecentWorkspaces();
        vscode.window.showInformationMessage(`✅ Imported existing workspace: ${example.name}`);
      }

      host.postWebviewMessage('setCloning', { exampleName: null });
      return;
    }

    vscode.window.showInformationMessage(`🔄 Cloning ${example.title}...`);
    const cloneSource = example.cloneUrl || 'https://github.com/rapidkitlabs/rapidkit-examples';

    const terminal = runShellCommandInTerminal({
      name: `Clone ${example.name}`,
      cwd: parentFolder,
      command: 'git',
      args: ['clone', cloneSource, 'rapidkit-examples-temp'],
    });

    await new Promise((resolve) => setTimeout(resolve, 8000));

    const tempRepoPath = path.join(parentFolder, 'rapidkit-examples-temp');
    const sourceWorkspacePath = path.join(tempRepoPath, example.name);

    if (await fs.pathExists(sourceWorkspacePath)) {
      await fs.move(sourceWorkspacePath, targetPath);
      await fs.remove(tempRepoPath);

      const examplesService = ExamplesService.getInstance();
      const commitHash = await examplesService.getRepoCommitHash(targetPath);

      await examplesService.trackClonedExample(
        example.id || example.name,
        example.name,
        targetPath,
        commitHash || undefined
      );

      const workspaceManager = WorkspaceManager.getInstance();
      await workspaceManager.addWorkspace(targetPath);
      await host.sendRecentWorkspaces();
      void host.beginGovernanceChainForWorkspace(targetPath, example.name, 'clone');

      await host.sendExampleWorkspaces();

      vscode.window
        .showInformationMessage(
          `✅ Successfully cloned and imported: ${example.name}`,
          'Open Workspace'
        )
        .then((selection) => {
          if (selection === 'Open Workspace') {
            const uri = vscode.Uri.file(targetPath);
            vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
          }
        });

      terminal.dispose();
    } else {
      if (await fs.pathExists(tempRepoPath)) {
        await fs.remove(tempRepoPath);
      }
      vscode.window.showWarningMessage(
        `Clone completed but workspace "${example.name}" not found in repository. Check the terminal for details.`,
        'OK'
      );
    }
  } catch (error: unknown) {
    console.error('[WelcomePanel] Error cloning example:', error);
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to clone example: ${message}`);
  } finally {
    host.postWebviewMessage('setCloning', { exampleName: null });
  }
}

export async function updateExampleWorkspace(
  host: ExampleWorkspacesHost,
  example: ExampleWorkspaceDescriptor
): Promise<void> {
  try {
    const examplesService = ExamplesService.getInstance();
    const info = await examplesService.getClonedExampleInfo(example.id || example.name);

    if (!info || !info.clonedPath) {
      vscode.window.showWarningMessage('Example is not cloned yet.');
      return;
    }

    if (!(await fs.pathExists(info.clonedPath))) {
      vscode.window
        .showWarningMessage(`Cloned example not found at: ${info.clonedPath}`, 'Untrack')
        .then(async (action) => {
          if (action === 'Untrack') {
            await examplesService.untrackExample(example.id || example.name);
            await host.sendExampleWorkspaces();
          }
        });
      return;
    }

    host.postWebviewMessage('setUpdating', { exampleName: example.name });

    const hasChanges = await checkGitStatus(info.clonedPath);

    if (hasChanges) {
      const action = await vscode.window.showWarningMessage(
        `The workspace "${example.name}" has uncommitted changes. Updating may cause conflicts.`,
        'Continue Anyway',
        'Cancel'
      );

      if (action !== 'Continue Anyway') {
        host.postWebviewMessage('setUpdating', { exampleName: null });
        return;
      }
    }

    runCommandsInTerminal({
      name: `Update ${example.name}`,
      cwd: info.clonedPath,
      commands: ['git fetch origin main', 'git pull origin main'],
    });

    vscode.window.showInformationMessage(
      `🔄 Updating ${example.name}... Check terminal for details.`,
      'OK'
    );

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const newCommitHash = await examplesService.getRepoCommitHash(info.clonedPath);
    if (newCommitHash) {
      await examplesService.trackClonedExample(
        example.id || example.name,
        example.name,
        info.clonedPath,
        newCommitHash
      );
    }

    await host.sendExampleWorkspaces();

    vscode.window.showInformationMessage(`✅ ${example.name} updated successfully!`);
  } catch (error: unknown) {
    console.error('[WelcomePanel] Error updating example:', error);
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to update example: ${message}`);
  } finally {
    host.postWebviewMessage('setUpdating', { exampleName: null });
  }
}
