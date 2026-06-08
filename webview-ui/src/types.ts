/**
 * Type definitions for Workspai data structures
 */

export interface ModuleData {
  id: string;
  name: string;
  display_name: string;
  description: string;
  category: string;
  icon: string;
  color?: string;
  version?: string;
  slug?: string;
  status?: 'stable' | 'beta' | 'experimental';
  dependencies?: string[];
  tags?: string[];
  tier?: string;
  capabilities?: string[];
  module_dependencies?: string[];
  runtime_dependencies?: Record<
    string,
    Array<{
      name: string;
      source: string;
      tool: string;
      version: string;
    }>
  >;
  config_sources?: string[];
  defaults?: Record<string, any>;
  variables?: Array<{
    key: string;
    type: string;
    default: any;
    description: string;
  }>;
  profiles?: Record<
    string,
    {
      description: string;
      inherits?: string;
    }
  >;
  features?:
    | string[]
    | Record<
        string,
        {
          status: string;
          enabled: boolean;
          description: string;
          files?: Array<{
            path: string;
            description: string;
          }>;
        }
      >;
  documentation?: {
    changelog?: string;
    readme?: string;
    overview?: string;
    usage?: string;
    advanced?: string;
    migration?: string;
    troubleshooting?: string;
    api_docs?: string;
    quick_guide?: string;
    links?: Record<string, string>;
  };
  compatibility?: {
    python?: string;
    node?: string;
    frameworks?: string[];
    os?: string[];
  };
  changelog?: Array<{
    version: string;
    date: string;
    notes: string;
  }>;
  support?: {
    issues?: string;
    discussions?: string;
    documentation?: string;
  };
}

export interface CategoryInfo {
  [key: string]: {
    emoji: string;
    color: string;
  };
}

export interface Workspace {
  name: string;
  path: string;
  /** Timestamp of last time workspace was opened/accessed */
  lastAccessed?: number;
  coreVersion?: string;
  coreLatestVersion?: string;
  coreStatus?: 'ok' | 'outdated' | 'not-installed' | 'update-available' | 'error';
  coreLocation?: 'workspace' | 'global' | 'pipx';
  lastModified?: number;
  projectCount?: number;
  /** Phase 4: bootstrap profile written to .rapidkit/workspace.json */
  bootstrapProfile?:
    | 'minimal'
    | 'python-only'
    | 'node-only'
    | 'go-only'
    | 'java-only'
    | 'polyglot'
    | 'enterprise';
  /** Phase 4: dependency sharing mode from .rapidkit/policies.yml */
  dependencySharingMode?: 'isolated' | 'shared-runtime-caches' | 'shared-node-deps';
  /** Phase 4: policy enforcement mode */
  policyMode?: 'warn' | 'strict';
  /** Phase 4: latest bootstrap-compliance report status */
  complianceStatus?: 'passing' | 'failing' | 'unknown';
  /** Phase 4: mirror operations status */
  mirrorStatus?: 'synced' | 'stale' | 'not-configured';
  projectStats?: {
    fastapi?: number;
    nestjs?: number;
    springboot?: number;
    go?: number;
    dotnet?: number;
  };
}

export interface InstallStatus {
  npmInstalled: boolean;
  coreInstalled: boolean;
  coreVersion?: string;
}

export interface WorkspaceToolStatus {
  pythonAvailable: boolean;
  venvAvailable: boolean;
  poetryAvailable: boolean;
  pipxAvailable: boolean;
  javaAvailable?: boolean;
  mavenAvailable?: boolean;
  gradleAvailable?: boolean;
  dotnetAvailable?: boolean;
  preferredInstallMethod: 'poetry' | 'venv' | 'pipx';
}

export interface WorkspaceStatus {
  hasWorkspace: boolean;
  hasProjectSelected?: boolean;
  workspaceName?: string;
  workspacePath?: string;
  projectName?: string;
  projectPath?: string;
  projectType?: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';
  installedModules?: { slug: string; version: string; display_name: string }[];
  isRunning?: boolean;
  runningPort?: number;
  seq?: number;
}

export interface ExampleProject {
  name: string;
  type: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';
  description: string;
}

export interface ExampleWorkspace {
  id?: string;
  name: string;
  title: string;
  description: string;
  repoUrl: string;
  cloneUrl?: string;
  path?: string;
  projects: ExampleProject[];
  tags?: string[];
  featured?: boolean;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  cloneStatus?: 'not-cloned' | 'cloned' | 'update-available';
}

export interface Kit {
  name: string;
  display_name: string;
  category: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet' | string;
  version: string;
  tags?: string[];
  modules?: string[];
  description: string;
}
