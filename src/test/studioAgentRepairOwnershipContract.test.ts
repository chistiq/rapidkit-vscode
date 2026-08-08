import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const providerPath = path.resolve(process.cwd(), 'src/ui/webviews/actionsWebviewProvider.ts');
const provider = fs.readFileSync(providerPath, 'utf8');
const session = fs.readFileSync(
  path.resolve(process.cwd(), 'src/core/studioAgentSession.ts'),
  'utf8'
);
const assistantModeContract = fs.readFileSync(
  path.resolve(process.cwd(), 'src/core/assistantModeContract.ts'),
  'utf8'
);

function productionTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : productionTypeScriptFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [absolutePath] : [];
  });
}

describe('Studio Agent repair ownership contract', () => {
  it('single-flights one autonomous repair per workspace card', () => {
    expect(provider).toContain(
      'private readonly _activeStudioAgentRepairRuns = new Map<string, Promise<void>>()'
    );
    expect(provider).toContain('const activeRun = this._activeStudioAgentRepairRuns.get');
    expect(provider).toContain('Continue the existing source transaction');
    expect(provider).toContain('this._activeStudioAgentRepairRuns.set(repairScopeKey, ownedRun)');
    expect(provider).toContain('this._activeStudioAgentRepairRuns.delete(repairScopeKey)');
  });

  it('enters the CLI Repair Engine directly from active blocker recovery', () => {
    const recoveryStart = provider.indexOf('recoverActiveBlocker: async');
    const recoveryEnd = provider.indexOf('verify: async', recoveryStart);
    const recovery = provider.slice(recoveryStart, recoveryEnd);
    expect(recoveryStart).toBeGreaterThanOrEqual(0);
    expect(recoveryEnd).toBeGreaterThan(recoveryStart);
    expect(recovery).toContain('return executeCanonicalRepair');
    expect(recovery).not.toContain('runStudioActiveBlockerRecovery');
    expect(recovery).not.toContain('repairDependencySecurity');
    expect(recovery).not.toContain('runIncidentInlineCommand');
  });

  it('restores the durable card session across causal blocker signature changes', () => {
    const persistedSelection = provider.slice(
      provider.indexOf(
        'const persistedCandidate = input.sessionId',
        provider.indexOf('_runAutonomousStudioAgentOwned')
      ),
      provider.indexOf('const options = {', provider.indexOf('_runAutonomousStudioAgentOwned'))
    );
    expect(persistedSelection).toContain("persistedCandidate.assistantMode === 'agent'");
    expect(persistedSelection).not.toContain(
      'persistedCandidate.blockerSignature === input.handoff.blockerSignature'
    );
  });

  it('routes every active Studio mutation surface through the CLI Repair Engine', () => {
    const autonomousStart = provider.indexOf('private async _runAutonomousStudioAgentOwned');
    const autonomousEnd = provider.indexOf(
      'private async _runSidebarStudioAction',
      autonomousStart
    );
    const autonomousRuntime = provider.slice(autonomousStart, autonomousEnd);
    expect(autonomousStart).toBeGreaterThanOrEqual(0);
    expect(autonomousEnd).toBeGreaterThan(autonomousStart);
    expect(autonomousRuntime).toContain('applyPatches: async');
    expect(autonomousRuntime).toContain('deleteFiles: async');
    expect(autonomousRuntime).toContain('executeCliOwnedPatchRepair');
    expect(autonomousRuntime).toContain('executeCliOwnedCanonicalRepair');
    expect(session).toContain("closureAuthority: 'cli-repair-engine'");
    expect(session).toContain("transaction?.state !== 'closed'");
    expect(session).toContain("verification?.targetStatus !== 'passed'");
    expect(session).toContain("terminalReason: 'cli-repair-closure-missing'");
    expect(session).not.toContain("recovery: 'post-mutation-chain'");
    expect(session).not.toContain("recovery: 'dependency-upgrade-transaction'");
    expect(assistantModeContract).not.toContain("'repair-dependency-security',");
    expect(assistantModeContract).not.toContain("'upgrade-dependency-security',");
    expect(assistantModeContract).not.toContain("'complete-dependency-transaction',");
    expect(autonomousRuntime).toContain(
      'Studio cannot execute mutating workspace commands directly.'
    );
    expect(autonomousRuntime).not.toContain('applySidebarPendingPatches');
    expect(autonomousRuntime).not.toContain('deleteInspectedStudioWorkspaceFiles');
    expect(autonomousRuntime).not.toContain('buildStudioDependencyUpgradeCommand');
    expect(autonomousRuntime).not.toContain('rollbackAppliedPatches');

    // A second assignment used to replace the guarded host methods after the
    // registry was built. That created two mutation control planes. Mutation
    // methods must now be defined exactly once per supported assistant host.
    expect(provider.match(/applyPatches:\s*async/g)).toHaveLength(2);
    expect(provider.match(/deleteFiles:\s*async/g)).toHaveLength(2);
    expect(provider).not.toContain('host.applyPatches =');
    expect(provider).not.toContain('host.deleteFiles =');
    expect(provider).not.toContain('host.runWorkspaceCommand =');
    expect(provider).not.toContain('host.repairDependencySecurity =');
    expect(provider).not.toContain('host.upgradeDependencySecurity =');

    const uiStart = provider.indexOf("if (action === 'apply-remediation-step')");
    const uiEnd = provider.indexOf("if (action === 'reject-patch')", uiStart);
    const mutationActions = provider.slice(uiStart, uiEnd);
    expect(uiStart).toBeGreaterThanOrEqual(0);
    expect(uiEnd).toBeGreaterThan(uiStart);
    expect(mutationActions).toContain('executeCliOwnedCanonicalRepair');
    expect(mutationActions).toContain('executeCliOwnedPatchRepair');
    expect(mutationActions).not.toContain('applySidebarPendingPatches');
    expect(mutationActions).not.toContain('runIncidentInlineCommand');
    expect(mutationActions).not.toContain('applyDoctorRemediationStep');

    const autoFixStart = provider.indexOf('private async _runSidebarAutoFix(');
    const autoFixEnd = provider.indexOf('private async _runSidebarAction(', autoFixStart);
    const autoFix = provider.slice(autoFixStart, autoFixEnd);
    expect(autoFixStart).toBeGreaterThanOrEqual(0);
    expect(autoFixEnd).toBeGreaterThan(autoFixStart);
    expect(autoFix).toContain('_runAutonomousStudioAgent');
    expect(autoFix).toContain('Studio CLI-owned repair session');
    expect(autoFix).not.toContain('runIncidentInlineCommand');
    expect(autoFix).not.toContain('executeStudioActionById');
    expect(autoFix).not.toContain('runRapidkitStreaming');
    expect(autoFix).not.toContain('applyBootstrapComplianceRemediation');
  });

  it('closes the selected repair independently from unrelated workspace findings', () => {
    const verifyStart = provider.indexOf(
      'verify: async (request: { workspacePath: string; projectPath?: string })',
      provider.indexOf('private async _runAutonomousStudioAgentOwned')
    );
    const verifyEnd = provider.indexOf('// Studio is a model/UI client', verifyStart);
    const verify = provider.slice(verifyStart, verifyEnd);
    expect(verifyStart).toBeGreaterThanOrEqual(0);
    expect(verifyEnd).toBeGreaterThan(verifyStart);
    expect(verify).toContain('!cardBlocking');
    expect(verify).toContain('cardBlocking,');
    expect(verify).toContain('workspaceVerification');
    expect(verify).not.toContain('incidentBlocking');
    expect(verify).not.toContain('nextBlockingCard');
  });

  it('prevents legacy direct mutation helpers from becoming a second production caller', () => {
    const sourceRoot = path.resolve(process.cwd(), 'src');
    const allowedDefinitions = new Map<string, string>([
      ['applySidebarPendingPatches', path.join(sourceRoot, 'core/sidebarStudioPatchBridge.ts')],
      [
        'deleteInspectedStudioWorkspaceFiles',
        path.join(sourceRoot, 'core/studioWorkspaceFileTransactions.ts'),
      ],
      ['rollbackAppliedPatches', path.join(sourceRoot, 'core/patchApplyEngine.ts')],
      [
        'buildStudioDependencyUpgradeCommand',
        path.join(sourceRoot, 'core/studioDependencySecurity.ts'),
      ],
      [
        'runStudioActiveBlockerRecovery',
        path.join(sourceRoot, 'core/studioActiveBlockerRecovery.ts'),
      ],
    ]);
    const violations: string[] = [];
    for (const filePath of productionTypeScriptFiles(sourceRoot)) {
      const source = fs.readFileSync(filePath, 'utf8');
      for (const [symbol, definitionPath] of allowedDefinitions) {
        if (filePath !== definitionPath && source.includes(symbol)) {
          violations.push(`${path.relative(sourceRoot, filePath)} -> ${symbol}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('plans project-scoped verified goals with the canonical project target, never an absolute path', () => {
    expect(provider).toContain('projectName: resolveStudioRepairProjectTarget({');
    expect(provider).toContain('explicitProjectName: input.projectName,');
    expect(provider).toContain('affectedProjectNames: input.handoff?.affectedProjectNames,');
    expect(provider).not.toContain('projectName: input.projectPath,');
  });
});
