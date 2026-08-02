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

  it('never treats a successful remediation command as proof of source mutation', () => {
    expect(provider).toContain('const before = await captureStudioWorkspaceSourceSnapshot({');
    expect(provider).toContain('const after = await captureStudioWorkspaceSourceSnapshot({');
    expect(provider).toContain('changedPaths = diffStudioWorkspaceSourceSnapshots(before, after)');
    expect(provider).toContain('observedSourceChange: changed');
    expect(provider).not.toContain('changed = execution.success;');
  });

  it('plans project-scoped verified goals with the project name, never an absolute path', () => {
    expect(provider).toMatch(
      /projectName:\s*input\.projectPath\s*\?\s*path\.basename\(path\.resolve\(input\.projectPath\)\)\s*:\s*undefined/
    );
    expect(provider).not.toContain('projectName: input.projectPath,');
  });
});
