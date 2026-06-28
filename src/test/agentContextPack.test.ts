import { describe, expect, it } from 'vitest';

import {
  buildCopilotChatContextPrompt,
  buildCopilotChatModelPrompt,
  buildWorkspaceAgentContextCliArgs,
  buildWorkspaceAgentSyncCliArgs,
} from '../core/agentContextPack';
import {
  WORKSPACE_CONTEXT_AGENT_REPORT_PATH,
  AGENT_CUSTOMIZATION_PACK_REPORT_PATH,
  WORKSPACE_CONTRACT_VERIFY_REPORT_PATH,
  WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_TRACE_REPORT_PATH,
  WORKSPACE_WHY_REPORT_PATH,
} from '../core/workspaceIntelligencePaths';

describe('agentContextPack', () => {
  it('builds generic Copilot-safe workspace context CLI args', () => {
    expect(buildWorkspaceAgentContextCliArgs()).toEqual([
      'workspace',
      'context',
      '--for-agent',
      '--json',
      '--write',
    ]);
    expect(buildWorkspaceAgentContextCliArgs('billing')).toEqual([
      'workspace',
      'context',
      '--for-agent',
      '--json',
      '--write',
      '--scope',
      'billing',
    ]);
  });

  it('builds agent grounding sync CLI args', () => {
    expect(buildWorkspaceAgentSyncCliArgs()).toEqual([
      'workspace',
      'agent-sync',
      '--write',
      '--refresh-context',
      '--json',
      '--preset',
      'enterprise',
      '--target',
      'vscode',
    ]);
    expect(
      buildWorkspaceAgentSyncCliArgs({
        scope: 'billing',
        strict: true,
        preset: 'minimal',
        target: 'copilot',
        experimentalHooks: true,
      })
    ).toEqual([
      'workspace',
      'agent-sync',
      '--write',
      '--refresh-context',
      '--json',
      '--preset',
      'minimal',
      '--target',
      'copilot',
      '--scope',
      'billing',
      '--strict',
      '--experimental-hooks',
    ]);
  });

  it('builds Copilot Chat prompts with canonical report paths', () => {
    expect(buildCopilotChatContextPrompt()).toContain(
      `#file:${WORKSPACE_CONTEXT_AGENT_REPORT_PATH}`
    );
    expect(buildCopilotChatContextPrompt()).toContain(
      `#file:${AGENT_CUSTOMIZATION_PACK_REPORT_PATH}`
    );
    expect(buildCopilotChatContextPrompt()).toContain(`#file:${WORKSPACE_EXPLAIN_REPORT_PATH}`);
    expect(buildCopilotChatContextPrompt()).toContain(`#file:${WORKSPACE_WHY_REPORT_PATH}`);
    expect(buildCopilotChatContextPrompt()).toContain(`#file:${WORKSPACE_TRACE_REPORT_PATH}`);
    expect(buildCopilotChatContextPrompt()).toContain(
      `#file:${WORKSPACE_CONTRACT_VERIFY_REPORT_PATH}`
    );
    expect(buildCopilotChatContextPrompt('debug auth')).toContain('debug auth');
    expect(buildCopilotChatModelPrompt()).toContain('#file:.rapidkit/reports/workspace-model.json');
  });
});
