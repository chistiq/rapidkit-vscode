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

export interface StudioAgentWorkspaiToolHost {
  recoverActiveBlocker?(input: {
    workspacePath: string;
    projectPath?: string;
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
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
  search(input: {
    query: string;
    paths?: string[];
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult<StudioAgentSearchMatch[]>>;
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
  }): Promise<StudioAgentToolResult>;
  deleteFiles(input: {
    paths: string[];
    transactionId: string;
    workspacePath: string;
    projectPath?: string;
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
  }): Promise<StudioAgentToolResult>;
  upgradeDependencySecurity(input: {
    projectName?: string;
    packageName: string;
    transactionId: string;
    workspacePath: string;
    projectPath?: string;
  }): Promise<StudioAgentToolResult>;
  completeDependencyTransaction(input: {
    projectNames?: string[];
    changedPaths?: string[];
    workspacePath: string;
    projectPath?: string;
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
      title: 'Verify engineering goal',
      description:
        'Run the durable goal contract checks. Completion is allowed only when the CLI returns an evidence-derived verified state.',
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
    description: 'Read exact workspace source files before proposing changes.',
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
        kind: 'source',
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
      'Create or replace workspace files through one SHA-protected patch transaction with rollback metadata. Existing files must be inspected first; a new file must declare baseSha256 null.',
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
                  'Workspace-relative path previously returned by inspect-source, or a new non-sensitive source path when baseSha256 is null. Never target generated .workspai reports.',
              },
              baseSha256: {
                type: ['string', 'null'],
                description: 'Exact sha256 returned by inspect-source for stale-write protection.',
              },
              patchedContent: {
                type: 'string',
                description: 'Complete replacement content for the inspected source file.',
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
      });
    },
  });

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
      'Delete regular source files that were explicitly inspected in this session. The host checks their exact SHA, rejects sensitive/generated paths and symlinks, and records rollback content.',
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
      });
    },
  });

  register({
    name: 'run-workspace-command',
    title: 'Run workspace command',
    description:
      'Run a structured, no-shell project command inside the selected workspace for diagnostics, tests, builds, formatting, or dependency repair. The command policy blocks shell interpreters, destructive operations, publishing, inline code, external paths, and unreviewed package execution.',
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
          enum: ['inspect', 'diagnose', 'test', 'build', 'format', 'dependency'],
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
        !['inspect', 'diagnose', 'test', 'build', 'format', 'dependency'].includes(value.purpose)
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
      'Execute one fresh CLI-authored remediation step by immutable stepId. Arbitrary command text is never accepted; invasive steps remain blocked.',
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
      'Apply the package-manager native non-force audit fix only to a project named by fresh failed Doctor security evidence. Force upgrades are never allowed.',
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
      });
    },
  });

  register({
    name: 'upgrade-dependency-security',
    title: 'Upgrade vulnerable direct dependency',
    description:
      'Resolve an inspected direct dependency advisory through a package-manager transaction. The host validates the package against fresh audit evidence, installs its latest registry release, updates the lockfile, and preserves rollback data.',
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
      });
    },
  });

  register({
    name: 'complete-dependency-transaction',
    title: 'Complete dependency transaction',
    description:
      'Reconcile the manifest and lockfile for affected projects, then run the focused dependency audit, available tests, and build. The canonical Workspace Intelligence chain remains locked until this transaction reports closureReady.',
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
