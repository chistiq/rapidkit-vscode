import type { ChatSessionIncidentRepairStatus } from '@/sidebar/sidebarSessions';

type StudioProgressStatus = 'running' | 'review' | 'done' | 'failed';

export function resolveStudioIncidentRepairStatus(input: {
  progressStatus: StudioProgressStatus;
  phase?: string;
  cardStatus?: 'pass' | 'warn' | 'fail' | 'missing';
}): ChatSessionIncidentRepairStatus {
  if (input.cardStatus === 'pass') {
    return 'done';
  }
  if (input.progressStatus === 'failed') {
    return 'blocked';
  }
  if (input.progressStatus !== 'done') {
    return input.progressStatus;
  }
  const phase = input.phase?.trim().toLowerCase() ?? '';
  if (phase === 'verified' || phase === 'card-verified' || phase === 'verify-completed') {
    return 'done';
  }
  // A completed tool/action is only a completed step. The incident remains in
  // progress until refreshed card evidence explicitly proves it is passing.
  return 'running';
}
