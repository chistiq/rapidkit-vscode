import { describe, expect, it } from 'vitest';

import {
  extractStudioCommandsFromText,
  normalizeStudioRunnableCommand,
} from '../../webview-ui/src/lib/studioCommandActions';

describe('studioCommandActions', () => {
  it('normalizes runnable shell commands and ignores comments', () => {
    expect(
      normalizeStudioRunnableCommand(
        '# workspace root\nnpx rapidkit workspace verify --from-impact .rapidkit/reports/workspace-impact-last-run.json --json'
      )
    ).toBe(
      'npx rapidkit workspace verify --from-impact .rapidkit/reports/workspace-impact-last-run.json --json'
    );
  });

  it('extracts commands from fenced blocks and inline verify lines', () => {
    const commands = extractStudioCommandsFromText(
      [
        'Next action: Resolve verify blocker',
        'Verify: rapidkit doctor workspace | git -C "/tmp/workspace" status --short',
        '```bash',
        'npx rapidkit workspace verify --json',
        '```',
      ].join('\n')
    );

    expect(commands).toEqual([
      'npx rapidkit workspace verify --json',
      'rapidkit doctor workspace | git -C "/tmp/workspace" status --short',
    ]);
  });
});
