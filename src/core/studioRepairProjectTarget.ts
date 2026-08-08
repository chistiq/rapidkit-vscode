import * as path from 'path';

export type StudioRepairProjectTargetInput = {
  explicitProjectName?: string;
  affectedProjectNames?: readonly string[];
  projectPath?: string;
};

function normalizeProjectName(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

/**
 * Resolve the canonical project reference sent to the CLI Repair Engine.
 *
 * Evidence-owned names win over filesystem guesses because linked/external
 * projects may be registered under a stable name that differs from the final
 * directory segment. A path basename is only a compatibility fallback when
 * the repair contract did not identify exactly one affected project.
 */
export function resolveStudioRepairProjectTarget(
  input: StudioRepairProjectTargetInput
): string | undefined {
  const explicit = normalizeProjectName(input.explicitProjectName);
  if (explicit) {
    return explicit;
  }

  const affected = [
    ...new Set(
      (input.affectedProjectNames ?? [])
        .map((entry) => normalizeProjectName(entry))
        .filter((entry): entry is string => Boolean(entry))
    ),
  ];
  if (affected.length === 1) {
    return affected[0];
  }

  const projectPath = normalizeProjectName(input.projectPath);
  return projectPath ? path.basename(path.resolve(projectPath)) : undefined;
}
