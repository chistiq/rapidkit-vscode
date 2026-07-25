import type * as vscode from 'vscode';
import type { FilePatch } from './patchApplyEngine.js';

const STORAGE_KEY = 'workspai.sidebarStudioRepairState.v1';
const MAX_ENTRIES = 12;
const MAX_BYTES = 2 * 1024 * 1024;

type StoredRepairState = {
  entries: Array<{ key: string; patches: FilePatch[]; updatedAt: string }>;
};

function readState(context: vscode.ExtensionContext): StoredRepairState {
  const value = context.workspaceState.get<StoredRepairState>(STORAGE_KEY);
  return value && Array.isArray(value.entries) ? value : { entries: [] };
}

export function readSidebarPendingPatches(
  context: vscode.ExtensionContext,
  key: string
): FilePatch[] | undefined {
  const entry = readState(context).entries.find((candidate) => candidate.key === key);
  return entry?.patches;
}

export async function saveSidebarPendingPatches(
  context: vscode.ExtensionContext,
  key: string,
  patches: FilePatch[]
): Promise<void> {
  const serialized = JSON.stringify(patches);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) {
    throw new Error('Pending patch transaction exceeds the durable Studio state limit.');
  }
  const state = readState(context);
  const entries = state.entries.filter((entry) => entry.key !== key);
  entries.unshift({
    key,
    patches: JSON.parse(serialized) as FilePatch[],
    updatedAt: new Date().toISOString(),
  });
  await context.workspaceState.update(STORAGE_KEY, { entries: entries.slice(0, MAX_ENTRIES) });
}

export async function clearSidebarPendingPatches(
  context: vscode.ExtensionContext,
  key: string
): Promise<void> {
  const state = readState(context);
  await context.workspaceState.update(STORAGE_KEY, {
    entries: state.entries.filter((entry) => entry.key !== key),
  });
}
