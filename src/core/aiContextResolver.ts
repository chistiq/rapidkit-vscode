import * as path from 'path';
import * as vscode from 'vscode';
import type { AIModalContext } from './aiService';
import {
  buildWorkspaceAgentContextPromptSection,
  readWorkspaceAgentContextReport,
} from './workspaceAgentContextReader';

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

export async function buildWorkspaceIntelligenceContextSection(
  ctx: AIModalContext
): Promise<string> {
  const workspacePath = ctx.workspaceRootPath;
  if (!workspacePath) {
    return '';
  }

  const report = await readWorkspaceAgentContextReport(workspacePath);
  return buildWorkspaceAgentContextPromptSection(report);
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
    '- Workspace-level commands belong in workspace root: `npx workspai create workspace`, `npx workspai bootstrap`, `npx workspai setup ...`, `npx workspai workspace ...`, `npx workspai cache ...`, `npx workspai mirror ...`, `npx workspai readiness`, `npx workspai doctor workspace`.'
  );
  lines.push('- `npx workspai create project <kit> <name>` belongs in workspace root.');
  lines.push(
    '- Project lifecycle commands belong in project root: `npx workspai init/dev/test/build/start`, project-local `workspai init/dev/test/build/start`, legacy `./rapidkit ...`, and kit scripts such as `./bootstrap.sh`.'
  );
  lines.push(
    '- `npx workspai doctor project` belongs in project root for selected-service diagnostics.'
  );
  lines.push(
    '- Catalog module install/remove belongs in PROJECT root: `npx workspai add module <slug>` and `workspai uninstall module <slug>`.'
  );
  lines.push(
    '- Domain feature scaffolding (NestJS src/<feature>/, FastAPI routers) is manual/code-gen — not `rapidkit add module`.'
  );
  lines.push(
    '- `npx workspai doctor` is a host pre-flight check. It is not a substitute for `npx workspai doctor workspace`.'
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
    '- Workspace intelligence belongs at workspace root: `npx workspai workspace model --json --write`, `workspace snapshot`, `workspace diff --from <report>`, `workspace impact --from <report>`, `workspace context --for-agent --json --write`.'
  );
  lines.push(
    '- Recovery snapshots (`workspai snapshot create`) are separate from intelligence snapshots (`workspai workspace snapshot`).'
  );
  lines.push(
    '- Never present a workspace-root command as if it should run inside a project, and never present a project-only command as if it should run at workspace root.'
  );

  return lines.join('\n');
}

export function isWorkspacePathAncestor(workspacePath?: string, projectPath?: string): boolean {
  return isSubpath(projectPath, workspacePath);
}
