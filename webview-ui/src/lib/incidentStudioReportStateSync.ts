import type { IncidentStudioState } from '@/components/StudioRedesign/state/studioState';

export function buildReportBackedStateRevision(
  partial?: Partial<IncidentStudioState> | null
): string {
  if (!partial) {
    return '';
  }
  const evidence = partial.studioEvidence;
  const gates = partial.policyGates;
  return [
    evidence?.generatedAt ?? '',
    evidence?.verdict ?? '',
    String(partial.health?.modulesOk ?? ''),
    String(partial.health?.modulesWarning ?? ''),
    String(partial.health?.modulesError ?? ''),
    gates?.freshness ?? '',
    gates?.flowState ?? '',
    partial.releasePosture ?? '',
  ].join('|');
}

export function mergeReportBackedStudioState(
  previous: IncidentStudioState,
  incoming: Partial<IncidentStudioState>,
  options?: { preserveConversation?: boolean }
): IncidentStudioState {
  const preserveConversation = options?.preserveConversation ?? previous.messages.length > 0;

  return {
    ...previous,
    workspaceName: incoming.workspaceName ?? previous.workspaceName,
    health: incoming.health ?? previous.health,
    relatedFiles: incoming.relatedFiles ?? previous.relatedFiles,
    studioEvidence: incoming.studioEvidence ?? previous.studioEvidence,
    policyGates: incoming.policyGates ?? previous.policyGates,
    releasePosture: incoming.releasePosture ?? previous.releasePosture,
    currentPhase: preserveConversation
      ? previous.currentPhase
      : (incoming.currentPhase ?? previous.currentPhase),
    messages: preserveConversation
      ? previous.messages
      : incoming.messages?.length
        ? incoming.messages
        : previous.messages,
    userMode: incoming.userMode ?? previous.userMode,
    scopeType: incoming.scopeType ?? previous.scopeType,
  };
}
