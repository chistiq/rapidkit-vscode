import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const providerPath = path.resolve(process.cwd(), 'src/ui/webviews/actionsWebviewProvider.ts');
const provider = fs.readFileSync(providerPath, 'utf8');

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

  it('refreshes stale Doctor evidence before resolving dependency targets', () => {
    expect(provider).toContain('if (dependencyIncident && dependencyTargets.length === 0)');
    expect(provider).toContain(
      'doctorRefresh = await refreshDependencyDoctorEvidence(request.workspacePath)'
    );
    expect(provider).toContain("recoveryPath: 'dependency-security'");
    expect(provider).toContain("nextAction: 'verify-blocker'");
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
    const bindingStart = provider.indexOf(
      '// Studio is a model/UI client of the CLI Repair Engine'
    );
    const bindingEnd = provider.indexOf(
      'const registry = createStudioAgentWorkspaiToolRegistry',
      bindingStart
    );
    const activeBindings = provider.slice(bindingStart, bindingEnd);
    expect(bindingStart).toBeGreaterThanOrEqual(0);
    expect(bindingEnd).toBeGreaterThan(bindingStart);
    expect(activeBindings).toContain('host.applyPatches = async');
    expect(activeBindings).toContain('executeCliOwnedPatchRepair');
    expect(activeBindings).toContain('executeCliOwnedCanonicalRepair');
    expect(activeBindings).not.toContain('applySidebarPendingPatches');
    expect(activeBindings).not.toContain('runIncidentInlineCommand');
    expect(activeBindings).not.toContain('applyDoctorRemediationStep');

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

  it('plans project-scoped verified goals with the project name, never an absolute path', () => {
    expect(provider).toMatch(
      /projectName:\s*input\.projectPath\s*\?\s*path\.basename\(path\.resolve\(input\.projectPath\)\)\s*:\s*undefined/
    );
    expect(provider).not.toContain('projectName: input.projectPath,');
  });
});
