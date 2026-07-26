import crypto from 'node:crypto';

import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';
import type { StudioAgentWorkspaiToolHost } from './studioAgentWorkspaiTools.js';

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
  const dependencyIncident = input.blockers.some((blocker) =>
    /\b(?:dependency|dependencies|vulnerabilit|security audit|npm audit|pnpm audit|yarn audit)\b/i.test(
      blocker
    )
  );

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
      if (inspectionOutput?.dependencyBlockerPresent === false) {
        clearedProjects.push(projectName);
        continue;
      }
      if (inspection.changed === true) {
        dependencySourceChanged ||= inspection.changed === true;
        continue;
      }
      const candidates = recordArray(inspectionOutput?.upgradeCandidates);
      if (!inspection.ok) {
        unresolvedProjects.push(projectName);
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
          projectUpgraded ||= upgrade.changed === true;
        }
        if (projectUpgraded) {
          dependencySourceChanged = true;
          continue;
        }
      }
      unresolvedProjects.push(projectName);
    }

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
  const executableStep = steps
    .filter(
      (step) =>
        step.risk !== 'invasive' &&
        (step.studioState === 'ready' || step.studioState === 'review-required') &&
        (step.canApply === true || step.executable === true)
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
    return {
      ...execution,
      output: {
        recoveryPath: 'contract-remediation-plan',
        observations,
        nextAction: execution.changed ? 'workspaceIntelligenceChain' : 'general-source-repair',
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
