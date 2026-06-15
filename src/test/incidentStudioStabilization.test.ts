import { describe, expect, it } from 'vitest';

import { isMutatingRapidkitCliCommandText } from '../../webview-ui/src/lib/incidentStudioCliMutationDetect';
import { resolveIncidentCliSurfaceBlockReason } from '../../webview-ui/src/lib/incidentStudioCliSurfaceGate';
import {
  buildReportBackedStateRevision,
  mergeReportBackedStudioState,
} from '../../webview-ui/src/lib/incidentStudioReportStateSync';
import { createInitialState } from '../../webview-ui/src/components/StudioRedesign/state/studioState';

describe('incidentStudioCliMutationDetect', () => {
  it('detects mutating rapidkit commands without cliActionId', () => {
    expect(isMutatingRapidkitCliCommandText('npx rapidkit doctor workspace --fix')).toBe(true);
    expect(isMutatingRapidkitCliCommandText('npx rapidkit doctor workspace')).toBe(false);
  });

  it('blocks guided free-text mutating commands in the CLI surface gate', () => {
    const reason = resolveIncidentCliSurfaceBlockReason({
      command: 'npx rapidkit workspace sync',
      workspacePath: '/tmp/ws',
      hasProjectSelected: true,
      userMode: 'expert',
      telemetry: {
        enterpriseStabilizationGateStatus: {
          expansionFrozen: true,
          freezeReason: 'Expansion frozen for stabilization.',
        },
      },
    });

    expect(reason).toContain('Expansion frozen');
  });
});

describe('incidentStudioReportStateSync', () => {
  it('merges refreshed analyze evidence without clobbering conversation', () => {
    const previous = createInitialState({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Investigate auth failures',
          timestamp: '2026-06-10T10:00:00.000Z',
        },
      ],
      studioEvidence: { generatedAt: '2026-06-10T09:00:00.000Z', verdict: 'warn' },
    });
    const incoming = {
      studioEvidence: { generatedAt: '2026-06-10T11:00:00.000Z', verdict: 'pass' },
      health: { modulesOk: 8, modulesWarning: 0, modulesError: 0 },
    };

    expect(buildReportBackedStateRevision(incoming)).not.toBe(
      buildReportBackedStateRevision(previous)
    );

    const merged = mergeReportBackedStudioState(previous, incoming, {
      preserveConversation: true,
    });

    expect(merged.messages).toHaveLength(1);
    expect(merged.studioEvidence?.generatedAt).toBe('2026-06-10T11:00:00.000Z');
    expect(merged.studioEvidence?.verdict).toBe('pass');
  });
});
