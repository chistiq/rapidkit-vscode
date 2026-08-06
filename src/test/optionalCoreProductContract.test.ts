import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { buildDashboardNextSteps } from '../../webview-ui/src/lib/dashboardNextSteps';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('optional RapidKit Core product contract', () => {
  it('never gates dashboard project creation on the optional Python engine', () => {
    const app = read('webview-ui/src/App.tsx');

    expect(app).not.toContain('!installStatus.coreInstalled');
    expect(app).not.toContain("setActiveView('setup');\n      return;\n    }\n    setAICreateMode");
    expect(app).toContain("setAICreateMode('project')");
    expect(app).toContain('setShowProjectModal(true)');
  });

  it('keeps Workspai CLI required while presenting Python and Core as optional', () => {
    const setup = read('webview-ui/src/components/SetupExperience.tsx');
    const setupHost = read('src/ui/panels/setupExperiencePanel.ts');

    expect(setup).toContain("title: 'Workspai CLI'");
    expect(setup).toMatch(/title: 'Workspai CLI',[\s\S]*?required: true/);
    expect(setup).toMatch(/title: 'Python 3\.10\+',[\s\S]*?required: false/);
    expect(setup).toMatch(/title: 'RapidKit Core',[\s\S]*?required: false/);
    expect(setup).not.toContain('Required for all scaffold and lifecycle commands');
    expect(setupHost).toContain("installStatus.coreInstallType === 'workspace'");
    expect(setupHost).toContain('resolveCoreUpgradePlan(workspaceRoot)');
    expect(setupHost).toContain('no global package was changed');
  });

  it('routes missing CLI to Setup without treating missing Core as a workspace blocker', () => {
    const base = {
      workspaceStatus: { hasWorkspace: true, workspacePath: '/workspace' },
      installStatusChecked: true,
      evidence: {
        cards: [],
        activity: [],
        onboarding: {
          isFreshInstall: false,
          recentWorkspaceCount: 1,
          hasActiveWorkspace: true,
        },
      },
    } as const;

    const withoutCore = buildDashboardNextSteps({
      ...base,
      cliInstalled: true,
      coreInstalled: false,
    });
    const withoutCli = buildDashboardNextSteps({
      ...base,
      cliInstalled: false,
      coreInstalled: true,
    });

    expect(withoutCore.some((step) => step.id === 'install-core')).toBe(false);
    expect(withoutCore.some((step) => step.command === 'openSetup')).toBe(false);
    expect(withoutCli[0]).toMatchObject({
      id: 'install-cli',
      command: 'openSetup',
      priority: 'critical',
    });
  });

  it('keeps public onboarding copy aligned with Workspai and advisory Doctor warnings', () => {
    const manifest = read('package.json');
    const firstTimeSetup = read('src/utils/firstTimeSetup.ts');
    const doctorWalkthrough = read('walkthroughs/doctor-green.md');

    expect(manifest).not.toContain('Adopt with RapidKit');
    expect(manifest).not.toContain('zero errors and warnings');
    expect(firstTimeSetup).toContain('Python and RapidKit Core are optional');
    expect(doctorWalkthrough).toContain('Warnings remain visible as advisories');
  });
});
