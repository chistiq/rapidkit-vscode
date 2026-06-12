import * as path from 'path';
import * as vscode from 'vscode';
import type { AIModalContext } from './aiService';

type WorkspaceSelection = {
  name?: string;
  path?: string;
} | null;

type ProjectSelection = {
  name?: string;
  path?: string;
  type?: string;
} | null;

async function executeOptionalCommand<T>(command: string): Promise<T | null> {
  try {
    const result = (await vscode.commands.executeCommand(command)) as T | undefined;
    return result ?? null;
  } catch {
    return null;
  }
}

function normalizeFsPath(input?: string): string | undefined {
  if (!input || !input.trim()) {
    return undefined;
  }
  return path.resolve(input.trim());
}

function isSubpath(candidatePath?: string, parentPath?: string): boolean {
  const candidate = normalizeFsPath(candidatePath);
  const parent = normalizeFsPath(parentPath);
  if (!candidate || !parent) {
    return false;
  }
  const rel = path.relative(parent, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export async function resolvePreferredAIModalContext(
  editor = vscode.window.activeTextEditor
): Promise<AIModalContext> {
  const selectedProject = await executeOptionalCommand<ProjectSelection>(
    'workspai.getSelectedProject'
  );
  const selectedWorkspace = await executeOptionalCommand<WorkspaceSelection>(
    'workspai.getSelectedWorkspace'
  );

  const selectedProjectPath = normalizeFsPath(selectedProject?.path);
  const selectedWorkspacePath = normalizeFsPath(selectedWorkspace?.path);
  const selectedProjectInsideWorkspace = isSubpath(selectedProjectPath, selectedWorkspacePath);

  if (selectedProjectPath) {
    return {
      type: 'project',
      name: selectedProject?.name ?? path.basename(selectedProjectPath),
      path: selectedProjectPath,
      framework: selectedProject?.type,
      projectRootPath: selectedProjectPath,
      workspaceRootPath: selectedProjectInsideWorkspace ? selectedWorkspacePath : undefined,
    };
  }

  if (selectedWorkspacePath) {
    return {
      type: 'workspace',
      name: selectedWorkspace?.name ?? path.basename(selectedWorkspacePath),
      path: selectedWorkspacePath,
      workspaceRootPath: selectedWorkspacePath,
    };
  }

  if (editor) {
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (folder) {
      return {
        type: 'project',
        name: folder.name,
        path: folder.uri.fsPath,
        projectRootPath: folder.uri.fsPath,
      };
    }
  }

  const fallbackWorkspace = vscode.workspace.workspaceFolders?.[0];
  return {
    type: 'workspace',
    name: fallbackWorkspace?.name ?? 'Workspace',
    path: fallbackWorkspace?.uri.fsPath,
    workspaceRootPath: fallbackWorkspace?.uri.fsPath,
  };
}

export function buildRapidkitCommandScopeSection(ctx: AIModalContext): string {
  const lines = ['RAPIDKIT COMMAND EXECUTION CONTEXT:'];

  if (ctx.workspaceRootPath) {
    lines.push(`- Active workspace root: ${ctx.workspaceRootPath}`);
  } else {
    lines.push('- Active workspace root: unknown');
  }

  if (ctx.projectRootPath) {
    lines.push(`- Selected project root: ${ctx.projectRootPath}`);
  } else {
    lines.push('- Selected project root: none');
  }

  lines.push(
    '- Workspace-level commands belong in workspace root: `npx rapidkit create workspace`, `npx rapidkit bootstrap`, `npx rapidkit setup ...`, `npx rapidkit workspace ...`, `npx rapidkit cache ...`, `npx rapidkit mirror ...`, `npx rapidkit readiness`, `npx rapidkit doctor workspace`.'
  );
  lines.push('- `npx rapidkit create project <kit> <name>` belongs in workspace root.');
  lines.push(
    '- Project lifecycle commands belong in project root: `npx rapidkit init/dev/test/build/start`, project-local `rapidkit init/dev/test/build/start`, `./rapidkit ...`, `source .rapidkit/activate`, and kit scripts such as `./bootstrap.sh`.'
  );
  lines.push(
    '- `npx rapidkit doctor project` belongs in project root for selected-service diagnostics.'
  );
  lines.push(
    '- `npx rapidkit doctor` is a host pre-flight check. It is not a substitute for `npx rapidkit doctor workspace`.'
  );

  if (ctx.projectRootPath) {
    lines.push(
      '- When a selected project root exists, prefer project-scoped commands there for dependency install, dev, test, and build actions.'
    );
  } else {
    lines.push(
      '- No selected project is active, so avoid project-only commands unless you first ask the user to select or create a project.'
    );
  }

  lines.push(
    '- Never present a workspace-root command as if it should run inside a project, and never present a project-only command as if it should run at workspace root.'
  );

  return lines.join('\n');
}

export function isWorkspacePathAncestor(workspacePath?: string, projectPath?: string): boolean {
  return isSubpath(projectPath, workspacePath);
}
