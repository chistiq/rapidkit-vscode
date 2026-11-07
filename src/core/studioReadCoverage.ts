import { createHash } from 'node:crypto';
import path from 'node:path';
import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';

type Range = [number, number];
type Coverage = {
  path: string;
  unit: 'lines' | 'bytes';
  hash: string;
  ranges: Range[];
  reads: number;
  repeatedUnits: number;
  sequence: number;
  requestId: string;
};
export type StudioReadCoverage = {
  schemaVersion: 'workspai.studio-read-coverage.v1';
  scope: string;
  requestId: string;
  files: Coverage[];
  logicalReads: number;
  overlappingReads: number;
  readsWithoutNewCoverage: number;
  newUnits: number;
  updatedSequence: number;
  /** An effect may have changed disk; retain history but require fresh source observations. */
  uncertainSinceSequence?: number;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const units = (ranges: Range[]) =>
  ranges.reduce((total, [start, end]) => total + end - start + 1, 0);
function union(ranges: Range[]): Range[] {
  const merged: Range[] = [];
  for (const range of ranges.sort((a, b) => a[0] - b[0])) {
    const prior = merged.at(-1);
    if (prior && range[0] <= prior[1] + 1) {
      prior[1] = Math.max(prior[1], range[1]);
    } else {
      merged.push([...range]);
    }
  }
  // Dropping old fragments only underestimates coverage, never invents a read.
  return merged.slice(-32);
}
function scope(session: StudioAgentPersistedSession) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        session.executionTarget?.workspacePath ?? session.workspacePath,
        session.executionTarget ? null : (session.projectPath ?? null),
      ])
    )
    .digest('hex');
}
function normalize(value: string) {
  return path.posix.normalize(value.replace(/\\/g, '/')).slice(0, 2_000);
}

export function studioSourceReadEffect(
  tool: string,
  result: StudioAgentToolResult
): 'changed' | 'uncertain' | 'unchanged' {
  const output = record(result.output);
  if (output.observedSourceChange === true) {
    return 'changed';
  }
  if (
    result.changed !== true ||
    record(output.effects).source === false ||
    output.observedSourceChange === false
  ) {
    return 'unchanged';
  }
  return ['start-terminal', 'send-terminal-input', 'stop-terminal', 'onboard-project'].includes(
    tool
  )
    ? 'uncertain'
    : 'changed';
}

/** Metadata about returned previews; never a source cache, approval or current-disk authority. */
export function rememberStudioReadCoverage(
  session: StudioAgentPersistedSession,
  input: {
    toolName: string;
    toolInput: unknown;
    result: StudioAgentToolResult;
    requestId: string;
    sequence: number;
  }
) {
  const identity = scope(session);
  let state = session.readCoverage;
  if (!state || state.scope !== identity) {
    state = {
      schemaVersion: 'workspai.studio-read-coverage.v1',
      scope: identity,
      requestId: input.requestId,
      files: [],
      logicalReads: 0,
      overlappingReads: 0,
      readsWithoutNewCoverage: 0,
      newUnits: 0,
      updatedSequence: input.sequence,
    };
  } else if (state.requestId !== input.requestId) {
    state = {
      ...state,
      requestId: input.requestId,
      logicalReads: 0,
      overlappingReads: 0,
      readsWithoutNewCoverage: 0,
      newUnits: 0,
    };
  }
  const output = record(input.result.output);
  const sourceEffect = studioSourceReadEffect(input.toolName, input.result);
  const sourceChanged = sourceEffect === 'changed';
  if (sourceChanged) {
    const paths = Array.isArray(output.changedPaths) ? output.changedPaths : [];
    const changed = new Set(
      paths.filter((value): value is string => typeof value === 'string').map(normalize)
    );
    state.files = changed.size
      ? state.files.filter(
          (entry) => !changed.has(entry.path.replace(/^(?:workspace|project):/, ''))
        )
      : [];
    state.logicalReads = 0;
    state.overlappingReads = 0;
    state.newUnits = 0;
    state.readsWithoutNewCoverage = 0;
  } else if (sourceEffect === 'uncertain') {
    state.uncertainSinceSequence = input.sequence;
  }
  let added = 0,
    repeated = 0,
    count = 0;
  const observe = (raw: unknown, unit: Coverage['unit']) => {
    const file = record(raw);
    const name = unit === 'bytes' ? file.locator : file.path;
    const hash = unit === 'bytes' ? file.contentSha256 : file.sha256;
    if (
      typeof name !== 'string' ||
      typeof hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(hash) ||
      file.exists === false ||
      typeof file.content !== 'string'
    ) {
      return;
    }
    const start = unit === 'bytes' ? file.offset : file.lineStart;
    const end =
      unit === 'bytes' ? Number(file.offset) + Number(file.consumedBytes) - 1 : file.lineEnd;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      (start as number) < (unit === 'bytes' ? 0 : 1) ||
      (end as number) < (start as number)
    ) {
      return;
    }
    const key = normalize(name);
    // Instruction hashes describe one exact byte page; source hashes describe the whole file.
    const priorIndex = state!.files.findIndex(
      (entry) =>
        entry.path === key &&
        entry.unit === unit &&
        (unit !== 'bytes' || entry.ranges[0]?.[0] === start)
    );
    const prior = state!.files[priorIndex];
    const old = prior?.hash === hash ? prior.ranges : [];
    const interval: Range = [start as number, end as number];
    const overlap = old.reduce(
      (total, [a, b]) =>
        total + Math.max(0, Math.min(b, interval[1]) - Math.max(a, interval[0]) + 1),
      0
    );
    const extra = interval[1] - interval[0] + 1 - overlap;
    const entry: Coverage = {
      path: key,
      unit,
      hash,
      ranges: union([...old, interval]),
      reads: (prior?.hash === hash ? prior.reads : 0) + 1,
      repeatedUnits: (prior?.hash === hash ? prior.repeatedUnits : 0) + overlap,
      sequence: input.sequence,
      requestId: input.requestId,
    };
    if (priorIndex >= 0) {
      state!.files.splice(priorIndex, 1);
    }
    state!.files.push(entry);
    added += extra;
    repeated += overlap;
    count++;
  };
  const sources = (value: unknown, depth = 0): void => {
    if (depth > 8) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => sources(entry, depth + 1));
      return;
    }
    const node = record(value);
    if (typeof node.path === 'string' && typeof node.content === 'string') {
      observe(node, 'lines');
    } else if (Array.isArray(node.files)) {
      sources(node.files, depth + 1);
    }
  };
  if (input.toolName === 'inspect-workspace-batch' && Array.isArray(output.results)) {
    for (const raw of output.results) {
      const row = record(raw),
        result = record(row.result);
      if (row.kind === 'source') {
        const before = count;
        sources(result.output);
        if (before === count) {
          count++;
        }
      } else {
        count++;
      }
    }
  } else if (input.toolName === 'inspect-source') {
    sources(input.result.output);
    if (!count) {
      count++;
    }
  } else if (input.toolName === 'inspect-agent-instructions') {
    for (const doc of Array.isArray(output.documents) ? output.documents : []) {
      observe(doc, 'bytes');
    }
    if (!count) {
      count++;
    }
  } else if (input.toolName === 'onboard-project' && input.result.ok) {
    const instructions = record(record(output.refreshedInstructions).output);
    // Ownership operations refresh instructions; old instruction pages may be stale.
    state.files = state.files.filter((entry) => entry.unit !== 'bytes');
    for (const doc of Array.isArray(instructions.documents) ? instructions.documents : []) {
      observe(doc, 'bytes');
    }
  } else if (/^(?:inspect-|discover-|query-|search-|fetch-|read-terminal)/.test(input.toolName)) {
    count++;
  }
  state.files = state.files.slice(-64);
  state.logicalReads += count;
  state.overlappingReads += repeated > 0 ? 1 : 0;
  state.readsWithoutNewCoverage =
    added > 0 || sourceChanged || input.toolName === 'run-workspace-command'
      ? 0
      : state.readsWithoutNewCoverage + count;
  state.newUnits += added;
  state.updatedSequence = input.sequence;
  session.readCoverage = state;
}

export function studioReadCoverageFeedback(session: StudioAgentPersistedSession) {
  const state = session.readCoverage;
  if (!state || state.scope !== scope(session)) {
    return undefined;
  }
  return {
    pendingOutcomes: session.taskLedger?.steps
      .filter((step) => step.status !== 'completed')
      .map((step) => ({ id: step.id, description: step.description, status: step.status })),
    unresolvedReview: session.requirementReview?.filter((entry) => entry.status === 'unresolved'),
    logicalReads: state.logicalReads,
    overlappingReads: state.overlappingReads,
    readsWithoutNewCoverage: state.readsWithoutNewCoverage,
    files: state.files.slice(-8).map((entry) => ({
      path: entry.path,
      unit: entry.unit,
      sha256: entry.hash,
      ranges: entry.ranges,
      reads: entry.reads,
      returnedUnits: units(entry.ranges),
      sequence: entry.sequence,
      historical: entry.requestId !== state.requestId,
      requiresFreshObservation: entry.sequence < (state.uncertainSinceSequence ?? 0),
    })),
    instruction:
      'Ranges identify preview bytes/lines already returned for the observed hash, not current filesystem validation. New hashes replace old source coverage; mutations invalidate affected paths. Operation IDs, batching and target-file choices do not make the same returned source new. Use exact nextRead/nextReads for missing content. Finish open outcomes with any applicable tool; reread for changed input or missing details. No tool is disabled and no edit or completion is forced.',
  };
}
