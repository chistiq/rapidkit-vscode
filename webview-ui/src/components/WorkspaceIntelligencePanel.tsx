import {
  Brain,
  Camera,
  Eye,
  Files,
  GitCompare,
  ListTree,
  Network,
  Plug,
  Radar,
  Route,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Terminal,
} from 'lucide-react';
import {
  AGENT_REPORTS_INDEX_PATH,
  WORKSPACE_MODEL_DIFF_REPORT_PATH,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
} from '@/lib/workspaceIntelligencePaths';
import type { DashboardEvidenceCardId } from '@/lib/dashboardCommandRegistry';
import type { DashboardEvidenceCard, DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import {
  evidenceCardStatusLabel,
  findEvidenceCard,
  resolveEvidenceCardPosture,
  resolveEvidenceFreshness,
} from '@/lib/dashboardEvidence';
import { EvidencePostureIcon } from './EvidencePostureIcon';
import { buildDashboardCommandActionContract } from '@/lib/dashboardCommandActionContract';
import type { WorkspaceStatus } from '@/types';
import { ActionTile, ActionTileGrid } from './ActionTile';
import { ColumnHeader } from './SectionHeader';
import { IntelligenceDetailAccordion } from './IntelligenceDetailAccordion';
import { WorkspaceGraphPreview } from './WorkspaceGraphPreview';
import { findWorkspaceGraphSection } from '@/lib/workspaceModelGraphVisual';
import { getWorkspaceIntelligenceCanonicalStages } from '@workspai-contracts/workspaceIntelligenceChain';

const CANONICAL_INTELLIGENCE_CHAIN_LABEL = getWorkspaceIntelligenceCanonicalStages()
  .map((stage) => stage.label)
  .join(' → ');

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
  onWorkspaceExplain?: () => void;
  onWorkspaceWhy?: () => void;
  onWorkspaceTrace?: () => void;
  onWorkspaceWatch?: () => void;
  onWorkspaceMcp?: () => void;
  onWorkspaceImpactLens?: () => void;
  onRunImpactLensCli?: () => void;
  onRunFullChain: () => void;
  onWorkspaceGoalCreate?: () => void;
  onWorkspaceGoalShow?: () => void;
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

function basenameFromArtifact(artifactPath?: string): string {
  if (!artifactPath?.trim()) {
    return 'Artifact pending';
  }
  const parts = artifactPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || 'Artifact ready';
}

function explainabilitySource(
  card: DashboardEvidenceCard | undefined,
  dedicatedLabel: string
): string {
  if (!card || card.status === 'missing') {
    return 'Pending';
  }
  if (typeof card.metrics?.derivedFrom === 'string' && card.metrics.derivedFrom.trim()) {
    return `Derived from ${card.metrics.derivedFrom}`;
  }
  return dedicatedLabel;
}

function explainabilitySectionCount(card: DashboardEvidenceCard | undefined): string {
  const count = card?.detailSections?.length ?? 0;
  return `${count} section${count === 1 ? '' : 's'}`;
}

function explainabilityArtifact(card: DashboardEvidenceCard | undefined): string {
  if (!card?.artifactPath?.trim()) {
    return 'No artifact yet';
  }
  return basenameFromArtifact(card.artifactPath);
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
  onWorkspaceExplain,
  onWorkspaceWhy,
  onWorkspaceTrace,
  onWorkspaceWatch,
  onWorkspaceMcp,
  onWorkspaceImpactLens,
  onRunImpactLensCli,
  onRunFullChain,
  onWorkspaceGoalCreate,
  onWorkspaceGoalShow,
  onSendWorkspaceToCopilot,
}: WorkspaceIntelligencePanelProps) {
  const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
  const isPending = (cardId: DashboardEvidenceCardId) => pendingCardIds.includes(cardId);
  const commandContract = (
    command: Parameters<typeof buildDashboardCommandActionContract>[0],
    disabledReason?: string
  ) => buildDashboardCommandActionContract(command, { evidence, disabledReason });

  const modelCard = findEvidenceCard(evidence, 'workspaceModel');
  const modelGraph = findWorkspaceGraphSection(modelCard?.detailSections);
  const modelDetailSections =
    modelCard?.detailSections?.filter((section) => section.id !== 'workspace-graph') ?? [];
  const snapshotCard = findEvidenceCard(evidence, 'intelligenceSnapshot');
  const diffCard = findEvidenceCard(evidence, 'workspaceDiff');
  const impactCard = findEvidenceCard(evidence, 'workspaceImpact');
  const intelligenceRunCard = findEvidenceCard(evidence, 'workspaceIntelligenceRun');
  const contextCard = findEvidenceCard(evidence, 'workspaceContextAgent');
  const groundingCard = findEvidenceCard(evidence, 'agentGrounding');
  const verifyCard = findEvidenceCard(evidence, 'workspaceVerify');
  const explainCard = findEvidenceCard(evidence, 'workspaceExplain');
  const whyCard = findEvidenceCard(evidence, 'workspaceWhy');
  const traceCard = findEvidenceCard(evidence, 'workspaceTrace');
  const watchCard = findEvidenceCard(evidence, 'workspaceWatch');
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
        {onWorkspaceGoalCreate ? (
          <ActionTile
            variant="primary"
            icon={<Target size={15} />}
            label="Create Governed Goal"
            detail="Plain-language outcome → evidence-bound Goal Pack → agent handoff"
            onClick={onWorkspaceGoalCreate}
            disabled={!hasWorkspace}
            actionContract={commandContract(
              'workspaceGoalCreate',
              !hasWorkspace ? 'Select a workspace' : undefined
            )}
            title="workspai goal &lt;intent&gt; --for-agent generic --json"
          />
        ) : null}
        {onWorkspaceGoalShow ? (
          <ActionTile
            icon={<ListTree size={15} />}
            label="Review Goals"
            detail="Active objective, lifecycle, evidence, preparation, and CLI verification"
            onClick={onWorkspaceGoalShow}
            disabled={!hasWorkspace}
            actionContract={commandContract(
              'workspaceGoalShow',
              !hasWorkspace ? 'Select a workspace' : undefined
            )}
            title="workspai goal --list --json"
          />
        ) : null}
        <ActionTile
          variant="primary"
          fullWidth
          icon={<Sparkles size={15} />}
          label="Intelligence Chain"
          detail={CANONICAL_INTELLIGENCE_CHAIN_LABEL}
          evidenceStatus={intelligenceRunCard?.status}
          evidenceCard={intelligenceRunCard}
          pending={
            isPending('workspaceIntelligenceRun') ||
            isPending('workspaceModel') ||
            isPending('intelligenceSnapshot') ||
            isPending('workspaceDiff') ||
            isPending('workspaceImpact') ||
            isPending('workspaceVerify') ||
            isPending('workspaceContextAgent') ||
            isPending('agentGrounding') ||
            isPending('workspaceExplain') ||
            isPending('workspaceWhy') ||
            isPending('workspaceTrace')
          }
          stateLabel={
            isPending('workspaceIntelligenceRun') ||
            isPending('workspaceModel') ||
            isPending('intelligenceSnapshot') ||
            isPending('workspaceDiff') ||
            isPending('workspaceImpact') ||
            isPending('workspaceVerify') ||
            isPending('workspaceContextAgent') ||
            isPending('agentGrounding') ||
            isPending('workspaceExplain') ||
            isPending('workspaceWhy') ||
            isPending('workspaceTrace')
              ? 'Running intelligence chain'
              : undefined
          }
          onClick={onRunFullChain}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceIntelligenceChain',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="workspai workspace intelligence run --for-agent vscode --json"
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
          evidenceCard={modelCard}
          pending={isPending('workspaceModel')}
          onClick={onWorkspaceModel}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceModel',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="workspai workspace model --json --write"
        />
        {modelGraph ? (
          <div className="workspace-intelligence-panel__graph">
            <WorkspaceGraphPreview payload={modelGraph} compact />
          </div>
        ) : null}
        {modelDetailSections.length > 0 ? (
          <IntelligenceDetailAccordion
            title="Workspace model"
            count={modelDetailSections.length}
            hint="Profile, validation, and dependency graph summary"
            icon={<Network size={15} />}
            sections={modelDetailSections}
          />
        ) : null}
        <ActionTile
          icon={<ShieldCheck size={15} />}
          label="Workspace Verify"
          detail={intelligenceDetail(
            evidence,
            'workspaceVerify',
            'Evaluate Workspace Advisor verification evidence'
          )}
          evidenceStatus={verifyCard?.status}
          evidenceCard={verifyCard}
          pending={isPending('workspaceVerify')}
          onClick={onWorkspaceVerify}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceVerify',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="workspai workspace verify --json"
        />
        {onWorkspaceExplain ? (
          <ActionTile
            icon={<Sparkles size={15} />}
            label="Workspace Explain"
            detail={intelligenceDetail(
              evidence,
              'workspaceExplain',
              'Human narrative for release blockers and project posture'
            )}
            evidenceStatus={explainCard?.status}
            evidenceCard={explainCard}
            pending={isPending('workspaceExplain')}
            onClick={onWorkspaceExplain}
            disabled={!hasWorkspace}
            actionContract={commandContract(
              'workspaceExplain',
              !hasWorkspace ? 'Select a workspace' : undefined
            )}
            title="workspai workspace explain release-blocked --json --write"
          />
        ) : null}
        {onWorkspaceWhy ? (
          <ActionTile
            icon={<Sparkles size={15} />}
            label="Workspace Why"
            detail={intelligenceDetail(
              evidence,
              'workspaceWhy',
              'Blocker narrative for agents (alias of explain)'
            )}
            evidenceStatus={whyCard?.status}
            evidenceCard={whyCard}
            pending={isPending('workspaceWhy')}
            onClick={onWorkspaceWhy}
            disabled={!hasWorkspace}
            actionContract={commandContract(
              'workspaceWhy',
              !hasWorkspace ? 'Select a workspace' : undefined
            )}
            title="workspai workspace why release-blocked --json --write"
          />
        ) : null}
        {onWorkspaceTrace ? (
          <ActionTile
            icon={<Route size={15} />}
            label="Workspace Trace"
            detail={intelligenceDetail(
              evidence,
              'workspaceTrace',
              'Trace narrative from last workspace diff'
            )}
            evidenceStatus={traceCard?.status}
            evidenceCard={traceCard}
            pending={isPending('workspaceTrace')}
            onClick={onWorkspaceTrace}
            disabled={!hasWorkspace}
            actionContract={commandContract(
              'workspaceTrace',
              !hasWorkspace ? 'Select a workspace' : undefined
            )}
            title="workspai workspace trace --from workspace-model-diff-last-run.json --json --write"
          />
        ) : null}
        {onWorkspaceExplain || onWorkspaceWhy || onWorkspaceTrace ? (
          <div className="workspace-explainability-stack">
            <div className="workspace-explainability-stack__header">
              <span className="workspace-explainability-stack__icon" aria-hidden="true">
                <ScrollText size={15} />
              </span>
              <span>
                <strong>Explainability stack</strong>
                <small>
                  Explain what is blocked, why it matters, and where the evidence came from.
                </small>
              </span>
            </div>
            <div className="workspace-explainability-stack__grid">
              {[
                {
                  label: 'Explain',
                  question: 'What is the release posture?',
                  card: explainCard,
                  dedicatedLabel: 'workspace-explain-last-run.json',
                },
                {
                  label: 'Why',
                  question: 'Why is this the active blocker?',
                  card: whyCard,
                  dedicatedLabel: 'workspace-why-last-run.json',
                },
                {
                  label: 'Trace',
                  question: 'Where did the evidence come from?',
                  card: traceCard,
                  dedicatedLabel: 'workspace-trace-last-run.json',
                },
              ].map((item) => {
                const freshness = item.card ? resolveEvidenceFreshness(item.card) : null;
                const posture = item.card ? resolveEvidenceCardPosture(item.card) : 'attention';
                return (
                  <article
                    key={item.label}
                    className={`workspace-explainability-stack__item workspace-explainability-stack__item--${posture}`}
                  >
                    <header>
                      <strong>
                        <EvidencePostureIcon posture={posture} size={15} />
                        {item.label}
                      </strong>
                      <span>{item.card ? evidenceCardStatusLabel(item.card) : 'Missing'}</span>
                    </header>
                    <p>{item.question}</p>
                    <dl>
                      <div>
                        <dt>Source</dt>
                        <dd>{explainabilitySource(item.card, item.dedicatedLabel)}</dd>
                      </div>
                      <div>
                        <dt>Artifact</dt>
                        <dd>{explainabilityArtifact(item.card)}</dd>
                      </div>
                      <div>
                        <dt>Freshness</dt>
                        <dd>{freshness ? freshness.label : 'No evidence'}</dd>
                      </div>
                      <div>
                        <dt>Sections</dt>
                        <dd>{explainabilitySectionCount(item.card)}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
        {onWorkspaceWatch ? (
          <ActionTile
            icon={<Eye size={15} />}
            label="Workspace Watch"
            detail={intelligenceDetail(
              evidence,
              'workspaceWatch',
              'One-shot model/graph refresh (--once)'
            )}
            evidenceStatus={watchCard?.status}
            evidenceCard={watchCard}
            pending={isPending('workspaceWatch')}
            onClick={onWorkspaceWatch}
            disabled={!hasWorkspace}
            actionContract={commandContract(
              'workspaceWatch',
              !hasWorkspace ? 'Select a workspace' : undefined
            )}
            title="workspai workspace watch --once --json"
          />
        ) : null}
        {onWorkspaceMcp ? (
          <ActionTile
            icon={<Plug size={15} />}
            label="Workspace MCP"
            detail="Start stdio MCP server for agent tools"
            evidenceStatus={
              groundingCard?.summary?.includes('MCP-ready') ? groundingCard.status : undefined
            }
            evidenceCard={groundingCard?.summary?.includes('MCP-ready') ? groundingCard : undefined}
            onClick={onWorkspaceMcp}
            disabled={!hasWorkspace}
            actionContract={commandContract(
              'workspaceMcp',
              !hasWorkspace ? 'Select a workspace' : undefined
            )}
            title="workspai workspace mcp serve"
          />
        ) : null}
        {onWorkspaceImpactLens ? (
          <ActionTile
            icon={<Network size={15} />}
            label="Workspace Advisor"
            detail="Open Workspai advisor with intelligence context"
            evidenceStatus={impactCard?.status}
            evidenceCard={impactCard}
            pending={
              isPending('workspaceImpact') ||
              isPending('workspaceDiff') ||
              isPending('intelligenceSnapshot')
            }
            onClick={onWorkspaceImpactLens}
            disabled={!hasWorkspace}
            actionContract={commandContract(
              'workspaceImpactLens',
              !hasWorkspace ? 'Select a workspace' : undefined
            )}
            title="Workspai advisor — impact-aware Q&A"
          />
        ) : null}
        {explainCard?.detailSections && explainCard.detailSections.length > 0 ? (
          <IntelligenceDetailAccordion
            title="Explain sections"
            count={explainCard.detailSections.length}
            hint="Narrative from workspace explain report"
            icon={<ScrollText size={15} />}
            sections={explainCard.detailSections}
          />
        ) : null}
        {contextCard?.detailSections && contextCard.detailSections.length > 0 ? (
          <IntelligenceDetailAccordion
            title="Safe commands"
            count={contextCard.detailSections.length}
            hint="Agent-safe CLI commands from context pack"
            icon={<Terminal size={15} />}
            sections={contextCard.detailSections}
          />
        ) : null}
        <ActionTile
          icon={<Brain size={15} />}
          label="Agent Context"
          detail={intelligenceDetail(
            evidence,
            'workspaceContextAgent',
            'Safe commands and fleet stages for AI agents'
          )}
          evidenceStatus={contextCard?.status}
          evidenceCard={contextCard}
          pending={isPending('workspaceContextAgent')}
          onClick={onWorkspaceContextAgent}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceContextAgent',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="workspai workspace context --for-agent --json --write"
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
          evidenceCard={groundingCard}
          pending={isPending('agentGrounding')}
          onClick={onWorkspaceAgentSync ?? onWorkspaceContextAgent}
          disabled={!hasWorkspace}
          actionContract={commandContract(
            'workspaceAgentSync',
            !hasWorkspace ? 'Select a workspace' : undefined
          )}
          title="workspai workspace agent-sync --write --refresh-context --preset enterprise --target vscode --json"
        />
        {groundingCard?.detailSections && groundingCard.detailSections.length > 0 ? (
          <IntelligenceDetailAccordion
            title="MCP tools"
            count={groundingCard.detailSections.length}
            hint="Candidate tools from MCP-ready design report"
            icon={<ListTree size={15} />}
            sections={groundingCard.detailSections}
          />
        ) : null}
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
              evidenceCard={snapshotCard}
              pending={isPending('intelligenceSnapshot')}
              onClick={onIntelligenceSnapshot}
              disabled={!hasWorkspace}
              actionContract={commandContract(
                'workspaceIntelligenceSnapshot',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title="workspai workspace snapshot --json"
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
              evidenceCard={diffCard}
              pending={isPending('workspaceDiff')}
              onClick={onWorkspaceDiff}
              disabled={!hasWorkspace}
              actionContract={commandContract(
                'workspaceDiff',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              title={`workspai workspace diff --from ${WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH} --json`}
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
              evidenceCard={impactCard}
              pending={isPending('workspaceImpact')}
              onClick={onWorkspaceImpact}
              actionContract={commandContract(
                'workspaceImpact',
                !hasWorkspace ? 'Select a workspace' : undefined
              )}
              disabled={!hasWorkspace}
              title={`workspai workspace impact --from ${WORKSPACE_MODEL_DIFF_REPORT_PATH} --json`}
            />
            {onRunImpactLensCli ? (
              <ActionTile
                icon={<Network size={15} />}
                label="Impact Lens"
                detail="Run snapshot → diff → impact CLI chain"
                evidenceStatus={impactCard?.status}
                evidenceCard={impactCard}
                pending={
                  isPending('workspaceImpact') ||
                  isPending('workspaceDiff') ||
                  isPending('intelligenceSnapshot')
                }
                onClick={onRunImpactLensCli}
                disabled={!hasWorkspace}
                actionContract={commandContract(
                  'workspaceImpactLensCli',
                  !hasWorkspace ? 'Select a workspace' : undefined
                )}
                title="workspai workspace snapshot → diff → impact"
              />
            ) : null}
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
