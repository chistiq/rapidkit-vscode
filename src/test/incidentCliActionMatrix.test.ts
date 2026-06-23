import { describe, expect, it } from 'vitest';

import {
  buildIntelligenceChainCliSnippet,
  WORKSPACE_IMPACT_REPORT_PATH,
  WORKSPACE_MODEL_DIFF_REPORT_PATH,
  WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH,
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

    expect(chain?.command).toBe(buildIntelligenceChainCliSnippet());
    expect(chain?.command).toContain(
      `workspace diff --from ${WORKSPACE_MODEL_SNAPSHOT_REPORT_PATH}`
    );
    expect(chain?.command).toContain(`workspace impact --from ${WORKSPACE_MODEL_DIFF_REPORT_PATH}`);
    expect(chain?.command).toContain('--for-agent --json --write');
    expect(chain?.command).not.toContain('--for-agent cursor');

    expect(verify?.command).toBe(
      `npx rapidkit workspace verify --from-impact ${WORKSPACE_IMPACT_REPORT_PATH} --json`
    );
    expect(agentContext?.command).toBe('npx rapidkit workspace context --for-agent --json --write');
  });
});
