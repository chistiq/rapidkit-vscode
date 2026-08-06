import {
  Database,
  ClipboardCheck,
  FileCheck2,
  HardDrive,
  Network,
  RefreshCw,
  Rocket,
  Scale,
  Server,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { DashboardEvidenceCardId } from '@/lib/dashboardCommandRegistry';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import { findEvidenceCard, isBootstrapPendingCard } from '@/lib/dashboardEvidence';
import { buildDashboardCommandActionContract } from '@/lib/dashboardCommandActionContract';
import type { WorkspaceStatus } from '@/types';
import { ActionTile, ActionTileGrid } from './ActionTile';
import { ColumnHeader } from './SectionHeader';

interface WorkspaceGovernancePanelProps {
  workspaceStatus: WorkspaceStatus;
  evidence?: DashboardEvidencePayload | null;
  pendingCardIds?: DashboardEvidenceCardId[];
  onBootstrap: () => void;
  onSetup: () => void;
  onWorkspaceSync: () => void;
  onFoundationEnsure: () => void;
  onContractInspect: () => void;
  onContractVerify: () => void;
  onReadiness: () => void;
  onAutopilotRelease: () => void;
  onMirrorOps: () => void;
  onCacheStatus: () => void;
  onPolicy: () => void;
  onInfra: () => void;
}

function governanceDetail(
  evidence: DashboardEvidencePayload | null | undefined,
  cardId: Parameters<typeof findEvidenceCard>[1],
  fallback: string
): string {
  const card = findEvidenceCard(evidence, cardId);
  if (!card) {
    return fallback;
  }
  if (card.status === 'missing' && !isBootstrapPendingCard(card)) {
    return fallback;
  }
  return card.summary;
}

export function WorkspaceGovernancePanel({
  workspaceStatus,
  evidence,
  pendingCardIds = [],
  onBootstrap,
  onSetup,
  onWorkspaceSync,
  onFoundationEnsure,
  onContractInspect,
  onContractVerify,
  onReadiness,
  onAutopilotRelease,
  onMirrorOps,
  onCacheStatus,
  onPolicy,
  onInfra,
}: WorkspaceGovernancePanelProps) {
  const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
  const isPending = (cardId: DashboardEvidenceCardId) => pendingCardIds.includes(cardId);
  const commandContract = (
    command: Parameters<typeof buildDashboardCommandActionContract>[0],
    disabledReason?: string
  ) => buildDashboardCommandActionContract(command, { evidence, disabledReason });
  const bootstrapCard = findEvidenceCard(evidence, 'bootstrap');
  const setupCard = findEvidenceCard(evidence, 'setup');
  const workspaceSyncCard = findEvidenceCard(evidence, 'workspaceSync');
  const foundationCard = findEvidenceCard(evidence, 'foundation');
  const contractCard = findEvidenceCard(evidence, 'contract');
  const readinessCard = findEvidenceCard(evidence, 'readiness');
  const autopilotCard = findEvidenceCard(evidence, 'autopilot');
  const mirrorCard = findEvidenceCard(evidence, 'mirror');
  const cacheCard = findEvidenceCard(evidence, 'cache');
  const policyCard = findEvidenceCard(evidence, 'policy');
  const infraCard = findEvidenceCard(evidence, 'infra');

  return (
    <section
      id="dashboard-operate-governance"
      className="workspace-governance-panel section dashboard-operate-zone"
    >
      <ColumnHeader
        title="Governance"
        subtitle="Bootstrap, sync, contracts, readiness, and release gates"
        scope="workspace"
      />
      <ActionTileGrid layout="auto">
        <ActionTile
          variant="primary"
          fullWidth
          icon={<Sparkles size={15} />}
          label="Bootstrap"
          detail={governanceDetail(evidence, 'bootstrap', 'Profile compliance')}
          evidenceStatus={bootstrapCard?.status}
          stateLabel={isBootstrapPendingCard(bootstrapCard) ? 'Pending' : undefined}
          pending={isPending('bootstrap')}
          onClick={onBootstrap}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceBootstrap',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="npx workspai bootstrap"
        />
        <ActionTile
          icon={<RefreshCw size={15} />}
          label="Workspace Sync"
          detail={governanceDetail(evidence, 'workspaceSync', 'Refresh workspace state')}
          evidenceStatus={workspaceSyncCard?.status}
          pending={isPending('workspaceSync')}
          stateLabel={isPending('workspaceSync') ? 'Syncing' : undefined}
          onClick={onWorkspaceSync}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceSync',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="workspai workspace sync"
        />
        <ActionTile
          icon={<Network size={15} />}
          label="Contract"
          detail={governanceDetail(evidence, 'contract', 'Inspect workspace contract')}
          evidenceStatus={contractCard?.status}
          pending={isPending('contract')}
          stateLabel={isPending('contract') ? 'Inspecting' : undefined}
          onClick={onContractInspect}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceContractInspect',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="workspai workspace contract inspect"
        />
        <ActionTile
          icon={<ShieldCheck size={15} />}
          label="Readiness"
          detail={governanceDetail(evidence, 'readiness', 'Release evidence')}
          evidenceStatus={readinessCard?.status}
          pending={isPending('readiness')}
          onClick={onReadiness}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceReadiness',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="npx workspai readiness"
        />
        <ActionTile
          icon={<Rocket size={15} />}
          label="Autopilot Release"
          detail={governanceDetail(evidence, 'autopilot', 'Release gate evidence')}
          evidenceStatus={autopilotCard?.status}
          pending={isPending('autopilot')}
          onClick={onAutopilotRelease}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceAutopilotRelease',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="npx workspai autopilot release"
        />
      </ActionTileGrid>
      <details
        className="enterprise-flow-accordion enterprise-flow-secondary workspace-governance-panel__advanced"
        data-default-collapsed="true"
      >
        <summary className="enterprise-flow-accordion__summary enterprise-flow-secondary__summary">
          <span>Advanced governance</span>
          <small>Setup, foundation, mirror, cache, policy, infra</small>
        </summary>
        <div className="enterprise-flow-accordion__body">
          <ActionTileGrid layout="auto">
            <ActionTile
              icon={<Wrench size={15} />}
              label="Setup"
              detail={governanceDetail(evidence, 'setup', 'Pin Node/Python runtimes')}
              evidenceStatus={setupCard?.status}
              pending={isPending('setup')}
              onClick={onSetup}
              disabled={!hasWorkspace}
              actionContract={commandContract(
                'workspaceSetup',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title="npx workspai setup"
            />
            <ActionTile
              icon={<FileCheck2 size={15} />}
              label="Foundation"
              detail={governanceDetail(evidence, 'foundation', 'Ensure marker, policy, toolchain')}
              evidenceStatus={foundationCard?.status}
              pending={isPending('foundation')}
              stateLabel={isPending('foundation') ? 'Ensuring' : undefined}
              onClick={onFoundationEnsure}
              disabled={!hasWorkspace}
              actionContract={commandContract(
                'workspaceFoundationEnsure',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title="workspai workspace foundation ensure"
            />
            <ActionTile
              icon={<ClipboardCheck size={15} />}
              label="Verify Contract"
              detail="Strict contract validation"
              evidenceStatus={contractCard?.status}
              pending={isPending('contract')}
              stateLabel={isPending('contract') ? 'Verifying' : undefined}
              onClick={onContractVerify}
              disabled={!hasWorkspace}
              actionContract={commandContract(
                'workspaceContractVerify',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title="workspai workspace contract verify --strict"
            />
            <ActionTile
              icon={<Database size={15} />}
              label="Mirror Operations"
              detail={governanceDetail(evidence, 'mirror', 'Status · sync · verify · rotate')}
              evidenceStatus={mirrorCard?.status}
              pending={isPending('mirror')}
              onClick={onMirrorOps}
              disabled={!hasWorkspace}
              actionContract={commandContract(
                'mirrorOps',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title="npx workspai mirror status | sync | verify | rotate"
            />
            <ActionTile
              icon={<HardDrive size={15} />}
              label="Cache"
              detail={governanceDetail(evidence, 'cache', 'Package cache')}
              evidenceStatus={cacheCard?.status}
              pending={isPending('cache')}
              onClick={onCacheStatus}
              disabled={!hasWorkspace}
              actionContract={commandContract(
                'cacheStatus',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title="npx workspai cache status"
            />
            <ActionTile
              icon={<Scale size={15} />}
              label="Policy"
              detail={governanceDetail(evidence, 'policy', 'Governance rules')}
              evidenceStatus={policyCard?.status}
              pending={isPending('policy')}
              onClick={onPolicy}
              disabled={!hasWorkspace}
              actionContract={commandContract(
                'workspacePolicyShow',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title="workspai workspace policy show"
            />
            <ActionTile
              icon={<Server size={15} />}
              label="Infra"
              detail={governanceDetail(evidence, 'infra', 'Sidecar compose')}
              evidenceStatus={infraCard?.status}
              pending={isPending('infra')}
              onClick={onInfra}
              disabled={!hasWorkspace}
              actionContract={commandContract(
                'workspaceInfra',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title="npx workspai infra"
            />
          </ActionTileGrid>
        </div>
      </details>
    </section>
  );
}
