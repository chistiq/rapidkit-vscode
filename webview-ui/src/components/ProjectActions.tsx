import {
  AlertTriangle,
  BrainCircuit,
  FileJson,
  GitBranch,
  Hammer,
  Layers,
  Package,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  Stethoscope,
  Terminal,
  TestTube,
  Globe,
  ScanLine,
  Wand2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { WorkspaceStatus } from '@/types';
import type { DashboardEvidenceCard, DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import { evidenceStatusLabel, findEvidenceCard } from '@/lib/dashboardEvidence';
import type { DashboardCommand, DashboardEvidenceCardId } from '@/lib/dashboardCommandRegistry';
import type { DashboardScopeDescriptor } from '@/lib/dashboardScope';
import { dashboardScopeDetail, dashboardScopeLabel } from '@/lib/dashboardScope';
import { buildDashboardCommandActionContract } from '@/lib/dashboardCommandActionContract';
import {
  getDashboardLifecycleDisableReason,
  isDashboardLifecycleCommandSupported,
} from '@/lib/projectCapabilities';
import { ActionTile, ActionTileGrid } from './ActionTile';
import { ColumnHeader } from './SectionHeader';
import {
  WORKSPAI_AI_ASSISTANT_PROJECT_TITLE,
  WORKSPAI_AI_ASSISTANT_SHORT_LABEL,
  WORKSPAI_AI_ASSISTANT_TILE_DETAIL,
  WORKSPAI_INCIDENT_STUDIO_LABEL,
  WORKSPAI_INCIDENT_STUDIO_PROJECT_TILE_DETAIL,
  WORKSPAI_INCIDENT_STUDIO_SHORT_LABEL,
} from '@/lib/workspaiAiNarrative';

interface ProjectActionsProps {
  workspaceStatus: WorkspaceStatus;
  scope: DashboardScopeDescriptor;
  evidence?: DashboardEvidencePayload | null;
  pendingCardIds?: DashboardEvidenceCardId[];
  onTerminal: () => void;
  onInit: () => void;
  onDev: () => void;
  onStop: () => void;
  onTest: () => void;
  onDoctor: () => void;
  onArchitecture: () => void;
  onIncident: () => void;
  onAI: () => void;
  onRelease: () => void;
  onImpact: () => void;
  onBrowser: () => void;
  onBuild: () => void;
  onLint?: () => void;
  onFormat?: () => void;
  onRevealArtifact?: (artifactPath: string) => void;
}

function formatProjectDoctorTime(generatedAt?: string): string {
  if (!generatedAt) {
    return 'No run yet';
  }
  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) {
    return 'Evidence timestamp unknown';
  }
  const elapsedMs = Date.now() - timestamp;
  if (elapsedMs < 60_000) {
    return 'Updated just now';
  }
  const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60_000));
  if (elapsedMinutes < 60) {
    return `Updated ${elapsedMinutes}m ago`;
  }
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `Updated ${elapsedHours}h ago`;
  }
  return `Updated ${Math.round(elapsedHours / 24)}d ago`;
}

function projectDoctorStatusTone(card?: DashboardEvidenceCard): 'pass' | 'warn' | 'fail' | 'missing' {
  return card?.status ?? 'missing';
}

export function ProjectActions({
  workspaceStatus,
  scope,
  evidence,
  pendingCardIds = [],
  onTerminal,
  onInit,
  onDev,
  onStop,
  onTest,
  onDoctor,
  onArchitecture,
  onIncident,
  onAI,
  onRelease,
  onImpact,
  onBrowser,
  onBuild,
  onLint,
  onFormat,
  onRevealArtifact,
}: ProjectActionsProps) {
  if (!workspaceStatus.hasWorkspace) {
    return null;
  }

  const isRunning = workspaceStatus.isRunning || false;
  const capabilities = workspaceStatus.projectCapabilities;
  const projectScope =
    workspaceStatus.projectName || workspaceStatus.projectType || 'Selected project';
  const capabilitySubtitle = capabilities?.available
    ? `${capabilities.frameworkDisplayName || projectScope}${
        capabilities.moduleSupport ? ' · modules enabled' : ' · no modules'
      }`
    : projectScope;
  const projectPathLabel = workspaceStatus.projectName || 'Select a project from the sidebar';
  const supportLabel = capabilities?.available
    ? capabilities.moduleSupport
      ? 'Modules ready'
      : 'Lifecycle ready'
    : 'Capability unknown';

  const projectDoctorCard = findEvidenceCard(evidence, 'projectDoctor');
  const importReadinessCard = findEvidenceCard(evidence, 'importReadiness');
  const isPending = (cardId: DashboardEvidenceCardId) => pendingCardIds.includes(cardId);
  const commandContract = (command: DashboardCommand, disabledReason?: string) =>
    buildDashboardCommandActionContract(command, { evidence, disabledReason });
  const doctorTone = projectDoctorStatusTone(projectDoctorCard);
  const doctorBlockers = projectDoctorCard?.blockers?.filter(Boolean).slice(0, 2) ?? [];
  const doctorHasArtifact = Boolean(projectDoctorCard?.artifactPath?.trim());
  const doctorActionLabel =
    projectDoctorCard && projectDoctorCard.status !== 'missing' ? 'Re-run' : 'Run';

  const lifecycleTile = (
    dashboardCommand: DashboardCommand,
    icon: ReactNode,
    label: string,
    detail: string,
    onClick: () => void,
    options?: { variant?: 'default' | 'primary' | 'danger' | 'warn'; fullWidth?: boolean }
  ) => {
    const supported = isDashboardLifecycleCommandSupported(capabilities, dashboardCommand);
    const disableReason = getDashboardLifecycleDisableReason(capabilities, dashboardCommand);
    return (
      <ActionTile
        icon={icon}
        label={label}
        detail={supported ? detail : disableReason || 'Not supported for this project'}
        variant={options?.variant}
        fullWidth={options?.fullWidth}
        onClick={onClick}
        disabled={!supported}
        actionContract={commandContract(dashboardCommand, supported ? undefined : disableReason)}
        title={supported ? detail : disableReason || `${label} is not supported for this project`}
      />
    );
  };

  return (
    <div className="workspai-action-panel">
      <ColumnHeader title="Project actions" subtitle={capabilitySubtitle} scope="project" />
      <div className="project-actions-summary" aria-label="Selected project summary">
        <div className="project-actions-summary__main">
          <span className="ws-kicker">Selected project</span>
          <strong>{dashboardScopeLabel(scope)}</strong>
          <small>{dashboardScopeDetail(scope, { showPaths: false }) || projectPathLabel}</small>
        </div>
        <div className="project-actions-summary__meta">
          <span>
            {capabilities?.frameworkDisplayName || workspaceStatus.projectType || 'Project'}
          </span>
          <strong>{supportLabel}</strong>
        </div>
      </div>
      <ActionTileGrid layout="project">
        {isRunning ? (
          <ActionTile
            icon={<Square size={15} />}
            label="Stop"
            detail="Stop dev server"
            variant="danger"
            onClick={onStop}
            actionContract={commandContract('projectStop')}
            title="Stop Server"
          />
        ) : (
          lifecycleTile('projectDev', <Play size={15} />, 'Dev', 'Start server', onDev, {
            variant: 'primary',
          })
        )}
        {lifecycleTile('projectTest', <TestTube size={15} />, 'Test', 'Run tests', onTest)}
        <article
          className={`project-doctor-card project-doctor-card--${doctorTone}${isPending('projectDoctor') ? ' is-running' : ''}`}
          aria-label="Project Doctor evidence"
        >
          <div className="project-doctor-card__header">
            <span className="project-doctor-card__icon" aria-hidden="true">
              <Stethoscope size={15} />
            </span>
            <span className="project-doctor-card__title">
              <strong>Doctor</strong>
              <small>{projectDoctorCard?.summary || 'Health scan for selected project'}</small>
            </span>
            <span
              className={`project-doctor-card__status project-doctor-card__status--${doctorTone}`}
            >
              {isPending('projectDoctor') ? 'Running' : evidenceStatusLabel(doctorTone)}
            </span>
          </div>
          <div className="project-doctor-card__meta">
            <span>{formatProjectDoctorTime(projectDoctorCard?.generatedAt)}</span>
            <span>{doctorHasArtifact ? 'artifact ready' : 'artifact pending'}</span>
          </div>
          {doctorBlockers.length > 0 ? (
            <ul className="project-doctor-card__blockers" aria-label="Project doctor issues">
              {doctorBlockers.map((blocker) => (
                <li key={blocker}>
                  <AlertTriangle size={11} aria-hidden="true" />
                  <span>{blocker}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="project-doctor-card__actions">
            <button
              type="button"
              className="project-doctor-card__button project-doctor-card__button--primary"
              onClick={onDoctor}
              disabled={isPending('projectDoctor')}
              title="Run Project Doctor for the selected project"
            >
              <RefreshCw size={12} aria-hidden="true" />
              {doctorActionLabel}
            </button>
            {doctorHasArtifact && onRevealArtifact ? (
              <button
                type="button"
                className="project-doctor-card__button"
                onClick={() => onRevealArtifact(projectDoctorCard!.artifactPath!)}
                title="Open latest Project Doctor artifact"
              >
                <FileJson size={12} aria-hidden="true" />
                Artifact
              </button>
            ) : null}
          </div>
        </article>
        {lifecycleTile('projectBuild', <Hammer size={15} />, 'Build', 'Compile project', onBuild, {
          variant: 'warn',
        })}
        <ActionTile
          icon={<Terminal size={15} />}
          label="Terminal"
          detail="Shell access"
          onClick={onTerminal}
          actionContract={commandContract('projectTerminal')}
          title="Open Terminal"
        />
        <ActionTile
          icon={<Globe size={15} />}
          label="Browser"
          detail={isRunning ? `Port ${workspaceStatus.runningPort || 8000}` : 'Start dev first'}
          onClick={onBrowser}
          disabled={!isRunning}
          actionContract={commandContract(
            'projectBrowser',
            isRunning ? undefined : 'Start dev first'
          )}
          title={
            isRunning
              ? `Open in Browser (port ${workspaceStatus.runningPort || 8000})`
              : 'Start server first'
          }
        />
      </ActionTileGrid>
      <details
        className="enterprise-flow-accordion enterprise-flow-secondary project-actions__advanced"
        data-default-collapsed="true"
      >
        <summary className="enterprise-flow-accordion__summary enterprise-flow-secondary__summary">
          <span>Advanced project actions</span>
          <small>Init, checks, Advisor, Studio, release</small>
        </summary>
        <div className="enterprise-flow-accordion__body">
          <ActionTileGrid layout="project">
            {lifecycleTile('projectInit', <Package size={15} />, 'Init', 'Install deps', onInit)}
            {onLint
              ? lifecycleTile(
                  'projectLint',
                  <ScanLine size={15} />,
                  'Lint',
                  'Static checks',
                  onLint
                )
              : null}
            {onFormat
              ? lifecycleTile(
                  'projectFormat',
                  <Wand2 size={15} />,
                  'Format',
                  'Code style',
                  onFormat
                )
              : null}
            {importReadinessCard ? (
              <ActionTile
                icon={<ShieldCheck size={15} />}
                label="Import readiness"
                detail={importReadinessCard.summary}
                evidenceStatus={importReadinessCard.status}
                pending={isPending('importReadiness')}
                onClick={onDoctor}
                actionContract={commandContract('projectDoctor')}
                title="Re-run project doctor to refresh import readiness"
              />
            ) : null}
            <ActionTile
              icon={<GitBranch size={15} />}
              label="Map"
              detail="Architecture"
              onClick={onArchitecture}
              actionContract={commandContract('projectArchitecture')}
              title="Open Architecture Map"
            />
            <ActionTile
              icon={<BrainCircuit size={15} />}
              label={WORKSPAI_AI_ASSISTANT_SHORT_LABEL}
              detail={WORKSPAI_AI_ASSISTANT_TILE_DETAIL}
              onClick={onAI}
              title={WORKSPAI_AI_ASSISTANT_PROJECT_TITLE}
            />
            <ActionTile
              icon={<BrainCircuit size={15} />}
              label={WORKSPAI_INCIDENT_STUDIO_SHORT_LABEL}
              detail={WORKSPAI_INCIDENT_STUDIO_PROJECT_TILE_DETAIL}
              onClick={onIncident}
              title={`Analyze in ${WORKSPAI_INCIDENT_STUDIO_LABEL}`}
            />
            <ActionTile
              icon={<Layers size={15} />}
              label="Impact"
              detail="Change blast"
              onClick={onImpact}
              actionContract={commandContract('projectImpact')}
              title="Assess Change Impact"
            />
            <ActionTile
              icon={<ShieldCheck size={15} />}
              label="Release"
              detail="Readiness gate"
              onClick={onRelease}
              actionContract={commandContract('projectRelease')}
              title="Release Readiness Commander"
            />
          </ActionTileGrid>
        </div>
      </details>
    </div>
  );
}
