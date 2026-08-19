import type { FilePatch } from './patchApplyEngine.js';
import type { StudioEvidenceRefreshCommandId } from './sidebarStudioAgentRuntime.js';
import { STUDIO_EVIDENCE_REFRESH_COMMAND_IDS } from './sidebarStudioAgentRuntime.js';
import { StudioAgentToolRegistry, type StudioAgentToolResult } from './studioAgentToolRegistry.js';
import {
  resolveWorkspaiAssistantModeContract,
  type WorkspaiAssistantMode,
} from './assistantModeContract.js';
import type { StudioWorkspaceCommandRequest } from './studioWorkspaceCommand.js';

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
  }): Promise<StudioAgentToolResult>;
  inspectRemediationPlan(input: {
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
  executeRemediationStep(input: {
    stepId: string;
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  inspectDependencySecurity(input: {
    projectName?: string;
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
  repairDependencySecurity(input: {
    projectName?: string;
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  upgradeDependencySecurity(input: {
    projectName?: string;
    packageName: string;
    transactionId: string;
    workspacePath: string;
    projectPath?: string;
    reportProgress?: (data: Record<string, unknown>) => Promise<void>;
  }): Promise<StudioAgentToolResult>;
  completeDependencyTransaction(input: {
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
      'Run a structured, no-shell, non-mutating project command for inspection, diagnostics, tests, or builds. All source, formatting, and dependency mutations must use the CLI-owned repair transaction.',
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
            'Argument vector without shell parsing. For npx, begin with --no-install, then the local package binary; for example ["--no-install", "workspai", "doctor", "project", "--json"].',
        },
        cwd: {
          type: 'string',
          description: 'Workspace-relative working directory. Defaults to the workspace root.',
        },
        purpose: {
          type: 'string',
          enum: ['inspect', 'diagnose', 'test', 'build'],
        },
        timeoutMs: { type: 'number', minimum: 1000, maximum: 600000 },
      },
    },
    activity: 'change',
    risk: 'guarded-write',
    async execute(raw, context) {
      const value = asRecord(raw);
      if (typeof value.executable !== 'string' || !value.executable.trim()) {
        throw new Error('Studio workspace command executable is required.');
      }
      if (!Array.isArray(value.args) || !value.args.every((entry) => typeof entry === 'string')) {
        throw new Error('Studio workspace command args must be a string array.');
      }
      if (
        typeof value.purpose !== 'string' ||
        !['inspect', 'diagnose', 'test', 'build'].includes(value.purpose)
      ) {
        throw new Error('Studio workspace command purpose is invalid.');
      }
      return input.host.runWorkspaceCommand({
        request: {
          executable: value.executable.trim(),
          args: value.args as string[],
          purpose: value.purpose as StudioWorkspaceCommandRequest['purpose'],
          ...(typeof value.cwd === 'string' && value.cwd.trim() ? { cwd: value.cwd.trim() } : {}),
          ...(typeof value.timeoutMs === 'number' ? { timeoutMs: value.timeoutMs } : {}),
        },
        workspacePath: context.workspacePath,
        ...optionalScope(context),
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
        reportProgress: context.reportProgress,
      });
    },
  });

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
      return input.host.inspectDependencySecurity({
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
      return input.host.repairDependencySecurity({
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
      return input.host.upgradeDependencySecurity({
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
      return input.host.completeDependencyTransaction({
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
