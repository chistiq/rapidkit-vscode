import process from 'node:process';
import { run } from '../utils/exec';
import {
  buildNpxRapidkitArgs,
  warmRapidkitNpmPackageResolution,
} from '../utils/platformCapabilities';

export type CanonicalCliFailure = {
  success: false;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CanonicalImportJson = {
  workspacePath?: string;
  workspaceResolution?: string;
  defaultWorkspaceCreated?: boolean;
  importedProject?: {
    name?: string;
    path?: string;
    stack?: string;
    projectJsonPath?: string;
  };
  error?: string;
};

export type CanonicalAdoptJson = {
  workspacePath?: string;
  workspaceResolution?: string;
  defaultWorkspaceCreated?: boolean;
  adoptedProject?: {
    name?: string;
    path?: string;
    relativePath?: string;
    relationship?: 'imported' | 'adopted';
    stack?: string;
    runtime?: string;
    runtimeCandidates?: string[];
    framework?: string;
    frameworkDisplayName?: string;
    supportTier?: string;
    moduleSupport?: boolean;
    confidence?: 'high' | 'medium' | 'low';
    projectJsonPath?: string;
    adoptJsonPath?: string;
    adoptReadinessPath?: string;
    wroteFiles?: boolean;
  };
  error?: string;
};

export function parseTrailingJson<T>(stdout: string): T | null {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first < 0 || last <= first) {
    return null;
  }

  try {
    return JSON.parse(trimmed.slice(first, last + 1)) as T;
  } catch {
    return null;
  }
}

function formatCanonicalCliFailure(
  action: 'import' | 'adopt',
  failure: CanonicalCliFailure
): string {
  const detail = failure.stderr.trim() || failure.stdout.trim() || `exit code ${failure.exitCode}`;
  return (
    `RapidKit ${action} failed via npm CLI.\n\n${detail}\n\n` +
    'Enterprise mode requires the canonical npm path. Verify RapidKit is installed and rerun from the project workspace root.'
  );
}

export async function runCanonicalNpmImport(input: {
  workspacePath?: string;
  source: string;
  projectName?: string;
  git?: boolean;
  enableModules?: boolean;
}): Promise<CanonicalImportJson | CanonicalCliFailure> {
  const args = ['import', input.source, '--json'];
  if (input.workspacePath) {
    args.push('--workspace', input.workspacePath);
  }
  if (input.projectName) {
    args.push('--name', input.projectName);
  }
  if (input.git) {
    args.push('--git');
  }
  if (input.enableModules) {
    args.push('--enable-modules');
  }

  await warmRapidkitNpmPackageResolution();

  const result = await run('npx', buildNpxRapidkitArgs(args), {
    cwd: input.workspacePath ?? process.cwd(),
    timeout: 300_000,
  });

  if (result.exitCode !== 0) {
    return {
      success: false,
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  const parsed = parseTrailingJson<CanonicalImportJson>(result.stdout);
  if (!parsed?.importedProject?.path) {
    return {
      success: false,
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout ?? '',
      stderr: parsed?.error ?? 'Import completed without a valid importedProject payload.',
    };
  }

  return parsed;
}

export async function runCanonicalNpmAdopt(input: {
  workspacePath?: string;
  projectPath: string;
  projectName?: string;
  enableModules?: boolean;
}): Promise<CanonicalAdoptJson | CanonicalCliFailure> {
  const args = ['adopt', input.projectPath, '--json'];
  if (input.workspacePath) {
    args.push('--workspace', input.workspacePath);
  }
  if (input.projectName) {
    args.push('--name', input.projectName);
  }
  if (input.enableModules) {
    args.push('--enable-modules');
  }

  await warmRapidkitNpmPackageResolution();

  const result = await run('npx', buildNpxRapidkitArgs(args), {
    cwd: input.projectPath,
    timeout: 120_000,
  });

  if (result.exitCode !== 0) {
    return {
      success: false,
      exitCode: result.exitCode ?? 1,
      stderr: result.stderr ?? '',
      stdout: result.stdout ?? '',
    };
  }

  const parsed = parseTrailingJson<CanonicalAdoptJson>(result.stdout);
  if (!parsed?.adoptedProject?.path) {
    return {
      success: false,
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout ?? '',
      stderr: parsed?.error ?? 'Adopt completed without a valid adoptedProject payload.',
    };
  }

  return parsed;
}

export function isCanonicalCliFailure(
  value: CanonicalImportJson | CanonicalAdoptJson | CanonicalCliFailure
): value is CanonicalCliFailure {
  return 'success' in value && value.success === false;
}

export function describeCanonicalCliFailure(
  action: 'import' | 'adopt',
  failure: CanonicalCliFailure
): string {
  return formatCanonicalCliFailure(action, failure);
}
