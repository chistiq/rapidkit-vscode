import fs from 'fs-extra';
import path from 'node:path';
import { inspectStudioWorkspaceInventory } from './studioWorkspaceInventory.js';
import { requireStudioWorkspaceDirectory } from './studioWorkspaceAvailability.js';
import { buildWorkspaceGraphSearchCommand } from './workspaceGraphSearchCommand.js';
import { projectStudioGraphObservation } from './studioGraphObservation.js';
import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';
import { resolveStudioReadProject, type StudioReadScope } from './studioReadProject.js';

export type StudioGraphReadRequest = {
  query: string;
  operation?: 'search' | 'entities' | 'evidence' | 'path';
  target?: string;
  kind?: string;
  limit?: number;
  scope?: 'workspace' | 'project';
  workspacePath: string;
  projectPath?: string;
  project?: string;
  signal?: AbortSignal;
};
type ScopedRead = StudioReadScope;
export type StudioIntelligenceReadRunner = (input: {
  command: string[];
  cwd: string;
  signal?: AbortSignal;
}) => Promise<{
  failed: boolean;
  exitCode: number | null;
  result?: unknown;
  stdout?: string;
  stderr?: string;
}>;

const runCli: StudioIntelligenceReadRunner = async (input) => {
  const { runRapidkitStreaming } = await import('./streamingRapidkitRunner.js');
  let listener: (() => void) | undefined;
  try {
    return await runRapidkitStreaming({
      command: input.command,
      cwd: input.cwd,
      featureLabel: 'Assistant scoped intelligence retrieval',
      timeoutMs: 120_000,
      signal: {
        onCancelled(callback) {
          listener = callback;
          input.signal?.addEventListener('abort', callback, { once: true });
          if (input.signal?.aborted) {
            callback();
          }
        },
      },
    });
  } finally {
    if (listener) {
      input.signal?.removeEventListener('abort', listener);
    }
  }
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function notCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Intelligence retrieval was cancelled.');
  }
}
function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right);
}
const fallback =
  'Use source search, language intelligence, diagnostics, project-native checks or other applicable tools. Do not adopt, repair or run the full intelligence chain merely to answer this request.';

/** Same retrieval in sidebar, native Ask and repair; no independent graph cache. */
export function studioWorkspaceIntelligenceReaders(run: StudioIntelligenceReadRunner = runCli) {
  return {
    async inspectProjectAgentEntry(request: ScopedRead): Promise<StudioAgentToolResult> {
      try {
        notCancelled(request.signal);
        const selected = await resolveStudioReadProject(request);
        if (
          !selected.projectPath ||
          selected.inventory.management !== 'workspai' ||
          !selected.inventory.workspace
        ) {
          throw new Error(
            'Select an exact registered project from inspect-workspace before checking agent entry.'
          );
        }
        const project = selected.inventory.projects.find((entry) =>
          samePath(entry.path, selected.projectPath!)
        );
        if (!project) {
          throw new Error('The selected project has no canonical workspace membership.');
        }
        const execution = await run({
          command: ['agent', 'bootstrap', '--for-agent', 'generic', '--strict', '--json'],
          cwd: selected.projectPath,
          signal: request.signal,
        });
        notCancelled(request.signal);
        const receipt = record(execution.result);
        const identity = record(receipt.project);
        const workspace = record(receipt.workspace);
        const integrity = record(receipt.integrity);
        const valid =
          receipt.schemaVersion === 'workspai.agent-bootstrap-receipt.v1' &&
          receipt.statusScope === 'agent-grounding' &&
          ['ready', 'degraded', 'blocked'].includes(String(receipt.status)) &&
          /^[a-f0-9]{64}$/.test(String(receipt.receiptId)) &&
          [project.id, project.name].includes(String(identity.name)) &&
          workspace.name === selected.inventory.workspace.name &&
          workspace.resolved === true &&
          integrity.portable === true &&
          integrity.absolutePathsEmitted === false &&
          integrity.algorithm === 'sha256' &&
          /^[a-f0-9]{64}$/.test(String(integrity.payloadHash)) &&
          Array.isArray(receipt.checks) &&
          Array.isArray(receipt.nextActions);
        // Exit 2 is the CLI's strict degraded/blocked verdict, not a failure to observe it.
        const exitMatchesReceipt =
          (!execution.failed && execution.exitCode === 0) ||
          (receipt.status !== 'ready' && execution.exitCode === 2);
        if (!valid || !exitMatchesReceipt) {
          throw new Error(
            execution.stderr || 'CLI returned no valid project-bound agent grounding receipt.'
          );
        }
        const checks = receipt.checks as unknown[];
        const findings = checks.filter((check) => record(check).status !== 'passed');
        return {
          ok: true,
          output: {
            authority: 'installed-project-agent-entry',
            summary: `Project agent grounding: ${receipt.status}. Feature, environment and release checks remain separate.`,
            exitCode: execution.exitCode,
            groundingReady: receipt.status === 'ready',
            receipt: {
              ...receipt,
              checks: findings.slice(0, 20),
              nextActions: (receipt.nextActions as unknown[]).slice(0, 10),
            },
            coverage: {
              totalChecks: checks.length,
              passedChecks: checks.length - findings.length,
              omittedFindings: Math.max(0, findings.length - 20),
            },
            instruction:
              'This is an agent-grounding observation, not project environment, feature, test or release verification. A degraded or blocked receipt limits architecture claims; continue applicable source inspection, edits and project checks. Do not make bootstrap a prerequisite for unrelated work or repeat it without changed evidence.',
          },
        };
      } catch (error) {
        return {
          ok: false,
          error: `${error instanceof Error ? error.message : String(error)} ${fallback}`,
        };
      }
    },
    async graphSearch(request: StudioGraphReadRequest): Promise<StudioAgentToolResult> {
      try {
        notCancelled(request.signal);
        const operation = request.operation ?? 'search';
        if (
          !['search', 'entities', 'evidence', 'path'].includes(operation) ||
          typeof request.query !== 'string' ||
          !request.query.trim() ||
          request.query.length > 500 ||
          /[\0\r\n]/.test(request.query)
        ) {
          throw new Error(
            'Graph retrieval requires a supported operation and a query/entity/kind of 1 to 500 characters.'
          );
        }
        if (request.scope !== undefined && !['workspace', 'project'].includes(request.scope)) {
          throw new Error('Unknown Graph retrieval scope.');
        }
        const limit = request.limit ?? 12;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
          throw new Error('Graph limit must be an integer from 1 to 50.');
        }
        for (const value of [request.target, request.kind]) {
          if (
            value !== undefined &&
            (typeof value !== 'string' ||
              !value.trim() ||
              value.length > 500 ||
              /[\0\r\n]/.test(value))
          ) {
            throw new Error('Invalid Graph target/kind.');
          }
        }
        const selected = await resolveStudioReadProject(request);
        const inventory = selected.inventory;
        if (
          !inventory.workspace ||
          inventory.management !== 'workspai' ||
          !('scope' in inventory) ||
          !inventory.scope?.workspacePath
        ) {
          throw new Error('No resolved Workspai workspace owns this scope.');
        }
        const root = inventory.scope.workspacePath;
        if (request.projectPath) {
          const owning = await inspectStudioWorkspaceInventory(request.workspacePath);
          if (
            owning.management === 'workspai' &&
            owning.workspace &&
            !samePath(owning.workspace.path, root)
          ) {
            throw new Error('The selected project belongs to a different workspace.');
          }
        }
        const projectPath =
          selected.projectPath ??
          ('projectPath' in inventory.scope ? inventory.scope.projectPath : undefined);
        const project = projectPath
          ? inventory.projects.find((entry) => entry.path === projectPath)
          : undefined;
        const projectScoped =
          request.scope === 'project' ||
          (request.scope !== 'workspace' &&
            Boolean(request.project || request.projectPath || projectPath));
        if (projectScoped && !project) {
          throw new Error('Selected project has no unambiguous canonical membership.');
        }
        const scope = projectScoped ? `project:${project!.id}` : undefined;
        const command = buildWorkspaceGraphSearchCommand({
          query: request.query,
          operation,
          target: request.target,
          kind: request.kind,
          limit,
          scope,
        });
        notCancelled(request.signal);
        const execution = await run({ command, cwd: root, signal: request.signal });
        notCancelled(request.signal);
        const result = record(execution.result);
        const ok = !execution.failed && execution.exitCode === 0 && Object.keys(result).length > 0;
        const projected = projectStudioGraphObservation(result);
        return {
          ok,
          output: {
            operation,
            query: request.query,
            limit,
            scope: scope ?? 'workspace',
            coverage: {
              graphSourceHash: result.graphSourceHash,
              totalMatches: result.totalMatches,
              truncated: result.truncated,
              budget:
                JSON.stringify(result.budget ?? null).length <= 2000
                  ? result.budget
                  : { omittedByExtension: true },
            },
            exitCode: execution.exitCode,
            result: projected.result,
            extensionProjection: projected.projection,
            instruction:
              'Proof-backed retrieval, not exhaustive source inspection or verified completion. Follow proof locators; missing relationships are not proven. CLI coverage and extensionProjection omissions are separate; inspect a narrower entity/evidence query or source for omitted proof bodies. Inspect current source before edits. CLI owns Graph freshness; reads may rebuild its derived cache. ' +
              (ok ? '' : fallback),
          },
          ...(ok
            ? {}
            : {
                error:
                  execution.stderr ||
                  'Graph retrieval returned no usable structured result. ' + fallback,
              }),
        };
      } catch (error) {
        return {
          ok: false,
          error: `${error instanceof Error ? error.message : String(error)} ${fallback}`,
        };
      }
    },
    async inspectProjectCommands(request: ScopedRead): Promise<StudioAgentToolResult> {
      try {
        notCancelled(request.signal);
        let cwd = (await resolveStudioReadProject(request)).projectPath;
        if (!cwd) {
          throw new Error(
            'Supply project with an exact identity from inspect-workspace, or select a project entry; a workspace root is not a project.'
          );
        }
        await requireStudioWorkspaceDirectory(cwd);
        cwd = await fs.realpath(path.resolve(cwd));
        notCancelled(request.signal);
        const execution = await run({
          command: ['project', 'commands', '--json'],
          cwd,
          signal: request.signal,
        });
        notCancelled(request.signal);
        const result = record(execution.result);
        const ok =
          !execution.failed &&
          execution.exitCode === 0 &&
          result.scope === 'project' &&
          result.schemaVersion === 1 &&
          typeof result.commandMap === 'object' &&
          result.commandMap !== null &&
          !Array.isArray(result.commandMap);
        return {
          ok,
          output: {
            authority: 'installed-project-capabilities',
            exitCode: execution.exitCode,
            result: execution.result,
            instruction:
              'Project-specific capability evidence, not global command availability or completed execution. Respect command owner/status, moduleSupport, runtime candidates and lifecycle coverage; unsupported Core mutation does not prohibit general coding. ' +
              (ok ? '' : fallback),
          },
          ...(ok
            ? {}
            : {
                error:
                  execution.stderr ||
                  'CLI returned no supported project capability contract. ' + fallback,
              }),
        };
      } catch (error) {
        return {
          ok: false,
          error: `${error instanceof Error ? error.message : String(error)} ${fallback}`,
        };
      }
    },
  };
}
