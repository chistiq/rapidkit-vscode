import crypto from 'node:crypto';

import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';
import type { StudioAgentWorkspaiToolHost } from './studioAgentWorkspaiTools.js';
import { isDependencySecurityBlocker } from './studioDependencyIncident.js';

type RecoveryObservation = { capability: string; result: unknown };

function outputRecord(result: StudioAgentToolResult): Record<string, unknown> | undefined {
  return result.output && typeof result.output === 'object' && !Array.isArray(result.output)
    ? (result.output as Record<string, unknown>)
    : undefined;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      )
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

function valueRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function scopedProject(projectPath?: string): { projectPath?: string } {
  return projectPath ? { projectPath } : {};
}

export async function runStudioActiveBlockerRecovery(input: {
  blockers: readonly string[];
  dependencyProjectNames: readonly string[];
  evidenceGeneration: string;
  blockerSignature?: string;
  workspacePath: string;
  projectPath?: string;
  host: StudioAgentWorkspaiToolHost;
  transactionId?: () => string;
}): Promise<StudioAgentToolResult> {
  const observations: RecoveryObservation[] = [];
  const dependencyIncident = input.blockers.some(isDependencySecurityBlocker);
  const dependencyDiagnostics: Array<{
    projectName: string;
    sourceFiles: string[];
    resolutionCandidates: Record<string, unknown>[];
    blockedCandidates: Record<string, unknown>[];
    nextAction?: string;
  }> = [];
  let unresolvedDependencyProjects: string[] = [];
  const safeFixUnavailableProjects: string[] = [];
  const changedDependencyProjects = new Set<string>();
  const changedDependencyPaths = new Set<string>();
  const recordDependencyMutation = (projectName: string, result: StudioAgentToolResult): void => {
    if (result.changed !== true) {
      return;
    }
    changedDependencyProjects.add(projectName);
    const output = outputRecord(result);
    for (const value of [
      ...(Array.isArray(output?.changedPaths) ? output.changedPaths : []),
      ...(Array.isArray(output?.changedFiles) ? output.changedFiles : []),
    ]) {
      if (typeof value === 'string' && value.trim()) {
        changedDependencyPaths.add(value.replace(/\\/g, '/'));
      }
    }
  };

  if (dependencyIncident && input.dependencyProjectNames.length > 0) {
    let dependencySourceChanged = false;
    const unresolvedProjects: string[] = [];
    const clearedProjects: string[] = [];

    for (const projectName of input.dependencyProjectNames) {
      const inspection = await input.host.inspectDependencySecurity({
        projectName,
        workspacePath: input.workspacePath,
        ...scopedProject(input.projectPath),
      });
      observations.push({
        capability: `inspect-dependency-security:${projectName}`,
        result: inspection,
      });
      const inspectionOutput = outputRecord(inspection);
      const target = valueRecord(inspectionOutput?.target);
      dependencyDiagnostics.push({
        projectName,
        sourceFiles: Array.isArray(target?.sourceFiles)
          ? target.sourceFiles.filter((entry): entry is string => typeof entry === 'string')
          : [],
        resolutionCandidates: recordArray(inspectionOutput?.resolutionCandidates),
        blockedCandidates: recordArray(inspectionOutput?.blockedCandidates),
        ...(typeof inspectionOutput?.nextAction === 'string'
          ? { nextAction: inspectionOutput.nextAction }
          : {}),
      });
      if (inspectionOutput?.dependencyBlockerPresent === false) {
        clearedProjects.push(projectName);
        continue;
      }
      if (inspection.changed === true) {
        recordDependencyMutation(projectName, inspection);
        dependencySourceChanged ||= inspection.changed === true;
        continue;
      }
      const candidates = recordArray(inspectionOutput?.upgradeCandidates);
      if (!inspection.ok) {
        unresolvedProjects.push(projectName);
        continue;
      }

      const blockedCandidates = recordArray(inspectionOutput?.blockedCandidates);
      if (
        candidates.length === 0 &&
        blockedCandidates.length > 0 &&
        ['general-source-repair', 'review-required', 'no-safe-upgrade'].includes(
          String(inspectionOutput?.nextAction ?? '')
        )
      ) {
        unresolvedProjects.push(projectName);
        safeFixUnavailableProjects.push(projectName);
        continue;
      }

      const repair = await input.host.repairDependencySecurity({
        projectName,
        workspacePath: input.workspacePath,
        ...scopedProject(input.projectPath),
      });
      observations.push({
        capability: `repair-dependency-security:${projectName}`,
        result: repair,
      });
      if (repair.changed === true) {
        recordDependencyMutation(projectName, repair);
        dependencySourceChanged = true;
        continue;
      }
      const repairOutput = outputRecord(repair);
      const repairCandidates = recordArray(repairOutput?.upgradeCandidates);
      const availableCandidates = repairCandidates.length > 0 ? repairCandidates : candidates;
      if (
        repairOutput?.nextAction === 'upgrade-dependency-security' &&
        availableCandidates.length > 0
      ) {
        let projectUpgraded = false;
        for (const candidate of availableCandidates) {
          if (typeof candidate.packageName !== 'string') {
            continue;
          }
          const upgrade = await input.host.upgradeDependencySecurity({
            projectName,
            packageName: candidate.packageName,
            transactionId: input.transactionId?.() ?? crypto.randomUUID(),
            workspacePath: input.workspacePath,
            ...scopedProject(input.projectPath),
          });
          observations.push({
            capability: `upgrade-dependency-security:${projectName}:${candidate.packageName}`,
            result: upgrade,
          });
          recordDependencyMutation(projectName, upgrade);
          projectUpgraded ||= upgrade.changed === true;
        }
        if (projectUpgraded) {
          dependencySourceChanged = true;
          continue;
        }
      }
      unresolvedProjects.push(projectName);
    }
    unresolvedDependencyProjects = [...unresolvedProjects];

    if (dependencySourceChanged) {
      return {
        ok: true,
        changed: true,
        evidenceGeneration: input.evidenceGeneration,
        blockerSignature: input.blockerSignature,
        output: {
          recoveryPath: 'dependency-security',
          observations,
          processedProjects: [...input.dependencyProjectNames],
          projectNames: [...changedDependencyProjects],
          changedPaths: [...changedDependencyPaths],
          clearedProjects,
          unresolvedProjects,
          nextAction: 'workspaceIntelligenceChain',
        },
      };
    }
    if (clearedProjects.length === input.dependencyProjectNames.length) {
      return {
        ok: true,
        changed: false,
        evidenceGeneration: input.evidenceGeneration,
        blockerSignature: input.blockerSignature,
        output: {
          recoveryPath: 'dependency-security',
          observations,
          processedProjects: [...input.dependencyProjectNames],
          clearedProjects,
          unresolvedProjects: [],
          nextAction: 'verify-blocker',
        },
      };
    }
    if (
      unresolvedProjects.length > 0 &&
      unresolvedProjects.every((projectName) => safeFixUnavailableProjects.includes(projectName))
    ) {
      return {
        ok: false,
        changed: false,
        evidenceGeneration: input.evidenceGeneration,
        blockerSignature: input.blockerSignature,
        output: {
          recoveryPath: 'general-source-repair',
          observations,
          processedProjects: [...input.dependencyProjectNames],
          clearedProjects,
          unresolvedProjects,
          dependencyDiagnostics,
          sourceCandidates: dependencyDiagnostics.flatMap((entry) =>
            entry.sourceFiles.map((file) => `${entry.projectName}/${file}`)
          ),
          nextAction: 'general-source-repair',
          exhaustedTools: [
            'inspect-dependency-security',
            'repair-dependency-security',
            'upgrade-dependency-security',
          ],
          recommendedTools: [
            'inspect-source',
            'run-workspace-command',
            'apply-workspace-patch',
            'inspect-workspace-changes',
          ],
          recommendedActions: [
            'Inspect the exact manifest, lockfile, vulnerable transitive packages, and owning dependency constraints.',
            'Discover a compatible owner upgrade or guarded package-manager constraint before considering a breaking change.',
            'After one source transaction, reconcile the lockfile and run focused audit, test, and build verification.',
          ],
        },
        error:
          `The bounded audit fix could not safely repair ${unresolvedProjects.length} affected project(s). ` +
          'Continue through the general source-repair plane; require a user decision only if compatibility discovery leaves a breaking, forced, downgrade, or policy-exception choice.',
      };
    }
  }

  let plan = await input.host.inspectRemediationPlan({
    workspacePath: input.workspacePath,
    ...scopedProject(input.projectPath),
  });
  observations.push({ capability: 'inspect-remediation-plan', result: plan });
  if (!plan.ok) {
    const planProducer = await input.host.runGovernedCommand({
      commandId: 'workspaceRemediationPlan',
      workspacePath: input.workspacePath,
      ...scopedProject(input.projectPath),
    });
    observations.push({ capability: 'workspace-remediation-plan', result: planProducer });
    if (planProducer.ok) {
      plan = await input.host.inspectRemediationPlan({
        workspacePath: input.workspacePath,
        ...scopedProject(input.projectPath),
      });
      observations.push({
        capability: 'inspect-remediation-plan:refreshed',
        result: plan,
      });
    }
  }

  const steps = recordArray(outputRecord(plan)?.steps);
  const currentStepIds = new Set(
    steps
      .map((step) => step.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );
  const executableStep = steps
    .filter(
      (step) =>
        step.risk !== 'invasive' &&
        (step.studioState === 'ready' || step.studioState === 'review-required') &&
        (step.canApply === true || step.executable === true) &&
        stringArray(step.dependsOn).every((dependency) => !currentStepIds.has(dependency))
    )
    .sort(
      (left, right) =>
        Number(left.order ?? Number.MAX_SAFE_INTEGER) -
        Number(right.order ?? Number.MAX_SAFE_INTEGER)
    )[0];
  if (plan.ok && executableStep && typeof executableStep.id === 'string') {
    const execution = await input.host.executeRemediationStep({
      stepId: executableStep.id,
      workspacePath: input.workspacePath,
      ...scopedProject(input.projectPath),
    });
    observations.push({ capability: 'execute-remediation-step', result: execution });
    if (execution.ok && !execution.changed) {
      const refreshedPlan = await input.host.runGovernedCommand({
        commandId: 'workspaceRemediationPlan',
        workspacePath: input.workspacePath,
      });
      observations.push({
        capability: 'workspaceRemediationPlan:post-step',
        result: refreshedPlan,
      });
    }
    return {
      ...execution,
      output: {
        recoveryPath: 'contract-remediation-plan',
        observations,
        nextAction: execution.ok
          ? execution.changed
            ? 'workspaceIntelligenceChain'
            : 'inspect-remediation-plan'
          : 'general-source-repair',
      },
    };
  }

  return {
    ok: false,
    changed: false,
    evidenceGeneration: input.evidenceGeneration,
    blockerSignature: input.blockerSignature,
    output: {
      recoveryPath: 'general-source-repair',
      observations,
      ...(dependencyIncident && input.dependencyProjectNames.length > 0
        ? {
            unresolvedProjects: unresolvedDependencyProjects,
            dependencyDiagnostics,
            sourceCandidates: dependencyDiagnostics.flatMap((entry) =>
              entry.sourceFiles.map((file) => `${entry.projectName}/${file}`)
            ),
          }
        : {}),
      nextAction: 'general-source-repair',
      recommendedTools: [
        'discover-workspace-files',
        'inspect-source',
        'search-workspace',
        'inspect-workspace-diagnostics',
        'run-workspace-command',
        'apply-workspace-patch',
        'inspect-workspace-changes',
      ],
    },
    error:
      'No safe deterministic repair cleared the fresh blocker. Continue with the general source capability plane using these observations.',
  };
}
