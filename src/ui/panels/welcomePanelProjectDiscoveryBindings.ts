import type { WorkspaceExplorerProvider } from '../treeviews/workspaceExplorer';
import type { DoctorEvidenceSnapshot } from './incidentStudioDoctorEvidence';
import { detectProjectTypeFromPath } from './welcomePanelProjectTypeDetection';
import {
  buildWorkspaceProjectCandidatesBlock,
  resolveScopedProjectForWorkspace,
  type WorkspaceProjectDiscoveryDeps,
} from './welcomePanelProjectDiscovery';
import { readInstalledModulesFromProject } from './welcomePanelInstalledModules';

export type WelcomePanelProjectDiscoveryBindings = {
  workspaceExplorer: WorkspaceExplorerProvider | undefined;
};

export function buildWelcomePanelProjectDiscoveryDeps(
  bindings: WelcomePanelProjectDiscoveryBindings
): WorkspaceProjectDiscoveryDeps {
  return {
    workspaceExplorer: bindings.workspaceExplorer,
    detectProjectType: async (projectPath: string) =>
      (await detectProjectTypeFromPath(projectPath)) || undefined,
    readInstalledModules: (projectPath: string) => readInstalledModulesFromProject(projectPath),
  };
}

export async function buildWorkspaceProjectCandidatesForPanel(
  workspacePath: string,
  bindings: WelcomePanelProjectDiscoveryBindings,
  doctorSnapshot?: DoctorEvidenceSnapshot
): Promise<string | undefined> {
  return buildWorkspaceProjectCandidatesBlock(
    workspacePath,
    buildWelcomePanelProjectDiscoveryDeps(bindings),
    doctorSnapshot
  );
}

export async function resolveScopedProjectForPanel(
  bindings: WelcomePanelProjectDiscoveryBindings,
  options?: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    doctorSnapshot?: DoctorEvidenceSnapshot;
  }
): Promise<{ name: string; path: string; type?: string } | null> {
  return resolveScopedProjectForWorkspace(
    options || {},
    buildWelcomePanelProjectDiscoveryDeps(bindings)
  );
}
