import fs from 'fs-extra';
import path from 'path';

import {
  buildNpxRapidkitArgs,
  toPinnedRapidkitExecutionCommand,
} from '../utils/platformCapabilities';
import { getWorkspaceVenvRapidkitCandidates } from '../utils/platformCapabilities';

const SHELL_METACHAR_PATTERN = /[;|`$]|&&|\|\||\$\(/;

const ALLOWED_ROOT_COMMANDS = new Set([
  'doctor',
  'readiness',
  'pipeline',
  'workspace',
  'analyze',
  'autopilot',
  'init',
  'test',
  'build',
  'dev',
  'shell',
]);

export type ParsedRapidkitInvocation = {
  rapidkitArgs: string[];
  displayCommand: string;
};

export type ResolveRapidkitExecutionPlanInput = {
  command: string;
  workspacePath: string;
  projectPath?: string;
  projectBelongsToWorkspace: boolean;
};

export type RapidkitExecutionPlan = {
  executable: string;
  args: string[];
  cwd: string;
  displayCommand: string;
};

function tokenizeCommandArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function findLastRapidkitTokenIndex(tokens: string[]): number {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (tokens[index] === 'rapidkit') {
      return index;
    }
  }
  return -1;
}

export function parseRapidkitInlineCommand(
  command: string
): ParsedRapidkitInvocation | { error: string } {
  const trimmed = command.trim();
  if (!trimmed) {
    return { error: 'No command provided to run.' };
  }
  if (SHELL_METACHAR_PATTERN.test(trimmed)) {
    return { error: 'Shell chaining and metacharacters are not allowed in Studio CLI commands.' };
  }

  const pinned = toPinnedRapidkitExecutionCommand(trimmed).replace(/\s+/g, ' ').trim();
  const tokens = tokenizeCommandArgs(pinned);
  const rapidkitIndex = findLastRapidkitTokenIndex(tokens);
  if (rapidkitIndex < 0) {
    return { error: 'Only RapidKit CLI commands are allowed from Incident Studio.' };
  }

  const rapidkitArgs = tokens.slice(rapidkitIndex + 1);
  if (rapidkitArgs.length === 0) {
    return { error: 'RapidKit command is missing subcommands.' };
  }

  const root = rapidkitArgs[0];
  if (!ALLOWED_ROOT_COMMANDS.has(root)) {
    return { error: `RapidKit command "${root}" is not allowed from Incident Studio.` };
  }

  if (root === 'doctor' && rapidkitArgs[1] && !['workspace', 'project'].includes(rapidkitArgs[1])) {
    return { error: 'Doctor commands must target workspace or project scope.' };
  }

  if (root === 'autopilot' && rapidkitArgs[1] !== 'release') {
    return { error: 'Autopilot commands must use the release subcommand.' };
  }

  return {
    rapidkitArgs,
    displayCommand: `rapidkit ${rapidkitArgs.join(' ')}`.trim(),
  };
}

const WORKSPACE_SCOPED_ROOTS = new Set([
  'doctor',
  'readiness',
  'pipeline',
  'workspace',
  'analyze',
  'autopilot',
]);

export async function resolveRapidkitExecutionPlan(
  input: ResolveRapidkitExecutionPlanInput
): Promise<RapidkitExecutionPlan | { error: string }> {
  const parsed = parseRapidkitInlineCommand(input.command);
  if ('error' in parsed) {
    return parsed;
  }

  const isWorkspaceScoped = WORKSPACE_SCOPED_ROOTS.has(parsed.rapidkitArgs[0] ?? '');
  const effectiveCwd =
    !isWorkspaceScoped && input.projectPath && input.projectBelongsToWorkspace
      ? input.projectPath
      : input.workspacePath;

  if (input.projectPath && !input.projectBelongsToWorkspace) {
    return { error: 'Selected project is outside the active workspace.' };
  }

  const projectLauncher =
    effectiveCwd && (await fs.pathExists(path.join(effectiveCwd, 'rapidkit')))
      ? path.join(effectiveCwd, 'rapidkit')
      : undefined;

  for (const candidate of getWorkspaceVenvRapidkitCandidates(input.workspacePath)) {
    if (await fs.pathExists(candidate)) {
      return {
        executable: candidate,
        args: parsed.rapidkitArgs,
        cwd: effectiveCwd,
        displayCommand: parsed.displayCommand,
      };
    }
  }

  if (projectLauncher && effectiveCwd === input.projectPath) {
    return {
      executable: projectLauncher,
      args: parsed.rapidkitArgs,
      cwd: effectiveCwd,
      displayCommand: `./rapidkit ${parsed.rapidkitArgs.join(' ')}`.trim(),
    };
  }

  const poetryLock =
    effectiveCwd && (await fs.pathExists(path.join(effectiveCwd, 'pyproject.toml')));
  if (poetryLock) {
    return {
      executable: 'poetry',
      args: ['run', 'rapidkit', ...parsed.rapidkitArgs],
      cwd: effectiveCwd,
      displayCommand: `poetry run ${parsed.displayCommand}`,
    };
  }

  return {
    executable: 'npx',
    args: buildNpxRapidkitArgs(parsed.rapidkitArgs),
    cwd: effectiveCwd,
    displayCommand: parsed.displayCommand,
  };
}

export async function execRapidkitExecutionPlan(plan: RapidkitExecutionPlan): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  const { execa } = await import('execa');
  const result = await execa(plan.executable, plan.args, {
    cwd: plan.cwd,
    shell: false,
    timeout: 60_000,
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
