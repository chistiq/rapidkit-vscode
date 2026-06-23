import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [] },
  window: {},
}));

describe('welcomePanelAiModalQuery', () => {
  it('exports handleAiModalQueryMessage with clarification gate before streaming', () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(currentDir, '../ui/panels/welcomePanelAiModalQuery.ts'),
      'utf8'
    );

    expect(source).toContain('export async function handleAiModalQueryMessage');
    expect(source).toContain('export function resolveAiModalOutputScenario');
    expect(source).toContain('prepared.validation.clarificationNeeded');
    expect(source).toContain("'workspai.aimodal.clarification_gate'");
    expect(source).toContain("currentStage = 'stream'");
    expect(source).toContain('await streamAIResponse(');
    expect(source).toContain('## Output Quality Gate');

    const clarificationIdx = source.indexOf('prepared.validation.clarificationNeeded');
    const streamStageIdx = source.indexOf("currentStage = 'stream';", clarificationIdx);
    const streamIdx = source.indexOf('await streamAIResponse(', clarificationIdx);
    const returnIdx = source.indexOf('return;', clarificationIdx);

    expect(clarificationIdx).toBeGreaterThan(-1);
    expect(streamStageIdx).toBeGreaterThan(-1);
    expect(streamIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(clarificationIdx);
    expect(returnIdx).toBeLessThan(streamStageIdx);
    expect(returnIdx).toBeLessThan(streamIdx);
  });
});
