'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Anmeldung fehlgeschlagen');
        return;
      }
      window.location.href = '/';
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-[var(--border)] rounded-2xl shadow-[var(--shadow-md)] p-7">
        <div className="flex justify-center mb-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-[0_4px_14px_rgba(139,92,246,0.45)]" style={{ background: 'var(--accent-grad)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </span>
        </div>
        <h1 className="font-serif text-xl font-extrabold text-center mb-1">BumTeacherBypass</h1>
        <p className="text-sm text-[var(--text-muted)] text-center mb-5">Passwort eingeben, um fortzufahren.</p>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Passwort"
          autoFocus
          className="w-full px-3.5 py-2.5 border border-[var(--border)] rounded-xl bg-[var(--input-bg)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] transition-all mb-3"
        />
        {error && <div className="mb-3 p-2.5 bg-[var(--error-bg)] text-[var(--error)] rounded-lg text-sm">{error}</div>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full flex items-center justify-center gap-2 text-white px-5 py-2.5 rounded-xl font-semibold border-none cursor-pointer disabled:opacity-50 transition-all"
          style={{ background: 'var(--accent-grad)' }}
        >
          {loading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/> : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
