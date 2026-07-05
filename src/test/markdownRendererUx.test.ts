import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('MarkdownRenderer professional chat output', () => {
  const renderer = read('webview-ui/src/components/MarkdownRenderer.tsx');
  const styles = read('webview-ui/src/styles-tailwind.css');

  it('parses indented fenced code blocks instead of leaking raw markdown fences', () => {
    expect(renderer).toContain('function isFenceOpen');
    expect(renderer).toContain('function isFenceClose');
    expect(renderer).toContain('line.match(/^\\s*```');
    expect(renderer).toContain('!isFenceOpen(lines[i])');
  });

  it('renders copy actions for all code blocks and run actions for runnable commands', () => {
    expect(renderer).toContain('Copy code');
    expect(renderer).toContain('copyText(codeText, onCopyCommand)');
    expect(renderer).toContain('runnableCommand && onRunCommand');
    expect(renderer).toContain('onRunCommand(runnableCommand)');
  });

  it('turns inline command instructions into compact copy/run command cards', () => {
    expect(renderer).toContain('function commandFromParagraphLine');
    expect(renderer).toContain('extractStudioRunnableCommandFromLine(line)');
    expect(renderer).toContain('md-command-card');
    expect(renderer).toContain('onRunCommand(command)');
    expect(renderer).toContain('compactStudioPathText(command)');
    expect(renderer).toContain('compactStudioPathText(codeText)');
    expect(styles).toContain('.md-command-card');
    expect(styles).toContain('.md-command-card__actions');
    expect(styles).toContain('white-space: pre-wrap');
    expect(styles).toContain('overflow-wrap: anywhere');
  });
});
