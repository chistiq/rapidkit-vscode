import path from 'node:path';
import * as vscode from 'vscode';
import { configureStudioNativeDocuments } from './studioNativeDocuments.js';

/** Public bulk-edit API provides versioned, atomic text edits without saving user buffers. */
export function registerStudioNativeDocuments(): vscode.Disposable {
  const find = (file: string) =>
    vscode.workspace.textDocuments.find(
      (document) =>
        document.uri.scheme === 'file' &&
        !document.isClosed &&
        path.resolve(document.uri.fsPath) === path.resolve(file)
    );
  configureStudioNativeDocuments({
    get(file) {
      const document = find(file);
      return document
        ? { text: document.getText(), version: document.version, dirty: document.isDirty }
        : undefined;
    },
    async replace(edits) {
      if (!vscode.workspace.isTrusted) {
        throw new Error('Workspace trust changed before the editor edit.');
      }
      const change = new vscode.WorkspaceEdit();
      for (const edit of edits) {
        const document = find(edit.path);
        if (!document || document.version !== edit.version || document.getText() !== edit.before) {
          return false;
        }
        if (edit.before !== edit.after) {
          change.replace(
            document.uri,
            new vscode.Range(document.positionAt(0), document.positionAt(edit.before.length)),
            edit.after
          );
        }
      }
      return vscode.workspace.applyEdit(change);
    },
    async save(file, expected) {
      if (!vscode.workspace.isTrusted) {
        throw new Error('Workspace trust changed before saving.');
      }
      const document = find(file);
      if (!document || document.getText() !== expected) {
        return false;
      }
      return document.save();
    },
  });
  return {
    dispose() {
      configureStudioNativeDocuments();
    },
  };
}
