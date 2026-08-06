import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('workspace explorer activation ordering', () => {
  it('publishes initial workspace selection only after command and views are registered', () => {
    const explorer = read('src/ui/treeviews/workspaceExplorer.ts');
    const extension = read('src/extension.ts');

    expect(explorer).toContain(
      'this._initialLoadPromise = this.loadWorkspaces({ publishSelection: false })'
    );
    expect(explorer).toContain('public async whenReady()');
    expect(explorer).toContain('public async publishSelectedWorkspaceContext()');
    expect(explorer).toContain(
      "await vscode.commands.executeCommand('workspai.workspaceSelected', this.selectedWorkspace)"
    );
    expect(
      extension.indexOf("vscode.commands.registerCommand('workspai.workspaceSelected'")
    ).toBeLessThan(extension.indexOf("'initial-workspace-selection'"));
    expect(extension.indexOf('vscode.window.registerWebviewViewProvider')).toBeLessThan(
      extension.indexOf("'initial-workspace-selection'")
    );
    expect(extension).not.toContain(
      'await workspaceExplorer.whenReady();\n    await workspaceExplorer.publishSelectedWorkspaceContext();'
    );
  });

  it('keeps workspace explorer as the selected workspace command source', () => {
    const extension = read('src/extension.ts');

    expect(extension).toContain("vscode.commands.registerCommand('workspai.getSelectedWorkspace'");
    expect(extension).toContain('return workspaceExplorer?.getSelectedWorkspace() ?? null;');
    expect(extension).not.toContain('return projectExplorer?.getSelectedWorkspace() ?? null;');
  });

  it('uses stable activation log labels instead of drifting step numbers', () => {
    const extension = read('src/extension.ts');

    expect(extension).toContain('Activation: registering commands');
    expect(extension).toContain('Activation: initializing workspace selection');
    expect(extension).toContain('Activation: Workspai extension initialized');
    expect(extension).not.toMatch(/Step \d+(?:\.\d+)?:/);
  });

  it('runs CLI gate and walkthrough evidence inside the non-blocking selection lane', () => {
    const extension = read('src/extension.ts');

    const laneIndex = extension.indexOf("'initial-workspace-selection'");
    const publishIndex = extension.indexOf(
      'await workspaceExplorer.publishSelectedWorkspaceContext()'
    );
    expect(laneIndex).toBeGreaterThan(-1);
    expect(publishIndex).toBeGreaterThan(-1);
    expect(laneIndex).toBeLessThan(publishIndex);
    expect(publishIndex).toBeLessThan(extension.indexOf('await presentCliVersionGate'));
    expect(publishIndex).toBeLessThan(
      extension.indexOf('await syncWalkthroughEvidenceContext(cwd ?? null')
    );
  });

  it('prompts to register detected workspace roots only after explorer activation is ready', () => {
    const extension = read('src/extension.ts');
    const detector = read('src/core/workspaceDetector.ts');

    expect(detector).toContain('detectWorkspaceRoots');
    expect(detector).toContain('hasWorkspaceRootMarkers(workspacePath)');
    expect(extension).toContain('promptToRegisterDetectedWorkspaceRoots');
    expect(extension).toContain(
      'Workspai workspace detected: ${candidate.name}. Add it to Workspai?'
    );
    expect(extension).toContain("const addAction = 'Add to Workspai'");
    expect(extension).toContain("const notNowAction = 'Not now'");
    expect(extension).toContain('await workspaceExplorer.whenReady();');
    expect(extension.indexOf("'initial-workspace-selection'")).toBeLessThan(
      extension.indexOf("'detected-workspace-registration'")
    );
    expect(extension).toContain('await workspaceExplorerProvider?.selectWorkspace(workspace);');
  });

  it('keeps workspace archive import failures recoverable instead of dead-end errors', () => {
    const explorer = read('src/ui/treeviews/workspaceExplorer.ts');

    expect(explorer).toContain('showArchiveImportRecovery');
    expect(explorer).toContain('Archive could not be verified.');
    expect(explorer).toContain('The archive is missing signed manifest or checksum evidence.');
    expect(explorer).toContain("const ARCHIVE_RECOVERY_DOCS_ACTION = 'Open Docs'");
    expect(explorer).toContain("const ARCHIVE_RECOVERY_FOLDER_ACTION = 'Import Folder Instead'");
    expect(explorer).toContain('WORKSPACE_ARCHIVE_RECOVERY_DOCS_URL');
    expect(explorer).toContain('formatArchiveVerificationDetails');
    expect(explorer).toContain('Missing checksum records');
    expect(explorer).toContain('await this.importFromFolder();');
    expect(explorer).not.toContain('Failed to import archive: ${error');
  });
});
