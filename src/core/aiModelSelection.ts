import * as vscode from 'vscode';
import { languageModelSupportsExtensionRequests } from './aiModelIdentity.js';

interface ModelSelectionCacheEntry {
  preference: string;
  result: {
    model: vscode.LanguageModelChat;
    modelId: string;
  };
  cachedAt: number;
}

const MODEL_SELECTION_TTL_MS = 5 * 60 * 1000;
let modelSelectionCache: ModelSelectionCacheEntry | null = null;

async function selectModelByPreference(pref: string): Promise<{
  model: vscode.LanguageModelChat;
  modelId: string;
}> {
  const normalizeModelKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

  if (
    modelSelectionCache &&
    modelSelectionCache.preference === pref &&
    Date.now() - modelSelectionCache.cachedAt < MODEL_SELECTION_TTL_MS
  ) {
    const cachedModel = modelSelectionCache.result.model;
    const cachedId = normalizeModelKey(cachedModel.id);
    const cachedName = normalizeModelKey(cachedModel.name ?? '');
    const liveModels = (await vscode.lm.selectChatModels()).filter(
      languageModelSupportsExtensionRequests
    );
    const stillAvailable = liveModels.find((model) => {
      const modelId = normalizeModelKey(model.id);
      const modelName = normalizeModelKey(model.name ?? '');
      return modelId === cachedId || modelName === cachedName;
    });

    if (stillAvailable) {
      const result = {
        model: stillAvailable,
        modelId: stillAvailable.name ?? stillAvailable.id,
      };
      modelSelectionCache = {
        preference: pref,
        result,
        cachedAt: Date.now(),
      };
      return result;
    }

    modelSelectionCache = null;
  }

  const modelMap: Record<string, string[]> = {
    'claude-opus-4-6': ['claude-opus-4-6', 'claude-opus-4-5'],
    'claude-opus-4-5': ['claude-opus-4-5', 'claude-opus-4-6'],
    'claude-sonnet-4-6': ['claude-sonnet-4-6', 'claude-sonnet-4-5'],
    'claude-sonnet-4-5': ['claude-sonnet-4-5', 'claude-sonnet-4-6'],
    'claude-sonnet-4': ['claude-sonnet-4', 'claude-sonnet-4-5'],
    'claude-haiku-4-5': ['claude-haiku-4-5'],
    'gpt-5.4': ['gpt-5.4', 'gpt-5.2'],
    'gpt-5.4-mini': ['gpt-5.4-mini', 'gpt-5.4'],
    'gpt-5.3-codex': ['gpt-5.3-codex', 'gpt-5.2-codex'],
    'gpt-5.2-codex': ['gpt-5.2-codex', 'gpt-5.3-codex'],
    'gpt-5.2': ['gpt-5.2', 'gpt-5.4'],
    'gpt-5-mini': ['gpt-5-mini', 'gpt-5.2'],
    'gpt-4.1': ['gpt-4.1', 'gpt-4o'],
    'gpt-4o': ['gpt-4o', 'gpt-4.1'],
    'gemini-3.1-pro': ['gemini-3.1-pro', 'gemini-2.5-pro'],
    'gemini-3-flash': ['gemini-3-flash', 'gemini-2.5-pro'],
    'gemini-2.5-pro': ['gemini-2.5-pro', 'gemini-3.1-pro'],
    'grok-code-fast-1': ['grok-code-fast-1'],
    'raptor-mini': ['raptor-mini'],
    'claude-3-7-sonnet': ['claude-sonnet-4-6', 'claude-sonnet-4-5'],
    'claude-3-5-sonnet': ['claude-sonnet-4-5', 'claude-sonnet-4'],
    'gpt-4o-mini': ['gpt-5-mini', 'gpt-4o'],
  };

  const rememberSelection = (model: vscode.LanguageModelChat, modelId: string) => {
    const result = { model, modelId };
    modelSelectionCache = {
      preference: pref,
      result,
      cachedAt: Date.now(),
    };
    return result;
  };

  const allModels = (await vscode.lm.selectChatModels()).filter(
    languageModelSupportsExtensionRequests
  );

  const getModelSortKey = (model: vscode.LanguageModelChat): string => {
    const normalizedId = normalizeModelKey(model.id);
    const normalizedName = normalizeModelKey(model.name ?? '');
    return `${normalizedId}|${normalizedName}`;
  };

  const findModelByAlias = (alias: string): vscode.LanguageModelChat | undefined => {
    const target = normalizeModelKey(alias);
    const exact = allModels.find(
      (m) => normalizeModelKey(m.id) === target || normalizeModelKey(m.name ?? '') === target
    );
    if (exact) {
      return exact;
    }

    const prefixMatches = allModels.filter((m) => {
      const id = normalizeModelKey(m.id);
      const name = normalizeModelKey(m.name ?? '');
      return id.startsWith(target) || name.startsWith(target);
    });

    if (prefixMatches.length === 1) {
      return prefixMatches[0];
    }

    return undefined;
  };

  const tryModelAliases = (aliases: string[]) => {
    for (const alias of aliases) {
      const model = findModelByAlias(alias);
      if (model) {
        return rememberSelection(model, model.name ?? model.id);
      }
    }
    return null;
  };

  if (pref !== 'auto') {
    const preferred = tryModelAliases(modelMap[pref] ?? [pref]);
    if (preferred) {
      return preferred;
    }
  }

  const autoOrder = [
    'claude-sonnet-4-6',
    'gpt-5.3-codex',
    'gpt-5.2-codex',
    'claude-sonnet-4-5',
    'gpt-5.4',
    'gpt-5.2',
    'gemini-3.1-pro',
    'gemini-2.5-pro',
    'claude-sonnet-4',
    'gpt-4.1',
    'gpt-4o',
    'gpt-5-mini',
    'gemini-3-flash',
    'claude-haiku-4-5',
    'gpt-5.4-mini',
    'grok-code-fast-1',
  ];

  const autoSelected = tryModelAliases(autoOrder);
  if (autoSelected) {
    return autoSelected;
  }

  if (allModels.length > 0) {
    const deterministicFallback = [...allModels].sort((a, b) => {
      const aKey = getModelSortKey(a);
      const bKey = getModelSortKey(b);
      return aKey.localeCompare(bKey);
    })[0];
    return rememberSelection(
      deterministicFallback,
      deterministicFallback.name ?? deterministicFallback.id
    );
  }

  throw new Error(
    'No AI language model available. Please install GitHub Copilot or another compatible Copilot extension.'
  );
}

/**
 * Select the language model according to the user's VS Code preference.
 * Falls back to auto-detection when set to "auto" or unrecognized.
 */
export async function selectModelWithPreference(): Promise<{
  model: vscode.LanguageModelChat;
  modelId: string;
}> {
  const pref = vscode.workspace.getConfiguration('workspai').get<string>('preferredModel', 'auto');
  return selectModelByPreference(pref);
}

/**
 * Force auto model selection regardless of user preference.
 * Use this for behind-the-scenes analysis flows where no explicit user model is chosen.
 */
export async function selectModelAuto(): Promise<{
  model: vscode.LanguageModelChat;
  modelId: string;
}> {
  return selectModelByPreference('auto');
}

export function resetModelSelectionCache(): void {
  modelSelectionCache = null;
}

/**
 * Register a VS Code configuration change listener that immediately invalidates
 * the model selection cache when the user changes `workspai.preferredModel`.
 * Call once from the extension activation entry point.
 */
export function registerModelCacheConfigListener(context: {
  subscriptions: { dispose(): void }[];
}): void {
  const disposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('workspai.preferredModel')) {
      resetModelSelectionCache();
    }
  });
  context.subscriptions.push(disposable);
}
