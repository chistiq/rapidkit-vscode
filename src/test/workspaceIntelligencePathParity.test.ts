import { describe, expect, it } from 'vitest';

import {
  WORKSPACE_EXPLAIN_REPORT_PATH as HOST_WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_TRACE_REPORT_PATH as HOST_WORKSPACE_TRACE_REPORT_PATH,
  WORKSPACE_WHY_REPORT_PATH as HOST_WORKSPACE_WHY_REPORT_PATH,
} from '../core/workspaceIntelligencePaths';
import {
  buildWorkspaceExplainCliSnippet,
  buildWorkspaceGraphExplainCliSnippet,
  buildWorkspaceTraceCliSnippet,
  buildWorkspaceWhyCliSnippet,
  WORKSPACE_EXPLAIN_REPORT_PATH as WEBVIEW_WORKSPACE_EXPLAIN_REPORT_PATH,
  WORKSPACE_TRACE_REPORT_PATH as WEBVIEW_WORKSPACE_TRACE_REPORT_PATH,
  WORKSPACE_WHY_REPORT_PATH as WEBVIEW_WORKSPACE_WHY_REPORT_PATH,
} from '../../webview-ui/src/lib/workspaceIntelligencePaths';
import { COMMAND_CHEATSHEET_GROUPS } from '../../webview-ui/src/lib/commandCheatsheet';

describe('workspace intelligence host/webview path parity', () => {
  it('mirrors explain, why, and trace artifact paths between host and webview', () => {
    expect(WEBVIEW_WORKSPACE_EXPLAIN_REPORT_PATH).toBe(HOST_WORKSPACE_EXPLAIN_REPORT_PATH);
    expect(WEBVIEW_WORKSPACE_WHY_REPORT_PATH).toBe(HOST_WORKSPACE_WHY_REPORT_PATH);
    expect(WEBVIEW_WORKSPACE_TRACE_REPORT_PATH).toBe(HOST_WORKSPACE_TRACE_REPORT_PATH);
  });

  it('keeps Terminal Bridge snippets aligned with npm explainability commands', () => {
    expect(buildWorkspaceExplainCliSnippet()).toBe(
      'npx workspai workspace explain release-blocked --json --write'
    );
    expect(buildWorkspaceWhyCliSnippet()).toBe(
      'npx workspai workspace why release-blocked --json --write'
    );
    expect(buildWorkspaceTraceCliSnippet()).toBe(
      'npx workspai workspace trace --from .workspai/reports/workspace-model-diff-last-run.json --json --write'
    );
    expect(buildWorkspaceGraphExplainCliSnippet('api')).toBe(
      'npx workspai workspace graph explain api --json'
    );
  });

  it('surfaces explain, why, trace, and graph explain as separate cheatsheet actions', () => {
    const workspaceCommands =
      COMMAND_CHEATSHEET_GROUPS.find((group) => group.id === 'workspace')?.entries.map(
        (entry) => entry.command
      ) ?? [];

    expect(workspaceCommands).toContain(
      'workspai workspace explain release-blocked --json --write'
    );
    expect(workspaceCommands).toContain('workspai workspace why release-blocked --json --write');
    expect(workspaceCommands).toContain(
      'workspai workspace trace --from .workspai/reports/workspace-model-diff-last-run.json --json --write'
    );
    expect(workspaceCommands).toContain('workspai workspace graph explain <project> --json');
  });
});
