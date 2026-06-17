'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface CompendiumEntry {
  id: string;
  module_number: string;
  topic: string;
  title: string;
  keywords: string;
}

export default function CompendiumPage() {
  const [entries, setEntries] = useState<CompendiumEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const moduleNumber = params.get('module_number');
    const topic = params.get('topic');
    const q = params.get('q');
    if (q) setSearchQuery(q);

    const url = moduleNumber || topic
      ? `/api/compendium?${moduleNumber ? `module_number=${moduleNumber}` : ''}${topic ? `&topic=${topic}` : ''}`
      : '/api/compendium';
    fetch(url)
      .then(r => r.json())
      .then(data => { setEntries(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      fetch('/api/compendium')
        .then(r => r.json())
        .then(data => { setEntries(Array.isArray(data) ? data : []); })
        .catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/compendium?q=${encodeURIComponent(searchQuery)}`)
        .then(r => r.json())
        .then(data => { setEntries(Array.isArray(data) ? data : []); })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const grouped = entries.reduce((acc, entry) => {
    const mod = entry.module_number || 'uncategorized';
    if (!acc[mod]) acc[mod] = {};
    const top = entry.topic || 'general';
    if (!acc[mod][top]) acc[mod][top] = [];
    acc[mod][top].push(entry);
    return acc;
  }, {} as Record<string, Record<string, CompendiumEntry[]>>);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest uppercase text-[var(--accent)] mb-2">BumTeacherBypass</div>
        <h1 className="font-serif text-3xl font-bold text-[var(--text)] mb-2">Kompendium</h1>
        <p className="text-[var(--text-muted)]">Nachschlagewerk — Erklärungen, Formeln und Beispiele zu allen Themen.</p>
      </div>

      <div className="mb-6">
        <input
          type="search"
          placeholder="Kompendium durchsuchen..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 border border-[var(--border)] rounded-xl bg-white text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all"
        />
      </div>

      {loading && <div className="animate-pulse h-12 bg-gray-100 rounded-xl" />}

      {!loading && Object.keys(grouped).length === 0 && (
        <div className="text-center py-12 text-[var(--text-muted)]">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4 opacity-40">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <p className="font-semibold mb-1">Noch keine Kompendium-Einträge</p>
          <p className="text-sm">Lade Dokumente hoch, um automatisch Nachschlagewerk-Einträge zu erstellen.</p>
        </div>
      )}

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([modNum, topics]) => (
        <div key={modNum} className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-[var(--accent)] text-white w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-semibold shrink-0">
              {modNum === 'uncategorized' ? '?' : modNum}
            </div>
            <h2 className="font-serif text-xl font-bold">Modul {modNum}</h2>
            <span className="text-sm text-[var(--text-muted)]">
              {Object.values(topics).flat().length} Einträge
            </span>
          </div>

          {Object.entries(topics).sort(([a], [b]) => a.localeCompare(b)).map(([topicName, topicEntries]) => (
            <div key={topicName} className="ml-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                <span className="font-mono text-xs tracking-wider uppercase text-[var(--accent)]">
                  {topicName}
                </span>
                <span className="text-xs text-[var(--text-muted)]">({topicEntries.length})</span>
              </div>
              <div className="flex flex-col gap-2 ml-5">
                {topicEntries.map(entry => (
                  <Link
                    key={entry.id}
                    href={`/compendium/${entry.id}`}
                    className="flex items-center gap-3 bg-white border border-[var(--border)] rounded-xl p-4 shadow-sm hover:border-[var(--accent)] hover:shadow-md transition-all no-underline text-[var(--text)]"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-dark)] shrink-0">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{entry.title}</div>
                      {entry.keywords && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {String(entry.keywords).split(',').slice(0, 4).map(kw => (
                            <span key={kw} className="text-xs bg-[var(--accent-light)] text-[var(--accent-dark)] px-1.5 py-0.5 rounded">
                              {kw.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}