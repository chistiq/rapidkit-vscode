import crypto from 'node:crypto';

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
  graphSearch?(input: {
    query: string;
    limit?: number;
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
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
    patches: FilePatch[];
    transactionId: string;
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  applyTextEdits?(input: {
    edits: StudioAgentTextEdit[];
    transactionId: string;
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  deleteFiles(input: {
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
    request: StudioWorkspaceCommandRequest;
    workspacePath: string;
    projectPath?: string;
    approval?: StudioAgentToolApprovalGrant;
    signal?: AbortSignal;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
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
  listHostTools?(): Promise<StudioAgentToolResult> | StudioAgentToolResult;
  invokeHostTool?(input: {
    name: string;
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
  return {
    executable: value.executable.trim(),
    args: value.args as string[],
    purpose: value.purpose as StudioWorkspaceCommandRequest['purpose'],
    ...(typeof value.cwd === 'string' && value.cwd.trim() ? { cwd: value.cwd.trim() } : {}),
    ...(typeof value.timeoutMs === 'number' ? { timeoutMs: value.timeoutMs } : {}),
  };
}

export function createStudioAgentWorkspaiToolRegistry(input: {
  host: StudioAgentWorkspaiToolHost;
  cardId: string;
  blockerSignature?: string;
  assistantMode: WorkspaiAssistantMode;
  goalId?: string;
  goalCompletionMode?: 'deterministic-verification' | 'evidence-review';
}): StudioAgentToolRegistry {
  const registry = new StudioAgentToolRegistry();
  const mode = resolveWorkspaiAssistantModeContract(input.assistantMode);
  const register = (definition: Parameters<StudioAgentToolRegistry['register']>[0]): void => {
    if (mode.toolNames.includes(definition.name)) {
      registry.register(definition);
    }
  };

  register({
    name: 'update-task-ledger',
    title: 'Update durable task progress',
    description:
      'Persist the objective and bounded step status for a multi-step task. Use it before substantial work and after meaningful milestones so Resume and compacted context retain unfinished obligations. Every step must be completed before final completion.',
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
        paths: { type: 'array', minItems: 1, items: { type: 'string' } },
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
      return input.host.inspect({
        paths: stringArray(value.paths, 'paths'),
        kind: 'source',
        ...(typeof value.lineStart === 'number' ? { lineStart: value.lineStart } : {}),
        ...(typeof value.lineEnd === 'number' ? { lineEnd: value.lineEnd } : {}),
        workspacePath: context.workspacePath,
        ...optionalScope(context),
      });
    },
  });

  register({
    name: 'inspect-evidence',
    title: 'Inspect governed evidence',
    description: 'Read allowlisted Workspai artifacts that define blockers and repair context.',
    inputSchema: {
      type: 'object',
      required: ['paths'],
      properties: { paths: { type: 'array', minItems: 1, items: { type: 'string' } } },
    },
    activity: 'inspect',
    risk: 'read',
    async execute(raw, context) {
      const value = asRecord(raw);
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

  if (input.host.graphSearch) {
    register({
      name: 'query-workspace-graph',
      title: 'Query workspace graph',
      description:
        'Retrieve a small ranked, proof-backed result set from the canonical Workspace Knowledge Graph before broad source scanning.',
      inputSchema: {
        type: 'object',
        required: ['query'],
        additionalProperties: false,
        properties: {
          query: { type: 'string', minLength: 2, maxLength: 500 },
          limit: { type: 'number', minimum: 1, maximum: 50 },
        },
      },
      activity: 'inspect',
      risk: 'read',
      async execute(raw, context) {
        const value = asRecord(raw);
        if (typeof value.query !== 'string' || value.query.trim().length < 2) {
          throw new Error('Workspace graph query must contain at least two characters.');
        }
        return input.host.graphSearch!({
          query: value.query.trim(),
          ...(typeof value.limit === 'number' ? { limit: value.limit } : {}),
          workspacePath: context.workspacePath,
          ...optionalScope(context),
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
          let result: StudioAgentToolResult;
          if (kind === 'source') {
            result = await input.host.inspect({
              paths: stringArray(operation.paths, `operations.${id}.paths`),
              kind: 'source',
              ...(typeof operation.lineStart === 'number'
                ? { lineStart: operation.lineStart }
                : {}),
              ...(typeof operation.lineEnd === 'number' ? { lineEnd: operation.lineEnd } : {}),
              workspacePath: context.workspacePath,
              ...optionalScope(context),
            });
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
            if (typeof operation.query !== 'string' || operation.query.trim().length < 2) {
              throw new Error(`Workspace inspection batch Graph query ${id} is invalid.`);
            }
            result = await input.host.graphSearch({
              query: operation.query.trim(),
              ...(typeof operation.limit === 'number' ? { limit: operation.limit } : {}),
              workspacePath: context.workspacePath,
              ...optionalScope(context),
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
              throw new Error('VS Code language intelligence is unavailable for this Studio host.');
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

  if (input.host.listHostTools) {
    register({
      name: 'list-host-tools',
      title: 'List VS Code and MCP host tools',
      description:
        'List Language Model tools registered in this VS Code window, including MCP servers the user enabled. Use this when the task needs an editor, browser, or MCP capability that Studio does not own.',
      inputSchema: { type: 'object', additionalProperties: false },
      activity: 'inspect',
      risk: 'read',
      async execute() {
        return input.host.listHostTools!();
      },
    });
  }

  if (input.host.invokeHostTool) {
    register({
      name: 'invoke-host-tool',
      title: 'Invoke a VS Code or MCP host tool',
      description:
        'Invoke one registered VS Code Language Model or MCP tool by exact name. Read-like tools run autonomously. Tools without a read/search/fetch tag require one-run approval because they are outside the CLI source checkpoint.',
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
        const listed = input.host.listHostTools ? await input.host.listHostTools() : undefined;
        const catalog =
          listed?.output &&
          typeof listed.output === 'object' &&
          !Array.isArray(listed.output) &&
          Array.isArray((listed.output as { tools?: unknown }).tools)
            ? ((listed.output as { tools: Array<Record<string, unknown>> }).tools ?? [])
            : [];
        const match = catalog.find((entry) => entry.name === name);
        if (match?.readLike === true) {
          return { risk: 'read' };
        }
        const fingerprint = crypto
          .createHash('sha256')
          .update(
            JSON.stringify({
              toolName: 'invoke-host-tool',
              name,
              arguments: value.arguments ?? {},
            })
          )
          .digest('hex');
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
        return input.host.invokeHostTool!({
          name,
          ...(value.arguments &&
          typeof value.arguments === 'object' &&
          !Array.isArray(value.arguments)
            ? { arguments: value.arguments as Record<string, unknown> }
            : {}),
          signal: context.signal,
        });
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
      'Submit complete inspected file replacements as a SHA-protected proposal. Workspai CLI owns approval binding, checkpoint, execution, runtime-native validation, canonical verification, closure, and rollback.',
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
        patches: value.patches as FilePatch[],
        transactionId: context.toolCallId,
        workspacePath: context.workspacePath,
        ...optionalScope(context),
        reportProgress: context.reportProgress,
      });
    },
  });

  if (input.host.applyTextEdits) {
    register({
      name: 'apply-workspace-edits',
      title: 'Apply exact source edits',
      description:
        'Apply small exact oldText→newText edits to inspected files. This is the preferred safe-write tool for large files because the host reconstructs the full file and the CLI owns validation, verification, and rollback.',
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
      'Run any workspace-scoped project-native executable as a structured no-shell argument vector. Safe commands run autonomously; source, repository-metadata, registry, cluster, daemon, and other external effects pause for explicit fingerprint-bound approval of the exact executable, arguments, scope, purpose, and timeout. Non-local effects are one-run only because a source checkpoint cannot roll them back. Shell/escalation primitives and scope escapes remain blocked. Workspai/wspai commands use run-governed-command.',
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
      },
    },
    activity: 'change',
    risk: 'guarded-write',
    authorize(raw, context) {
      const request = workspaceCommandRequestFromRaw(raw);
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
    title: 'Verify active blocker',
    description:
      'Run the card verify contract and re-read refreshed dashboard evidence. Use before completion.',
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
