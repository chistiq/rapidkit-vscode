export type AIActionCommandOperation = 'apply' | 'verify' | 'rollback';

export interface AIActionCommandPolicyResult {
  allowed: boolean;
  reason?: string;
}

const SAFE_COMMANDS = new Set([
  'git',
  'make',
  'node',
  'npm',
  'npx',
  'pnpm',
  'poetry',
  'pytest',
  'python',
  'python3',
  'rapidkit',
  'yarn',
]);
const SHELL_META_RE = /[|&;<>()`$\\\n\r]/;
const DANGEROUS_COMMAND_RE =
  /\b(rm\s+-rf|sudo\b|mkfs\b|dd\s+if=|chmod\s+777|chown\s+-R|curl\b.*\|\s*(sh|bash)|wget\b.*\|\s*(sh|bash)|git\s+reset\s+--hard|git\s+clean\s+-fd|docker\s+system\s+prune|kubectl\s+delete|terraform\s+destroy)\b/i;
const DISALLOWED_COMMAND_TOKENS = new Set([
  'add',
  'deploy',
  'dev',
  'install',
  'login',
  'logout',
  'publish',
  'prune',
  'remove',
  'serve',
  'start',
  'update',
  'upgrade',
]);
const VERIFY_KEYWORD_RE =
  /(analyze|build|check|doctor|gate|lint|pytest|readiness|test|tsc|typecheck|validate|verify|vitest)/i;
const APPLY_KEYWORD_RE = /(codegen|fix|format|generate|lint|patch|test|validate|verify)/i;
const ROLLBACK_KEYWORD_RE = /(revert|rollback|restore)/i;

export function isDangerousAIActionCommand(command: string): boolean {
  return DANGEROUS_COMMAND_RE.test(command);
}

export function parseSafeCommand(command: string): string[] {
  const trimmed = command.trim();
  if (!trimmed || SHELL_META_RE.test(trimmed)) {
    throw new Error(`Unsafe shell syntax is not allowed: ${command}`);
  }
  if (isDangerousAIActionCommand(trimmed)) {
    throw new Error(`Dangerous command blocked: ${command}`);
  }

  const tokens = trimmed.match(/"[^"]*"|'[^']*'|\S+/g)?.map((part) => {
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'"))
    ) {
      return part.slice(1, -1);
    }
    return part;
  });

  if (!tokens?.length) {
    throw new Error(`Command is empty: ${command}`);
  }
  if (!SAFE_COMMANDS.has(tokens[0])) {
    throw new Error(`Command is not allowlisted for AI action execution: ${tokens[0]}`);
  }

  return tokens;
}

function containsDisallowedToken(tokens: string[]): string | null {
  for (const token of tokens.slice(1)) {
    const normalized = token.toLowerCase().replace(/^--?/, '');
    if (DISALLOWED_COMMAND_TOKENS.has(normalized)) {
      return token;
    }
  }
  return null;
}

function hasGitRollbackShape(tokens: string[]): boolean {
  if (tokens[0] !== 'git') {
    return false;
  }
  const subcommand = tokens[1];
  if (subcommand !== 'checkout' && subcommand !== 'restore') {
    return false;
  }
  const separatorIndex = tokens.indexOf('--');
  return separatorIndex >= 2 && separatorIndex < tokens.length - 1;
}

export function validateAIActionCommandPolicy(
  command: string,
  operation: AIActionCommandOperation
): AIActionCommandPolicyResult {
  let tokens: string[];
  try {
    tokens = parseSafeCommand(command);
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const disallowedToken = containsDisallowedToken(tokens);
  if (disallowedToken) {
    return {
      allowed: false,
      reason: `Command token is not allowed for AI action execution: ${disallowedToken}`,
    };
  }

  const commandText = tokens.join(' ');
  if (operation === 'verify') {
    return VERIFY_KEYWORD_RE.test(commandText)
      ? { allowed: true }
      : {
          allowed: false,
          reason:
            'Verification commands must be deterministic test/check/build/analyze style commands.',
        };
  }

  if (operation === 'apply') {
    return APPLY_KEYWORD_RE.test(commandText)
      ? { allowed: true }
      : {
          allowed: false,
          reason: 'Apply commands must be limited to fix/format/generate/validate style commands.',
        };
  }

  if (hasGitRollbackShape(tokens) || ROLLBACK_KEYWORD_RE.test(commandText)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Rollback commands must be explicit restore/revert/rollback commands.',
  };
}
