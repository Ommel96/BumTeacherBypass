import getDb from './db';
import { listProviders } from './providers-store';

export interface AppSettings {
  defaultProviderId: string;
  lightweightProviderId: string;
  compendiumProviderId: string;
  autoClassify: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultProviderId: '',
  lightweightProviderId: '',
  compendiumProviderId: '',
  autoClassify: true,
};

export function getSettings(): AppSettings {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  let defaultProviderId = map.defaultProviderId || '';
  if (!defaultProviderId) {
    const providers = listProviders();
    if (providers.length > 0) {
      defaultProviderId = providers[0].id;
    }
  }

  return {
    defaultProviderId,
    lightweightProviderId: map.lightweightProviderId || '',
    compendiumProviderId: map.compendiumProviderId || '',
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
  if (settings.defaultProviderId !== undefined) entries.push(['defaultProviderId', settings.defaultProviderId]);
  if (settings.lightweightProviderId !== undefined) entries.push(['lightweightProviderId', settings.lightweightProviderId]);
  if (settings.compendiumProviderId !== undefined) entries.push(['compendiumProviderId', settings.compendiumProviderId]);
  if (settings.autoClassify !== undefined) entries.push(['autoClassify', String(settings.autoClassify)]);

  if (entries.length > 0) {
    upsertMany(entries);
  }
}

export { getProviderConfigForRole, getDefaultProviderId } from './providers-store';

import { getProviderConfigForRole } from './providers-store';

export function getResolvedProviderConfig() {
  return getProviderConfigForRole('default');
}