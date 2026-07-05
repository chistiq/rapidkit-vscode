import { describe, expect, it } from 'vitest';

import { compactStudioPathText } from '../../webview-ui/src/lib/studioDisplayText';

describe('studioDisplayText', () => {
  it('compacts Linux absolute paths without changing surrounding copy', () => {
    expect(
      compactStudioPathText(
        'Append 2 line(s) to /home/rapidx/rapidkit/workspaces/polyglot-workspace-wsp/fastapi-service/.gitignore when missing.'
      )
    ).toBe(
      'Append 2 line(s) to .../polyglot-workspace-wsp/fastapi-service/.gitignore when missing.'
    );
  });

  it('compacts commands for display while keeping command shape readable', () => {
    expect(
      compactStudioPathText(
        'cd "/home/rapidx/Documents/WOSP/Rapid/Test/new-wsp/asp-api" && npx rapidkit doctor project --json'
      )
    ).toBe('cd ".../Test/new-wsp/asp-api" && npx rapidkit doctor project --json');
  });

  it('compacts Windows paths and leaves relative evidence paths alone', () => {
    expect(
      compactStudioPathText(
        'Run C:\\Users\\rapid\\workspaces\\demo\\web\\package.json then .rapidkit/reports/doctor-last-run.json'
      )
    ).toBe('Run .../demo/web/package.json then .rapidkit/reports/doctor-last-run.json');
  });

  it('can compact primary dashboard scope labels to names instead of full local paths', () => {
    expect(
      compactStudioPathText('/home/rapidx/rapidkit/workspaces/polyglot-workspace-wsp', {
        keepSegments: 2,
      })
    ).toBe('.../workspaces/polyglot-workspace-wsp');
  });
});
