import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChatSurface } from '../../webview-ui/src/components/StudioRedesign/regions/ChatSurface';

function renderChatSurface(): string {
  return renderToStaticMarkup(
    createElement(ChatSurface, {
      messages: [],
      isStreaming: false,
      currentPhase: 'triage',
      scopeType: 'workspace',
      onSendMessage: () => {},
      userMode: 'standard',
    })
  );
}

describe('ChatSurface presentation', () => {
  it('renders conversation shell with decision deck and composer', () => {
    const html = renderChatSurface();

    expect(html).toContain('studio-chat-surface');
    expect(html).toContain('Conversation');
    expect(html).toContain('Decision Layer');
    expect(html).toContain('Start the incident review');
    expect(html).toContain('Message input');
  });

  it('renders guided intent chips and banner in guided mode', () => {
    const html = renderToStaticMarkup(
      createElement(ChatSurface, {
        messages: [
          { id: 'm1', role: 'user', content: 'What failed?', timestamp: new Date().toISOString() },
        ],
        isStreaming: false,
        currentPhase: 'diagnose',
        scopeType: 'workspace',
        onSendMessage: () => {},
        userMode: 'guided',
        guidedMode: true,
        guidedPrimaryBoardAction: {
          label: 'Patch failing contract test',
          command: 'rapidkit add module auth',
        },
        onRunGuidedCommand: () => {},
      })
    );

    expect(html).toContain('Guided route');
    expect(html).toContain('Patch failing contract test');
    expect(html).toContain('Proof this worked');
  });

  it('renders guided empty state copy when guidedMode is enabled', () => {
    const html = renderToStaticMarkup(
      createElement(ChatSurface, {
        messages: [],
        isStreaming: false,
        currentPhase: 'diagnose',
        scopeType: 'workspace',
        onSendMessage: () => {},
        userMode: 'guided',
        guidedMode: true,
        onRunGuidedCommand: () => {},
      })
    );

    expect(html).toContain('One safe route to resolution');
    expect(html).toContain('guided chips');
    expect(html).toContain('Run workspace doctor');
    expect(html).toContain('studio-empty-state__guided-actions');
  });
});
