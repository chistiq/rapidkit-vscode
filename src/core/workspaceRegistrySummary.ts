import fs from 'fs-extra';
import path from 'path';

import registryContract from '../contracts/workspace-registry.v1.json';
import { workspaceArtifactCandidates } from './workspaceIntelligencePaths';

export const WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH = '.workspai/workspace-registry.v1.json';
export const WORKSPACE_REGISTRY_SUMMARY_SCHEMA_VERSION =
  registryContract.properties.schemaVersion.const;

export type WorkspaceRegistryAuthority =
  | 'workspace.contract.json'
  | 'global-registry'
  | 'legacy-workspace.json'
  | 'none';

export type WorkspaceRegistrySummaryProject = {
  slug: string;
  relativePath: string;
  framework?: string;
  kit?: string;
  source?: string;
};

export type WorkspaceRegistrySourceSnapshot = {
  exists: boolean;
  projectCount: number;
  path?: string;
};

export type WorkspaceRegistrySummary = {
  schemaVersion: typeof WORKSPACE_REGISTRY_SUMMARY_SCHEMA_VERSION;
  kind: 'rapidkit.workspace.registry';
  generatedAt: string;
  workspacePath: string;
  workspaceName: string;
  profile?: string;
  projectCount: number;
  authority: WorkspaceRegistryAuthority;
  contractPath: string;
  registrySummaryPath: string;
  projects: WorkspaceRegistrySummaryProject[];
  sources: {
    contract: WorkspaceRegistrySourceSnapshot;
    globalRegistry: WorkspaceRegistrySourceSnapshot;
    legacyWorkspaceJson: WorkspaceRegistrySourceSnapshot;
  };
};

export async function readWorkspaceRegistrySummaryFromDisk(
  workspacePath: string
): Promise<WorkspaceRegistrySummary | null> {
  for (const relativePath of workspaceArtifactCandidates(
    WORKSPACE_REGISTRY_SUMMARY_RELATIVE_PATH
  )) {
    const summaryPath = path.join(path.resolve(workspacePath), relativePath);
    if (!(await fs.pathExists(summaryPath))) {
      continue;
    }
    try {
      const payload = (await fs.readJSON(summaryPath)) as WorkspaceRegistrySummary;
      if (payload?.schemaVersion !== WORKSPACE_REGISTRY_SUMMARY_SCHEMA_VERSION) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }
  return null;
}

export function formatWorkspaceRegistrySyncSummary(
  summary: WorkspaceRegistrySummary,
  profileSuffix = ''
): string {
  if (summary.projectCount > 0) {
    if (summary.authority === 'workspace.contract.json') {
      return `${summary.projectCount} project(s) registered in workspace contract${profileSuffix}.`;
    }
    if (summary.authority === 'global-registry') {
      return `${summary.projectCount} project(s) registered in global workspace registry${profileSuffix}.`;
    }
    return `${summary.projectCount} project(s) registered in legacy workspace manifest${profileSuffix}.`;
  }
  return `Workspace state exists, but no projects are registered yet${profileSuffix}.`;
}
