import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildStudioIntelligencePhaseWindow,
  resolveStudioIntelligencePhaseDirection,
  resolveStudioIntelligencePhaseFromCard,
  resolveStudioIntelligencePhaseFromToolEvent,
} from '../../webview-ui/src/lib/studioIntelligencePhaseRail';

describe('Studio Workspace Intelligence phase rail', () => {
  it('derives the rail from the shared CLI contract consumer instead of a local phase list', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../webview-ui/src/lib/studioIntelligencePhaseRail.ts'),
      'utf8'
    );
    expect(source).toContain('getWorkspaceIntelligenceExecutionMilestones');
    expect(source).toContain('@workspai-contracts/workspaceIntelligenceChain');
    expect(source).not.toContain("{ id: 'sync', label: 'Sync' }");
  });

  it('mounts the loop in the persistent repair header, not inside the activity bubble', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../webview-ui/src/sidebar/SecondarySidebar.tsx'),
      'utf8'
    );
    const railOffset = source.indexOf('<StudioIntelligencePhaseRail');
    expect(railOffset).toBeGreaterThan(source.lastIndexOf('streamChrome={', railOffset));
    expect(railOffset).toBeGreaterThan(source.lastIndexOf('headerChrome={', railOffset));
    expect(source.match(/<StudioIntelligencePhaseRail/g)).toHaveLength(1);
    expect(source).toContain('<summary>Recent activity</summary>');
    expect(source).not.toContain('Activity · {activeStudioRepairTimeline.length');
  });

  it('keeps the active phase centered between three prior and three future phases', () => {
    const phases = buildStudioIntelligencePhaseWindow('impact');
    expect(phases).toHaveLength(7);
    expect(phases.map((phase) => phase.id)).toEqual([
      'model',
      'baseline',
      'diff',
      'impact',
      'doctor-evidence',
      'contract-evidence',
      'analyze-evidence',
    ]);
    expect(phases[3]).toMatchObject({ id: 'impact', offset: 0, state: 'active' });
  });

  it('wraps the seven-phase window at both ends without leaving empty rail positions', () => {
    expect(buildStudioIntelligencePhaseWindow('sync').map((phase) => phase.id)).toEqual([
      'context',
      'agent-sync',
      'explain',
      'sync',
      'model',
      'baseline',
      'diff',
    ]);
    expect(buildStudioIntelligencePhaseWindow('explain').map((phase) => phase.id)).toEqual([
      'verify',
      'context',
      'agent-sync',
      'explain',
      'sync',
      'model',
      'baseline',
    ]);
  });

  it('treats explain to sync as forward movement around the contract-owned loop', () => {
    expect(resolveStudioIntelligencePhaseDirection(12, 0)).toBe('forward');
    expect(resolveStudioIntelligencePhaseDirection(0, 12)).toBe('backward');
    expect(resolveStudioIntelligencePhaseDirection(3, 3)).toBe('idle');
  });

  it('maps governed commands and repair tools to the real intelligence loop', () => {
    expect(
      resolveStudioIntelligencePhaseFromToolEvent({
        toolName: 'run-governed-command',
        toolInput: { commandId: 'workspaceImpact' },
      })
    ).toBe('impact');
    expect(
      resolveStudioIntelligencePhaseFromToolEvent({ toolName: 'repair-dependency-security' })
    ).toBeUndefined();
    expect(
      resolveStudioIntelligencePhaseFromToolEvent({
        toolName: 'run-workspace-command',
        toolInput: { purpose: 'test' },
      })
    ).toBeUndefined();
    expect(resolveStudioIntelligencePhaseFromToolEvent({ toolName: 'verify-blocker' })).toBe(
      'verify'
    );
    expect(resolveStudioIntelligencePhaseFromCard('releaseReadiness')).toBe('readiness-evidence');
  });

  it('prefers the runner-reported contract milestone over command-level inference', () => {
    expect(
      resolveStudioIntelligencePhaseFromToolEvent({
        toolName: 'run-governed-command',
        toolInput: { commandId: 'workspaceIntelligenceChain' },
        reportedPhase: 'contract-evidence',
      })
    ).toBe('contract-evidence');
  });
});
