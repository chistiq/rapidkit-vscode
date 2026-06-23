/**
 * Workspace Wizard
 * 5-step interactive wizard for workspace creation:
 *   1. Name  2. Profile  3. Location  4. Install Method  5. Options
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceConfig } from '../../types';
import { resolveNewWorkspacePath } from '../../core/workspacePaths';

const TOTAL_STEPS = 5;

export class WorkspaceWizard {
  async show(): Promise<WorkspaceConfig | undefined> {
    // ── Step 1 of 5: Name ────────────────────────────────────────────────────
    const name = await vscode.window.showInputBox({
      title: `Step 1 of ${TOTAL_STEPS}: Workspace Name`,
      prompt: 'Choose a name for your new workspace',
      placeHolder: 'my-workspace',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value) {
          return 'Workspace name is required';
        }
        if (!/^[a-z][a-z0-9-]*$/.test(value)) {
          return 'Use lowercase letters, numbers, and hyphens only (must start with a letter)';
        }
        return null;
      },
    });
    if (!name) {
      return undefined;
    }

    // ── Step 2 of 5: Profile ─────────────────────────────────────────────────
    type ProfileItem = vscode.QuickPickItem & {
      value:
        | 'minimal'
        | 'python-only'
        | 'node-only'
        | 'go-only'
        | 'java-only'
        | 'dotnet-only'
        | 'polyglot'
        | 'enterprise';
    };
    const profilePick = await vscode.window.showQuickPick<ProfileItem>(
      [
        {
          label: '$(zap) minimal',
          description: 'Foundation files only — fastest bootstrap',
          detail: 'Best for: mixed, unknown, or non-Python projects',
          value: 'minimal',
        },
        {
          label: '$(symbol-namespace) Python runtime',
          description: 'Python + Poetry bootstrap',
          detail: 'Best for: FastAPI, Django, data science, ML pipelines',
          value: 'python-only',
        },
        {
          label: '$(symbol-event) Node.js runtime',
          description: 'Node.js runtime bootstrap (no Python needed)',
          detail: 'Best for: NestJS, Express, Next.js, CLI tools',
          value: 'node-only',
        },
        {
          label: '$(go) Go runtime',
          description: 'Go runtime bootstrap (no Python needed)',
          detail: 'Best for: Go services, gRPC, CLI tools, microservices',
          value: 'go-only',
        },
        {
          label: '$(symbol-structure) Java runtime',
          description: 'Java runtime bootstrap (JDK + Maven/Gradle)',
          detail: 'Best for: Spring Boot services and Java microservices',
          value: 'java-only',
        },
        {
          label: '$(symbol-interface) .NET runtime',
          description: '.NET runtime bootstrap',
          detail: 'Best for: ASP.NET Core services and C# APIs',
          value: 'dotnet-only',
        },
        {
          label: '$(layers) polyglot',
          description: 'Python + Node.js + Go + Java + .NET — full multi-runtime workspace',
          detail: 'Best for: microservice monorepos, mixed-language teams',
          value: 'polyglot',
        },
        {
          label: '$(shield) enterprise',
          description: 'Polyglot + governance + Sigstore artifact verification',
          detail: 'Best for: teams with compliance, audit, or supply-chain requirements',
          value: 'enterprise',
        },
      ],
      {
        placeHolder: 'Select a bootstrap profile',
        title: `Step 2 of ${TOTAL_STEPS}: Profile  ·  ${name}`,
        ignoreFocusOut: true,
      }
    );
    if (!profilePick) {
      return undefined;
    }

    // ── Step 3 of 5: Location ─────────────────────────────────────────────────
    const defaultFull = resolveNewWorkspacePath(name);

    type LocationItem = vscode.QuickPickItem & { value: 'default' | 'browse' };
    const locationPick = await vscode.window.showQuickPick<LocationItem>(
      [
        {
          label: `$(folder) ${defaultFull}`,
          description: '(recommended)',
          detail: 'Standard Workspai workspace directory',
          value: 'default',
        },
        {
          label: '$(folder-opened) Choose a different folder\u2026',
          description: 'Browse for a custom parent directory',
          detail: 'The workspace folder will be created inside the selected directory',
          value: 'browse',
        },
      ],
      {
        placeHolder: 'Where should the workspace live?',
        title: `Step 3 of ${TOTAL_STEPS}: Location  ·  ${name}`,
        ignoreFocusOut: true,
      }
    );
    if (!locationPick) {
      return undefined;
    }

    let finalPath: string;
    if (locationPick.value === 'browse') {
      const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select parent folder',
        title: `Select parent folder for "${name}"`,
      });
      if (!uris || uris.length === 0) {
        return undefined;
      }
      finalPath = path.join(uris[0].fsPath, name);
    } else {
      finalPath = defaultFull;
    }

    // ── Step 4 of 5: Install Method ───────────────────────────────────────────
    type InstMethodItem = vscode.QuickPickItem & { value: 'auto' | 'poetry' | 'venv' | 'pipx' };
    const installPick = await vscode.window.showQuickPick<InstMethodItem>(
      [
        {
          label: '$(search) Auto-detect',
          description: 'Use Poetry if installed, otherwise fall back to venv  (recommended)',
          detail: 'Same as running rapidkit create workspace without --install-method',
          value: 'auto',
        },
        {
          label: '$(package) Poetry',
          description: 'Force Poetry as the dependency manager',
          detail: 'If Poetry is not available, CLI can fallback to a compatible setup',
          value: 'poetry',
        },
        {
          label: '$(symbol-variable) venv',
          description: 'Pure Python venv + pip — no extra tools needed',
          detail: 'Simplest setup, runs on any Python 3.10+ installation',
          value: 'venv',
        },
        {
          label: '$(tools) pipx',
          description: 'Manage packages in isolated pipx environments',
          detail: 'Good for CLI-heavy workspaces; requires pipx to be installed',
          value: 'pipx',
        },
      ],
      {
        placeHolder: 'Select Python install method',
        title: `Step 4 of ${TOTAL_STEPS}: Install Method  ·  ${name}`,
        ignoreFocusOut: true,
      }
    );
    if (!installPick) {
      return undefined;
    }

    // ── Step 5 of 5: Options (multi-select) ──────────────────────────────────
    type OptionItem = vscode.QuickPickItem & { id: 'git' | 'strict-policy' | 'dep-sharing' };

    const optionItems: OptionItem[] = [
      {
        label: '$(git-commit) Initialize Git repository',
        description: 'Run git init and create an initial commit',
        detail: 'Strongly recommended — enables version history from day one',
        picked: true,
        id: 'git',
      },
      {
        label: '$(shield) Enable strict policy enforcement',
        description: 'Fail CI on any policy violation  (default: warn-only)',
        detail: 'Writes policy_mode: strict to .rapidkit/policies.yml',
        picked: false,
        id: 'strict-policy',
      },
      {
        label: '$(package) Enable dependency sharing',
        description: 'Share installed packages across projects  (default: isolated)',
        detail: 'Writes dep_sharing: shared to .rapidkit/workspace.json',
        picked: false,
        id: 'dep-sharing',
      },
    ];

    // showQuickPick with canPickMany returns an array (possibly empty) on confirm,
    // or undefined when the user presses Escape.
    const optionPicks = await vscode.window.showQuickPick<OptionItem>(optionItems, {
      canPickMany: true,
      placeHolder: 'Toggle workspace behaviour options  (Space to toggle, Enter to confirm)',
      title: `Step 5 of ${TOTAL_STEPS}: Options  ·  ${name}`,
      ignoreFocusOut: true,
    });
    if (optionPicks === undefined) {
      return undefined;
    }

    const selectedIds = new Set(optionPicks.map((p) => p.id));
    const initGit = selectedIds.has('git');
    const policyMode = selectedIds.has('strict-policy') ? ('strict' as const) : ('warn' as const);
    const dependencySharing = selectedIds.has('dep-sharing')
      ? ('shared' as const)
      : ('isolated' as const);

    return {
      name,
      path: finalPath,
      initGit,
      profile: profilePick.value,
      installMethod: installPick.value,
      policyMode,
      dependencySharing,
    };
  }
}
