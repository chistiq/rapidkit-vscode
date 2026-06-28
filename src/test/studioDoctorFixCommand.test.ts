import { describe, expect, it } from 'vitest';

import { resolveStudioDoctorFixInvocation } from '../core/studioDoctorFixCommand.js';

describe('resolveStudioDoctorFixInvocation', () => {
  const workspacePath = '/tmp/workspace';

  it('uses workspace doctor-fix for workspace-scoped cards', () => {
    const invocation = resolveStudioDoctorFixInvocation({
      workspacePath,
      handoff: { cardId: 'doctor', scope: 'workspace' },
    });
    expect(invocation).toEqual({
      command: ['doctor', 'workspace', '--fix', '--json'],
      cwd: workspacePath,
    });
  });

  it('uses project doctor-fix for project-scoped cards', () => {
    const invocation = resolveStudioDoctorFixInvocation({
      workspacePath,
      handoff: {
        cardId: 'projectDoctor',
        scope: 'project:api',
        projectPath: '/tmp/workspace/api',
      },
    });
    expect(invocation).toEqual({
      command: ['doctor', 'project', '--fix', '--json'],
      cwd: '/tmp/workspace/api',
    });
  });

  it('falls back to workspace root when project path is missing', () => {
    const invocation = resolveStudioDoctorFixInvocation({
      workspacePath,
      handoff: { cardId: 'importReadiness', scope: 'project:web' },
    });
    expect(invocation.cwd).toBe(workspacePath);
    expect(invocation.command).toEqual(['doctor', 'project', '--fix', '--json']);
  });
});
