import * as vscode from 'vscode';
import path from 'node:path';
import { readStudioNativeComparison } from './studioNativeWorkspace.js';

const SCHEME = 'workspai-checkpoint';
export function studioNativeSnapshotUri(input: {
  workspacePath: string;
  transactionId: string;
  relativePath: string;
  side: 'before' | 'after';
}): vscode.Uri {
  return vscode.Uri.from({
    scheme: SCHEME,
    path: '/' + path.basename(input.relativePath),
    query: new URLSearchParams({
      root: input.workspacePath,
      transaction: input.transactionId,
      file: input.relativePath,
      side: input.side,
    }).toString(),
  });
}
/** Immutable, readonly byte snapshots let built-in asset editors review real before/after data. */
export function registerStudioNativeBinaryDocuments(): vscode.Disposable {
  const changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  const read = async (uri: vscode.Uri): Promise<Uint8Array> => {
    const query = new URLSearchParams(uri.query);
    const side = query.get('side');
    if (uri.scheme !== SCHEME || !['before', 'after'].includes(side ?? '')) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    const file = await readStudioNativeComparison(
      query.get('root') ?? '',
      query.get('transaction') ?? '',
      query.get('file') ?? ''
    );
    const content = side === 'before' ? file.before : file.after;
    return content === null ? new Uint8Array() : Buffer.from(content, file.encoding ?? 'utf8');
  };
  const denied = (): never => {
    throw vscode.FileSystemError.NoPermissions('Checkpoint snapshots are read-only.');
  };
  const registration = vscode.workspace.registerFileSystemProvider(
    SCHEME,
    {
      onDidChangeFile: changes.event,
      watch: () => ({ dispose() {} }),
      async stat(uri) {
        return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: (await read(uri)).length };
      },
      readFile: read,
      readDirectory: () => [],
      createDirectory: denied,
      writeFile: denied,
      delete: denied,
      rename: denied,
    },
    { isReadonly: true, isCaseSensitive: process.platform !== 'win32' }
  );
  return {
    dispose() {
      registration.dispose();
      changes.dispose();
    },
  };
}
