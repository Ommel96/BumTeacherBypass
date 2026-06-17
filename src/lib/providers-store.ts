import getDb from './db';
import { PROVIDER_DEFAULTS } from './ai-provider-constants';
import type { ProviderType, ProviderConfig } from './ai-provider';

export interface ProviderRow {
  id: string;
  name: string;
  type: ProviderType;
  api_key: string;
  base_url: string;
  model: string;
  custom_models: string;
  created_at: string;
  updated_at: string;
}

export function listProviders(): ProviderRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM providers ORDER BY created_at ASC').all() as ProviderRow[];
}

export function getProvider(id: string): ProviderRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as ProviderRow | undefined;
}

export function createProvider(data: {
  name: string;
  type: ProviderType;
  api_key?: string;
  base_url?: string;
  model?: string;
  custom_models?: string;
}): ProviderRow {
  const db = getDb();
  const id = crypto.randomUUID();
  const defaults = PROVIDER_DEFAULTS[data.type];
  const now = new Date().toISOString();
  const row: ProviderRow = {
    id,
    name: data.name,
    type: data.type,
    api_key: data.api_key ?? '',
    base_url: data.base_url || defaults.baseUrl,
    model: data.model || defaults.models[0] || '',
    custom_models: data.custom_models ?? '',
    created_at: now,
    updated_at: now,
  };
  db.prepare(`
    INSERT INTO providers (id, name, type, api_key, base_url, model, custom_models, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.name, row.type, row.api_key, row.base_url, row.model, row.custom_models, row.created_at, row.updated_at);
  return row;
}

export function updateProvider(id: string, data: Partial<Pick<ProviderRow, 'name' | 'type' | 'api_key' | 'base_url' | 'model' | 'custom_models'>>): ProviderRow | undefined {
  const db = getDb();
  const existing = getProvider(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
  if (data.api_key !== undefined) { fields.push('api_key = ?'); values.push(data.api_key); }
  if (data.base_url !== undefined) { fields.push('base_url = ?'); values.push(data.base_url); }
  if (data.model !== undefined) { fields.push('model = ?'); values.push(data.model); }
  if (data.custom_models !== undefined) { fields.push('custom_models = ?'); values.push(data.custom_models); }

  if (fields.length > 0) {
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    db.prepare(`UPDATE providers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return getProvider(id);
}

export function deleteProvider(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM providers WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getProviderConfig(providerId: string): ProviderConfig {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  const envApiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
  const defaults = PROVIDER_DEFAULTS[provider.type];

  return {
    provider: provider.type,
    apiKey: provider.api_key || envApiKey,
    baseUrl: provider.base_url || defaults.baseUrl,
    model: provider.model || defaults.models[0] || '',
  };
}

export type ProviderRole = 'default' | 'lightweight' | 'compendium';

export function getProviderConfigForRole(role: ProviderRole): ProviderConfig {
  const db = getDb();
  const settingKey = role === 'default' ? 'defaultProviderId' : role === 'lightweight' ? 'lightweightProviderId' : 'compendiumProviderId';
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(settingKey) as { value: string } | undefined;

  if (role !== 'default' && (!row || !row.value)) {
    return getProviderConfigForRole('default');
  }

  const providerId = row?.value;
  if (!providerId) {
    const providers = listProviders();
    if (providers.length === 0) {
      throw new Error('No providers configured. Add a provider in Settings.');
    }
    return getProviderConfig(providers[0].id);
  }

  return getProviderConfig(providerId);
}

export function getDefaultProviderId(): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'defaultProviderId'").get() as { value: string } | undefined;
  return row?.value || null;
}