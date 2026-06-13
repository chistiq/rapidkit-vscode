import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ContextPanel } from '../../webview-ui/src/components/StudioRedesign/regions/ContextPanel';
import { CommandRibbon } from '../../webview-ui/src/components/StudioRedesign/regions/CommandRibbon';
import { PhaseStepper } from '../../webview-ui/src/components/StudioRedesign/regions/PhaseStepper';

describe('Studio enterprise UX presentation', () => {
  it('renders guided context essentials with release gate only', () => {
    const html = renderToStaticMarkup(
      createElement(ContextPanel, {
        health: { modulesOk: 8, modulesWarning: 1, modulesError: 0, systemLastCheck: '2m ago' },
        relatedFiles: [{ path: 'src/auth/service.ts', health: 'ok', freshness: 'fresh' }],
        policyGates: {
          flowState: 'passing',
          telemetryState: 'complete',
          releasePosture: 'go',
        },
        userMode: 'guided',
        releasePosture: 'go',
        aiActionContract: null,
      })
    );

    expect(html).toContain('is-guided-essentials');
    expect(html).toContain('Release Gate');
    expect(html).toContain('Essentials only');
    expect(html).not.toContain('System Health');
    expect(html).not.toContain('Related Files');
    expect(html).toContain('Stabilization KPI');
    expect(html).toContain('Not loaded');
  });

  it('renders lite command ribbon with one-line status and no metric grid', () => {
    const html = renderToStaticMarkup(
      createElement(CommandRibbon, {
        currentPhase: 'verify',
        releasePosture: 'go',
        policyGates: {
          flowState: 'passing',
          telemetryState: 'complete',
          releasePosture: 'go',
        },
        displayMode: 'lite',
        liteReleaseState: {
          label: 'HOLD',
          tone: 'warning',
          summary: 'Hold: 2 stabilization signals need review',
          blocksRelease: false,
        },
        onExecuteAction: () => {},
      })
    );

    expect(html).toContain('is-lite-view');
    expect(html).toContain('studio-command-ribbon__lite-line');
    expect(html).toContain('Verify ·');
    expect(html).not.toContain('studio-command-ribbon__metrics');
  });

  it('renders active phase hint for enterprise stepper guidance', () => {
    const html = renderToStaticMarkup(
      createElement(PhaseStepper, {
        currentPhase: 'diagnose',
        guidedMode: true,
        onSelectPhase: () => {},
      })
    );

    expect(html).toContain('studio-phase-step__hint');
    expect(html).toContain('Correlate evidence to isolate root cause');
    expect(html).toContain('aria-describedby="studio-phase-hint-diagnose"');
  });
});
