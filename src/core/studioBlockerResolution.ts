import type {
  BlockerResolutionClass,
  BlockerResolution,
} from '../contracts/blocker-resolution-contract.js';
import type {
  StudioBlockerExecutionMode,
  StudioBlockerHandoff,
} from '../contracts/studio-blocker-handoff-contract.js';
import { normalizeBlockerResolutionClass } from '../contracts/blocker-resolution-contract.js';

export type ResolveBlockerResolutionClassInput = {
  handoff: Pick<
    StudioBlockerHandoff,
    | 'blockers'
    | 'blockerSignature'
    | 'commandRunCount'
    | 'resolutionClass'
    | 'resolutionHints'
    | 'sourceCommand'
    | 'cardStatus'
  >;
  onDiskHints?: BlockerResolution[];
};

export function resolveBlockerResolutionClass(
  input: ResolveBlockerResolutionClassInput
): StudioBlockerExecutionMode {
  const commandRunCount = Math.max(0, input.handoff.commandRunCount ?? 0);
  const primaryHint = input.onDiskHints?.[0] ?? input.handoff.resolutionHints?.[0] ?? undefined;
  const resolutionClass =
    normalizeBlockerResolutionClass(primaryHint?.resolutionClass) ??
    normalizeBlockerResolutionClass(input.handoff.resolutionClass) ??
    inferResolutionClassFromBlockers(input.handoff.blockers);

  if (input.handoff.cardStatus === 'pass') {
    return 'VERIFY_ONLY';
  }

  if (resolutionClass === 'unresolvable-without-human') {
    return 'EXPLAIN';
  }

  if (resolutionClass === 'semantic-attention') {
    return commandRunCount >= 1 ? 'FIX' : 'EXPLAIN';
  }

  if (resolutionClass === 'artifact-missing') {
    if (commandRunCount >= 1) {
      return 'FIX';
    }
    return 'RUN_ONCE';
  }

  if (commandRunCount >= 1) {
    return 'FIX';
  }

  if (resolutionClass === 'command-failed-repeat' || resolutionClass === 'config-fixable') {
    return 'FIX';
  }

  return resolutionClass === 'artifact-missing' ? 'RUN_ONCE' : 'FIX';
}

function inferResolutionClassFromBlockers(blockers: string[]): BlockerResolutionClass {
  if (!blockers.length) {
    return 'unresolvable-without-human';
  }
  const joined = blockers.join(' ').toLowerCase();
  if (joined.includes('missing')) {
    return 'artifact-missing';
  }
  if (joined.includes('impact') || joined.includes('untracked')) {
    return 'semantic-attention';
  }
  if (joined.includes('policy') || joined.includes('contract')) {
    return 'config-fixable';
  }
  return 'command-failed-repeat';
}

export function shouldForbidSourceCommandRerun(input: {
  mode: StudioBlockerExecutionMode;
  commandRunCount: number;
  blockerSignature: string;
  priorSignature?: string | null;
}): boolean {
  if (input.mode === 'RUN_ONCE' && input.commandRunCount === 0) {
    return false;
  }
  if (input.commandRunCount >= 1 && input.priorSignature === input.blockerSignature) {
    return true;
  }
  return input.mode === 'FIX' || input.mode === 'EXPLAIN' || input.mode === 'VERIFY_ONLY';
}

/** Exact governed producers for a first-pass missing-artifact recovery. */
export function resolveStudioRunOnceProducerCommands(
  handoff: Pick<StudioBlockerHandoff, 'studioMode' | 'resolutionHints'>
): string[] {
  if (handoff.studioMode !== 'RUN_ONCE') {
    return [];
  }
  return [
    ...new Set(
      (handoff.resolutionHints ?? [])
        .filter((hint) => hint.resolutionClass === 'artifact-missing')
        .map((hint) => hint.sourceCommand?.trim())
        .filter((command): command is string => Boolean(command))
    ),
  ].slice(0, 8);
}
