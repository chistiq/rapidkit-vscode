import type * as vscode from 'vscode';

import type { DashboardEvidenceCard, DashboardEvidenceStatus } from './dashboardEvidenceBridge';
import { findEvidenceCardById } from './dashboardEvidenceBridge';

export type DashboardOpsChainStep = 'bootstrap' | 'doctor' | 'analyze' | 'readiness';

export type DashboardOpsChainState = {
  id: string;
  workspacePath: string;
  workspaceName?: string;
  triggeredBy: 'clone' | 'ai-create' | 'import';
  steps: DashboardOpsChainStep[];
  currentStep: DashboardOpsChainStep;
  completedSteps: DashboardOpsChainStep[];
  status: 'running' | 'completed' | 'blocked';
  startedAt: number;
  updatedAt: number;
  lastDetail?: string;
};

const OPS_CHAIN_KEY = 'rapidkit.dashboard.opsChain';

const STEP_COMMANDS: Record<DashboardOpsChainStep, string> = {
  bootstrap: 'workspaceBootstrap',
  doctor: 'checkWorkspaceHealth',
  analyze: 'workspaceAnalyze',
  readiness: 'workspaceReadiness',
};

const STEP_CARD_IDS: Record<DashboardOpsChainStep, DashboardEvidenceCard['id']> = {
  bootstrap: 'bootstrap',
  doctor: 'doctor',
  analyze: 'analyze',
  readiness: 'readiness',
};

const DEFAULT_CHAIN: DashboardOpsChainStep[] = ['bootstrap', 'doctor', 'analyze'];

export function getDashboardOpsChain(
  context: vscode.ExtensionContext
): DashboardOpsChainState | null {
  const raw = context.globalState.get<DashboardOpsChainState>(OPS_CHAIN_KEY);
  return raw && typeof raw === 'object' ? raw : null;
}

export async function startDashboardOpsChain(
  context: vscode.ExtensionContext,
  input: {
    workspacePath: string;
    workspaceName?: string;
    triggeredBy: DashboardOpsChainState['triggeredBy'];
    steps?: DashboardOpsChainStep[];
  }
): Promise<DashboardOpsChainState> {
  const steps = input.steps ?? DEFAULT_CHAIN;
  const next: DashboardOpsChainState = {
    id: `${input.workspacePath}-${Date.now()}`,
    workspacePath: input.workspacePath,
    workspaceName: input.workspaceName,
    triggeredBy: input.triggeredBy,
    steps,
    currentStep: steps[0],
    completedSteps: [],
    status: 'running',
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  await context.globalState.update(OPS_CHAIN_KEY, next);
  return next;
}

export async function clearDashboardOpsChain(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(OPS_CHAIN_KEY, undefined);
}

export function resolveOpsChainCommand(step: DashboardOpsChainStep): string {
  return STEP_COMMANDS[step];
}

export function isEvidenceGreenEnough(status: DashboardEvidenceStatus): boolean {
  return status === 'pass' || status === 'warn';
}

export async function advanceDashboardOpsChain(
  context: vscode.ExtensionContext,
  cards: DashboardEvidenceCard[],
  workspacePath: string
): Promise<DashboardOpsChainState | null> {
  const chain = getDashboardOpsChain(context);
  if (!chain || chain.workspacePath !== workspacePath || chain.status !== 'running') {
    return chain;
  }

  const currentCard = findEvidenceCardById(
    { cards, workspacePath },
    STEP_CARD_IDS[chain.currentStep]
  );
  if (!currentCard || currentCard.status === 'missing') {
    return chain;
  }

  if (currentCard.status === 'fail') {
    const blocked: DashboardOpsChainState = {
      ...chain,
      status: 'blocked',
      updatedAt: Date.now(),
      lastDetail: currentCard.blockers?.[0] ?? currentCard.summary,
    };
    await context.globalState.update(OPS_CHAIN_KEY, blocked);
    return blocked;
  }

  if (!isEvidenceGreenEnough(currentCard.status)) {
    return chain;
  }

  const completedSteps = chain.completedSteps.includes(chain.currentStep)
    ? chain.completedSteps
    : [...chain.completedSteps, chain.currentStep];
  const currentIndex = chain.steps.indexOf(chain.currentStep);
  const nextStep = chain.steps[currentIndex + 1];

  if (!nextStep) {
    const completed: DashboardOpsChainState = {
      ...chain,
      completedSteps,
      status: 'completed',
      updatedAt: Date.now(),
      lastDetail: 'Governance chain completed.',
    };
    await context.globalState.update(OPS_CHAIN_KEY, completed);
    return completed;
  }

  const running: DashboardOpsChainState = {
    ...chain,
    completedSteps,
    currentStep: nextStep,
    updatedAt: Date.now(),
    lastDetail: `${chain.currentStep} complete — ready for ${nextStep}.`,
  };
  await context.globalState.update(OPS_CHAIN_KEY, running);
  return running;
}

export function getNextOpsChainCommand(chain: DashboardOpsChainState | null): string | undefined {
  if (!chain || chain.status !== 'running') {
    return undefined;
  }
  return resolveOpsChainCommand(chain.currentStep);
}
