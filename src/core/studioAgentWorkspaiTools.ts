import crypto from 'node:crypto';
import { inspectStudioWorkspaceInventory } from './studioWorkspaceInventory.js';
import { searchStudioPublicWeb } from './studioPublicWebSearch.js';
import { buildStudioCliCatalog, buildStudioWorkspaiArchitecture } from './studioCliKnowledge.js';
import { buildStudioWorkspaiKnowledge } from './studioWorkspaiKnowledge.js';
import type { StudioGraphReadRequest } from './studioWorkspaceIntelligenceReads.js';
import { studioWorkspaceImageTool } from './studioWorkspaceImage.js';
import { studioAgentInstructionsTool } from './studioAgentInstructions.js';
import { readStudioWorkspaiEvidence, studioProjectDocsTool } from './studioProjectReadTools.js';

import type { FilePatch } from './patchApplyEngine.js';
import type { StudioEvidenceRefreshCommandId } from './sidebarStudioAgentRuntime.js';
import { STUDIO_EVIDENCE_REFRESH_COMMAND_IDS } from './sidebarStudioAgentRuntime.js';
import {
  StudioAgentToolRegistry,
  type StudioAgentToolApprovalGrant,
  type StudioAgentToolResult,
} from './studioAgentToolRegistry.js';
import {
  resolveWorkspaiAssistantModeContract,
  type WorkspaiAssistantMode,
} from './assistantModeContract.js';
import {
  resolveStudioWorkspaceCommandPlan,
  type StudioWorkspaceCommandRequest,
} from './studioWorkspaceCommand.js';
import type {
  StudioCodeIntelligenceOperation,
  StudioCodeIntelligenceResult,
} from './studioCodeIntelligence.js';
import { fetchStudioPublicWeb } from './studioPublicWebFetch.js';

export type StudioAgentSearchMatch = {
  path: string;
  line: number;
  preview: string;
};

export type StudioAgentTextEdit = {
  relativePath: string;
  oldText: string;
  newText: string;
};

export interface StudioAgentWorkspaiToolHost {
  inspectCliCommands?(input: {
    workspacePath: string;
    signal: AbortSignal;
  }): Promise<StudioAgentToolResult>;
  inspectCliHelp?(command: string[]): Promise<StudioAgentToolResult>;
  recoverActiveBlocker?(input: {
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  discover(input: {
    glob?: string;
    limit?: number;
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
  inspect(input: {
    paths: string[];
    kind: 'source' | 'evidence';
    lineStart?: number;
    lineEnd?: number;
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
  search(input: {
    query: string;
    paths?: string[];
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult<StudioAgentSearchMatch[]>>;
  graphSearch?(input: StudioGraphReadRequest): Promise<StudioAgentToolResult>;
  inspectProjectAgentEntry?(input: {
    workspacePath: string;
    projectPath?: string;
    project?: string;
    signal?: AbortSignal;
  }): Promise<StudioAgentToolResult>;
  inspectProjectCommands?(
    input: Pick<StudioGraphReadRequest, 'workspacePath' | 'projectPath' | 'project' | 'signal'>
  ): Promise<StudioAgentToolResult>;
  diagnostics(input: {
    paths?: string[];
    severities?: Array<'error' | 'warning' | 'information' | 'hint'>;
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
  codeIntelligence?(input: {
    operation: StudioCodeIntelligenceOperation;
    path?: string;
    line?: number;
    column?: number;
    query?: string;
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult<StudioCodeIntelligenceResult>>;
  inspectChanges(input: {
    paths?: string[];
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
  applyPatches(input: {
    sessionId?: string;
    requestId?: string;
    patches: FilePatch[];
    transactionId: string;
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  applyTextEdits?(input: {
    sessionId?: string;
    requestId?: string;
    edits: StudioAgentTextEdit[];
    transactionId: string;
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  saveFiles?(input: {
    sessionId: string;
    requestId: string;
    paths: string[];
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
  rememberNativeTransaction?(id: string): void;
  deleteFiles(input: {
    sessionId?: string;
    requestId?: string;
    paths: string[];
    transactionId: string;
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  runGovernedCommand(input: {
    commandId: StudioEvidenceRefreshCommandId;
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  runWorkspaceCommand(input: {
    sessionId?: string;
    requestId?: string;
    request: StudioWorkspaceCommandRequest;
    workspacePath: string;
    projectPath?: string;
    approval?: StudioAgentToolApprovalGrant;
    signal?: AbortSignal;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  preflightWorkspaceCommand?(input: {
    workspacePath: string;
    projectPath?: string;
    request: StudioWorkspaceCommandRequest;
  }): Promise<void>;
  inspectRemediationPlan(input: {
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
  executeRemediationStep(input: {
    stepId: string;
    workspacePath: string;
    projectPath?: string;
    approval?: StudioAgentToolApprovalGrant;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  inspectDependencySecurity?(input: {
    projectName?: string;
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
  repairDependencySecurity?(input: {
    projectName?: string;
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  upgradeDependencySecurity?(input: {
    projectName?: string;
    packageName: string;
    transactionId: string;
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  completeDependencyTransaction?(input: {
    projectNames?: string[];
    changedPaths?: string[];
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  verify(input: {
    workspacePath: string;
    projectPath?: string;
    cardId: string;
    blockerSignature?: string;
    goalId?: string;
  }): Promise<StudioAgentToolResult>;
  listRetainedHostToolOutputs?(input: { sessionId?: string }): Promise<StudioAgentToolResult>;
  readHostToolOutput?(input: {
    outputRef: string;
    sessionId?: string;
    offset?: number;
    limit?: number;
  }): StudioAgentToolResult | Promise<StudioAgentToolResult>;
  listHostTools?(): Promise<StudioAgentToolResult> | StudioAgentToolResult;
  invokeHostTool?(input: {
    name: string;
    sessionId?: string;
    arguments?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<StudioAgentToolResult>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Studio Agent tool input must be an object.');
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((entry) => typeof entry === 'string')
  ) {
    throw new Error(`Studio Agent tool input ${field} must be a non-empty string array.`);
  }
  return value as string[];
}

function optionalScope(context: { projectPath?: string }): { projectPath?: string } {
  return context.projectPath ? { projectPath: context.projectPath } : {};
}

function workspaceCommandRequestFromRaw(raw: unknown): StudioWorkspaceCommandRequest {
  const value = asRecord(raw);
  if (typeof value.executable !== 'string' || !value.executable.trim()) {
    throw new Error('Studio workspace command executable is required.');
  }
  if (!Array.isArray(value.args) || !value.args.every((entry) => typeof entry === 'string')) {
    throw new Error('Studio workspace command args must be a string array.');
  }
  if (
    typeof value.purpose !== 'string' ||
    !['inspect', 'diagnose', 'test', 'build', 'format', 'dependency'].includes(value.purpose)
  ) {
    throw new Error('Studio workspace command purpose is invalid.');
  }
  if (value.allowSourceChanges !== undefined && typeof value.allowSourceChanges !== 'boolean') {
    throw new Error('Studio workspace command allowSourceChanges must be a boolean.');
  }
  return {
    executable: value.executable.trim(),
    args: value.args as string[],
    purpose: value.purpose as StudioWorkspaceCommandRequest['purpose'],
    ...(typeof value.cwd === 'string' && value.cwd.trim() ? { cwd: value.cwd.trim() } : {}),
    ...(typeof value.timeoutMs === 'number' ? { timeoutMs: value.timeoutMs } : {}),
    ...(typeof value.allowSourceChanges === 'boolean'
      ? { allowSourceChanges: value.allowSourceChanges }
      : {}),
  };
}

export function createStudioAgentWorkspaiToolRegistry(input: {
  host: StudioAgentWorkspaiToolHost;
  cardId: string;
  blockerSignature?: string;
  assistantMode: WorkspaiAssistantMode;
  goalId?: string;
  externalResearch?: boolean;
  executionAuthority?: 'workspace' | 'workspai-cli';
  goalCompletionMode?: 'deterministic-verification' | 'evidence-review';
}): StudioAgentToolRegistry {
  const registry = new StudioAgentToolRegistry();
  const mode = resolveWorkspaiAssistantModeContract(input.assistantMode);
  const register = (definition: Parameters<StudioAgentToolRegistry['register']>[0]): void => {
    if (input.executionAuthority === 'workspace') {
      const optionalCliHooks: Record<string, keyof StudioAgentWorkspaiToolHost> = {
        'run-governed-command': 'runGovernedCommand',
        'inspect-remediation-plan': 'inspectRemediationPlan',
        'execute-remediation-step': 'executeRemediationStep',
      };
      const hook = optionalCliHooks[definition.name];
      if (hook && typeof input.host[hook] !== 'function') {
        return;
      }
    }
    if (
      input.externalResearch &&
      ![
        'search-public-web',
        'fetch-public-web',
        'inspect-cli-help',
        'inspect-cli-commands',
        'list-host-tools',
        'read-host-tool-output',
        'list-host-tool-outputs',
        'invoke-host-tool',
      ].includes(definition.name)
    ) {
      return;
    }
    if (
      input.executionAuthority === 'workspace' &&
      ['recover-active-blocker', 'verify-goal'].includes(definition.name)
    ) {
      return;
    }
    if (mode.toolNames.includes(definition.name)) {
      registry.register(definition);
    }
  };

  register(studioWorkspaceImageTool);
  register(studioAgentInstructionsTool);
  register(studioProjectDocsTool);

  register({
    name: 'inspect-cli-commands',
    scopeIndependent: true,
    title: 'Search Workspai CLI command catalog',
    description:
      'Search and page the CLI-authored command catalog. Bundled documentation works offline without setup. Default pages contain compact summaries. Request includeDetails=true and a narrow query/limit for usage, options and examples. Choose installed for the live commands --json inventory. Follow nextOffset for further pages; a page is not the full command list. Use inspect-cli-help for exact installed syntax.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        topic: {
          type: 'string',
          enum: ['commands', 'architecture', 'knowledge'],
          description:
            'Architecture lists ownership/kits. Knowledge searches or pages official product documentation for Graph, Goals, PCC, adoption and operations without requiring a folder or network.',
        },
        document: {
          type: 'string',
          description: 'Exact knowledge document id returned by its catalog.',
        },
        maxChars: { type: 'integer', minimum: 1000, maximum: 16000 },
        source: {
          type: 'string',
          enum: ['bundled', 'installed'],
          description:
            'Select the source for topic=commands only. Architecture and knowledge always return versioned bundled references, never installed runtime proof.',
        },
        query: { type: 'string', maxLength: 300 },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 40 },
        includeDetails: { type: 'boolean' },
      },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const value = asRecord(raw);
      if (
        value.source !== undefined &&
        value.source !== 'bundled' &&
        value.source !== 'installed'
      ) {
        throw new Error('Unknown CLI catalog source.');
      }
      if (
        value.query !== undefined &&
        (typeof value.query !== 'string' || value.query.length > 300)
      ) {
        throw new Error('Invalid CLI catalog query.');
      }
      if (value.includeDetails !== undefined && typeof value.includeDetails !== 'boolean') {
        throw new Error('Invalid CLI detail selection.');
      }
      if (value.topic === 'knowledge') {
        if (value.document !== undefined && typeof value.document !== 'string') {
          throw new Error('Invalid knowledge document id.');
        }
        return {
          ok: true,
          output: buildStudioWorkspaiKnowledge({
            query: value.query as string | undefined,
            document: value.document as string | undefined,
            offset: value.offset as number | undefined,
            limit: value.limit as number | undefined,
            maxChars: value.maxChars as number | undefined,
          }),
        };
      }
      if (value.topic === 'architecture') {
        if (value.query !== undefined && typeof value.query !== 'string') {
          throw new Error('Invalid architecture query.');
        }
        return {
          ok: true,
          output: buildStudioWorkspaiArchitecture(
            typeof value.query === 'string' ? value.query : ''
          ),
        };
      }
      if (value.topic !== undefined && value.topic !== 'commands') {
        throw new Error('Unknown CLI catalog topic.');
      }
      let installed: unknown;
      if (value.source === 'installed') {
        if (!input.host.inspectCliCommands) {
          return {
            ok: false,
            error:
              'Installed CLI inventory is unavailable. Use source=bundled for versioned documentation.',
          };
        }
        const result = await input.host.inspectCliCommands({
          workspacePath: context.workspacePath,
          signal: context.signal,
        });
        if (!result.ok) {
          return result;
        }
        installed = result.output;
      }
      return {
        ok: true,
        output: buildStudioCliCatalog({
          query: value.query as string | undefined,
          offset: value.offset as number | undefined,
          limit: value.limit as number | undefined,
          includeDetails: value.includeDetails === true,
          ...(value.source === 'installed' ? { installed } : {}),
        }),
      };
    },
  });

  if (input.host.inspectCliHelp) {
    register({
      name: 'inspect-cli-help',
      scopeIndependent: true,
      title: 'Read installed Workspai CLI help',
      description:
        'Read the installed Workspai CLI help for exact command syntax without creating a workspace or Goal. Supply command segments such as [] or ["create"]. Only help is executed. If unavailable, fetch official documentation.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          command: {
            type: 'array',
            maxItems: 5,
            items: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
          },
        },
      },
      activity: 'inspect',
      risk: 'read',
      async execute(raw) {
        const value = asRecord(raw);
        const command = value.command === undefined ? [] : value.command;
        if (
          !Array.isArray(command) ||
          command.length > 5 ||
          command.some((part) => typeof part !== 'string' || !/^[a-z][a-z0-9-]*$/.test(part))
        ) {
          throw new Error(
            'CLI help accepts only plain subcommand names, not options or arguments.'
          );
        }
        return input.host.inspectCliHelp!(command);
      },
    });
  }

  register({
    name: 'inspect-workspace',
    scopeIndependent: true,
    title: 'Inspect current workspace and project inventory',
    description:
      'Read the current workspace name and complete registered project list directly from local contracts/registries. Prefer this over health reports for project names and workspace identity.',
    inputSchema: { type: 'object', additionalProperties: false },
    activity: 'inspect',
    risk: 'read',
    async execute(_raw, context) {
      const output = await inspectStudioWorkspaceInventory(context.workspacePath);
      return {
        ok: output.availability.status === 'available',
        output,
        ...(output.availability.status !== 'available' ? { error: output.instruction } : {}),
      };
    },
  });
  register({
    name: 'search-public-web',
    scopeIndependent: true,
    title: 'Search public web',
    description:
      'Search the internet for current documentation and exact CLI/API syntax. Returns result links and snippets; fetch authoritative pages before attributing claims. If a search provider fails, try a registered search/browser host tool or fetch an official URL.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      additionalProperties: false,
      properties: { query: { type: 'string', minLength: 1, maxLength: 1_000 } },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const value = asRecord(raw);
      return searchStudioPublicWeb({ query: String(value.query ?? ''), signal: context.signal });
    },
  });

  register({
    name: 'update-task-ledger',
    scopeIndependent: true,
    title: 'Update durable task progress',
    description:
      'Persist objectives and step status for substantial multi-step work, long-running tasks or handoffs. Optional for focused edits: use direct inspection, edits and relevant verification without bookkeeping ceremony. Update at meaningful milestones, not every read. Existing ledger obligations must be reconciled before completion.',
    inputSchema: {
      type: 'object',
      required: ['objective', 'steps'],
      additionalProperties: false,
      properties: {
        objective: { type: 'string', minLength: 1, maxLength: 1_000 },
        currentStepId: { type: 'string', minLength: 1, maxLength: 100 },
        steps: {
          type: 'array',
          minItems: 1,
          maxItems: 24,
          items: {
            type: 'object',
            required: ['id', 'description', 'status'],
            additionalProperties: false,
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 100 },
              description: { type: 'string', minLength: 1, maxLength: 500 },
              status: {
                type: 'string',
                enum: ['pending', 'in-progress', 'completed', 'blocked'],
              },
              evidence: { type: 'string', maxLength: 1_000 },
            },
          },
        },
      },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw) {
      const value = asRecord(raw);
      const objective = typeof value.objective === 'string' ? value.objective.trim() : '';
      if (!objective || objective.length > 1_000 || !Array.isArray(value.steps)) {
        throw new Error('Studio task ledger objective or steps are invalid.');
      }
      const seen = new Set<string>();
      const steps = value.steps.map((entry) => {
        const step = asRecord(entry);
        const id = typeof step.id === 'string' ? step.id.trim() : '';
        const description = typeof step.description === 'string' ? step.description.trim() : '';
        const status = step.status;
        if (
          !id ||
          id.length > 100 ||
          seen.has(id) ||
          !description ||
          description.length > 500 ||
          !['pending', 'in-progress', 'completed', 'blocked'].includes(String(status))
        ) {
          throw new Error('Studio task ledger contains an invalid or duplicate step.');
        }
        seen.add(id);
        const evidence =
          typeof step.evidence === 'string' && step.evidence.trim()
            ? step.evidence.trim().slice(0, 1_000)
            : undefined;
        return {
          id,
          description,
          status: status as 'pending' | 'in-progress' | 'completed' | 'blocked',
          ...(evidence ? { evidence } : {}),
        };
      });
      const currentStepId =
        typeof value.currentStepId === 'string' && value.currentStepId.trim()
          ? value.currentStepId.trim()
          : undefined;
      if (currentStepId && !seen.has(currentStepId)) {
        throw new Error('Studio task ledger currentStepId must identify a declared step.');
      }
      return {
        ok: true,
        output: {
          schemaVersion: 'workspai.studio-task-ledger.v1',
          objective,
          ...(currentStepId ? { currentStepId } : {}),
          steps,
        },
      };
    },
  });

  if (input.host.recoverActiveBlocker) {
    register({
      name: 'recover-active-blocker',
      title: 'Resolve active blocker',
      description:
        'Run the contract-first blocker recovery prelude before model exploration. It uses fresh blocker evidence, eligible remediation-plan steps, and registered blocker accelerators; unresolved source causes are returned to the general capability plane.',
      inputSchema: { type: 'object', additionalProperties: false },
      activity: 'change',
      risk: 'guarded-write',
      async execute(_raw, context) {
        return input.host.recoverActiveBlocker!({
          workspacePath: context.workspacePath,
          ...optionalScope(context),
          reportProgress: context.reportProgress,
        });
      },
    });
  }

  register({
    name: 'discover-workspace-files',
    title: 'Discover workspace files',
    description:
      'List source and configuration files in the selected workspace before choosing exact files to inspect. Generated caches and dependency directories are excluded.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        glob: {
          type: 'string',
          description: 'Optional workspace-relative glob such as **/package.json.',
        },
        limit: { type: 'number', minimum: 1, maximum: 500 },
      },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const value = asRecord(raw);
      return input.host.discover({
        ...(typeof value.glob === 'string' && value.glob.trim() ? { glob: value.glob.trim() } : {}),
        ...(typeof value.limit === 'number' ? { limit: value.limit } : {}),
        workspacePath: context.workspacePath,
        ...optionalScope(context),
      });
    },
  });

  if (input.goalId) {
    register({
      name: 'verify-goal',
      title:
        input.goalCompletionMode === 'evidence-review'
          ? 'Verify Goal workspace evidence'
          : 'Verify engineering goal',
      description:
        input.goalCompletionMode === 'evidence-review'
          ? 'Run canonical workspace verification for an arbitrary Goal after the model has reviewed the outcome against the full objective. This proves workspace safety and freshness; it does not pretend the semantic outcome is machine-verifiable.'
          : 'Run the durable goal contract checks. Completion is allowed only when the CLI returns an evidence-derived verified state.',
      inputSchema: { type: 'object', additionalProperties: false },
      activity: 'verify',
      risk: 'read',
      async execute(_raw, context) {
        return input.host.verify({
          workspacePath: context.workspacePath,
          ...optionalScope(context),
          cardId: input.cardId,
          goalId: input.goalId,
          ...(input.blockerSignature ? { blockerSignature: input.blockerSignature } : {}),
        });
      },
    });
  }

  register({
    name: 'inspect-source',
    title: 'Inspect source files',
    description:
      'Read exact workspace source files before proposing changes. A missing path returns exists:false with sha256 null; that is a successful observation. Create it with apply-workspace-patch using that null hash. Do not retry the same missing path.',
    inputSchema: {
      type: 'object',
      required: ['paths'],
      additionalProperties: false,
      properties: {
        paths: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'string' } },
        lineStart: { type: 'number', minimum: 1 },
        lineEnd: { type: 'number', minimum: 1 },
      },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const value = asRecord(raw);
      if (
        (value.lineStart !== undefined &&
          (!Number.isInteger(value.lineStart) || Number(value.lineStart) < 1)) ||
        (value.lineEnd !== undefined &&
          (!Number.isInteger(value.lineEnd) || Number(value.lineEnd) < 1)) ||
        (typeof value.lineStart === 'number' &&
          typeof value.lineEnd === 'number' &&
          value.lineEnd < value.lineStart)
      ) {
        throw new Error('Source inspection line range is invalid.');
      }
      const paths = stringArray(value.paths, 'paths');
      if (paths.length > 16) {
        throw new Error('Read up to 16 source files per inspection.');
      }
      const request = {
        kind: 'source' as const,
        ...(typeof value.lineStart === 'number' ? { lineStart: value.lineStart } : {}),
        ...(typeof value.lineEnd === 'number' ? { lineEnd: value.lineEnd } : {}),
        workspacePath: context.workspacePath,
        ...optionalScope(context),
      };
      if (paths.length === 1) {
        return input.host.inspect({ ...request, paths });
      }
      const results = await Promise.all(
        paths.map(async (file) => {
          try {
            return { path: file, result: await input.host.inspect({ ...request, paths: [file] }) };
          } catch (error) {
            return {
              path: file,
              result: {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              } as StudioAgentToolResult,
            };
          }
        })
      );
      const failures = results
        .filter((entry) => !entry.result.ok)
        .map((entry) => ({ path: entry.path, error: entry.result.error }));
      return {
        ok: results.some((entry) => entry.result.ok),
        output: {
          files: results
            .filter((entry) => entry.result.ok)
            .flatMap((entry) =>
              Array.isArray(entry.result.output) ? entry.result.output : [entry.result.output]
            ),
          failures,
          instruction:
            'Keep successful source observations and their hashes. Follow only each failed path with its applicable evidence/docs tool or an alternative; do not repeat the entire successful batch.',
        },
        ...(failures.length === results.length
          ? {
              error:
                'No requested source could be inspected. Follow the individual failures and choose an applicable reader.',
            }
          : {}),
      };
    },
  });

  register({
    name: 'inspect-evidence',
    title: 'Inspect governed evidence',
    description:
      'Read Workspai evidence without authorizing source edits. In ordinary workspace chats omit paths to discover current evidence, including after creation or switching destinations; use project=<registered identity> for project: locators. Governed repair retains its explicit evidence allowlist.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        paths: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'string' } },
        project: { type: 'string', maxLength: 2000 },
        offset: { type: 'integer', minimum: 0 },
      },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const value = asRecord(raw);
      if (input.executionAuthority === 'workspace') {
        return {
          ok: true,
          output: await readStudioWorkspaiEvidence({
            workspacePath: context.workspacePath,
            ...optionalScope(context),
            ...(value.project !== undefined ? { project: value.project as string } : {}),
            ...(value.paths !== undefined ? { paths: stringArray(value.paths, 'paths') } : {}),
            ...(value.offset !== undefined ? { offset: value.offset as number } : {}),
            signal: context.signal,
          }),
        };
      }
      if (value.project !== undefined || value.offset !== undefined) {
        throw new Error('Governed evidence uses its bound scope and exact allowlisted paths.');
      }
      return input.host.inspect({
        paths: stringArray(value.paths, 'paths'),
        kind: 'evidence',
        workspacePath: context.workspacePath,
        ...optionalScope(context),
      });
    },
  });

  register({
    name: 'search-workspace',
    title: 'Search workspace',
    description: 'Search source text inside the selected workspace scope.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        paths: { type: 'array', minItems: 1, items: { type: 'string' } },
      },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const value = asRecord(raw);
      if (typeof value.query !== 'string' || !value.query.trim()) {
        throw new Error('Studio Agent search query is required.');
      }
      return input.host.search({
        query: value.query.trim(),
        ...(value.paths ? { paths: stringArray(value.paths, 'paths') } : {}),
        workspacePath: context.workspacePath,
        ...optionalScope(context),
      });
    },
  });

  if (input.host.inspectProjectAgentEntry) {
    register({
      name: 'inspect-project-agent-entry',
      title: 'Inspect project agent grounding',
      description:
        'Read the bundled CLI agent bootstrap receipt for the selected registered project. From a workspace chat supply project=<exact registered identity from inspect-workspace>. This bounded read requires no shell approval, never changes the execution destination and never gates ordinary coding. Degraded/blocked grounding is evidence to interpret, not an instruction to stop the task.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { project: { type: 'string', minLength: 1, maxLength: 2000 } },
      },
      activity: 'inspect',
      risk: 'read',
      execute: (raw, context) =>
        input.host.inspectProjectAgentEntry!({
          workspacePath: context.workspacePath,
          ...optionalScope(context),
          ...(asRecord(raw).project !== undefined
            ? { project: asRecord(raw).project as string }
            : {}),
          signal: context.signal,
        }),
    });
  }
  if (input.host.inspectProjectCommands) {
    register({
      name: 'inspect-project-commands',
      title: 'Inspect effective project commands',
      description:
        'Read installed workspai project commands --json at a project. From a workspace chat supply project=<exact registered identity from inspect-workspace>. Inspect runtime, owner/status, moduleSupport and lifecycle coverage before choosing Core/runtime commands. This read does not change the execution destination, adopt the project or execute its scripts.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { project: { type: 'string', maxLength: 2000 } },
      },
      activity: 'inspect',
      risk: 'read',
      execute: (raw, context) =>
        input.host.inspectProjectCommands!({
          workspacePath: context.workspacePath,
          ...optionalScope(context),
          ...(asRecord(raw).project !== undefined
            ? { project: asRecord(raw).project as string }
            : {}),
          signal: context.signal,
        }),
    });
  }
  if (input.host.graphSearch) {
    register({
      name: 'query-workspace-graph',
      title: 'Query workspace graph',
      description:
        'Retrieve bounded Workspace Graph search, entities by kind, evidence for an entity, or a path between two entities. Use query for search text/kind/entity/from and target for path destination. Default to the selected project; scope=workspace supports cross-project questions. Use relevant proofs before broad scanning when useful; absent edges are not proof of independence. Source/LSP/other tools remain available.',
      inputSchema: {
        type: 'object',
        required: ['query'],
        additionalProperties: false,
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 500 },
          operation: { type: 'string', enum: ['search', 'entities', 'evidence', 'path'] },
          target: { type: 'string', minLength: 1, maxLength: 500 },
          kind: { type: 'string', minLength: 1, maxLength: 500 },
          scope: { type: 'string', enum: ['workspace', 'project'] },
          project: {
            type: 'string',
            maxLength: 2000,
            description:
              'Exact registered project identity from inventory; chooses a read scope without switching edit permissions.',
          },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
      },
      activity: 'inspect',
      risk: 'read',
      async execute(raw, context) {
        const value = asRecord(raw);
        if (
          typeof value.query !== 'string' ||
          !value.query.trim() ||
          value.query.length > 500 ||
          /[\0\r\n]/.test(value.query)
        ) {
          throw new Error('Workspace graph query must contain 1 to 500 characters.');
        }
        if (
          value.limit !== undefined &&
          (typeof value.limit !== 'number' ||
            !Number.isSafeInteger(value.limit) ||
            value.limit < 1 ||
            value.limit > 50)
        ) {
          throw new Error('Invalid Graph limit.');
        }
        if (
          value.operation !== undefined &&
          !['search', 'entities', 'evidence', 'path'].includes(String(value.operation))
        ) {
          throw new Error('Invalid Graph operation.');
        }
        if (value.scope !== undefined && !['workspace', 'project'].includes(String(value.scope))) {
          throw new Error('Invalid Graph scope.');
        }
        for (const key of ['kind', 'target'] as const) {
          if (
            value[key] !== undefined &&
            (typeof value[key] !== 'string' ||
              !(value[key] as string).trim() ||
              (value[key] as string).length > 500 ||
              /[\0\r\n]/.test(value[key] as string))
          ) {
            throw new Error('Invalid Graph kind/target.');
          }
        }
        if (value.operation === 'path' && !value.target) {
          throw new Error('Graph path requires a target.');
        }
        return input.host.graphSearch!({
          query: value.query.trim(),
          ...(value.operation
            ? { operation: value.operation as StudioGraphReadRequest['operation'] }
            : {}),
          ...(value.target ? { target: value.target as string } : {}),
          ...(value.kind ? { kind: value.kind as string } : {}),
          ...(value.scope ? { scope: value.scope as StudioGraphReadRequest['scope'] } : {}),
          ...(value.project !== undefined ? { project: value.project as string } : {}),
          ...(typeof value.limit === 'number' ? { limit: value.limit } : {}),
          workspacePath: context.workspacePath,
          ...optionalScope(context),
          signal: context.signal,
        });
      },
    });
  }

  register({
    name: 'inspect-workspace-diagnostics',
    title: 'Inspect workspace diagnostics',
    description:
      'Read current VS Code language diagnostics for workspace files, including errors, warnings, ranges, and diagnostic sources.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        paths: { type: 'array', minItems: 1, items: { type: 'string' } },
        severities: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', enum: ['error', 'warning', 'information', 'hint'] },
        },
      },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const value = asRecord(raw);
      return input.host.diagnostics({
        ...(value.paths ? { paths: stringArray(value.paths, 'paths') } : {}),
        ...(Array.isArray(value.severities)
          ? {
              severities: value.severities as Array<'error' | 'warning' | 'information' | 'hint'>,
            }
          : {}),
        workspacePath: context.workspacePath,
        ...optionalScope(context),
      });
    },
  });

  if (input.host.codeIntelligence) {
    register({
      name: 'inspect-code-intelligence',
      title: 'Inspect language intelligence',
      description:
        'Use the active VS Code language providers to resolve definitions, references, implementations, hover types, document symbols, or workspace symbols without guessing from text matches.',
      inputSchema: {
        type: 'object',
        required: ['operation'],
        additionalProperties: false,
        properties: {
          operation: {
            type: 'string',
            enum: [
              'definition',
              'references',
              'implementation',
              'hover',
              'document-symbols',
              'workspace-symbols',
            ],
          },
          path: { type: 'string', description: 'Workspace-relative source path.' },
          line: { type: 'number', minimum: 1 },
          column: { type: 'number', minimum: 1 },
          query: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
      activity: 'inspect',
      risk: 'read',
      async execute(raw, context) {
        const value = asRecord(raw);
        const operation = value.operation as StudioCodeIntelligenceOperation;
        if (
          ![
            'definition',
            'references',
            'implementation',
            'hover',
            'document-symbols',
            'workspace-symbols',
          ].includes(operation)
        ) {
          throw new Error('Code intelligence operation is invalid.');
        }
        return input.host.codeIntelligence!({
          operation,
          ...(typeof value.path === 'string' ? { path: value.path.trim() } : {}),
          ...(typeof value.line === 'number' ? { line: value.line } : {}),
          ...(typeof value.column === 'number' ? { column: value.column } : {}),
          ...(typeof value.query === 'string' ? { query: value.query.trim() } : {}),
          workspacePath: context.workspacePath,
          ...optionalScope(context),
        });
      },
    });
  }

  register({
    name: 'inspect-workspace-batch',
    title: 'Inspect workspace in parallel',
    description:
      'Run up to eight independent read-only source, search, Graph, diagnostics, language-intelligence, or public HTTPS inspections concurrently. Results preserve request order; mutations and verification are never batched.',
    inputSchema: {
      type: 'object',
      required: ['operations'],
      additionalProperties: false,
      properties: {
        operations: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: {
            type: 'object',
            required: ['id', 'kind'],
            additionalProperties: true,
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 80 },
              kind: {
                type: 'string',
                enum: ['source', 'search', 'graph', 'diagnostics', 'code-intelligence', 'web'],
              },
            },
          },
        },
      },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const value = asRecord(raw);
      if (
        !Array.isArray(value.operations) ||
        value.operations.length < 1 ||
        value.operations.length > 8
      ) {
        throw new Error('Workspace inspection batch requires between one and eight operations.');
      }
      const identifiers = new Set<string>();
      const operations = value.operations.map((entry, index) => {
        const operation = asRecord(entry);
        const id = typeof operation.id === 'string' ? operation.id.trim() : '';
        const kind = typeof operation.kind === 'string' ? operation.kind : '';
        if (!id || id.length > 80 || identifiers.has(id)) {
          throw new Error(
            `Workspace inspection batch operation ${index + 1} has an invalid or duplicate id.`
          );
        }
        identifiers.add(id);
        return { id, kind, operation };
      });
      const results = await Promise.all(
        operations.map(async ({ id, kind, operation }) => {
          try {
            let result: StudioAgentToolResult;
            if (kind === 'source') {
              const paths = stringArray(operation.paths, `operations.${id}.paths`);
              const inspected = await Promise.all(
                paths.map(async (file) => {
                  try {
                    return {
                      path: file,
                      result: await input.host.inspect({
                        paths: [file],
                        kind: 'source',
                        ...(typeof operation.lineStart === 'number'
                          ? { lineStart: operation.lineStart }
                          : {}),
                        ...(typeof operation.lineEnd === 'number'
                          ? { lineEnd: operation.lineEnd }
                          : {}),
                        workspacePath: context.workspacePath,
                        ...optionalScope(context),
                      }),
                    };
                  } catch (error) {
                    return {
                      path: file,
                      result: { ok: false, error: String(error) } as StudioAgentToolResult,
                    };
                  }
                })
              );
              result =
                inspected.length === 1
                  ? inspected[0].result
                  : {
                      ok: inspected.every((entry) => entry.result.ok),
                      output: {
                        files: inspected
                          .filter((entry) => entry.result.ok)
                          .flatMap((entry) =>
                            Array.isArray(entry.result.output)
                              ? entry.result.output
                              : [entry.result.output]
                          ),
                        failures: inspected
                          .filter((entry) => !entry.result.ok)
                          .map((entry) => ({ path: entry.path, error: entry.result.error })),
                        guidance:
                          'Keep successful observations. Protected Workspai artifacts require inspect-evidence with authorized paths; do not retry them as source files.',
                      },
                    };
            } else if (kind === 'search') {
              if (typeof operation.query !== 'string' || !operation.query.trim()) {
                throw new Error(`Workspace inspection batch search ${id} requires a query.`);
              }
              result = await input.host.search({
                query: operation.query.trim(),
                ...(operation.paths
                  ? { paths: stringArray(operation.paths, `operations.${id}.paths`) }
                  : {}),
                workspacePath: context.workspacePath,
                ...optionalScope(context),
              });
            } else if (kind === 'graph') {
              if (!input.host.graphSearch) {
                throw new Error('Workspace Graph search is unavailable for this Studio host.');
              }
              if (
                typeof operation.query !== 'string' ||
                !operation.query.trim() ||
                operation.query.length > 500 ||
                /[\0\r\n]/.test(operation.query)
              ) {
                throw new Error(`Workspace inspection batch Graph query ${id} is invalid.`);
              }
              if (
                operation.limit !== undefined &&
                (typeof operation.limit !== 'number' ||
                  !Number.isSafeInteger(operation.limit) ||
                  operation.limit < 1 ||
                  operation.limit > 50)
              ) {
                throw new Error('Invalid batch Graph limit.');
              }
              if (
                operation.scope !== undefined &&
                !['workspace', 'project'].includes(String(operation.scope))
              ) {
                throw new Error('Invalid batch Graph scope.');
              }
              result = await input.host.graphSearch({
                query: operation.query.trim(),
                ...(typeof operation.limit === 'number' ? { limit: operation.limit } : {}),
                ...(operation.scope !== undefined
                  ? { scope: operation.scope as StudioGraphReadRequest['scope'] }
                  : {}),
                ...(operation.project !== undefined
                  ? { project: operation.project as string }
                  : {}),
                workspacePath: context.workspacePath,
                ...optionalScope(context),
                signal: context.signal,
              });
            } else if (kind === 'diagnostics') {
              result = await input.host.diagnostics({
                ...(operation.paths
                  ? { paths: stringArray(operation.paths, `operations.${id}.paths`) }
                  : {}),
                ...(Array.isArray(operation.severities)
                  ? {
                      severities: operation.severities as Array<
                        'error' | 'warning' | 'information' | 'hint'
                      >,
                    }
                  : {}),
                workspacePath: context.workspacePath,
                ...optionalScope(context),
              });
            } else if (kind === 'code-intelligence') {
              if (!input.host.codeIntelligence) {
                throw new Error(
                  'VS Code language intelligence is unavailable for this Studio host.'
                );
              }
              result = await input.host.codeIntelligence({
                operation: operation.operation as StudioCodeIntelligenceOperation,
                ...(typeof operation.path === 'string' ? { path: operation.path.trim() } : {}),
                ...(typeof operation.line === 'number' ? { line: operation.line } : {}),
                ...(typeof operation.column === 'number' ? { column: operation.column } : {}),
                ...(typeof operation.query === 'string' ? { query: operation.query.trim() } : {}),
                workspacePath: context.workspacePath,
                ...optionalScope(context),
              });
            } else if (kind === 'web') {
              if (typeof operation.url !== 'string' || !operation.url.trim()) {
                throw new Error(`Workspace inspection batch web operation ${id} requires a url.`);
              }
              result = await fetchStudioPublicWeb({
                url: operation.url.trim(),
                signal: context.signal,
              });
            } else {
              throw new Error(`Workspace inspection batch operation kind is invalid: ${kind}`);
            }
            return { id, kind, result };
          } catch (error) {
            return {
              id,
              kind,
              result: { ok: false, error: String(error) } as StudioAgentToolResult,
            };
          }
        })
      );
      return {
        ok: results.every((entry) => entry.result.ok),
        changed: false,
        output: { concurrent: true, results },
        ...(results.every((entry) => entry.result.ok)
          ? {}
          : { error: 'One or more parallel workspace inspections failed.' }),
      };
    },
  });

  register({
    name: 'fetch-public-web',
    scopeIndependent: true,
    title: 'Fetch public HTTPS content',
    description:
      'Read a public HTTPS page or document for errors that are not covered by Workspai blockers: vendor docs, GitHub issues, release notes, or status pages. Private, local, and credentialed URLs are blocked. This is not a substitute for inspect-source.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      additionalProperties: false,
      properties: {
        url: { type: 'string', minLength: 12, maxLength: 2_000 },
      },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const value = asRecord(raw);
      if (typeof value.url !== 'string' || !value.url.trim()) {
        throw new Error('Public web fetch requires an HTTPS URL.');
      }
      return fetchStudioPublicWeb({
        url: value.url.trim(),
        signal: context.signal,
      });
    },
  });

  if (input.host.listRetainedHostToolOutputs) {
    register({
      name: 'list-host-tool-outputs',
      scopeIndependent: true,
      title: 'Find saved tool results',
      description:
        'Discover output references retained for this chat across turns and reloads. Use read-host-tool-output to retrieve pages; never rerun an effectful tool merely to recover its output.',
      activity: 'inspect',
      risk: 'read',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      execute: async (_raw, context) =>
        input.host.listRetainedHostToolOutputs!({ sessionId: context.sessionId }),
    });
  }

  if (input.host.readHostToolOutput) {
    register({
      name: 'read-host-tool-output',
      scopeIndependent: true,
      title: 'Read retained tool output',
      description:
        'Read retained tool text or images using outputRef. Images are returned at offset 0; follow nextOffset for text pages. Never repeat the original operation just to retrieve output. References belong to the owning chat and may expire; discover saved references with list-host-tool-outputs; coverage metadata distinguishes retained text from the original output.',
      activity: 'inspect',
      risk: 'read',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['outputRef'],
        properties: {
          outputRef: { type: 'string' },
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 24000 },
        },
      },
      async execute(raw, context) {
        const value = asRecord(raw);
        if (typeof value.outputRef !== 'string' || !value.outputRef.trim()) {
          throw new Error('Provide a host output reference.');
        }
        return input.host.readHostToolOutput!({
          outputRef: value.outputRef,
          sessionId: context.sessionId,
          offset: value.offset as number | undefined,
          limit: value.limit as number | undefined,
        });
      },
    });
  }

  if (input.host.listHostTools) {
    register({
      name: 'list-host-tools',
      scopeIndependent: true,
      title: 'List VS Code and MCP host tools',
      description:
        'Search/page Language Model tools registered in this VS Code window, including MCP servers. Rank relevant names/descriptions/tags with query and follow nextOffset. Partial matches remain discoverable; use queryMode=all to require every term. Default returns compact descriptors; request includeSchemas=true with an exact name query to obtain invocation schemas without flooding context.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', maxLength: 300 },
          queryMode: { type: 'string', enum: ['any', 'all'] },
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 40 },
          includeSchemas: { type: 'boolean' },
        },
      },
      activity: 'inspect',
      risk: 'read',
      async execute(raw) {
        const value = asRecord(raw);
        const offset = value.offset ?? 0;
        const limit = value.limit ?? 20;
        if (
          !Number.isInteger(offset) ||
          (offset as number) < 0 ||
          !Number.isInteger(limit) ||
          (limit as number) < 1 ||
          (limit as number) > 40 ||
          (value.query !== undefined &&
            (typeof value.query !== 'string' || value.query.length > 300)) ||
          (value.queryMode !== undefined && !['any', 'all'].includes(String(value.queryMode))) ||
          (value.includeSchemas !== undefined && typeof value.includeSchemas !== 'boolean')
        ) {
          throw new Error('Invalid host tool search or pagination.');
        }
        const result = await input.host.listHostTools!();
        if (!result.ok) {
          return result;
        }
        const output = asRecord(result.output);
        if (!Array.isArray(output.tools)) {
          return { ok: false, error: 'Host tool catalog did not contain a tool list.' };
        }
        const terms = String(value.query ?? '')
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);
        const tools = output.tools
          .map(asRecord)
          .filter((tool) => typeof tool.name === 'string')
          .map((tool): Record<string, unknown> & { matches: number; matchScore: number } => {
            const name = String(tool.name).toLowerCase();
            const description = String(tool.description ?? '').toLowerCase();
            const tags = (Array.isArray(tool.tags) ? tool.tags.join(' ') : '').toLowerCase();
            const scores = terms.map((term) =>
              name.includes(term) ? 3 : tags.includes(term) ? 2 : description.includes(term) ? 1 : 0
            );
            return {
              ...tool,
              matches: scores.filter((score) => score > 0).length,
              matchScore:
                scores.reduce<number>((sum, score) => sum + score, 0) +
                (name ===
                String(value.query ?? '')
                  .trim()
                  .toLowerCase()
                  ? 100
                  : 0),
            };
          })
          .filter(
            (tool) =>
              terms.length === 0 ||
              (value.queryMode === 'all' ? tool.matches === terms.length : tool.matches > 0)
          )
          .sort(
            (a, b) => b.matchScore - a.matchScore || String(a.name).localeCompare(String(b.name))
          );
        const page = tools
          .slice(offset as number, (offset as number) + (limit as number))
          .map((tool) => ({
            name: tool.name,
            description: String(tool.description ?? '').slice(0, 1_000),
            tags: tool.tags,
            readLike: tool.readLike,
            ...(terms.length ? { matchScore: tool.matchScore } : {}),
            ...(value.includeSchemas === true ? { inputSchema: tool.inputSchema } : {}),
          }));
        return {
          ok: true,
          output: {
            schemaVersion: output.schemaVersion,
            totalTools: output.tools.length,
            count: tools.length,
            offset,
            nextOffset:
              (offset as number) + page.length < tools.length
                ? (offset as number) + page.length
                : null,
            tools: page,
            schemasIncluded: value.includeSchemas === true,
          },
        };
      },
    });
  }

  if (input.host.invokeHostTool) {
    const findHostTool = async (name: string): Promise<Record<string, unknown> | undefined> => {
      const listed = await input.host.listHostTools?.();
      const output = listed?.output;
      const tools =
        output && typeof output === 'object' && !Array.isArray(output)
          ? (output as { tools?: unknown }).tools
          : undefined;
      const match =
        listed?.ok === true && Array.isArray(tools)
          ? tools.find((tool) => tool && typeof tool === 'object' && tool.name === name)
          : undefined;
      if (!mode.canMutateWorkspace && match?.readLike !== true) {
        throw new Error(
          `${mode.label} mode can invoke only a currently registered read-only host tool. Use Agent for tools with effects.`
        );
      }
      if (!match) {
        throw new Error(`Host tool ${name} is not currently registered.`);
      }
      return match;
    };
    const hostToolFingerprint = (name: string, argumentsValue: unknown) =>
      crypto
        .createHash('sha256')
        .update(
          JSON.stringify({ toolName: 'invoke-host-tool', name, arguments: argumentsValue ?? {} })
        )
        .digest('hex');
    register({
      name: 'invoke-host-tool',
      title: 'Invoke a VS Code or MCP host tool',
      description: mode.canMutateWorkspace
        ? 'Invoke one registered VS Code Language Model or MCP tool by exact name. Read-like tools run autonomously. Tools without a read/search/fetch tag require one-run approval because they are outside the CLI source checkpoint.'
        : 'Invoke a registered read-only VS Code Language Model or MCP tool by exact name. List host tools first. This mode rejects tools with effects; use Agent for those tasks.',
      inputSchema: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          arguments: { type: 'object' },
        },
      },
      activity: 'inspect',
      risk: 'read',
      async authorize(raw) {
        const value = asRecord(raw);
        const name = typeof value.name === 'string' ? value.name.trim() : '';
        if (!name) {
          throw new Error('Host tool name is required.');
        }
        const match = await findHostTool(name);
        if (match?.readLike === true) {
          return { risk: 'read' };
        }
        const fingerprint = hostToolFingerprint(name, value.arguments);
        return {
          risk: 'invasive',
          approval: {
            fingerprint,
            title: `Invoke host tool ${name}`,
            summary: `Run the VS Code or MCP tool ${name}. Host tools are outside the Workspai CLI source checkpoint.`,
            scope: 'workspace',
            reasons: ['Host and MCP tools can have effects that Studio cannot roll back.'],
            execution: 'once',
            allowedExecutions: ['once'],
          },
        };
      },
      async execute(raw, context) {
        const value = asRecord(raw);
        const name = typeof value.name === 'string' ? value.name.trim() : '';
        if (!name) {
          throw new Error('Host tool name is required.');
        }
        // Recheck at execution as the host catalog can change after authorization.
        const match = await findHostTool(name);
        if (
          match?.readLike !== true &&
          context.approval?.fingerprint !== hostToolFingerprint(name, value.arguments)
        ) {
          throw new Error(
            'Host tool effects require exact approval; the catalog may have changed since authorization.'
          );
        }
        const invocation = {
          name,
          sessionId: context.sessionId,
          ...(value.arguments &&
          typeof value.arguments === 'object' &&
          !Array.isArray(value.arguments)
            ? { arguments: value.arguments as Record<string, unknown> }
            : {}),
          signal: context.signal,
        };
        let result: StudioAgentToolResult;
        try {
          result = await input.host.invokeHostTool!(invocation);
        } catch (error) {
          result = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        if (match?.readLike === true) {
          return result;
        }
        return {
          ...result,
          output: {
            ...(result.output && typeof result.output === 'object' && !Array.isArray(result.output)
              ? result.output
              : { result: result.output }),
            hostToolExecution: {
              name,
              effectful: true,
              verificationLimit:
                'Review the tool result and perform applicable tool-specific checks. Workspace diagnostics alone cannot verify external effects; host effects have no Workspai Undo checkpoint.',
            },
          },
        };
      },
    });
  }

  register({
    name: 'inspect-workspace-changes',
    title: 'Inspect workspace changes',
    description:
      'Read Git status and bounded diffs for the current workspace so the Agent can review the effects of its changes.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { paths: { type: 'array', minItems: 1, items: { type: 'string' } } },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const value = asRecord(raw);
      return input.host.inspectChanges({
        ...(value.paths ? { paths: stringArray(value.paths, 'paths') } : {}),
        workspacePath: context.workspacePath,
        ...optionalScope(context),
      });
    },
  });

  register({
    name: 'apply-workspace-patch',
    title: 'Apply workspace patch',
    description:
      input.executionAuthority === 'workspace'
        ? 'Apply SHA-protected inspected file replacements with durable before/after snapshots, exact diff review and safe Undo. Changes remain unverified until native project checks and final workspace review.'
        : 'Submit complete inspected file replacements as a SHA-protected proposal. Workspai CLI owns approval binding, checkpoint, execution, runtime-native validation, canonical verification, closure, and rollback.',
    inputSchema: {
      type: 'object',
      required: ['patches'],
      additionalProperties: false,
      properties: {
        patches: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['relativePath', 'patchedContent'],
            additionalProperties: false,
            properties: {
              relativePath: {
                type: 'string',
                minLength: 1,
                description:
                  'Authorized source-root-relative path previously returned by inspect-source, or a new non-sensitive source path when baseSha256 is null. Never target canonical .workspai/.rapidkit state, reports, repair transactions, caches, snapshots, goals, registries, or generated evidence.',
              },
              baseSha256: {
                type: ['string', 'null'],
                description: 'Exact sha256 returned by inspect-source for stale-write protection.',
              },
              patchedContent: {
                type: 'string',
                description:
                  'Complete replacement content for the inspected source file. JSON files (.json) must contain strictly valid JSON with no comments, no trailing commas, and no syntax extensions.',
              },
            },
          },
        },
      },
    },
    activity: 'change',
    risk: 'guarded-write',
    async execute(raw, context) {
      const value = asRecord(raw);
      if (!Array.isArray(value.patches) || value.patches.length === 0) {
        throw new Error('Studio Agent patch list is required.');
      }
      return input.host.applyPatches({
        sessionId: context.sessionId,
        requestId: context.requestId,
        patches: value.patches as FilePatch[],
        transactionId: context.toolCallId,
        workspacePath: context.workspacePath,
        ...optionalScope(context),
        reportProgress: context.reportProgress,
      });
    },
  });

  if (input.host.saveFiles) {
    register({
      name: 'save-workspace-documents',
      title: 'Save documents edited by this request',
      activity: 'change',
      risk: 'safe-write',
      description:
        'Save specific unsaved editor documents already changed by this request, before running checks that read disk. Supply workspace-relative paths. Original disk and buffer contents remain in the request checkpoint. This cannot save unrelated user buffers; save hooks can change content, so inspect the resulting changes and verify them.',
      inputSchema: {
        type: 'object',
        required: ['paths'],
        additionalProperties: false,
        properties: {
          paths: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
      async execute(raw, context) {
        const { paths } = asRecord(raw);
        if (
          !Array.isArray(paths) ||
          !paths.length ||
          paths.length > 20 ||
          paths.some((value) => typeof value !== 'string' || !value.trim() || value.length > 2000)
        ) {
          throw new Error('Supply specific owned workspace-relative document paths.');
        }
        return input.host.saveFiles!({
          sessionId: context.sessionId,
          requestId: context.requestId,
          paths: paths as string[],
          workspacePath: context.workspacePath,
          ...optionalScope(context),
        });
      },
    });
  }
  if (input.host.applyTextEdits) {
    register({
      name: 'apply-workspace-edits',
      title: 'Apply exact source edits',
      description:
        input.executionAuthority === 'workspace'
          ? 'Apply exact oldText/newText edits to inspected files using native SHA protection and durable snapshots. Review and verify the resulting changes.'
          : 'Apply small exact oldText→newText edits to inspected files. This is the preferred safe-write tool for large files because the host reconstructs the full file and the CLI owns validation, verification, and rollback.',
      inputSchema: {
        type: 'object',
        required: ['edits'],
        additionalProperties: false,
        properties: {
          edits: {
            type: 'array',
            minItems: 1,
            maxItems: 12,
            items: {
              type: 'object',
              required: ['relativePath', 'oldText', 'newText'],
              additionalProperties: false,
              properties: {
                relativePath: { type: 'string', minLength: 1 },
                oldText: { type: 'string', minLength: 1, maxLength: 32000 },
                newText: { type: 'string', maxLength: 64000 },
              },
            },
          },
        },
      },
      activity: 'change',
      risk: 'safe-write',
      async execute(raw, context) {
        const value = asRecord(raw);
        if (!Array.isArray(value.edits) || value.edits.length < 1 || value.edits.length > 12) {
          throw new Error('Exact source edits must contain between 1 and 12 entries.');
        }
        const edits = value.edits.map((entry) => {
          const edit = asRecord(entry);
          if (
            typeof edit.relativePath !== 'string' ||
            !edit.relativePath.trim() ||
            typeof edit.oldText !== 'string' ||
            !edit.oldText ||
            typeof edit.newText !== 'string'
          ) {
            throw new Error('Each exact source edit requires relativePath, oldText, and newText.');
          }
          return {
            relativePath: edit.relativePath.trim(),
            oldText: edit.oldText,
            newText: edit.newText,
          };
        });
        return input.host.applyTextEdits!({
          sessionId: context.sessionId,
          requestId: context.requestId,
          edits,
          transactionId: context.toolCallId,
          workspacePath: context.workspacePath,
          ...optionalScope(context),
          reportProgress: context.reportProgress,
        });
      },
    });
  }

  register({
    name: 'run-governed-command',
    title: 'Run governed Workspai command',
    description:
      'Run a governed producer or the contract-owned unified Workspace Intelligence chain. The unified chain is the only authority for execution order and post-mutation closure.',
    inputSchema: {
      type: 'object',
      required: ['commandId'],
      properties: { commandId: { type: 'string', enum: [...STUDIO_EVIDENCE_REFRESH_COMMAND_IDS] } },
    },
    activity: 'change',
    risk: 'guarded-write',
    async execute(raw, context) {
      const value = asRecord(raw);
      if (typeof value.commandId !== 'string') {
        throw new Error('Studio Agent governed commandId is required.');
      }
      return input.host.runGovernedCommand({
        commandId: value.commandId as StudioEvidenceRefreshCommandId,
        workspacePath: context.workspacePath,
        ...optionalScope(context),
        reportProgress: context.reportProgress,
      });
    },
  });

  register({
    name: 'delete-workspace-files',
    title: 'Delete inspected workspace files',
    description:
      'Propose deletion of regular source files that were explicitly inspected in this session. Workspai CLI validates their exact SHA and owns checkpoint, execution, validation, canonical verification, and rollback.',
    inputSchema: {
      type: 'object',
      required: ['paths'],
      additionalProperties: false,
      properties: {
        paths: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' } },
      },
    },
    activity: 'change',
    risk: 'guarded-write',
    async execute(raw, context) {
      const value = asRecord(raw);
      return input.host.deleteFiles({
        sessionId: context.sessionId,
        requestId: context.requestId,
        paths: stringArray(value.paths, 'paths'),
        transactionId: context.toolCallId,
        workspacePath: context.workspacePath,
        ...optionalScope(context),
        reportProgress: context.reportProgress,
      });
    },
  });

  register({
    name: 'run-workspace-command',
    title: 'Run workspace command',
    description:
      'Run workspace-scoped project-native executables as structured no-shell arguments. Safe commands run autonomously; source and other effects require exact fingerprint-bound approval. For a build/test that generates project-owned files, declare allowSourceChanges:true without changing its purpose; approval remains required. A fully restored local mutation is recoverable: inspect its receipt and choose the next action. Non-local effects are one-run only and cannot be undone by a source checkpoint. Workspai/wspai commands use run-governed-command.',
    inputSchema: {
      type: 'object',
      required: ['executable', 'args', 'purpose'],
      additionalProperties: false,
      properties: {
        executable: { type: 'string', minLength: 1 },
        args: {
          type: 'array',
          maxItems: 100,
          items: { type: 'string' },
          description:
            'Argument vector without shell parsing. Package runners must stay local-only and may execute project-native tools such as eslint; they can never invoke Workspai.',
        },
        cwd: {
          type: 'string',
          description: 'Workspace-relative working directory. Defaults to the workspace root.',
        },
        purpose: {
          type: 'string',
          enum: ['inspect', 'diagnose', 'test', 'build', 'format', 'dependency'],
        },
        timeoutMs: { type: 'number', minimum: 1000, maximum: 600000 },
        allowSourceChanges: {
          type: 'boolean',
          description:
            'Declare that this exact command may generate or update project-owned files, including during build/test. Requires source-mutation approval and a checkpoint; false cannot override known mutating actions. After an undeclared mutation was restored, inspect the changed paths before proposing an approved retry.',
        },
      },
    },
    activity: 'change',
    risk: 'guarded-write',
    async authorize(raw, context) {
      const request = workspaceCommandRequestFromRaw(raw);
      await input.host.preflightWorkspaceCommand?.({
        workspacePath: context.workspacePath,
        projectPath: context.projectPath,
        request,
      });
      const plan = resolveStudioWorkspaceCommandPlan({
        workspacePath: context.workspacePath,
        projectPath: context.projectPath,
        request,
      });
      if (!plan.requiresExplicitApproval) {
        return { risk: 'guarded-write' };
      }
      return {
        risk: 'invasive',
        approval: {
          fingerprint: plan.authorizationFingerprint,
          title: 'Approve exact workspace command',
          summary: plan.unclassifiedCommand
            ? 'The model proposes a repository-specific executable whose non-source behavior cannot be inferred from a built-in command family.'
            : 'The model proposes a project-scoped command that may modify source, repository metadata, dependency state, or an external system.',
          displayCommand: plan.displayCommand,
          cwd: plan.cwd,
          scope: context.projectPath ? 'project' : 'workspace',
          reasons: plan.approvalReasons,
          execution: 'once',
          allowedExecutions: plan.allowedApprovalExecutions,
        },
      };
    },
    async execute(raw, context) {
      const request = workspaceCommandRequestFromRaw(raw);
      return input.host.runWorkspaceCommand({
        sessionId: context.sessionId,
        requestId: context.requestId,
        request,
        workspacePath: context.workspacePath,
        ...optionalScope(context),
        ...(context.approval ? { approval: context.approval } : {}),
        signal: context.signal,
        reportProgress: context.reportProgress,
      });
    },
  });

  register({
    name: 'inspect-remediation-plan',
    title: 'Inspect remediation plan',
    description:
      'Read the latest contract-authored remediation steps, freshness, risk, and execution readiness for the active incident.',
    inputSchema: { type: 'object', additionalProperties: false },
    activity: 'inspect',
    risk: 'read',
    async execute(_raw, context) {
      return input.host.inspectRemediationPlan({
        workspacePath: context.workspacePath,
        ...optionalScope(context),
      });
    },
  });

  register({
    name: 'execute-remediation-step',
    title: 'Execute remediation step',
    description:
      'Ask the CLI Repair Engine to compile and execute one fresh remediation action by immutable stepId. Arbitrary command text is never accepted; invasive steps require a user decision.',
    inputSchema: {
      type: 'object',
      required: ['stepId'],
      additionalProperties: false,
      properties: { stepId: { type: 'string', minLength: 1 } },
    },
    activity: 'change',
    risk: 'guarded-write',
    async execute(raw, context) {
      const value = asRecord(raw);
      if (typeof value.stepId !== 'string' || !value.stepId.trim()) {
        throw new Error('Studio Agent remediation stepId is required.');
      }
      return input.host.executeRemediationStep({
        stepId: value.stepId.trim(),
        workspacePath: context.workspacePath,
        ...optionalScope(context),
        ...(context.approval ? { approval: context.approval } : {}),
        reportProgress: context.reportProgress,
      });
    },
  });

  if (
    input.host.inspectDependencySecurity &&
    input.host.repairDependencySecurity &&
    input.host.upgradeDependencySecurity &&
    input.host.completeDependencyTransaction
  ) {
    register({
      name: 'inspect-dependency-security',
      title: 'Inspect dependency security',
      description:
        'Run the runtime-native read-only audit for a project named by fresh Doctor security evidence. Returns advisory details without changing files.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { projectName: { type: 'string', minLength: 1 } },
      },
      activity: 'inspect',
      risk: 'read',
      async execute(raw, context) {
        const value = asRecord(raw);
        return input.host.inspectDependencySecurity!({
          ...(typeof value.projectName === 'string' && value.projectName.trim()
            ? { projectName: value.projectName.trim() }
            : {}),
          workspacePath: context.workspacePath,
          ...optionalScope(context),
        });
      },
    });

    register({
      name: 'repair-dependency-security',
      title: 'Repair dependency security',
      description:
        'Start a CLI-owned dependency repair transaction for a project named by fresh failed Doctor evidence. Reconcile, audit, tests, build, canonical verify, and rollback are inseparable stages.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { projectName: { type: 'string', minLength: 1 } },
      },
      activity: 'change',
      risk: 'guarded-write',
      async execute(raw, context) {
        const value = asRecord(raw);
        return input.host.repairDependencySecurity!({
          ...(typeof value.projectName === 'string' && value.projectName.trim()
            ? { projectName: value.projectName.trim() }
            : {}),
          workspacePath: context.workspacePath,
          ...optionalScope(context),
          reportProgress: context.reportProgress,
        });
      },
    });

    register({
      name: 'upgrade-dependency-security',
      title: 'Upgrade vulnerable direct dependency',
      description:
        'Request a CLI-owned dependency repair after inspecting an advisory candidate. The package hint is evidence only; CLI policy and the immutable remediation plan remain authoritative.',
      inputSchema: {
        type: 'object',
        required: ['packageName'],
        additionalProperties: false,
        properties: {
          projectName: { type: 'string', minLength: 1 },
          packageName: { type: 'string', minLength: 1 },
        },
      },
      activity: 'change',
      risk: 'guarded-write',
      async execute(raw, context) {
        const value = asRecord(raw);
        if (typeof value.packageName !== 'string' || !value.packageName.trim()) {
          throw new Error('Studio Agent dependency packageName is required.');
        }
        return input.host.upgradeDependencySecurity!({
          ...(typeof value.projectName === 'string' && value.projectName.trim()
            ? { projectName: value.projectName.trim() }
            : {}),
          packageName: value.packageName.trim(),
          transactionId: context.toolCallId,
          workspacePath: context.workspacePath,
          ...optionalScope(context),
          reportProgress: context.reportProgress,
        });
      },
    });

    register({
      name: 'complete-dependency-transaction',
      title: 'Complete dependency transaction',
      description:
        'Resume the CLI-owned repair transaction. CLI reconciles manifests and lockfiles, runs audit/tests/build, then performs canonical verification before reporting closed.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          projectNames: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
          },
          changedPaths: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
          },
        },
      },
      activity: 'change',
      risk: 'guarded-write',
      async execute(raw, context) {
        const value = asRecord(raw);
        return input.host.completeDependencyTransaction!({
          ...(Array.isArray(value.projectNames)
            ? { projectNames: stringArray(value.projectNames, 'projectNames') }
            : {}),
          ...(Array.isArray(value.changedPaths)
            ? { changedPaths: stringArray(value.changedPaths, 'changedPaths') }
            : {}),
          workspacePath: context.workspacePath,
          ...optionalScope(context),
          reportProgress: context.reportProgress,
        });
      },
    });
  }

  register({
    name: 'verify-blocker',
    title:
      input.executionAuthority === 'workspace'
        ? 'Review workspace checks'
        : 'Verify active blocker',
    description:
      input.executionAuthority === 'workspace'
        ? 'Review current diagnostics against the session baseline and inspect native changes. Run relevant project tests/builds separately and report their actual results. This is workspace evidence, not Workspai CLI canonical verification.'
        : 'Run the card verify contract and re-read refreshed dashboard evidence. Use before completion.',
    inputSchema: { type: 'object', additionalProperties: false },
    activity: 'verify',
    risk: 'read',
    async execute(_raw, context) {
      return input.host.verify({
        workspacePath: context.workspacePath,
        ...optionalScope(context),
        cardId: input.cardId,
        ...(input.blockerSignature ? { blockerSignature: input.blockerSignature } : {}),
      });
    },
  });

  return registry;
}
