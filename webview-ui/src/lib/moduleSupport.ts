export type ModuleSupportedProjectType = 'fastapi' | 'nestjs';

export function isModuleSupportedProjectType(
  projectType?: string
): projectType is ModuleSupportedProjectType {
  return projectType === 'fastapi' || projectType === 'nestjs';
}

export function isModuleInstallSupported(
  projectType?: string,
  hasProjectSelected = false
): boolean {
  return hasProjectSelected && isModuleSupportedProjectType(projectType);
}

export function getProjectFrameworkLabel(projectType?: string): string {
  switch (projectType) {
    case 'fastapi':
      return 'FastAPI';
    case 'nestjs':
      return 'NestJS';
    case 'go':
      return 'Go';
    case 'springboot':
      return 'Spring Boot';
    case 'dotnet':
      return '.NET';
    default:
      return 'This project type';
  }
}

export function isUnsupportedModuleProjectType(projectType?: string): boolean {
  return Boolean(projectType) && !isModuleSupportedProjectType(projectType);
}
