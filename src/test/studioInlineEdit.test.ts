import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  editor: undefined as unknown,
  folder: '',
  trusted: true,
  ask: vi.fn(),
  apply: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  choice: vi.fn(),
  change: undefined as undefined | ((event: any) => void),
  cancelled: false,
}));
vi.mock('../core/aiProviderService.js', () => ({ askConfiguredAIProviderForToolAction: fake.ask }));
vi.mock('vscode', () => ({
  EventEmitter: class {
    event = () => ({ dispose() {} });
    fire() {}
    dispose() {}
  },
  Range: class {
    constructor(
      readonly start: unknown,
      readonly end: unknown
    ) {}
  },
  CodeLens: class {
    constructor(
      readonly range: unknown,
      readonly command: unknown
    ) {}
  },
  WorkspaceEdit: class {
    replace(...args: unknown[]) {
      (this as unknown as { args: unknown[] }).args = args;
    }
  },
  Uri: { parse: (uri: string) => ({ toString: () => uri }) },
  ProgressLocation: { Notification: 15 },
  workspace: {
    get isTrusted() {
      return fake.trusted;
    },
    registerTextDocumentContentProvider: () => ({ dispose() {} }),
    onDidChangeTextDocument: (listener: (event: any) => void) => {
      fake.change = listener;
      return {
        dispose() {
          fake.change = undefined;
        },
      };
    },
    getWorkspaceFolder: () => ({ uri: { fsPath: fake.folder } }),
    applyEdit: fake.apply,
  },
  languages: { registerCodeLensProvider: () => ({ dispose() {} }) },
  commands: {
    registerCommand: (name: string, handler: (...args: unknown[]) => unknown) => {
      fake.commands.set(name, handler);
      return {
        dispose() {
          fake.commands.delete(name);
        },
      };
    },
    executeCommand: vi.fn(async () => {}),
  },
  window: {
    get activeTextEditor() {
      return fake.editor;
    },
    showInputBox: async () => 'Simplify this',
    showWarningMessage: fake.warning,
    showErrorMessage: fake.error,
    showInformationMessage: fake.choice,
    showTextDocument: vi.fn(async () => {}),
    withProgress: async (
      _options: unknown,
      task: (progress: unknown, token: unknown) => Promise<void>
    ) =>
      task(
        {},
        {
          get isCancellationRequested() {
            return fake.cancelled;
          },
          onCancellationRequested: () => ({ dispose() {} }),
        }
      ),
  },
}));
import { StudioInlineEdit } from '../core/studioInlineEdit.js';

describe('Inline edit review', () => {
  let controller: StudioInlineEdit;
  let document: {
    version: number;
    uri: { fsPath: string; scheme: string; toString(): string };
    isClosed: boolean;
    getText: () => string;
    positionAt: (offset: number) => number;
    offsetAt: (position: number) => number;
  };
  beforeEach(async () => {
    vi.clearAllMocks();
    fake.trusted = true;
    fake.cancelled = false;
    fake.folder = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-inline-'));
    document = {
      version: 1,
      uri: {
        fsPath: path.join(fake.folder, 'service.ts'),
        scheme: 'file',
        toString: () => 'file:service.ts',
      },
      isClosed: false,
      getText: () => 'let a = 1;',
      positionAt: (offset) => offset,
      offsetAt: (position) => position,
    };
    fake.editor = { document, selection: { isEmpty: true, active: 4 } };
    fake.choice.mockResolvedValue(undefined);
    fake.apply.mockResolvedValue(true);
    fake.ask.mockResolvedValue({
      type: 'tool',
      toolName: 'propose-inline-edit',
      input: { replacement: 'const a = 1;' },
    });
    controller = new StudioInlineEdit({} as never);
  });
  afterEach(async () => {
    controller.dispose();
    await fs.remove(fake.folder);
  });
  it('keeps a proposal separate from the document until explicit acceptance', async () => {
    await fake.commands.get('workspai.assistant.inlineEdit')!();
    expect(fake.apply).not.toHaveBeenCalled();
    const lenses = controller.provideCodeLenses(document as never);
    expect(lenses).toHaveLength(2);
    const command = lenses[0].command!;
    await fake.commands.get(command.command)!(...(command.arguments ?? []));
    expect(fake.apply).toHaveBeenCalledOnce();
    expect(controller.provideCodeLenses(document as never)).toEqual([]);
  });
  it('predicts from current source and recent edits, then applies only the exact reviewed block', async () => {
    fake.change!({ document, contentChanges: [{ rangeOffset: 0, rangeLength: 3, text: 'let' }] });
    fake.ask.mockResolvedValue({
      type: 'tool',
      toolName: 'propose-next-edit',
      input: { action: 'edit', oldText: 'let', replacement: 'const' },
    });
    await fake.commands.get('workspai.assistant.nextEdit')!();
    const messages = fake.ask.mock.calls[0][1];
    expect(messages[0].content).toContain('Recent editor changes');
    expect(messages[0].content).toContain('"rangeLength":3');
    expect(fake.apply).not.toHaveBeenCalled();
    const accept = controller.provideCodeLenses(document as never)[0].command!;
    await fake.commands.get(accept.command)!(...(accept.arguments ?? []));
    const edit = fake.apply.mock.calls[0][0];
    expect(edit.args.slice(1)).toEqual([{ start: 0, end: 3 }, 'const']);
  });
  it('does not turn an uncertain prediction into an edit', async () => {
    fake.ask.mockResolvedValue({
      type: 'tool',
      toolName: 'propose-next-edit',
      input: { action: 'none', oldText: '', replacement: '' },
    });
    await fake.commands.get('workspai.assistant.nextEdit')!();
    expect(controller.provideCodeLenses(document as never)).toEqual([]);
    expect(fake.apply).not.toHaveBeenCalled();
    expect(fake.choice).toHaveBeenCalledWith('No useful next edit was suggested.');
  });
  it('rebases an accepted next-edit after unrelated typing and preserves the user prefix', async () => {
    const source = '// initial\n' + 'a'.repeat(80) + '\nlet value = 1;\n';
    document.getText = () => source;
    fake.ask.mockResolvedValue({
      type: 'tool',
      toolName: 'propose-next-edit',
      input: { action: 'edit', oldText: 'let', replacement: 'const' },
    });
    await fake.commands.get('workspai.assistant.nextEdit')!();
    const accept = controller.provideCodeLenses(document as never)[0].command!;
    const prefix = '// user typing\n';
    document.version++;
    document.getText = () => prefix + source;
    await fake.commands.get(accept.command)!(...(accept.arguments ?? []));
    const start = (prefix + source).indexOf('let');
    expect(fake.apply.mock.calls[0][0].args.slice(1)).toEqual([{ start, end: start + 3 }, 'const']);
  });
  it('discards a late prediction after cancellation', async () => {
    fake.ask.mockImplementationOnce(async () => {
      fake.cancelled = true;
      return {
        type: 'tool',
        toolName: 'propose-next-edit',
        input: { action: 'edit', oldText: 'let', replacement: 'const' },
      };
    });
    await fake.commands.get('workspai.assistant.nextEdit')!();
    expect(controller.provideCodeLenses(document as never)).toEqual([]);
    expect(fake.apply).not.toHaveBeenCalled();
  });
  it('does not resurrect a proposal after the controller is disposed', async () => {
    fake.ask.mockImplementationOnce(async () => {
      controller.dispose();
      return {
        type: 'tool',
        toolName: 'propose-next-edit',
        input: { action: 'edit', oldText: 'let', replacement: 'const' },
      };
    });
    await fake.commands.get('workspai.assistant.nextEdit')!();
    expect(controller.provideCodeLenses(document as never)).toEqual([]);
    expect(fake.choice).not.toHaveBeenCalled();
  });
  it('ends model progress while the review decision remains pending', async () => {
    fake.choice.mockReturnValue(new Promise(() => {}));
    await fake.commands.get('workspai.assistant.inlineEdit')!();
    expect(controller.provideCodeLenses(document as never)).toHaveLength(2);
    expect(fake.apply).not.toHaveBeenCalled();
  });
  it('bounds prediction context around the cursor instead of sending the entire large file', async () => {
    document.getText = () =>
      'PREFIX_NOT_SENT' +
      'x'.repeat(90_000) +
      ' let a=1; ' +
      'y'.repeat(90_000) +
      'SUFFIX_NOT_SENT';
    fake.editor = { document, selection: { isEmpty: true, active: 90_020 } };
    fake.ask.mockResolvedValue({
      type: 'tool',
      toolName: 'propose-next-edit',
      input: { action: 'none', oldText: '', replacement: '' },
    });
    await fake.commands.get('workspai.assistant.nextEdit')!();
    const prompt = fake.ask.mock.calls[0][1][0].content;
    expect(prompt).not.toContain('PREFIX_NOT_SENT');
    expect(prompt).not.toContain('SUFFIX_NOT_SENT');
    expect(prompt).toContain('let a=1;');
    expect(prompt.length).toBeLessThan(26_000);
  });
  it('rejects predictions against stale source even if the document version did not change', async () => {
    fake.ask.mockImplementationOnce(async () => {
      document.getText = () => 'user changed the document';
      return {
        type: 'tool',
        toolName: 'propose-next-edit',
        input: { action: 'edit', oldText: 'let', replacement: 'const' },
      };
    });
    await fake.commands.get('workspai.assistant.nextEdit')!();
    expect(controller.provideCodeLenses(document as never)).toEqual([]);
    expect(fake.apply).not.toHaveBeenCalled();
    expect(fake.error).toHaveBeenCalledWith(expect.stringContaining('changed'));
  });
  it('rejects stale document versions at acceptance and does not apply the old edit', async () => {
    await fake.commands.get('workspai.assistant.inlineEdit')!();
    const command = controller.provideCodeLenses(document as never)[0].command!;
    document.version += 1;
    await fake.commands.get(command.command)!(...(command.arguments ?? []));
    expect(fake.apply).not.toHaveBeenCalled();
    expect(fake.warning).toHaveBeenCalledWith(expect.stringContaining('changed'));
  });
  it('does not contact a model in an untrusted workspace', async () => {
    fake.trusted = false;
    await fake.commands.get('workspai.assistant.inlineEdit')!();
    expect(fake.ask).not.toHaveBeenCalled();
    expect(fake.apply).not.toHaveBeenCalled();
  });
  it('rechecks trust at acceptance instead of using the proposal-time permission', async () => {
    await fake.commands.get('workspai.assistant.inlineEdit')!();
    const command = controller.provideCodeLenses(document as never)[0].command!;
    fake.trusted = false;
    await fake.commands.get(command.command)!(...(command.arguments ?? []));
    expect(fake.apply).not.toHaveBeenCalled();
    expect(fake.warning).toHaveBeenCalledWith(expect.stringContaining('Trust the workspace'));
  });
  it('rejects a symlink into canonical metadata even when its visible name is a source file', async () => {
    await fs.outputFile(path.join(fake.folder, '.workspai/workspace.contract.json'), '{}');
    await fs.symlink(
      path.join(fake.folder, '.workspai/workspace.contract.json'),
      document.uri.fsPath
    );
    await fake.commands.get('workspai.assistant.inlineEdit')!();
    expect(fake.ask).not.toHaveBeenCalled();
    expect(fake.warning).toHaveBeenCalledWith(expect.stringContaining('editable source scope'));
  });
  it('rejects a proposal whose target was replaced with an outside symlink', async () => {
    await fake.commands.get('workspai.assistant.inlineEdit')!();
    const command = controller.provideCodeLenses(document as never)[0].command!;
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'inline-outside-'));
    try {
      await fs.outputFile(path.join(outside, 'service.ts'), 'outside');
      await fs.symlink(path.join(outside, 'service.ts'), document.uri.fsPath);
      await fake.commands.get(command.command)!(...(command.arguments ?? []));
      expect(fake.apply).not.toHaveBeenCalled();
      expect(fake.warning).toHaveBeenCalledWith(expect.stringContaining('outside'));
    } finally {
      await fs.remove(outside);
    }
  });
});
