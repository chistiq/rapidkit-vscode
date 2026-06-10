import * as vscode from 'vscode';

function appendTextPart(rawText: string, part: unknown): string {
  if (part instanceof vscode.LanguageModelTextPart) {
    return rawText + part.value;
  }
  if (typeof part === 'string') {
    return rawText + part;
  }
  if (part && typeof part === 'object' && 'value' in part) {
    const value = (part as { value?: unknown }).value;
    if (typeof value === 'string') {
      return rawText + value;
    }
  }
  return rawText;
}

/**
 * Read all text from a Language Model response.
 * Some VS Code builds/providers populate `stream`, others are easier via `text`.
 */
export async function readLanguageModelResponseText(
  response: vscode.LanguageModelChatResponse,
  token?: vscode.CancellationToken
): Promise<string> {
  let rawText = '';

  try {
    for await (const part of response.stream) {
      if (token?.isCancellationRequested) {
        break;
      }
      rawText = appendTextPart(rawText, part);
    }
  } catch {
    // Fall through to response.text when stream fails or is already consumed.
  }

  if (rawText.trim()) {
    return rawText;
  }

  try {
    for await (const chunk of response.text) {
      if (token?.isCancellationRequested) {
        break;
      }
      rawText += chunk;
    }
  } catch {
    // Ignore — caller decides how to handle empty output.
  }

  return rawText;
}
