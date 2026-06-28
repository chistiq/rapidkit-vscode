import contract from '../../contracts/cli-log-event.v1.json';

export type CliLogEventLevel = 'debug' | 'info' | 'warn' | 'error';
export type CliLogEventName = 'log' | 'progress' | 'run.started' | 'run.completed' | 'run.failed';

export type CliLogEvent = {
  schemaVersion: 'cli-log-event-v1';
  runId: string;
  timestamp: string;
  level: CliLogEventLevel;
  event: CliLogEventName;
  component: string;
  message: string;
  command?: string[];
  metadata?: Record<string, unknown>;
};

const schemaVersion = contract.properties.schemaVersion.const;
const eventValues = new Set<string>(contract.properties.event.enum);
const levelValues = new Set<string>(contract.properties.level.enum);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isCliLogEvent(value: unknown): value is CliLogEvent {
  if (!isRecord(value)) {
    return false;
  }

  if (value.schemaVersion !== schemaVersion) {
    return false;
  }

  if (
    typeof value.runId !== 'string' ||
    value.runId.length < 8 ||
    typeof value.timestamp !== 'string' ||
    typeof value.level !== 'string' ||
    typeof value.event !== 'string' ||
    typeof value.component !== 'string' ||
    value.component.length === 0 ||
    typeof value.message !== 'string'
  ) {
    return false;
  }

  if (!levelValues.has(value.level) || !eventValues.has(value.event)) {
    return false;
  }

  if (value.command !== undefined && !isStringArray(value.command)) {
    return false;
  }

  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    return false;
  }

  return true;
}

export function parseCliLogEventLine(line: string): CliLogEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isCliLogEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function shouldRefreshEvidenceForCliLogEvent(event: CliLogEvent): boolean {
  if (event.event !== 'run.completed' && event.event !== 'run.failed') {
    return false;
  }

  const command = event.command?.join(' ') ?? '';
  const component = event.component.toLowerCase();
  return (
    /\bworkspace\s+(model|snapshot|diff|impact|verify|context|agent-sync|explain|trace|sync|run|policy)\b/i.test(
      command
    ) ||
    /\bdoctor\s+workspace\b/i.test(command) ||
    /\b(analyze|readiness|pipeline)\b/i.test(command) ||
    /workspace|doctor|analyze|readiness|pipeline|impact|verify/.test(component)
  );
}
