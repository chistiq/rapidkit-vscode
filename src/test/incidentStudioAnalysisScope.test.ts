import { describe, expect, it } from 'vitest';
import {
  buildProjectScopePickNotice,
  normalizeWorkspaceProjectOptions,
  resolveEffectiveAnalysisScope,
  resolveSidebarProjectSelection,
} from '../../webview-ui/src/lib/incidentStudioAnalysisScope';

describe('incidentStudioAnalysisScope', () => {
  it('mirrors sidebar project selection without mutating scope mode', () => {
    const sidebarProject = resolveSidebarProjectSelection({
      hasProjectSelected: true,
      projectPath: '/ws/admin-api',
      projectName: 'admin-api',
      projectType: 'nestjs',
    });

    expect(sidebarProject).toEqual({
      path: '/ws/admin-api',
      name: 'admin-api',
      type: 'nestjs',
    });

    expect(
      resolveEffectiveAnalysisScope({
        mode: 'workspace',
        analysisProject: sidebarProject,
      })
    ).toEqual({
      scopeType: 'workspace',
      activeProject: null,
      pendingProjectSelection: false,
    });

    expect(
      resolveEffectiveAnalysisScope({
        mode: 'project',
        analysisProject: sidebarProject,
      })
    ).toEqual({
      scopeType: 'project',
      activeProject: sidebarProject,
      pendingProjectSelection: false,
    });
  });

  it('keeps project mode pending when no project is selected yet', () => {
    expect(
      resolveEffectiveAnalysisScope({
        mode: 'project',
        analysisProject: null,
      })
    ).toEqual({
      scopeType: 'project',
      activeProject: null,
      pendingProjectSelection: true,
    });
  });

  it('normalizes workspace project options and notice copy', () => {
    expect(
      normalizeWorkspaceProjectOptions([
        { path: '/ws/admin-api', name: 'admin-api', type: 'nestjs' },
        { path: '/ws/admin-api', name: 'duplicate' },
      ])
    ).toEqual([{ path: '/ws/admin-api', name: 'admin-api', type: 'nestjs', framework: 'nestjs' }]);

    expect(buildProjectScopePickNotice()).toMatchObject({
      tone: 'info',
      title: 'Project focus needed',
    });
  });
});
