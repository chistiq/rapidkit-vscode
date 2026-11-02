import { describe, expect, it } from 'vitest';

import {
  extractStudioRunnableCommandFromLine,
  extractStudioCommandsFromText,
  normalizeStudioRunnableCommand,
} from '../../webview-ui/src/lib/studioCommandActions';

describe('studioCommandActions', () => {
  it('rejects instructional text on every normalization path and never truncates a script', () => {
    const prose =
      'npm ci \u0646\u0635\u0628 \u06a9\u0646\u06cc\u062f\u060c \u0633\u067e\u0633 npm run lint';
    expect(normalizeStudioRunnableCommand(prose)).toBeNull();
    expect(extractStudioCommandsFromText(`\`\`\`sh\n${prose}\n\`\`\``)).toEqual([]);
    expect(normalizeStudioRunnableCommand('npm ci then run npm run lint')).toBeNull();
    expect(normalizeStudioRunnableCommand('npm ci\nnpm run build')).toBeNull();
    expect(normalizeStudioRunnableCommand('node "unfinished')).toBeNull();
    expect(normalizeStudioRunnableCommand('node "then.js"')).toBe('node "then.js"');
  });
  it('accepts local package rapidkit commands used by extension terminals', () => {
    expect(
      normalizeStudioRunnableCommand(
        'npx --yes --package file:/repo/rapidkit-npm rapidkit workspace verify --json'
      )
    ).toBe('npx --yes --package file:/repo/rapidkit-npm rapidkit workspace verify --json');
  });

  it('keeps explanatory prose and inline command mentions out of runnable cards', () => {
    expect(
      extractStudioRunnableCommandFromLine('The build passed after npm run build finished.')
    ).toBeNull();
    expect(
      extractStudioRunnableCommandFromLine('npm \u0628\u0627 \u0628\u0631\u0686\u0633\u0628 latest')
    ).toBeNull();
    expect(
      extractStudioRunnableCommandFromLine(
        'Git \u0627\u0648\u0644\u06cc\u0647 \u0646\u0633\u0627\u062e\u062a\u0647 \u0634\u062f'
      )
    ).toBeNull();
    expect(
      extractStudioRunnableCommandFromLine('npm run lint \u0627\u062c\u0631\u0627 \u0634\u062f')
    ).toBeNull();
    expect(extractStudioRunnableCommandFromLine('node "\u0646\u0645\u0648\u0646\u0647.js"')).toBe(
      'node "\u0646\u0645\u0648\u0646\u0647.js"'
    );
    expect(normalizeStudioRunnableCommand('workspai create project nextjs sample')).toBe(
      'workspai create project nextjs sample'
    );
    expect(normalizeStudioRunnableCommand('npx workspai --help')).toBe('npx workspai --help');
  });

  it('extracts embedded run command instructions from assistant text', () => {
    expect(
      extractStudioRunnableCommandFromLine(
        'Run the command npx --yes --package file:/repo/rapidkit-npm rapidkit doctor workspace --json to refresh evidence.'
      )
    ).toBe('npx --yes --package file:/repo/rapidkit-npm rapidkit doctor workspace --json');

    expect(
      extractStudioCommandsFromText(
        'Run the command npx --yes --package file:/repo/rapidkit-npm rapidkit doctor workspace --json to refresh evidence.'
      )
    ).toEqual(['npx --yes --package file:/repo/rapidkit-npm rapidkit doctor workspace --json']);
  });
});
