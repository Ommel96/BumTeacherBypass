export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'ollama-cloud' | 'openai-compatible';

export const PROVIDER_DEFAULTS: Record<ProviderType, { baseUrl: string; models: string[] }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    models: ['llama3.2', 'llama3.1', 'mistral', 'codellama', 'qwen2.5'],
  },
  'ollama-cloud': {
    baseUrl: 'https://ollama.com',
    models: ['glm-5.1', 'glm-5', 'glm-4.7', 'gemma4', 'qwen3.5', 'qwen3-coder', 'deepseek-v4-pro', 'deepseek-v4-flash', 'minimax-m3', 'minimax-m2.7', 'minimax-m2.5', 'minimax-m2.1', 'kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5', 'nemotron-3-ultra', 'nemotron-3-super', 'gpt-oss:120b', 'gemini-3-flash-preview'],
  },
  'openai-compatible': {
    baseUrl: 'http://localhost:8080/v1',
    models: [],
  },
};