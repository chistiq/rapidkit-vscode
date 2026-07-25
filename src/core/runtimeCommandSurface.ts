import { run } from '../utils/exec';
import {
  buildRapidkitExecutionSpec,
  warmRapidkitNpmPackageResolution,
} from '../utils/platformCapabilities';
import { parseTrailingJson } from './canonicalProjectLifecycle';

/**
 * Schema version published by `rapidkit commands --json`
 * (the `rapidkit-command-capabilities-v1` surface). The extension consumes this
 * structured surface to detect CLI capabilities instead of regex-parsing
 * `rapidkit --help` text (roadmap item 2.1).
 */
export const COMMAND_CAPABILITIES_SCHEMA_VERSION = 'rapidkit-command-capabilities-v1';

export interface RuntimeCommandSurfaceSnapshot {
  schemaVersion: string;
  cli: string;
  version: string;
  contracts: Record<string, string>;
  /** Top-level command ids advertised by `commands --json` (`commandMap` keys). */
  topLevelCommands: string[];
  /** Runtime project commands advertised by `commands --json` (`commands.projectScoped`). */
  projectScopedCommands: string[];
  /** Core-backed commands advertised by `commands --json` (`commands.coreBacked`). */
  coreBackedCommands: string[];
  /** Full workspace subcommand surface (`workspace.subcommands`). */
  workspaceSubcommands: string[];
  /** Workspace intelligence chain subset (`workspace.intelligenceSubcommands`). */
  workspaceIntelligenceSubcommands: string[];
}

type RawCommandCapabilities = {
  schemaVersion?: unknown;
  cli?: unknown;
  version?: unknown;
  contracts?: unknown;
  commands?: {
    coreBacked?: unknown;
    projectScoped?: unknown;
  };
  commandMap?: unknown;
  workspace?: {
    subcommands?: unknown;
    intelligenceSubcommands?: unknown;
  };
};

const CACHE_TTL_MS = 120_000;

type CacheEntry = {
  expiresAt: number;
  snapshot: RuntimeCommandSurfaceSnapshot;
};

// Keyed by resolved cwd so different workspace folders are probed independently.
const surfaceCache = new Map<string, CacheEntry>();

export function clearRuntimeCommandSurfaceCache(cwd?: string): void {
  if (!cwd) {
    surfaceCache.clear();
    return;
  }
  surfaceCache.delete(cwd);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function normalizeContracts(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string') {
      result[key] = raw;
    }
  }
  return result;
}

function toSnapshot(parsed: RawCommandCapabilities): RuntimeCommandSurfaceSnapshot | null {
  if (parsed.schemaVersion !== COMMAND_CAPABILITIES_SCHEMA_VERSION) {
    return null;
  }
  const commandMap =
    parsed.commandMap && typeof parsed.commandMap === 'object'
      ? Object.keys(parsed.commandMap as Record<string, unknown>)
      : [];

  return {
    schemaVersion: COMMAND_CAPABILITIES_SCHEMA_VERSION,
    cli: typeof parsed.cli === 'string' ? parsed.cli : 'workspai',
    version: typeof parsed.version === 'string' ? parsed.version : '',
    contracts: normalizeContracts(parsed.contracts),
    topLevelCommands: commandMap,
    coreBackedCommands: normalizeStringArray(parsed.commands?.coreBacked),
    projectScopedCommands: normalizeStringArray(parsed.commands?.projectScoped),
    workspaceSubcommands: normalizeStringArray(parsed.workspace?.subcommands),
    workspaceIntelligenceSubcommands: normalizeStringArray(
      parsed.workspace?.intelligenceSubcommands
    ),
  };
}

/**
 * Resolve the runtime command surface from the linked Workspai CLI via
 * `workspai commands --json`. Returns `null` when the CLI cannot be reached,
 * exits non-zero, or does not publish the `rapidkit-command-capabilities-v1`
 * surface (e.g. an older CLI) — callers treat that as "capability unavailable".
 */
export async function fetchRuntimeCommandSurface(options?: {
  cwd?: string;
  forceRefresh?: boolean;
}): Promise<RuntimeCommandSurfaceSnapshot | null> {
  const cwd = options?.cwd ?? process.cwd();

  if (options?.forceRefresh) {
    surfaceCache.delete(cwd);
  } else {
    const cached = surfaceCache.get(cwd);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.snapshot;
    }
  }

  await warmRapidkitNpmPackageResolution();

  try {
    const execution = buildRapidkitExecutionSpec(['commands', '--json']);
    const result = await run(execution.command, execution.args, {
      cwd,
      shell: execution.shell,
      timeout: 20_000,
    });

    if (result.exitCode !== 0) {
      return null;
    }

    const parsed = parseTrailingJson<RawCommandCapabilities>(result.stdout ?? '');
    if (!parsed) {
      return null;
    }

    const snapshot = toSnapshot(parsed);
    if (!snapshot) {
      return null;
    }

    // Only successful resolutions are cached; transient failures retry on the
    // next call instead of pinning the extension to an "unavailable" verdict.
    surfaceCache.set(cwd, { expiresAt: Date.now() + CACHE_TTL_MS, snapshot });
    return snapshot;
  } catch {
    return null;
  }
}
