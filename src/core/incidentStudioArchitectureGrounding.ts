import * as path from 'path';

import type { AIModalContext } from './aiService';
import { scanProjectContext } from './aiService';
import { buildArchitectureGroundingForPromptAsync } from './aiArchitectureGrounding';
import { buildWorkspaceModelPromptSection, readWorkspaceModelReport } from './workspaceModelReader';

export async function buildIncidentStudioArchitecturePromptSection(input: {
  workspacePath: string;
  workspaceName: string;
  projectPath?: string;
  projectName?: string;
  projectFramework?: string;
}): Promise<string> {
  const workspacePath = input.workspacePath;
  const projectPath = input.projectPath?.trim();
  const ctx: AIModalContext = projectPath
    ? {
        type: 'project',
        name: input.projectName ?? path.basename(projectPath),
        path: projectPath,
        framework: input.projectFramework,
        projectRootPath: projectPath,
        workspaceRootPath: workspacePath,
      }
    : {
        type: 'workspace',
        name: input.workspaceName,
        path: workspacePath,
        workspaceRootPath: workspacePath,
      };

  const scanned = projectPath
    ? await scanProjectContext(projectPath, input.projectFramework).catch(() => undefined)
    : undefined;

  const [architectureGrounding, workspaceModel] = await Promise.all([
    buildArchitectureGroundingForPromptAsync(ctx, scanned),
    readWorkspaceModelReport(workspacePath),
  ]);

  const sections = [buildWorkspaceModelPromptSection(workspaceModel), architectureGrounding].filter(
    Boolean
  );

  return sections.join('\n\n');
}
