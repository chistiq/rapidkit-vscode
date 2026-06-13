// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextPanel } from '../../webview-ui/src/components/StudioRedesign/regions/ContextPanel';
import type { AIActionContractView } from '../../webview-ui/src/components/StudioRedesign/state/studioState';
import type { IncidentStudioStabilizationKpiStatus } from '../../webview-ui/src/lib/incidentStudioPayload';

function buildValidContract(): AIActionContractView {
  return {
    actionId: 'action-test-1',
    provider: 'test-provider',
    receivedAt: '2026-06-10T00:00:00Z',
    contract: {
      schemaVersion: 'workspai.ai-action.v1',
      actionType: 'fix',
      summary: 'Patch orders service validation',
      riskLevel: 'low',
      affectedFiles: ['src/orders/service.ts'],
      proposedCommands: ['npm run build'],
      proposedPatches: [{ relativePath: 'src/orders/service.ts', summary: 'Fix validation' }],
      verificationCommands: ['npm test'],
      rollbackPlan: ['git checkout -- src/orders/service.ts'],
      confidence: 0.92,
      requiresApproval: true,
    },
    validation: {
      status: 'valid',
      issues: [],
      canApply: true,
      canVerify: true,
      canRollback: true,
    },
  };
}

function buildBaseProps(
  overrides: Partial<ComponentProps<typeof ContextPanel>> = {}
): ComponentProps<typeof ContextPanel> {
  return {
    health: { modulesOk: 8, modulesWarning: 1, modulesError: 0, systemLastCheck: '2m ago' },
    relatedFiles: [],
    policyGates: {
      flowState: 'passing',
      telemetryState: 'complete',
      releasePosture: 'go',
    },
    userMode: 'standard',
    releasePosture: 'go',
    aiActionContract: buildValidContract(),
    onAIActionCommand: vi.fn(),
    ...overrides,
  };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (entry) => entry.textContent?.trim() === label
  );

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button as HTMLButtonElement;
}

function findCheckboxByLabel(container: HTMLElement, text: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll('label')).find((entry) =>
    entry.textContent?.includes(text)
  );

  const checkbox = label?.querySelector('input[type="checkbox"]');
  if (!(checkbox instanceof HTMLInputElement)) {
    throw new Error(`Checkbox not found for label: ${text}`);
  }

  return checkbox;
}

function expandSection(container: HTMLElement, title: string): void {
  const trigger = Array.from(container.querySelectorAll('button[aria-expanded]')).find((entry) =>
    entry.textContent?.includes(title)
  );

  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error(`Collapsible section not found: ${title}`);
  }

  if (trigger.getAttribute('aria-expanded') !== 'true') {
    act(() => {
      trigger.click();
    });
  }
}

describe('ContextPanel interactions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps Apply disabled until the approval checkbox is confirmed', () => {
    act(() => {
      root.render(createElement(ContextPanel, buildBaseProps()));
    });

    expandSection(container, 'AI action gate');

    const applyButton = findButton(container, 'Apply');
    const approvalCheckbox = findCheckboxByLabel(
      container,
      'I reviewed risk, affected files, commands, verification, and rollback posture.'
    );

    expect(applyButton.disabled).toBe(true);
    expect(approvalCheckbox.checked).toBe(false);

    act(() => {
      approvalCheckbox.click();
    });

    expect(approvalCheckbox.checked).toBe(true);
    expect(applyButton.disabled).toBe(false);
  });

  it('routes confirmed Apply clicks through onAIActionCommand', () => {
    const onAIActionCommand = vi.fn();

    act(() => {
      root.render(createElement(ContextPanel, buildBaseProps({ onAIActionCommand })));
    });

    expandSection(container, 'AI action gate');

    act(() => {
      findCheckboxByLabel(
        container,
        'I reviewed risk, affected files, commands, verification, and rollback posture.'
      ).click();
    });

    act(() => {
      findButton(container, 'Apply').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAIActionCommand).toHaveBeenCalledTimes(1);
    expect(onAIActionCommand).toHaveBeenCalledWith('apply');
  });

  it('renders stabilization KPI blockers when telemetry status is provided', () => {
    const stabilizationKpiStatus: IncidentStudioStabilizationKpiStatus = {
      workspacePath: '/workspace/acme',
      timeWindow: 'last7d',
      windowStartAt: '2026-05-01T00:00:00Z',
      windowEndAt: '2026-05-08T00:00:00Z',
      thresholds: {
        routePrecisionMin: 80,
        routeFallbackNonSuccessShareMax: 20,
        verifyPathCompletionRateMin: 70,
        verifyIncompleteWarningRateMax: 10,
        topVerifyPathMissReasonShareMax: 30,
        falseConfidenceRateMax: 15,
        rollbackRecoverySuccessRateMin: 70,
        repeatVerifiedResolutionRateMin: 70,
      },
      metrics: {
        nextActionClicked: 24,
        routeMatchedWithoutFallback: 21,
        routeFallbackCount: 3,
        routePrecision: 88,
        routeFallbackNonSuccessShare: 33,
        verifyRequired: 20,
        verifyPathPresent: 17,
        verifyPathCompletionRate: 85,
        verifyIncompleteWarningCount: 3,
        verifyIncompleteWarningRate: 15,
        verifyFailed: 2,
        rollbackAttempted: 2,
        rollbackSucceeded: 2,
        falseConfidenceRate: 5,
        rollbackRecoverySuccessRate: 100,
        repeatedIncidentDetected: 4,
        repeatVerifiedResolved: 4,
        repeatVerifiedResolutionRate: 100,
        topVerifyPathMissReasonShare: 25,
      },
      gates: {
        telemetryEvidencePass: true,
        routePrecisionPass: true,
        routeFallbackNonSuccessSharePass: false,
        verifyPathCompletionRatePass: true,
        verifyIncompleteWarningRatePass: false,
        falseConfidenceRatePass: true,
        rollbackRecoverySuccessRatePass: true,
        repeatVerifiedResolutionRatePass: true,
        topVerifyPathMissReasonSharePass: true,
        overallPass: true,
      },
    };

    act(() => {
      root.render(createElement(ContextPanel, buildBaseProps({ stabilizationKpiStatus })));
    });

    expandSection(container, 'Stabilization KPI');

    expect(container.textContent).toContain('Stabilization KPI');
    expect(container.textContent).toContain('HOLD');
    expect(container.textContent).toContain('verify warnings: 3 (15%)');
  });
});
