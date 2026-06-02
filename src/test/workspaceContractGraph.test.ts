import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import {
  readWorkspaceContractGraph,
  WORKSPACE_CONTRACT_PATH,
} from '../utils/workspaceContractGraph';

describe('workspaceContractGraph', () => {
  const tempRoots: string[] = [];

  async function makeTempDir(prefix: string): Promise<string> {
    const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempRoots.push(dirPath);
    return dirPath;
  }

  afterEach(async () => {
    await Promise.all(tempRoots.map((dirPath) => fs.remove(dirPath)));
    tempRoots.length = 0;
  });

  it('returns missing status when a workspace has no contract', async () => {
    const workspacePath = await makeTempDir('workspai-contract-missing-');

    const graph = await readWorkspaceContractGraph(workspacePath);

    expect(graph.status).toBe('missing');
    expect(graph.contractPath).toBe(path.join(workspacePath, WORKSPACE_CONTRACT_PATH));
  });

  it('builds dependency, event, and port-conflict topology from contract JSON', async () => {
    const workspacePath = await makeTempDir('workspai-contract-graph-');
    await fs.outputJSON(
      path.join(workspacePath, WORKSPACE_CONTRACT_PATH),
      {
        version: 1,
        kind: 'workspai.workspace.contract',
        workspace: { name: 'commerce-suite' },
        projects: [
          {
            slug: 'api',
            name: 'API',
            framework: 'fastapi',
            relativePath: 'api',
            ports: [{ name: 'http', port: 8000, protocol: 'http' }],
            contracts: {
              apis: [{ name: 'public', basePath: '/api' }],
              publishes: ['order.created'],
              env: ['DATABASE_URL'],
            },
          },
          {
            slug: 'worker',
            name: 'Worker',
            framework: 'nestjs',
            relativePath: 'worker',
            ports: [{ name: 'http', port: 8000, protocol: 'http' }],
            contracts: {
              dependsOn: ['api'],
              consumes: ['order.created'],
              env: ['QUEUE_URL'],
            },
          },
        ],
      },
      { spaces: 2 }
    );

    const graph = await readWorkspaceContractGraph(workspacePath);

    expect(graph.status).toBe('ready');
    expect(graph.workspaceName).toBe('commerce-suite');
    expect(graph.projects.map((project) => project.slug)).toEqual(['api', 'worker']);
    expect(graph.dependencyEdges).toEqual([{ from: 'worker', to: 'api' }]);
    expect(graph.eventEdges).toEqual([{ from: 'api', to: 'worker', event: 'order.created' }]);
    expect(graph.portConflicts).toEqual([{ port: 8000, projects: ['api', 'worker'] }]);
  });

  it('returns invalid status instead of throwing for malformed contract JSON', async () => {
    const workspacePath = await makeTempDir('workspai-contract-invalid-');
    await fs.outputFile(path.join(workspacePath, WORKSPACE_CONTRACT_PATH), '{not-json');

    const graph = await readWorkspaceContractGraph(workspacePath);

    expect(graph.status).toBe('invalid');
    expect(graph.invalidReason).toBeTruthy();
  });
});
