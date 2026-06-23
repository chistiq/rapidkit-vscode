import {
  Brain,
  Camera,
  Files,
  GitCompare,
  Network,
  Radar,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AGENT_REPORTS_INDEX_PATH } from '@/lib/workspaceIntelligencePaths';
import type { DashboardEvidenceCardId } from '@/lib/dashboardCommandRegistry';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import { findEvidenceCard } from '@/lib/dashboardEvidence';
import { buildDashboardCommandActionContract } from '@/lib/dashboardCommandActionContract';
import type { WorkspaceStatus } from '@/types';
import { ActionTile, ActionTileGrid } from './ActionTile';
import { ColumnHeader } from './SectionHeader';

interface WorkspaceIntelligencePanelProps {
  workspaceStatus: WorkspaceStatus;
  evidence?: DashboardEvidencePayload | null;
  pendingCardIds?: DashboardEvidenceCardId[];
  onWorkspaceModel: () => void;
  onIntelligenceSnapshot: () => void;
  onWorkspaceDiff: () => void;
  onWorkspaceImpact: () => void;
  onWorkspaceContextAgent: () => void;
  onWorkspaceAgentSync?: () => void;
  onWorkspaceVerify: () => void;
  onRunFullChain: () => void;
  onSendWorkspaceToCopilot?: () => void;
}

function intelligenceDetail(
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

export function WorkspaceIntelligencePanel({
  workspaceStatus,
  evidence,
  pendingCardIds = [],
  onWorkspaceModel,
  onIntelligenceSnapshot,
  onWorkspaceDiff,
  onWorkspaceImpact,
  onWorkspaceContextAgent,
  onWorkspaceAgentSync,
  onWorkspaceVerify,
  onRunFullChain,
  onSendWorkspaceToCopilot,
}: WorkspaceIntelligencePanelProps) {
  const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
  const isPending = (cardId: DashboardEvidenceCardId) => pendingCardIds.includes(cardId);
  const commandContract = (
    command: Parameters<typeof buildDashboardCommandActionContract>[0],
    disabledReason?: string
  ) => buildDashboardCommandActionContract(command, { evidence, disabledReason });

  const modelCard = findEvidenceCard(evidence, 'workspaceModel');
  const snapshotCard = findEvidenceCard(evidence, 'intelligenceSnapshot');
  const diffCard = findEvidenceCard(evidence, 'workspaceDiff');
  const impactCard = findEvidenceCard(evidence, 'workspaceImpact');
  const contextCard = findEvidenceCard(evidence, 'workspaceContextAgent');
  const groundingCard = findEvidenceCard(evidence, 'agentGrounding');
  const verifyCard = findEvidenceCard(evidence, 'workspaceVerify');
  const hasAgentContext = contextCard?.status !== 'missing';
  const hasAgentGrounding = groundingCard?.status !== 'missing';

  return (
    <section
      id="dashboard-operate-intelligence"
      className="workspace-intelligence-panel section dashboard-operate-zone"
    >
      <ColumnHeader
        title="Intelligence"
        subtitle="Model graph, verification, and agent grounding"
        scope="workspace"
      />
      <ActionTileGrid layout="auto">
        <ActionTile
          variant="primary"
          fullWidth
          icon={<Sparkles size={15} />}
          label="Intelligence Chain"
          detail="Model → snapshot → diff → advisor → verify → agent context → grounding sync"
          pending={
            isPending('workspaceModel') ||
            isPending('intelligenceSnapshot') ||
            isPending('workspaceDiff') ||
            isPending('workspaceImpact') ||
            isPending('workspaceVerify') ||
            isPending('workspaceContextAgent') ||
            isPending('agentGrounding')
          }
          stateLabel={
            isPending('workspaceModel') ||
            isPending('intelligenceSnapshot') ||
            isPending('workspaceDiff') ||
            isPending('workspaceImpact') ||
            isPending('workspaceVerify') ||
            isPending('workspaceContextAgent') ||
            isPending('agentGrounding')
              ? 'Running intelligence chain'
              : undefined
          }
          onClick={onRunFullChain}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceIntelligenceChain',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="rapidkit workspace model/snapshot/diff/impact/verify/context"
        />
        <ActionTile
          icon={<Network size={15} />}
          label="Workspace Model"
          detail={intelligenceDetail(
            evidence,
            'workspaceModel',
            'Canonical project graph and command surface'
          )}
          evidenceStatus={modelCard?.status}
          pending={isPending('workspaceModel')}
          onClick={onWorkspaceModel}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceModel',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="rapidkit workspace model --json --write"
        />
        <ActionTile
          icon={<ShieldCheck size={15} />}
          label="Workspace Verify"
          detail={intelligenceDetail(
            evidence,
            'workspaceVerify',
            'Evaluate Workspace Advisor verification evidence'
          )}
          evidenceStatus={verifyCard?.status}
          pending={isPending('workspaceVerify')}
          onClick={onWorkspaceVerify}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceVerify',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="rapidkit workspace verify --from-impact --json"
        />
        <ActionTile
          icon={<Brain size={15} />}
          label="Agent Context"
          detail={intelligenceDetail(
            evidence,
            'workspaceContextAgent',
            'Safe commands and fleet stages for AI agents'
          )}
          evidenceStatus={contextCard?.status}
          pending={isPending('workspaceContextAgent')}
          onClick={onWorkspaceContextAgent}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceContextAgent',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="rapidkit workspace context --for-agent --json --write"
        />
        <ActionTile
          icon={<Files size={15} />}
          label="Agent Grounding"
          detail={intelligenceDetail(
            evidence,
            'agentGrounding',
            'Sync INDEX.json, AGENTS.md, Copilot, Cursor, and Claude hooks'
          )}
          evidenceStatus={groundingCard?.status}
          pending={isPending('agentGrounding')}
          onClick={onWorkspaceAgentSync ?? onWorkspaceContextAgent}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceAgentSync',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="rapidkit workspace agent-sync --write --refresh-context --preset enterprise --target vscode --json"
        />
      </ActionTileGrid>
      <details
        className="enterprise-flow-accordion enterprise-flow-secondary workspace-intelligence-panel__advanced"
        data-default-collapsed="true"
      >
        <summary className="enterprise-flow-accordion__summary enterprise-flow-secondary__summary">
          <span>Advanced intelligence</span>
          <small>Snapshots, diff, impact, and handoff</small>
        </summary>
        <div className="enterprise-flow-accordion__body">
          <ActionTileGrid layout="auto">
            <ActionTile
              icon={<Camera size={15} />}
              label="Intelligence Snapshot"
              detail={intelligenceDetail(
                evidence,
                'intelligenceSnapshot',
                'Point-in-time workspace model capture'
              )}
              evidenceStatus={snapshotCard?.status}
              pending={isPending('intelligenceSnapshot')}
              onClick={onIntelligenceSnapshot}
              disabled={!hasWorkspace}
              actionContract={commandContract(
                'workspaceIntelligenceSnapshot',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title="rapidkit workspace snapshot --json"
            />
            <ActionTile
              icon={<GitCompare size={15} />}
              label="Workspace Diff"
              detail={intelligenceDetail(
                evidence,
                'workspaceDiff',
                'Compare snapshot against current workspace model'
              )}
              evidenceStatus={diffCard?.status}
              pending={isPending('workspaceDiff')}
              onClick={onWorkspaceDiff}
              disabled={!hasWorkspace}
              actionContract={commandContract(
                'workspaceDiff',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title="rapidkit workspace diff --from <snapshot> --json"
            />
            <ActionTile
              icon={<Radar size={15} />}
              label="Workspace Impact"
              detail={intelligenceDetail(
                evidence,
                'workspaceImpact',
                'Deterministic blast radius from model diff'
              )}
              evidenceStatus={impactCard?.status}
              pending={isPending('workspaceImpact')}
              onClick={onWorkspaceImpact}
              actionContract={commandContract(
                'workspaceImpact',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              disabled={!hasWorkspace}
              title="rapidkit workspace impact --from <diff> --json"
            />
            {onSendWorkspaceToCopilot ? (
              <ActionTile
                icon={<Send size={15} />}
                label="Send to Copilot"
                detail="Workspace path and #file attachments"
                onClick={onSendWorkspaceToCopilot}
                disabled={!hasWorkspace || !hasAgentContext}
              />
            ) : null}
          </ActionTileGrid>
        </div>
      </details>
      {hasWorkspace ? (
        <div className="workspace-intelligence-copilot">
          <p className="workspace-intelligence-copilot__lead">
            Grounding sync writes <code>{AGENT_REPORTS_INDEX_PATH}</code> plus cross-tool agent
            hooks so AI tools share the same workspace truth.
          </p>
          {!hasAgentContext ? (
            <p className="workspace-intelligence-copilot__hint">
              Run Agent Context or the full chain first — without the report, Workspai AI uses
              heuristics only.
            </p>
          ) : null}
          {!hasAgentGrounding ? (
            <p className="workspace-intelligence-copilot__hint">
              Run <strong>Agent Grounding</strong> to publish AGENTS.md and Copilot/Cursor/Claude
              instructions from <code>{AGENT_REPORTS_INDEX_PATH}</code>.
            </p>
          ) : null}
          {diffCard?.artifactPath ? (
            <p className="workspace-intelligence-copilot__hint">
              Last diff artifact is listed in the <strong>Artifacts</strong> tab — open it from
              there after running Workspace Diff.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
