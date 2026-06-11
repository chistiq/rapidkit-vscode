import { describe, expect, it } from 'vitest';

import { mergeDashboardActivityEntry } from '../core/dashboardActivityBridge';
import {
  activityEntryCountLabel,
  summarizeActivityLabels,
} from '../../webview-ui/src/lib/dashboardActivityDisplay';

describe('dashboardActivityDisplay', () => {
  it('summarizes unique labels for collapsed preview', () => {
    const summary = summarizeActivityLabels([
      {
        id: '1',
        command: 'workspaceAnalyze',
        label: 'Workspace Analyze',
        scope: 'workspace',
        status: 'dispatched',
        timestamp: 1,
      },
      {
        id: '2',
        command: 'workspaceAnalyze',
        label: 'Workspace Analyze',
        scope: 'workspace',
        status: 'dispatched',
        timestamp: 2,
      },
      {
        id: '3',
        command: 'checkWorkspaceHealth',
        label: 'Workspace Doctor',
        scope: 'workspace',
        status: 'dispatched',
        timestamp: 3,
      },
    ]);

    expect(summary).toBe('Workspace Analyze, Workspace Doctor');
  });

  it('shows repeat count labels for coalesced entries', () => {
    expect(
      activityEntryCountLabel({
        id: '1',
        command: 'workspaceAnalyze',
        label: 'Workspace Analyze',
        scope: 'workspace',
        status: 'dispatched',
        timestamp: 1,
        runCount: 4,
      })
    ).toBe('×4');
  });

  it('merges repeated commands in the display helper', () => {
    const next = mergeDashboardActivityEntry(
      [
        {
          id: '1',
          command: 'workspaceAnalyze',
          label: 'Workspace Analyze',
          scope: 'workspace',
          status: 'dispatched',
          timestamp: 1000,
          runCount: 2,
        },
      ],
      {
        command: 'workspaceAnalyze',
        label: 'Workspace Analyze',
        scope: 'workspace',
        status: 'dispatched',
        timestamp: 1100,
      }
    );

    expect(next[0]?.runCount).toBe(3);
  });
});
