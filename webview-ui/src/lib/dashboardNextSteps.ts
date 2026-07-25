import type { Workspace, WorkspaceStatus } from '../types';
import type { DashboardSection } from './dashboardSections';
import { dashboardSectionForOpsChainStep } from './dashboardSections';
import {
  isModuleInstallSupported,
  isUnsupportedModuleProjectType,
  getProjectFrameworkLabel,
} from './moduleSupport';
import { isDashboardLifecycleCommandSupported } from './projectCapabilities';
import type {
  DashboardEvidencePayload,
  DashboardNextStep,
  DashboardNextStepPriority,
} from './dashboardEvidence';
import { findEvidenceCard } from './dashboardEvidence';
import { getDashboardCommandMeta } from './dashboardCommandRegistry';
import { buildEvidenceCardCommandData } from './dashboardEvidenceDirectRun';
import {
  resolveCommandOperateZone,
  dashboardOperateZoneForOpsChainStep,
} from './dashboardOperateZones';

function enrichDashboardNextStep(step: DashboardNextStep): DashboardNextStep {
  const operateZone =
    step.operateZone ??
    (step.section === 'operate' && step.command
      ? resolveCommandOperateZone(step.command)
      : undefined);

  if (!step.command) {
    return operateZone ? { ...step, operateZone } : step;
  }
  const commandMeta = getDashboardCommandMeta(step.command);
  if (!commandMeta) {
    return operateZone ? { ...step, operateZone } : step;
  }
  return {
    ...step,
    commandLabel: commandMeta.label,
    commandScope: commandMeta.scope,
    commandTrackActivity: commandMeta.trackActivity,
    operateZone,
  };
}

export function buildDashboardNextSteps(input: {
  workspaceStatus: WorkspaceStatus;
  activeWorkspace?: Workspace | null;
  installStatusChecked: boolean;
  coreInstalled: boolean;
  evidence?: DashboardEvidencePayload | null;
}): DashboardNextStep[] {
  const steps: DashboardNextStep[] = [];
  const { workspaceStatus, activeWorkspace, installStatusChecked, coreInstalled, evidence } = input;
  const onboarding = evidence?.onboarding;
  const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
  const hasProject = workspaceStatus.hasProjectSelected === true;
  const workspaceModelCard = findEvidenceCard(evidence, 'workspaceModel');
  const workspaceProjectCount = Number(workspaceModelCard?.metrics?.projectCount);
  const workspaceHasRegisteredProjects =
    Number.isFinite(workspaceProjectCount) && workspaceProjectCount > 0;
  const workspaceIsEmpty =
    hasWorkspace && Number.isFinite(workspaceProjectCount) && workspaceProjectCount === 0;
  const projectType = workspaceStatus.projectType;
  const modulesSupported = isModuleInstallSupported(
    projectType,
    hasProject,
    workspaceStatus.projectCapabilities
  );
  const installedModuleCount = workspaceStatus.installedModules?.length ?? 0;
  const recentWorkspaceCount = onboarding?.recentWorkspaceCount ?? (hasWorkspace ? 1 : 0);
  const isFreshInstall =
    onboarding?.isFreshInstall ?? (recentWorkspaceCount === 0 && !hasWorkspace);

  if (installStatusChecked && !coreInstalled) {
    steps.push({
      id: 'install-core',
      title: 'Install RapidKit Core',
      detail: 'Open Setup & Installation to enable CLI-backed dashboard actions.',
      priority: 'critical',
      command: 'openSetup',
    });
  }

  // Fresh-install creation/import entry points live in Home handoff cards.
  if (isFreshInstall || (!hasWorkspace && recentWorkspaceCount === 0)) {
    return steps;
  }

  if (!hasWorkspace) {
    steps.push({
      id: 'select-workspace',
      title: 'Select a workspace',
      detail: 'Choose a recent workspace or open one from disk.',
      priority: 'critical',
      section: 'catalog',
      command: 'quickSwitchWorkspace',
    });
    return steps;
  }

  const doctorCard = findEvidenceCard(evidence, 'doctor');
  if (doctorCard?.status === 'fail') {
    steps.push({
      id: 'doctor-errors',
      title: 'Resolve doctor blockers',
      detail: doctorCard.blockers?.[0] ?? doctorCard.summary,
      priority: 'critical',
      section: 'operate',
      command: 'checkWorkspaceHealth',
      incidentStudioTarget: 'doctor',
      commandData: activeWorkspace?.path
        ? { path: activeWorkspace.path, name: activeWorkspace.name, preferredAction: 'check' }
        : undefined,
    });
  } else if (doctorCard?.status === 'warn') {
    steps.push({
      id: 'doctor-warnings',
      title: 'Review doctor warnings',
      detail: doctorCard.blockers?.[0] ?? doctorCard.summary,
      priority: 'recommended',
      section: 'operate',
      command: 'checkWorkspaceHealth',
      incidentStudioTarget: 'doctor',
      commandData: activeWorkspace?.path
        ? { path: activeWorkspace.path, name: activeWorkspace.name, preferredAction: 'check' }
        : undefined,
    });
  }

  const projectDoctorCard = findEvidenceCard(evidence, 'projectDoctor');
  if (hasProject && projectDoctorCard?.status === 'fail') {
    steps.push({
      id: 'project-doctor-errors',
      title: 'Fix project doctor blockers',
      detail: projectDoctorCard.blockers?.[0] ?? projectDoctorCard.summary,
      priority: 'critical',
      section: 'console',
      command: 'projectDoctor',
      incidentStudioTarget: 'doctor',
    });
  }

  const importReadinessCard = findEvidenceCard(evidence, 'importReadiness');
  if (hasProject && importReadinessCard?.status === 'fail') {
    steps.push({
      id: 'import-readiness-blocked',
      title: 'Resolve import readiness blockers',
      detail: importReadinessCard.blockers?.[0] ?? importReadinessCard.summary,
      priority: 'critical',
      section: 'console',
      command: 'projectDoctor',
    });
  } else if (hasProject && importReadinessCard?.status === 'warn') {
    steps.push({
      id: 'import-readiness-review',
      title: 'Review import readiness',
      detail: importReadinessCard.blockers?.[0] ?? importReadinessCard.summary,
      priority: 'recommended',
      section: 'console',
      command: 'projectDoctor',
    });
  }

  if (workspaceIsEmpty || !hasProject) {
    steps.push({
      id: 'select-project',
      title: workspaceIsEmpty ? 'Add your first project' : 'Select or create a project',
      detail: workspaceIsEmpty
        ? 'Scaffold or import a project before analyze, readiness, and release gates.'
        : 'Pick a project from PROJECTS or scaffold one from the Run tab (Build).',
      priority: workspaceIsEmpty ? 'critical' : 'recommended',
      section: 'operate',
      operateZone: 'build',
    });
  }

  const deferReleaseEvidenceSteps =
    workspaceIsEmpty || (!hasProject && !workspaceHasRegisteredProjects);

  const analyzeCard = findEvidenceCard(evidence, 'analyze');
  if (!deferReleaseEvidenceSteps && analyzeCard?.status === 'fail') {
    steps.push({
      id: 'analyze-blockers',
      title: 'Fix analyze findings',
      detail: analyzeCard.blockers?.[0] ?? analyzeCard.summary,
      priority: 'critical',
      section: 'repair',
      command: 'workspaceAnalyze',
      incidentStudioTarget: 'analyze',
    });
  } else if (!deferReleaseEvidenceSteps && analyzeCard?.status === 'missing') {
    steps.push({
      id: 'run-analyze',
      title: 'Generate analyze evidence',
      detail: 'Run workspace Analyze to populate the ops evidence loop.',
      priority: 'recommended',
      section: 'repair',
      command: 'workspaceAnalyze',
    });
  }

  const pipelineCard = findEvidenceCard(evidence, 'pipeline');
  if (!deferReleaseEvidenceSteps && pipelineCard?.status === 'fail') {
    steps.push({
      id: 'pipeline-blockers',
      title: 'Clear governance pipeline blockers',
      detail: pipelineCard.blockers?.[0] ?? pipelineCard.summary,
      priority: 'critical',
      section: 'repair',
      command: 'workspacePipeline',
      incidentStudioTarget: 'readiness',
    });
  }

  const readinessCard = findEvidenceCard(evidence, 'readiness');
  if (!deferReleaseEvidenceSteps && readinessCard?.status === 'fail') {
    steps.push({
      id: 'readiness-blockers',
      title: 'Clear readiness blockers',
      detail: readinessCard.blockers?.[0] ?? readinessCard.summary,
      priority: 'critical',
      section: 'repair',
      command: 'workspaceReadiness',
      incidentStudioTarget: 'readiness',
    });
  }

  const autopilotCard = findEvidenceCard(evidence, 'autopilot');
  if (!deferReleaseEvidenceSteps && autopilotCard?.status === 'fail') {
    steps.push({
      id: 'autopilot-blockers',
      title: 'Review autopilot release blockers',
      detail: autopilotCard.blockers?.[0] ?? autopilotCard.summary,
      priority: 'critical',
      section: 'repair',
      command: 'workspaceAutopilotRelease',
      incidentStudioTarget: 'release',
    });
  }

  const shareCard = findEvidenceCard(evidence, 'share');
  if (shareCard && (shareCard.status === 'warn' || shareCard.status === 'fail')) {
    steps.push({
      id: 'share-handoff',
      title: 'Review share bundle health',
      detail: shareCard.blockers?.[0] ?? shareCard.summary,
      priority: 'recommended',
      section: 'repair',
      command: 'workspaceShare',
    });
  }

  const snapshotCard = findEvidenceCard(evidence, 'snapshot');
  if (snapshotCard?.status === 'fail') {
    steps.push({
      id: 'snapshot-review',
      title: 'Review snapshot evidence',
      detail: snapshotCard.summary,
      priority: 'recommended',
      section: 'repair',
      command: 'workspaceSnapshotCreate',
    });
  }

  if (evidence?.opsChain?.status === 'blocked' && !workspaceIsEmpty) {
    const chainStep = evidence.opsChain.currentStep;
    steps.push({
      id: 'ops-chain-blocked',
      title: 'Unblock governance chain',
      detail: evidence.opsChain.lastDetail ?? 'Resolve the current chain step before continuing.',
      priority: 'critical',
      section: dashboardSectionForOpsChainStep(chainStep),
      operateZone: dashboardOperateZoneForOpsChainStep(chainStep),
    });
  }

  const bootstrapCard = findEvidenceCard(evidence, 'bootstrap');
  const bootstrapPending = Number(bootstrapCard?.metrics?.pendingBootstrap ?? 0) === 1;
  if (bootstrapCard?.status === 'fail' || activeWorkspace?.complianceStatus === 'failing') {
    steps.push({
      id: 'bootstrap-fix',
      title: 'Fix bootstrap compliance',
      detail: bootstrapCard?.summary ?? 'Re-run bootstrap to satisfy workspace policy checks.',
      priority: 'critical',
      section: 'operate',
      command: 'workspaceBootstrap',
      commandData:
        activeWorkspace?.path && bootstrapCard
          ? buildEvidenceCardCommandData(bootstrapCard, 'workspaceBootstrap', {
              path: activeWorkspace.path,
              name: activeWorkspace.name,
            })
          : undefined,
    });
  } else if (bootstrapPending && !workspaceIsEmpty) {
    steps.push({
      id: 'bootstrap-run',
      title: 'Run bootstrap compliance',
      detail:
        bootstrapCard?.summary ??
        'Generate the bootstrap compliance report for this workspace (Operate → Bootstrap).',
      priority: 'recommended',
      section: 'operate',
      operateZone: 'governance',
      command: 'workspaceBootstrap',
      commandData:
        activeWorkspace?.path && bootstrapCard
          ? buildEvidenceCardCommandData(bootstrapCard, 'workspaceBootstrap', {
              path: activeWorkspace.path,
              name: activeWorkspace.name,
            })
          : undefined,
    });
  }

  const setupCard = findEvidenceCard(evidence, 'setup');
  if (setupCard?.status === 'fail') {
    steps.push({
      id: 'setup-blockers',
      title: 'Fix toolchain setup blockers',
      detail: setupCard.blockers?.[0] ?? setupCard.summary,
      priority: 'critical',
      section: 'operate',
      operateZone: 'governance',
      command: 'workspaceSetup',
    });
  } else if (setupCard?.status === 'warn') {
    steps.push({
      id: 'setup-review',
      title: 'Review toolchain setup',
      detail: setupCard.blockers?.[0] ?? setupCard.summary,
      priority: 'recommended',
      section: 'operate',
      operateZone: 'governance',
      command: 'workspaceSetup',
    });
  }

  const workspaceRunCard = findEvidenceCard(evidence, 'workspaceRun');
  if (!workspaceIsEmpty && workspaceRunCard?.status === 'fail') {
    const metrics = workspaceRunCard.metrics ?? {};
    const buildFailed = Number(metrics.buildFailed ?? 0);
    const testFailed = Number(metrics.testFailed ?? 0);
    const runStage =
      buildFailed > 0 && testFailed === 0
        ? 'workspaceRunBuild'
        : testFailed > 0
          ? 'workspaceRunTest'
          : workspaceRunCard.summary?.trim().toLowerCase().startsWith('build')
            ? 'workspaceRunBuild'
            : 'workspaceRunTest';
    steps.push({
      id: 'workspace-run-failed',
      title: 'Fix workspace run failures',
      detail: workspaceRunCard.blockers?.[0] ?? workspaceRunCard.summary,
      priority: 'critical',
      section: 'operate',
      operateZone: 'quick',
      command: runStage,
    });
  } else if (!workspaceIsEmpty && workspaceRunCard?.status === 'warn') {
    steps.push({
      id: 'workspace-run-review',
      title: 'Review workspace run evidence',
      detail: workspaceRunCard.blockers?.[0] ?? workspaceRunCard.summary,
      priority: 'recommended',
      section: 'operate',
      operateZone: 'quick',
      command: 'workspaceRunTest',
    });
  }

  if (activeWorkspace?.mirrorStatus === 'stale') {
    steps.push({
      id: 'mirror-sync',
      title: 'Sync workspace mirror',
      detail: 'Mirror artifacts are stale — sync before release or handoff.',
      priority: 'recommended',
      section: 'operate',
      command: 'mirrorSync',
      commandData: activeWorkspace.path
        ? { path: activeWorkspace.path, name: activeWorkspace.name }
        : undefined,
    });
  }

  if (
    hasProject &&
    isUnsupportedModuleProjectType(projectType, workspaceStatus.projectCapabilities)
  ) {
    const frameworkLabel =
      workspaceStatus.projectCapabilities?.frameworkDisplayName ||
      getProjectFrameworkLabel(projectType);
    steps.push({
      id: 'supported-project',
      title: 'Module commands unavailable for this project',
      detail: `${frameworkLabel} supports Project lifecycle actions, but RapidKit modules are not enabled.`,
      priority: 'recommended',
      section: 'console',
    });
  } else if (hasProject && modulesSupported && installedModuleCount === 0) {
    steps.push({
      id: 'browse-modules',
      title: 'Browse module catalog',
      detail: 'Install production-ready modules from Library for your FastAPI or NestJS service.',
      priority: 'optional',
      section: 'catalog',
    });
  }

  if (
    hasProject &&
    !workspaceStatus.isRunning &&
    isDashboardLifecycleCommandSupported(workspaceStatus.projectCapabilities, 'projectInit')
  ) {
    steps.push({
      id: 'init-dev',
      title: 'Initialize and start dev server',
      detail:
        'Run Init in the Project tab if dependencies are missing, then Dev to launch locally.',
      priority: 'recommended',
      section: 'console',
      command: 'projectInit',
    });
  }

  if (hasProject && workspaceStatus.isRunning) {
    steps.push({
      id: 'verify-health',
      title: 'Verify project health',
      detail: 'Run Doctor or open Browser to confirm the service is healthy.',
      priority: 'optional',
      section: 'console',
      command: 'projectDoctor',
    });
  }

  if (
    hasWorkspace &&
    !workspaceIsEmpty &&
    readinessCard?.status === 'pass' &&
    (analyzeCard?.status === 'pass' || analyzeCard?.status === 'warn') &&
    autopilotCard?.status !== 'fail'
  ) {
    steps.push({
      id: 'autopilot-release',
      title: 'Run Autopilot Release',
      detail: 'Evidence is green enough to attempt the governed release gate.',
      priority: 'optional',
      section: 'repair',
      command: 'workspaceAutopilotRelease',
      incidentStudioTarget: 'release',
    });
  } else if (hasWorkspace && !workspaceIsEmpty && readinessCard?.status === 'missing') {
    steps.push({
      id: 'readiness-gate',
      title: 'Check release readiness',
      detail: 'Generate readiness evidence before Autopilot Release.',
      priority: 'optional',
      section: 'repair',
      command: 'workspaceReadiness',
    });
  } else if (
    hasWorkspace &&
    !workspaceIsEmpty &&
    pipelineCard?.status === 'missing' &&
    (analyzeCard?.status === 'missing' || readinessCard?.status === 'missing')
  ) {
    steps.push({
      id: 'run-pipeline',
      title: 'Run governance pipeline',
      detail: 'Execute sync → doctor → analyze → readiness → autopilot in one governed CLI loop.',
      priority: 'recommended',
      section: 'repair',
      command: 'workspacePipeline',
      incidentStudioTarget: 'readiness',
    });
  }

  const priorityOrder: Record<DashboardNextStepPriority, number> = {
    critical: 0,
    recommended: 1,
    optional: 2,
  };

  return steps
    .sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority])
    .map(enrichDashboardNextStep)
    .slice(0, 6);
}
