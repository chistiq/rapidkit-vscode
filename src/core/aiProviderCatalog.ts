export const AI_PROVIDER_IDS = [
  'vscode-lm',
  'openai',
  'anthropic',
  'gemini',
  'kimi',
  'deepseek',
  'openrouter',
  'groq',
  'mistral',
  'xai',
  'ollama',
  'openai-compatible',
] as const;

export type AIProviderKind = (typeof AI_PROVIDER_IDS)[number];
export type AIProviderProtocol = 'vscode-lm' | 'openai-compatible' | 'anthropic-messages';

export interface AIProviderDefinition {
  id: AIProviderKind;
  label: string;
  shortLabel: string;
  description: string;
  protocol: AIProviderProtocol;
  defaultBaseUrl: string;
  defaultModel: string;
  modelSuggestions: readonly string[];
  requiresApiKey: boolean;
  apiKeyLabel: string;
  docsUrl?: string;
  apiKeyUrl?: string;
  configurableBaseUrl: boolean;
}

const PROVIDERS: readonly AIProviderDefinition[] = [
  {
    id: 'vscode-lm',
    label: 'VS Code Language Models',
    shortLabel: 'VS Code',
    description: 'Use models entitled through VS Code, including GitHub Copilot models.',
    protocol: 'vscode-lm',
    defaultBaseUrl: '',
    defaultModel: 'auto',
    modelSuggestions: [],
    requiresApiKey: false,
    apiKeyLabel: 'API key',
    docsUrl: 'https://code.visualstudio.com/api/extension-guides/language-model',
    configurableBaseUrl: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    description: 'Connect directly to the OpenAI API with your own project key.',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5',
    modelSuggestions: ['gpt-5', 'gpt-5-mini'],
    requiresApiKey: true,
    apiKeyLabel: 'OpenAI API key',
    docsUrl: 'https://platform.openai.com/docs/overview',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    configurableBaseUrl: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    shortLabel: 'Claude',
    description: 'Use Claude through Anthropic’s native Messages API.',
    protocol: 'anthropic-messages',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-6',
    modelSuggestions: ['claude-sonnet-4-6', 'claude-opus-4-6'],
    requiresApiKey: true,
    apiKeyLabel: 'Anthropic API key',
    docsUrl: 'https://docs.anthropic.com/en/api/getting-started',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    configurableBaseUrl: false,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    description: 'Use Gemini through Google’s documented OpenAI-compatible endpoint.',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.6-flash',
    modelSuggestions: ['gemini-3.6-flash', 'gemini-3.1-pro-preview'],
    requiresApiKey: true,
    apiKeyLabel: 'Gemini API key',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    configurableBaseUrl: false,
  },
  {
    id: 'kimi',
    label: 'Kimi / Moonshot AI',
    shortLabel: 'Kimi',
    description: 'Use Kimi models through Moonshot AI’s OpenAI-compatible API.',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k2.5',
    modelSuggestions: ['kimi-k2.5', 'kimi-k2-thinking'],
    requiresApiKey: true,
    apiKeyLabel: 'Moonshot API key',
    docsUrl: 'https://platform.moonshot.ai/docs/guide/start-using-kimi-api',
    apiKeyUrl: 'https://platform.moonshot.ai/console/api-keys',
    configurableBaseUrl: false,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    shortLabel: 'DeepSeek',
    description: 'Connect to DeepSeek’s chat and reasoning models.',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    modelSuggestions: ['deepseek-chat', 'deepseek-reasoner'],
    requiresApiKey: true,
    apiKeyLabel: 'DeepSeek API key',
    docsUrl: 'https://api-docs.deepseek.com/',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    configurableBaseUrl: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    shortLabel: 'OpenRouter',
    description: 'Route Workspai through one key and a broad catalog of hosted models.',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '~anthropic/claude-sonnet-latest',
    modelSuggestions: [
      '~anthropic/claude-sonnet-latest',
      '~openai/gpt-latest',
      '~moonshotai/kimi-latest',
    ],
    requiresApiKey: true,
    apiKeyLabel: 'OpenRouter API key',
    docsUrl: 'https://openrouter.ai/docs/quickstart',
    apiKeyUrl: 'https://openrouter.ai/settings/keys',
    configurableBaseUrl: false,
  },
  {
    id: 'groq',
    label: 'Groq',
    shortLabel: 'Groq',
    description: 'Run supported open models through Groq’s low-latency API.',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    modelSuggestions: ['openai/gpt-oss-120b', 'qwen/qwen3-32b'],
    requiresApiKey: true,
    apiKeyLabel: 'Groq API key',
    docsUrl: 'https://console.groq.com/docs/overview',
    apiKeyUrl: 'https://console.groq.com/keys',
    configurableBaseUrl: false,
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    shortLabel: 'Mistral',
    description: 'Connect to Mistral and Codestral-compatible models.',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    modelSuggestions: ['mistral-large-latest', 'codestral-latest'],
    requiresApiKey: true,
    apiKeyLabel: 'Mistral API key',
    docsUrl: 'https://docs.mistral.ai/getting-started/quickstart/',
    apiKeyUrl: 'https://console.mistral.ai/api-keys',
    configurableBaseUrl: false,
  },
  {
    id: 'xai',
    label: 'xAI',
    shortLabel: 'Grok',
    description: 'Use Grok models through xAI’s API.',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4-latest',
    modelSuggestions: ['grok-4-latest', 'grok-code-fast-1'],
    requiresApiKey: true,
    apiKeyLabel: 'xAI API key',
    docsUrl: 'https://docs.x.ai/docs/overview',
    apiKeyUrl: 'https://console.x.ai/',
    configurableBaseUrl: false,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    shortLabel: 'Ollama',
    description: 'Run a local model without sending workspace prompts to a hosted provider.',
    protocol: 'openai-compatible',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'gpt-oss:20b',
    modelSuggestions: ['gpt-oss:20b', 'qwen3-coder', 'llama3.2'],
    requiresApiKey: false,
    apiKeyLabel: 'API key (optional)',
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
    configurableBaseUrl: true,
  },
  {
    id: 'openai-compatible',
    label: 'Custom OpenAI-compatible API',
    shortLabel: 'Custom API',
    description: 'Connect another OpenAI-compatible gateway or self-hosted endpoint.',
    protocol: 'openai-compatible',
    defaultBaseUrl: '',
    defaultModel: '',
    modelSuggestions: [],
    requiresApiKey: true,
    apiKeyLabel: 'Provider API key',
    configurableBaseUrl: true,
  },
] as const;

const PROVIDER_BY_ID = new Map<AIProviderKind, AIProviderDefinition>(
  PROVIDERS.map((provider) => [provider.id, provider])
);

export function isAIProviderKind(value: unknown): value is AIProviderKind {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function normalizeAIProviderKind(value: unknown): AIProviderKind {
  return isAIProviderKind(value) ? value : 'vscode-lm';
}

export function getAIProviderDefinition(value: unknown): AIProviderDefinition {
  const id = normalizeAIProviderKind(value);
  return PROVIDER_BY_ID.get(id) ?? PROVIDERS[0];
}

export function listAIProviderDefinitions(): readonly AIProviderDefinition[] {
  return PROVIDERS;
}

export function isExternalAIProvider(value: unknown): boolean {
  return getAIProviderDefinition(value).protocol !== 'vscode-lm';
}
