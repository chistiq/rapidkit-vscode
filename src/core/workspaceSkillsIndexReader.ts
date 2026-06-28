import * as fs from 'fs-extra';
import * as path from 'path';

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
  const absolutePath = path.join(workspacePath, WORKSPACE_SKILLS_INDEX_PATH);
  if (!(await fs.pathExists(absolutePath))) {
    return null;
  }
  try {
    const raw = await fs.readJson(absolutePath);
    return isWorkspaceSkillsIndex(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function summarizeOperationalSkills(index: WorkspaceSkillsIndex | null): string {
  if (!index?.skills?.length) {
    return '';
  }
  return `${index.skills.length} operational skill(s)`;
}
