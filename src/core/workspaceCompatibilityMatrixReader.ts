import * as fs from 'fs/promises';
import * as path from 'path';

import {
  WORKSPACE_COMPATIBILITY_MATRIX_PATH,
  workspaceArtifactCandidates,
} from './workspaceIntelligencePaths';

export const WORKSPACE_COMPATIBILITY_MATRIX_SCHEMA_VERSION =
  'rapidkit.compatibility-matrix.v1' as const;

export interface WorkspaceCompatibilityMatrixSummary {
  available: boolean;
  schemaVersion?: string;
  generatedAt?: string;
  source?: string;
  runtimeCount: number;
  runtimes: string[];
  notes: string[];
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function clip(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

export function summarizeWorkspaceCompatibilityMatrix(
  value: unknown
): WorkspaceCompatibilityMatrixSummary {
  const record = readRecord(value);
  const schemaVersion = readString(record.schemaVersion);
  if (schemaVersion !== WORKSPACE_COMPATIBILITY_MATRIX_SCHEMA_VERSION) {
    return {
      available: false,
      schemaVersion,
      runtimeCount: 0,
      runtimes: [],
      notes: [],
    };
  }

  const runtimesRecord = readRecord(record.runtimes);
  const runtimes = Object.keys(runtimesRecord).sort();
  const notes = Array.isArray(record.notes)
    ? record.notes
        .map((entry) => readString(entry))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 4)
        .map((entry) => clip(entry, 220))
    : [];

  return {
    available: true,
    schemaVersion,
    generatedAt: readString(record.generatedAt),
    source: readString(record.source),
    runtimeCount: runtimes.length,
    runtimes,
    notes,
  };
}

export async function readWorkspaceCompatibilityMatrix(
  workspacePath: string
): Promise<WorkspaceCompatibilityMatrixSummary> {
  if (!workspacePath.trim()) {
    return {
      available: false,
      runtimeCount: 0,
      runtimes: [],
      notes: [],
    };
  }

  for (const relativePath of workspaceArtifactCandidates(WORKSPACE_COMPATIBILITY_MATRIX_PATH)) {
    const artifactPath = path.join(workspacePath, relativePath);
    try {
      await fs.access(artifactPath);
    } catch {
      continue;
    }
    try {
      const raw = await fs.readFile(artifactPath, 'utf8');
      return summarizeWorkspaceCompatibilityMatrix(JSON.parse(raw));
    } catch {
      // A present-but-invalid canonical artifact must not be masked by stale legacy data.
      return {
        available: false,
        runtimeCount: 0,
        runtimes: [],
        notes: [],
      };
    }
  }
  return {
    available: false,
    runtimeCount: 0,
    runtimes: [],
    notes: [],
  };
}
