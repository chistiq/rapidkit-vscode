import { parseCliLogEventLine, type CliLogEvent } from './cliLogEventContract';

/**
 * Incremental line buffer that turns a chunked stderr byte stream into parsed
 * `cli-log-event.v1` events. The RapidKit CLI emits one NDJSON event per line on
 * stderr; chunks arrive at arbitrary boundaries, so we buffer partial lines and
 * only parse complete ones. Non-event lines (plain text, blank lines) are
 * ignored. This is the consumption side of roadmap item 2.2 — the extension
 * reads real progress + a definitive result from the structured stream instead
 * of scraping terminal text.
 */
export class CliLogEventStreamParser {
  private buffer = '';

  /**
   * Feed a stdout/stderr chunk; returns every complete `cli-log-event.v1` event
   * decoded since the previous call.
   */
  push(chunk: string): CliLogEvent[] {
    this.buffer += chunk;

    const events: CliLogEvent[] = [];
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const event = parseCliLogEventLine(line);
      if (event) {
        events.push(event);
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
    return events;
  }

  /**
   * Drain any trailing buffered line (a final event not terminated by a
   * newline). Call once after the process exits.
   */
  flush(): CliLogEvent[] {
    const remainder = this.buffer;
    this.buffer = '';
    if (!remainder.trim()) {
      return [];
    }
    const event = parseCliLogEventLine(remainder);
    return event ? [event] : [];
  }
}

/** True for lifecycle terminal events that carry the run's definitive verdict. */
export function isRunLifecycleEvent(event: CliLogEvent): boolean {
  return event.event === 'run.completed' || event.event === 'run.failed';
}

/** True for events that should advance a progress UI. */
export function isProgressEvent(event: CliLogEvent): boolean {
  return event.event === 'progress' || event.event === 'run.started';
}
