import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WorkspaceSidebar } from '../../webview-ui/src/components/StudioRedesign/regions/WorkspaceSidebar';

function renderSidebar(): string {
  return renderToStaticMarkup(
    createElement(WorkspaceSidebar, {
      items: [
        {
          id: 'decision-layer',
          name: 'Decision Layer',
          type: 'workspace',
        },
      ],
      onItemSelect: () => {},
    })
  );
}

describe('WorkspaceSidebar presentation', () => {
  it('renders capability map with action audit and matrix sections', () => {
    const html = renderSidebar();

    expect(html).toContain('Capability Map');
    expect(html).toContain('Action Audit');
    expect(html).toContain('Action Matrix');
    expect(html).toContain('Decision Layer');
  });
});
