import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { resolveStudioScopePath } from './studioScopePath.js';
import { inspectStudioWorkspaceInventory } from './studioWorkspaceInventory.js';
import {
  createStudioProjectTarget,
  validateStudioExecutionTarget,
  type StudioProjectExecutionTarget,
} from './studioProjectTarget.js';
import type { StudioCreationRunner } from './studioWorkspaceCreation.js';
import type {
  StudioAgentToolContext,
  StudioAgentToolDefinition,
} from './studioAgentToolRegistry.js';
import { studioPathWithin } from './studioInventoryScope.js';

const MARKERS = [
  '.workspai-workspace',
  '.rapidkit-workspace',
  '.workspai/workspace.json',
  '.rapidkit/workspace.json',
];
async function hasWorkspace(root: string): Promise<boolean> {
  return (await Promise.all(MARKERS.map((marker) => fs.pathExists(path.join(root, marker))))).some(
    Boolean
  );
}

async function workspaceIdentity(root: string): Promise<string> {
  const markers: Array<{ path: string; digest: string }> = [];
  for (const marker of MARKERS) {
    const file = path.join(root, marker);
    const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (!stat) {
      continue;
    }
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > 512 * 1024 ||
      (await fs.realpath(file)) !== file
    ) {
      throw new Error(
        'Workspace identity markers must be bounded regular files inside the destination.'
      );
    }
    markers.push({
      path: marker,
      digest: crypto
        .createHash('sha256')
        .update(await fs.readFile(file))
        .digest('hex'),
    });
  }
  return crypto.createHash('sha256').update(JSON.stringify(markers)).digest('hex');
}

/** Pins existing ancestors too, so a missing destination cannot be redirected by a symlink. */
async function destinationReceipt(input: string) {
  const absolute = path.resolve(input);
  let current = absolute;
  const suffix: string[] = [];
  while (!(await fs.pathExists(current))) {
    suffix.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error('Destination has no available parent.');
    }
    current = parent;
  }
  const canonical = await fs.realpath(current);
  const stat = await fs.stat(canonical);
  if (!stat.isDirectory()) {
    throw new Error('Workspace destination must be a directory.');
  }
  return {
    path: path.join(canonical, ...suffix),
    ancestor: canonical,
    dev: stat.dev,
    ino: stat.ino,
    missing: suffix.length > 0,
  };
}

function cliJSON(output: string | undefined): Record<string, unknown> {
  const text = output?.trim() ?? '';
  if (Buffer.byteLength(text) > 4 * 1024 * 1024) {
    throw new Error('The CLI onboarding receipt exceeded the bounded output size.');
  }
  let start = -1,
    depth = 0,
    quoted = false,
    escaped = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (start < 0) {
      if (character === '{') {
        start = index;
        depth = 1;
      }
      continue;
    }
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        quoted = false;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === '{') {
      depth++;
    } else if (character === '}' && --depth === 0) {
      try {
        const value = JSON.parse(text.slice(start, index + 1));
        if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          typeof value.workspacePath === 'string' &&
          (value.adoptedProject || value.importedProject)
        ) {
          return value;
        }
      } catch {
        /* Log noise is not an onboarding receipt. */
      }
      start = -1;
    }
  }
  throw new Error('Workspai did not return a complete JSON onboarding receipt.');
}

/** The exact-approval card is the optional adoption offer; rejection never blocks source work. */
export function studioProjectOnboardingTool(input: {
  run: StudioCreationRunner;
  home?: string;
  onTargetReady?: (target: StudioProjectExecutionTarget) => void | Promise<void>;
}): StudioAgentToolDefinition {
  const home = input.home ?? os.homedir();
  const describe = async (raw: unknown, context: StudioAgentToolContext) => {
    const value = raw as {
      operation?: unknown;
      workspacePath?: unknown;
      name?: unknown;
      offer?: unknown;
    } | null;
    if (
      !value ||
      Object.keys(value).some(
        (key) => !['operation', 'workspacePath', 'name', 'offer'].includes(key)
      ) ||
      (value.offer !== undefined && typeof value.offer !== 'boolean') ||
      !['adopt', 'import'].includes(String(value.operation)) ||
      (value.workspacePath !== undefined &&
        (typeof value.workspacePath !== 'string' ||
          !value.workspacePath.trim() ||
          value.workspacePath.length > 4000 ||
          /[\0\r\n]/.test(value.workspacePath))) ||
      (value.name !== undefined &&
        (typeof value.name !== 'string' ||
          !/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(value.name)))
    ) {
      throw new Error(
        'Choose adopt (keep source) or import (copy source), with an optional workspacePath and safe project name.'
      );
    }
    const source = await createStudioProjectTarget(context.projectPath ?? context.workspacePath);
    const inventory = await inspectStudioWorkspaceInventory(source.workspacePath);
    if (value.operation === 'adopt' && inventory.management !== 'unmanaged') {
      if (
        inventory.management === 'workspai' &&
        'scope' in inventory &&
        inventory.scope?.kind === 'project'
      ) {
        return { source, noOp: 'already-managed' as const };
      }
      throw new Error(
        'Resolve existing Workspai ownership before adoption. The original source task can continue without onboarding.'
      );
    }
    if (
      value.offer !== false &&
      context.declinedProjectOnboarding?.includes(source.workspacePath)
    ) {
      return { source, noOp: 'declined' as const };
    }
    let destination: string;
    if (value.workspacePath !== undefined) {
      destination = resolveStudioScopePath(context, value.workspacePath as string);
    } else {
      const candidates = [
        path.join(home, '.workspai/workspaces/workspai'),
        path.join(home, 'rapidkit/workspaces/workspai'),
        path.join(home, 'Workspai/rapidkits/workspai'),
      ];
      destination = candidates[0];
      for (const candidate of candidates) {
        if (await hasWorkspace(candidate)) {
          destination = candidate;
          break;
        }
      }
    }
    const receipt = await destinationReceipt(destination);
    if (
      studioPathWithin(source.workspacePath, receipt.path) ||
      path.dirname(receipt.path) === receipt.path
    ) {
      throw new Error(
        'The workspace must be outside the project source and distinct from the filesystem root.'
      );
    }
    let ancestor = path.dirname(receipt.path);
    while (ancestor !== path.dirname(ancestor)) {
      if (await hasWorkspace(ancestor)) {
        throw new Error(
          'Workspai workspaces cannot nest. Choose a different workspace destination.'
        );
      }
      ancestor = path.dirname(ancestor);
    }
    const existingWorkspace = !receipt.missing && (await hasWorkspace(receipt.path));
    if (!receipt.missing && !existingWorkspace && (await fs.readdir(receipt.path)).length) {
      throw new Error(
        'The destination is neither a Workspai workspace nor empty. Keep working in the source project, or choose a valid workspace/empty destination.'
      );
    }
    // Both routes use an explicit destination, so the unrelated selected workspace cannot win cwd resolution.
    const create = receipt.missing || (!existingWorkspace && value.operation === 'import');
    if (create && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(path.basename(receipt.path))) {
      throw new Error('A new workspace needs a lowercase CLI-compatible directory name.');
    }
    // create workspace refuses an existing directory. Empty adopt destinations can bootstrap in-place.
    if (create && !receipt.missing) {
      throw new Error(
        'For import, choose an existing Workspai workspace or a new destination; an empty directory can be bootstrapped with adopt.'
      );
    }
    const name =
      (typeof value.name === 'string' ? value.name : path.basename(source.workspacePath))
        .toLowerCase()
        .replace(/\.git$/i, '')
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .slice(0, 64)
        .replace(/^[-_.]+|[-_.]+$/g, '') || 'imported-project';
    if (typeof value.name === 'string' && name !== value.name) {
      throw new Error(
        `The CLI would normalize that name to ${name}. Use that exact name in a new onboarding proposal before requesting consent.`
      );
    }
    const importedPath = path.join(receipt.path, name);
    if (value.operation === 'import' && (await fs.pathExists(importedPath))) {
      throw new Error(
        'The requested import destination already exists. Choose an unused project name; no automatic renaming or overwrite is authorized.'
      );
    }
    const commands = [
      ...(create
        ? [
            [
              'create',
              'workspace',
              path.basename(receipt.path),
              '--output',
              path.dirname(receipt.path),
              '--profile',
              'minimal',
              '--skip-git',
              '--yes',
            ],
          ]
        : []),
      [
        String(value.operation),
        source.workspacePath,
        '--workspace',
        receipt.path,
        '--name',
        name,
        '--json',
      ],
    ];
    const identity = {
      source: source.workspacePath,
      sourceIdentity: source.identity,
      receipt,
      workspaceIdentity: existingWorkspace ? await workspaceIdentity(receipt.path) : undefined,
      operation: value.operation,
      name,
      commands,
    };
    return {
      source,
      receipt,
      operation: value.operation as 'adopt' | 'import',
      name,
      commands,
      importedPath,
      fingerprint: crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
    };
  };
  return {
    name: 'onboard-project',
    title: 'Offer optional Workspai adoption or import',
    activity: 'change',
    risk: 'invasive',
    selectsExecutionTarget: true,
    description:
      'Offer Workspai onboarding for the SELECTED project. Use adopt to keep source in place; import copies to an explicit owned destination. This exact approval is the consent question, with source, destination and benefits; decline continues the original coding task. Omit workspacePath to use the managed default workspai workspace (reuse legacy default if present); supply the user’s chosen workspace root for custom destination, NOT its parent. Creates a missing workspace explicitly before onboarding. Never select an unrelated project or silently adopt. No --yes/--output/--dry-run flags are invented for adopt/import. For Git URL cloning, inspect installed import help and use an exact-approved CLI command with --git instead.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['operation'],
      properties: {
        operation: { type: 'string', enum: ['adopt', 'import'] },
        offer: {
          type: 'boolean',
          description:
            'Defaults to true for an optional suggestion. Set false only when the user now explicitly requests onboarding after a previous decline. This never bypasses exact approval.',
        },
        workspacePath: {
          type: 'string',
          description:
            'Optional canonical workspace ROOT. Omit for managed default workspai, independent of the selected chat workspace.',
        },
        name: {
          type: 'string',
          description:
            'Optional project registration/folder name; import requires an unused destination name.',
        },
      },
    },
    async authorize(raw, context) {
      const plan = await describe(raw, context);
      if (plan.noOp) {
        return { risk: 'read' };
      }
      return {
        risk: 'invasive',
        approval: {
          fingerprint: plan.fingerprint!,
          title:
            plan.operation === 'adopt'
              ? 'Adopt this project into Workspai?'
              : 'Copy this project into Workspai?',
          summary: `Register ${plan.source.name} in ${path.basename(plan.receipt!.path)}. ${plan.operation === 'adopt' ? 'Keep the source in place' : 'Copy the source into the workspace'} for dependency mapping, diagnostics, impact checks and agent grounding. Workspai metadata, grounding and registry entries will change. Decline to continue your original task in the source project.`,
          displayCommand: JSON.stringify(
            {
              source: plan.source.workspacePath,
              workspace: plan.receipt!.path,
              materialization: plan.operation === 'adopt' ? 'keep-in-place' : 'copy',
              commands: plan.commands,
            },
            null,
            2
          ),
          cwd: plan.source.workspacePath,
          scope: 'project',
          reasons: [
            'Optional project onboarding changes metadata and registration; an ordinary coding request does not authorize it.',
          ],
          execution: 'once',
          allowedExecutions: ['once'],
          optionalProjectOnboarding: { projectPath: plan.source.workspacePath },
        },
      };
    },
    async execute(raw, context) {
      const plan = await describe(raw, context);
      if (plan.noOp) {
        return {
          ok: true,
          changed: false,
          output: {
            status: plan.noOp,
            instruction:
              'Continue the original task in this source project without repeating an offer, including after Resume. If the user later explicitly requests onboarding, offer=false permits a fresh exact approval; it does not grant consent.',
          },
        };
      }
      if (context.approval?.fingerprint !== plan.fingerprint) {
        throw new Error(
          'Onboarding requires consent for the exact source, destination, and keep/copy operation.'
        );
      }
      const recorded: Array<{
        args: string[];
        cwd: string;
        exitCode: number;
        stdout?: string;
        stderr?: string;
      }> = [];
      let commandInFlight = false;
      let last: Record<string, unknown> = {};
      try {
        for (const args of plan.commands!) {
          if (context.signal.aborted) {
            throw new Error('Onboarding was cancelled. Inspect recorded work before retrying.');
          }
          await validateStudioExecutionTarget(plan.source);
          if (
            args[0] !== 'create' &&
            (await fs.realpath(plan.receipt!.path)) !== plan.receipt!.path
          ) {
            throw new Error('The approved workspace destination was redirected before onboarding.');
          }
          if (args[0] === 'import' && (await fs.pathExists(plan.importedPath!))) {
            throw new Error(
              'The approved import destination appeared before execution. Select a new unused destination; nothing was overwritten.'
            );
          }
          await context.reportProgress?.({
            summary:
              args[0] === 'create'
                ? 'Creating the approved workspace destination'
                : 'Registering the approved project',
            argv: args,
          });
          commandInFlight = true;
          const result = await input.run({
            args,
            cwd: plan.source.workspacePath,
            signal: context.signal,
          });
          commandInFlight = false;
          recorded.push({ args, cwd: plan.source.workspacePath, ...result });
          await context.reportProgress?.({
            commandReceipt: { args, cwd: plan.source.workspacePath, exitCode: result.exitCode },
          });
          if (result.exitCode !== 0) {
            return {
              ok: false,
              changed: recorded.some((entry) => entry.exitCode === 0),
              output: {
                commands: recorded,
                sourcePath: plan.source.workspacePath,
                workspacePath: plan.receipt!.path,
                instruction:
                  'Review these actual command results before retrying. The original source remains the task target. Do not repeat a successful workspace creation.',
              },
              error:
                'Workspai onboarding did not complete; ordinary source work remains available.',
            };
          }
          if (args[0] !== 'create') {
            last = cliJSON(result.stdout);
          }
        }
        const returned = last[plan.operation === 'adopt' ? 'adoptedProject' : 'importedProject'] as
          | { path?: unknown; relationship?: unknown }
          | undefined;
        const expectedPath =
          plan.operation === 'adopt' ? plan.source.workspacePath : plan.importedPath!;
        const ingestion = last.plan as Record<string, unknown> | undefined;
        if (
          last.workspacePath !== plan.receipt!.path ||
          returned?.path !== expectedPath ||
          ingestion?.schemaVersion !== 'workspai.ingestion-plan.v1' ||
          ingestion.action !== `${plan.operation}-project` ||
          ingestion.mode !== (plan.operation === 'adopt' ? 'link' : 'copy') ||
          ingestion.source !== plan.source.workspacePath ||
          ingestion.targetWorkspace !== plan.receipt!.path ||
          ingestion.destination !== expectedPath
        ) {
          return {
            ok: false,
            changed: true,
            output: { commands: recorded },
            error:
              'The CLI onboarding receipt differs from the approved source/destination or keep/copy operation. Inspect recorded results before any further write.',
          };
        }
        const inventory = await inspectStudioWorkspaceInventory(expectedPath);
        if (
          inventory.management !== 'workspai' ||
          inventory.workspace?.path !== plan.receipt!.path ||
          !inventory.projects.some((project) => project.path === expectedPath)
        ) {
          return {
            ok: false,
            changed: true,
            output: { commands: recorded, inventory },
            error:
              'Onboarding commands returned successfully, but canonical project membership is not verified. Keep the original source target and resolve CLI ownership before claiming adoption/import succeeded.',
          };
        }
        // Adoption changes ownership metadata, not the source boundary or its checkpoint ledger.
        const target =
          plan.operation === 'import' ? await createStudioProjectTarget(expectedPath) : undefined;
        if (target) {
          await input.onTargetReady?.(target);
        }
        return {
          ok: true,
          changed: true,
          ...(target ? { executionTarget: target } : {}),
          output: {
            status: 'registered',
            operation: plan.operation,
            workspacePath: plan.receipt!.path,
            projectPath: expectedPath,
            commands: recorded,
            inventory,
            instruction:
              'Canonical membership was checked. Continue the user’s original task at this selected source. Registration alone does not verify the requested code change or application behavior.',
          },
        };
      } catch (error) {
        return {
          ok: false,
          changed: recorded.length > 0 || commandInFlight,
          error: error instanceof Error ? error.message : String(error),
          output: {
            commands: recorded,
            sourcePath: plan.source.workspacePath,
            workspacePath: plan.receipt!.path,
            instruction:
              'Inspect these recorded command results and current ownership before retrying. Do not recreate a successful workspace or repeat successful onboarding. The original source tools remain available.',
          },
        };
      }
    },
  };
}
