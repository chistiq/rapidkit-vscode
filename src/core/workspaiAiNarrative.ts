import narrative from '../../contracts/workspai-ai-narrative.v1.json';

export type WorkspaiAiNarrativeContract = typeof narrative;

export const WORKSPAI_AI_NARRATIVE: WorkspaiAiNarrativeContract = narrative;

export const WORKSPAI_AI_ASSISTANT_COMMAND_LABEL = narrative.aiAssistant.commandLabel;
export const WORKSPAI_INCIDENT_STUDIO_LABEL = narrative.incidentStudio.label;
export const WORKSPAI_AI_FLOWS_ONBOARDING_HEADLINE = narrative.aiFlowsOnboarding.headline;
export const WORKSPAI_AI_FLOWS_ONBOARDING_DETAIL = narrative.aiFlowsOnboarding.detail;
