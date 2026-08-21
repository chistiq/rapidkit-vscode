import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('Assistant mode suggestion contract', () => {
  it('keeps automatic routing separate from explicit selector changes', () => {
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    const sidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
    const chat = read('webview-ui/src/sidebar/ChatTab.tsx');

    expect(provider).toContain("'sidebarStudioModeSuggestion'");
    expect(provider).toContain('resolveAssistantExecutionPolicy');
    expect(sidebar).toContain("case 'sidebarStudioModeSuggestion'");
    expect(sidebar).toContain('studio.setModeSuggestion(sessionId');
    expect(sidebar).toContain('const acceptModeSuggestion');
    expect(sidebar).toContain('activeSession.assistantMode !== suggestion.fromMode');
    expect(sidebar).toContain('setAssistantMode(suggestion.toMode)');
    expect(sidebar).toContain('submitStudioWithMode(suggestion.request, suggestion.toMode');
    expect(chat).toContain('onAcceptModeSuggestion');
    expect(chat).toContain('activeSession.modeSuggestion.label');
    expect(chat).toContain('Not now');

    const suggestionCase = sidebar.slice(
      sidebar.indexOf("case 'sidebarStudioModeSuggestion'"),
      sidebar.indexOf("case 'sidebarStudioChunk'")
    );
    expect(suggestionCase).not.toContain('setAssistantMode(');
  });
});
