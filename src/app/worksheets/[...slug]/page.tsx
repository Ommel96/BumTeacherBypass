'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface DocInfo {
  id: string;
  filename: string;
  year: string;
  semester: string;
  module_number: string;
  topic: string;
  status: string;
  created_at: string;
}

function Breadcrumb({ parts }: { parts: { label: string; href?: string }[] }) {
  return (
    <nav className="text-sm text-[var(--text-muted)] mb-6 flex items-center gap-1 flex-wrap">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="mx-1">/</span>}
          {p.href ? (
            <Link href={p.href} className="hover:text-[var(--accent)]">{p.label}</Link>
          ) : (
            <span className="text-[var(--text)]">{p.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function Card({ href, icon, label, sublabel, rightIcon }: { href: string; icon: React.ReactNode; label: string; sublabel?: string; rightIcon?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 bg-white border border-[var(--border)] rounded-xl p-5 shadow-sm hover:border-[var(--accent)] hover:shadow-md transition-all no-underline text-[var(--text)]"
    >
      <div className="flex-shrink-0 w-9 h-9 bg-[var(--accent-light)] rounded-lg flex items-center justify-center text-[var(--accent-dark)]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{label}</div>
        {sublabel && <div className="text-sm text-[var(--text-muted)]">{sublabel}</div>}
      </div>
      {rightIcon || (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      )}
    </Link>
  );
}

const YEAR_LABELS: Record<string, string> = {
  '1': '1. Lehrjahr',
  '2': '2. Lehrjahr',
  '3': '3. Lehrjahr',
  '4': '4. Lehrjahr',
};

const SEMESTER_LABELS: Record<string, string> = {
  '1': 'Semester 1',
  '2': 'Semester 2',
};

export default function WorksheetsSlugPage() {
  const params = useParams();
  const slugParts = (params.slug as string[]) || [];

  const depth = slugParts.length;

  if (depth === 0) {
    return <YearSelectPage />;
  }

  if (depth === 1) {
    const year = slugParts[0].replace('year-', '');
    return <SemesterSelectPage year={year} />;
  }

  if (depth === 2) {
    const year = slugParts[0].replace('year-', '');
    const semester = slugParts[1].replace('semester-', '');
    return <ModuleSelectPage year={year} semester={semester} />;
  }

  if (depth === 3) {
    const year = slugParts[0].replace('year-', '');
    const semester = slugParts[1].replace('semester-', '');
    const moduleNumber = slugParts[2].replace('module-', '');
    return <TopicSelectPage year={year} semester={semester} moduleNumber={moduleNumber} />;
  }

  if (depth === 4) {
    const year = slugParts[0].replace('year-', '');
    const semester = slugParts[1].replace('semester-', '');
    const moduleNumber = slugParts[2].replace('module-', '');
    const topic = slugParts[3];
    return <WorksheetListPage year={year} semester={semester} moduleNumber={moduleNumber} topic={topic} />;
  }

  return <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8"><p>Nicht gefunden</p></div>;
}

function YearSelectPage() {
  const years = ['1', '2', '3', '4'];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest uppercase text-[var(--accent)] mb-2">BumTeacherBypass</div>
        <h1 className="font-serif text-3xl font-bold text-[var(--text)] mb-2">Interaktive Arbeitsblätter</h1>
        <p className="text-[var(--text-muted)]">Wähle ein Lehrjahr, um zu beginnen.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {years.map(y => (
          <Card
            key={y}
            href={`/worksheets/year-${y}`}
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            }
            label={YEAR_LABELS[y] || `Lehrjahr ${y}`}
            sublabel="Semester 1 & 2"
          />
        ))}
      </div>

      <div className="mt-12 p-6 bg-[var(--accent-light)] rounded-xl text-center">
        <h2 className="font-serif text-xl font-bold text-[var(--accent-dark)] mb-2">Eigene Dokumente hochladen</h2>
        <p className="text-[var(--accent-dark)] text-sm mb-4">Lade PDF- oder Word-Dateien hoch und lass sie von der KI in interaktive, bearbeitbare Seiten umwandeln.</p>
        <Link
          href="/?upload=1"
          className="inline-flex items-center gap-2 bg-[var(--accent)] text-white px-5 py-2.5 rounded-lg font-medium no-underline hover:bg-[var(--accent-dark)] transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Dokument hochladen
        </Link>
      </div>
    </div>
  );
}

function SemesterSelectPage({ year }: { year: string }) {
  const semesters = ['1', '2'];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Breadcrumb parts={[
        { label: 'Startseite', href: '/' },
        { label: YEAR_LABELS[year] || `Lehrjahr ${year}` },
      ]} />

      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest uppercase text-[var(--accent)] mb-2">Lehrjahr {year}</div>
        <h1 className="font-serif text-3xl font-bold text-[var(--text)] mb-2">{YEAR_LABELS[year] || `${year}. Lehrjahr`}</h1>
        <p className="text-[var(--text-muted)]">Wähle ein Semester.</p>
      </div>

      <div className="flex flex-col gap-3">
        {semesters.map(s => (
          <Card
            key={s}
            href={`/worksheets/year-${year}/semester-${s}`}
            icon={<span className="font-bold text-lg">{s}</span>}
            label={SEMESTER_LABELS[s] || `Semester ${s}`}
          />
        ))}
      </div>
    </div>
  );
}

function ModuleSelectPage({ year, semester }: { year: string; semester: string }) {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/documents?year=${year}&semester=${semester}`)
      .then(r => r.json())
      .then(data => {
        setDocs(data.documents || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year, semester]);

  const moduleNumbers = Array.from(new Set(docs.map(d => d.module_number).filter(Boolean)));
  moduleNumbers.sort();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Breadcrumb parts={[
        { label: 'Startseite', href: '/' },
        { label: YEAR_LABELS[year] || `Lehrjahr ${year}`, href: `/worksheets/year-${year}` },
        { label: SEMESTER_LABELS[semester] || `Semester ${semester}` },
      ]} />

      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest uppercase text-[var(--accent)] mb-2">{YEAR_LABELS[year]} · {SEMESTER_LABELS[semester]}</div>
        <h1 className="font-serif text-3xl font-bold text-[var(--text)] mb-2">{SEMESTER_LABELS[semester] || `Semester ${semester}`}</h1>
        <p className="text-[var(--text-muted)]">Wähle ein Modul.</p>
      </div>

      {loading && <div className="animate-pulse h-12 bg-gray-100 rounded-xl" />}

      {!loading && moduleNumbers.length === 0 && (
        <div className="text-center py-12 text-[var(--text-muted)]">
          <p>Noch keine Module. Lade ein Dokument hoch und weise ihm dieses Semester zu.</p>
          <Link href="/?upload=1" className="text-[var(--accent)] hover:underline mt-2 inline-block">Dokument hochladen</Link>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {moduleNumbers.map(m => (
          <Card
            key={m}
            href={`/worksheets/year-${year}/semester-${semester}/module-${m}`}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            }
            label={`Modul ${m}`}
            sublabel={`Modul ${m} · Semester ${semester}`}
          />
        ))}
      </div>
    </div>
  );
}

function TopicSelectPage({ year, semester, moduleNumber }: { year: string; semester: string; moduleNumber: string }) {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/documents?year=${year}&semester=${semester}&module_number=${moduleNumber}`)
      .then(r => r.json())
      .then(data => { setDocs(data.documents || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [year, semester, moduleNumber]);

  const topics = Array.from(new Set(docs.map(d => d.topic).filter(Boolean)));
  topics.sort();

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-pulse h-12 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Breadcrumb parts={[
        { label: 'Startseite', href: '/' },
        { label: YEAR_LABELS[year] || `Lehrjahr ${year}`, href: `/worksheets/year-${year}` },
        { label: SEMESTER_LABELS[semester] || `Semester ${semester}`, href: `/worksheets/year-${year}/semester-${semester}` },
        { label: `Modul ${moduleNumber}` },
      ]} />

      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest uppercase text-[var(--accent)] mb-2">Modul {moduleNumber}</div>
        <h1 className="font-serif text-3xl font-bold text-[var(--text)] mb-2">Modul {moduleNumber}</h1>
        <p className="text-[var(--text-muted)]">Wähle ein Thema.</p>
      </div>

      {topics.length === 0 && (
        <div className="text-center py-12 text-[var(--text-muted)]">
          <p>Noch keine Themen. Lade ein Dokument hoch und weise ihm dieses Modul zu.</p>
          <Link href="/?upload=1" className="text-[var(--accent)] hover:underline mt-2 inline-block">Dokument hochladen</Link>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {topics.map(t => (
          <Card
            key={t}
            href={`/worksheets/year-${year}/semester-${semester}/module-${moduleNumber}/${t}`}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            }
            label={t.charAt(0).toUpperCase() + t.slice(1)}
          />
        ))}
      </div>
    </div>
  );
}

function WorksheetListPage({ year, semester, moduleNumber, topic }: { year: string; semester: string; moduleNumber: string; topic: string }) {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchDocs = () => {
    fetch(`/api/documents?year=${year}&semester=${semester}&module_number=${moduleNumber}&topic=${topic}`)
      .then(r => r.json())
      .then(data => { setDocs(data.documents || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDocs(); }, [year, semester, moduleNumber, topic]);

  const handleDelete = async (id: string) => {
    if (!confirm('Dieses Arbeitsblatt löschen?')) return;
    setDeleting(id);
    try { await fetch(`/api/documents/${id}`, { method: 'DELETE' }); setDocs(prev => prev.filter(d => d.id !== id)); } catch {}
    finally { setDeleting(null); }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-pulse h-12 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Breadcrumb parts={[
        { label: 'Startseite', href: '/' },
        { label: YEAR_LABELS[year] || `Lehrjahr ${year}`, href: `/worksheets/year-${year}` },
        { label: SEMESTER_LABELS[semester] || `Semester ${semester}`, href: `/worksheets/year-${year}/semester-${semester}` },
        { label: `Modul ${moduleNumber}`, href: `/worksheets/year-${year}/semester-${semester}/module-${moduleNumber}` },
        { label: topic.charAt(0).toUpperCase() + topic.slice(1) },
      ]} />

      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest uppercase text-[var(--accent)] mb-2">Modul {moduleNumber} · {topic}</div>
        <h1 className="font-serif text-3xl font-bold text-[var(--text)] mb-2">{topic.charAt(0).toUpperCase() + topic.slice(1)}</h1>
        <p className="text-[var(--text-muted)]">Arbeitsblätter in diesem Thema.</p>
      </div>

      {docs.length === 0 && (
        <div className="text-center py-12 text-[var(--text-muted)]">
          <p>Noch keine Arbeitsblätter zu diesem Thema.</p>
          <Link href="/?upload=1" className="text-[var(--accent)] hover:underline mt-2 inline-block">Dokument hochladen</Link>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {docs.map(doc => (
          <div
            key={doc.id}
            className="flex items-center gap-4 bg-white border border-[var(--border)] rounded-xl p-5 shadow-sm hover:border-[var(--accent)] hover:shadow-md transition-all"
          >
            <Link href={`/documents/${doc.id}`} className="flex items-center gap-4 flex-1 min-w-0 no-underline text-[var(--text)]">
              <div className="flex-shrink-0 w-9 h-9 bg-[var(--accent-light)] rounded-lg flex items-center justify-center text-[var(--accent-dark)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{doc.filename.replace(/\.[^.]+$/, '')}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {doc.status === 'processing' && 'Verarbeitung...'}
                  {doc.status === 'processed' && 'Interaktives Arbeitsblatt'}
                  {doc.status === 'error' && 'Verarbeitung fehlgeschlagen'}
                  {doc.status === 'uploaded' && 'In Warteschlange'}
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
            <Link href={`/documents/${doc.id}#category`} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-[var(--text-muted)] hover:text-[var(--accent)] no-underline" title="Kategorie bearbeiten">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </Link>
            <button onClick={() => handleDelete(doc.id)} disabled={deleting === doc.id} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-red-50 text-[var(--text-muted)] hover:text-red-500 border-none bg-transparent cursor-pointer transition-colors" title="Löschen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}