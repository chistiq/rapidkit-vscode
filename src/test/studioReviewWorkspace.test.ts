import { describe, expect, it, vi } from 'vitest';
import { resolveStudioReviewWorkspace } from '../core/studioReviewWorkspace.js';

describe('Changed file destination ownership', () => {
  it('resolves a native file from its owned transaction rather than the current request destination', async () => {
    const loadTransactionWorkspace = vi.fn(async () => '/managed/previous-workspace');
    expect(
      await resolveStudioReviewWorkspace({
        ...setup(),
        loadTransactionWorkspace,
        record: {
          sessionId: 'chat',
          requestId: 'request',
          transactionId: 'native-test',
          targetRef: 'new-workspace',
          workspacePath: '/wrong-current',
        },
      })
    ).toBe('/managed/previous-workspace');
    expect(loadTransactionWorkspace).toHaveBeenCalledWith('chat', 'native-test', 'request');
    await expect(
      resolveStudioReviewWorkspace({
        ...setup(),
        loadTransactionWorkspace,
        record: { transactionId: 'native-test' },
      })
    ).rejects.toThrow('owning chat');
  });
  it('uses the stored request root when the edited workspace is not an owned target', async () => {
    const loadRequestWorkspace = vi.fn(async () => '/managed/nextjs-demo-workspace');
    const root = await resolveStudioReviewWorkspace({
      ...setup(),
      loadRequestWorkspace,
      record: {
        sessionId: 'test-session',
        requestId: 'test-request',
        workspacePath: '/original-active-workspace',
      },
    });
    expect(root).toBe('/managed/nextjs-demo-workspace');
    expect(loadRequestWorkspace).toHaveBeenCalledWith('test-session', 'test-request');
    await expect(
      resolveStudioReviewWorkspace({
        ...setup(),
        loadRequestWorkspace: async () => undefined,
        record: { sessionId: 'deleted', workspacePath: '/wrong-fallback' },
      })
    ).rejects.toThrow('no longer available');
  });
  const target = { ref: 'workspace-owned', name: 'blog', workspacePath: '/managed/blog' };
  const setup = () => ({
    loadTarget: vi.fn(async () => target),
    validateTarget: vi.fn(async () => {}),
    fallback: vi.fn(async () => '/active'),
  });
  it('uses the host receipt instead of the original active workspace', async () => {
    const deps = setup();
    await expect(
      resolveStudioReviewWorkspace({
        ...deps,
        record: { sessionId: 'chat', targetRef: target.ref, workspacePath: '/original' },
      })
    ).resolves.toBe('/managed/blog');
    expect(deps.loadTarget).toHaveBeenCalledWith('chat', target.ref);
    expect(deps.validateTarget).toHaveBeenCalledWith(target);
    expect(deps.fallback).not.toHaveBeenCalled();
  });
  it('rejects stale and invalid receipts without silently redirecting the review', async () => {
    const deps = setup();
    await expect(
      resolveStudioReviewWorkspace({
        ...deps,
        record: { sessionId: 'chat', targetRef: 'stale', workspacePath: '/original' },
      })
    ).rejects.toThrow('no longer available');
    deps.validateTarget.mockRejectedValueOnce(new Error('Invalid receipt'));
    await expect(
      resolveStudioReviewWorkspace({
        ...deps,
        record: { sessionId: 'chat', targetRef: target.ref },
      })
    ).rejects.toThrow('Invalid receipt');
    expect(deps.fallback).not.toHaveBeenCalled();
  });
  it('retains explicit workspace scope for ordinary and legacy file links', async () => {
    const deps = setup();
    await expect(
      resolveStudioReviewWorkspace({ ...deps, record: { workspacePath: '/original' } })
    ).resolves.toBe('/original');
    await expect(resolveStudioReviewWorkspace({ ...deps, record: {} })).resolves.toBe('/active');
    expect(deps.loadTarget).not.toHaveBeenCalled();
  });
});
