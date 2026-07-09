'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import CategorySelector from '@/components/CategorySelector';
import { PROVIDER_DEFAULTS } from '@/lib/ai-provider-constants';

type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'ollama-cloud' | 'openai-compatible';

interface ProviderOption {
  id: string;
  name: string;
  type: ProviderType;
  model: string;
  custom_models: string;
}

function getProviderModels(provider: ProviderOption): string[] {
  const defaults = PROVIDER_DEFAULTS[provider.type]?.models || [];
  const custom = provider.custom_models ? provider.custom_models.split(',').map(m => m.trim()).filter(m => m && !defaults.includes(m)) : [];
  return [...defaults, ...custom];
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
  'ollama-cloud': 'Ollama Cloud',
  'openai-compatible': 'OpenAI-Compatible',
};

interface RecentDoc {
  id: string;
  filename: string;
  status: string;
  year: string;
  semester: string;
  module_number: string;
  topic: string;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  processed: { label: 'Bereit', cls: 'bg-[var(--success-bg)] text-[var(--success)]' },
  processing: { label: 'In Arbeit', cls: 'bg-[var(--accent-light)] text-[var(--accent-dark)] animate-pulse' },
  uploaded: { label: 'Wartet', cls: 'bg-[var(--surface)] text-[var(--text-muted)]' },
  error: { label: 'Fehler', cls: 'bg-[var(--error-bg)] text-[var(--error)]' },
};

function formatDate(iso: string): string {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

function cleanFilename(name: string): string {
  return name.replace(/\.(pdf|docx?|PDF|DOCX?)+$/g, '').replace(/[_-]+/g, ' ');
}

const YEAR_LABELS: Record<string, string> = {
  '1': '1. Lehrjahr',
  '2': '2. Lehrjahr',
  '3': '3. Lehrjahr',
  '4': '4. Lehrjahr',
};

export default function HomePage() {
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState('');
  const [semester, setSemester] = useState('');
  const [moduleNumber, setModuleNumber] = useState('');
  const [topic, setTopic] = useState('');
  const [autoDetect, setAutoDetect] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ id: string; filename: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedStructureModel, setSelectedStructureModel] = useState('');
  const [selectedEnrichmentModel, setSelectedEnrichmentModel] = useState('');
  const [selectedReviewerModel, setSelectedReviewerModel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upload') === '1') setShowUpload(true);
  }, []);

  useEffect(() => {
    fetch('/api/documents')
      .then(r => r.json())
      .then(data => {
        const docs: RecentDoc[] = Array.isArray(data?.documents) ? data.documents : [];
        docs.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        setRecentDocs(docs.slice(0, 6));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/providers').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]).then(([providersData, settingsData]) => {
      const opts: ProviderOption[] = (providersData || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        model: p.model,
        custom_models: p.custom_models || '',
      }));
      setProviders(opts);
      const defaultId = settingsData.defaultProviderId || (opts.length > 0 ? opts[0].id : '');
      const defaultProvider = opts.find(p => p.id === defaultId);
      if (defaultProvider) {
        const models = getProviderModels(defaultProvider);
        const defaultModel = `${defaultId}:${defaultProvider.model || models[0] || ''}`;
        setSelectedStructureModel(defaultModel);
        setSelectedEnrichmentModel(defaultModel);
        setSelectedReviewerModel(defaultModel);
      }
      if (settingsData.structureProviderId) {
        const sProv = opts.find(p => p.id === settingsData.structureProviderId.split(':')[0]);
        if (sProv) setSelectedStructureModel(settingsData.structureProviderId);
      }
      if (settingsData.enrichmentProviderId) {
        const eProv = opts.find(p => p.id === settingsData.enrichmentProviderId.split(':')[0]);
        if (eProv) setSelectedEnrichmentModel(settingsData.enrichmentProviderId);
      }
      if (settingsData.reviewerProviderId) {
        const rProv = opts.find(p => p.id === settingsData.reviewerProviderId.split(':')[0]);
        if (rProv) setSelectedReviewerModel(settingsData.reviewerProviderId);
      }
    }).catch(() => {});
  }, []);

  const handleFileSelect = async (selectedFile: File | null) => {
    setFile(selectedFile);
    setUploadError(null);
    if (!selectedFile || !autoDetect) return;

    setClassifying(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await fetch('/api/classify', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.module_number) setModuleNumber(data.module_number);
      if (data.topic) setTopic(data.topic);
      if (data.year) setYear(data.year);
      if (data.semester) setSemester(data.semester);
    } catch {
      // classification failed silently — user can fill manually
    } finally {
      setClassifying(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedStructureModel) formData.append('providerModel', selectedStructureModel);
      if (selectedEnrichmentModel) formData.append('enrichmentModel', selectedEnrichmentModel);
      if (selectedReviewerModel) formData.append('reviewerModel', selectedReviewerModel);
      if (year) formData.append('year', year);
      if (semester) formData.append('semester', semester);
      if (moduleNumber) formData.append('module_number', moduleNumber);
      if (topic) formData.append('topic', topic);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error || 'Upload fehlgeschlagen'); return; }
      setUploadResult({ id: data.id, filename: data.filename });
    } catch { setUploadError('Netzwerkfehler'); }
    finally { setUploading(false); }
  };

  const closeUpload = () => {
    setShowUpload(false);
    setFile(null);
    setUploadResult(null);
    setUploadError(null);
    setYear(''); setSemester(''); setModuleNumber(''); setTopic('');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-end justify-between gap-4 mb-6 pt-2">
        <h1 className="font-serif text-2xl sm:text-3xl font-extrabold text-[var(--text)]">Arbeitsblätter</h1>
        <Link href="/compendium" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] no-underline hover:underline">
          Kompendium öffnen
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
        {[1, 2, 3, 4].map(y => (
          <Link key={y} href={`/worksheets/year-${y}`} className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 no-underline text-[var(--text)] hover:border-[var(--accent)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent-dark)] font-extrabold text-sm transition-transform group-hover:scale-110">{y}</span>
            <span className="text-sm font-semibold">Lehrjahr</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        ))}
      </div>

      {!showUpload && (
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) { setShowUpload(true); handleFileSelect(dropped); }
          }}
          className={`w-full flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 rounded-2xl border-2 border-dashed px-6 py-8 mb-8 cursor-pointer bg-white/60 transition-all ${dragOver ? 'border-[var(--accent)] bg-[var(--accent-light)] scale-[1.01]' : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-white'}`}
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_4px_14px_rgba(139,92,246,0.4)]" style={{ background: 'var(--accent-grad)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </span>
          <span className="text-center sm:text-left">
            <span className="block font-semibold text-[var(--text)]">PDF oder Word hierher ziehen</span>
            <span className="block text-sm text-[var(--text-muted)]">oder klicken zum Auswählen — die KI macht daraus ein interaktives Arbeitsblatt</span>
          </span>
        </button>
      )}

      {showUpload && (
        <div className="mt-8 bg-white border border-[var(--border)] rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl font-bold">Dokument hochladen</h2>
            <button onClick={closeUpload} className="p-1 rounded hover:bg-gray-100 border-none bg-transparent cursor-pointer text-[var(--text-muted)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {uploadResult ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <p className="font-semibold mb-1">{uploadResult.filename} hochgeladen!</p>
              <p className="text-sm text-[var(--text-muted)] mb-4">Dein Dokument wird von der KI verarbeitet. Das kann einige Minuten dauern.</p>
              <div className="flex gap-3 justify-center">
                <Link href={`/documents/${uploadResult.id}`} className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg no-underline font-medium hover:bg-[var(--accent-dark)]">Dokument ansehen</Link>
                <button onClick={closeUpload} className="bg-white border border-[var(--border)] text-[var(--text)] px-4 py-2 rounded-lg font-medium cursor-pointer hover:bg-gray-50">Schließen</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleUpload}>
              <div
                className="border-2 border-dashed border-[var(--border)] rounded-xl p-6 text-center hover:border-[var(--accent)] transition-colors cursor-pointer mb-5"
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc" onChange={e => handleFileSelect(e.target.files?.[0] || null)} className="hidden" />
                {file ? (
                  <div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-[var(--text-muted)]">{(file.size / 1024).toFixed(1)} KB</p>
                    {classifying && <p className="text-sm text-[var(--accent)] mt-1">Modul & Thema werden erkannt...</p>}
                  </div>
                ) : (
                  <div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <p className="text-[var(--text-muted)]">Klicke hier, um eine PDF- oder Word-Datei auszuwählen</p>
                  </div>
                )}
              </div>

              {providers.length > 0 && (
                <details className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <summary className="text-sm font-semibold cursor-pointer select-none text-[var(--text)]">
                    Erweiterte Optionen — Modelle für diesen Upload
                    <span className="block text-xs font-normal text-[var(--text-muted)] mt-0.5">Standardmässig gelten die Modelle aus den Einstellungen.</span>
                  </summary>
                  <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
                      Struktur-Modell (Pass 1)
                    </label>
                    <select
                      value={selectedStructureModel}
                      onChange={(e) => setSelectedStructureModel(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
                    >
                      {providers.map(p => {
                        const models = getProviderModels(p);
                        const groupLabel = `${p.name} (${PROVIDER_LABELS[p.type] || p.type})`;
                        return (
                          <optgroup key={p.id} label={groupLabel}>
                            {models.length > 0 ? models.map(m => (
                              <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{m}</option>
                            )) : (
                              <option key={`${p.id}:${p.model || ''}`} value={`${p.id}:${p.model || ''}`}>{p.model || 'Kein Modell'}</option>
                            )}
                          </optgroup>
                        );
                      })}
                    </select>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Erstellt die Arbeitsblatt-Struktur aus dem Dokument.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
                      Anreicherungs-Modell (Pass 2)
                    </label>
                    <select
                      value={selectedEnrichmentModel}
                      onChange={(e) => setSelectedEnrichmentModel(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
                    >
                      {providers.map(p => {
                        const models = getProviderModels(p);
                        const groupLabel = `${p.name} (${PROVIDER_LABELS[p.type] || p.type})`;
                        return (
                          <optgroup key={p.id} label={groupLabel}>
                            {models.length > 0 ? models.map(m => (
                              <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{m}</option>
                            )) : (
                              <option key={`${p.id}:${p.model || ''}`} value={`${p.id}:${p.model || ''}`}>{p.model || 'Kein Modell'}</option>
                            )}
                          </optgroup>
                        );
                      })}
                    </select>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Fügt Lösungen, interaktive Komponenten und Hinweise hinzu.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
                      Review-Modell (Pass 3)
                    </label>
                    <select
                      value={selectedReviewerModel}
                      onChange={(e) => setSelectedReviewerModel(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
                    >
                      {providers.map(p => {
                        const models = getProviderModels(p);
                        const groupLabel = `${p.name} (${PROVIDER_LABELS[p.type] || p.type})`;
                        return (
                          <optgroup key={p.id} label={groupLabel}>
                            {models.length > 0 ? models.map(m => (
                              <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{m}</option>
                            )) : (
                              <option key={`${p.id}:${p.model || ''}`} value={`${p.id}:${p.model || ''}`}>{p.model || 'Kein Modell'}</option>
                            )}
                          </optgroup>
                        );
                      })}
                    </select>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Prüft und korrigiert das Arbeitsblatt auf Vollständigkeit und Fehler.</p>
                  </div>
                  </div>
                </details>
              )}

              <div className="mb-5">
                <div className="flex items-center gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setAutoDetect(!autoDetect)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors border-none cursor-pointer ${autoDetect ? 'bg-[var(--accent)]' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoDetect ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm text-[var(--text)]">Kategorie automatisch erkennen</span>
                  {classifying && <span className="text-xs text-[var(--accent)] ml-2">Wird erkannt...</span>}
                </div>
                {!autoDetect && (
                  <p className="text-xs text-[var(--text-muted)] mb-3">Fülle die Kategorie manuell ein oder aktiviere die automatische Erkennung.</p>
                )}
                {(autoDetect || year || semester || moduleNumber || topic) && (
                  <CategorySelector year={year} semester={semester} moduleNumber={moduleNumber} topic={topic} onYearChange={setYear} onSemesterChange={setSemester} onModuleNumberChange={setModuleNumber} onTopicChange={setTopic} />
                )}
              </div>

              {uploadError && <div className="mb-4 p-3 bg-[var(--error-bg)] text-[var(--error)] rounded-lg text-sm font-medium">{uploadError}</div>}

              <button type="submit" disabled={uploading || !file} className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] text-white px-5 py-3 rounded-lg font-semibold hover:bg-[var(--accent-dark)] transition-colors disabled:opacity-50 border-none cursor-pointer">
                {uploading ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Wird hochgeladen...</> : 'Hochladen & Verarbeiten'}
              </button>
            </form>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-2">
        {/* Recent documents */}
        <section className="lg:col-span-2 bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <h2 className="font-semibold text-base">Zuletzt hinzugefügt</h2>
            {recentDocs.length > 0 && <span className="text-xs text-[var(--text-muted)]">{recentDocs.length} Dokumente</span>}
          </div>
          {recentDocs.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
              Noch keine Dokumente — lade oben dein erstes Arbeitsblatt hoch.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {recentDocs.map(doc => {
                const meta = STATUS_META[doc.status] || STATUS_META.uploaded;
                return (
                  <Link key={doc.id} href={`/documents/${doc.id}`} className="flex items-center gap-3 px-5 py-3.5 no-underline text-[var(--text)] hover:bg-[var(--surface)] transition-colors group">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent-dark)] transition-transform group-hover:scale-105">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">{cleanFilename(doc.filename)}</span>
                      <span className="block text-xs text-[var(--text-muted)] truncate">
                        {doc.module_number ? `Modul ${doc.module_number}` : 'Ohne Modul'}{doc.topic ? ` · ${doc.topic}` : ''} · {formatDate(doc.created_at)}
                      </span>
                    </span>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Right rail */}
        <div className="flex flex-col gap-5">
          <Link href="/compendium" className="group relative overflow-hidden rounded-2xl p-5 no-underline text-white shadow-[var(--shadow-md)]" style={{ background: 'var(--accent-grad)' }}>
            <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(300px 140px at 15% 0%, rgba(255,255,255,0.7), transparent 60%)' }} />
            <div className="relative">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                Kompendium
              </div>
              <p className="text-sm text-white/85 m-0">Dein automatisch wachsendes Nachschlagewerk zu allen Themen.</p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold mt-3 group-hover:gap-2 transition-all">
                Öffnen
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}