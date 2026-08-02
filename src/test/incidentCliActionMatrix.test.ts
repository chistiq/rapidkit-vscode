import { describe, expect, it } from 'vitest';

import {
  buildIntelligenceChainCliSnippet,
  WORKSPACE_IMPACT_REPORT_PATH,
} from '../../webview-ui/src/lib/workspaceIntelligencePaths';
import { buildIncidentCliActionMatrix } from '../../webview-ui/src/lib/incidentCliActionMatrix';

describe('incidentCliActionMatrix', () => {
  it('aligns intelligence chain and verify CLI with extension dispatch paths', () => {
    const chain = buildIncidentCliActionMatrix(false).workspace.find(
      (entry) => entry.id === 'workspace-intelligence-chain'
    );
    const verify = buildIncidentCliActionMatrix(false).workspace.find(
      (entry) => entry.id === 'workspace-verify-json'
    );
    const agentContext = buildIncidentCliActionMatrix(false).workspace.find(
      (entry) => entry.id === 'workspace-context-agent-json'
    );
    const archive = buildIncidentCliActionMatrix(false).workspace.find(
      (entry) => entry.id === 'workspace-archive'
    );

    expect(chain?.command).toBe(buildIntelligenceChainCliSnippet());
    expect(chain?.command).toBe(
      'npx workspai workspace intelligence run --for-agent vscode --json'
    );
    expect(chain?.command).not.toContain('workspace snapshot');
    expect(chain?.command).not.toContain('workspace why');
    expect(chain?.command).not.toContain('workspace trace');

    expect(verify?.command).toBe(
      `npx workspai workspace verify --from-impact ${WORKSPACE_IMPACT_REPORT_PATH} --json`
    );
    expect(agentContext?.command).toBe('npx workspai workspace context --for-agent --json --write');
    expect(archive?.command).toBe(
      'npx workspai workspace export --output team-workspace.workspai-archive.zip --json'
    );
  });
});
