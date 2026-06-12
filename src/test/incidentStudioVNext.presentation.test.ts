import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { IncidentStudioVNext } from '../../webview-ui/src/components/StudioRedesign/IncidentStudioVNext';

function renderVNext(embedded = true): string {
  return renderToStaticMarkup(
    createElement(IncidentStudioVNext, {
      embedded,
      initialState: {
        workspaceName: 'Acme Workspace',
        currentPhase: 'triage',
        userMode: 'standard',
      },
    })
  );
}

describe('IncidentStudioVNext presentation', () => {
  it('renders embedded studio shell with conversation and context regions', () => {
    const html = renderVNext(true);

    expect(html).toContain('studio-shell');
    expect(html).toContain('studio-shell--embedded');
    expect(html).toContain('Conversation');
    expect(html).toContain('Operational Posture');
    expect(html).toContain('System Health');
  });
});
