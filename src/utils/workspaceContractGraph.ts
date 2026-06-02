import * as fs from 'fs-extra';
import * as path from 'path';

export const WORKSPACE_CONTRACT_PATH = path.join('.rapidkit', 'workspace.contract.json');

export interface WorkspaceContractApi {
  name: string;
  basePath: string;
  protocol?: string;
}

export interface WorkspaceContractPort {
  name: string;
  port: number;
  protocol?: string;
}

export interface WorkspaceContractProject {
  slug: string;
  name?: string;
  framework?: string;
  relativePath: string;
  ports?: WorkspaceContractPort[];
  contracts?: {
    apis?: WorkspaceContractApi[];
    publishes?: string[];
    consumes?: string[];
    dependsOn?: string[];
    env?: string[];
  };
}

export interface WorkspaceContractDocument {
  version?: number;
  kind?: string;
  workspace?: {
    name?: string;
    root?: string;
  };
  projects?: WorkspaceContractProject[];
}

export type WorkspaceContractGraphStatus = 'missing' | 'invalid' | 'ready';

export interface WorkspaceContractGraphModel {
  status: WorkspaceContractGraphStatus;
  workspacePath: string;
  contractPath: string;
  workspaceName: string;
  projects: WorkspaceContractProject[];
  dependencyEdges: Array<{ from: string; to: string }>;
  eventEdges: Array<{ from: string; to: string; event: string }>;
  portConflicts: Array<{ port: number; projects: string[] }>;
  invalidReason?: string;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizeProject(raw: unknown): WorkspaceContractProject | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const candidate = raw as Partial<WorkspaceContractProject>;
  if (typeof candidate.slug !== 'string' || candidate.slug.trim().length === 0) {
    return undefined;
  }

  return {
    slug: candidate.slug,
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    framework: typeof candidate.framework === 'string' ? candidate.framework : undefined,
    relativePath:
      typeof candidate.relativePath === 'string' && candidate.relativePath.trim().length > 0
        ? candidate.relativePath
        : candidate.slug,
    ports: Array.isArray(candidate.ports)
      ? candidate.ports
          .filter((port): port is WorkspaceContractPort => {
            return (
              typeof port?.name === 'string' &&
              Number.isInteger(port.port) &&
              port.port > 0 &&
              port.port <= 65535
            );
          })
          .map((port) => ({
            name: port.name,
            port: port.port,
            protocol: typeof port.protocol === 'string' ? port.protocol : undefined,
          }))
      : [],
    contracts: {
      apis: Array.isArray(candidate.contracts?.apis)
        ? candidate.contracts.apis.filter(
            (api): api is WorkspaceContractApi =>
              typeof api?.name === 'string' && typeof api.basePath === 'string'
          )
        : [],
      publishes: asStringArray(candidate.contracts?.publishes),
      consumes: asStringArray(candidate.contracts?.consumes),
      dependsOn: asStringArray(candidate.contracts?.dependsOn),
      env: asStringArray(candidate.contracts?.env),
    },
  };
}

function buildDependencyEdges(
  projects: WorkspaceContractProject[]
): Array<{ from: string; to: string }> {
  const slugs = new Set(projects.map((project) => project.slug));
  const edges: Array<{ from: string; to: string }> = [];
  for (const project of projects) {
    for (const dependency of project.contracts?.dependsOn || []) {
      if (slugs.has(dependency)) {
        edges.push({ from: project.slug, to: dependency });
      }
    }
  }
  return edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}

function buildEventEdges(
  projects: WorkspaceContractProject[]
): Array<{ from: string; to: string; event: string }> {
  const publishers = new Map<string, string[]>();
  for (const project of projects) {
    for (const eventName of project.contracts?.publishes || []) {
      const eventPublishers = publishers.get(eventName) || [];
      eventPublishers.push(project.slug);
      publishers.set(eventName, eventPublishers);
    }
  }

  const edges: Array<{ from: string; to: string; event: string }> = [];
  for (const project of projects) {
    for (const eventName of project.contracts?.consumes || []) {
      for (const publisher of publishers.get(eventName) || []) {
        if (publisher !== project.slug) {
          edges.push({ from: publisher, to: project.slug, event: eventName });
        }
      }
    }
  }
  return edges.sort((a, b) =>
    `${a.event}:${a.from}:${a.to}`.localeCompare(`${b.event}:${b.from}:${b.to}`)
  );
}

function findPortConflicts(
  projects: WorkspaceContractProject[]
): Array<{ port: number; projects: string[] }> {
  const byPort = new Map<number, string[]>();
  for (const project of projects) {
    for (const port of project.ports || []) {
      const owners = byPort.get(port.port) || [];
      owners.push(project.slug);
      byPort.set(port.port, owners);
    }
  }

  return [...byPort.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([port, owners]) => ({ port, projects: owners.sort() }))
    .sort((a, b) => a.port - b.port);
}

export async function readWorkspaceContractGraph(
  workspacePath: string
): Promise<WorkspaceContractGraphModel> {
  const contractPath = path.join(workspacePath, WORKSPACE_CONTRACT_PATH);
  const workspaceName = path.basename(workspacePath);

  if (!(await fs.pathExists(contractPath))) {
    return {
      status: 'missing',
      workspacePath,
      contractPath,
      workspaceName,
      projects: [],
      dependencyEdges: [],
      eventEdges: [],
      portConflicts: [],
    };
  }

  try {
    const document = (await fs.readJSON(contractPath)) as WorkspaceContractDocument;
    const projects = (document.projects || [])
      .map(normalizeProject)
      .filter((project): project is WorkspaceContractProject => Boolean(project));
    return {
      status: 'ready',
      workspacePath,
      contractPath,
      workspaceName: document.workspace?.name || workspaceName,
      projects,
      dependencyEdges: buildDependencyEdges(projects),
      eventEdges: buildEventEdges(projects),
      portConflicts: findPortConflicts(projects),
    };
  } catch (error) {
    return {
      status: 'invalid',
      workspacePath,
      contractPath,
      workspaceName,
      projects: [],
      dependencyEdges: [],
      eventEdges: [],
      portConflicts: [],
      invalidReason: error instanceof Error ? error.message : String(error),
    };
  }
}
