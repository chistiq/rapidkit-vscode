import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTools, mockInvokeTool } = vi.hoisted(() => ({
  mockTools: [] as Array<{
    name: string;
    description: string;
    tags: string[];
    inputSchema?: Record<string, unknown>;
  }>,
  mockInvokeTool: vi.fn(),
}));

vi.mock('vscode', () => {
  class LanguageModelTextPart {
    constructor(readonly value: string) {}
  }
  class CancellationTokenSource {
    readonly token = { isCancellationRequested: false };
    cancel() {
      (this.token as { isCancellationRequested: boolean }).isCancellationRequested = true;
    }
    dispose() {
      return undefined;
    }
  }
  return {
    lm: {
      get tools() {
        return mockTools;
      },
      invokeTool: mockInvokeTool,
    },
    LanguageModelTextPart,
    CancellationTokenSource,
  };
});

import {
  isReadLikeHostLanguageModelTool,
  listStudioHostLanguageModelTools,
  studioHostLanguageModelToolAdapters,
} from '../core/studioHostLanguageModelTools.js';

describe('Studio host language-model tools', () => {
  beforeEach(() => {
    mockTools.splice(0, mockTools.length);
    mockInvokeTool.mockReset();
  });

  it('classifies read-like host tools and lists the VS Code catalog', () => {
    expect(isReadLikeHostLanguageModelTool(['search'])).toBe(true);
    expect(isReadLikeHostLanguageModelTool(['edit'])).toBe(false);
    mockTools.push(
      {
        name: 'mcp_browser_snapshot',
        description: 'Capture the current page',
        tags: ['read'],
      },
      {
        name: 'mcp_issues_create',
        description: 'Create an issue',
        tags: ['write'],
      }
    );
    expect(listStudioHostLanguageModelTools()).toEqual([
      expect.objectContaining({ name: 'mcp_browser_snapshot', readLike: true }),
      expect.objectContaining({ name: 'mcp_issues_create', readLike: false }),
    ]);
  });

  it('invokes a registered host tool and returns bounded text', async () => {
    mockTools.push({
      name: 'mcp_browser_snapshot',
      description: 'Capture the current page',
      tags: ['read'],
    });
    mockInvokeTool.mockResolvedValue({
      content: [{ value: 'Dashboard loaded' }],
    });
    const adapters = studioHostLanguageModelToolAdapters();
    await expect(
      adapters.invokeHostTool({ name: 'mcp_browser_snapshot', arguments: { fullPage: true } })
    ).resolves.toMatchObject({
      ok: true,
      output: {
        name: 'mcp_browser_snapshot',
        readLike: true,
        text: 'Dashboard loaded',
      },
    });
    expect(mockInvokeTool).toHaveBeenCalledWith(
      'mcp_browser_snapshot',
      { input: { fullPage: true }, toolInvocationToken: undefined },
      expect.anything()
    );
  });
});
