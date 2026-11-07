import path from 'node:path';
import * as vscode from 'vscode';
import { inspectStudioWorkspaceInventory } from './studioWorkspaceInventory.js';
import { studioWorkspaceIntelligenceReaders } from './studioWorkspaceIntelligenceReads.js';
import { projectStudioGraphObservation } from './studioGraphObservation.js';
import { waitForStudioLanguageProvider } from './studioLanguageProvider.js';

type Input = { folder?: string; query?: string; project?: string; limit?: number };
const DESCRIPTORS = [
  {
    name: 'workspai_workspace_inventory',
    label: 'Read Workspai workspace ownership and inventory',
    graph: false,
  },
  { name: 'workspai_graph_search', label: 'Search Workspai Graph evidence', graph: true },
] as const;

function root(input: Input): vscode.WorkspaceFolder {
  if (!vscode.workspace.isTrusted) {
    throw new Error('Trust the workspace before reading Workspai intelligence.');
  }
  const folders = (vscode.workspace.workspaceFolders ?? []).filter(
    (folder) => folder.uri.scheme === 'file'
  );
  const candidates =
    input.folder === undefined
      ? folders
      : folders.filter(
          (folder) =>
            folder.name === input.folder ||
            path.resolve(folder.uri.fsPath) === path.resolve(input.folder!)
        );
  if (candidates.length !== 1) {
    throw new Error(
      candidates.length
        ? 'Several folders match. Supply the exact path of one open workspace folder; no scope was selected.'
        : 'Select an open filesystem workspace folder. These tools do not grant access to arbitrary directories.'
    );
  }
  return candidates[0];
}
function validate(raw: Input, graph: boolean): void {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).some(
      (key) => !(graph ? ['folder', 'query', 'project', 'limit'] : ['folder']).includes(key)
    ) ||
    (raw.folder !== undefined &&
      (typeof raw.folder !== 'string' ||
        !raw.folder.trim() ||
        raw.folder.length > 2000 ||
        /[\0\r\n]/.test(raw.folder))) ||
    (graph &&
      (typeof raw.query !== 'string' ||
        !raw.query.trim() ||
        raw.query.length > 500 ||
        /[\0\r\n]/.test(raw.query))) ||
    (raw.project !== undefined &&
      (typeof raw.project !== 'string' ||
        !raw.project.trim() ||
        raw.project.length > 2000 ||
        /[\0\r\n]/.test(raw.project))) ||
    (raw.limit !== undefined &&
      (!Number.isSafeInteger(raw.limit) || raw.limit < 1 || raw.limit > 20))
  ) {
    throw new Error(
      'Provide one open folder and bounded read-only intelligence arguments; no commands or source edits are accepted.'
    );
  }
}

/** Stable VS Code tools for other chat participants/agents; no autonomous source mutation,
 * adoption, arbitrary command execution or hidden scope switching. */
export function registerStudioPublicIntelligenceTools(): vscode.Disposable {
  if (!vscode.lm?.registerTool) {
    return { dispose() {} };
  }
  const subscriptions: vscode.Disposable[] = [];
  const readers = studioWorkspaceIntelligenceReaders();
  try {
    for (const descriptor of DESCRIPTORS) {
      const tool: vscode.LanguageModelTool<Input> = {
        prepareInvocation(options, token) {
          if (token.isCancellationRequested) {
            throw new Error('Workspai intelligence read was cancelled.');
          }
          validate(options.input, descriptor.graph);
          const folder = root(options.input);
          return { invocationMessage: `${descriptor.label}: ${folder.name}` };
        },
        async invoke(options, token) {
          const controller = new AbortController();
          const cancellation = token.onCancellationRequested(() => controller.abort());
          if (token.isCancellationRequested) {
            controller.abort();
          }
          try {
            validate(options.input, descriptor.graph);
            const folder = root(options.input);
            const result = await waitForStudioLanguageProvider(
              async () => {
                if (descriptor.graph) {
                  return readers.graphSearch({
                    workspacePath: folder.uri.fsPath,
                    query: options.input.query!,
                    project: options.input.project,
                    limit: options.input.limit ?? 8,
                    signal: controller.signal,
                  });
                }
                const inventory = await inspectStudioWorkspaceInventory(folder.uri.fsPath);
                return { ok: inventory.availability.status === 'available', output: inventory };
              },
              controller.signal,
              30_000
            );
            if (controller.signal.aborted || !vscode.workspace.isTrusted) {
              throw new Error(
                'Workspai intelligence read was cancelled or workspace trust changed.'
              );
            }
            // Validate the folder again after a read: a multi-root change must not silently
            // retarget a result or imply the caller has selected a different project.
            if (root(options.input).uri.toString() !== folder.uri.toString()) {
              throw new Error(
                'The open-folder scope changed during the Workspai intelligence read.'
              );
            }
            const output =
              result.output && typeof result.output === 'object'
                ? (result.output as Record<string, unknown>)
                : {};
            const evidence = descriptor.graph
              ? {
                  ...output,
                  ...projectStudioGraphObservation(
                    output.result && typeof output.result === 'object'
                      ? (output.result as Record<string, unknown>)
                      : {},
                    12_000
                  ),
                }
              : projectStudioGraphObservation(output, 16_000);
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(
                JSON.stringify({
                  ok: result.ok,
                  ...('error' in result ? { error: result.error } : {}),
                  source: descriptor.name,
                  selectedFolder: folder.name,
                  ...evidence,
                  instruction:
                    'Observed Workspai metadata/Graph evidence, not source inspection or verified task completion. Coverage and projection omissions are explicit. Do not adopt or run intelligence merely because ownership or Graph is unavailable; continue with applicable source and language tools.',
                })
              ),
            ]);
          } catch (error) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(
                JSON.stringify({
                  ok: false,
                  source: descriptor.name,
                  error: error instanceof Error ? error.message : String(error),
                  instruction:
                    'No source mutation or onboarding was performed. Choose an unambiguous open folder or continue using other available tools.',
                })
              ),
            ]);
          } finally {
            controller.abort();
            cancellation.dispose();
          }
        },
      };
      subscriptions.push(vscode.lm.registerTool(descriptor.name, tool));
    }
    return {
      dispose() {
        subscriptions.forEach((subscription) => subscription.dispose());
      },
    };
  } catch (error) {
    subscriptions.forEach((subscription) => subscription.dispose());
    throw error;
  }
}
