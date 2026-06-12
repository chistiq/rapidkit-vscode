import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

import { AIActionContract } from './aiActionContract';

const execFileAsync = promisify(execFile);
const PREFLIGHT_TIMEOUT_MS = 1500;
const MAX_GIT_OUTPUT = 12_000;

export interface AIActionFileSnapshot {
  relativePath: string;
  exists: boolean;
  size?: number;
  mtimeMs?: number;
  sha256?: string;
}

export interface AIActionPreflightSnapshot {
  capturedAt: string;
  fingerprint: string;
  gitStatusShort: string;
  gitDiffStat: string;
  files: AIActionFileSnapshot[];
}

export interface AIActionPreflightComparison {
  stale: boolean;
  issues: string[];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computeAIActionFingerprint(contract: AIActionContract): string {
  const payload = {
    schemaVersion: contract.schemaVersion,
    actionType: contract.actionType,
    summary: contract.summary,
    riskLevel: contract.riskLevel,
    affectedFiles: contract.affectedFiles,
    proposedCommands: contract.proposedCommands,
    proposedPatches: contract.proposedPatches.map((patch) => ({
      relativePath: patch.relativePath,
      summary: patch.summary,
      diff: patch.diff,
    })),
    verificationCommands: contract.verificationCommands,
    rollbackPlan: contract.rollbackPlan,
  };
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

async function runGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: PREFLIGHT_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT,
      windowsHide: true,
      encoding: 'utf8',
    });
    return stdout.trim();
  } catch {
    return 'Git context unavailable.';
  }
}

async function snapshotFile(
  workspacePath: string,
  relativePath: string
): Promise<AIActionFileSnapshot> {
  const resolved = path.resolve(workspacePath, relativePath);
  try {
    const [stat, content] = await Promise.all([fs.stat(resolved), fs.readFile(resolved)]);
    return {
      relativePath,
      exists: true,
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    };
  } catch {
    return {
      relativePath,
      exists: false,
    };
  }
}

export async function captureAIActionPreflightSnapshot(
  workspacePath: string,
  contract: AIActionContract
): Promise<AIActionPreflightSnapshot> {
  const touchedFiles = Array.from(
    new Set([
      ...contract.affectedFiles,
      ...contract.proposedPatches.map((patch) => patch.relativePath),
    ])
  ).sort();

  const [gitStatusShort, gitDiffStat, files] = await Promise.all([
    runGit(['status', '--short'], workspacePath),
    runGit(['diff', '--stat', 'HEAD'], workspacePath),
    Promise.all(touchedFiles.map((file) => snapshotFile(workspacePath, file))),
  ]);

  return {
    capturedAt: new Date().toISOString(),
    fingerprint: computeAIActionFingerprint(contract),
    gitStatusShort,
    gitDiffStat,
    files,
  };
}

export function compareAIActionPreflightSnapshots(
  baseline: AIActionPreflightSnapshot | undefined,
  current: AIActionPreflightSnapshot
): AIActionPreflightComparison {
  if (!baseline) {
    return {
      stale: true,
      issues: ['Missing baseline preflight snapshot.'],
    };
  }

  const issues: string[] = [];
  if (baseline.fingerprint !== current.fingerprint) {
    issues.push('Action fingerprint changed.');
  }

  const currentByPath = new Map(current.files.map((file) => [file.relativePath, file]));
  for (const before of baseline.files) {
    const after = currentByPath.get(before.relativePath);
    if (!after) {
      issues.push(`Affected file missing from current snapshot: ${before.relativePath}`);
      continue;
    }
    if (before.exists !== after.exists) {
      issues.push(`Affected file existence changed: ${before.relativePath}`);
      continue;
    }
    if (before.sha256 !== after.sha256 || before.size !== after.size) {
      issues.push(`Affected file changed since review: ${before.relativePath}`);
    }
  }

  return {
    stale: issues.length > 0,
    issues,
  };
}
