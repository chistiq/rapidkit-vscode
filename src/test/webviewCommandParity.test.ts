import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { DASHBOARD_COMMAND_CONTRACTS } from '../core/dashboardCommandContracts';
import { SIDEBAR_ACTION_SURFACE } from '../contracts/sidebarActionSurface';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function collectPostMessageCommands(source: string): string[] {
  return Array.from(source.matchAll(/\b(?:vscode\.)?postMessage\(\s*['"]([^'"]+)['"]/g)).map(
    (match) => match[1]
  );
}

function collectQuotedCommandsFromSource(source: string): string[] {
  return Array.from(source.matchAll(/['"]([a-z][A-Za-z0-9]+)['"]/g)).map((match) => match[1]);
}

function sourceFilesUnder(relPath: string): string[] {
  const absoluteRoot = path.join(repoRoot, relPath);
  const files: string[] = [];
  const visit = (absolutePath: string) => {
    for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
      const child = path.join(absolutePath, entry.name);
      if (entry.isDirectory()) {
        visit(child);
      } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
        files.push(path.relative(repoRoot, child));
      }
    }
  };
  visit(absoluteRoot);
  return files.sort();
}

function collectPrimaryWebviewPostedCommands(): string[] {
  const files = sourceFilesUnder('webview-ui/src').filter(
    (file) => !file.startsWith('webview-ui/src/sidebar/')
  );
  return [...new Set(files.flatMap((file) => collectPostMessageCommands(read(file))))].sort();
}

function collectPrimaryHostHandledCommands(): string[] {
  const messageFiles = sourceFilesUnder('src/ui/panels');
  const sourceCommands = messageFiles.flatMap((file) =>
    collectQuotedCommandsFromSource(read(file))
  );
  const contractCommands = Object.keys(DASHBOARD_COMMAND_CONTRACTS);
  return [...new Set([...sourceCommands, ...contractCommands])].sort();
}

function collectSidebarPostedCommands(): string[] {
  const files = sourceFilesUnder('webview-ui/src/sidebar');
  return [...new Set(files.flatMap((file) => collectPostMessageCommands(read(file))))].sort();
}

function collectSidebarHandledCommands(): string[] {
  const dispatcherCommands = collectQuotedCommandsFromSource(
    read('src/ui/webviews/actionsWebviewMessageDispatcher.ts')
  );
  const surfaceCommands = Object.keys(SIDEBAR_ACTION_SURFACE);
  return [...new Set([...dispatcherCommands, ...surfaceCommands])].sort();
}

function collectSidebarHostPostedCommands(): string[] {
  const host = read('src/ui/webviews/actionsWebviewProvider.ts');
  return [
    ...new Set(
      Array.from(host.matchAll(/_postInlineCreate\(\s*['"]([^'"]+)['"]/g)).map((match) => match[1])
    ),
  ].sort();
}

function collectSidebarHostMessageConsumers(): string[] {
  const secondarySidebar = read('webview-ui/src/sidebar/SecondarySidebar.tsx');
  const sidebarApp = read('webview-ui/src/sidebar/SidebarApp.tsx');
  return [
    ...new Set([
      ...Array.from(secondarySidebar.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g)).map(
        (match) => match[1]
      ),
      ...Array.from(sidebarApp.matchAll(/command\s*===\s*['"]([^'"]+)['"]/g)).map(
        (match) => match[1]
      ),
    ]),
  ].sort();
}

describe('webview command parity', () => {
  it('keeps primary dashboard posted commands backed by host message handlers', () => {
    const posted = collectPrimaryWebviewPostedCommands();
    const handled = new Set(collectPrimaryHostHandledCommands());
    const missing = posted.filter((command) => !handled.has(command));

    expect(missing).toEqual([]);
  });

  it('keeps secondary sidebar posted commands backed by host message handlers', () => {
    const posted = collectSidebarPostedCommands();
    const handled = new Set(collectSidebarHandledCommands());
    const missing = posted.filter((command) => !handled.has(command));

    expect(missing).toEqual([]);
  });

  it('keeps host sidebar responses backed by React message consumers', () => {
    const posted = collectSidebarHostPostedCommands();
    const consumed = new Set(collectSidebarHostMessageConsumers());
    const missing = posted.filter((command) => !consumed.has(command));

    expect(missing).toEqual([]);
  });
});
