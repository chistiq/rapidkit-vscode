import contract from './create-planner-capabilities.v1.json';

export type CreatePlannerLane = 'native' | 'official' | 'existing';

export type CreatePlannerStatus = 'available' | 'planned';

export type CreatePlannerCapability = {
  lane: CreatePlannerLane;
  status: CreatePlannerStatus;
  canExecuteCreate: boolean;
  requested: string;
  resolved?: string;
  officialCommands?: string[];
  fallbackLane?: 'existing';
  reason: string;
};

type OfficialCreateCandidate = {
  id: string;
  aliases: string[];
  ecosystem: string;
  status: CreatePlannerStatus;
  canExecuteCreate: boolean;
  officialCommands: string[];
  adoptAfterCreate: true;
};

const nativeKitIds = new Set(contract.nativeCreate.map((entry) => entry.id.toLowerCase()));
const officialCandidates = contract.officialCreate as OfficialCreateCandidate[];
const officialByAlias = new Map<string, OfficialCreateCandidate>();
for (const candidate of officialCandidates) {
  officialByAlias.set(candidate.id.toLowerCase(), candidate);
  for (const alias of candidate.aliases) {
    officialByAlias.set(alias.toLowerCase(), candidate);
  }
}
const existingRuntimeSignals = new Set(
  contract.existingRuntimeSignals.map((entry) => entry.toLowerCase())
);

function normalizeSignal(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsSignal(text: string, signal: string): boolean {
  const normalized = normalizeSignal(signal);
  if (!normalized) {
    return false;
  }

  const escaped = escapeRegExp(normalized);
  if (/^[a-z0-9.+#-]+$/.test(normalized)) {
    return new RegExp(`(^|[^a-z0-9.+#-])${escaped}([^a-z0-9.+#-]|$)`, 'i').test(text);
  }

  return text.includes(normalized);
}

export function resolveCreatePlannerCapability(input: {
  kitId?: string;
  framework?: string;
  runtime?: string;
  projectExists?: boolean;
}): CreatePlannerCapability {
  const requested =
    normalizeSignal(input.kitId) ??
    normalizeSignal(input.framework) ??
    normalizeSignal(input.runtime) ??
    'unknown';

  if (input.projectExists) {
    return {
      lane: 'existing',
      status: 'available',
      canExecuteCreate: false,
      requested,
      reason: 'Existing projects enter Workspace Intelligence through adopt/import.',
    };
  }

  const kitId = normalizeSignal(input.kitId);
  if (kitId && nativeKitIds.has(kitId)) {
    return {
      lane: 'native',
      status: 'available',
      canExecuteCreate: true,
      requested,
      resolved: kitId,
      reason:
        'Workspai owns the create contract, project marker, registry, doctor, and workspace model path.',
    };
  }

  const official =
    officialByAlias.get(requested) ??
    officialByAlias.get(normalizeSignal(input.framework) ?? '') ??
    officialByAlias.get(normalizeSignal(input.runtime) ?? '');
  if (official) {
    return {
      lane: 'official',
      status: official.status,
      canExecuteCreate: official.canExecuteCreate,
      requested,
      resolved: official.id,
      officialCommands: [...official.officialCommands],
      fallbackLane: official.canExecuteCreate ? undefined : 'existing',
      reason:
        official.status === 'available'
          ? 'Workspai runs the official ecosystem generator, then registers the project in Workspace Intelligence.'
          : 'Official generator support is planned but not enabled; use adopt/import until Workspai owns the post-create contract.',
    };
  }

  const runtime = normalizeSignal(input.runtime);
  if (runtime && existingRuntimeSignals.has(runtime)) {
    return {
      lane: 'existing',
      status: 'available',
      canExecuteCreate: false,
      requested,
      resolved: runtime,
      reason:
        'Runtime can be governed through Workspace Intelligence, but native create is not supported.',
    };
  }

  return {
    lane: 'existing',
    status: 'available',
    canExecuteCreate: false,
    requested,
    reason:
      'No native create contract is available; use adopt/import to enter Workspace Intelligence.',
  };
}

export function resolveCreateCapabilityFromPrompt(
  prompt: string,
  frameworkHint?: string
): CreatePlannerCapability | undefined {
  const text = `${prompt} ${frameworkHint ?? ''}`.toLowerCase();

  for (const candidate of officialCandidates) {
    if (candidate.aliases.some((alias) => containsSignal(text, alias))) {
      return resolveCreatePlannerCapability({ framework: candidate.id });
    }
  }

  for (const runtime of existingRuntimeSignals) {
    if (containsSignal(text, runtime)) {
      return resolveCreatePlannerCapability({ runtime });
    }
  }

  return undefined;
}

export const CREATE_PLANNER_CAPABILITIES_SCHEMA_VERSION = contract.schemaVersion;
export const CREATE_PLANNER_CAPABILITIES_CONTRACT = contract;
