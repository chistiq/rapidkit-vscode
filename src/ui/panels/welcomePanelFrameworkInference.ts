import * as fs from 'fs-extra';
import * as path from 'path';

export type FrameworkInferenceHost = {
  resolveScopedProjectForWorkspace: (options: {
    workspacePath: string;
  }) => Promise<{ path: string } | null>;
};

export async function inferFrameworkFromWorkspace(
  host: FrameworkInferenceHost,
  workspacePath: string
): Promise<string> {
  const checks: Array<{ framework: string; file: string }> = [
    { framework: 'fastapi', file: path.join(workspacePath, 'src', 'main.py') },
    { framework: 'nestjs', file: path.join(workspacePath, 'src', 'main.ts') },
    { framework: 'go', file: path.join(workspacePath, 'go.mod') },
    { framework: 'springboot', file: path.join(workspacePath, 'pom.xml') },
    {
      framework: 'dotnet',
      file: path.join(workspacePath, `${path.basename(workspacePath)}.csproj`),
    },
    {
      framework: 'dotnet',
      file: path.join(workspacePath, `${path.basename(workspacePath)}.sln`),
    },
  ];

  for (const check of checks) {
    if (await fs.pathExists(check.file)) {
      return check.framework;
    }
  }

  try {
    const entries = await fs.readdir(workspacePath, { withFileTypes: true });
    if (
      entries.some(
        (entry) => entry.isFile() && (entry.name.endsWith('.csproj') || entry.name.endsWith('.sln'))
      )
    ) {
      return 'dotnet';
    }
  } catch {
    // fall through to scoped project detection
  }

  const scopedProject = await host.resolveScopedProjectForWorkspace({ workspacePath });
  if (scopedProject && scopedProject.path !== workspacePath) {
    return await inferFrameworkFromWorkspace(host, scopedProject.path);
  }

  return 'unknown';
}
