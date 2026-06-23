import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [] },
  window: {},
}));

describe('welcomePanelChatBrainExecuteAction', () => {
  it('exports handleAiChatExecuteAction with release-gate and patch workflow wiring', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelChatBrainExecuteAction.ts'),
      'utf8'
    );

    expect(source).toContain('export async function handleAiChatExecuteAction');
    expect(source).toContain('WORKSPACE_SCOPE_VIOLATION');
    expect(source).toContain('buildIncidentDiagnosisEvidence');
    expect(source).toContain('decisionClarityCompletionBlocked');
    expect(source).toContain('apply-module-gen');
    expect(source).toContain('host.runAiChatQuery');
  });
});
