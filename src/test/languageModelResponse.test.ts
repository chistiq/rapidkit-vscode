import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  LanguageModelTextPart: class {
    value: string;

    constructor(value: string) {
      this.value = value;
    }
  },
}));

import * as vscode from 'vscode';
import { readLanguageModelResponseText } from '../core/languageModelResponse.js';

describe('readLanguageModelResponseText', () => {
  it('reads text parts from stream', async () => {
    const response = {
      stream: (async function* () {
        yield new vscode.LanguageModelTextPart('{"framework":"nestjs"}');
      })(),
      text: (async function* () {
        yield 'ignored-when-stream-has-data';
      })(),
    } as vscode.LanguageModelChatResponse;

    await expect(readLanguageModelResponseText(response)).resolves.toBe('{"framework":"nestjs"}');
  });

  it('falls back to response.text when stream is empty', async () => {
    const response = {
      stream: (async function* () {
        // empty
      })(),
      text: (async function* () {
        yield '{"framework":"fastapi"}';
      })(),
    } as vscode.LanguageModelChatResponse;

    await expect(readLanguageModelResponseText(response)).resolves.toBe('{"framework":"fastapi"}');
  });
});
