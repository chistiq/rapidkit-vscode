import narrative from '../../../contracts/workspai-ai-narrative.v1.json';

export type WorkspaiAiNarrativeContract = typeof narrative;

export const WORKSPAI_AI_NARRATIVE: WorkspaiAiNarrativeContract = narrative;

export const WORKSPAI_AI_WORKFLOW_LOOP = narrative.workflowLoop;
export const WORKSPAI_AI_WORKFLOW_GUIDANCE = narrative.workflowGuidance;
export const WORKSPAI_DASHBOARD_NEXT_STEPS_META = narrative.dashboardNextStepsMeta;

export const WORKSPAI_INCIDENT_STUDIO_LABEL = narrative.incidentStudio.label;
export const WORKSPAI_INCIDENT_STUDIO_SHORT_LABEL = narrative.incidentStudio.shortLabel;
export const WORKSPAI_INCIDENT_STUDIO_TILE_DETAIL = narrative.incidentStudio.tileDetail;
export const WORKSPAI_INCIDENT_STUDIO_WORKSPACE_TILE_DETAIL =
  narrative.incidentStudio.workspaceTileDetail;
export const WORKSPAI_INCIDENT_STUDIO_PROJECT_TILE_DETAIL =
  narrative.incidentStudio.projectTileDetail;
export const WORKSPAI_INCIDENT_STUDIO_OPEN_HINT = narrative.incidentStudio.openHint;

export const WORKSPAI_AI_ASSISTANT_LABEL = narrative.aiAssistant.label;
export const WORKSPAI_AI_ASSISTANT_SHORT_LABEL = narrative.aiAssistant.shortLabel;
export const WORKSPAI_AI_ASSISTANT_COMMAND_LABEL = narrative.aiAssistant.commandLabel;
export const WORKSPAI_AI_ASSISTANT_TILE_DETAIL = narrative.aiAssistant.tileDetail;
export const WORKSPAI_AI_ASSISTANT_MODULE_TITLE = narrative.aiAssistant.moduleTitle;
export const WORKSPAI_AI_ASSISTANT_WORKSPACE_TITLE = narrative.aiAssistant.workspaceTitle;
export const WORKSPAI_AI_ASSISTANT_PROJECT_TITLE = narrative.aiAssistant.projectTitle;

export const WORKSPAI_STUDIO_GUIDED_EMPTY_TITLE = narrative.studioEmptyState.guidedTitle;
export const WORKSPAI_STUDIO_GUIDED_EMPTY_BODY = narrative.studioEmptyState.guidedBody;
export const WORKSPAI_STUDIO_STANDARD_EMPTY_TITLE = narrative.studioEmptyState.standardTitle;
export const WORKSPAI_STUDIO_STANDARD_EMPTY_BODY = narrative.studioEmptyState.standardBody;

export const WORKSPAI_GUIDED_CHIP_NEXT_DETAIL = narrative.guidedChips.nextStepDetail;
export const WORKSPAI_GUIDED_CHIP_NEXT_DETAIL_WITH_REVIEW =
  narrative.guidedChips.nextStepDetailWithReview;
export const WORKSPAI_GUIDED_CHIP_VERIFY_DETAIL = narrative.guidedChips.verifyDetail;
export const WORKSPAI_GUIDED_CHIP_NEXT_LABEL = narrative.guidedChips.nextStepLabel;
export const WORKSPAI_GUIDED_CHIP_VERIFY_LABEL = narrative.guidedChips.verifyLabel;

export const WORKSPAI_LITE_ASK_NEXT_ACTION = narrative.liteMode.askNextActionButton;
export const WORKSPAI_LITE_RUN_NEXT_ACTION = narrative.liteMode.runNextActionButton;
export const WORKSPAI_LITE_INVESTIGATE_BLOCKER = narrative.liteMode.investigateBlockerButton;
export const WORKSPAI_LITE_PROOF_WITH_BLOCKER = narrative.liteMode.proofButtonWithBlocker;
export const WORKSPAI_LITE_PROOF_DEFAULT = narrative.liteMode.proofButtonDefault;

export const WORKSPAI_AI_FLOWS_ONBOARDING_HEADLINE = narrative.aiFlowsOnboarding.headline;
export const WORKSPAI_AI_FLOWS_ONBOARDING_DETAIL = narrative.aiFlowsOnboarding.detail;
