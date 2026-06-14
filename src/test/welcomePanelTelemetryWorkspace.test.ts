import path from 'path';
import { describe, expect, it } from 'vitest';

import { resolveTelemetryWorkspacePath } from '../ui/panels/welcomePanelTelemetryWorkspace';

describe('resolveTelemetryWorkspacePath', () => {
  it('prefers the selected workspace when both workspace and project are present', () => {
    const selectedWorkspacePath = path.join('/workspaces', 'customer-platform');
    const selectedProjectPath = path.join('/other', 'service-api');

    expect(
      resolveTelemetryWorkspacePath(
        { path: selectedProjectPath, workspacePath: path.join('/other', 'workspace') },
        selectedWorkspacePath,
        undefined
      )
    ).toBe(selectedWorkspacePath);
  });

  it('uses the project workspace root instead of guessing from the project parent', () => {
    const workspacePath = path.join('/workspaces', 'customer-platform');
    const projectPath = path.join(workspacePath, 'services', 'billing-api');

    expect(
      resolveTelemetryWorkspacePath({ path: projectPath, workspacePath }, undefined, undefined)
    ).toBe(workspacePath);
  });

  it('falls back to the project parent only for legacy project selections', () => {
    const projectPath = path.join('/workspaces', 'customer-platform', 'billing-api');

    expect(resolveTelemetryWorkspacePath({ path: projectPath }, undefined, undefined)).toBe(
      path.dirname(projectPath)
    );
  });
});
