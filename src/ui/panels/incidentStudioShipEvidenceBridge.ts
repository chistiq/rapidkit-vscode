import * as vscode from 'vscode';

import {
  buildDashboardEvidenceBundle,
  type DashboardEvidenceCard,
  type DashboardEvidenceCardId,
} from '../../core/dashboardEvidenceBridge';

export const SHIP_LOOP_EVIDENCE_CARD_IDS: DashboardEvidenceCardId[] = [
  'analyze',
  'readiness',
  'autopilot',
  'archive',
];

export type IncidentStudioShipEvidenceCard = Pick<
  DashboardEvidenceCard,
  'id' | 'status' | 'summary' | 'blockers' | 'generatedAt' | 'artifactPath'
>;

export type IncidentStudioShipEvidencePayload = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  cards: IncidentStudioShipEvidenceCard[];
};

export async function resolveIncidentStudioShipEvidence(input: {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
}): Promise<IncidentStudioShipEvidencePayload> {
  const bundle = await buildDashboardEvidenceBundle(input);
  const cards = bundle.cards
    .filter((card) => SHIP_LOOP_EVIDENCE_CARD_IDS.includes(card.id))
    .map((card) => ({
      id: card.id,
      status: card.status,
      summary: card.summary,
      blockers: card.blockers,
      generatedAt: card.generatedAt,
      artifactPath: card.artifactPath,
    }));

  return {
    workspacePath: bundle.workspacePath,
    projectPath: bundle.projectPath,
    projectName: bundle.projectName,
    cards,
  };
}

export async function postIncidentStudioShipEvidence(
  webview: vscode.Webview,
  input: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    requestId?: string;
  }
): Promise<IncidentStudioShipEvidencePayload> {
  const payload = await resolveIncidentStudioShipEvidence(input);
  await webview.postMessage({
    command: 'incidentStudioShipEvidence',
    data: payload,
    meta: input.requestId ? { requestId: input.requestId } : undefined,
  });
  return payload;
}
