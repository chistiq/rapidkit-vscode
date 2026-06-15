import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MissionControlHeader } from '../../webview-ui/src/components/StudioRedesign/regions/MissionControlHeader';

function renderMissionControl(): string {
  return renderToStaticMarkup(
    createElement(MissionControlHeader, {
      currentPhase: 'triage',
      policyGates: {
        flowState: 'passing',
        telemetryState: 'complete',
        releasePosture: 'go',
      },
      userMode: 'standard',
      scopeType: 'workspace',
      workspaceName: 'Acme Workspace',
      releasePosture: 'go',
      embedded: true,
      onUserModeChange: () => {},
      onScopeChange: () => {},
      onExecuteAction: () => {},
    })
  );
}

describe('MissionControlHeader presentation', () => {
  it('renders merged identity strip and command ribbon', () => {
    const html = renderMissionControl();

    expect(html).toContain('studio-mission-control');
    expect(html).toContain('Acme Workspace');
    expect(html).toContain('Studio command ribbon');
    expect(html).toContain('Release Ready');
  });

  it('renders lite release posture chip when display mode is lite', () => {
    const html = renderToStaticMarkup(
      createElement(MissionControlHeader, {
        currentPhase: 'triage',
        policyGates: {
          flowState: 'passing',
          telemetryState: 'complete',
          releasePosture: 'go',
        },
        userMode: 'guided',
        scopeType: 'workspace',
        workspaceName: 'Acme Workspace',
        releasePosture: 'go',
        embedded: true,
        displayMode: 'lite',
        liteReleaseState: {
          label: 'HOLD',
          tone: 'warning',
          summary: 'Hold: 2 stabilization signals need review',
          blocksRelease: false,
        },
        onUserModeChange: () => {},
        onScopeChange: () => {},
        onExecuteAction: () => {},
      })
    );

    expect(html).toContain('HOLD');
    expect(html).toContain('Hold: 2 stabilization signals need review');
  });

  it('renders telemetry refresh control and lite/full view toggle', () => {
    const html = renderToStaticMarkup(
      createElement(MissionControlHeader, {
        currentPhase: 'triage',
        policyGates: {
          flowState: 'passing',
          telemetryState: 'complete',
          releasePosture: 'go',
        },
        userMode: 'standard',
        scopeType: 'workspace',
        workspaceName: 'Acme Workspace',
        releasePosture: 'go',
        embedded: true,
        displayMode: 'lite',
        telemetryRefreshLabel: '10:35',
        isTelemetryRefreshing: false,
        onDisplayModeChange: () => {},
        onTelemetryRefresh: () => {},
        onUserModeChange: () => {},
        onScopeChange: () => {},
        onExecuteAction: () => {},
      })
    );

    expect(html).toContain('Updated · 10:35');
    expect(html).toContain('Lite');
    expect(html).toContain('Full');
  });
});
