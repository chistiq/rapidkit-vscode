import path from 'node:path';
import fs from 'fs-extra';

export type StudioOpenDocument = { text: string; version: number; dirty: boolean };
export type StudioDocumentReplacement = {
  path: string;
  before: string;
  after: string;
  version: number;
};
export interface StudioNativeDocuments {
  get(file: string): StudioOpenDocument | undefined;
  replace(edits: StudioDocumentReplacement[]): Promise<boolean>;
  save(file: string, expected: string): Promise<boolean>;
}
let documents: StudioNativeDocuments | undefined;
export function configureStudioNativeDocuments(adapter?: StudioNativeDocuments): void {
  documents = adapter;
}
export function studioOpenDocument(file: string): StudioOpenDocument | undefined {
  return documents?.get(path.resolve(file));
}
export async function readStudioWorkingBytes(file: string): Promise<Buffer> {
  const document = studioOpenDocument(file);
  return document?.dirty ? Buffer.from(document.text, 'utf8') : fs.readFile(file);
}
export async function replaceStudioDocuments(edits: StudioDocumentReplacement[]): Promise<void> {
  if (!edits.length) {
    return;
  }
  if (!documents || !(await documents.replace(edits))) {
    throw new Error('Open documents changed during the edit; no buffer edits were accepted.');
  }
}
export async function saveStudioDocument(file: string, expected: string): Promise<void> {
  if (!documents || !(await documents.save(file, expected))) {
    throw new Error('The owned document could not be saved. Inspect its current editor state.');
  }
}
