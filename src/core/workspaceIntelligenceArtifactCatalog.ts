import runtimeCommandSurface from '../../contracts/runtime-command-surface.v1.json';

export type WorkspaceIntelligenceArtifactContract = {
  artifactPath: string;
  schemaVersion: string;
  contractPath: string;
  producerCommands: readonly (readonly string[])[];
};

type RawArtifactContract = {
  artifactPath?: unknown;
  schemaVersion?: unknown;
  contractPath?: unknown;
  producerCommands?: unknown;
};

function isSafeWorkspaceArtifactPath(value: string): boolean {
  return (
    value.startsWith('.workspai/') &&
    !value.includes('\\') &&
    !value.split('/').some((segment) => segment === '.' || segment === '..')
  );
}

function normalizeProducerCommands(value: unknown): readonly (readonly string[])[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (command): command is string[] =>
        Array.isArray(command) && command.every((token) => typeof token === 'string')
    )
    .map((command) => command.map((token) => token.trim()).filter(Boolean))
    .filter((command) => command.length > 0);
}

function normalizeArtifactContract(
  value: RawArtifactContract
): WorkspaceIntelligenceArtifactContract | null {
  if (
    typeof value.artifactPath !== 'string' ||
    !isSafeWorkspaceArtifactPath(value.artifactPath) ||
    typeof value.schemaVersion !== 'string' ||
    !value.schemaVersion.trim() ||
    typeof value.contractPath !== 'string' ||
    !value.contractPath.trim()
  ) {
    return null;
  }
  return {
    artifactPath: value.artifactPath,
    schemaVersion: value.schemaVersion,
    contractPath: value.contractPath,
    producerCommands: normalizeProducerCommands(value.producerCommands),
  };
}

/**
 * CLI-authored artifact catalog bundled with the extension release.
 *
 * This is the offline/failure-safe baseline used before INDEX.json exists (or
 * when that live consumer manifest is corrupt). It deliberately comes from the
 * same runtime command-surface contract used by release parity checks, so new
 * CLI artifacts cannot silently remain invisible to Assistant and Studio.
 */
export const WORKSPAI_RUNTIME_ARTIFACT_CONTRACTS: readonly WorkspaceIntelligenceArtifactContract[] =
  (runtimeCommandSurface.artifactContracts as RawArtifactContract[])
    .map(normalizeArtifactContract)
    .filter((entry): entry is WorkspaceIntelligenceArtifactContract => Boolean(entry));

export const WORKSPAI_RUNTIME_REPORT_ARTIFACTS = WORKSPAI_RUNTIME_ARTIFACT_CONTRACTS.filter(
  (entry) => entry.artifactPath.startsWith('.workspai/reports/')
);

export const WORKSPAI_RUNTIME_REPORT_PATHS = WORKSPAI_RUNTIME_REPORT_ARTIFACTS.map(
  (entry) => entry.artifactPath
);

export const WORKSPAI_RUNTIME_REPORT_BY_PATH = new Map(
  WORKSPAI_RUNTIME_REPORT_ARTIFACTS.map((entry) => [entry.artifactPath, entry])
);

export function workspaceArtifactLabel(relativePath: string): string {
  const fileName = relativePath.split('/').pop() ?? relativePath;
  return fileName
    .replace(/\.json$/i, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function workspaceArtifactProducerCommand(relativePath: string): string[] | undefined {
  const producer = WORKSPAI_RUNTIME_REPORT_BY_PATH.get(relativePath)?.producerCommands[0];
  return producer ? [...producer] : undefined;
}
