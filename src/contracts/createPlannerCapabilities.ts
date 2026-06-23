import contract from './create-planner-capabilities.v1.json';

export type CreatePlannerLane = 'native-create' | 'external-create-adopt' | 'adopt-only';

export type CreatePlannerStatus = 'available' | 'planned';

export type CreatePlannerCapability = {
  lane: CreatePlannerLane;
  status: CreatePlannerStatus;
  canExecuteCreate: boolean;
  requested: string;
  resolved?: string;
  officialCommands?: string[];
  fallbackLane?: 'adopt-only';
  reason: string;
};

type ExternalCreateAdoptCandidate = {
  id: string;
  aliases: string[];
  ecosystem: string;
  status: 'planned';
  officialCommands: string[];
  adoptAfterCreate: true;
};

const nativeKitIds = new Set(contract.nativeCreate.map((entry) => entry.id.toLowerCase()));
const externalCandidates = contract.externalCreateAdopt as ExternalCreateAdoptCandidate[];
const externalByAlias = new Map<string, ExternalCreateAdoptCandidate>();
for (const candidate of externalCandidates) {
  externalByAlias.set(candidate.id.toLowerCase(), candidate);
  for (const alias of candidate.aliases) {
    externalByAlias.set(alias.toLowerCase(), candidate);
  }
}
const adoptOnlyRuntimes = new Set(contract.adoptOnlyRuntimes.map((entry) => entry.toLowerCase()));

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
      lane: 'adopt-only',
      status: 'available',
      canExecuteCreate: false,
      requested,
      reason: 'Existing projects enter Workspace Intelligence through adopt/import.',
    };
  }

  const kitId = normalizeSignal(input.kitId);
  if (kitId && nativeKitIds.has(kitId)) {
    return {
      lane: 'native-create',
      status: 'available',
      canExecuteCreate: true,
      requested,
      resolved: kitId,
      reason:
        'RapidKit owns the create contract, project marker, registry, doctor, and workspace model path.',
    };
  }

  const external =
    externalByAlias.get(requested) ??
    externalByAlias.get(normalizeSignal(input.framework) ?? '') ??
    externalByAlias.get(normalizeSignal(input.runtime) ?? '');
  if (external) {
    return {
      lane: 'external-create-adopt',
      status: 'planned',
      canExecuteCreate: false,
      requested,
      resolved: external.id,
      officialCommands: [...external.officialCommands],
      fallbackLane: 'adopt-only',
      reason:
        'External generator support is planned but not enabled; use adopt/import until RapidKit owns the post-create contract.',
    };
  }

  const runtime = normalizeSignal(input.runtime);
  if (runtime && adoptOnlyRuntimes.has(runtime)) {
    return {
      lane: 'adopt-only',
      status: 'available',
      canExecuteCreate: false,
      requested,
      resolved: runtime,
      reason:
        'Runtime can be governed through Workspace Intelligence, but native create is not supported.',
    };
  }

  return {
    lane: 'adopt-only',
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

  for (const candidate of externalCandidates) {
    if (candidate.aliases.some((alias) => containsSignal(text, alias))) {
      return resolveCreatePlannerCapability({ framework: candidate.id });
    }
  }

  for (const runtime of adoptOnlyRuntimes) {
    if (containsSignal(text, runtime)) {
      return resolveCreatePlannerCapability({ runtime });
    }
  }

  return undefined;
}

export const CREATE_PLANNER_CAPABILITIES_SCHEMA_VERSION = contract.schemaVersion;
export const CREATE_PLANNER_CAPABILITIES_CONTRACT = contract;
