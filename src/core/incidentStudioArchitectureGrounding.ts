import * as path from 'path';

import type { AIModalContext } from './aiService';
import { scanProjectContext } from './aiService';
import { buildArchitectureGroundingForPromptAsync } from './aiArchitectureGrounding';
import {
  bootstrapProjectAgent,
  buildProjectAgentBootstrapPromptSection,
} from './projectAgentBootstrap.js';
import {
  buildWorkspaceAgentContextPromptSection,
  readWorkspaceAgentContextReport,
} from './workspaceAgentContextReader.js';

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

  const [projectBootstrap, workspaceContext] = await Promise.all([
    bootstrapProjectAgent({
      projectPath,
      workspacePath,
      consumer: 'generic',
    }),
    readWorkspaceAgentContextReport(workspacePath),
  ]);
  const canonicalProjectReady =
    projectBootstrap.status === 'not-applicable' || projectBootstrap.status === 'ready';
  const scanned =
    projectPath && canonicalProjectReady
      ? await scanProjectContext(projectPath, input.projectFramework).catch(() => undefined)
      : undefined;

  const architectureGrounding = canonicalProjectReady
    ? await buildArchitectureGroundingForPromptAsync(ctx, scanned)
    : '';

  const sections = [
    buildProjectAgentBootstrapPromptSection(projectBootstrap),
    buildWorkspaceAgentContextPromptSection(workspaceContext),
    architectureGrounding,
  ].filter(Boolean);

  return sections.join('\n\n');
}
