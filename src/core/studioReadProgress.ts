import type { StudioAgentPersistedSession } from './studioAgentEvents.js';

/** Feedback, not a stop gate or a cache: every chosen read still observes current state. */
export function studioReadProgress(session: StudioAgentPersistedSession) {
  const start =
    [...session.events].reverse().find((event) => event.type === 'request.started')?.sequence ?? 0;
  const counts = new Map<string, { tool: string; count: number; lastSequence: number }>();
  let readsSinceChange = 0;
  for (const event of session.events) {
    if (event.sequence <= start || !['tool.completed', 'tool.failed'].includes(event.type)) {
      continue;
    }
    if (event.data.changed === true) {
      counts.clear();
      readsSinceChange = 0;
      continue;
    }
    const tool = String(event.data.toolName ?? '');
    if (!/^(?:inspect-|discover-|query-|search-|fetch-|read-terminal)/.test(tool)) {
      continue;
    }
    readsSinceChange += 1;
    const key = JSON.stringify([tool, event.data.input]);
    const prior = counts.get(key);
    counts.set(key, { tool, count: (prior?.count ?? 0) + 1, lastSequence: event.sequence });
  }
  const repeated = [...counts.values()]
    .filter((entry) => entry.count > 1)
    .sort((a, b) => b.lastSequence - a.lastSequence)
    .slice(0, 4);
  if (!repeated.length && readsSinceChange < 10) {
    return undefined;
  }
  return {
    readsSinceChange,
    repeated,
    instruction:
      'Repeated inspection is not task progress. Reuse successful current observations; re-read when content, scope, freshness or a missing detail requires it. Resolve the concrete prerequisite, choose another applicable tool, implement the requested behavior, or answer when sufficient. Missing dependency docs: inspect-project-docs provides installation/vendor alternatives. Workspai evidence: inspect-evidence discovers current locators. No tool is disabled by this feedback; do not fabricate completion or edit merely to reset it.',
  };
}
