export function buildAnalyzeLoadKey(workspacePath: string, projectPath?: string | null): string {
  return `${workspacePath}::${projectPath ?? ''}`;
}
