import { describe, expect, it } from 'vitest';

import {
  appendStudioRepairTimelineEntry,
  STUDIO_REPAIR_TIMELINE_LIMIT,
} from '../../webview-ui/src/lib/studioRepairTimeline';

describe('Studio repair timeline', () => {
  it('coalesces noisy sub-phases into one user-facing activity', () => {
    const reading = {
      action: 'auto-fix',
      status: 'running' as const,
      phase: 'reading-ai-evidence',
      title: 'AI evidence repair',
      summary: 'Reading evidence.',
    };
    const requesting = {
      ...reading,
      phase: 'requesting-ai-repair',
      summary: 'Requesting repair.',
    };

    expect(appendStudioRepairTimelineEntry([reading], requesting)).toEqual([requesting]);
  });

  it('updates repeated heartbeats and bounds persisted history', () => {
    let timeline = Array.from({ length: STUDIO_REPAIR_TIMELINE_LIMIT }, (_, index) => ({
      action: 'auto-fix',
      status: 'running' as const,
      phase: `phase-${index}`,
      title: `Phase ${index}`,
      summary: `${index}`,
    }));
    const heartbeat = { ...timeline.at(-1)!, summary: 'latest heartbeat' };
    timeline = appendStudioRepairTimelineEntry(timeline, heartbeat);
    expect(timeline).toHaveLength(STUDIO_REPAIR_TIMELINE_LIMIT);
    expect(timeline.at(-1)?.summary).toBe('latest heartbeat');

    timeline = appendStudioRepairTimelineEntry(timeline, {
      ...heartbeat,
      phase: 'next-phase',
      title: 'Next phase',
    });
    expect(timeline).toHaveLength(STUDIO_REPAIR_TIMELINE_LIMIT);
    expect(timeline.at(-1)?.phase).toBe('next-phase');
  });

  it('coalesces live evidence generations into one current activity', () => {
    const first = {
      action: 'live-evidence',
      status: 'running' as const,
      phase: 'observing-evidence',
      title: 'Evidence refreshed',
      summary: 'Generation 1',
    };
    const second = { ...first, summary: 'Generation 2' };

    const timeline = appendStudioRepairTimelineEntry(
      appendStudioRepairTimelineEntry([], first),
      second
    );

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.summary).toBe('Generation 2');
  });

  it('coalesces consecutive internal reads while preserving repair actions', () => {
    const readSource = {
      action: 'inspect-source',
      status: 'done' as const,
      phase: 'inspect-source',
      title: 'Read source',
      summary: 'Read package.json.',
      invocationId: 'read-1',
    };
    const readDiagnostics = {
      action: 'inspect-workspace-diagnostics',
      status: 'done' as const,
      phase: 'inspect-workspace-diagnostics',
      title: 'Read diagnostics',
      summary: 'Read project diagnostics.',
      invocationId: 'read-2',
    };
    const repair = {
      action: 'apply-workspace-patch',
      status: 'done' as const,
      phase: 'apply-workspace-patch',
      title: 'Changed 1 file',
      summary: 'CLI verified the repair.',
      invocationId: 'repair-1',
    };

    let timeline = appendStudioRepairTimelineEntry([], readSource);
    timeline = appendStudioRepairTimelineEntry(timeline, readDiagnostics);
    timeline = appendStudioRepairTimelineEntry(timeline, repair);

    expect(timeline).toEqual([readDiagnostics, repair]);
  });
});
