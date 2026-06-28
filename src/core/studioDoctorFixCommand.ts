import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';

export type StudioDoctorFixInvocation = {
  command: string[];
  cwd: string;
};

export function resolveStudioDoctorFixInvocation(input: {
  workspacePath: string;
  handoff: Pick<StudioBlockerHandoff, 'cardId' | 'scope' | 'projectPath'>;
}): StudioDoctorFixInvocation {
  const projectScoped =
    input.handoff.cardId === 'projectDoctor' ||
    input.handoff.cardId === 'importReadiness' ||
    (typeof input.handoff.scope === 'string' && input.handoff.scope.startsWith('project:'));

  if (projectScoped) {
    return {
      command: ['doctor', 'project', '--fix', '--json'],
      cwd: input.handoff.projectPath?.trim() || input.workspacePath,
    };
  }

  return {
    command: ['doctor', 'workspace', '--fix', '--json'],
    cwd: input.workspacePath,
  };
}
