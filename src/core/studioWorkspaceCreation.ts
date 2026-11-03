import crypto from 'node:crypto';
import { captureStudioScaffoldChanges } from './studioScaffoldChanges.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { resolveStudioScopePath } from './studioScopePath.js';
import { inspectStudioWorkspaceInventory } from './studioWorkspaceInventory.js';
import { defaultWorkspaceProfileForKit, isScaffoldFramework } from './scaffoldKits.js';
import type {
  StudioAgentToolContext,
  StudioAgentToolDefinition,
  StudioAgentToolResult,
} from './studioAgentToolRegistry.js';

export type StudioCreatedWorkspaceTarget = {
  ref: string;
  workspacePath: string;
  name: string;
  /** Host-normalized destination captured by exact approval; absent on legacy managed targets. */
  location?: { kind: 'custom'; parentPath: string; directoryName: string };
};
export type StudioCreationRunner = (input: {
  args: string[];
  cwd: string;
  signal: AbortSignal;
}) => Promise<{ exitCode: number; stdout?: string; stderr?: string }>;

type Plan = {
  name: string;
  profile: string;
  projects: Array<{ name: string; kit: string }>;
  outputParent?: string;
};
function plan(raw: unknown): Plan {
  const value = raw as Partial<Plan>;
  const name = (entry: unknown): entry is string =>
    typeof entry === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(entry);
  if (!value || !name(value.name) || !Array.isArray(value.projects) || value.projects.length > 8) {
    throw new Error('Provide a new workspace name and up to eight named projects.');
  }
  const projects = value.projects.map((project) => {
    if (!project || !name(project.name)) {
      throw new Error(
        'Project directory names must be lowercase slugs of 1-63 letters, digits or hyphens (for example focusboard). Keep a title such as Focusboard separate from its filesystem name.'
      );
    }
    if (typeof project.kit !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,100}$/.test(project.kit)) {
      throw new Error(
        'Each project needs a Workspai kit identifier. Discover exact ids with inspect-cli-commands topic=architecture and a focused query; do not infer an id from its display label.'
      );
    }
    return { name: project.name, kit: project.kit };
  });
  if (new Set(projects.map((project) => project.name)).size !== projects.length) {
    throw new Error('Project names must be distinct.');
  }
  const profiles = [
    ...new Set(
      projects.map((project) =>
        defaultWorkspaceProfileForKit(
          project.kit,
          isScaffoldFramework(project.kit) ? project.kit : undefined
        )
      )
    ),
  ];
  const profile = value.profile ?? (profiles.length > 1 ? 'polyglot' : (profiles[0] ?? 'minimal'));
  if (
    ![
      'minimal',
      'node-only',
      'python-only',
      'go-only',
      'java-only',
      'dotnet-only',
      'polyglot',
      'enterprise',
    ].includes(profile)
  ) {
    throw new Error('Unsupported workspace profile.');
  }
  if (
    value.outputParent !== undefined &&
    (typeof value.outputParent !== 'string' ||
      !value.outputParent.trim() ||
      value.outputParent.length > 4000 ||
      /[\0\r\n]/.test(value.outputParent))
  ) {
    throw new Error('outputParent must identify the parent directory for the named workspace.');
  }
  return {
    name: value.name,
    profile,
    projects,
    ...(value.outputParent !== undefined ? { outputParent: value.outputParent } : {}),
  };
}
async function destination(home: string, name: string): Promise<string> {
  let current = path.resolve(home);
  const suffix = [name];
  while (!(await fs.pathExists(current))) {
    suffix.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error('Managed workspace location is unavailable.');
    }
    current = parent;
  }
  return path.join(await fs.realpath(current), ...suffix);
}

async function assertIndependentDestination(target: string): Promise<void> {
  let current = path.dirname(target);
  while (current.length > 0) {
    if (
      (
        await Promise.all(
          [
            '.workspai-workspace',
            '.rapidkit-workspace',
            '.workspai/workspace.json',
            '.rapidkit/workspace.json',
          ].map((marker) => fs.pathExists(path.join(current, marker)))
        )
      ).some(Boolean)
    ) {
      throw new Error(
        'Workspai workspaces cannot be nested. Choose a parent outside the existing workspace.'
      );
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return;
    }
    current = parent;
  }
}

export async function validateStudioCreatedWorkspaceTarget(
  target: StudioCreatedWorkspaceTarget,
  home = path.join(os.homedir(), '.workspai', 'workspaces')
): Promise<void> {
  if (
    !target ||
    !/^workspace-[a-f0-9-]{36}$/.test(target.ref) ||
    typeof target.name !== 'string' ||
    !target.name.trim() ||
    /[\0\r\n]/.test(target.name)
  ) {
    throw new Error('The workspace target has an invalid identity.');
  }
  const location = target.location;
  if (
    location &&
    (location.kind !== 'custom' ||
      !path.isAbsolute(location.parentPath) ||
      !location.directoryName ||
      location.directoryName === '.' ||
      location.directoryName === '..' ||
      /[\\/\0\r\n]/.test(location.directoryName))
  ) {
    throw new Error('The workspace target has an invalid destination receipt.');
  }
  if (
    (!location && !/^[a-z0-9-]+$/.test(target.name)) ||
    target.workspacePath !==
      (await destination(location?.parentPath ?? home, location?.directoryName ?? target.name))
  ) {
    throw new Error('The workspace target no longer matches its destination receipt.');
  }
  const marker = await fs.readJSON(path.join(target.workspacePath, '.workspai', 'workspace.json'));
  if (
    marker.workspace_name !== target.name ||
    (await fs.realpath(target.workspacePath)) !== target.workspacePath
  ) {
    throw new Error('The created workspace target no longer matches its receipt.');
  }
}

/** A host-owned destination, not a model-invented path or an unscoped shell command. */
export function studioWorkspaceCreationTool(input: {
  run: StudioCreationRunner;
  managedHome?: string;
  onWorkspaceReady?: (target: StudioCreatedWorkspaceTarget) => void | Promise<void>;
}): StudioAgentToolDefinition {
  const home = input.managedHome ?? path.join(os.homedir(), '.workspai', 'workspaces');
  const describe = async (
    raw: unknown,
    context: Pick<StudioAgentToolContext, 'workspacePath' | 'projectPath'>
  ) => {
    const request = plan(raw);
    const target = await destination(
      request.outputParent !== undefined
        ? resolveStudioScopePath(context, request.outputParent)
        : home,
      request.name
    );
    await assertIndependentDestination(target);
    return {
      request,
      target,
      fingerprint: crypto
        .createHash('sha256')
        .update(JSON.stringify({ request, target }))
        .digest('hex'),
    };
  };
  return {
    name: 'create-workspace',
    selectsExecutionTarget: true,
    scopeIndependent: true,
    title: 'Create a workspace and its projects',
    description:
      'Create a NEW independent Workspai workspace in managed home or an explicit outputParent, then scaffold supported projects INSIDE it. outputParent is the parent; the workspace name is appended. Optional convenience workflow; other CLI/tools and bind-workspace remain available. Returns an owned target reference for subsequent tools and Resume. Never substitute the open workspace or nest workspaces. Project dependencies and Git initialization are skipped; run appropriate setup and checks afterwards.',
    activity: 'change',
    risk: 'invasive',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'projects'],
      properties: {
        name: {
          type: 'string',
          pattern: '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$',
          description: 'Choose an unused lowercase workspace directory name, e.g. shop-workspace.',
        },
        outputParent: {
          type: 'string',
          description:
            'Optional parent directory, absolute or relative to the current scope. The workspace name is appended, as with CLI --output. Omit for managed home.',
        },
        profile: {
          type: 'string',
          enum: [
            'minimal',
            'node-only',
            'python-only',
            'go-only',
            'java-only',
            'dotnet-only',
            'polyglot',
            'enterprise',
          ],
        },
        projects: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'kit'],
            properties: {
              name: {
                type: 'string',
                pattern: '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$',
                description:
                  'Lowercase project directory slug, e.g. focusboard; distinct from its display title.',
              },
              kit: {
                type: 'string',
                description:
                  'Supported kit, e.g. nestjs.standard or nextjs; inspect CLI catalog/help if needed.',
              },
            },
          },
        },
      },
    },
    async authorize(raw, context) {
      const { request, target, fingerprint } = await describe(raw, context);
      if (await fs.pathExists(target)) {
        throw new Error(
          'That workspace destination already exists. Choose an unused name; existing workspaces will not be overwritten.'
        );
      }
      return {
        risk: 'invasive',
        approval: {
          fingerprint,
          title: 'Create this workspace and its projects?',
          summary: `Create ${request.name} with ${request.projects.map((p) => p.name).join(', ') || 'no initial projects'} at ${target}. Workspace provisioning follows the selected profile; project dependency installation is a separate action.`,
          displayCommand: JSON.stringify({
            workspace: target,
            profile: request.profile,
            projects: request.projects,
          }),
          cwd: target,
          scope: 'workspace',
          reasons: [
            'Creates an independent workspace outside the open workspace and registers generated projects.',
          ],
          execution: 'once',
          allowedExecutions: ['once'],
        },
      };
    },
    async execute(raw, context: StudioAgentToolContext): Promise<StudioAgentToolResult> {
      const { request, target, fingerprint } = await describe(raw, context);
      if (context.approval?.fingerprint !== fingerprint) {
        throw new Error(
          'Workspace creation requires approval of this exact destination and project plan.'
        );
      }
      if (await fs.pathExists(target)) {
        throw new Error('Workspace destination already exists; nothing was overwritten.');
      }
      const receipts: Array<{ args: string[]; cwd: string; exitCode: number; stderr?: string }> =
        [];
      let owned: StudioCreatedWorkspaceTarget | undefined;
      const run = async (args: string[], cwd: string) => {
        if (context.signal.aborted) {
          throw new Error('Workspace creation was cancelled.');
        }
        await context.reportProgress?.({
          message: `Running Workspai ${args.slice(0, 3).join(' ')}`,
          command: args,
          targetRef: owned?.ref,
        });
        const result = await input.run({ args, cwd, signal: context.signal });
        receipts.push({
          args,
          cwd,
          exitCode: result.exitCode,
          stderr: result.stderr?.slice(-1500),
        });
        if (result.exitCode !== 0) {
          throw new Error(
            result.stderr?.slice(-1500) || `Workspai exited with code ${result.exitCode}.`
          );
        }
      };
      try {
        if (context.signal.aborted) {
          throw new Error('Workspace creation was cancelled.');
        }
        await fs.ensureDir(path.dirname(target));
        await run(
          [
            'create',
            'workspace',
            request.name,
            '--output',
            path.dirname(target),
            '--profile',
            request.profile,
            '--skip-git',
            '--yes',
          ],
          path.dirname(target)
        );
        const marker = await fs.readJSON(path.join(target, '.workspai', 'workspace.json'));
        if (marker.workspace_name !== request.name || (await fs.realpath(target)) !== target) {
          throw new Error(
            'Created workspace identity or real path does not match the approved destination.'
          );
        }
        owned = {
          ref: `workspace-${crypto.randomUUID()}`,
          workspacePath: target,
          name: request.name,
          ...(request.outputParent !== undefined
            ? {
                location: {
                  kind: 'custom' as const,
                  parentPath: path.dirname(target),
                  directoryName: path.basename(target),
                },
              }
            : {}),
        };
        await input.onWorkspaceReady?.(owned);
        for (const project of request.projects) {
          await validateStudioCreatedWorkspaceTarget(owned, home);
          await run(
            [
              'create',
              'project',
              project.kit,
              project.name,
              '--skip-install',
              '--skip-git',
              '--yes',
            ],
            target
          );
          const link = await fs.readJSON(
            path.join(target, project.name, '.workspai', 'workspace-link.local.json')
          );
          if (
            (await fs.realpath(path.join(target, project.name))) !==
              path.join(target, project.name) ||
            path.resolve(link.workspace?.root ?? '') !== target ||
            link.project?.relativePath !== project.name
          ) {
            throw new Error(
              `Project ${project.name} was not registered in the approved new workspace.`
            );
          }
        }
        const changes = await captureStudioScaffoldChanges({
          workspacePath: target,
          sessionId: context.sessionId,
          requestId: context.requestId,
        });
        return {
          ok: true,
          changed: true,
          executionTarget: owned,
          output: {
            workspaceRef: owned.ref,
            workspaceName: owned.name,
            projects: request.projects,
            ...changes,
            commands: receipts,
            instruction:
              'Workspace and project containment were checked. Dependency setup, applicable project checks, final change review and workspace diagnostics still need to run. All subsequent tools now target this workspace; use relative paths, not redaction tokens.',
          },
        };
      } catch (error) {
        return {
          ok: false,
          changed: receipts.length > 0,
          ...(owned ? { executionTarget: owned } : {}),
          error: String(error),
          output: {
            commands: receipts,
            workspaceRef: owned?.ref,
            instruction: owned
              ? 'Continue in this owned workspace and inspect partial results before retrying. Do not recreate completed projects.'
              : 'Workspace creation did not establish a valid new target. Do not create projects in the currently open workspace as a fallback.',
          },
        };
      }
    },
  };
}

/** Select a real workspace independently of its location or creation route. */
export function studioWorkspaceBindingTool(input: {
  managedHome?: string;
  onWorkspaceReady?: (target: StudioCreatedWorkspaceTarget) => void | Promise<void>;
}): StudioAgentToolDefinition {
  const home = input.managedHome ?? path.join(os.homedir(), '.workspai', 'workspaces');
  const describe = async (
    raw: unknown,
    context: Pick<StudioAgentToolContext, 'workspacePath' | 'projectPath'>
  ) => {
    const value = raw as { name?: unknown; workspacePath?: unknown; projectPath?: unknown } | null;
    const name = value?.name;
    let explicit = value?.workspacePath;
    if ([name, explicit, value?.projectPath].filter((entry) => entry !== undefined).length !== 1) {
      throw new Error(
        'Provide either a managed workspace name, an explicit workspacePath, or a projectPath entry.'
      );
    }
    if (value?.projectPath !== undefined) {
      if (
        typeof value.projectPath !== 'string' ||
        !value.projectPath.trim() ||
        value.projectPath.length > 4000 ||
        /[\0\r\n]/.test(value.projectPath)
      ) {
        throw new Error('Invalid projectPath entry.');
      }
      const inventory = await inspectStudioWorkspaceInventory(
        resolveStudioScopePath(context, value.projectPath)
      );
      if (
        !('scope' in inventory) ||
        !inventory.scope ||
        !('kind' in inventory.scope) ||
        inventory.scope.kind !== 'project' ||
        !inventory.workspace
      ) {
        throw new Error(
          'The project entry has no verified canonical workspace membership. Resolve its CLI ownership first.'
        );
      }
      explicit = inventory.workspace.path;
    }
    if (
      explicit !== undefined &&
      (typeof explicit !== 'string' ||
        !explicit.trim() ||
        explicit.length > 4000 ||
        /[\0\r\n]/.test(explicit))
    ) {
      throw new Error('Invalid workspacePath.');
    }
    if (
      explicit === undefined &&
      (typeof name !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name))
    ) {
      throw new Error('Provide a managed workspace name, not a path or display token.');
    }
    const workspacePath =
      explicit !== undefined
        ? await fs.realpath(resolveStudioScopePath(context, explicit as string))
        : await destination(home, name as string);
    const marker =
      explicit !== undefined
        ? await fs.readJSON(path.join(workspacePath, '.workspai/workspace.json'))
        : undefined;
    const target = {
      ref: `workspace-${crypto.randomUUID()}`,
      workspacePath,
      name: explicit !== undefined ? (marker.workspace_name as string) : (name as string),
      ...(explicit !== undefined
        ? {
            location: {
              kind: 'custom' as const,
              parentPath: path.dirname(workspacePath),
              directoryName: path.basename(workspacePath),
            },
          }
        : {}),
    };
    await validateStudioCreatedWorkspaceTarget(target, home);
    const fingerprint = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          name: target.name,
          workspacePath: target.workspacePath,
          location: target.location,
        })
      )
      .digest('hex');
    return { target, fingerprint };
  };
  return {
    name: 'bind-workspace',
    selectsExecutionTarget: true,
    scopeIndependent: true,
    title: 'Select workspace destination',
    description:
      'Select an existing Workspai workspace by managed name, explicit workspacePath, OR a projectPath entry with verified canonical membership. The project locator can resolve external adopted sources and legacy managed locations without guessing paths. Binds tools/Resume to the exact approved root. Selection does not adopt/import or prove completion. Ordinary project edits need not switch ownership.',
    activity: 'inspect',
    risk: 'invasive',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      oneOf: [
        { required: ['name'] },
        { required: ['workspacePath'] },
        { required: ['projectPath'] },
      ],
      properties: {
        name: { type: 'string', description: 'Workspace directory name in managed home.' },
        workspacePath: {
          type: 'string',
          description:
            'Existing canonical workspace root, absolute or relative to the selected scope. Use this for a custom directory; do not pass a project root.',
        },
        projectPath: {
          type: 'string',
          description:
            'Project source entry, e.g. . or $PROJECT. Resolve its validated local/parent ownership to select the canonical workspace. Does not adopt or relocate source.',
        },
      },
    },
    async authorize(raw, context) {
      const { target, fingerprint } = await describe(raw, context);
      return {
        risk: 'invasive',
        approval: {
          fingerprint,
          title: 'Select this workspace destination?',
          summary: `Subsequent workspace tools will operate in ${target.name}. No files are created by selection.`,
          displayCommand: JSON.stringify({ workspace: target.workspacePath }),
          cwd: target.workspacePath,
          scope: 'workspace',
          reasons: ['Changes the workspace boundary for subsequent tools.'],
          execution: 'once',
          allowedExecutions: ['once'],
        },
      };
    },
    async execute(raw, context) {
      const { target, fingerprint } = await describe(raw, context);
      if (context.signal.aborted) {
        throw new Error('Workspace selection was cancelled.');
      }
      if (context.approval?.fingerprint !== fingerprint) {
        throw new Error('Workspace selection requires approval of this exact destination.');
      }
      await input.onWorkspaceReady?.(target);
      return {
        ok: true,
        executionTarget: target,
        output: {
          workspaceRef: target.ref,
          workspaceName: target.name,
          instruction:
            'Workspace identity was checked. Inspect project membership and verify the requested outcome; selection alone does not establish task completion.',
        },
      };
    },
  };
}
