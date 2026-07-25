import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

const { openTextDocumentMock, showTextDocumentMock } = vi.hoisted(() => ({
  openTextDocumentMock: vi.fn(),
  showTextDocumentMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  Uri: {
    file: (targetPath: string) => ({ fsPath: targetPath }),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  workspace: {
    openTextDocument: openTextDocumentMock,
  },
  window: {
    showTextDocument: showTextDocumentMock,
  },
}));

import { openWorkspacePath } from '../utils/workspacePathNavigation';

describe('workspacePathNavigation project artifact roots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens adopted project artifacts outside the workspace when project root is allowed', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-workspace-'));
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-project-'));
    const artifactPath = path.join(
      projectPath,
      '.rapidkit',
      'reports',
      'doctor-project-last-run.json'
    );
    await fs.ensureDir(path.dirname(artifactPath));
    await fs.writeJSON(artifactPath, { ok: true });
    openTextDocumentMock.mockResolvedValueOnce({ uri: { fsPath: artifactPath } });

    await openWorkspacePath({
      workspacePath,
      path: artifactPath,
      allowedRootPaths: [projectPath],
    });

    expect(openTextDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: artifactPath })
    );
    expect(showTextDocumentMock).toHaveBeenCalled();
  });
});
