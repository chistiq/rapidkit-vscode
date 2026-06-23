import { run } from '../../utils/exec';
import { isIncidentRollbackProtectedPath } from './welcomePanelIncidentPolicy';

export type GitDirtyEntry = {
  path: string;
  untracked: boolean;
};

export type IncidentAutoRollbackRuntimePolicy = {
  approvalMode: 'never' | 'high-risk-only' | 'mutating-only' | 'always';
  requiresManualApproval: boolean;
  approvedByUser: boolean;
  protectedPathPrefixes: string[];
};

export type IncidentAutoRollbackResult = {
  attempted: boolean;
  status: 'succeeded' | 'failed' | 'partial' | 'skipped' | 'unavailable';
  reason?: string;
  attemptedAt: string;
  candidateFiles: string[];
  restoredFiles: string[];
  failedFiles: string[];
  suggestedNextStep?: string;
};

export async function readGitDirtyEntries(workspacePath: string): Promise<GitDirtyEntry[] | null> {
  try {
    const result = await run('git', ['status', '--porcelain'], {
      cwd: workspacePath,
      timeout: 3000,
    });

    if (result.exitCode !== 0) {
      return null;
    }

    if (!result.stdout.trim()) {
      return [];
    }

    const entries: GitDirtyEntry[] = [];
    for (const rawLine of result.stdout.split('\n')) {
      const line = rawLine.trimEnd();
      if (!line || line.length < 4) {
        continue;
      }

      const statusCode = line.slice(0, 2);
      const pathChunk = line.slice(3).trim();
      if (!pathChunk) {
        continue;
      }

      const normalizedPath = pathChunk.includes('->')
        ? pathChunk.split('->').pop()?.trim() || pathChunk
        : pathChunk;

      if (!normalizedPath) {
        continue;
      }

      entries.push({
        path: normalizedPath,
        untracked: statusCode === '??',
      });
    }

    return entries;
  } catch {
    return null;
  }
}

export async function attemptIncidentAutoRollback(
  workspacePath: string,
  baselineEntries: GitDirtyEntry[] | null,
  runtimePolicy?: IncidentAutoRollbackRuntimePolicy
): Promise<IncidentAutoRollbackResult> {
  const attemptedAt = new Date().toISOString();
  const unavailableResult: IncidentAutoRollbackResult = {
    attempted: false,
    status: 'unavailable',
    reason: 'Git rollback is unavailable for this workspace.',
    attemptedAt,
    candidateFiles: [],
    restoredFiles: [],
    failedFiles: [],
    suggestedNextStep: 'Run the verify path manually and inspect workspace state before retry.',
  };

  const afterEntries = await readGitDirtyEntries(workspacePath);
  if (!baselineEntries || !afterEntries) {
    return unavailableResult;
  }

  const baselineSet = new Set(baselineEntries.map((entry) => entry.path));
  const deltaEntries = afterEntries.filter((entry) => !baselineSet.has(entry.path));
  if (deltaEntries.length === 0) {
    return {
      attempted: false,
      status: 'skipped',
      reason: 'No new file mutations were detected for rollback.',
      attemptedAt,
      candidateFiles: [],
      restoredFiles: [],
      failedFiles: [],
    };
  }

  const allCandidateFiles = deltaEntries.map((entry) => entry.path);
  if (runtimePolicy?.requiresManualApproval && !runtimePolicy.approvedByUser) {
    return {
      attempted: false,
      status: 'skipped',
      reason: `Rollback policy (${runtimePolicy.approvalMode}) requires manual approval before auto-restore.`,
      attemptedAt,
      candidateFiles: allCandidateFiles,
      restoredFiles: [],
      failedFiles: allCandidateFiles,
      suggestedNextStep:
        'Approve rollback for this action in the UI or run manual `git restore` for affected files.',
    };
  }

  const trackedCandidates = deltaEntries
    .filter((entry) => !entry.untracked)
    .map((entry) => entry.path);
  const untrackedCandidates = deltaEntries
    .filter((entry) => entry.untracked)
    .map((entry) => entry.path);
  const protectedCandidates = trackedCandidates.filter((candidatePath) =>
    isIncidentRollbackProtectedPath(candidatePath, runtimePolicy?.protectedPathPrefixes ?? [])
  );
  const eligibleTrackedCandidates = trackedCandidates.filter(
    (candidatePath) => !protectedCandidates.includes(candidatePath)
  );

  if (eligibleTrackedCandidates.length === 0 && protectedCandidates.length > 0) {
    return {
      attempted: false,
      status: 'skipped',
      reason: 'All tracked rollback candidates are protected by policy and require manual restore.',
      attemptedAt,
      candidateFiles: allCandidateFiles,
      restoredFiles: [],
      failedFiles: [...protectedCandidates, ...untrackedCandidates],
      suggestedNextStep:
        'Review protected files and run a manual rollback after explicit approval.',
    };
  }

  if (trackedCandidates.length === 0) {
    return {
      attempted: false,
      status: 'skipped',
      reason: 'Only untracked files changed; auto-rollback skipped for safety.',
      attemptedAt,
      candidateFiles: untrackedCandidates,
      restoredFiles: [],
      failedFiles: untrackedCandidates,
      suggestedNextStep:
        'Inspect untracked files and remove manually if safe, then rerun verification.',
    };
  }

  let restoreResult = await run(
    'git',
    ['restore', '--staged', '--worktree', '--', ...eligibleTrackedCandidates],
    {
      cwd: workspacePath,
      timeout: 6000,
    }
  );

  if (restoreResult.exitCode !== 0) {
    restoreResult = await run(
      'git',
      ['restore', '--worktree', '--', ...eligibleTrackedCandidates],
      {
        cwd: workspacePath,
        timeout: 6000,
      }
    );
  }

  const afterRestoreEntries = await readGitDirtyEntries(workspacePath);
  const afterRestoreSet = new Set((afterRestoreEntries || []).map((entry) => entry.path));
  const restoredFiles = eligibleTrackedCandidates.filter(
    (filePath) => !afterRestoreSet.has(filePath)
  );
  const failedTrackedFiles = eligibleTrackedCandidates.filter((filePath) =>
    afterRestoreSet.has(filePath)
  );
  const failedFiles = [...failedTrackedFiles, ...protectedCandidates, ...untrackedCandidates];

  const status: 'succeeded' | 'failed' | 'partial' =
    failedFiles.length === 0 ? 'succeeded' : restoredFiles.length > 0 ? 'partial' : 'failed';

  const reason =
    restoreResult.exitCode !== 0
      ? 'Auto-rollback command exited with errors; some files may need manual restore.'
      : protectedCandidates.length > 0
        ? 'Protected rollback files were skipped and need manual restore approval.'
        : undefined;

  return {
    attempted: true,
    status,
    reason,
    attemptedAt,
    candidateFiles: [...eligibleTrackedCandidates, ...protectedCandidates, ...untrackedCandidates],
    restoredFiles,
    failedFiles,
    suggestedNextStep:
      failedFiles.length > 0
        ? 'Run `git status` and restore remaining files manually before retrying.'
        : undefined,
  };
}
