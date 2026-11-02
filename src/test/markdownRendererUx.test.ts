import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { MarkdownRenderer } from '../../webview-ui/src/components/MarkdownRenderer';
import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('MarkdownRenderer professional chat output', () => {
  const renderer = read('webview-ui/src/components/MarkdownRenderer.tsx');
  const styles = read('webview-ui/src/styles-tailwind.css');

  it('keeps formatted tables, quotes and code visible while streaming and disables incomplete command execution', async () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    const container = dom.window.document.getElementById('root')!;
    const root = createRoot(container);
    const onRun = vi.fn();
    const content =
      'Results\n\n| Name | Value |\n| :--- | ---: |\n| `a|b` | safe\\|text |\n\n> Observed output\n\n```sh\nnpm run build\n```';
    try {
      await act(async () =>
        root.render(
          createElement(MarkdownRenderer, { content, isStreaming: true, onRunCommand: onRun })
        )
      );
      expect(container.querySelectorAll('th')).toHaveLength(2);
      expect([...container.querySelectorAll('td')].map((cell) => cell.textContent)).toEqual([
        'a|b',
        'safe|text',
      ]);
      expect(container.querySelector('blockquote')?.textContent).toBe('Observed output');
      expect(container.querySelector('pre')?.getAttribute('dir')).toBe('ltr');
      const run = container.querySelector<HTMLButtonElement>('button[aria-label="Run command"]')!;
      expect(run.disabled).toBe(true);
      await act(async () => run.click());
      expect(onRun).not.toHaveBeenCalled();
      await act(async () =>
        root.render(
          createElement(MarkdownRenderer, {
            content: content + '\n\n**Verified result**',
            isStreaming: true,
            onRunCommand: onRun,
          })
        )
      );
      await act(async () => vi.advanceTimersByTime(20));
      expect(container.querySelector('strong')?.textContent).toBe('Verified result');
      await act(async () =>
        root.render(
          createElement(MarkdownRenderer, { content, isStreaming: false, onRunCommand: onRun })
        )
      );
      expect(
        container.querySelector<HTMLButtonElement>('button[aria-label="Run command"]')?.disabled
      ).toBe(false);
      expect(container.querySelector('.md-body')?.getAttribute('dir')).toBe('auto');
    } finally {
      await act(async () => root.unmount());
      vi.useRealTimers();
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });

  it('renders the product introduction as prose instead of a Command card', async () => {
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(dom.window.document.getElementById('root')!);
    try {
      await act(async () =>
        root.render(
          createElement(MarkdownRenderer, {
            content:
              'Workspai is a workspace intelligence assistant that models projects, dependencies, and relationships.',
            onRunCommand: vi.fn(),
          })
        )
      );
      expect(dom.window.document.querySelector('.md-command-card')).toBeNull();
      expect(dom.window.document.body.textContent).toContain(
        'Workspai is a workspace intelligence assistant'
      );
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });

  it('renders Persian explanatory text as prose rather than creating a runnable command from npm or Git mentions', async () => {
    const content =
      'npm \u0628\u0627 \u0628\u0631\u0686\u0633\u0628 `latest` \u0646\u0633\u062e\u0647 0.80.0\n\nGit \u0627\u0648\u0644\u06cc\u0647 \u0646\u0633\u0627\u062e\u062a\u0647 \u0634\u062f';
    const dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = dom.window.document.getElementById('root')!;
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(createElement(MarkdownRenderer, { content, onRunCommand: () => {} }))
      );
      expect(container.querySelector('.md-command-card')).toBeNull();
      expect(container.querySelector('.md-inline-code')).not.toBeNull();
      expect(container.textContent).toContain('0.80.0');
      await act(async () =>
        root.render(
          createElement(MarkdownRenderer, {
            content:
              '```sh\nnpm ci \u0646\u0635\u0628 \u06a9\u0646\u06cc\u062f\u060c \u0633\u067e\u0633 npm run lint\n```',
            onRunCommand: () => {},
          })
        )
      );
      expect(container.querySelector('button[aria-label="Run command"]')).toBeNull();
      expect(container.textContent).toContain('npm ci');
      expect(container.querySelector('button[aria-label="Copy code"]')).not.toBeNull();
      await act(async () =>
        root.render(
          createElement(MarkdownRenderer, {
            content: 'workspai create project nextjs sample',
            onRunCommand: () => {},
          })
        )
      );
      expect(container.querySelector('.md-command-card')).not.toBeNull();
      expect(container.querySelector('button[aria-label="Run command"]')).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });

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
