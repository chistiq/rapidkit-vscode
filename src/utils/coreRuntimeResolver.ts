import * as fs from 'fs-extra';
import * as path from 'path';
import { run } from './exec';
import { getWorkspaceVenvRapidkitCandidates } from './platformCapabilities';

export type CoreRuntimeLocation = 'workspace' | 'global' | 'npx';

export type CoreRuntimeResolution = {
  workspacePath?: string;
  executable: string | null;
  version?: string;
  location: CoreRuntimeLocation;
};

const VERSION_PATTERN = /v?([\d.]+(?:rc\d+)?(?:a\d+)?(?:b\d+)?)/;

function parseVersion(stdout: string): string | undefined {
  const match = stdout.match(VERSION_PATTERN);
  return match?.[1];
}

async function readExecutableVersion(executable: string, cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await run(executable, ['--version'], {
      cwd,
      stdio: 'pipe',
      timeout: 8000,
    });
    return parseVersion(stdout);
  } catch {
    return undefined;
  }
}

/**
 * Walk upward to find the RapidKit workspace root (.venv and/or .rapidkit/workspace.json).
 */
export async function resolveCatalogWorkspaceRoot(startPath?: string): Promise<string | undefined> {
  if (!startPath) {
    return undefined;
  }

  let current = path.resolve(startPath);
  for (let depth = 0; depth < 6; depth += 1) {
    const hasVenv = getWorkspaceVenvRapidkitCandidates(current).some((candidate) =>
      fs.pathExistsSync(candidate)
    );
    const hasWorkspaceMarker = fs.pathExistsSync(path.join(current, '.rapidkit', 'workspace.json'));

    if (hasVenv || hasWorkspaceMarker) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return path.resolve(startPath);
}

async function resolveWorkspaceVenvRuntime(
  workspacePath: string
): Promise<CoreRuntimeResolution | null> {
  for (const executable of getWorkspaceVenvRapidkitCandidates(workspacePath)) {
    if (!(await fs.pathExists(executable))) {
      continue;
    }

    const version = await readExecutableVersion(executable, workspacePath);
    if (version) {
      return {
        workspacePath,
        executable,
        version,
        location: 'workspace',
      };
    }
  }

  return null;
}

async function resolveGlobalRuntime(cwd: string): Promise<CoreRuntimeResolution | null> {
  try {
    const { stdout } = await run('rapidkit', ['--version'], {
      cwd,
      stdio: 'pipe',
      timeout: 8000,
    });
    const version = parseVersion(stdout);
    if (!version) {
      return null;
    }
    return {
      workspacePath: cwd,
      executable: 'rapidkit',
      version,
      location: 'global',
    };
  } catch {
    return null;
  }
}

/**
 * Enterprise runtime resolution for catalog/evidence commands:
 * 1) workspace .venv rapidkit-core
 * 2) global rapidkit binary
 * 3) npx fallback (version unknown until command runs)
 */
export async function resolveCoreRuntime(startPath?: string): Promise<CoreRuntimeResolution> {
  const workspacePath = await resolveCatalogWorkspaceRoot(startPath);
  const cwd = workspacePath || startPath || process.cwd();

  if (workspacePath) {
    const workspaceRuntime = await resolveWorkspaceVenvRuntime(workspacePath);
    if (workspaceRuntime) {
      return workspaceRuntime;
    }
  }

  const globalRuntime = await resolveGlobalRuntime(cwd);
  if (globalRuntime) {
    return {
      ...globalRuntime,
      workspacePath: workspacePath || cwd,
    };
  }

  return {
    workspacePath: workspacePath || startPath,
    executable: null,
    location: 'npx',
  };
}

export function coreRuntimeCacheKey(runtime: CoreRuntimeResolution): string {
  const version = runtime.version || 'unknown';
  return `${runtime.location}:${version}`;
}
