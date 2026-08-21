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

  it('routes Sidebar and native Chat deletion through one guarded compiler', () => {
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    const nativeAgent = read('src/core/nativeChatStudioAgent.ts');
    const transactions = read('src/core/studioWorkspaceFileTransactions.ts');
    expect(provider.match(/compileInspectedStudioDeletePatches\(/g)).toHaveLength(2);
    expect(nativeAgent.match(/compileInspectedStudioDeletePatches\(/g)).toHaveLength(1);
    expect(transactions).toContain('export async function compileInspectedStudioDeletePatches');
    expect(transactions).toContain('authorizeStudioWorkspacePatchTargets({');
    expect(transactions).toContain('stat.isSymbolicLink()');
    expect(transactions).toContain('Source changed after inspection');
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

  it('turns a real toolchain boundary into an actionable native Chat handoff', () => {
    const nativeAgent = read('src/core/nativeChatStudioAgent.ts');
    expect(nativeAgent).toContain("data.terminalReason === 'repair-toolchain-unavailable'");
    expect(nativeAgent).toContain('Toolchain setup required');
    expect(nativeAgent).toContain("command: 'workspai.openSetup'");
    expect(nativeAgent).toContain("decisionOptions.includes('cancel')");
  });

  it('continues typed source-repair receipts in the source-only plane', () => {
    const nativeRepair = read('src/core/nativeChatRepair.ts');
    const nativeAgent = read('src/core/nativeChatStudioAgent.ts');
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    expect(nativeRepair).toContain('initialSourceRepairDirective: {');
    expect(nativeAgent).toContain('presentStudioCliOwnedRepairObservation');
    expect(provider).toContain('presentStudioCliOwnedRepairObservation');
    expect(provider).toContain('presentAssistantCliRepairResult');
    expect(nativeAgent).toContain('repairPolicy: cardRepairCapability.repairPolicy');
    expect(nativeAgent).toContain(
      'initialSourceRepairDirective: input.initialSourceRepairDirective'
    );
    expect(nativeRepair).toContain('selectStudioPostCliSourceCandidates');
    expect(nativeRepair).toContain('collectSidebarStudioRepairEvidence');
    expect(nativeAgent).toContain('selectStudioPostCliSourceCandidates');
    expect(nativeAgent).toContain('expectedBaseSha256');
  });

  it('keeps recover, remediation, and governed producers on the same CLI host as Sidebar', () => {
    const nativeAgent = read('src/core/nativeChatStudioAgent.ts');
    expect(nativeAgent).toContain('recoverActiveBlocker: async');
    expect(nativeAgent).toContain('readDoctorRemediationPlanForStudio');
    expect(nativeAgent).toContain('executeRemediationStep: async');
    expect(nativeAgent).toContain('runGovernedCommand: async');
    expect(nativeAgent).toContain('inspectDependencySecurity: async');
    expect(nativeAgent).toContain('executeCliOwnedCanonicalRepair');
    expect(nativeAgent).toContain('parseStudioDependencyUpgradeCandidates');
    expect(nativeAgent).toContain('isExpectedDiagnosticFindingExit');
    expect(nativeAgent).toContain('refreshDependencyDoctorEvidence');
    expect(nativeAgent).toContain('preserveAllAgentConsumersForStudioRefresh');
    expect(nativeAgent).toContain('applyStudioGovernedCommandReuse');
    expect(nativeAgent).not.toContain('unsupported(');
    expect(nativeAgent).not.toContain('not available in this source-repair phase');
    expect(nativeAgent).not.toContain('runStudioActiveBlockerRecovery');
  });

  it('shares workspace inspection primitives with the webview Studio host', () => {
    const provider = read('src/ui/webviews/actionsWebviewProvider.ts');
    const nativeAgent = read('src/core/nativeChatStudioAgent.ts');
    const inspection = read('src/core/studioWorkspaceInspection.ts');
    expect(provider).toContain("from '../../core/studioWorkspaceInspection.js'");
    expect(inspection).toContain('export async function discoverStudioWorkspaceFiles');
    expect(inspection).toContain('export function inspectStudioWorkspaceDiagnostics');
    expect(inspection).toContain('export async function inspectStudioWorkspaceChanges');
    expect(inspection).toContain('export async function searchStudioWorkspaceSource');
    expect(nativeAgent).toContain('searchStudioWorkspaceSource');
    expect(provider).toContain('searchStudioWorkspaceSource');
  });
});
