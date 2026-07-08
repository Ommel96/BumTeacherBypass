'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

interface Lernziel { id: string; goal: string; source: string }

/**
 * Lernziele manager shown on a module's page: type goals manually (one per
 * line), extract them from an uploaded file, remove them — and jump straight
 * into generating a practice exam from them.
 */
export function LernzieleCard({ moduleNumber }: { moduleNumber: string }) {
  const [goals, setGoals] = useState<Lernziel[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchGoals = useCallback(() => {
    fetch(`/api/lernziele?module_number=${encodeURIComponent(moduleNumber)}`)
      .then(r => r.json())
      .then(data => setGoals(data.lernziele || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [moduleNumber]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const saveGoals = async (list: string[], source: 'manual' | 'upload') => {
    if (list.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/lernziele', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_number: moduleNumber, goals: list, source }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Speichern fehlgeschlagen'); return; }
      setDraft('');
      setAdding(false);
      setSuggestions(null);
      fetchGoals();
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setExtracting(true);
    setError(null);
    setSuggestions(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/lernziele/extract', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Extraktion fehlgeschlagen'); return; }
      setSuggestions(data.goals || []);
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeGoal = async (id: string) => {
    await fetch(`/api/lernziele?id=${id}`, { method: 'DELETE' });
    fetchGoals();
  };

  return (
    <section className="bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-base">Lernziele</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Was du in Modul {moduleNumber} können musst — Grundlage für Probeprüfungen.</p>
        </div>
        <Link
            href={`/exams?module=${encodeURIComponent(moduleNumber)}`}
            className="inline-flex items-center gap-1.5 text-white px-3.5 py-2 rounded-xl text-sm font-semibold no-underline shadow-[0_2px_10px_rgba(139,92,246,0.35)] hover:shadow-[0_4px_16px_rgba(139,92,246,0.5)] hover:-translate-y-px transition-all"
            style={{ background: 'var(--accent-grad)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Probeprüfung
          </Link>
      </div>

      {loading ? (
        <div className="p-6 text-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--accent)] mx-auto"/></div>
      ) : (
        <>
          {goals.length > 0 ? (
            <ul className="divide-y divide-[var(--border)] list-none m-0 p-0">
              {goals.map((g, i) => (
                <li key={g.id} className="flex items-start gap-3 px-5 py-3 group">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-light)] text-[var(--accent-dark)] text-xs font-bold mt-0.5">{i + 1}</span>
                  <span className="flex-1 text-sm leading-relaxed">{g.goal}</span>
                  <button
                    onClick={() => removeGoal(g.id)}
                    aria-label="Lernziel löschen"
                    className="shrink-0 text-[var(--text-muted)] hover:text-[var(--error)] bg-transparent border-none cursor-pointer p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : !adding && !suggestions && (
            <div className="px-5 py-6 text-center text-sm text-[var(--text-muted)]">
              Noch keine Lernziele. Tippe sie ein oder lade eine Datei hoch — oder erstelle direkt eine Probeprüfung aus den Unterlagen des Moduls.
            </div>
          )}

          {/* Extracted suggestions for review before saving */}
          {suggestions && (
            <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--surface)]">
              <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">{suggestions.length} Lernziele erkannt — prüfen und speichern</div>
              <ul className="list-disc pl-5 text-sm space-y-1 mb-3 max-h-56 overflow-y-auto">
                {suggestions.map((sug, i) => <li key={i}>{sug}</li>)}
              </ul>
              <div className="flex gap-2">
                <button onClick={() => saveGoals(suggestions, 'upload')} disabled={saving} className="pixel-solution-btn">{saving ? 'Speichert…' : 'Übernehmen'}</button>
                <button onClick={() => setSuggestions(null)} className="pixel-reset-btn">Verwerfen</button>
              </div>
            </div>
          )}

          {adding && (
            <div className="px-5 py-4 border-t border-[var(--border)]">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={4}
                autoFocus
                placeholder={'Ein Lernziel pro Zeile, z.B.\nIch kann lineare Funktionen zeichnen und interpretieren.\nIch kann die Steigung aus zwei Punkten berechnen.'}
                className="w-full p-3 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-sm leading-relaxed outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] resize-y mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveGoals(draft.split('\n').map(l => l.trim()).filter(Boolean), 'manual')}
                  disabled={saving || !draft.trim()}
                  className="pixel-solution-btn"
                >
                  {saving ? 'Speichert…' : 'Speichern'}
                </button>
                <button onClick={() => { setAdding(false); setDraft(''); }} className="pixel-reset-btn">Abbrechen</button>
              </div>
            </div>
          )}

          {error && <div className="mx-5 mb-4 p-3 bg-[var(--error-bg)] text-[var(--error)] rounded-lg text-sm break-words">{error}</div>}

          {!adding && !suggestions && (
            <div className="px-5 py-3.5 border-t border-[var(--border)] flex flex-wrap gap-2">
              <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-xs border border-[var(--border)] text-[var(--text-muted)] px-3 py-1.5 rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors bg-transparent cursor-pointer font-semibold">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Manuell hinzufügen
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={extracting} className="inline-flex items-center gap-1.5 text-xs border border-[var(--border)] text-[var(--text-muted)] px-3 py-1.5 rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors bg-transparent cursor-pointer font-semibold disabled:opacity-50">
                {extracting ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-[var(--accent)]"/> : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                )}
                {extracting ? 'Wird analysiert…' : 'Aus Datei hochladen'}
              </button>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" onChange={e => handleFile(e.target.files?.[0] || null)} className="hidden" />
            </div>
          )}
        </>
      )}
    </section>
  );
}
