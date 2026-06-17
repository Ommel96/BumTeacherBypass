'use client';

import Link from 'next/link';
import { useWorksheet } from './WorksheetProvider';

export function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] mb-6 flex-wrap" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[var(--border)]" aria-hidden="true">/</span>}
          {item.href ? (
            <Link href={item.href} className="text-[var(--accent)] font-medium no-underline hover:underline">{item.label}</Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function SectionHeader({ number, children }: { number: string | number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="bg-[var(--accent)] text-white w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-semibold shrink-0">
        {number}
      </div>
      <h2 className="font-serif text-1.5xl font-bold m-0">{children}</h2>
    </div>
  );
}

export function Section({ number, title, children, className = '' }: { number?: string | number; title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-[var(--border)] rounded-xl p-6 mb-6 shadow-sm${className ? ' ' + className : ''}`}>
      {number !== undefined && title && <SectionHeader number={number}>{title}</SectionHeader>}
      {children}
    </div>
  );
}

export function Story({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-xl p-6 mb-6 shadow-sm">
      <div className="font-serif text-lg leading-relaxed">{children}</div>
    </div>
  );
}

import { CompendiumRef } from '@/lib/worksheet-schema';

export function InputField({ id, label, placeholder, type = 'text', compendiumRef }: { id: string; label: string; placeholder?: string; type?: string; compendiumRef?: CompendiumRef | string }) {
  const { fields, setFieldValue } = useWorksheet();
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">{label}</label>
        {compendiumRef && (
          <Link href={`/compendium/${typeof compendiumRef === 'string' ? compendiumRef : compendiumRef.ref}`} target="_blank" className="inline-flex items-center gap-0.5 text-xs text-[var(--accent)] hover:text-[var(--accent-dark)] no-underline mb-1.5 font-medium">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            {typeof compendiumRef === 'string' ? compendiumRef : compendiumRef.label}
          </Link>
        )}
      </div>
      {type === 'textarea' ? (
        <textarea id={id} rows={5} placeholder={placeholder} className="w-full p-3 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] font-sans text-sm leading-relaxed outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] resize-y min-h-[100px]" value={fields[id] || ''} onChange={e => setFieldValue(id, e.target.value)} />
      ) : (
        <input id={id} type={type} placeholder={placeholder} className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] font-mono text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)]" value={fields[id] || ''} onChange={e => setFieldValue(id, e.target.value)} />
      )}
    </div>
  );
}

export function TableInput({ id, placeholder }: { id: string; placeholder?: string }) {
  const { fields, setFieldValue, feedbacks } = useWorksheet();
  const fb = feedbacks[id];
  const cls = fb ? (fb.type === 'success' ? 'border-[var(--success)] bg-[var(--success-bg)]' : 'border-[var(--error)] bg-[var(--error-bg)]') : '';
  return (
    <input type="text" id={id} placeholder={placeholder} value={fields[id] || ''} onChange={e => setFieldValue(id, e.target.value)} className={`w-full p-1.5 border border-dashed border-[var(--border)] rounded-md bg-transparent font-mono text-sm outline-none focus:border-solid focus:border-[var(--accent)] focus:bg-[var(--input-bg)] focus:shadow-[0_0_0_2px_var(--accent-light)] transition-all ${cls}`} />
  );
}

export function GivenCell({ children }: { children: React.ReactNode }) {
  return <td className="p-2.5 font-mono font-semibold text-sm bg-[rgba(184,134,11,0.04)]">{children}</td>;
}

export function LabelCell({ children }: { children: React.ReactNode }) {
  return <td className="p-2.5 font-medium bg-[rgba(184,134,11,0.04)] w-36">{children}</td>;
}

export function CheckButton({ onClick, children = 'Prüfen' }: { onClick: () => void; children?: React.ReactNode }) {
  return <button onClick={onClick} className="btn-check inline-flex items-center gap-1.5 px-4 py-2 border-none rounded-lg font-sans text-sm font-semibold cursor-pointer bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)] transition-colors">{children}</button>;
}

export function ResetButton({ ids, children = 'Zurücksetzen' }: { ids: string[]; children?: React.ReactNode }) {
  const { resetFields } = useWorksheet();
  return <button onClick={() => resetFields(ids)} className="btn-reset inline-flex items-center gap-1.5 px-4 py-2 border border-[var(--border)] rounded-lg font-sans text-sm font-semibold cursor-pointer bg-transparent text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text)] transition-colors">{children}</button>;
}

export function ButtonGroup({ children }: { children: React.ReactNode }) {
  return <div className="btn-group flex gap-2 mt-5 flex-wrap">{children}</div>;
}

export function Feedback({ id }: { id: string }) {
  const { feedbacks } = useWorksheet();
  const fb = feedbacks[id];
  if (!fb) return null;
  return <div className={`feedback mt-4 p-3 rounded-lg text-sm font-medium animate-[fadeIn_0.3s_ease] ${fb.type === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)]' : 'bg-[var(--error-bg)] text-[var(--error)]'}`} role="alert">{fb.msg}</div>;
}

export function HintToggle({ hintId, children = 'Tipp anzeigen' }: { hintId: string; children?: React.ReactNode }) {
  const { toggleHint } = useWorksheet();
  return <button onClick={() => toggleHint(hintId)} className="hint-toggle text-sm text-[var(--accent)] cursor-pointer border-none bg-transparent font-sans font-semibold mt-3 hover:text-[var(--accent-dark)]">{children}</button>;
}

export function HintContent({ id, children }: { id: string; children: React.ReactNode }) {
  const { hints } = useWorksheet();
  if (!hints[id]) return null;
  return <div className="hint-content mt-2 p-3 bg-[var(--accent-light)] rounded-lg text-sm text-[var(--accent-dark)] leading-relaxed animate-[fadeIn_0.3s_ease]">{children}</div>;
}

export function InfoNote({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-[var(--text-muted)] p-3 bg-[#f0ede7] rounded-lg my-4 leading-relaxed">{children}</div>;
}

export function ExampleCalc({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-sm bg-[var(--accent-light)] p-3 rounded-lg my-4 leading-loose">{children}</div>;
}

export function PageHeader({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center mb-8 pb-6 border-b-2 border-[var(--border)]">
      <div className="font-mono text-xs tracking-widest uppercase text-[var(--accent)] mb-2">{label}</div>
      <h1 className="font-serif text-3xl font-bold mb-1">{title}</h1>
      {subtitle && <p className="text-[var(--text-muted)] text-sm">{subtitle}</p>}
    </div>
  );
}