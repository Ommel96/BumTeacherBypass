'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LatexText } from '@/components/katex-renderer';
import { exprToLatex, looksLikeMath } from '@/lib/math-eval';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Latex } from '@/components/katex-renderer';

// Mirrors the server-side ExamQuestion / GradedQuestion shapes
type Question =
  | { id: string; type: 'mc'; goal?: string; question: string; options: string[]; correctIndex: number; points: number; explanation?: string }
  | { id: string; type: 'tf'; goal?: string; statement: string; correct: boolean; points: number; explanation?: string }
  | { id: string; type: 'short'; goal?: string; question: string; expected: string; math?: boolean; points: number; solution?: string }
  | { id: string; type: 'open'; goal?: string; question: string; solution: string; points: number };

interface Graded {
  questionId: string;
  correct: boolean;
  pointsAwarded: number;
  points: number;
  studentAnswer: string;
  correctAnswer: string;
  feedback?: string;
  aiGraded?: boolean;
  gradingFailed?: boolean;
}

interface Attempt { id: string; graded: string; score: number; max_score: number; created_at: string }

function formatDateTime(iso: string): string {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}, ${m[4]}:${m[5]}` : iso;
}

function MathHint({ value }: { value: string }) {
  if (!value.trim() || !looksLikeMath(value) || !/[/^%:]|sqrt|pi\b/.test(value)) return null;
  const latex = exprToLatex(value);
  if (!latex) return null;
  return <span className="inline-flex items-center px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)]"><Latex tex={latex} /></span>;
}

function QuestionText({ q }: { q: Question }) {
  return <div className="text-sm leading-relaxed mb-3"><LatexText text={q.type === 'tf' ? q.statement : q.question} /></div>;
}

export default function ExamPage() {
  const params = useParams();
  const id = params.id as string;
  const storageKey = `btb_exam_${id}`;

  const [exam, setExam] = useState<{ id: string; title: string; module_number: string; status: 'generating' | 'ready' | 'error'; error: string } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [goals, setGoals] = useState<Array<{ id: string; goal: string }>>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [mode, setMode] = useState<'overview' | 'taking' | 'result'>('overview');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ graded: Graded[]; score: number; maxScore: number } | null>(null);

  const fetchExam = useCallback(() => {
    fetch(`/api/exams/${id}`)
      .then(r => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then(data => {
        if (!data) return;
        setExam(data.exam);
        setGoals(data.goals || []);
        setAttempts(data.attempts || []);
        try {
          const parsed = JSON.parse(data.exam.exam_data);
          setQuestions(parsed.questions || []);
        } catch {}
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchExam(); }, [fetchExam]);

  // Poll while the exam is being generated in the background
  useEffect(() => {
    if (exam?.status !== 'generating') return;
    const t = setInterval(fetchExam, 3000);
    return () => clearInterval(t);
  }, [exam?.status, fetchExam]);

  // Restore in-progress answers after a refresh
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          setAnswers(parsed);
        }
      }
    } catch {}
  }, [storageKey]);

  const setAnswer = (qid: string, value: string) => {
    setAnswers(prev => {
      const next = { ...prev, [qid]: value };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const startExam = () => {
    setAnswers({});
    try { localStorage.removeItem(storageKey); } catch {}
    setResult(null);
    setMode('taking');
    window.scrollTo({ top: 0 });
  };

  const resumeOrStart = () => {
    setResult(null);
    setMode('taking');
    window.scrollTo({ top: 0 });
  };

  const handleSubmit = async () => {
    const unanswered = questions.filter(q => !(answers[q.id] || '').trim()).length;
    if (unanswered > 0 && !(await confirmDialog(`${unanswered} Frage${unanswered === 1 ? '' : 'n'} noch unbeantwortet.\nTrotzdem abgeben?`, { confirmLabel: 'Abgeben' }))) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/exams/${id}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Abgabe fehlgeschlagen'); return; }
      setResult({ graded: data.graded, score: data.score, maxScore: data.maxScore });
      setMode('result');
      try { localStorage.removeItem(storageKey); } catch {}
      fetchExam();
      window.scrollTo({ top: 0 });
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setSubmitting(false);
    }
  };

  const viewAttempt = (attempt: Attempt) => {
    try {
      const graded: Graded[] = JSON.parse(attempt.graded);
      setResult({ graded, score: attempt.score, maxScore: attempt.max_score });
      setMode('result');
      window.scrollTo({ top: 0 });
    } catch {}
  };

  const handleDelete = async () => {
    if (!(await confirmDialog('Diese Prüfung und alle Versuche löschen?', { confirmLabel: 'Löschen', danger: true }))) return;
    await fetch(`/api/exams/${id}`, { method: 'DELETE' });
    window.location.href = '/exams';
  };

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-16 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)] mx-auto"/></div>;
  if (notFound || !exam) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <p className="text-[var(--text-muted)]">Prüfung nicht gefunden.</p>
      <Link href="/exams" className="text-[var(--accent)] hover:underline mt-2 inline-block no-underline">Zurück zu den Prüfungen</Link>
    </div>
  );

  const answeredCount = questions.filter(q => (answers[q.id] || '').trim()).length;

  // ── Generation in progress / failed ──
  if (exam.status !== 'ready') {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <nav className="text-sm text-[var(--text-muted)] mb-5 flex items-center gap-1 flex-wrap">
          <Link href="/exams" className="hover:text-[var(--accent)] no-underline text-[var(--text-muted)]">Probeprüfungen</Link>
        </nav>
        {exam.status === 'generating' ? (
          <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm p-10 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--accent-light)] mb-4">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[var(--accent)]"/>
            </div>
            <h1 className="font-serif text-xl font-extrabold mb-1">Prüfung wird erstellt…</h1>
            <p className="text-sm text-[var(--text-muted)]">Die KI generiert Fragen zu deinen Lernzielen — das dauert typischerweise 1–3 Minuten. Diese Seite aktualisiert sich automatisch.</p>
          </div>
        ) : (
          <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm p-8 text-center">
            <h1 className="font-serif text-xl font-extrabold mb-2 text-[var(--error)]">Generierung fehlgeschlagen</h1>
            <p className="text-sm text-[var(--text-muted)] mb-5 break-words">{exam.error || 'Unbekannter Fehler'}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={async () => { await fetch(`/api/exams/${id}`, { method: 'POST' }); fetchExam(); }}
                className="text-sm text-white px-4 py-2 rounded-xl font-semibold border-none cursor-pointer"
                style={{ background: 'var(--accent-grad)' }}
              >
                Erneut generieren
              </button>
              <button onClick={handleDelete} className="text-sm text-red-500 border border-red-200 bg-transparent px-4 py-2 rounded-xl font-semibold hover:bg-red-50 transition-colors cursor-pointer">Löschen</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <nav className="text-sm text-[var(--text-muted)] mb-5 flex items-center gap-1 flex-wrap">
        <Link href="/exams" className="hover:text-[var(--accent)] no-underline text-[var(--text-muted)]">Probeprüfungen</Link>
        <span className="mx-1">/</span>
        <span className="text-[var(--text)]">{exam.title}</span>
      </nav>

      {/* ══ Overview ══ */}
      {mode === 'overview' && (
        <>
          <div className="bg-white border border-[var(--border)] rounded-2xl shadow-sm p-6 mb-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <h1 className="font-serif text-2xl font-extrabold mb-1">{exam.title}</h1>
                <div className="text-sm text-[var(--text-muted)]">Modul {exam.module_number} · {questions.length} Fragen · {questions.reduce((s, q) => s + q.points, 0)} Punkte</div>
              </div>
              <button onClick={handleDelete} className="text-xs text-red-500 border border-red-200 bg-transparent px-3 py-1.5 rounded-lg font-semibold hover:bg-red-50 transition-colors cursor-pointer shrink-0">Löschen</button>
            </div>
            {goals.length > 0 && (
              <div className="mb-5">
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Geprüfte Lernziele</div>
                <ul className="list-disc pl-5 text-sm text-[var(--text)] space-y-0.5">
                  {goals.map(g => <li key={g.id}>{g.goal}</li>)}
                </ul>
              </div>
            )}
            <button
              onClick={startExam}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-white px-6 py-3 rounded-xl font-semibold border-none cursor-pointer shadow-[0_2px_10px_rgba(139,92,246,0.35)] hover:shadow-[0_4px_16px_rgba(139,92,246,0.5)] hover:-translate-y-px transition-all"
              style={{ background: 'var(--accent-grad)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21"/></svg>
              {attempts.length > 0 ? 'Erneut versuchen' : 'Prüfung starten'}
            </button>
          </div>

          {attempts.length > 0 && (
            <section className="bg-white border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)]"><h2 className="font-semibold text-base">Bisherige Versuche</h2></div>
              <div className="divide-y divide-[var(--border)]">
                {attempts.map((a, i) => {
                  const pct = a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) : 0;
                  return (
                    <button key={a.id} onClick={() => viewAttempt(a)} className="w-full flex items-center gap-3 px-5 py-3.5 bg-transparent border-none cursor-pointer text-left hover:bg-[var(--surface)] transition-colors">
                      <span className="text-sm font-semibold text-[var(--text)]">Versuch {attempts.length - i}</span>
                      <span className="text-xs text-[var(--text-muted)]">{formatDateTime(a.created_at)}</span>
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-sm font-mono text-[var(--text)]">{a.score}/{a.max_score}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pct >= 60 ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>{pct}%</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* ══ Taking ══ */}
      {mode === 'taking' && (
        <>
          <div className="sticky top-0 lg:top-4 z-30 mb-5">
            <div className="bg-white border border-[var(--border)] rounded-2xl shadow-[var(--shadow-md)] px-5 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{exam.title}</div>
                <div className="text-xs text-[var(--text-muted)]">{answeredCount}/{questions.length} beantwortet</div>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-semibold border-none cursor-pointer disabled:opacity-60 transition-all"
                style={{ background: 'var(--accent-grad)' }}
              >
                {submitting ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"/>Wird bewertet…</> : 'Abgeben'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {questions.map((q, i) => (
              <div key={q.id} className="bg-white border border-[var(--border)] rounded-2xl shadow-sm p-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">Frage {i + 1}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent-dark)]">{q.points} {q.points === 1 ? 'Punkt' : 'Punkte'}</span>
                </div>
                <QuestionText q={q} />

                {q.type === 'mc' && (
                  <div className="flex flex-col gap-1.5">
                    {q.options.map((opt, oi) => (
                      <label key={oi} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition-colors ${answers[q.id] === String(oi) ? 'border-[var(--accent)] bg-[var(--accent-light)]' : 'border-[var(--border)] hover:border-[var(--accent)]'}`}>
                        <input type="radio" name={q.id} checked={answers[q.id] === String(oi)} onChange={() => setAnswer(q.id, String(oi))} className="mt-0.5 accent-[var(--accent)]" />
                        <span><LatexText text={opt} /></span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'tf' && (
                  <div className="flex gap-2">
                    {(['true', 'false'] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAnswer(q.id, v)}
                        className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold cursor-pointer transition-all ${answers[q.id] === v ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-dark)]' : 'border-[var(--border)] bg-transparent text-[var(--text)] hover:border-[var(--accent)]'}`}
                      >
                        {v === 'true' ? 'Wahr' : 'Falsch'}
                      </button>
                    ))}
                  </div>
                )}

                {q.type === 'short' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={e => setAnswer(q.id, e.target.value)}
                      placeholder={q.math ? 'z.B. 3/4 oder x=2' : 'Antwort'}
                      className="px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm font-mono outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all w-64 max-w-full"
                    />
                    {q.math && <MathHint value={answers[q.id] || ''} />}
                  </div>
                )}

                {q.type === 'open' && (
                  <textarea
                    value={answers[q.id] || ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                    rows={5}
                    placeholder="Deine Antwort mit Rechenweg / Begründung…"
                    className="w-full p-3 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-sm leading-relaxed outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] resize-y"
                  />
                )}
              </div>
            ))}
          </div>

          {error && <div className="mt-4 p-3 bg-[var(--error-bg)] text-[var(--error)] rounded-lg text-sm break-words">{error}</div>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-5 w-full flex items-center justify-center gap-2 text-white px-5 py-3.5 rounded-xl font-semibold border-none cursor-pointer disabled:opacity-60 transition-all"
            style={{ background: 'var(--accent-grad)' }}
          >
            {submitting ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Wird bewertet — einen Moment…</> : `Abgeben (${answeredCount}/${questions.length} beantwortet)`}
          </button>
        </>
      )}

      {/* ══ Result / corrected exam ══ */}
      {mode === 'result' && result && (
        <>
          {(() => {
            const pct = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
            const good = pct >= 60;
            return (
              <div className={`rounded-2xl p-6 mb-5 text-center border ${good ? 'bg-[var(--success-bg)] border-[var(--success)]' : 'bg-[var(--error-bg)] border-[var(--error)]'}`}>
                <div className="text-4xl font-extrabold mb-1" style={{ color: good ? 'var(--success)' : 'var(--error)' }}>{result.score} / {result.maxScore}</div>
                <div className="text-sm font-medium" style={{ color: good ? 'var(--success)' : 'var(--error)' }}>{pct}% erreicht</div>
                <div className="flex justify-center gap-3 mt-4">
                  <button onClick={startExam} className="text-sm text-white px-4 py-2 rounded-xl font-semibold border-none cursor-pointer" style={{ background: 'var(--accent-grad)' }}>Erneut versuchen</button>
                  <button onClick={() => { setMode('overview'); setResult(null); }} className="text-sm px-4 py-2 rounded-xl font-semibold border border-[var(--border)] bg-transparent text-[var(--text)] cursor-pointer hover:border-[var(--accent)]">Zur Übersicht</button>
                </div>
              </div>
            );
          })()}

          <div className="flex flex-col gap-4">
            {result.graded.map((g, i) => {
              const q = questions.find(x => x.id === g.questionId);
              const partial = g.pointsAwarded > 0 && g.pointsAwarded < g.points;
              return (
                <div key={g.questionId} className={`bg-white rounded-2xl shadow-sm p-5 border-l-4 border border-[var(--border)] ${g.correct ? 'border-l-[var(--success)]' : partial ? 'border-l-[#f59e0b]' : 'border-l-[var(--error)]'}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold text-[var(--text-muted)]">Frage {i + 1}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${g.correct ? 'bg-[var(--success-bg)] text-[var(--success)]' : partial ? 'bg-[rgba(245,158,11,0.13)] text-[#fcd34d]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`}>
                      {g.pointsAwarded} / {g.points} P.
                    </span>
                  </div>
                  {q && <QuestionText q={q} />}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className={`rounded-xl p-3 border ${g.correct ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]'}`}>
                      <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">Deine Antwort</div>
                      <LatexText text={g.studentAnswer} />
                    </div>
                    {!g.correct && (
                      <div className="rounded-xl p-3 border border-[var(--success)] bg-[var(--success-bg)]">
                        <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">{q?.type === 'open' ? 'Musterlösung' : 'Richtige Antwort'}</div>
                        <LatexText text={g.correctAnswer} />
                      </div>
                    )}
                  </div>

                  {g.feedback && (
                    <div className="mt-3 text-sm text-[var(--text-muted)] leading-relaxed">
                      <span className="font-semibold text-[var(--text)]">{g.aiGraded ? 'Bewertung: ' : 'Erklärung: '}</span>
                      <LatexText text={g.feedback} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
