import {
  Database,
  ClipboardCheck,
  FileCheck2,
  HardDrive,
  Network,
  RefreshCw,
  Scale,
  Server,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { DashboardEvidenceCardId } from '@/lib/dashboardCommandRegistry';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import { findEvidenceCard } from '@/lib/dashboardEvidence';
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
  onMirrorStatus: () => void;
  onMirrorSync: () => void;
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
  if (!card || card.status === 'missing') {
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
  onMirrorStatus,
  onMirrorSync,
  onCacheStatus,
  onPolicy,
  onInfra,
}: WorkspaceGovernancePanelProps) {
  const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
  const scopeLabel = workspaceStatus.workspaceName || 'Workspace governance';
  const isPending = (cardId: DashboardEvidenceCardId) => pendingCardIds.includes(cardId);
  const bootstrapCard = findEvidenceCard(evidence, 'bootstrap');
  const doctorCard = findEvidenceCard(evidence, 'doctor');
  const workspaceSyncCard = findEvidenceCard(evidence, 'workspaceSync');
  const foundationCard = findEvidenceCard(evidence, 'foundation');
  const contractCard = findEvidenceCard(evidence, 'contract');
  const readinessCard = findEvidenceCard(evidence, 'readiness');
  const mirrorCard = findEvidenceCard(evidence, 'mirror');
  const cacheCard = findEvidenceCard(evidence, 'cache');
  const policyCard = findEvidenceCard(evidence, 'policy');
  const infraCard = findEvidenceCard(evidence, 'infra');

  return (
    <section className="workspace-governance-panel section">
      <ColumnHeader
        title="Governance"
        subtitle={hasWorkspace ? scopeLabel : 'Select a workspace to unlock'}
        scope="workspace"
      />
      <ActionTileGrid layout="governance">
        <ActionTile
          icon={<Sparkles size={15} />}
          label="Bootstrap"
          detail={governanceDetail(evidence, 'bootstrap', 'Profile compliance')}
          evidenceStatus={bootstrapCard?.status}
          pending={isPending('bootstrap')}
          onClick={onBootstrap}
          disabled={!hasWorkspace}
          title="rapidkit bootstrap"
        />
        <ActionTile
          icon={<Wrench size={15} />}
          label="Setup"
          detail={governanceDetail(evidence, 'doctor', 'Runtime toolchains')}
          evidenceStatus={doctorCard?.status}
          pending={isPending('doctor')}
          onClick={onSetup}
          disabled={!hasWorkspace}
          title="rapidkit setup"
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
          title="rapidkit workspace sync"
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
          title="rapidkit workspace foundation ensure"
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
          title="rapidkit workspace contract inspect"
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
          title="rapidkit workspace contract verify --strict"
        />
        <ActionTile
          icon={<ShieldCheck size={15} />}
          label="Readiness"
          detail={governanceDetail(evidence, 'readiness', 'Release evidence')}
          evidenceStatus={readinessCard?.status}
          pending={isPending('readiness')}
          onClick={onReadiness}
          disabled={!hasWorkspace}
          title="rapidkit readiness"
        />
        <ActionTile
          icon={<Database size={15} />}
          label="Mirror"
          detail={governanceDetail(evidence, 'mirror', 'Replication status')}
          evidenceStatus={mirrorCard?.status}
          pending={isPending('mirror')}
          onClick={onMirrorStatus}
          disabled={!hasWorkspace}
          title="rapidkit mirror status"
        />
        <ActionTile
          icon={<RefreshCw size={15} />}
          label="Mirror Sync"
          detail="Refresh mirror"
          pending={isPending('mirror')}
          stateLabel={isPending('mirror') ? 'Syncing' : undefined}
          onClick={onMirrorSync}
          disabled={!hasWorkspace}
          title="rapidkit mirror sync"
        />
        <ActionTile
          icon={<HardDrive size={15} />}
          label="Cache"
          detail={governanceDetail(evidence, 'cache', 'Package cache')}
          evidenceStatus={cacheCard?.status}
          pending={isPending('cache')}
          onClick={onCacheStatus}
          disabled={!hasWorkspace}
          title="rapidkit cache status"
        />
        <ActionTile
          icon={<Scale size={15} />}
          label="Policy"
          detail={governanceDetail(evidence, 'policy', 'Governance rules')}
          evidenceStatus={policyCard?.status}
          pending={isPending('policy')}
          onClick={onPolicy}
          disabled={!hasWorkspace}
          title="rapidkit workspace policy show"
        />
        <ActionTile
          icon={<Server size={15} />}
          label="Infra"
          detail={governanceDetail(evidence, 'infra', 'Sidecar compose')}
          evidenceStatus={infraCard?.status}
          pending={isPending('infra')}
          onClick={onInfra}
          disabled={!hasWorkspace}
          title="rapidkit infra"
        />
      </ActionTileGrid>
    </section>
  );
}
