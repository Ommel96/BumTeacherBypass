'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PROVIDER_DEFAULTS } from '@/lib/ai-provider-constants';

type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'ollama-cloud' | 'openai-compatible';

interface SettingsData {
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  customModels: string;
  lightweightModel: string;
  autoClassify: boolean;
}

const VISIBLE_PROVIDERS: Record<string, { label: string; description: string; needsApiKey: boolean }> = {
  openai: {
    label: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini, GPT-3.5-turbo',
    needsApiKey: true,
  },
  anthropic: {
    label: 'Anthropic',
    description: 'Claude Sonnet, Claude Haiku',
    needsApiKey: true,
  },
  ollama: {
    label: 'Ollama (Local)',
    description: 'Run models locally with Ollama',
    needsApiKey: false,
  },
  'openai-compatible': {
    label: 'OpenAI-Compatible',
    description: 'LM Studio, vLLM, LiteLLM, or any OpenAI-compatible API',
    needsApiKey: false,
  },
};

const EXTRA_PROVIDER: Record<string, { label: string; description: string; needsApiKey: boolean }> = {
  'ollama-cloud': {
    label: 'Ollama Cloud',
    description: 'Cloud-hosted models via ollama.com (requires API key)',
    needsApiKey: true,
  },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [provider, setProvider] = useState<ProviderType>('openai');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [customModels, setCustomModels] = useState('');
  const [lightweightModel, setLightweightModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const seqRef = useRef<number[]>([]);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem('_ec')) setUnlocked(true); } catch {}
  }, []);

  useEffect(() => {
    if (unlocked) { try { localStorage.setItem('_ec', '1'); } catch {} }
  }, [unlocked]);

  useEffect(() => {
    if (settings?.provider === 'ollama-cloud') setUnlocked(true);
  }, [settings?.provider]);

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

  const allProviders = unlocked ? { ...VISIBLE_PROVIDERS, ...EXTRA_PROVIDER } : VISIBLE_PROVIDERS;

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      const p = (data.provider || 'openai') as ProviderType;
      setSettings(data);
      setProvider(p);
      setApiKey(data.apiKey || '');
      setBaseUrl(data.baseUrl || PROVIDER_DEFAULTS[p].baseUrl);
      setModel(data.model || PROVIDER_DEFAULTS[p].models[0]);
      setCustomModels(data.customModels || '');
      setLightweightModel(data.lightweightModel || '');
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleProviderChange = (newProvider: ProviderType) => {
    setProvider(newProvider);
    setBaseUrl(PROVIDER_DEFAULTS[newProvider].baseUrl);
    setModel(PROVIDER_DEFAULTS[newProvider].models[0] || '');
    setTestResult(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setErrorHint(null);
    setTestResult(null);

    try {
      const models = customModels ? customModels.split(',').map(m => m.trim()) : [];
      const effectiveModel = model || models[0] || '';

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: apiKey,
          baseUrl,
          model: effectiveModel,
          customModels,
          lightweightModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save settings');
        if (data.hint) setErrorHint(data.hint);
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      fetchSettings();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    setErrorHint(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: apiKey,
          baseUrl,
          model: model || PROVIDER_DEFAULTS[provider].models[0],
          testConnection: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to test connection');
        if (data.hint) setErrorHint(data.hint);
        return;
      }

      if (data.connectionTest) {
        setTestResult(data.connectionTest);
      }
      fetchSettings();
    } catch {
      setError('Network error');
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteApiKey = async () => {
    if (!confirm('Delete the saved API key?')) return;
    setDeleting(true);
    try {
      await fetch('/api/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'apiKey' }),
      });
      setApiKey('');
      setTestResult(null);
      fetchSettings();
    } catch {
      setError('Failed to delete API key');
    } finally {
      setDeleting(false);
    }
  };

  if (!settings) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)] mx-auto" />
      </div>
    );
  }

  const availableModels = [
    ...PROVIDER_DEFAULTS[provider].models,
    ...(customModels ? customModels.split(',').map(m => m.trim()).filter(m => m && !PROVIDER_DEFAULTS[provider].models.includes(m)) : []),
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold mb-2">Settings</h1>
        <p className="text-[var(--text-muted)]">Configure your AI provider for document processing.</p>
      </div>

      <div className="bg-white border border-[var(--border)] rounded-xl shadow-sm">
        {/* Provider Selection */}
        <div className="p-6 border-b border-[var(--border)]">
          <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            AI Provider
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.entries(allProviders) as [ProviderType, typeof allProviders[ProviderType]][]).map(([key, info]) => (
              <button
                key={key}
                onClick={() => handleProviderChange(key)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  provider === key
                    ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                    : 'border-[var(--border)] hover:border-[var(--accent)] bg-white'
                }`}
              >
                <div className="font-semibold text-sm">{info.label}</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{info.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* API Key */}
        {allProviders[provider]?.needsApiKey && (
          <div className="p-6 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                API Key
              </label>
              {settings.apiKey && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="text-xs text-[var(--accent)] hover:text-[var(--accent-dark)] border-none bg-transparent cursor-pointer font-semibold"
                  >
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                  <button
                    onClick={handleDeleteApiKey}
                    disabled={deleting}
                    className="text-xs text-red-500 hover:text-red-700 border-none bg-transparent cursor-pointer font-semibold disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
            {settings.apiKey && !showApiKey && (
              <p className="text-xs text-[var(--text-muted)] mb-2 font-mono">
                {settings.apiKey.slice(0, 4)}{'•'.repeat(Math.max(0, settings.apiKey.length - 8))}{settings.apiKey.slice(-4)}
              </p>
            )}
            {settings.apiKey && showApiKey && (
              <p className="text-xs text-[var(--text-muted)] mb-2 font-mono break-all select-all bg-gray-50 p-2 rounded border border-[var(--border)]">
                {settings.apiKey}
              </p>
            )}
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings.apiKey ? 'Enter new key to replace current' : 'sk-...'}
              className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] font-mono text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
            />
          </div>
        )}

        {/* Base URL */}
        <div className="p-6 border-b border-[var(--border)]">
          <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
            Base URL
          </label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] font-mono text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
          />
          {provider === 'ollama' && (
            <p className="text-xs text-[var(--text-muted)] mt-1.5">
              Default: http://localhost:11434. If running in Docker, use http://host.docker.internal:11434
            </p>
          )}
          {provider === 'ollama-cloud' && (
            <p className="text-xs text-[var(--text-muted)] mt-1.5">
              Default: https://ollama.com. Uses Ollama&apos;s native API with Bearer token auth. Create an API key at ollama.com/settings/keys
            </p>
          )}
        </div>

        {/* Model Selection */}
        <div className="p-6 border-b border-[var(--border)]">
          <label className="block text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
            Model
          </label>
          {availableModels.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
            >
              {availableModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model name (e.g. llama3.2)"
              className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] font-mono text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
            />
          )}
          <div className="mt-3">
            <label className="block text-xs text-[var(--text-muted)] mb-1">
              Custom models <span className="font-normal">(comma-separated, e.g. llama3.2, mistral, qwen2.5)</span>
            </label>
            <input
              type="text"
              value={customModels}
              onChange={(e) => setCustomModels(e.target.value)}
              placeholder="Custom model names..."
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
            />
          </div>
          <div className="mt-3">
            <label className="block text-xs text-[var(--text-muted)] mb-1">
              Lightweight model <span className="font-normal">(for auto-categorizing uploads, e.g. gpt-4o-mini, llama3.2)</span>
            </label>
            <input
              type="text"
              value={lightweightModel}
              onChange={(e) => setLightweightModel(e.target.value)}
              placeholder="Leave empty to use main model"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-[var(--error-bg)] text-[var(--error)] rounded-lg text-sm font-medium">
              {error}
              {errorHint && <p className="mt-1 text-xs opacity-80">{errorHint}</p>}
            </div>
          )}

          {testResult && (
            <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
              testResult.ok ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'
            }`}>
              {testResult.ok ? 'Connection successful!' : `Connection failed: ${testResult.error}`}
            </div>
          )}

          {saved && (
            <div className="mb-4 p-3 bg-[var(--success-bg)] text-[var(--success)] rounded-lg text-sm font-medium">
              Settings saved!
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-[var(--accent)] text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-[var(--accent-dark)] transition-colors disabled:opacity-50"
            >
              {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/> : null}
              Save Settings
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex-1 flex items-center justify-center gap-2 bg-white border border-[var(--border)] text-[var(--text)] px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {testing ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--accent)]"/> : null}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="mt-6 p-4 bg-[var(--accent-light)] rounded-xl text-sm text-[var(--accent-dark)]">
        <strong>Tip:</strong> For Ollama running locally, set the Base URL to{' '}
        <code className="font-mono text-xs">http://localhost:11434</code> (or <code className="font-mono text-xs">http://host.docker.internal:11434</code> in Docker).
        For OpenAI-compatible providers (LM Studio, vLLM, etc.), set the Base URL to your server&apos;s endpoint.
      </div>
    </div>
  );
}