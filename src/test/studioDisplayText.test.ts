import { describe, expect, it } from 'vitest';

import { compactStudioPathText } from '../../webview-ui/src/lib/studioDisplayText';

describe('studioDisplayText', () => {
  it('redacts Linux absolute paths without changing surrounding copy', () => {
    expect(
      compactStudioPathText(
        'Append 2 line(s) to /opt/fixtures/workspaces/polyglot-workspace-wsp/fastapi-service/.gitignore when missing.'
      )
    ).toBe('Append 2 line(s) to $LOCAL_PATH when missing.');
  });

  it('compacts commands for display while keeping command shape readable', () => {
    expect(
      compactStudioPathText(
        'cd "/opt/fixtures/samples/new-wsp/asp-api" && npx rapidkit doctor project --json'
      )
    ).toBe('cd "$LOCAL_PATH" && npx rapidkit doctor project --json');
  });

  it('compacts Windows paths and leaves relative evidence paths alone', () => {
    expect(
      compactStudioPathText(
        'Run C:\\Users\\rapid\\workspaces\\demo\\web\\package.json then .rapidkit/reports/doctor-last-run.json'
      )
    ).toBe('Run $LOCAL_PATH then .rapidkit/reports/doctor-last-run.json');
  });

  it('can compact primary dashboard scope labels to names instead of full local paths', () => {
    expect(
      compactStudioPathText('/opt/fixtures/workspaces/polyglot-workspace-wsp', {
        keepSegments: 2,
      })
    ).toBe('$LOCAL_PATH');
  });

  it('redacts traversal paths while preserving portable project paths', () => {
    expect(compactStudioPathText('Changed ../../private/grpc/src/core.cc and src/public.cc')).toBe(
      'Changed $EXTERNAL_PATH and src/public.cc'
    );
  });
});
