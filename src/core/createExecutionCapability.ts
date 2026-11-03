import type { AICreationPlan } from './aiService.js';
import { describePortableCreationFailure } from './portableCreationFailure.js';
import type {
  ManagedWorkspaceCreationInput,
  WorkspaceCreationResult,
} from './workspaceCreationService.js';
import {
  scaffoldRuntimeCandidatesForKit,
  workspacePythonEngineForKit,
  type ScaffoldRuntimeFamily,
} from './scaffoldKits.js';

export const EXECUTE_APPROVED_CREATE_PLAN_TOOL = 'execute-approved-create-plan' as const;

export type CreateExecutionProject = {
  name: string;
  framework: string;
  kit: string;
  path: string;
};

export type CreateExecutionProgress = {
  phase: 'workspace' | 'project' | 'companion' | 'intelligence';
  title: string;
  detail: string;
};

export class CreateExecutionCapabilityError extends Error {
  constructor(
    readonly phase: CreateExecutionProgress['phase'],
    readonly safeToRetry: boolean,
    cause: unknown
  ) {
    super(
      `Create execution stopped during ${phase}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause }
    );
    this.name = 'CreateExecutionCapabilityError';
  }
}

/** Keep the real cause visible without authorizing a blind replay of partial work. */
export function describeCreateExecutionFailure(
  error: CreateExecutionCapabilityError,
  resourceName: string
) {
  const failure = describePortableCreationFailure(error.cause ?? error, resourceName);
  return {
    ...failure,
    message: `${failure.message} Stopped during ${error.phase}; earlier steps may have completed.`,
    retryable: error.safeToRetry && failure.retryable,
  };
}

export type CreateExecutionResult =
  | {
      ok: true;
      workspacePath: string;
      projects: CreateExecutionProject[];
    }
  | {
      ok: false;
      failure: Exclude<WorkspaceCreationResult, { ok: true }>;
    };

export type CreateExecutionCapabilityHost = {
  createWorkspace: (input: ManagedWorkspaceCreationInput) => Promise<WorkspaceCreationResult>;
  createProject: (input: {
    workspacePath: string;
    framework: AICreationPlan['framework'];
    projectName: string;
    kit: string;
  }) => Promise<void>;
  projectPath: (workspacePath: string, projectName: string) => string;
  syncIntelligence: (workspacePath: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  onProgress: (progress: CreateExecutionProgress) => void;
  resolveWorkspaceProfile: (
    profile: AICreationPlan['profile'],
    framework: AICreationPlan['framework']
  ) => AICreationPlan['profile'];
};

export function createPlanRequiresPythonEngine(plan: AICreationPlan): boolean {
  return (
    workspacePythonEngineForKit(plan.kit) === 'required' ||
    (plan.secondaryProject
      ? workspacePythonEngineForKit(plan.secondaryProject.kit) === 'required'
      : false)
  );
}

const PROFILE_FOR_RUNTIME: Partial<Record<ScaffoldRuntimeFamily, AICreationPlan['profile']>> = {
  python: 'python-only',
  node: 'node-only',
  go: 'go-only',
  java: 'java-only',
  dotnet: 'dotnet-only',
};

export function resolveCreatePlanWorkspaceProfile(
  plan: AICreationPlan,
  preferredProfile: AICreationPlan['profile'] = plan.profile
): AICreationPlan['profile'] {
  if (preferredProfile === 'enterprise') {
    return preferredProfile;
  }

  const runtimes = new Set<ScaffoldRuntimeFamily>([
    ...scaffoldRuntimeCandidatesForKit(plan.kit),
    ...(plan.secondaryProject ? scaffoldRuntimeCandidatesForKit(plan.secondaryProject.kit) : []),
  ]);
  if (runtimes.size > 1) {
    return 'polyglot';
  }
  if (preferredProfile === 'polyglot' || preferredProfile === 'minimal') {
    return preferredProfile;
  }

  const runtime = [...runtimes][0];
  const requiredProfile = runtime ? PROFILE_FOR_RUNTIME[runtime] : undefined;
  return requiredProfile === preferredProfile ? preferredProfile : (requiredProfile ?? 'minimal');
}

/**
 * Execute one approved plan as a deterministic controller-owned operation.
 * This is the only Create mutation capability: models can propose a plan but
 * cannot invoke individual workspace, project, package-manager, or sync steps.
 */
export async function executeApprovedCreatePlan(input: {
  plan: AICreationPlan;
  selectedWorkspacePath?: string;
  host: CreateExecutionCapabilityHost;
}): Promise<CreateExecutionResult> {
  const { plan, host } = input;
  let workspacePath = input.selectedWorkspacePath;
  if (plan.type === 'workspace') {
    host.onProgress({
      phase: 'workspace',
      title: 'Creating workspace shell',
      detail: `Workspace: ${plan.workspaceName}`,
    });
    const profile = resolveCreatePlanWorkspaceProfile(
      plan,
      host.resolveWorkspaceProfile(plan.profile, plan.framework)
    );
    const workspace = await host.createWorkspace({
      name: plan.workspaceName,
      profile,
      // Models describe the product. The verified runtime owns host-specific
      // toolchain selection and chooses an available mechanism.
      installMethod: 'auto',
      // Workspace profiles describe governance/runtime breadth. The optional
      // Python engine is required only when this exact plan contains a
      // Python-backed scaffold; polyglot itself is not a Python requirement.
      skipPythonEngine: !createPlanRequiresPythonEngine(plan),
      initGit: true,
      policyMode: 'warn',
      dependencySharing: 'isolated',
    });
    if (!workspace.ok) {
      return { ok: false, failure: workspace };
    }
    workspacePath = workspace.workspacePath;
  } else if (!workspacePath) {
    throw new CreateExecutionCapabilityError(
      'workspace',
      false,
      new Error('Project creation requires an active selected workspace.')
    );
  }

  host.onProgress({
    phase: 'project',
    title: 'Creating project structure',
    detail: `${plan.projectName} · ${plan.framework} · ${plan.kit}`,
  });
  try {
    await host.createProject({
      workspacePath,
      framework: plan.framework,
      projectName: plan.projectName,
      kit: plan.kit,
    });
  } catch (error) {
    throw new CreateExecutionCapabilityError('project', false, error);
  }
  const projects: CreateExecutionProject[] = [
    {
      name: plan.projectName,
      framework: plan.framework,
      kit: plan.kit,
      path: host.projectPath(workspacePath, plan.projectName),
    },
  ];

  if (plan.type === 'workspace' && plan.secondaryProject) {
    host.onProgress({
      phase: 'companion',
      title: 'Creating companion project',
      detail: `${plan.secondaryProject.projectName} · ${plan.secondaryProject.framework}`,
    });
    try {
      await host.createProject({
        workspacePath,
        framework: plan.secondaryProject.framework,
        projectName: plan.secondaryProject.projectName,
        kit: plan.secondaryProject.kit,
      });
    } catch (error) {
      throw new CreateExecutionCapabilityError('companion', false, error);
    }
    projects.push({
      name: plan.secondaryProject.projectName,
      framework: plan.secondaryProject.framework,
      kit: plan.secondaryProject.kit,
      path: host.projectPath(workspacePath, plan.secondaryProject.projectName),
    });
  }

  host.onProgress({
    phase: 'intelligence',
    title:
      plan.type === 'project'
        ? 'Syncing workspace intelligence'
        : 'Preparing workspace intelligence',
    detail:
      plan.suggestedModules.length > 0
        ? `Module suggestions captured: ${plan.suggestedModules.join(', ')}`
        : 'Refreshing workspace model and project evidence.',
  });
  try {
    await host.syncIntelligence(workspacePath);
    await host.refreshProjects();
  } catch (error) {
    throw new CreateExecutionCapabilityError('intelligence', false, error);
  }
  return { ok: true, workspacePath, projects };
}
