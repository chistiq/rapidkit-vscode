import { describe, expect, it, vi } from 'vitest';

import {
  CreateExecutionCapabilityError,
  describeCreateExecutionFailure,
  EXECUTE_APPROVED_CREATE_PLAN_TOOL,
  executeApprovedCreatePlan,
  resolveCreatePlanWorkspaceProfile,
  type CreateExecutionCapabilityHost,
} from '../core/createExecutionCapability.js';
import type { AICreationPlan } from '../core/aiService.js';

const basePlan: AICreationPlan = {
  type: 'workspace',
  workspaceName: 'shop-platform-wsp',
  profile: 'polyglot',
  installMethod: 'auto',
  framework: 'nextjs',
  kit: 'frontend.nextjs',
  projectName: 'shop-app',
  suggestedModules: [],
  description: 'A storefront with a companion API.',
  secondaryProject: {
    framework: 'nestjs',
    kit: 'nestjs.standard',
    projectName: 'shop-api',
  },
};

function host(
  overrides: Partial<CreateExecutionCapabilityHost> = {}
): CreateExecutionCapabilityHost {
  return {
    createWorkspace: vi.fn(async (input) => ({
      ok: true as const,
      workspacePath: '$NEW_WORKSPACE',
      workspaceName: input.name,
      reused: false,
    })),
    createProject: vi.fn(async () => undefined),
    projectPath: (workspacePath, projectName) => `${workspacePath}/${projectName}`,
    syncIntelligence: vi.fn(async () => undefined),
    refreshProjects: vi.fn(async () => undefined),
    onProgress: vi.fn(),
    resolveWorkspaceProfile: (profile) => profile,
    ...overrides,
  };
}

describe('approved Create execution capability', () => {
  it('executes workspace, primary, companion, intelligence, and refresh in order', async () => {
    const events: string[] = [];
    const runtime = host({
      createWorkspace: async () => {
        events.push('workspace');
        return {
          ok: true,
          workspacePath: '$NEW_WORKSPACE',
          workspaceName: 'shop-platform-wsp',
          reused: false,
        };
      },
      createProject: async ({ projectName }) => {
        events.push(`project:${projectName}`);
      },
      syncIntelligence: async () => {
        events.push('intelligence');
      },
      refreshProjects: async () => {
        events.push('refresh');
      },
    });

    const result = await executeApprovedCreatePlan({ plan: basePlan, host: runtime });

    expect(EXECUTE_APPROVED_CREATE_PLAN_TOOL).toBe('execute-approved-create-plan');
    expect(result).toMatchObject({ ok: true, workspacePath: '$NEW_WORKSPACE' });
    expect(events).toEqual([
      'workspace',
      'project:shop-app',
      'project:shop-api',
      'intelligence',
      'refresh',
    ]);
  });

  it('keeps host installation policy controller-owned', async () => {
    const runtime = host();

    await executeApprovedCreatePlan({
      plan: { ...basePlan, installMethod: 'pipx' },
      host: runtime,
    });

    expect(runtime.createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ installMethod: 'auto', skipPythonEngine: true })
    );
  });

  it('installs the optional Python engine only for a Python-backed project lane', async () => {
    const runtime = host();

    await executeApprovedCreatePlan({
      plan: {
        ...basePlan,
        profile: 'polyglot',
        framework: 'fastapi',
        kit: 'fastapi.standard',
        projectName: 'shop-api',
        secondaryProject: {
          framework: 'nextjs',
          kit: 'frontend.nextjs',
          projectName: 'shop-app',
        },
      },
      host: runtime,
    });

    expect(runtime.createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'polyglot', skipPythonEngine: false })
    );
  });

  it('corrects an incompatible model profile from the complete project topology', async () => {
    expect(resolveCreatePlanWorkspaceProfile({ ...basePlan, profile: 'node-only' })).toBe(
      'node-only'
    );
    expect(
      resolveCreatePlanWorkspaceProfile({
        ...basePlan,
        profile: 'node-only',
        secondaryProject: {
          framework: 'fastapi',
          kit: 'fastapi.standard',
          projectName: 'shop-api',
        },
      })
    ).toBe('polyglot');
    expect(
      resolveCreatePlanWorkspaceProfile({
        ...basePlan,
        profile: 'python-only',
        secondaryProject: undefined,
      })
    ).toBe('node-only');
  });

  it('uses polyglot for one kit that requires multiple runtime families', () => {
    expect(
      resolveCreatePlanWorkspaceProfile({
        ...basePlan,
        profile: 'node-only',
        framework: 'tauri',
        kit: 'desktop.tauri',
        secondaryProject: undefined,
      })
    ).toBe('polyglot');
    expect(
      resolveCreatePlanWorkspaceProfile({
        ...basePlan,
        profile: 'node-only',
        framework: 'laravel',
        kit: 'php.laravel',
        secondaryProject: undefined,
      })
    ).toBe('polyglot');
  });

  it('derives the exact workspace runtime from each governed agent kit', () => {
    expect(
      resolveCreatePlanWorkspaceProfile({
        ...basePlan,
        profile: 'node-only',
        framework: 'microsoft-agent-framework',
        kit: 'agent.microsoft.python',
        secondaryProject: undefined,
      })
    ).toBe('python-only');
    expect(
      resolveCreatePlanWorkspaceProfile({
        ...basePlan,
        profile: 'node-only',
        framework: 'microsoft-agent-framework',
        kit: 'agent.microsoft.dotnet',
        secondaryProject: undefined,
      })
    ).toBe('dotnet-only');
  });

  it('creates a project in the selected workspace without creating another workspace', async () => {
    const runtime = host();
    const result = await executeApprovedCreatePlan({
      plan: { ...basePlan, type: 'project', secondaryProject: undefined },
      selectedWorkspacePath: '$SELECTED_WORKSPACE',
      host: runtime,
    });

    expect(result).toMatchObject({ ok: true, workspacePath: '$SELECTED_WORKSPACE' });
    expect(runtime.createWorkspace).not.toHaveBeenCalled();
    expect(runtime.createProject).toHaveBeenCalledTimes(1);
  });

  it('creates a workspace plan and its first project together instead of using the active workspace', async () => {
    const runtime = host({
      createWorkspace: vi.fn(async (input) => ({
        ok: true as const,
        workspacePath: `$WORKSPACES/${input.name}`,
        workspaceName: input.name,
        reused: false,
      })),
    });
    const plan = {
      ...basePlan,
      workspaceName: 'workspai-wsp',
      projectName: 'product-dashboard',
      secondaryProject: undefined,
    };

    const result = await executeApprovedCreatePlan({
      plan,
      selectedWorkspacePath: '$ACTIVE_WORKSPACE',
      host: runtime,
    });

    expect(runtime.createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'workspai-wsp' })
    );
    expect(runtime.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: '$WORKSPACES/workspai-wsp',
        projectName: 'product-dashboard',
      })
    );
    expect(result).toMatchObject({ workspacePath: '$WORKSPACES/workspai-wsp' });
  });

  it('rejects an unscoped project plan before source mutation', async () => {
    const runtime = host();

    await expect(
      executeApprovedCreatePlan({
        plan: { ...basePlan, type: 'project', secondaryProject: undefined },
        host: runtime,
      })
    ).rejects.toMatchObject({
      name: 'CreateExecutionCapabilityError',
      phase: 'workspace',
      safeToRetry: false,
      message: expect.stringContaining('requires an active selected workspace'),
    });
    expect(runtime.createWorkspace).not.toHaveBeenCalled();
    expect(runtime.createProject).not.toHaveBeenCalled();
  });

  it('stops before project mutation when workspace creation fails', async () => {
    const runtime = host({
      createWorkspace: async () => ({
        ok: false,
        code: 'permission-denied',
        message: 'Workspace creation is not permitted.',
        technicalMessage: 'Permission denied.',
        retryable: false,
        phase: 'create',
      }),
    });

    const result = await executeApprovedCreatePlan({ plan: basePlan, host: runtime });

    expect(result).toMatchObject({
      ok: false,
      failure: { code: 'permission-denied', retryable: false },
    });
    expect(runtime.createProject).not.toHaveBeenCalled();
    expect(runtime.syncIntelligence).not.toHaveBeenCalled();
  });

  it('marks project-phase failures as unsafe for blind replay', async () => {
    const runtime = host({
      createProject: async () => {
        throw new Error('Generator stopped after writing files.');
      },
    });

    await expect(
      executeApprovedCreatePlan({ plan: basePlan, host: runtime })
    ).rejects.toMatchObject({
      name: 'CreateExecutionCapabilityError',
      phase: 'project',
      safeToRetry: false,
    } satisfies Partial<CreateExecutionCapabilityError>);
    expect(runtime.syncIntelligence).not.toHaveBeenCalled();
  });
  it('reports ENOSPC through the execution wrapper and preserves completed work without blind retry', async () => {
    const runtime = host({
      createProject: vi.fn(async () => {
        throw Object.assign(new Error('npm: no space left on device'), { code: 'ENOSPC' });
      }),
    });
    let failure: unknown;
    try {
      await executeApprovedCreatePlan({ plan: basePlan, host: runtime });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CreateExecutionCapabilityError);
    const described = describeCreateExecutionFailure(
      failure as CreateExecutionCapabilityError,
      basePlan.projectName
    );
    expect(described).toMatchObject({ code: 'disk-space-exhausted', retryable: false });
    expect(described.message).toContain('ENOSPC');
    expect(described.message).toContain('Free space');
    expect(described.message).toContain('Stopped during project');
    expect(runtime.createWorkspace).toHaveBeenCalledTimes(1);
    expect(runtime.createProject).toHaveBeenCalledTimes(1);
    expect(runtime.syncIntelligence).not.toHaveBeenCalled();
  });
});
