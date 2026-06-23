import * as fs from 'fs-extra';
import * as path from 'path';

export type WelcomePanelProjectType = 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet' | null;

export async function detectProjectTypeFromPath(
  projectPath: string
): Promise<WelcomePanelProjectType> {
  try {
    const goModPath = path.join(projectPath, 'go.mod');
    if (await fs.pathExists(goModPath)) {
      return 'go';
    }

    const pomXmlPath = path.join(projectPath, 'pom.xml');
    const gradlePath = path.join(projectPath, 'build.gradle');
    const gradleKtsPath = path.join(projectPath, 'build.gradle.kts');
    if (
      (await fs.pathExists(pomXmlPath)) ||
      (await fs.pathExists(gradlePath)) ||
      (await fs.pathExists(gradleKtsPath))
    ) {
      return 'springboot';
    }

    const entries = await fs.readdir(projectPath, { withFileTypes: true }).catch(() => []);
    if (
      entries.some(
        (entry) => entry.isFile() && (entry.name.endsWith('.csproj') || entry.name.endsWith('.sln'))
      )
    ) {
      return 'dotnet';
    }

    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (await fs.pathExists(pyprojectPath)) {
      const content = await fs.readFile(pyprojectPath, 'utf8');
      if (content.includes('fastapi') || content.includes('uvicorn')) {
        return 'fastapi';
      }
    }

    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const content = await fs.readFile(packageJsonPath, 'utf8');
      if (content.includes('@nestjs/core') || content.includes('@nestjs/common')) {
        return 'nestjs';
      }
    }

    return null;
  } catch {
    return null;
  }
}
