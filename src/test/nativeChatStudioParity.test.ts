import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', relativePath), 'utf8');
}

describe('native Chat and Incident Studio orchestration parity', () => {
  it('uses the shared durable model/tool session instead of a second agent loop', () => {
    const nativeAgent = read('src/core/nativeChatStudioAgent.ts');
    expect(nativeAgent).toContain('new StudioAgentSession(');
    expect(nativeAgent).toContain('new ContractStudioAgentModelAdapter(');
    expect(nativeAgent).toContain('createStudioAgentWorkspaiToolRegistry({');
    expect(nativeAgent).toContain('new VSCodeStudioAgentSessionStore(input.extensionContext)');
    expect(nativeAgent).not.toContain('while (');
  });

  it('keeps every native source mutation behind inspection and CLI ownership', () => {
    const nativeAgent = read('src/core/nativeChatStudioAgent.ts');
    expect(nativeAgent).toContain('authorizeStudioWorkspacePatchTargets({');
    expect(nativeAgent).toContain('executeCliOwnedPatchRepair({');
    expect(nativeAgent).toContain("approvedBy: 'vscode:native-chat-agent'");
    expect(nativeAgent).toContain('if (plan.mutatesSource)');
    expect(nativeAgent).not.toContain('workspace.fs.writeFile');
  });

  it('projects shared tool events into native activity and binds cancellation', () => {
    const nativeAgent = read('src/core/nativeChatStudioAgent.ts');
    const renderer = read('src/core/nativeChatToolEventRenderer.ts');
    expect(nativeAgent).toContain('renderNativeStudioAgentEvent(input.stream, event)');
    expect(nativeAgent).toContain('input.token.onCancellationRequested(() => session.cancel())');
    expect(renderer).toContain("event.type === 'tool.started'");
    expect(renderer).toContain("event.type === 'tool.progress'");
    expect(renderer).toContain("event.type === 'tool.completed'");
  });

  it('continues typed source-repair receipts in the source-only plane', () => {
    const nativeRepair = read('src/core/nativeChatRepair.ts');
    const nativeAgent = read('src/core/nativeChatStudioAgent.ts');
    expect(nativeRepair).toContain('initialSourceRepairDirective: {');
    expect(nativeAgent).toContain('resolveStudioCliRepairDisposition({');
    expect(nativeAgent).toContain('repairPolicy: cardRepairCapability.repairPolicy');
    expect(nativeAgent).toContain(
      'initialSourceRepairDirective: input.initialSourceRepairDirective'
    );
  });

  it('shares workspace inspection primitives with the webview Studio host', () => {
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    const inspection = read('src/core/studioWorkspaceInspection.ts');
    expect(provider).toContain("from '../../core/studioWorkspaceInspection.js'");
    expect(inspection).toContain('export async function discoverStudioWorkspaceFiles');
    expect(inspection).toContain('export function inspectStudioWorkspaceDiagnostics');
    expect(inspection).toContain('export async function inspectStudioWorkspaceChanges');
  });
});
