import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import { studioReadCoverageFeedback, studioSourceReadEffect } from './studioReadCoverage.js';
import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';

function canonicalInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalInput);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalInput(entry)])
    );
  }
  return value;
}

/** Feedback, not a stop gate or a cache: every chosen read still observes current state. */
export function studioReadProgress(session: StudioAgentPersistedSession) {
  const coverage = studioReadCoverageFeedback(session);
  const start =
    [...session.events].reverse().find((event) => event.type === 'request.started')?.sequence ?? 0;
  const counts = new Map<
    string,
    { tool: string; input: unknown; count: number; lastSequence: number }
  >();
  let readsSinceChange = 0;
  for (const event of session.events) {
    if (event.sequence > start && event.type === 'workspace.target.bound') {
      counts.clear();
      readsSinceChange = 0;
      continue;
    }
    if (event.sequence <= start || !['tool.completed', 'tool.failed'].includes(event.type)) {
      continue;
    }
    if (
      studioSourceReadEffect(
        String(event.data.toolName ?? ''),
        event.data as StudioAgentToolResult
      ) === 'changed'
    ) {
      counts.clear();
      readsSinceChange = 0;
      continue;
    }
    const tool = String(event.data.toolName ?? '');
    if (!/^(?:inspect-|discover-|query-|search-|fetch-|read-terminal)/.test(tool)) {
      continue;
    }
    readsSinceChange += 1;
    const input = canonicalInput(event.data.input);
    const key = JSON.stringify([tool, input]);
    const prior = counts.get(key);
    counts.set(key, { tool, input, count: (prior?.count ?? 0) + 1, lastSequence: event.sequence });
  }
  const repeated = [...counts.values()]
    .filter((entry) => entry.count > 1)
    .sort((a, b) => b.lastSequence - a.lastSequence)
    .slice(0, 4);
  if (
    !repeated.length &&
    readsSinceChange < 10 &&
    (coverage?.logicalReads ?? 0) < 10 &&
    (coverage?.overlappingReads ?? 0) < 2
  ) {
    return undefined;
  }
  return {
    readsSinceChange,
    logicalReads: coverage?.logicalReads,
    overlappingReads: coverage?.overlappingReads,
    readsWithoutNewCoverage: coverage?.readsWithoutNewCoverage,
    repeated,
    instruction:
      'Repeated inspection is not task progress. Reuse successful current observations; re-read when content, scope, freshness or a missing detail requires it. Resolve the concrete prerequisite, choose another applicable tool, implement the requested behavior, or answer when sufficient. Missing dependency docs: inspect-project-docs provides installation/vendor alternatives. Workspai evidence: inspect-evidence discovers current locators. No tool is disabled by this feedback; do not fabricate completion or edit merely to reset it.',
  };
}

/** Receipt references for reuse, not a cache or authority to skip a fresh read/check. */
export function studioObservationReuse(session: StudioAgentPersistedSession) {
  const start =
    [...session.events].reverse().find((event) => event.type === 'request.started')?.sequence ?? 0;
  const observations = new Map<string, { tool: string; input: unknown; sequence: number }>();
  const checks = new Map<
    string,
    { input: unknown; sequence: number; sourceFingerprint: string; exitCode: number }
  >();
  let sourceFingerprint: string | undefined;
  for (const event of session.events) {
    if (event.sequence <= start) {
      continue;
    }
    if (event.type === 'workspace.target.bound' || event.data.changed === true) {
      observations.clear();
      checks.clear();
      sourceFingerprint = undefined;
    }
    if (!['tool.completed', 'tool.failed'].includes(event.type)) {
      continue;
    }
    const tool = String(event.data.toolName ?? '');
    const input = canonicalInput(event.data.input);
    const output = event.data.output as Record<string, unknown> | undefined;
    const succeeded = event.type === 'tool.completed' && event.data.ok === true;
    if (input !== undefined && /^(?:inspect-|discover-|query-|search-)/.test(tool)) {
      const key = JSON.stringify([tool, input]);
      observations.delete(key);
      if (succeeded) {
        observations.set(key, { tool, input, sequence: event.sequence });
      }
    }
    if (tool === 'run-workspace-command') {
      checks.delete(JSON.stringify(input));
      if (typeof output?.sourceFingerprint === 'string') {
        if (sourceFingerprint && sourceFingerprint !== output.sourceFingerprint) {
          checks.clear();
          observations.clear();
        }
        sourceFingerprint = output.sourceFingerprint;
      }
    }
    if (
      tool === 'run-workspace-command' &&
      succeeded &&
      output &&
      output.exitCode === 0 &&
      output.timedOut !== true &&
      output.executed !== false &&
      output.mutatesSource !== true &&
      output.externalSideEffects !== true &&
      output.repositoryMetadataEffects !== true &&
      output.observedSourceChange !== true &&
      !output.rollback &&
      (output.sourceRecovery as { state?: string } | undefined)?.state !== 'restored' &&
      typeof output.sourceFingerprint === 'string' &&
      /^[a-f0-9]{64}$/.test(output.sourceFingerprint)
    ) {
      const key = JSON.stringify(input);
      checks.delete(key);
      checks.set(key, {
        input,
        sequence: event.sequence,
        sourceFingerprint: output.sourceFingerprint,
        exitCode: 0,
      });
    }
  }
  if (!observations.size && !checks.size) {
    return undefined;
  }
  return {
    observations: [...observations.values()].slice(-5),
    successfulCommands: [...checks.values()].slice(-4),
    instruction:
      'References to observations already returned in this request, not fresh filesystem/cache validation. Reuse their actual results when still applicable; finish returned paging rather than restart the prefix. Do not repeat a successful command with unchanged relevant source, environment and toolchain merely to add another verification step. Re-read or rerun when source, scope, dependencies, environment, freshness or a missing detail requires it; external changes may occur without a model edit. No tool is disabled, no result is fabricated and no requested behavior is proven by these references alone.',
  };
}
