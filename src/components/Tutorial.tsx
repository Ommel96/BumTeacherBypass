'use client';

import { useEffect, useState } from 'react';

const OPEN_EVENT = 'btb:open-tutorial';

/** Button that (re)starts the tutorial from anywhere in the app. */
export function TutorialStartButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={className || 'inline-flex items-center gap-2 bg-[var(--accent)] text-white px-4 py-2 rounded-lg font-medium hover:bg-[var(--accent-dark)] transition-colors border-none cursor-pointer'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21"/></svg>
      Tutorial starten
    </button>
  );
}

interface TutorialStep {
  emoji: string;
  title: string;
  intro: string;
  bullets?: string[];
  note?: string;
  link?: { href: string; label: string };
}

const STEPS: TutorialStep[] = [
  {
    emoji: '👋',
    title: 'Willkommen bei BumTeacherBypass',
    intro: 'Diese App verwandelt langweilige PDF- und Word-Arbeitsblätter in interaktive Lernerlebnisse — statt Text in leere Linien zu schreiben, bekommst du Aufgaben mit sofortiger Bewertung, Simulationen und Quizze.',
    bullets: [
      'Dokument hochladen → KI wandelt es in ein interaktives Arbeitsblatt um',
      'Antworten direkt im Browser prüfen, mit Hinweisen bei Fehlern',
      'Ein Wissens-Kompendium baut sich automatisch mit auf',
    ],
  },
  {
    emoji: '⚙️',
    title: 'Schritt 1: KI-Anbieter einrichten',
    intro: 'Die Umwandlung übernehmen KI-Modelle. Dafür brauchst du mindestens einen konfigurierten Anbieter.',
    bullets: [
      'Öffne Settings und lege einen Anbieter an (OpenAI, Anthropic, Ollama oder OpenAI-kompatibel)',
      'API-Key eintragen und mit „Verbindung testen“ prüfen',
      'Optional: verschiedenen Rollen (Struktur, Anreicherung, Review, Kompendium) verschiedene Modelle zuweisen — ein starkes Modell für die Anreicherung lohnt sich am meisten',
    ],
    link: { href: '/settings', label: 'Zu den Einstellungen' },
  },
  {
    emoji: '📄',
    title: 'Schritt 2: Dokument hochladen',
    intro: 'Ziehe auf der Startseite ein PDF- oder Word-Dokument in das Upload-Feld.',
    bullets: [
      'Lehrjahr, Semester, Modul und Thema zuordnen — bei aktivierter automatischer Klassifizierung macht die KI einen Vorschlag',
      'Die Verarbeitung dauert je nach Modell etwa 1–3 Minuten pro Seite',
      'Der Fortschritt (Pass 1–3) wird live auf der Dokumentseite angezeigt',
    ],
  },
  {
    emoji: '🤖',
    title: 'Wie die Umwandlung funktioniert',
    intro: 'Jede Seite durchläuft drei KI-Pässe:',
    bullets: [
      'Pass 1 – Struktur: Inhalte, Aufgaben und Tabellen des Originals werden erfasst',
      'Pass 2 – Anreicherung: interaktive Komponenten, Lösungen, Tipps und zusätzliche Wissens-Checks kommen dazu',
      'Pass 3 – Review: ein Prüfmodell kontrolliert Antworten und Vollständigkeit',
    ],
    note: 'Reine Papier-Aufgaben („recherchiere…“, „probiere aus…“) bleiben erhalten und werden um automatisch bewertbare Zusatzübungen ergänzt.',
  },
  {
    emoji: '✅',
    title: 'Das interaktive Arbeitsblatt',
    intro: 'Das Ergebnis ist ein Arbeitsblatt, das mitdenkt:',
    bullets: [
      'Antworten eintippen und mit „Prüfen“ sofort Feedback bekommen',
      'Simulatoren (LZ77, XOR, Huffman, Wahrheitstabellen, …) direkt ausprobieren',
      '„Tipp“ gibt Hinweise, ohne die Lösung zu verraten',
      'Nicht zufrieden? „Neu erstellen“ generiert die Seite neu — alte Versionen bleiben abrufbar',
    ],
  },
  {
    emoji: '📚',
    title: 'Das Kompendium',
    intro: 'Parallel zu jedem Arbeitsblatt entsteht ein Nachschlagewerk:',
    bullets: [
      'Einträge mit Erklärungen, Formeln (LaTeX) und interaktiven Demos',
      'Wird mit jedem weiteren Dokument klüger — Inhalte werden zusammengeführt statt dupliziert',
      'Arbeitsblätter verlinken passende Einträge direkt bei den Aufgaben',
    ],
  },
  {
    emoji: '🚀',
    title: 'Bereit!',
    intro: 'Das war die Kurzfassung. Alle Details — inklusive Tipps zur Modellwahl und Fehlerbehebung — findest du jederzeit in der Dokumentation (Hilfe-Symbol oben rechts).',
    link: { href: '/docs', label: 'Zur Dokumentation' },
  },
];

/**
 * Tutorial overlay. Mounted once in the root layout:
 * - auto-opens when the install has never seen the tutorial (server-side flag)
 * - opens on demand via TutorialStartButton (custom event)
 */
export function Tutorial() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tutorial')
      .then(r => r.json())
      .then(data => { if (!cancelled && data && data.seen === false) { setStep(0); setOpen(true); } })
      .catch(() => {});
    const onOpen = () => { setStep(0); setOpen(true); };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { cancelled = true; window.removeEventListener(OPEN_EVENT, onOpen); };
  }, []);

  const markSeen = () => {
    // keepalive so the flag still lands if the user is navigating away
    fetch('/api/tutorial', { method: 'POST', keepalive: true }).catch(() => {});
  };

  const close = () => { markSeen(); setOpen(false); };

  if (!open) return null;

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Tutorial">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-light)] flex items-center justify-center text-2xl" aria-hidden="true">
              {s.emoji}
            </div>
            {!isLast && (
              <button type="button" onClick={close} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer">
                Überspringen
              </button>
            )}
          </div>

          <h2 className="font-serif text-xl font-bold mb-2">{s.title}</h2>
          <p className="text-sm text-[var(--text)] leading-relaxed mb-3">{s.intro}</p>

          {s.bullets && (
            <ul className="space-y-2 mb-3 pl-0 list-none">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {s.note && (
            <div className="text-xs text-[var(--accent-dark)] bg-[var(--accent-light)] rounded-lg px-3 py-2 mb-3 leading-relaxed">
              💡 {s.note}
            </div>
          )}

          {s.link && (
            <a
              href={s.link.href}
              onClick={markSeen}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] font-medium hover:underline no-underline mb-1"
            >
              {s.link.label}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </a>
          )}
        </div>

        <div className="px-6 sm:px-8 py-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-label={`Schritt ${step + 1} von ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Schritt ${i + 1}`}
                className={`w-2 h-2 rounded-full border-none p-0 cursor-pointer transition-colors ${i === step ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg text-[var(--text-muted)] bg-transparent cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              >
                Zurück
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? close() : setStep(step + 1))}
              className="px-4 py-1.5 text-sm bg-[var(--accent)] text-white rounded-lg border-none cursor-pointer font-medium hover:bg-[var(--accent-dark)] transition-colors"
            >
              {isLast ? 'Los geht’s!' : 'Weiter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
