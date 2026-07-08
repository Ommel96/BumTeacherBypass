'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface ExamListItem {
  id: string;
  module_number: string;
  title: string;
  exam_data: string;
  status: 'generating' | 'ready' | 'error';
  created_at: string;
  attempt_count: number;
  best_score: number | null;
  best_max: number | null;
  last_attempt: string | null;
}

interface Lernziel { id: string; module_number: string; goal: string }

interface GoalStat { goal: string; pointsAwarded: number; points: number; pct: number }
interface ModuleStats { module_number: string; attempts: number; avgPct: number; goals: GoalStat[] }

function formatDate(iso: string): string {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

function questionCount(examData: string): number {
  try { return JSON.parse(examData)?.questions?.length || 0; } catch { return 0; }
}

export default function ExamsPage() {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [modules, setModules] = useState<Array<{ module_number: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);

  // Creation wizard
  const [creating, setCreating] = useState(false);
  const [selectedModule, setSelectedModule] = useState('');
  const [goals, setGoals] = useState<Lernziel[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingGoals, setAddingGoals] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [savingGoals, setSavingGoals] = useState(false);
  const [stats, setStats] = useState<ModuleStats[]>([]);
  const [trainingModule, setTrainingModule] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch('/api/exams').then(r => r.json()),
      fetch('/api/lernziele?modules=1').then(r => r.json()),
      fetch('/api/documents').then(r => r.json()),
      fetch('/api/exams/stats').then(r => r.json()),
    ]).then(([examsData, modulesData, docsData, statsData]) => {
      setStats(statsData.modules || []);
      setExams(examsData.exams || []);
      // Modules = union of modules with Lernziele and modules with documents
      const withGoals = new Map<string, number>((modulesData.modules || []).map((m: { module_number: string; count: number }) => [m.module_number, m.count]));
      const all = new Set<string>(withGoals.keys());
      for (const d of (docsData.documents || [])) {
        if (d.module_number) all.add(d.module_number);
      }
      setModules(Array.from(all).sort().map(m => ({ module_number: m, count: withGoals.get(m) || 0 })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Refresh while any exam is still generating
  useEffect(() => {
    if (!exams.some(e => e.status === 'generating')) return;
    const t = setInterval(fetchData, 4000);
    return () => clearInterval(t);
  }, [exams, fetchData]);

  // Preselect module from ?module= (e.g. coming from a module page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mod = params.get('module');
    if (mod) { setCreating(true); setSelectedModule(mod); }
  }, []);

  useEffect(() => {
    setAddingGoals(false);
    setGoalDraft('');
    if (!selectedModule) { setGoals([]); return; }
    fetch(`/api/lernziele?module_number=${encodeURIComponent(selectedModule)}`)
      .then(r => r.json())
      .then(data => {
        const list: Lernziel[] = data.lernziele || [];
        setGoals(list);
        setSelectedGoals(new Set(list.map(g => g.id)));
      })
      .catch(() => {});
  }, [selectedModule]);

  const saveNewGoals = async () => {
    const list = goalDraft.split('\n').map(l => l.trim()).filter(Boolean);
    if (list.length === 0 || !selectedModule) return;
    setSavingGoals(true);
    try {
      await fetch('/api/lernziele', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_number: selectedModule, goals: list, source: 'manual' }),
      });
      setGoalDraft('');
      setAddingGoals(false);
      const data = await fetch(`/api/lernziele?module_number=${encodeURIComponent(selectedModule)}`).then(r => r.json());
      const updated = data.lernziele || [];
      setGoals(updated);
      setSelectedGoals(new Set(updated.map((g: Lernziel) => g.id)));
    } finally {
      setSavingGoals(false);
    }
  };

  const toggleGoal = (id: string) => {
    setSelectedGoals(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    // Without any Lernziele the exam is generated from the module's material
    if (!selectedModule || (goals.length > 0 && selectedGoals.size === 0)) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_number: selectedModule, goal_ids: Array.from(selectedGoals) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Generierung fehlgeschlagen'); return; }
      window.location.href = `/exams/${data.exam.id}`;
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setGenerating(false);
    }
  };

  const trainWeakSpots = async (mod: ModuleStats) => {
    // The five weakest goals with enough data to judge
    const weakest = mod.goals.filter(g => g.points >= 2).slice(0, 5).map(g => g.goal);
    if (weakest.length === 0) return;
    setTrainingModule(mod.module_number);
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_number: mod.module_number, goal_ids: [], goal_texts: weakest }),
      });
      const data = await res.json();
      if (res.ok) window.location.href = `/exams/${data.exam.id}`;
    } finally {
      setTrainingModule(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-end justify-between gap-4 mb-6 pt-2">
        <h1 className="font-serif text-2xl sm:text-3xl font-extrabold text-[var(--text)]">Probeprüfungen</h1>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-semibold border-none cursor-pointer shadow-[0_2px_10px_rgba(139,92,246,0.35)] hover:shadow-[0_4px_16px_rgba(139,92,246,0.5)] hover:-translate-y-px transition-all"
            style={{ background: 'var(--accent-grad)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Neue Prüfung
          </button>
        )}
      </div>

      {/* ── Creation wizard ── */}
      {creating && (
        <section className="bg-white border border-[var(--border)] rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">Neue Probeprüfung</h2>
            <button onClick={() => { setCreating(false); setError(null); }} className="text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-1" aria-label="Schließen">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {modules.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Noch keine Module vorhanden. Lade zuerst ein Dokument hoch oder füge auf einer Modul-Seite Lernziele hinzu.
            </p>
          ) : (
            <>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">1. Modul wählen</label>
              <div className="flex flex-wrap gap-2 mb-5">
                {modules.map(m => (
                  <button
                    key={m.module_number}
                    onClick={() => setSelectedModule(m.module_number)}
                    className={`px-3.5 py-2 rounded-xl border-2 text-sm font-semibold cursor-pointer transition-all ${selectedModule === m.module_number ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-dark)]' : 'border-[var(--border)] bg-transparent text-[var(--text)] hover:border-[var(--accent)]'}`}
                  >
                    Modul {m.module_number}
                    <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">{m.count > 0 ? `${m.count} Ziele` : 'ohne Ziele'}</span>
                  </button>
                ))}
              </div>

              {selectedModule && (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                      2. Lernziele {goals.length > 0 ? `auswählen (${selectedGoals.size}/${goals.length})` : ''}
                    </label>
                    <div className="flex items-center gap-3">
                      {goals.length > 0 && (
                        <button onClick={() => setSelectedGoals(selectedGoals.size === goals.length ? new Set() : new Set(goals.map(g => g.id)))} className="text-xs text-[var(--accent)] bg-transparent border-none cursor-pointer font-medium">
                          {selectedGoals.size === goals.length ? 'Keine' : 'Alle'} auswählen
                        </button>
                      )}
                      <button onClick={() => setAddingGoals(v => !v)} className="text-xs text-[var(--accent)] bg-transparent border-none cursor-pointer font-medium">
                        + Lernziele hinzufügen
                      </button>
                    </div>
                  </div>

                  {addingGoals && (
                    <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      <textarea
                        value={goalDraft}
                        onChange={e => setGoalDraft(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder={'Ein Lernziel pro Zeile…'}
                        className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm leading-relaxed outline-none focus:border-[var(--accent)] resize-y mb-2"
                      />
                      <div className="flex gap-2">
                        <button onClick={saveNewGoals} disabled={savingGoals || !goalDraft.trim()} className="pixel-solution-btn">{savingGoals ? 'Speichert…' : 'Speichern'}</button>
                        <button onClick={() => { setAddingGoals(false); setGoalDraft(''); }} className="pixel-reset-btn">Abbrechen</button>
                      </div>
                    </div>
                  )}

                  {goals.length > 0 ? (
                    <div className="flex flex-col gap-1.5 mb-5 max-h-72 overflow-y-auto pr-1">
                      {goals.map(g => (
                        <label key={g.id} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition-colors ${selectedGoals.has(g.id) ? 'border-[var(--accent)] bg-[var(--accent-light)]' : 'border-[var(--border)] hover:border-[var(--accent)]'}`}>
                          <input type="checkbox" checked={selectedGoals.has(g.id)} onChange={() => toggleGoal(g.id)} className="mt-0.5 accent-[var(--accent)]" />
                          <span>{g.goal}</span>
                        </label>
                      ))}
                    </div>
                  ) : !addingGoals && (
                    <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
                      Dieses Modul hat keine Lernziele — die Prüfung wird aus den <strong className="text-[var(--text)]">Unterlagen des Moduls</strong> erstellt. Du kannst oben auch direkt Lernziele hinzufügen.
                    </div>
                  )}

                  {error && <div className="mb-4 p-3 bg-[var(--error-bg)] text-[var(--error)] rounded-lg text-sm break-words">{error}</div>}

                  <button
                    onClick={handleGenerate}
                    disabled={generating || (goals.length > 0 && selectedGoals.size === 0)}
                    className="w-full flex items-center justify-center gap-2 text-white px-5 py-3 rounded-xl font-semibold border-none cursor-pointer disabled:opacity-50 transition-all"
                    style={{ background: 'var(--accent-grad)' }}
                  >
                    {generating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>
                        Prüfung wird generiert — das dauert einen Moment…
                      </>
                    ) : goals.length > 0 ? (
                      <>Prüfung generieren ({selectedGoals.size} Lernziele)</>
                    ) : (
                      <>Prüfung aus Unterlagen generieren</>
                    )}
                  </button>
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* ── Exam list ── */}
      {loading ? (
        <div className="py-16 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)] mx-auto"/></div>
      ) : exams.length === 0 ? (
        !creating && (
          <div className="bg-white border border-[var(--border)] rounded-2xl p-10 text-center">
            <p className="text-sm text-[var(--text-muted)] mb-1">Noch keine Probeprüfungen.</p>
            <p className="text-xs text-[var(--text-muted)]">Erstelle oben deine erste Prüfung aus den Lernzielen eines Moduls.</p>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {exams.map(exam => {
            const pct = exam.best_score !== null && exam.best_max ? Math.round((exam.best_score / exam.best_max) * 100) : null;
            return (
              <Link key={exam.id} href={`/exams/${exam.id}`} className="group flex flex-wrap items-center gap-3 bg-white border border-[var(--border)] rounded-2xl px-5 py-4 no-underline text-[var(--text)] hover:border-[var(--accent)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-[var(--accent-dark)] transition-transform group-hover:scale-105">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                </span>
                <span className="flex-1 min-w-[10rem]">
                  <span className="block text-sm font-semibold">{exam.title}</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    Modul {exam.module_number} · {questionCount(exam.exam_data)} Fragen · erstellt {formatDate(exam.created_at)}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {exam.status === 'generating' && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent-dark)] animate-pulse">Wird generiert…</span>
                  )}
                  {exam.status === 'error' && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--error-bg)] text-[var(--error)]">Fehler</span>
                  )}
                  {exam.status === 'ready' && exam.attempt_count > 0 ? (
                    <>
                      <span className="text-xs text-[var(--text-muted)]">{exam.attempt_count} Versuch{exam.attempt_count === 1 ? '' : 'e'}</span>
                      {pct !== null && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pct >= 60 ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
                          Beste: {pct}%
                        </span>
                      )}
                    </>
                  ) : exam.status === 'ready' ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent-dark)]">Neu</span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Statistics & weak-spot training ── */}
      {stats.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-xl font-extrabold mb-4">Deine Statistik</h2>
          <div className="flex flex-col gap-4">
            {stats.map(mod => (
              <div key={mod.module_number} className="bg-white border border-[var(--border)] rounded-2xl shadow-sm p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="text-sm font-semibold">Modul {mod.module_number}</div>
                    <div className="text-xs text-[var(--text-muted)]">{mod.attempts} Versuch{mod.attempts === 1 ? '' : 'e'} · Ø {mod.avgPct}%</div>
                  </div>
                  <button
                    onClick={() => trainWeakSpots(mod)}
                    disabled={trainingModule === mod.module_number || mod.goals.filter(g => g.points >= 2).length === 0}
                    className="inline-flex items-center gap-1.5 text-white px-3.5 py-2 rounded-xl text-sm font-semibold border-none cursor-pointer disabled:opacity-50 shadow-[0_2px_10px_rgba(139,92,246,0.35)] hover:shadow-[0_4px_16px_rgba(139,92,246,0.5)] hover:-translate-y-px transition-all"
                    style={{ background: 'var(--accent-grad)' }}
                  >
                    {trainingModule === mod.module_number ? (
                      <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"/>Wird erstellt…</>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                        Schwächen üben
                      </>
                    )}
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {mod.goals.slice(0, 5).map(g => (
                    <div key={g.goal} className="flex items-center gap-3">
                      <span className="flex-1 min-w-0 text-sm truncate" title={g.goal}>{g.goal}</span>
                      <div className="w-32 sm:w-44 h-2 rounded-full bg-[var(--surface)] overflow-hidden shrink-0">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.max(g.pct, 3)}%`, background: g.pct >= 75 ? 'var(--success)' : g.pct >= 50 ? '#f59e0b' : 'var(--error)' }}
                        />
                      </div>
                      <span className={`w-11 text-right text-xs font-semibold shrink-0 ${g.pct >= 75 ? 'text-[var(--success)]' : g.pct >= 50 ? 'text-[#fcd34d]' : 'text-[var(--error)]'}`}>{g.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
