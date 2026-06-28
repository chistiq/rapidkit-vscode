import * as path from 'path';

import {
  incompatibleJsonArtifact,
  isJsonArtifactReadFailure,
  readJsonArtifact,
  type JsonArtifactReadResult,
} from './jsonArtifactReader.js';
import { WORKSPACE_SKILLS_INDEX_PATH } from './workspaceIntelligencePaths.js';

export const WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION = 'workspace-skills-index.v1' as const;

export type WorkspaceSkillsIndexEntry = {
  skillId: string;
  path: string;
  schemaVersion: string;
  title: string;
};

export type WorkspaceSkillsIndex = {
  schemaVersion: typeof WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION;
  generatedAt: string;
  inputsHash: string;
  skills: WorkspaceSkillsIndexEntry[];
};

export type WorkspaceSkillsIndexReadResult =
  | { kind: 'missing'; artifactPath: string }
  | { kind: 'valid'; artifactPath: string; index: WorkspaceSkillsIndex }
  | { kind: 'corrupt'; artifactPath: string; error: string }
  | { kind: 'incompatible'; artifactPath: string; error: string };

export function isWorkspaceSkillsIndex(value: unknown): value is WorkspaceSkillsIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION) {
    return false;
  }
  if (typeof record.generatedAt !== 'string' || !Array.isArray(record.skills)) {
    return false;
  }
  return record.skills.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    const skill = entry as Record<string, unknown>;
    return (
      typeof skill.skillId === 'string' &&
      typeof skill.path === 'string' &&
      typeof skill.title === 'string'
    );
  });
}

export async function readWorkspaceSkillsIndex(
  workspacePath: string
): Promise<WorkspaceSkillsIndex | null> {
  const result = await readWorkspaceSkillsIndexArtifact(workspacePath);
  return result.kind === 'valid' ? result.index : null;
}

export async function readWorkspaceSkillsIndexArtifact(
  workspacePath: string
): Promise<WorkspaceSkillsIndexReadResult> {
  const absolutePath = path.join(workspacePath, WORKSPACE_SKILLS_INDEX_PATH);
  const result: JsonArtifactReadResult = await readJsonArtifact(absolutePath);
  if (isJsonArtifactReadFailure(result)) {
    return result;
  }
  if (!isWorkspaceSkillsIndex(result.raw)) {
    return incompatibleJsonArtifact({
      artifactPath: result.artifactPath,
      expectedSchemaVersion: WORKSPACE_SKILLS_INDEX_SCHEMA_VERSION,
      actualSchemaVersion: result.raw.schemaVersion,
      reason: 'Workspace skills index must include generatedAt and valid skills[].',
    });
  }
  return { kind: 'valid', artifactPath: result.artifactPath, index: result.raw };
}

export function summarizeOperationalSkills(index: WorkspaceSkillsIndex | null): string {
  if (!index?.skills?.length) {
    return '';
  }
  return `${index.skills.length} operational skill(s)`;
}
