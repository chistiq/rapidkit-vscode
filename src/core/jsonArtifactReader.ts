import * as fs from 'fs-extra';

export type JsonArtifactReadResult =
  | { kind: 'missing'; artifactPath: string }
  | { kind: 'valid'; artifactPath: string; raw: Record<string, unknown> }
  | { kind: 'corrupt'; artifactPath: string; error: string }
  | { kind: 'incompatible'; artifactPath: string; error: string };

export type JsonArtifactReadFailure =
  | { kind: 'missing'; artifactPath: string }
  | { kind: 'corrupt'; artifactPath: string; error: string }
  | { kind: 'incompatible'; artifactPath: string; error: string };

export function isJsonArtifactReadFailure(
  result: JsonArtifactReadResult
): result is JsonArtifactReadFailure {
  return result.kind !== 'valid';
}

export async function readJsonArtifact(filePath: string): Promise<JsonArtifactReadResult> {
  if (!(await fs.pathExists(filePath))) {
    return { kind: 'missing', artifactPath: filePath };
  }

  try {
    const raw = await fs.readJson(filePath);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        kind: 'corrupt',
        artifactPath: filePath,
        error: 'Artifact JSON must be an object.',
      };
    }
    return { kind: 'valid', artifactPath: filePath, raw: raw as Record<string, unknown> };
  } catch (error) {
    return {
      kind: 'corrupt',
      artifactPath: filePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function incompatibleJsonArtifact(input: {
  artifactPath: string;
  expectedSchemaVersion: string;
  actualSchemaVersion?: unknown;
  reason?: string;
}): JsonArtifactReadFailure {
  const actual =
    typeof input.actualSchemaVersion === 'string' && input.actualSchemaVersion.trim()
      ? input.actualSchemaVersion.trim()
      : 'missing';
  const reason = input.reason?.trim() ? ` ${input.reason.trim()}` : '';
  return {
    kind: 'incompatible',
    artifactPath: input.artifactPath,
    error: `Artifact schema is incompatible: expected ${input.expectedSchemaVersion}, got ${actual}.${reason}`,
  };
}

export async function readJsonArtifactIfValid(
  filePath: string
): Promise<Record<string, unknown> | undefined> {
  const result = await readJsonArtifact(filePath);
  return result.kind === 'valid' ? result.raw : undefined;
}
