'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PROVIDER_DEFAULTS } from '@/lib/ai-provider-constants';

type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'ollama-cloud' | 'openai-compatible';

interface ProviderRow {
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

interface AppSettings {
  defaultProviderId: string;
  lightweightProviderId: string;
  compendiumProviderId: string;
  autoClassify: boolean;
}

const PROVIDER_LABELS: Record<string, { label: string; description: string; needsApiKey: boolean }> = {
  openai: { label: 'OpenAI', description: 'GPT-4o, GPT-4o-mini', needsApiKey: true },
  anthropic: { label: 'Anthropic', description: 'Claude Sonnet, Claude Haiku', needsApiKey: true },
  ollama: { label: 'Ollama (Lokal)', description: 'Modelle lokal ausführen', needsApiKey: false },
  'ollama-cloud': { label: 'Ollama Cloud', description: 'Cloud-Modelle via ollama.com', needsApiKey: true },
  'openai-compatible': { label: 'OpenAI-Compatible', description: 'LM Studio, vLLM, LiteLLM', needsApiKey: false },
};

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const seqRef = useRef<number[]>([]);
  const [unlocked, setUnlocked] = useState(false);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ProviderType>('openai');
  const [newApiKey, setNewApiKey] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newCustomModels, setNewCustomModels] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem('_ec')) setUnlocked(true); } catch {}
  }, []);

  useEffect(() => {
    if (unlocked) { try { localStorage.setItem('_ec', '1'); } catch {} }
  }, [unlocked]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const s = seqRef.current;
      const k = e.key;
      const m: Record<string, number> = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, a: 4, b: 5 };
      const v = m[k];
      if (v === undefined) { seqRef.current = []; return; }
      s.push(v);
      if (s.length > 12) s.splice(0, s.length - 12);
      const t = [0,0,1,1,2,3,2,3,4,5,4,5];
      if (s.length >= 12) {
        const o = s.slice(-12);
        let ok = true;
        for (let i = 0; i < 12; i++) { if (o[i] !== t[i]) { ok = false; break; } }
        if (ok) { setUnlocked(true); seqRef.current = []; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const visibleTypes = unlocked
    ? Object.keys(PROVIDER_LABELS) as ProviderType[]
    : (Object.keys(PROVIDER_LABELS).filter(t => t !== 'ollama-cloud') as ProviderType[]);

  const fetchData = useCallback(async () => {
    try {
      const [providersRes, settingsRes] = await Promise.all([
        fetch('/api/providers'),
        fetch('/api/settings'),
      ]);
      const providersData = await providersRes.json();
      const settingsData = await settingsRes.json();
      setProviders(providersData);
      setSettings(settingsData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddProvider = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    setErrorHint(null);
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          type: newType,
          api_key: newApiKey,
          base_url: newBaseUrl || PROVIDER_DEFAULTS[newType].baseUrl,
          model: newModel || PROVIDER_DEFAULTS[newType].models[0] || '',
          custom_models: newCustomModels,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fehler beim Hinzufügen des Anbieters');
        if (data.hint) setErrorHint(data.hint);
        return;
      }
      const newProviderId = data.id;
      const isFirst = providers.length === 0;
      const settingsUpdates: Record<string, string> = {};
      if (isFirst || !settings?.defaultProviderId) {
        settingsUpdates.defaultProviderId = newProviderId;
      }
      if (Object.keys(settingsUpdates).length > 0) {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settingsUpdates),
        });
      }
      setNewName(''); setNewType('openai'); setNewApiKey(''); setNewBaseUrl(''); setNewModel(''); setNewCustomModels('');
      setShowAddForm(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      fetchData();
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProvider = async (provider: ProviderRow) => {
    setSaving(true);
    setError(null);
    setErrorHint(null);
    try {
      const res = await fetch('/api/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: provider.id,
          name: provider.name,
          type: provider.type,
          api_key: provider.api_key,
          base_url: provider.base_url,
          model: provider.model,
          custom_models: provider.custom_models,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fehler beim Speichern');
        if (data.hint) setErrorHint(data.hint);
        return;
      }
      setEditingProvider(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      fetchData();
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('Anbieter wirklich löschen?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/providers?id=${id}`, { method: 'DELETE' });
      fetchData();
    } catch {
      setError('Fehler beim Löschen');
    } finally {
      setDeleting(null);
    }
  };

  const handleTestConnection = async (providerId: string) => {
    setTesting(providerId);
    setTestResult(prev => ({ ...prev, [providerId]: null as any }));
    setError(null);
    setErrorHint(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testProviderId: providerId }),
      });
      const data = await res.json();
      if (data.connectionTest) {
        setTestResult(prev => ({ ...prev, [providerId]: data.connectionTest }));
      }
    } catch {
      setTestResult(prev => ({ ...prev, [providerId]: { ok: false, error: 'Netzwerkfehler' } }));
    } finally {
      setTesting(null);
    }
  };

  const handleRoleChange = async (role: 'defaultProviderId' | 'lightweightProviderId' | 'compendiumProviderId', value: string) => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [role]: value }),
    });
    fetchData();
  };

  const handleAutoClassifyChange = async (value: boolean) => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoClassify: value }),
    });
    fetchData();
  };

  if (!settings) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)] mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold mb-2">Einstellungen</h1>
        <p className="text-[var(--text-muted)]">KI-Anbieter für die Dokumentverarbeitung konfigurieren.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[var(--error-bg)] text-[var(--error)] rounded-lg text-sm font-medium">
          {error}
          {errorHint && <p className="mt-1 text-xs opacity-80">{errorHint}</p>}
        </div>
      )}
      {saved && (
        <div className="mb-4 p-3 bg-[var(--success-bg)] text-[var(--success)] rounded-lg text-sm font-medium">
          Einstellungen gespeichert!
        </div>
      )}

      {/* Provider List */}
      <div className="bg-white border border-[var(--border)] rounded-xl shadow-sm mb-6">
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="font-semibold text-lg">Anbieter</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">Konfigurierte KI-Anbieter für die Verarbeitung.</p>
        </div>

        {providers.length === 0 ? (
          <div className="p-6 text-center text-[var(--text-muted)]">
            Noch keine Anbieter konfiguriert. Fügen Sie unten einen hinzu.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {providers.map(provider => {
              const providerInfo = PROVIDER_LABELS[provider.type];
              const isEditing = editingProvider === provider.id;
              return (
                <div key={provider.id} className="p-4">
                  {isEditing ? (
                    <ProviderEditForm
                      provider={provider}
                      providerInfo={providerInfo}
                      unlocked={unlocked}
                      visibleTypes={visibleTypes}
                      onSave={handleUpdateProvider}
                      onCancel={() => setEditingProvider(null)}
                      saving={saving}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{provider.name}</span>
                          <span className="text-xs bg-[var(--accent-light)] text-[var(--accent-dark)] px-2 py-0.5 rounded-full">
                            {providerInfo?.label || provider.type}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">
                          Modell: <span className="font-mono">{provider.model || '(keins)'}</span>
                          {provider.api_key && (
                            <span className="ml-2">
                              Schlüssel: {showApiKey[provider.id]
                                ? <span className="font-mono break-all select-all">{provider.api_key}</span>
                                : <span>{provider.api_key.slice(0, 4)}{'•'.repeat(Math.max(0, provider.api_key.length - 8))}{provider.api_key.slice(-4)}</span>
                              }
                              <button
                                onClick={() => setShowApiKey(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                                className="text-[var(--accent)] hover:text-[var(--accent-dark)] border-none bg-transparent cursor-pointer text-xs ml-1 font-semibold"
                              >
                                {showApiKey[provider.id] ? 'Verbergen' : 'Anzeigen'}
                              </button>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {testResult[provider.id] && (
                          <span className={`text-xs font-medium px-2 py-1 rounded ${testResult[provider.id].ok ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
                            {testResult[provider.id].ok ? 'OK' : `Fehler: ${testResult[provider.id].error}`}
                          </span>
                        )}
                        <button
                          onClick={() => handleTestConnection(provider.id)}
                          disabled={testing === provider.id}
                          className="text-xs bg-white border border-[var(--border)] text-[var(--text)] px-3 py-1.5 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {testing === provider.id ? 'Teste...' : 'Verbindung testen'}
                        </button>
                        <button
                          onClick={() => setEditingProvider(provider.id)}
                          className="text-xs bg-white border border-[var(--border)] text-[var(--text)] px-3 py-1.5 rounded-lg font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => handleDeleteProvider(provider.id)}
                          disabled={deleting === provider.id}
                          className="text-xs text-red-500 hover:text-red-700 border border-red-200 bg-white px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {deleting === provider.id ? 'Lösche...' : 'Löschen'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="p-4 border-t border-[var(--border)]">
          {!showAddForm ? (
            <button
              onClick={() => {
                setShowAddForm(true);
                setNewType('openai');
                setNewBaseUrl(PROVIDER_DEFAULTS.openai.baseUrl);
                setNewModel(PROVIDER_DEFAULTS.openai.models[0]);
              }}
              className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[var(--accent-dark)] transition-colors border-none cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Anbieter hinzufügen
            </button>
          ) : (
            <ProviderAddForm
              newName={newName} setNewName={setNewName}
              newType={newType} setNewType={setNewType}
              newApiKey={newApiKey} setNewApiKey={setNewApiKey}
              newBaseUrl={newBaseUrl} setNewBaseUrl={setNewBaseUrl}
              newModel={newModel} setNewModel={setNewModel}
              newCustomModels={newCustomModels} setNewCustomModels={setNewCustomModels}
              unlocked={unlocked}
              visibleTypes={visibleTypes}
              onSave={handleAddProvider}
              onCancel={() => setShowAddForm(false)}
              saving={saving}
            />
          )}
        </div>
      </div>

      {/* Role Assignment */}
      <div className="bg-white border border-[var(--border)] rounded-xl shadow-sm mb-6">
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="font-semibold text-lg">Rollenzuweisung</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">Welcher Anbieter für welche Aufgabe verwendet wird.</p>
        </div>
        <div className="p-6 space-y-4">
          <RoleSelect
            label="Arbeitsblattverarbeitung"
            description="Standardanbieter für die Verarbeitung von Dokumenten"
            value={settings.defaultProviderId}
            providers={providers}
            onChange={(v) => handleRoleChange('defaultProviderId', v)}
          />
          <RoleSelect
            label="Automatische Kategorisierung"
            description="Anbieter für die automatische Erkennung von Modul und Thema"
            value={settings.lightweightProviderId}
            providers={providers}
            onChange={(v) => handleRoleChange('lightweightProviderId', v)}
            allowSameAsDefault
            defaultProviderId={settings.defaultProviderId}
          />
          <RoleSelect
            label="Kompendium"
            description="Anbieter für die Generierung von Kompendiumseinträgen"
            value={settings.compendiumProviderId}
            providers={providers}
            onChange={(v) => handleRoleChange('compendiumProviderId', v)}
            allowSameAsDefault
            defaultProviderId={settings.defaultProviderId}
          />
        </div>
      </div>

      {/* Auto-Classify Toggle */}
      <div className="bg-white border border-[var(--border)] rounded-xl shadow-sm mb-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Automatische Kategorisierung</h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">Hochgeladene Dokumente automatisch kategorisieren.</p>
          </div>
          <button
            onClick={() => handleAutoClassifyChange(!settings.autoClassify)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors border-none cursor-pointer ${settings.autoClassify ? 'bg-[var(--accent)]' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.autoClassify ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="p-4 bg-[var(--accent-light)] rounded-xl text-sm text-[var(--accent-dark)]">
        <strong>Tipp:</strong> Für Ollama lokal, setzen Sie die Basis-URL auf{' '}
        <code className="font-mono text-xs">http://localhost:11434</code> (oder <code className="font-mono text-xs">http://host.docker.internal:11434</code> in Docker).
        Für OpenAI-kompatible Anbieter (LM Studio, vLLM, etc.), setzen Sie die Basis-URL auf den Endpunkt Ihres Servers.
      </div>
    </div>
  );
}

function RoleSelect({ label, description, value, providers, onChange, allowSameAsDefault, defaultProviderId }: {
  label: string;
  description: string;
  value: string;
  providers: ProviderRow[];
  onChange: (v: string) => void;
  allowSameAsDefault?: boolean;
  defaultProviderId?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">{label}</label>
      <p className="text-xs text-[var(--text-muted)] mb-2">{description}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
      >
        {allowSameAsDefault && (
          <option value="">Gleicher Anbieter wie Standard</option>
        )}
        {providers.map(p => (
          <option key={p.id} value={p.id}>{p.name} ({PROVIDER_LABELS[p.type]?.label || p.type} — {p.model || 'kein Modell'})</option>
        ))}
      </select>
    </div>
  );
}

function ProviderAddForm({ newName, setNewName, newType, setNewType, newApiKey, setNewApiKey, newBaseUrl, setNewBaseUrl, newModel, setNewModel, newCustomModels, setNewCustomModels, unlocked, visibleTypes, onSave, onCancel, saving }: {
  newName: string; setNewName: (v: string) => void;
  newType: ProviderType; setNewType: (v: ProviderType) => void;
  newApiKey: string; setNewApiKey: (v: string) => void;
  newBaseUrl: string; setNewBaseUrl: (v: string) => void;
  newModel: string; setNewModel: (v: string) => void;
  newCustomModels: string; setNewCustomModels: (v: string) => void;
  unlocked: boolean; visibleTypes: ProviderType[];
  onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  const availableModels = [
    ...PROVIDER_DEFAULTS[newType].models,
    ...(newCustomModels ? newCustomModels.split(',').map(m => m.trim()).filter(m => m && !PROVIDER_DEFAULTS[newType].models.includes(m)) : []),
  ];

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Name</label>
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z.B. Mein OpenAI-Anbieter" className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all" />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Anbieter-Typ</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleTypes.map(key => {
            const info = PROVIDER_LABELS[key];
            return (
              <button
                key={key}
                onClick={() => {
                  setNewType(key);
                  setNewBaseUrl(PROVIDER_DEFAULTS[key].baseUrl);
                  setNewModel(PROVIDER_DEFAULTS[key].models[0] || '');
                }}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  newType === key ? 'border-[var(--accent)] bg-[var(--accent-light)]' : 'border-[var(--border)] hover:border-[var(--accent)] bg-white'
                }`}
              >
                <div className="font-semibold text-sm">{info.label}</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{info.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {PROVIDER_LABELS[newType]?.needsApiKey && (
        <div>
          <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">API-Schlüssel</label>
          <input type="text" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} placeholder="sk-..." className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] font-mono text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all" />
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Basis-URL</label>
        <input type="url" value={newBaseUrl} onChange={(e) => setNewBaseUrl(e.target.value)} className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] font-mono text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all" />
        {newType === 'ollama' && (
          <p className="text-xs text-[var(--text-muted)] mt-1.5">Standard: http://localhost:11434. In Docker: http://host.docker.internal:11434</p>
        )}
        {newType === 'ollama-cloud' && (
          <p className="text-xs text-[var(--text-muted)] mt-1.5">Standard: https://ollama.com. API-Schlüssel unter ollama.com/settings/keys erstellen</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Modell</label>
        {availableModels.length > 0 ? (
          <select value={newModel} onChange={(e) => setNewModel(e.target.value)} className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all">
            {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input type="text" value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="Modellname (z.B. llama3.2)" className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] font-mono text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all" />
        )}
        <div className="mt-3">
          <label className="block text-xs text-[var(--text-muted)] mb-1">
            Benutzerdefinierte Modelle <span className="font-normal">(kommagetrennt, z.B. llama3.2, mistral, qwen2.5)</span>
          </label>
          <input type="text" value={newCustomModels} onChange={(e) => setNewCustomModels(e.target.value)} placeholder="Benutzerdefinierte Modellnamen..." className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onSave} disabled={saving || !newName.trim()} className="flex-1 flex items-center justify-center gap-2 bg-[var(--accent)] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[var(--accent-dark)] transition-colors disabled:opacity-50 cursor-pointer border-none">
          {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/> : null}
          Anbieter erstellen
        </button>
        <button onClick={onCancel} className="flex-1 bg-white border border-[var(--border)] text-[var(--text)] px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-50 transition-colors cursor-pointer">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function ProviderEditForm({ provider, providerInfo, unlocked, visibleTypes, onSave, onCancel, saving }: {
  provider: ProviderRow;
  providerInfo: { label: string; description: string; needsApiKey: boolean } | undefined;
  unlocked: boolean;
  visibleTypes: ProviderType[];
  onSave: (p: ProviderRow) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(provider.name);
  const [type, setType] = useState<ProviderType>(provider.type);
  const [apiKey, setApiKey] = useState(provider.api_key);
  const [baseUrl, setBaseUrl] = useState(provider.base_url);
  const [model, setModel] = useState(provider.model);
  const [customModels, setCustomModels] = useState(provider.custom_models);

  const availableModels = [
    ...PROVIDER_DEFAULTS[type].models,
    ...(customModels ? customModels.split(',').map(m => m.trim()).filter(m => m && !PROVIDER_DEFAULTS[type].models.includes(m)) : []),
  ];

  const updatedProvider: ProviderRow = {
    ...provider,
    name,
    type,
    api_key: apiKey,
    base_url: baseUrl,
    model,
    custom_models: customModels,
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all" />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Anbieter-Typ</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleTypes.map(key => {
            const info = PROVIDER_LABELS[key];
            return (
              <button
                key={key}
                onClick={() => {
                  setType(key);
                  setBaseUrl(PROVIDER_DEFAULTS[key].baseUrl);
                  setModel(PROVIDER_DEFAULTS[key].models[0] || '');
                }}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  type === key ? 'border-[var(--accent)] bg-[var(--accent-light)]' : 'border-[var(--border)] hover:border-[var(--accent)] bg-white'
                }`}
              >
                <div className="font-semibold text-sm">{info.label}</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{info.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {PROVIDER_LABELS[type]?.needsApiKey && (
        <div>
          <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">API-Schlüssel</label>
          <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] font-mono text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all" />
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Basis-URL</label>
        <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] font-mono text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all" />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Modell</label>
        {availableModels.length > 0 ? (
          <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all">
            {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Modellname" className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] font-mono text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all" />
        )}
        <div className="mt-3">
          <label className="block text-xs text-[var(--text-muted)] mb-1">
            Benutzerdefinierte Modelle <span className="font-normal">(kommagetrennt)</span>
          </label>
          <input type="text" value={customModels} onChange={(e) => setCustomModels(e.target.value)} placeholder="z.B. llama3.2, mistral, qwen2.5" className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => onSave(updatedProvider)} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-[var(--accent)] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[var(--accent-dark)] transition-colors disabled:opacity-50 cursor-pointer border-none">
          {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/> : null}
          Speichern
        </button>
        <button onClick={onCancel} className="flex-1 bg-white border border-[var(--border)] text-[var(--text)] px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-50 transition-colors cursor-pointer">
          Abbrechen
        </button>
      </div>
    </div>
  );
}