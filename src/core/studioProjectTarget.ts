import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { studioPathWithin } from './studioInventoryScope.js';
import { inspectStudioWorkspaceInventory } from './studioWorkspaceInventory.js';
import {
  validateStudioCreatedWorkspaceTarget,
  type StudioCreatedWorkspaceTarget,
} from './studioWorkspaceCreation.js';
import type {
  StudioAgentToolContext,
  StudioAgentToolDefinition,
} from './studioAgentToolRegistry.js';

/** The source directory is an execution boundary, independently of Workspai ownership. */
export type StudioProjectExecutionTarget = {
  kind: 'project';
  ref: string;
  name: string;
  workspacePath: string;
  identity: { dev: number; ino: number };
};
export type StudioExecutionTarget = StudioCreatedWorkspaceTarget | StudioProjectExecutionTarget;

export async function createStudioProjectTarget(
  root: string
): Promise<StudioProjectExecutionTarget> {
  const workspacePath = await fs.realpath(root);
  const stat = await fs.stat(workspacePath);
  if (!stat.isDirectory() || path.dirname(workspacePath) === workspacePath) {
    throw new Error('Select a project directory, not a file or filesystem root.');
  }
  return {
    kind: 'project',
    ref: `project-${crypto.randomUUID()}`,
    name: path.basename(workspacePath),
    workspacePath,
    identity: { dev: stat.dev, ino: stat.ino },
  };
}

export async function validateStudioExecutionTarget(
  target: StudioExecutionTarget,
  validateWorkspace: typeof validateStudioCreatedWorkspaceTarget = validateStudioCreatedWorkspaceTarget
): Promise<void> {
  if ('kind' in target && target.kind === 'project') {
    if (
      !/^project-[a-f0-9-]{36}$/.test(target.ref) ||
      !path.isAbsolute(target.workspacePath) ||
      target.name !== path.basename(target.workspacePath) ||
      !target.identity
    ) {
      throw new Error('The project target has an invalid identity.');
    }
    const stat = await fs.stat(target.workspacePath);
    if (
      !stat.isDirectory() ||
      path.dirname(target.workspacePath) === target.workspacePath ||
      (await fs.realpath(target.workspacePath)) !== target.workspacePath ||
      stat.dev !== target.identity.dev ||
      stat.ino !== target.identity.ino
    ) {
      throw new Error(
        'The selected project directory changed identity. Select it again before continuing.'
      );
    }
    return;
  }
  await validateWorkspace(target as StudioCreatedWorkspaceTarget);
}

/** Bounded candidate resolution: exact paths and known IDE roots, never a disk-wide search. */
export async function resolveStudioProjectCandidates(
  locator: string,
  context: Pick<StudioAgentToolContext, 'workspacePath' | 'projectPath'>,
  ideRoots: readonly string[]
): Promise<string[]> {
  if (
    typeof locator !== 'string' ||
    !locator.trim() ||
    locator.length > 4000 ||
    /[\0\r\n]/.test(locator) ||
    /\$(?:LOCAL_PATH|EXTERNAL_PATH)/.test(locator)
  ) {
    throw new Error('Provide the actual project path supplied by the user, not a redaction token.');
  }
  const normalized = locator.replace(/[\\/]/g, path.sep);
  const expanded = normalized.startsWith(`~${path.sep}`)
    ? path.join(os.homedir(), normalized.slice(2))
    : normalized;
  const paths = new Set<string>();
  if (path.isAbsolute(expanded)) {
    paths.add(expanded);
  } else {
    for (const root of [...ideRoots, context.projectPath, context.workspacePath].filter(
      (entry): entry is string => Boolean(entry)
    )) {
      paths.add(path.resolve(root, expanded));
      // A user may include the opened folder's name, e.g. InWork/Reference/project.
      const prefix = `${path.basename(root)}${path.sep}`;
      if (expanded.startsWith(prefix)) {
        paths.add(path.resolve(root, expanded.slice(prefix.length)));
      }
    }
  }
  const found = new Set<string>();
  for (const candidate of paths) {
    try {
      const canonical = await fs.realpath(candidate);
      if ((await fs.stat(canonical)).isDirectory() && path.dirname(canonical) !== canonical) {
        found.add(canonical);
      }
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error;
      }
    }
  }
  return [...found];
}

export function studioProjectSelectionTool(input: {
  ideRoots: readonly string[];
  onTargetReady?: (target: StudioProjectExecutionTarget) => void | Promise<void>;
}): StudioAgentToolDefinition {
  const describe = async (raw: unknown, context: StudioAgentToolContext) => {
    const value = raw as { projectPath?: unknown; candidateRef?: unknown } | null;
    if (
      !value ||
      Object.keys(value).some((key) => !['projectPath', 'candidateRef'].includes(key)) ||
      (value.candidateRef !== undefined &&
        (typeof value.candidateRef !== 'string' ||
          !/^project-candidate-[a-f0-9]{24}$/.test(value.candidateRef))) ||
      typeof value.projectPath !== 'string'
    ) {
      throw new Error(
        'Provide projectPath and an optional observed candidateRef. Selection does not adopt or import.'
      );
    }
    const candidates = await resolveStudioProjectCandidates(
      value.projectPath,
      context,
      input.ideRoots
    );
    const choices = await Promise.all(
      candidates.map(async (candidate, index) => {
        let label = path.basename(candidate);
        for (const root of input.ideRoots) {
          const canonical = await fs.realpath(root).catch(() => undefined);
          if (canonical && studioPathWithin(canonical, candidate)) {
            label = `${path.basename(canonical)} · ${path.relative(canonical, candidate) || '.'}`;
            break;
          }
        }
        return {
          ref: `project-candidate-${crypto.createHash('sha256').update(candidate).digest('hex').slice(0, 24)}`,
          label: `Match ${index + 1}: ${label}`,
        };
      })
    );
    const chosenIndex =
      value.candidateRef !== undefined
        ? choices.findIndex((choice) => choice.ref === value.candidateRef)
        : candidates.length === 1
          ? 0
          : -1;
    if (chosenIndex < 0) {
      if (value.candidateRef !== undefined) {
        throw new Error('The project candidate reference is stale. Resolve the user path again.');
      }
      return { candidates, choices };
    }
    const target = await createStudioProjectTarget(candidates[chosenIndex]);
    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify({ root: target.workspacePath, identity: target.identity }))
      .digest('hex');
    // Genuine user paths come from the session host, never model arguments or repository text.
    let requested =
      candidates.length === 1 && (context.userRequestedPaths?.includes(value.projectPath) ?? false);
    if (!requested) {
      for (const locator of context.userRequestedPaths ?? []) {
        const matches = await resolveStudioProjectCandidates(locator, context, input.ideRoots);
        if (matches.length === 1 && matches[0] === target.workspacePath) {
          requested = true;
          break;
        }
      }
    }
    return { candidates, target, fingerprint, requested };
  };
  return {
    name: 'select-project',
    title: 'Select project source directory',
    activity: 'inspect',
    risk: 'read',
    scopeIndependent: true,
    selectsExecutionTarget: true,
    description:
      'Resolve and select an existing project directory, including outside the selected Workspai workspace. Uses the exact user path and opened IDE folders; no Workspai membership is required. Selection creates no metadata and never adopts/imports. Returns ambiguity or not-found without substituting another project. Source tools and verification then operate at this root through Resume. For an unmanaged project, offer optional onboarding once with brief benefits unless the user opted out. Use onboard-project when available in Agent mode; a decline leaves the original task available.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectPath'],
      properties: {
        projectPath: {
          type: 'string',
          description:
            'User project locator, absolute, ~/path, ../path, Reference/project, or OpenedFolder/Reference/project.',
        },
        candidateRef: {
          type: 'string',
          description:
            'Only after an ambiguous result: the observed choice ref selected by the user. This is a locator, not permission; exact approval remains required when the original user path is ambiguous.',
        },
      },
    },
    async authorize(raw, context) {
      const plan = await describe(raw, context);
      if (!plan.target || plan.requested) {
        return { risk: 'read' };
      }
      return {
        risk: 'invasive',
        approval: {
          fingerprint: plan.fingerprint!,
          title: 'Work in this project directory?',
          summary:
            'Subsequent source tools will use this directory. Selection does not adopt, import, or relocate files.',
          displayCommand: JSON.stringify({ project: plan.target.workspacePath }),
          cwd: plan.target.workspacePath,
          scope: 'project',
          reasons: ['The directory was not uniquely identified by a genuine user path.'],
          execution: 'once',
          allowedExecutions: ['once'],
        },
      };
    },
    async execute(raw, context) {
      const plan = await describe(raw, context);
      if (!plan.target) {
        return {
          ok: false,
          output: {
            code: plan.candidates.length ? 'project-path-ambiguous' : 'project-path-not-found',
            candidates: plan.candidates,
            candidateChoices: plan.choices,
            instruction: plan.candidates.length
              ? 'Ask the user to choose the intended exact directory.'
              : 'No directory matched these known roots. Ask for an absolute path; do not substitute the current project or infer missing Workspai membership means missing files.',
          },
        };
      }
      if (!plan.requested && context.approval?.fingerprint !== plan.fingerprint) {
        throw new Error('Project selection requires approval of the exact directory.');
      }
      if (context.signal.aborted) {
        throw new Error('Project selection was cancelled.');
      }
      await validateStudioExecutionTarget(plan.target);
      const inventory = await inspectStudioWorkspaceInventory(plan.target.workspacePath);
      await input.onTargetReady?.(plan.target);
      return {
        ok: true,
        executionTarget: plan.target,
        output: {
          projectRef: plan.target.ref,
          projectName: plan.target.name,
          inventory,
          ...(inventory.onboardingAdvice === 'offer-optional-adoption' &&
          !context.declinedProjectOnboarding?.includes(plan.target.workspacePath)
            ? {
                onboarding: {
                  optional: true,
                  toolName: 'onboard-project',
                  input: { operation: 'adopt', offer: true },
                  instruction:
                    'Before the first source change, offer once to adopt this existing project in place for dependency mapping, diagnostics, impact checks and agent grounding. The exact approval card is the consent question. Respect an explicit opt-out; declining continues the original task here without adoption. Adoption does not fix environment or checkpoint failures and does not guarantee lower token usage.',
                },
              }
            : {}),
          instruction:
            'The source boundary is selected. Workspai ownership is separate and does not gate ordinary edits or checks. Inspect this project’s instructions and manifests, then fulfill the original request here.',
        },
      };
    },
  };
}
