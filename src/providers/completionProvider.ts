/**
 * Completion Provider
 * Provides IntelliSense for Workspai configuration files
 */

import * as vscode from 'vscode';
import { isWorkspaiConfigurationFile } from './workspaiConfigFiles';

export class WorkspaiCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] | undefined {
    const linePrefix = document.lineAt(position).text.substr(0, position.character);

    // Configuration file completions
    if (isWorkspaiConfigurationFile(document.fileName)) {
      return this.getConfigurationCompletions(linePrefix);
    }

    // Module.yaml completions
    if (document.fileName.endsWith('module.yaml')) {
      return this.getModuleCompletions(linePrefix);
    }

    return undefined;
  }

  private getConfigurationCompletions(_linePrefix: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    // Framework completions
    const frameworkItem = new vscode.CompletionItem(
      'framework',
      vscode.CompletionItemKind.Property
    );
    frameworkItem.detail = 'Framework type';
    frameworkItem.documentation = new vscode.MarkdownString(
      'Specify the framework: `fastapi`, `nestjs`, `go`, `springboot`, or `dotnet`'
    );
    frameworkItem.insertText = new vscode.SnippetString(
      '"framework": "${1|fastapi,nestjs,go,springboot,dotnet|}"'
    );
    items.push(frameworkItem);

    // Mode completions
    const modeItem = new vscode.CompletionItem('mode', vscode.CompletionItemKind.Property);
    modeItem.detail = 'Project mode';
    modeItem.documentation = new vscode.MarkdownString('Specify the mode: `demo` or `full`');
    modeItem.insertText = new vscode.SnippetString('"mode": "${1|demo,full|}"');
    items.push(modeItem);

    // Profile completions
    const profileItem = new vscode.CompletionItem('profile', vscode.CompletionItemKind.Property);
    profileItem.detail = 'Project profile';
    profileItem.documentation = new vscode.MarkdownString(
      'Specify the workspace profile. Runtime-specific values are `python-only`, `node-only`, `go-only`, `java-only`, `dotnet-only`; governed multi-runtime values are `polyglot` and `enterprise`.'
    );
    profileItem.insertText = new vscode.SnippetString(
      '"profile": "${1|minimal,python-only,node-only,go-only,java-only,dotnet-only,polyglot,enterprise|}"'
    );
    items.push(profileItem);

    return items;
  }

  private getModuleCompletions(_linePrefix: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    // Module metadata
    const nameItem = new vscode.CompletionItem('name', vscode.CompletionItemKind.Property);
    nameItem.insertText = new vscode.SnippetString('name: ${1:module-name}');
    items.push(nameItem);

    const versionItem = new vscode.CompletionItem('version', vscode.CompletionItemKind.Property);
    versionItem.insertText = new vscode.SnippetString('version: "${1:1.0.0}"');
    items.push(versionItem);

    const descriptionItem = new vscode.CompletionItem(
      'description',
      vscode.CompletionItemKind.Property
    );
    descriptionItem.insertText = new vscode.SnippetString('description: ${1:Module description}');
    items.push(descriptionItem);

    return items;
  }
}
