// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EvidenceCardActions,
  resolveVisiblePrimaryEvidenceAction,
} from '../../webview-ui/src/components/EvidenceCardActions';

let container: HTMLDivElement;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

describe('EvidenceCardActions', () => {
  it('keeps explicit Studio primary actions visible even when agent secondary actions are hidden', () => {
    expect(
      resolveVisiblePrimaryEvidenceAction({
        primaryAction: { type: 'studio', label: 'Fix by Workspai' },
        canRun: false,
        hasRunHandler: false,
        hasStudioHandler: true,
        showAgentActions: false,
        runLabel: 'Run',
      })
    ).toEqual({ type: 'studio', label: 'Fix by Workspai' });
  });

  it('does not invent a Studio fallback when agent actions are hidden', () => {
    expect(
      resolveVisiblePrimaryEvidenceAction({
        canRun: false,
        hasRunHandler: false,
        hasStudioHandler: true,
        showAgentActions: false,
        runLabel: 'Run',
      })
    ).toBeUndefined();
  });

  it('dismisses the More popover on outside pointer input and Escape', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(EvidenceCardActions, {
          cardId: 'doctor',
          canRefresh: true,
          onRefresh: vi.fn(),
        })
      );
    });

    const overflow = container.querySelector('details');
    expect(overflow).not.toBeNull();

    overflow!.open = true;
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(overflow!.open).toBe(false);

    overflow!.open = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(overflow!.open).toBe(false);
    expect(document.activeElement).toBe(overflow!.querySelector('summary'));

    await act(async () => root.unmount());
  });

  it('offers the full agent handoff as a distinct copy action', async () => {
    const onCopyAgentHandoff = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(EvidenceCardActions, {
          cardId: 'doctor',
          canRefresh: false,
          onCopyAgentHandoff,
        })
      );
    });

    const copyButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Copy agent handoff'
    );
    expect(copyButton).toBeDefined();
    await act(async () => copyButton!.click());
    expect(onCopyAgentHandoff).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});
