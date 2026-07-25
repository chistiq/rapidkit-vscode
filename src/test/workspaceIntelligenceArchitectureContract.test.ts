import { describe, expect, it } from 'vitest';

import {
  getAvailableWorkspaceIntelligenceLoop,
  getWorkspaceIntelligenceAuxiliaryCapabilities,
  getWorkspaceIntelligencePositioning,
  validateWorkspaceIntelligenceArchitectureContract,
} from '../core/workspaceIntelligenceArchitectureContract.js';

describe('workspace intelligence architecture contract', () => {
  it('consumes canonical positioning and the available architecture loop', () => {
    expect(getWorkspaceIntelligencePositioning()).toMatchObject({
      tagline: 'Open-Source Workspace Intelligence for Software Systems',
      category: 'Workspace Intelligence',
    });
    expect(getAvailableWorkspaceIntelligenceLoop().map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['model', 'impact', 'verify', 'context', 'agent-sync'])
    );
  });

  it('guards structure and canonical artifact names', () => {
    expect(validateWorkspaceIntelligenceArchitectureContract()).toEqual([]);
    const loop = getAvailableWorkspaceIntelligenceLoop();
    expect(loop.find((entry) => entry.id === 'model')?.artifacts).toContain(
      '.workspai/reports/workspace-model.json'
    );
    expect(loop.find((entry) => entry.id === 'diff')?.commands.join(' ')).toContain(
      '.workspai/reports/workspace-model-snapshot.json'
    );
    expect(
      getWorkspaceIntelligenceAuxiliaryCapabilities().find((entry) => entry.id === 'graph')?.reads
    ).toContain('.workspai/reports/workspace-knowledge-graph.json');
  });
});
