import getDb from './db';
import type { ProviderType, ProviderConfig } from './ai-provider';
import { PROVIDER_DEFAULTS } from './ai-provider';

export interface AppSettings {
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  customModels: string;
  lightweightModel: string;
  autoClassify: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openai',
  apiKey: '',
  baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,
  model: PROVIDER_DEFAULTS.openai.models[0],
  customModels: '',
  lightweightModel: '',
  autoClassify: true,
};

export function getSettings(): AppSettings {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  return {
    provider: (map.provider as ProviderType) || DEFAULT_SETTINGS.provider,
    apiKey: map.apiKey || DEFAULT_SETTINGS.apiKey,
    baseUrl: map.baseUrl || DEFAULT_SETTINGS.baseUrl,
    model: map.model || DEFAULT_SETTINGS.model,
    customModels: map.customModels || DEFAULT_SETTINGS.customModels,
    lightweightModel: map.lightweightModel || DEFAULT_SETTINGS.lightweightModel,
    autoClassify: map.autoClassify === 'false' ? false : true,
  };
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const upsertMany = db.transaction((items: [string, string][]) => {
    for (const [key, value] of items) {
      upsert.run(key, value);
    }
  });

  const entries: [string, string][] = [];
  if (settings.provider !== undefined) entries.push(['provider', settings.provider]);
  if (settings.apiKey !== undefined) entries.push(['apiKey', settings.apiKey]);
  if (settings.baseUrl !== undefined) entries.push(['baseUrl', settings.baseUrl]);
  if (settings.model !== undefined) entries.push(['model', settings.model]);
  if (settings.customModels !== undefined) entries.push(['customModels', settings.customModels]);
  if (settings.lightweightModel !== undefined) entries.push(['lightweightModel', settings.lightweightModel]);
  if (settings.autoClassify !== undefined) entries.push(['autoClassify', String(settings.autoClassify)]);

  if (entries.length > 0) {
    upsertMany(entries);
  }
}

export function getResolvedProviderConfig(): ProviderConfig {
  const settings = getSettings();

  const envApiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';

  return {
    provider: settings.provider,
    apiKey: settings.apiKey || envApiKey,
    baseUrl: settings.baseUrl || PROVIDER_DEFAULTS[settings.provider].baseUrl,
    model: settings.model || PROVIDER_DEFAULTS[settings.provider].models[0],
  };
}