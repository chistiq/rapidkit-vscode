import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  CodeActionKind: {
    QuickFix: 'quickfix',
    Refactor: 'refactor',
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
  workspace: {
    asRelativePath: (value: string) => value.replace('/repo/', ''),
  },
  CodeAction: class {
    title: string;
    kind: string;
    command?: unknown;
    isPreferred?: boolean;
    edit?: unknown;

    constructor(title: string, kind: string) {
      this.title = title;
      this.kind = kind;
    }
  },
  WorkspaceEdit: class {
    replace(): void {}
    insert(): void {}
  },
  Range: class {
    constructor(
      readonly start: unknown,
      readonly startCharacter: unknown,
      readonly end?: unknown,
      readonly endCharacter?: unknown
    ) {}
  },
  Position: class {
    constructor(
      readonly line: number,
      readonly character: number
    ) {}
  },
}));

import {
  buildAIDiagnosticSeed,
  WorkspaiCodeActionsProvider,
} from '../providers/codeActionsProvider';

describe('Workspai code action AI context', () => {
  it('builds evidence-rich debug/fix/explain seed text for editor diagnostics', () => {
    const seed = buildAIDiagnosticSeed({
      intent: 'fix-preview',
      fileName: 'src/core/verifyPackContract.ts',
      languageId: 'typescript',
      diagnostics: [
        {
          severity: 'ERROR',
          line: 38,
          column: 29,
          fileLineLabel: 'src/core/verifyPackContract.ts:38:29',
          message: "Cannot find name 'VerifyPackOutputContrac'.",
        },
      ],
      snippet: 'export function buildVerifyPackOutputContract(): VerifyPackOutputContrac t {}',
    });

    expect(seed).toContain('Fix with Workspai');
    expect(seed).toContain('File: src/core/verifyPackContract.ts');
    expect(seed).toContain('Language: typescript');
    expect(seed).toContain('[ERROR] src/core/verifyPackContract.ts:38:29');
    expect(seed).toContain('Selected/current code evidence:');
    expect(seed).toContain('Studio rules:');
    expect(seed).toContain('Do not invent missing config files');
    expect(seed).toContain('prefer the local project typecheck/test command');
    expect(seed).toContain('rollback note');
  });

  it('exposes only Fix and Explain editor AI actions', () => {
    const provider = new WorkspaiCodeActionsProvider();
    const range = {
      start: { line: 37, character: 28 },
      end: { line: 37, character: 52 },
    };
    const document = {
      fileName: '/repo/src/core/verifyPackContract.ts',
      languageId: 'typescript',
      uri: { fsPath: '/repo/src/core/verifyPackContract.ts' },
      validateRange: (value: unknown) => value,
      getText: () => 'const value: VerifyPackOutputContrac = {};',
    };
    const context = {
      diagnostics: [
        {
          severity: 0,
          message: "Cannot find name 'VerifyPackOutputContrac'.",
          range,
        },
      ],
    };

    const actions = provider.provideCodeActions(
      document as any,
      range as any,
      context as any,
      {} as any
    );

    expect(actions?.map((action) => action.title)).toEqual([
      'Fix with Workspai',
      'Explain with Workspai',
    ]);
    expect(actions?.map((action) => action.title)).not.toContain('Debug with Workspai AI');
    expect(actions?.map((action) => action.title)).not.toContain('Preview fix with Workspai AI');
    expect(actions?.map((action) => action.title)).not.toContain('Analyze change impact with AI');

    const fixCommand = actions?.[0].command as {
      command: string;
      arguments: Array<Record<string, unknown>>;
    };
    expect(fixCommand.command).toBe('workspai.openIncidentStudio');
    expect(fixCommand.arguments[0]).toMatchObject({
      source: 'code-action',
      trigger: 'editor-fix',
      editorIssue: {
        filePath: '/repo/src/core/verifyPackContract.ts',
        fileName: 'src/core/verifyPackContract.ts',
        languageId: 'typescript',
      },
    });
    expect(fixCommand.arguments[0]).not.toHaveProperty('workspacePath');
    expect(fixCommand.arguments[0]).not.toHaveProperty('projectPath');
    expect(fixCommand.arguments[0]).not.toHaveProperty('projectType');

    const explainCommand = actions?.[1].command as {
      command: string;
      arguments: Array<Record<string, unknown>>;
    };
    expect(explainCommand.command).toBe('workspai.openWorkspaceAdvisor');
    expect(explainCommand.arguments[0]).toMatchObject({
      source: 'code-action',
      trigger: 'editor-explain',
      editorIssue: {
        filePath: '/repo/src/core/verifyPackContract.ts',
        fileName: 'src/core/verifyPackContract.ts',
        languageId: 'typescript',
      },
    });
    expect(explainCommand.arguments[0]).not.toHaveProperty('workspacePath');
    expect(explainCommand.arguments[0]).not.toHaveProperty('projectPath');
    expect(explainCommand.arguments[0]).not.toHaveProperty('projectType');
  });
});
