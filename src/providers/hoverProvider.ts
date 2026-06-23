/**
 * Hover Provider
 * Provides documentation on hover for Workspai files
 */

import * as vscode from 'vscode';
import { isWorkspaiConfigurationFile } from './workspaiConfigFiles';

export class WorkspaiHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position);
    if (!range) {
      return undefined;
    }

    const word = document.getText(range);

    // Configuration file hovers
    if (isWorkspaiConfigurationFile(document.fileName)) {
      return this.getConfigurationHover(word);
    }

    // Module.yaml hovers
    if (document.fileName.endsWith('module.yaml')) {
      return this.getModuleHover(word);
    }

    return undefined;
  }

  private getConfigurationHover(word: string): vscode.Hover | undefined {
    const documentation: { [key: string]: vscode.MarkdownString } = {
      framework: new vscode.MarkdownString(
        '**Framework**\n\nSpecifies the backend framework for the project.\n\n' +
          'Supported values:\n' +
          '- `fastapi` - Python FastAPI framework\n' +
          '- `nestjs` - TypeScript NestJS framework\n' +
          '- `go` - Go backend service\n' +
          '- `springboot` - Java Spring Boot framework'
      ),
      mode: new vscode.MarkdownString(
        '**Mode**\n\nProject generation mode.\n\n' +
          'Supported values:\n' +
          '- `demo` - Quick demo with example code\n' +
          '- `full` - Full production-ready project'
      ),
      profile: new vscode.MarkdownString(
        '**Profile**\n\nProject complexity profile.\n\n' +
          'Supported values:\n' +
          '- `minimal` - Basic structure\n' +
          '- `python-only` - Python runtime dependencies\n' +
          '- `node-only` - Node.js runtime dependencies\n' +
          '- `go-only` - Go runtime dependencies\n' +
          '- `java-only` - Java runtime dependencies\n' +
          '- `dotnet-only` - .NET runtime dependencies\n' +
          '- `polyglot` - Multi-runtime dependencies\n' +
          '- `enterprise` - Full enterprise setup'
      ),
      pythonVersion: new vscode.MarkdownString(
        '**Python Version**\n\nMinimum Python version required.\n\n' + 'Example: `"3.10"`'
      ),
      nodeVersion: new vscode.MarkdownString(
        '**Node Version**\n\nMinimum Node.js version required.\n\n' + 'Example: `"18.0.0"`'
      ),
    };

    if (word in documentation) {
      return new vscode.Hover(documentation[word]);
    }

    return undefined;
  }

  private getModuleHover(word: string): vscode.Hover | undefined {
    const documentation: { [key: string]: vscode.MarkdownString } = {
      name: new vscode.MarkdownString(
        '**Module Name**\n\nUnique identifier for the module.\n\n' +
          'Format: `kebab-case`\n\n' +
          'Example: `user-authentication`'
      ),
      version: new vscode.MarkdownString(
        '**Module Version**\n\nSemantic version of the module.\n\n' +
          'Format: `major.minor.patch`\n\n' +
          'Example: `"1.0.0"`'
      ),
      description: new vscode.MarkdownString(
        '**Module Description**\n\nBrief description of module functionality.'
      ),
      category: new vscode.MarkdownString(
        '**Module Category**\n\nFunctional category of the module.\n\n' +
          'Examples: `auth`, `database`, `cache`, `communication`'
      ),
      dependencies: new vscode.MarkdownString(
        '**Module Dependencies**\n\nList of required modules or packages.'
      ),
    };

    if (word in documentation) {
      return new vscode.Hover(documentation[word]);
    }

    return undefined;
  }
}
