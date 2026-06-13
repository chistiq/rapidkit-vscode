import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WorkspaceSidebar } from '../../webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar';
import type { StudioActionStatus } from '../../webview-ui/src/components/StudioRedesign/state/studioState';

const sampleStudioActionStatus: StudioActionStatus = {
  actionId: 'run-analyze',
  status: 'failed',
  updatedAt: '2026-06-12T10:00:00.000Z',
  detail: 'Analyze blocked · score 55',
  result: {
    summary: 'Analyze blocked · score 55',
    score: 55,
    evidencePath: '.rapidkit/reports/analyze.json',
    evidenceSha256: 'abc123def4567890',
    evidenceSizeBytes: 2048,
    commandCount: 3,
    failedCommandCount: 1,
    failedCommands: ['rapidkit analyze --json'],
  },
};

function renderSidebar(input?: { studioActionStatus?: StudioActionStatus | null }): string {
  return renderToStaticMarkup(
    createElement(WorkspaceSidebar, {
      items: [
        {
          id: 'decision-layer',
          name: 'Decision Layer',
          type: 'workspace',
        },
      ],
      studioActionStatus: input?.studioActionStatus ?? null,
      onItemSelect: () => {},
      onRevealEvidence: () => {},
    })
  );
}

describe('WorkspaceSidebar presentation', () => {
  it('renders capability map with action audit and matrix sections', () => {
    const html = renderSidebar();

    expect(html).toContain('Capability Map');
    expect(html).toContain('Action Audit');
    expect(html).toContain('Action matrix');
    expect(html).toContain('Start here');
    expect(html).toContain('studio-card--matrix');
    expect(html).toContain('Capability map');
    expect(html).toContain('1 live modules');
  });

  it('renders compact action inspector without vertical trace tiles', () => {
    const html = renderSidebar({ studioActionStatus: sampleStudioActionStatus });

    expect(html).toContain('studio-inspector--compact');
    expect(html).toContain('Analyze blocked · score 55');
    expect(html).toContain('Cmd 3 · Fail 1 · 2kb · local bridge');
    expect(html).not.toContain('studio-trace-tile');
    expect(html).not.toContain('Reveal evidence');
    expect(html).toContain('Open');
  });
});
