/**
 * TypeScript type definitions for Workspai
 */

export interface WorkspaiWorkspace {
  name: string;
  path: string;
  mode: 'demo' | 'full';
  projects: Array<{
    name: string;
    path: string;
  }>;
}

export interface WorkspaiProject {
  name: string;
  path: string;
  type:
    | 'fastapi'
    | 'django'
    | 'flask'
    | 'nestjs'
    | 'express'
    | 'koa'
    | 'go'
    | 'springboot'
    | 'rails'
    | 'dotnet'
    | 'unknown';
  kit: string;
  managed?: boolean;
  modules: string[];
  isValid: boolean;
  workspacePath?: string;
}

export interface WorkspaiModule {
  id: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  category: string;
  status: 'stable' | 'beta' | 'experimental' | 'preview';
  tags: string[];
  dependencies: string[];
  installed: boolean;
}

export interface WorkspaiTemplate {
  id: string;
  name: string;
  displayName: string;
  description: string;
  framework:
    | 'fastapi'
    | 'django'
    | 'flask'
    | 'nestjs'
    | 'express'
    | 'koa'
    | 'go'
    | 'springboot'
    | 'rails'
    | 'dotnet';
  category: string;
  files: string[];
}

export interface WorkspaceConfig {
  name: string;
  path: string;
  initGit: boolean;
  /** Bootstrap profile written into .rapidkit/workspace.json at creation time. */
  profile?:
    | 'minimal'
    | 'python-only'
    | 'node-only'
    | 'go-only'
    | 'java-only'
    | 'dotnet-only'
    | 'polyglot'
    | 'enterprise';
  /** Python install backend. 'auto' = let CLI probe; explicit value overrides CLI detection. */
  installMethod?: 'auto' | 'poetry' | 'venv' | 'pipx';
  /** Policy enforcement mode written to .rapidkit/policies.yml after creation. */
  policyMode?: 'strict' | 'warn' | 'disabled';
  /** Dependency sharing written to .rapidkit/workspace.json after creation. */
  dependencySharing?: 'isolated' | 'shared';
}

export interface ProjectConfig {
  name: string;
  framework:
    | 'fastapi'
    | 'django'
    | 'flask'
    | 'nestjs'
    | 'express'
    | 'koa'
    | 'go'
    | 'springboot'
    | 'rails'
    | 'dotnet';
  kit: string; // Kit name (e.g., 'fastapi.standard', 'fastapi.ddd', 'nestjs.standard', 'gofiber.standard', 'gogin.standard', 'springboot.standard', 'dotnet.webapi.clean')
  packageManager?: string; // For NestJS: npm, yarn, pnpm
}

export interface WorkspaiConfig {
  defaultKit?: string;
  defaultInstallMethod?: string;
  pythonVersion?: string;
  author?: string;
  license?: string;
  skipGit?: boolean;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  error?: Error;
  data?: any;
}

export interface ProgressOptions {
  title: string;
  cancellable?: boolean;
  location?: 'notification' | 'window';
}

export type NotificationLevel = 'info' | 'warning' | 'error' | 'success';

export interface SystemCheckResult {
  passed: boolean;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warning';
    message: string;
  }[];
}
