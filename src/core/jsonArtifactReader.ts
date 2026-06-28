import * as fs from 'fs-extra';

export type JsonArtifactReadResult =
  | { kind: 'missing'; artifactPath: string }
  | { kind: 'valid'; artifactPath: string; raw: Record<string, unknown> }
  | { kind: 'corrupt'; artifactPath: string; error: string };

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

export async function readJsonArtifactIfValid(
  filePath: string
): Promise<Record<string, unknown> | undefined> {
  const result = await readJsonArtifact(filePath);
  return result.kind === 'valid' ? result.raw : undefined;
}
