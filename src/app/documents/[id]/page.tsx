'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import DOMPurify from 'dompurify';
import CategorySelector from '@/components/CategorySelector';
import type { WorksheetData } from '@/lib/worksheet-schema';

const DynamicWorksheetRenderer = dynamic(
  () => import('@/components/worksheet/DynamicWorksheetRenderer'),
  { ssr: false }
);

interface PageData {
  id: string;
  document_id: string;
  page_number: number;
  title: string;
  content: string;
  raw_text: string;
  worksheet_data: string | null;
}

interface PageVersion {
  id: string;
  page_id: string;
  version: number;
  worksheet_data: string | null;
  content: string;
  title: string;
  created_at: string;
}

interface DocumentData {
  document: {
    id: string;
    filename: string;
    mime_type: string;
    size: number;
    status: string;
    year: string;
    semester: string;
    module_number: string;
    topic: string;
    processing_step: string;
    processing_timings: string;
    created_at: string;
  };
  pages: PageData[];
}

function parseWorksheetData(raw: string | null): WorksheetData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.title && Array.isArray(parsed.sections)) {
      return parsed as WorksheetData;
    }
  } catch {}
  return null;
}

const PROCESSING_STEPS = [
  { key: 'extracting', label: 'Textextrakt', desc: 'Dokument wird gelesen' },
  { key: 'classifying', label: 'Kategorisierung', desc: 'Modul und Thema werden erkannt' },
  { key: 'compendium', label: 'Kompendium', desc: 'Referenzeinträge werden erstellt' },
  { key: 'pass1', label: 'Pass 1: Struktur', desc: 'Arbeitsblattstruktur wird erstellt' },
  { key: 'pass2', label: 'Pass 2: Anreicherung', desc: 'Lösungen und Komponenten werden hinzugefügt' },
  { key: 'pass3', label: 'Pass 3: Review', desc: 'Qualitätsprüfung wird durchgeführt' },
  { key: 'done', label: 'Fertig', desc: 'Arbeitsblatt ist bereit' },
];

const TIMING_STEP_KEYS = ['extracting', 'classifying', 'compendium', 'pass1', 'pass2', 'pass3'];

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return `${m}m ${rest}s`;
}

function parseTimings(raw: string): Record<string, number> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function TimingBar({ label, ms, total }: { label: string; ms: number; total: number }) {
  const pct = total > 0 ? Math.round((ms / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 flex-shrink-0 text-[var(--text-muted)] truncate">{label}</span>
      <div className="flex-1 h-5 bg-[var(--accent-light)] rounded-full overflow-hidden relative">
        <div
          className="h-full bg-[var(--accent)] rounded-full transition-all"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="w-16 flex-shrink-0 text-right font-mono text-xs text-[var(--text)]">{formatDuration(ms)}</span>
      <span className="w-10 flex-shrink-0 text-right text-xs text-[var(--text-muted)]">{pct}%</span>
    </div>
  );
}

function ProcessingTracker({ step, filename, timings }: { step: string; filename: string; timings: Record<string, number> }) {
  const currentIdx = step.includes('pass')
    ? PROCESSING_STEPS.findIndex(s => step.startsWith(s.key))
    : PROCESSING_STEPS.findIndex(s => s.key === step);

  const activeStepKey = step.includes('_page')
    ? step.split('_page')[0]
    : step;

  const totalSoFar = TIMING_STEP_KEYS.reduce((sum, k) => sum + (timings[k] || 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--accent-light)] mb-4">
          <svg className="animate-spin h-8 w-8 text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
        <h2 className="font-serif text-2xl font-bold mb-1">Dokument wird verarbeitet</h2>
        <p className="text-sm text-[var(--text-muted)] truncate">{filename}</p>
        {totalSoFar > 0 && (
          <p className="text-xs text-[var(--text-muted)] mt-1">Bisher: {formatDuration(totalSoFar)}</p>
        )}
      </div>

      <div className="space-y-1">
        {PROCESSING_STEPS.map((s, idx) => {
          const isDone = idx < currentIdx || step === 'done';
          const isActive = s.key === activeStepKey && step !== 'done' && step !== 'error';
          const isUpcoming = idx > currentIdx && step !== 'done';
          const stepTiming = timings[s.key] || 0;

          return (
            <div
              key={s.key}
              className={`flex items-start gap-4 p-3 rounded-lg transition-all ${
                isActive ? 'bg-[var(--accent-light)]' : isDone ? 'opacity-60' : 'opacity-30'
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {isDone ? (
                  <div className="w-7 h-7 rounded-full bg-[var(--success-bg)] flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                ) : isActive ? (
                  <div className="w-7 h-7 rounded-full border-2 border-[var(--accent)] flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-[var(--accent)] animate-pulse"/>
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full border-2 border-[var(--border)] flex items-center justify-center">
                    <span className="text-xs text-[var(--text-muted)]">{idx + 1}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`flex items-center gap-2 text-sm font-semibold ${isActive ? 'text-[var(--accent-dark)]' : isDone ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
                  {s.label}
                  {isActive && step.includes('_page') && (
                    <span className="text-xs font-normal text-[var(--accent)]">Seite {step.split('_page')[1]}…</span>
                  )}
                  {stepTiming > 0 && (
                    <span className="text-xs font-mono font-normal text-[var(--text-muted)]">{formatDuration(stepTiming)}</span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {isUpcoming ? s.desc : isActive ? 'Wird bearbeitet…' : isDone ? 'Abgeschlossen' : s.desc}
                </div>
                {isActive && (
                  <div className="mt-2 h-1 bg-[var(--accent-light)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent)] rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ width: '60%' }}/>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProcessingTimingsCard({ timings }: { timings: Record<string, number> }) {
  const [collapsed, setCollapsed] = useState(false);
  const total = timings.total || TIMING_STEP_KEYS.reduce((sum, k) => sum + (timings[k] || 0), 0);
  if (total === 0) return null;

  const stepLabels: Record<string, string> = {
    extracting: 'Textextrakt',
    classifying: 'Kategorisierung',
    compendium: 'Kompendium',
    pass1: 'Pass 1: Struktur',
    pass2: 'Pass 2: Anreicherung',
    pass3: 'Pass 3: Review',
  };

  return (
    <div className="bg-white border border-[var(--border)] rounded-xl shadow-sm mb-6 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between p-5 hover:bg-[var(--surface)] transition-colors border-none cursor-pointer bg-transparent"
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <h3 className="font-semibold text-base">Verarbeitungszeiten</h3>
        </div>
        <span className="text-sm font-mono font-semibold text-[var(--accent)]">{formatDuration(total)}</span>
      </button>
      {!collapsed && (
        <div className="px-5 pb-5 space-y-2">
          {TIMING_STEP_KEYS.map(k => {
            const ms = timings[k] || 0;
            if (ms === 0) return null;
            return <TimingBar key={k} label={stepLabels[k] || k} ms={ms} total={total} />;
          })}
        </div>
      )}
    </div>
  );
}

export default function DocumentDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState(false);
  const [regeneratingPage, setRegeneratingPage] = useState<string | null>(null);
  const [year, setYear] = useState('');
  const [semester, setSemester] = useState('');
  const [moduleNumber, setModuleNumber] = useState('');
  const [topic, setTopic] = useState('');
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  const loadVersions = useCallback(async (pageId: string) => {
    try {
      const res = await fetch(`/api/pages/${pageId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${id}`);
      if (!res.ok) throw new Error('Dokument nicht gefunden');
      const json = await res.json();
      setData(json);
      if (json.pages?.length > 0 && !activePage) {
        setActivePage(json.pages[0].id);
      }
      if (json.document) {
        setYear(json.document.year || '');
        setSemester(json.document.semester || '');
        setModuleNumber(json.document.module_number || '');
        setTopic(json.document.topic || '');
      }
      if (json.pages?.length > 0) {
        loadVersions(json.pages[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dokument konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [id, loadVersions]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (data?.document?.status === 'processing') fetchData();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchData, data?.document?.status]);

  useEffect(() => {
    if (data?.document?.status === 'processing') {
      setRegeneratingPage('active');
    } else if (data?.document?.status === 'processed' || data?.document?.status === 'error') {
      setRegeneratingPage(null);
    }
  }, [data?.document?.status]);

  const saveCategory = async () => {
    try {
      await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, semester, module_number: moduleNumber, topic }),
      });
      setData(prev => prev ? {
        ...prev,
        document: { ...prev.document, year, semester, module_number: moduleNumber, topic },
      } : null);
      setEditingCategory(false);
    } catch (err) {
      console.error('Failed to save category:', err);
    }
  };

  const regeneratePage = async (pageId: string) => {
    setRegeneratingPage(pageId);
    try {
      const res = await fetch(`/api/pages/${pageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Regeneration failed');
      setData(prev => prev ? {
        ...prev,
        document: { ...prev.document, status: 'processing', processing_step: 'pass1', processing_timings: '' },
      } : null);
    } catch (err) {
      console.error('Regenerate failed:', err);
      setRegeneratingPage(null);
    }
  };

  const restoreVersion = async (pageId: string, versionId: string) => {
    try {
      const res = await fetch(`/api/pages/${pageId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      if (res.ok) {
        await fetchData();
        loadVersions(pageId);
      }
    } catch (err) {
      console.error('Restore version failed:', err);
    }
  };

  const isRegenerating = regeneratingPage !== null;

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)] mx-auto mb-4"/>
        <p className="text-[var(--text-muted)]">Dokument wird geladen...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="bg-red-50 text-red-800 rounded-xl p-8">
          <p className="text-lg font-semibold mb-2">Fehler</p>
          <p>{error || 'Dokument nicht gefunden'}</p>
          <a href="/" className="inline-block mt-4 text-[var(--accent)] underline">Zur Startseite</a>
        </div>
      </div>
    );
  }

  const { document: doc, pages } = data;

  if (doc.status === 'processing') {
    return (
      <ProcessingTracker step={doc.processing_step} filename={doc.filename} timings={parseTimings(doc.processing_timings)} />
    );
  }

  if (doc.status === 'error') {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="bg-red-50 text-red-800 rounded-xl p-8">
          <p className="text-lg font-semibold mb-2">Verarbeitung fehlgeschlagen</p>
          <p className="text-red-700">Beim Verarbeiten des Dokuments ist ein Fehler aufgetreten. Bitte überprüfe deine KI-Anbieter-Einstellungen und versuche es erneut.</p>
          <div className="flex gap-3 justify-center mt-4">
            <a href="/settings" className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg no-underline hover:bg-[var(--accent-dark)]">Einstellungen</a>
            <a href="/" className="px-4 py-2 border border-[var(--border)] rounded-lg no-underline text-[var(--text-muted)] hover:text-[var(--text)]">Startseite</a>
          </div>
        </div>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8">
          <p className="text-lg font-semibold text-amber-800 mb-2">Keine Seiten extrahiert</p>
          <p className="text-amber-700">Das Dokument könnte leer sein oder der Inhalt konnte nicht gelesen werden.</p>
        </div>
      </div>
    );
  }

  const currentPage = pages.find(p => p.id === activePage) || pages[0];
  const worksheetData = parseWorksheetData(currentPage.worksheet_data);

  const breadcrumbItems = [
    { label: 'Startseite', href: '/' },
    ...(doc.year ? [
      { label: `${doc.year}. Lehrjahr`, href: `/worksheets/year-${doc.year}` },
      ...(doc.module_number ? [
        { label: `Modul ${doc.module_number}`, href: `/worksheets/year-${doc.year}/semester-${doc.semester || '2'}/${doc.module_number}` },
      ] : []),
    ] : []),
    { label: doc.filename.replace(/\.[^.]+$/, '') },
  ];

  return (
    <>
      {isRegenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)] mx-auto mb-4"/>
            <h2 className="font-serif text-2xl font-bold mb-2">Arbeitsblatt wird neu erstellt</h2>
            <p className="text-[var(--text-muted)]">KI verarbeitet diese Seite erneut...</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">Das kann einen Moment dauern. Bitte warten.</p>
          </div>
        </div>
      )}
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Page selector for multi-page documents */}
      {pages.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {pages.map(page => {
            const pwd = parseWorksheetData(page.worksheet_data);
            return (
              <button
                key={page.id}
                onClick={() => { setActivePage(page.id); loadVersions(page.id); }}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activePage === page.id
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-white border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]'
                }`}
              >
                <div className="font-mono text-xs opacity-60">Seite {page.page_number}</div>
                <div className="truncate max-w-[160px]">{pwd?.title || page.title || `Seite ${page.page_number}`}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Category editor */}
      <div className="mb-6 bg-white border border-[var(--border)] rounded-xl p-4" id="category">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-serif text-lg font-bold">{doc.filename}</div>
            <div className="text-sm text-[var(--text-muted)]">
            {doc.year && doc.semester && doc.module_number && doc.topic
              ? `${doc.year}. Lehrjahr · Semester ${doc.semester} · Modul ${doc.module_number} · ${doc.topic}`
              : doc.year && doc.semester
                ? `${doc.year}. Lehrjahr · Semester ${doc.semester}`
                : 'Keine Kategorie zugewiesen'}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={() => regeneratePage(currentPage.id)}
              disabled={regeneratingPage === currentPage.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[var(--border)] text-[var(--text-muted)] rounded-lg text-sm font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors bg-transparent cursor-pointer disabled:opacity-50"
              title="Diese Seite mit KI neu erstellen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {regeneratingPage === currentPage.id ? 'Wird neu erstellt...' : 'Neu erstellen'}
            </button>
            <a
              href={`/documents/${id}/export`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] text-white rounded-lg no-underline text-sm font-medium hover:bg-[var(--accent-dark)] transition-colors"
              title="Arbeitsblatt mit deinen Antworten als druckbares PDF exportieren"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Exportieren
            </a>
            <a
              href={`/api/documents/${id}/original`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-light)] text-[var(--accent-dark)] rounded-lg no-underline text-sm font-medium hover:bg-[var(--accent)] hover:text-white transition-colors"
              title="Originaldokument anzeigen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              Original
            </a>
            <button
              onClick={() => setEditingCategory(!editingCategory)}
              className="text-sm text-[var(--accent)] hover:text-[var(--accent-dark)] border-none bg-transparent cursor-pointer font-semibold"
            >
              {editingCategory ? 'Schließen' : 'Kategorie bearbeiten'}
            </button>
            {versions.length > 0 && (
              <button
                onClick={() => setShowVersions(!showVersions)}
                className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] border-none bg-transparent cursor-pointer font-medium"
              >
                Versionen ({versions.length})
              </button>
            )}
          </div>
        </div>
        {showVersions && versions.length > 0 && (
          <div className="mt-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
            <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Frühere Versionen</div>
            <div className="space-y-1.5">
              {versions.map(v => {
                const pwd = parseWorksheetData(v.worksheet_data);
                return (
                  <div key={v.id} className="flex items-center justify-between gap-2 p-2 bg-white rounded-md border border-[var(--border)]">
                    <div className="text-sm">
                      <span className="font-medium">Version {v.version}</span>
                      <span className="text-[var(--text-muted)] ml-2 text-xs">{pwd?.title || v.title}</span>
                      <span className="text-[var(--text-muted)] ml-2 text-xs">{new Date(v.created_at).toLocaleString('de-CH')}</span>
                    </div>
                    <button
                      onClick={() => restoreVersion(currentPage.id, v.id)}
                      className="text-xs px-2 py-1 bg-[var(--accent-light)] text-[var(--accent-dark)] rounded hover:bg-[var(--accent)] hover:text-white transition-colors border-none cursor-pointer"
                    >
                      Wiederherstellen
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {editingCategory && (
          <div className="mt-4">
            <CategorySelector year={year} semester={semester} moduleNumber={moduleNumber} topic={topic} onYearChange={setYear} onSemesterChange={setSemester} onModuleNumberChange={setModuleNumber} onTopicChange={setTopic} />
            <div className="flex justify-end mt-3">
              <button onClick={saveCategory} className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--accent-dark)] transition-colors">
                Kategorie speichern
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Processing timings */}
      <ProcessingTimingsCard timings={parseTimings(doc.processing_timings)} />

      {/* Worksheet rendering */}
      {worksheetData ? (
        <DynamicWorksheetRenderer
          data={worksheetData}
          worksheetKey={`doc-${id}-page-${currentPage.page_number}`}
          breadcrumbItems={breadcrumbItems}
        />
      ) : (
        <div className="bg-white border border-[var(--border)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-mono text-xs tracking-wider uppercase text-[var(--accent)] mb-1">
                Seite {currentPage.page_number} von {pages.length}
              </div>
              <h2 className="font-serif text-2xl font-bold">{currentPage.title}</h2>
            </div>
            <button
              onClick={() => regeneratePage(currentPage.id)}
              disabled={regeneratingPage === currentPage.id}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--border)] rounded-lg text-sm text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
              title="Diese Seite mit KI neu erstellen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {regeneratingPage === currentPage.id ? 'Wird neu erstellt...' : 'Neu erstellen'}
            </button>
          </div>
          <div className="prose max-w-none text-[var(--text)]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentPage.content) }} />
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Diese Seite konnte nicht in ein interaktives Arbeitsblatt umgewandelt werden. Klicke auf Neu erstellen, um es erneut mit KI zu versuchen.
          </div>
        </div>
       )}
    </div>
    </>
  );
}