'use client';

import { useState, useEffect, useCallback } from 'react';

// Styled replacement for window.confirm(). Mounted once in the layout;
// call confirmDialog('...') anywhere on the client and await the boolean.

interface ConfirmRequest {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let pendingRequest: ((req: ConfirmRequest) => void) | null = null;

export function confirmDialog(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise(resolve => {
    if (!pendingRequest) {
      // Host not mounted (SSR edge case) — fall back to native
      resolve(window.confirm(message));
      return;
    }
    pendingRequest({ message, resolve, ...opts });
  });
}

export function ConfirmDialogHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    pendingRequest = (r: ConfirmRequest) => setReq(r);
    return () => { pendingRequest = null; };
  }, []);

  const answer = useCallback((ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  }, [req]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(false);
      if (e.key === 'Enter') answer(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req, answer]);

  if (!req) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => answer(false)}>
      <div className="bg-white border border-[var(--border)] rounded-2xl shadow-[var(--shadow-md)] w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <p className="text-sm leading-relaxed mb-5 whitespace-pre-line">{req.message}</p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => answer(false)}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--border)] bg-transparent text-[var(--text)] cursor-pointer hover:border-[var(--accent)] transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => answer(true)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border-none cursor-pointer text-white transition-all ${req.danger ? 'bg-[var(--error)] hover:brightness-110' : ''}`}
            style={req.danger ? undefined : { background: 'var(--accent-grad)' }}
          >
            {req.confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
