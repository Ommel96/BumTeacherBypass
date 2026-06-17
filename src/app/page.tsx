'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import CategorySelector from '@/components/CategorySelector';

type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'ollama-cloud' | 'openai-compatible';

interface ProviderOption {
  id: string;
  name: string;
  type: ProviderType;
  model: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
  'ollama-cloud': 'Ollama Cloud',
  'openai-compatible': 'OpenAI-Compatible',
};

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
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upload') === '1') setShowUpload(true);
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
      }));
      setProviders(opts);
      setSelectedProviderId(settingsData.defaultProviderId || (opts.length > 0 ? opts[0].id : ''));
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
      if (selectedProviderId) formData.append('providerId', selectedProviderId);
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest uppercase text-[var(--accent)] mb-2">BumTeacherBypass</div>
        <h1 className="font-serif text-3xl font-bold text-[var(--text)] mb-2">Interaktive Arbeitsblätter</h1>
        <p className="text-[var(--text-muted)]">Wähle ein Lehrjahr, um zu beginnen.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {[1, 2, 3, 4].map(y => (
          <Link
            key={y}
            href={`/worksheets/year-${y}`}
            className="flex items-center gap-4 bg-white border border-[var(--border)] rounded-xl p-5 shadow-sm hover:border-[var(--accent)] hover:shadow-md transition-all no-underline text-[var(--text)]"
          >
            <div className="flex-shrink-0 w-12 h-12 bg-[var(--accent-light)] rounded-lg flex items-center justify-center text-[var(--accent-dark)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs tracking-wider uppercase text-[var(--accent)]">{YEAR_LABELS[String(y)]}</div>
              <div className="font-serif text-lg font-bold">Semester 1 & 2</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </Link>
        ))}
      </div>

      {!showUpload && (
        <div className="mt-12 p-6 bg-[var(--accent-light)] rounded-xl text-center">
          <h2 className="font-serif text-xl font-bold text-[var(--accent-dark)] mb-2">Eigene Dokumente hochladen</h2>
          <p className="text-[var(--accent-dark)] text-sm mb-4">Lade PDF- oder Word-Dateien hoch und lass sie von der KI in interaktive, bearbeitbare Seiten umwandeln.</p>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 bg-[var(--accent)] text-white px-5 py-2.5 rounded-lg font-medium hover:bg-[var(--accent-dark)] transition-colors border-none cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Dokument hochladen
          </button>
        </div>
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

              {providers.length > 1 && (
                <div className="mb-5">
                  <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
                    Anbieter für diesen Upload
                  </label>
                  <select
                    value={selectedProviderId}
                    onChange={(e) => setSelectedProviderId(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
                  >
                    {providers.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({PROVIDER_LABELS[p.type] || p.type} — {p.model || 'kein Modell'})</option>
                    ))}
                  </select>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Überschreibt den Standardanbieter für diesen Upload.</p>
                </div>
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
    </div>
  );
}