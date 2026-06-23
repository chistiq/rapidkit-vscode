import { describe, expect, it } from 'vitest';
import { buildDashboardScopeDescriptor, dashboardScopeLabel } from '@/lib/dashboardScope';
import {
  dashboardScopeForSection,
  dashboardSectionScopePolicy,
  dashboardWorkspaceScope,
} from '@/lib/dashboardScopePolicy';
import { resolveEvidenceProjectAttribution } from '@/lib/dashboardEvidenceProjectAttribution';
import type { DashboardEvidenceCard, DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import type { WorkspaceStatus } from '@/types';

describe('dashboard scope descriptor', () => {
  const baseWorkspace: WorkspaceStatus = {
    hasWorkspace: true,
    workspaceName: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
  };

  it('describes workspace-only scope without inventing project state', () => {
    const scope = buildDashboardScopeDescriptor({
      workspaceStatus: baseWorkspace,
      activeWorkspaceName: 'workspace-a',
      activeWorkspaceProfile: 'polyglot',
    });

    expect(scope.level).toBe('workspace');
    expect(scope.workspace).toMatchObject({
      active: true,
      name: 'workspace-a',
      profile: 'polyglot',
      path: '/tmp/workspace-a',
    });
    expect(scope.project.active).toBe(false);
    expect(scope.project.source).toBe('vscode');
    expect(dashboardScopeLabel(scope)).toBe('workspace-a');
  });

  it('prefers the selected VS Code project over analysis fallback', () => {
    const scope = buildDashboardScopeDescriptor({
      workspaceStatus: {
        ...baseWorkspace,
        hasProjectSelected: true,
        projectName: 'api',
        projectPath: '/tmp/workspace-a/api',
        projectType: 'fastapi',
        projectCapabilities: {
          available: true,
          frameworkDisplayName: 'FastAPI',
          moduleSupport: true,
        },
      },
      activeWorkspaceName: 'workspace-a',
      selectedProjectForAnalysis: {
        name: 'stale-project',
        path: '/tmp/other/stale-project',
        type: 'nestjs',
      },
    });

    expect(scope.level).toBe('workspace-project');
    expect(scope.project).toMatchObject({
      active: true,
      name: 'api',
      path: '/tmp/workspace-a/api',
      type: 'fastapi',
      frameworkLabel: 'FastAPI',
      source: 'vscode',
    });
    expect(dashboardScopeLabel(scope)).toBe('workspace-a / api');
  });

  it('uses analysis project only when no VS Code project is selected', () => {
    const scope = buildDashboardScopeDescriptor({
      workspaceStatus: baseWorkspace,
      activeWorkspaceName: 'workspace-a',
      selectedProjectForAnalysis: {
        name: 'frontend',
        path: '/tmp/workspace-a/frontend',
        type: 'nextjs',
      },
    });

    expect(scope.level).toBe('workspace-project');
    expect(scope.project).toMatchObject({
      active: true,
      name: 'frontend',
      type: 'nextjs',
      path: '/tmp/workspace-a/frontend',
      source: 'analysis',
    });
  });

  it('keeps workspace-first dashboard sections anchored to workspace scope', () => {
    const scope = buildDashboardScopeDescriptor({
      workspaceStatus: {
        ...baseWorkspace,
        hasProjectSelected: true,
        projectName: 'api',
        projectPath: '/tmp/workspace-a/api',
        projectType: 'fastapi',
      },
      activeWorkspaceName: 'workspace-a',
      activeWorkspaceProfile: 'polyglot',
    });

    const workspaceOnly = dashboardWorkspaceScope(scope);

    expect(workspaceOnly.level).toBe('workspace');
    expect(workspaceOnly.workspace.name).toBe('workspace-a');
    expect(workspaceOnly.project.active).toBe(false);
    expect(dashboardScopeForSection(scope, 'overview')).toMatchObject(workspaceOnly);
    expect(dashboardScopeForSection(scope, 'repair')).toMatchObject(workspaceOnly);
    expect(dashboardScopeForSection(scope, 'evidence')).toMatchObject(workspaceOnly);
    expect(dashboardScopeForSection(scope, 'operate')).toMatchObject(workspaceOnly);
  });

  it('keeps project-specific dashboard sections project aware', () => {
    const scope = buildDashboardScopeDescriptor({
      workspaceStatus: {
        ...baseWorkspace,
        hasProjectSelected: true,
        projectName: 'api',
        projectPath: '/tmp/workspace-a/api',
        projectType: 'fastapi',
      },
      activeWorkspaceName: 'workspace-a',
    });

    expect(dashboardSectionScopePolicy('console')).toBe('project-lifecycle');
    expect(dashboardSectionScopePolicy('catalog')).toBe('project-target');
    expect(dashboardScopeForSection(scope, 'console').project.active).toBe(true);
    expect(dashboardScopeForSection(scope, 'catalog').project.active).toBe(true);
  });

  it('keeps repair workspace-first while attributing project-scoped blockers', () => {
    const workspaceCard: DashboardEvidenceCard = {
      id: 'doctor',
      label: 'Workspace Doctor',
      status: 'warn',
      summary: 'Workspace warning',
      scope: 'workspace',
    };
    const projectCard: DashboardEvidenceCard = {
      id: 'projectDoctor',
      label: 'Project Doctor',
      status: 'fail',
      summary: 'Project issue',
      scope: 'project',
    };
    const evidence: DashboardEvidencePayload = {
      workspacePath: '/tmp/workspace-a',
      projectPath: '/tmp/workspace-a/api',
      projectName: 'api',
      cards: [workspaceCard, projectCard],
      activity: [],
      onboarding: {
        isFreshInstall: false,
        recentWorkspaceCount: 1,
        hasActiveWorkspace: true,
      },
    };

    expect(resolveEvidenceProjectAttribution(workspaceCard, evidence)).toBeNull();
    expect(resolveEvidenceProjectAttribution(projectCard, evidence)).toMatchObject({
      label: 'api',
      projectName: 'api',
      projectPath: '/tmp/workspace-a/api',
    });
  });
});
