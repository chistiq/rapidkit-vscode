import path from 'node:path';
import fs from 'fs-extra';
import * as vscode from 'vscode';

import { isWorkspacePathAncestor } from '../../core/aiContextResolver';
import {
  findIncidentNavigatorSelection,
  resolveIncidentNavigatorTargetPath,
} from './incidentNavigatorTarget';
import { toLinkSafePath } from './incidentReproPackUtils';
import { asRecord } from './welcomePanel.shared.js';

export type DoctorMessageHost = {
  getSelectedWorkspaceInfo: () => { name: string; path: string } | null;
  getSelectedProject: () => { path: string; name: string } | null | undefined;
  trackStudioEvent: (
    eventName: string,
    workspacePath: string | undefined,
    properties: Record<string, unknown>
  ) => void;
};

export async function handleRunDoctorMessage(
  host: DoctorMessageHost,
  messageData: unknown,
  action: 'check' | 'fix'
): Promise<void> {
  const payload = asRecord(messageData);
  const rawProjectPath = payload?.projectPath;
  const explicitProjectPath =
    typeof rawProjectPath === 'string' && rawProjectPath.trim() ? rawProjectPath.trim() : undefined;
  const rawProjectName = payload?.projectName;
  const explicitProjectName =
    typeof rawProjectName === 'string' && rawProjectName.trim() ? rawProjectName.trim() : undefined;
  const rawWorkspacePath = payload?.workspacePath;
  const explicitWorkspacePath =
    typeof rawWorkspacePath === 'string' && rawWorkspacePath.trim()
      ? rawWorkspacePath.trim()
      : undefined;
  const selectedWorkspace = host.getSelectedWorkspaceInfo();
  const workspacePath = explicitWorkspacePath || selectedWorkspace?.path;
  const rawWorkspaceName = payload?.workspaceName;
  const workspaceName =
    (typeof rawWorkspaceName === 'string' && rawWorkspaceName.trim()) ||
    selectedWorkspace?.name ||
    (workspacePath ? path.basename(workspacePath) : undefined);

  if (!workspacePath) {
    vscode.window.showWarningMessage('Select a workspace first.');
    return;
  }

  if (explicitProjectPath) {
    const projectName = explicitProjectName || path.basename(explicitProjectPath);
    await vscode.commands.executeCommand('workspai.projectDoctor', {
      project: {
        path: explicitProjectPath,
        name: projectName,
      },
      preferredAction: action,
    });
    host.trackStudioEvent('workspai.studio.action_executed', workspacePath, {
      actionType: `doctor-project-${action}`,
      workspaceName: workspaceName || path.basename(workspacePath),
      projectName,
    });
    return;
  }

  await vscode.commands.executeCommand('workspai.checkWorkspaceHealth', {
    workspace: {
      path: workspacePath,
      name: workspaceName,
    },
    preferredAction: action,
  });
  host.trackStudioEvent('workspai.studio.action_executed', workspacePath, {
    actionType: `doctor-workspace-${action}`,
    workspaceName: workspaceName || path.basename(workspacePath),
  });
}

export async function handleOpenIncidentNavigatorTargetMessage(
  host: DoctorMessageHost,
  messageData: unknown
): Promise<void> {
  const payload = asRecord(messageData);
  const rawPath = payload?.path;
  const targetPath = typeof rawPath === 'string' ? rawPath.trim() : '';
  const rawKind = payload?.kind;
  const targetKind = typeof rawKind === 'string' ? rawKind.trim() : 'file';
  const rawLabel = payload?.label;
  const targetLabel =
    typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim() : targetPath;
  const rawSymbol = payload?.symbolName;
  const targetSymbol =
    typeof rawSymbol === 'string' && rawSymbol.trim() ? rawSymbol.trim() : undefined;
  const rawStartLine = payload?.startLine;
  const rawTargetLine = Number(rawStartLine);
  const targetLine =
    Number.isFinite(rawTargetLine) && rawTargetLine > 0 ? Math.floor(rawTargetLine) : undefined;
  const rawWsPath = payload?.workspacePath;
  const explicitWorkspacePath =
    typeof rawWsPath === 'string' && rawWsPath.trim() ? rawWsPath.trim() : undefined;
  const rawProjPath = payload?.projectPath;
  const explicitProjectPath =
    typeof rawProjPath === 'string' && rawProjPath.trim() ? rawProjPath.trim() : undefined;
  const selectedWorkspace = host.getSelectedWorkspaceInfo();
  const workspacePath = explicitWorkspacePath || selectedWorkspace?.path;
  const selectedProject = host.getSelectedProject();
  const projectPath =
    explicitProjectPath ||
    (selectedProject?.path &&
    workspacePath &&
    isWorkspacePathAncestor(workspacePath, selectedProject.path)
      ? selectedProject.path
      : undefined);

  if (!targetPath) {
    vscode.window.showWarningMessage('No impact target was provided.');
    return;
  }

  const resolvedTargetPath = resolveIncidentNavigatorTargetPath({
    targetPath,
    workspacePath,
    projectPath,
  });

  if (!resolvedTargetPath) {
    vscode.window.showWarningMessage(`Could not resolve impact target: ${targetLabel}`);
    return;
  }

  if (!(await fs.pathExists(resolvedTargetPath))) {
    vscode.window.showWarningMessage(
      `Impact target is not available in this workspace: ${targetLabel}`
    );
    return;
  }

  const targetStat = await fs.stat(resolvedTargetPath);
  if (!targetStat.isFile()) {
    vscode.window.showWarningMessage(`Impact target is not an openable file: ${targetLabel}`);
    return;
  }

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(resolvedTargetPath));
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const selection = findIncidentNavigatorSelection(document.getText(), {
    symbolName: targetSymbol,
    startLine: targetLine,
  });
  if (selection) {
    const range = new vscode.Range(
      selection.line,
      selection.startCharacter,
      selection.line,
      selection.endCharacter
    );
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }

  if (workspacePath) {
    host.trackStudioEvent('workspai.studio.scope_navigator_opened', workspacePath, {
      targetKind: targetKind.slice(0, 40),
      targetLabel: targetLabel.slice(0, 180),
      ...(targetSymbol ? { targetSymbol: targetSymbol.slice(0, 180) } : {}),
    });
  }
}

export async function handleViewProjectDoctorReportMessage(
  host: DoctorMessageHost,
  messageData: unknown
): Promise<void> {
  const payload = asRecord(messageData);
  const rawProjectPath = payload?.projectPath;
  const explicitProjectPath =
    typeof rawProjectPath === 'string' && rawProjectPath.trim() ? rawProjectPath.trim() : undefined;
  const rawProjectName = payload?.projectName;
  const explicitProjectName =
    typeof rawProjectName === 'string' && rawProjectName.trim() ? rawProjectName.trim() : undefined;
  const rawWorkspacePath = payload?.workspacePath;
  const explicitWorkspacePath =
    typeof rawWorkspacePath === 'string' && rawWorkspacePath.trim()
      ? rawWorkspacePath.trim()
      : undefined;

  const selectedWorkspace = host.getSelectedWorkspaceInfo();
  const workspacePath = explicitWorkspacePath || selectedWorkspace?.path;
  const selectedProject = host.getSelectedProject();
  const scopedProject =
    selectedProject && workspacePath && isWorkspacePathAncestor(workspacePath, selectedProject.path)
      ? selectedProject
      : null;

  const projectPath = explicitProjectPath || scopedProject?.path;
  const projectName =
    explicitProjectName ||
    scopedProject?.name ||
    (projectPath ? path.basename(projectPath) : undefined);

  if (!projectPath) {
    vscode.window.showWarningMessage('Select a project first.');
    return;
  }

  const projectReportsDir = path.join(projectPath, '.rapidkit', 'reports');
  const workspaceReportsDir = workspacePath
    ? path.join(workspacePath, '.rapidkit', 'reports')
    : undefined;
  const reportCandidates = [
    path.join(projectReportsDir, 'doctor-project-last-run.json'),
    path.join(projectReportsDir, 'doctor-last-run.json'),
    ...(workspaceReportsDir
      ? [path.join(workspaceReportsDir, 'doctor-project-last-run.json')]
      : []),
  ];
  const reportPath = await (async () => {
    for (const candidate of reportCandidates) {
      if (await fs.pathExists(candidate)) {
        return candidate;
      }
    }
    return undefined;
  })();

  if (!reportPath) {
    const scopeLabel = projectName || path.basename(projectPath);
    vscode.window.showInformationMessage(
      `No project doctor report found for "${scopeLabel}". Run project checks first.`
    );
    return;
  }

  const reportData = await fs.readJSON(reportPath).catch(() => null);
  const output = vscode.window.createOutputChannel(
    `Workspai: Project Doctor — ${projectName || path.basename(projectPath)}`
  );
  output.clear();
  output.appendLine(`=== Project Doctor Report: ${projectName || path.basename(projectPath)} ===`);
  output.appendLine(`File: ${toLinkSafePath(reportPath)}`);
  output.appendLine('');

  if (reportData) {
    const score = reportData.healthScore;
    const total = Number(score?.total ?? 0);
    const passed = Number(score?.passed ?? 0);
    const warnings = Number(score?.warnings ?? 0);
    const errors = Number(score?.errors ?? 0);
    const percent = total > 0 ? Math.round((passed / total) * 100) : 0;

    const scopeLabel = reportData.summary?.scopeProvenance?.dominantScope || 'project-scoped';
    output.appendLine(`Generated: ${reportData.generatedAt || 'unknown'}`);
    output.appendLine(`Scope: ${scopeLabel}`);
    output.appendLine(`Health: ${percent}% (✅ ${passed} | ⚠️ ${warnings} | ❌ ${errors})`);

    const project = reportData.project;
    if (project && typeof project === 'object') {
      output.appendLine('');
      output.appendLine('--- Project ---');
      output.appendLine(`Name: ${project.name || projectName || 'unknown'}`);
      output.appendLine(`Path: ${toLinkSafePath(project.path || projectPath)}`);
      output.appendLine(`Framework: ${project.framework || 'unknown'}`);

      const issues = Array.isArray(project.issues)
        ? project.issues.filter((item: unknown) => typeof item === 'string')
        : [];
      output.appendLine(`Issues: ${issues.length}`);
      for (const issue of issues.slice(0, 20)) {
        output.appendLine(`  - ${issue}`);
      }

      const fixCommands = Array.isArray(project.fixCommands)
        ? project.fixCommands.filter((item: unknown) => typeof item === 'string')
        : [];
      if (fixCommands.length > 0) {
        output.appendLine('');
        output.appendLine('--- Suggested Fix Commands ---');
        for (const cmd of fixCommands.slice(0, 20)) {
          output.appendLine(`  - ${cmd}`);
        }
      }
    }
  } else {
    output.appendLine('(Could not parse project doctor report JSON)');
  }

  output.appendLine('');
  output.appendLine(`Reports directory: ${path.basename(projectPath)}/.workspai/reports`);
  output.show();

  if (workspacePath) {
    host.trackStudioEvent('workspai.studio.action_executed', workspacePath, {
      actionType: 'view-project-doctor-report',
      projectName: projectName || path.basename(projectPath),
    });
  }
}
