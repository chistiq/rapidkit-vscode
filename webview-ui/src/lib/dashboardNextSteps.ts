import type { Workspace, WorkspaceStatus } from '../types';
import type { DashboardSection } from './dashboardSections';
import { dashboardSectionForOpsChainStep } from './dashboardSections';
import { isModuleInstallSupported, isUnsupportedModuleProjectType } from './moduleSupport';
import type {
  DashboardEvidencePayload,
  DashboardNextStep,
  DashboardNextStepPriority,
} from './dashboardEvidence';
import { findEvidenceCard } from './dashboardEvidence';
import { getDashboardCommandMeta } from './dashboardCommandRegistry';

function enrichDashboardNextStep(step: DashboardNextStep): DashboardNextStep {
  if (!step.command) {
    return step;
  }
  const commandMeta = getDashboardCommandMeta(step.command);
  if (!commandMeta) {
    return step;
  }
  return {
    ...step,
    commandLabel: commandMeta.label,
    commandScope: commandMeta.scope,
    commandTrackActivity: commandMeta.trackActivity,
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
  const projectType = workspaceStatus.projectType;
  const modulesSupported = isModuleInstallSupported(projectType, hasProject);
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

  // Fresh-install onboarding lives in FreshInstallOnboarding — avoid duplicating CTAs here.
  if (isFreshInstall || (!hasWorkspace && recentWorkspaceCount === 0)) {
    return steps;
  }

  if (!hasWorkspace) {
    steps.push({
      id: 'select-workspace',
      title: 'Select a workspace',
      detail: 'Choose a recent workspace or open one from disk.',
      priority: 'critical',
      section: 'workspaces',
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

  const analyzeCard = findEvidenceCard(evidence, 'analyze');
  if (analyzeCard?.status === 'fail') {
    steps.push({
      id: 'analyze-blockers',
      title: 'Fix analyze findings',
      detail: analyzeCard.blockers?.[0] ?? analyzeCard.summary,
      priority: 'critical',
      section: 'evidence',
      command: 'workspaceAnalyze',
      incidentStudioTarget: 'analyze',
    });
  } else if (analyzeCard?.status === 'missing') {
    steps.push({
      id: 'run-analyze',
      title: 'Generate analyze evidence',
      detail: 'Run workspace Analyze to populate the ops evidence loop.',
      priority: 'recommended',
      section: 'evidence',
      command: 'workspaceAnalyze',
    });
  }

  const readinessCard = findEvidenceCard(evidence, 'readiness');
  if (readinessCard?.status === 'fail') {
    steps.push({
      id: 'readiness-blockers',
      title: 'Clear readiness blockers',
      detail: readinessCard.blockers?.[0] ?? readinessCard.summary,
      priority: 'critical',
      section: 'evidence',
      command: 'workspaceReadiness',
      incidentStudioTarget: 'readiness',
    });
  }

  const autopilotCard = findEvidenceCard(evidence, 'autopilot');
  if (autopilotCard?.status === 'fail') {
    steps.push({
      id: 'autopilot-blockers',
      title: 'Review autopilot release blockers',
      detail: autopilotCard.blockers?.[0] ?? autopilotCard.summary,
      priority: 'critical',
      section: 'evidence',
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
      section: 'evidence',
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
      section: 'evidence',
      command: 'workspaceSnapshotCreate',
    });
  }

  if (evidence?.opsChain?.status === 'blocked') {
    steps.push({
      id: 'ops-chain-blocked',
      title: 'Unblock governance chain',
      detail: evidence.opsChain.lastDetail ?? 'Resolve the current chain step before continuing.',
      priority: 'critical',
      section: dashboardSectionForOpsChainStep(evidence.opsChain.currentStep),
    });
  }

  const bootstrapCard = findEvidenceCard(evidence, 'bootstrap');
  if (bootstrapCard?.status === 'fail' || activeWorkspace?.complianceStatus === 'failing') {
    steps.push({
      id: 'bootstrap-fix',
      title: 'Fix bootstrap compliance',
      detail: bootstrapCard?.summary ?? 'Re-run bootstrap to satisfy workspace policy checks.',
      priority: 'critical',
      section: 'operate',
      command: 'workspaceBootstrap',
      commandData: activeWorkspace?.path
        ? { path: activeWorkspace.path, name: activeWorkspace.name }
        : undefined,
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

  if (!hasProject) {
    steps.push({
      id: 'select-project',
      title: 'Select or create a project',
      detail: 'Pick a project from PROJECTS or create one from the Operate tab.',
      priority: 'recommended',
      section: 'operate',
    });
  } else if (isUnsupportedModuleProjectType(projectType)) {
    steps.push({
      id: 'supported-project',
      title: 'Switch to FastAPI or NestJS for modules',
      detail: `${projectType ?? 'This'} project supports Console actions; modules need FastAPI/NestJS.`,
      priority: 'recommended',
      section: 'console',
    });
  } else if (modulesSupported && installedModuleCount === 0) {
    steps.push({
      id: 'browse-modules',
      title: 'Browse module catalog',
      detail: 'Install production-ready modules for your FastAPI or NestJS service.',
      priority: 'optional',
      section: 'catalog',
    });
  }

  if (hasProject && !workspaceStatus.isRunning) {
    steps.push({
      id: 'init-dev',
      title: 'Initialize and start dev server',
      detail: 'Run Init in Console if dependencies are missing, then Dev to launch locally.',
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
    readinessCard?.status === 'pass' &&
    (analyzeCard?.status === 'pass' || analyzeCard?.status === 'warn') &&
    autopilotCard?.status !== 'fail'
  ) {
    steps.push({
      id: 'autopilot-release',
      title: 'Run Autopilot Release',
      detail: 'Evidence is green enough to attempt the governed release gate.',
      priority: 'optional',
      section: 'evidence',
      command: 'workspaceAutopilotRelease',
      incidentStudioTarget: 'release',
    });
  } else if (hasWorkspace && readinessCard?.status === 'missing') {
    steps.push({
      id: 'readiness-gate',
      title: 'Check release readiness',
      detail: 'Generate readiness evidence before Autopilot Release.',
      priority: 'optional',
      section: 'evidence',
      command: 'workspaceReadiness',
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
