import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

import { AIActionContract, AIActionOperation, validateAIActionContract } from './aiActionContract';
import { parseSafeCommand, validateAIActionCommandPolicy } from './aiActionCommandPolicy';
import { redactAIActionText } from './aiActionRedaction';

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 48_000;

export interface AIActionCommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface AIActionExecutionResult {
  operation: AIActionOperation;
  ok: boolean;
  summary: string;
  commands: AIActionCommandResult[];
}

function truncateOutput(value: string): string {
  const redacted = redactAIActionText(value);
  if (Buffer.byteLength(redacted, 'utf8') <= MAX_OUTPUT_BYTES) {
    return redacted;
  }
  return `${redacted.slice(0, MAX_OUTPUT_BYTES)}\n[output truncated]`;
}

async function runCommand(
  command: string,
  cwd: string,
  operation: AIActionOperation
): Promise<AIActionCommandResult> {
  const policy = validateAIActionCommandPolicy(command, operation);
  if (!policy.allowed) {
    return {
      command: redactAIActionText(command),
      exitCode: 1,
      stdout: '',
      stderr: redactAIActionText(policy.reason || 'Command policy blocked execution.'),
    };
  }
  const [bin, ...args] = parseSafeCommand(command);

  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      cwd,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES * 2,
      windowsHide: true,
    });

    return {
      command: redactAIActionText(command),
      exitCode: 0,
      stdout: truncateOutput(stdout),
      stderr: truncateOutput(stderr),
    };
  } catch (error) {
    const typed = error as Error & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      signal?: string;
    };
    return {
      command: redactAIActionText(command),
      exitCode: typeof typed.code === 'number' ? typed.code : 1,
      stdout: truncateOutput(typed.stdout || ''),
      stderr: truncateOutput(typed.stderr || typed.message || typed.signal || ''),
    };
  }
}

async function gitApply(
  diff: string,
  cwd: string,
  checkOnly: boolean
): Promise<AIActionCommandResult> {
  return new Promise((resolve) => {
    const args = ['apply', checkOnly ? '--check' : '--whitespace=nowarn'];
    const child = spawn('git', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), COMMAND_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        command: `git ${args.join(' ')}`,
        exitCode: code ?? 1,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
      });
    });
    child.stdin.end(diff);
  });
}

async function applyPatches(
  contract: AIActionContract,
  cwd: string
): Promise<AIActionCommandResult[]> {
  const diff = contract.proposedPatches
    .map((patch) => patch.diff)
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n');

  if (!diff.trim()) {
    return [];
  }

  const check = await gitApply(diff, cwd, true);
  if (check.exitCode !== 0) {
    return [check];
  }
  return [check, await gitApply(diff, cwd, false)];
}

export async function runAIActionContractOperation(
  contract: AIActionContract,
  input: {
    operation: AIActionOperation;
    workspacePath: string;
  }
): Promise<AIActionExecutionResult> {
  const validation = validateAIActionContract(contract, {
    workspacePath: input.workspacePath,
    strict: true,
  });

  if (input.operation === 'apply' && !validation.canApply) {
    throw new Error('AI action is not apply-ready under strict validation.');
  }
  if (input.operation === 'verify' && !validation.canVerify) {
    throw new Error('AI action has no approved verification command.');
  }
  if (input.operation === 'rollback' && !validation.canRollback) {
    throw new Error('AI action has no approved rollback plan.');
  }

  const commands: AIActionCommandResult[] = [];
  if (input.operation === 'apply') {
    commands.push(...(await applyPatches(contract, input.workspacePath)));
    if (commands.some((result) => result.exitCode !== 0)) {
      return {
        operation: input.operation,
        ok: false,
        summary: 'Patch apply check failed.',
        commands,
      };
    }
    for (const command of contract.proposedCommands) {
      commands.push(await runCommand(command, input.workspacePath, 'apply'));
    }
    if (commands.some((result) => result.exitCode !== 0)) {
      return {
        operation: input.operation,
        ok: false,
        summary: 'Apply command failed before verification.',
        commands,
      };
    }
    for (const command of contract.verificationCommands) {
      commands.push(await runCommand(command, input.workspacePath, 'verify'));
    }
  }

  if (input.operation === 'verify') {
    for (const command of contract.verificationCommands) {
      commands.push(await runCommand(command, input.workspacePath, 'verify'));
    }
  }

  if (input.operation === 'rollback') {
    for (const command of contract.rollbackPlan) {
      commands.push(await runCommand(command, input.workspacePath, 'rollback'));
    }
  }

  const ok = commands.every((result) => result.exitCode === 0);
  return {
    operation: input.operation,
    ok,
    summary: ok
      ? `${input.operation} completed successfully.`
      : `${input.operation} completed with failures.`,
    commands,
  };
}
