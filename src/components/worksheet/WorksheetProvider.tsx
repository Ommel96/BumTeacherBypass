'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';

interface WorksheetContextValue {
  worksheetKey: string;
  fields: Record<string, string>;
  setFieldValue: (id: string, value: string) => void;
  resetFields: (ids: string[]) => void;
  checkField: (fieldId: string, expected: string, hint?: string, opts?: { normalize?: boolean; contains?: boolean }) => boolean;
  checkFields: (checks: Array<{ fieldId: string; expected: string; hint?: string; opts?: { normalize?: boolean; contains?: boolean } }>, feedbackId: string) => void;
  feedbacks: Record<string, { type: 'success' | 'error'; msg: string }>;
  toggleHint: (id: string) => void;
  hints: Record<string, boolean>;
}

const WorksheetContext = createContext<WorksheetContextValue | null>(null);

export function useWorksheet() {
  const ctx = useContext(WorksheetContext);
  if (!ctx) throw new Error('useWorksheet must be used within WorksheetProvider');
  return ctx;
}

export function WorksheetProvider({ worksheetKey, children }: { worksheetKey: string; children: ReactNode }) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, { type: 'success' | 'error'; msg: string }>>({});
  const [hints, setHints] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'synced' | 'local'>('idle');
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const localKey = 'btb_' + worksheetKey;

  useEffect(() => {
    fetch(`/api/worksheet/${encodeURIComponent(worksheetKey)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.fields && Object.keys(data.fields).length > 0) {
          setFields(data.fields);
          try { localStorage.setItem(localKey, JSON.stringify(data.fields)); } catch {}
        } else {
          try {
            const raw = localStorage.getItem(localKey);
            if (raw) setFields(JSON.parse(raw));
          } catch {}
        }
      })
      .catch(() => {
        try {
          const raw = localStorage.getItem(localKey);
          if (raw) setFields(JSON.parse(raw));
        } catch {}
      });
  }, [worksheetKey, localKey]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const persist = useCallback((updated: Record<string, string>) => {
    try { localStorage.setItem(localKey, JSON.stringify(updated)); } catch {}
    fetch(`/api/worksheet/${encodeURIComponent(worksheetKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: updated }),
    })
    .then(r => { setSaveStatus(r.ok ? 'synced' : 'local'); })
    .catch(() => { setSaveStatus('local'); });
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [worksheetKey, localKey]);

  const setFieldValue = useCallback((id: string, value: string) => {
    setFields(prev => {
      const next = { ...prev, [id]: value };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => persist(next), 800);
      return next;
    });
  }, [persist]);

  const resetFields = useCallback((ids: string[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setFields(prev => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      persist(next);
      return next;
    });
    setFeedbacks(prev => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  }, [persist]);

  const normalize = (val: string) => val.trim().toLowerCase().replace(/'/g, '').replace(/\s+/g, ' ');

  const checkField = useCallback((fieldId: string, expected: string, hint?: string, opts?: { normalize?: boolean; contains?: boolean }) => {
    const doNormalize = opts?.normalize !== false;
    const doContains = opts?.contains === true;
    let val = fields[fieldId] || '';
    let exp = expected;

    if (doNormalize) {
      val = normalize(val);
      exp = normalize(exp);
    }

    if (!val) {
      setFeedbacks(prev => ({ ...prev, [fieldId]: { type: 'error', msg: 'Bitte zuerst ausfüllen.' } }));
      return false;
    }

    const correct = doContains ? val.includes(exp) : val === exp;
    if (correct) {
      setFeedbacks(prev => ({ ...prev, [fieldId]: { type: 'success', msg: 'Korrekt!' } }));
    } else {
      setFeedbacks(prev => ({ ...prev, [fieldId]: { type: 'error', msg: 'Nicht ganz. ' + (hint || 'Versuche es nochmal.') } }));
    }
    return correct;
  }, [fields]);

  const checkFields = useCallback((checks: Array<{ fieldId: string; expected: string; hint?: string; opts?: { normalize?: boolean; contains?: boolean } }>, feedbackId: string) => {
    let allCorrect = true;
    let firstHint = '';

    for (const c of checks) {
      const doNormalize = !c.opts || c.opts.normalize !== false;
      let val = fields[c.fieldId] || '';
      let exp = c.expected;

      if (doNormalize) {
        val = normalize(val);
        exp = normalize(exp);
      }

      const doContains = c.opts?.contains === true;

      if (!val) {
        allCorrect = false;
        if (!firstHint) firstHint = 'Fülle alle Felder aus.';
        setFeedbacks(prev => ({ ...prev, [c.fieldId]: { type: 'error', msg: '' } }));
        continue;
      }

      const correct = doContains ? val.includes(exp) : val === exp;
      if (correct) {
        setFeedbacks(prev => ({ ...prev, [c.fieldId]: { type: 'success', msg: '' } }));
      } else {
        allCorrect = false;
        if (!firstHint && c.hint) firstHint = c.hint;
        setFeedbacks(prev => ({ ...prev, [c.fieldId]: { type: 'error', msg: '' } }));
      }
    }

    if (allCorrect) {
      setFeedbacks(prev => ({ ...prev, [feedbackId]: { type: 'success', msg: 'Alles korrekt!' } }));
    } else {
      setFeedbacks(prev => ({ ...prev, [feedbackId]: { type: 'error', msg: 'Noch nicht ganz richtig. ' + (firstHint || 'Prüfe die markierten Felder.') } }));
    }
  }, [fields]);

  const toggleHint = useCallback((id: string) => {
    setHints(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <WorksheetContext.Provider value={{ worksheetKey, fields, setFieldValue, resetFields, checkField, checkFields, feedbacks, toggleHint, hints }}>
      {children}
      {saveStatus !== 'idle' && (
        <div className={`save-status fixed bottom-4 right-4 px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm z-50 ${
          saveStatus === 'synced' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--accent-light)] text-[var(--accent-dark)]'
        }`}>
          {saveStatus === 'synced' ? 'Gespeichert' : 'Lokal gespeichert'}
        </div>
      )}
    </WorksheetContext.Provider>
  );
}