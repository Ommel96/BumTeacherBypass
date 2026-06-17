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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dokument konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (data?.document?.status === 'processing') fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData, data?.document?.status]);

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
      const res = await fetch(`/api/pages/${pageId}`, { method: 'POST' });
      const pageData = await res.json();
      if (pageData.page) {
        setData(prev => prev ? {
          ...prev,
          pages: prev.pages.map(p =>
            p.id === pageId ? { ...p, content: pageData.page.content, title: pageData.page.title, worksheet_data: pageData.page.worksheet_data } : p
          ),
        } : null);
      }
    } catch (err) {
      console.error('Regenerate failed:', err);
    } finally {
      setRegeneratingPage(null);
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)] mx-auto mb-4"/>
        <h2 className="font-serif text-2xl font-bold mb-2">Dokument wird verarbeitet</h2>
        <p className="text-[var(--text-muted)]">KI wandelt dein Dokument in interaktive Arbeitsblätter um...</p>
        <p className="text-sm text-[var(--text-muted)] mt-2">Dies kann je nach Seitenzahl einen Moment dauern.</p>
      </div>
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
                onClick={() => setActivePage(page.id)}
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
          </div>
        </div>
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