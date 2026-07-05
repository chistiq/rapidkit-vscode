import { describe, expect, it } from 'vitest';

import {
  extractStudioRunnableCommandFromLine,
  extractStudioCommandsFromText,
  normalizeStudioRunnableCommand,
} from '../../webview-ui/src/lib/studioCommandActions';

describe('studioCommandActions', () => {
  it('accepts local package rapidkit commands used by extension terminals', () => {
    expect(
      normalizeStudioRunnableCommand(
        'npx --yes --package file:/repo/rapidkit-npm rapidkit workspace verify --json'
      )
    ).toBe('npx --yes --package file:/repo/rapidkit-npm rapidkit workspace verify --json');
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
