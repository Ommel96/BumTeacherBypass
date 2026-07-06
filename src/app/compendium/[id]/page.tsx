'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import type { GenericComponentProps } from '@/lib/worksheet-schema';
import { Latex } from '@/components/katex-renderer';

import { WorksheetProvider } from '@/components/worksheet/WorksheetProvider';

const GenericComponent = dynamic(() => import('@/components/worksheet/InteractiveComponents').then(m => m.GenericComponent), { ssr: false });

interface InteractiveExample {
  label: string;
  component: { type: 'custom'; props: GenericComponentProps };
}

interface RelatedEntry {
  id: string;
  title: string;
  module_number: string;
  topic: string;
}

interface CompendiumDetail {
  id: string;
  module_number: string;
  topic: string;
  title: string;
  content: string;
  keywords: string;
  interactive_examples: string;
  source_doc_ids: string;
  created_at: string;
  related: RelatedEntry[];
}

// Models mix math syntaxes: normalize $$..$$ → \[..\], $..$ → \(..\), and collapse
// newlines inside \[..\] blocks so the line-based renderer below sees each display
// formula as a single line. Single-$ requires non-space content on both ends so
// prose like "5 $ pro Stück" is left alone.
function normalizeMath(text: string): string {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, m: string) => `\\[${m.trim()}\\]`)
    .replace(/(^|[^\\$])\$([^\s$\n](?:[^$\n]*[^\s$\n])?)\$(?!\$)/g, (_, pre: string, m: string) => `${pre}\\(${m}\\)`)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => `\\[${m.replace(/\s*\n\s*/g, ' ').trim()}\\]`);
}

function renderContent(text: string): React.ReactNode {
  const lines = normalizeMath(text).split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;
  let listItems: string[] = [];
  let orderedItems: string[] = [];
  let tableRows: string[][] = [];
  let tableHeader: string[] | null = null;
  let codeBlockLines: string[] | null = null;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(<ul key={key++} style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>{listItems.map((li, i) => <li key={i} style={{ lineHeight: 1.7, marginBottom: '0.25rem' }}>{renderInline(li)}</li>)}</ul>);
      listItems = [];
    }
    if (orderedItems.length > 0) {
      elements.push(<ol key={key++} style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>{orderedItems.map((li, i) => <li key={i} style={{ lineHeight: 1.7, marginBottom: '0.25rem' }}>{renderInline(li)}</li>)}</ol>);
      orderedItems = [];
    }
  };

  const flushTable = () => {
    if (tableHeader === null || tableRows.length === 0) {
      tableHeader = null;
      tableRows = [];
      return;
    }
    elements.push(
      <div key={key++} style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr>{tableHeader.map((cell, i) => (
              <th key={i} style={{ background: '#f5ecd4', color: '#8b6508', fontWeight: 600, padding: '0.5rem 0.65rem', textAlign: 'left', borderBottom: '2px solid #b8860b', fontSize: '0.8rem' }}>{renderInline(cell.trim())}</th>
            ))}</tr>
          </thead>
          <tbody>{tableRows.map((row, ri) => (
            <tr key={ri}>{row.map((cell, ci) => (
              <td key={ci} style={{ padding: '0.4rem 0.65rem', borderBottom: '1px solid #e8e2d8', lineHeight: 1.5 }}>{renderInline(cell.trim())}</td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>
    );
    tableHeader = null;
    tableRows = [];
  };

  const flushCodeBlock = () => {
    if (codeBlockLines && codeBlockLines.length > 0) {
      elements.push(
        <pre key={key++} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem 1rem', margin: '0.75rem 0', overflowX: 'auto', fontSize: '0.85rem', lineHeight: 1.6, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>
          <code>{codeBlockLines.join('\n')}</code>
        </pre>
      );
    }
    codeBlockLines = null;
  };

  const isSeparatorRow = (cells: string[]) => cells.every(c => /^[\s-:]+$/.test(c.trim()));

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle fenced code blocks (``` or `)
    if (trimmed.startsWith('```')) {
      flushList();
      flushTable();
      if (codeBlockLines !== null) {
        // Closing fence
        flushCodeBlock();
      } else {
        // Opening fence
        codeBlockLines = [];
      }
      continue;
    }

    // Handle single-backtick code blocks (some models use ` instead of ```)
    if (codeBlockLines === null && trimmed === '`') {
      flushList();
      flushTable();
      codeBlockLines = [];
      continue;
    }
    if (codeBlockLines !== null && trimmed === '`') {
      flushCodeBlock();
      continue;
    }

    if (codeBlockLines !== null) {
      codeBlockLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushList();
      flushTable();
      continue;
    }

    const pipeMatch = trimmed.match(/^\|(.+)\|$/);
    if (pipeMatch) {
      if (listItems.length > 0 || orderedItems.length > 0) flushList();
      const cells = pipeMatch[1].split('|').map(c => c.trim());
      if (isSeparatorRow(cells)) {
        continue;
      }
      if (tableHeader === null) {
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    }

    if (tableHeader !== null) {
      flushTable();
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.*)/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)/);

    if (unorderedMatch) {
      if (orderedItems.length > 0) flushList();
      listItems.push(unorderedMatch[1]);
      continue;
    }
    if (orderedMatch) {
      if (listItems.length > 0) flushList();
      orderedItems.push(orderedMatch[1]);
      continue;
    }

    flushList();
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInline(headingMatch[2]);
      if (level <= 2) {
        elements.push(<h2 key={key++} className="font-serif text-xl font-bold mt-6 mb-2 text-[var(--accent-dark)]">{content}</h2>);
      } else if (level === 3) {
        elements.push(<h3 key={key++} className="font-serif text-lg font-bold mt-6 mb-2 text-[var(--accent-dark)]">{content}</h3>);
      } else {
        elements.push(<h4 key={key++} className="font-serif text-base font-bold mt-4 mb-1.5 text-[var(--accent-dark)]">{content}</h4>);
      }
      continue;
    }
    elements.push(<p key={key++} style={{ lineHeight: 1.7, margin: '0.5rem 0' }}>{renderInline(trimmed)}</p>);
  }
  flushList();
  flushTable();
  flushCodeBlock();

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Italic *x*: content must not start/end with whitespace (so "2 * 3 * 4" is left alone)
    const italicMatch = remaining.match(/\*([^\s*](?:[^*\n]*[^\s*])?)\*/);
    const codeMatch = remaining.match(/`(.+?)`/);
    // Inline LaTeX: \(...\)
    const latexMatch = remaining.match(/\\\((.+?)\\\)/);
    // Display LaTeX on its own: \[...\]
    const displayMathMatch = remaining.match(/\\\[(.+?)\\\]/);

    const candidates: { idx: number; len: number; content: React.ReactNode }[] = [];
    if (boldMatch && boldMatch.index !== undefined) {
      candidates.push({ idx: boldMatch.index, len: boldMatch[0].length, content: <strong key={key++}>{renderInline(boldMatch[1])}</strong> });
    }
    // Italic only wins when it starts strictly before any bold match (so **x** isn't eaten)
    if (italicMatch && italicMatch.index !== undefined && (!boldMatch || boldMatch.index === undefined || italicMatch.index < boldMatch.index)) {
      candidates.push({ idx: italicMatch.index, len: italicMatch[0].length, content: <em key={key++}>{renderInline(italicMatch[1])}</em> });
    }
    if (codeMatch && codeMatch.index !== undefined) {
      candidates.push({ idx: codeMatch.index, len: codeMatch[0].length, content: <code key={key++} className="font-mono bg-[var(--accent-light)] text-[var(--accent-dark)] px-1.5 py-0.5 rounded text-sm">{codeMatch[1]}</code> });
    }
    if (latexMatch && latexMatch.index !== undefined) {
      candidates.push({ idx: latexMatch.index, len: latexMatch[0].length, content: <Latex key={key++} tex={latexMatch[1]} /> });
    }
    if (displayMathMatch && displayMathMatch.index !== undefined) {
      candidates.push({ idx: displayMathMatch.index, len: displayMathMatch[0].length, content: <div key={key++} className="my-1 text-center"><Latex tex={displayMathMatch[1]} display /></div> });
    }

    if (candidates.length === 0) {
      parts.push(remaining);
      break;
    }

    const earliest = candidates.reduce((a, b) => a.idx < b.idx ? a : b);
    if (earliest.idx > 0) {
      parts.push(remaining.substring(0, earliest.idx));
    }
    parts.push(earliest.content);
    remaining = remaining.substring(earliest.idx + earliest.len);
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export default function CompendiumDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [entry, setEntry] = useState<CompendiumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const fetchEntry = () => {
    setLoading(true);
    fetch(`/api/compendium/${id}`)
      .then(r => { if (!r.ok) return null; return r.json(); })
      .then(data => { if (data && data.id) setEntry(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEntry(); }, [id]);

  const handleDelete = async () => {
    if (!confirm('Diesen Kompendium-Eintrag löschen?')) return;
    await fetch(`/api/compendium/${id}`, { method: 'DELETE' });
    window.location.href = '/compendium';
  };

  const handleRegenerate = async () => {
    if (!entry?.source_doc_ids) return;
    setRegenerating(true);
    try {
      const docIds = String(entry.source_doc_ids).split(',').filter(Boolean);
      const res = await fetch('/api/compendium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds: docIds }),
      });
      if (!res.ok) throw new Error(`Regenerate failed: ${res.status}`);
      await fetchEntry();
    } catch (err) {
      console.error('Regenerate failed:', err);
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)] mx-auto mb-4"/>
        <p className="text-[var(--text-muted)]">Laden...</p>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
        <p className="text-[var(--text-muted)]">Eintrag nicht gefunden.</p>
        <Link href="/compendium" className="text-[var(--accent)] hover:underline mt-2 inline-block">Zurück zum Kompendium</Link>
      </div>
    );
  }

  return (
    <>
      {regenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)] mx-auto mb-4"/>
            <h2 className="font-serif text-2xl font-bold mb-2">Eintrag wird neu erstellt</h2>
            <p className="text-[var(--text-muted)]">KI erstellt diesen Kompendium-Eintrag neu...</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">Das kann einen Moment dauern. Bitte warten.</p>
          </div>
        </div>
      )}
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <nav className="text-sm text-[var(--text-muted)] mb-6 flex items-center gap-1 flex-wrap">
        <Link href="/" className="hover:text-[var(--accent)]">Startseite</Link>
        <span className="mx-1">/</span>
        <Link href="/compendium" className="hover:text-[var(--accent)]">Kompendium</Link>
        <span className="mx-1">/</span>
        {entry.module_number && (
          <>
            <Link href={`/compendium?module_number=${entry.module_number}`} className="hover:text-[var(--accent)]">Modul {entry.module_number}</Link>
            <span className="mx-1">/</span>
          </>
        )}
        <span className="text-[var(--text)]">{entry.title}</span>
      </nav>

      <div className="bg-white border border-[var(--border)] rounded-xl p-6 shadow-sm mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {entry.module_number && (
            <span className="bg-[var(--accent)] text-white px-2 py-0.5 rounded text-xs font-mono font-semibold">
              Modul {entry.module_number}
            </span>
          )}
          {entry.topic && (
            <span className="bg-[var(--accent-light)] text-[var(--accent-dark)] px-2 py-0.5 rounded text-xs font-mono">
              {entry.topic}
            </span>
          )}
        </div>

        <h1 className="font-serif text-2xl font-bold mb-4">{entry.title}</h1>

        <div className="flex items-center gap-2 mb-4">
          {entry.source_doc_ids && (
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 text-xs border border-[var(--border)] text-[var(--text-muted)] px-2.5 py-1 rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors bg-transparent cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              {regenerating ? 'Wird neu erstellt...' : 'Neu erstellen'}
            </button>
          )}
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 text-xs border border-[var(--border)] text-[var(--text-muted)] px-2.5 py-1 rounded-lg hover:border-red-400 hover:text-red-500 transition-colors bg-transparent cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Löschen
          </button>
        </div>

        {entry.keywords && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {String(entry.keywords).split(',').map(kw => kw.trim()).filter(Boolean).map(kw => (
              <span key={kw} className="text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">
                {kw}
              </span>
            ))}
          </div>
        )}

        <div className="prose max-w-none text-[var(--text)] text-sm leading-relaxed">
          {renderContent(entry.content)}
        </div>

        {entry.interactive_examples && (() => {
          try {
            const examples = JSON.parse(entry.interactive_examples) as InteractiveExample[];
            if (!Array.isArray(examples) || examples.length === 0) return null;
            return (
              <div className="mt-6 pt-6 border-t border-[var(--border)]">
                <h3 className="font-serif text-lg font-bold mb-4 text-[var(--accent-dark)]">Interaktive Beispiele</h3>
                <WorksheetProvider worksheetKey={`compendium-${entry.id}`}>
                  <div className="space-y-4">
                    {examples.map((ex, i) => (
                      <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                        <div className="font-semibold text-sm mb-3 text-[var(--accent-dark)]">{ex.label}</div>
                        {ex.component?.type === 'custom' && ex.component?.props && (
                          <GenericComponent props={ex.component.props} />
                        )}
                      </div>
                    ))}
                  </div>
                </WorksheetProvider>
              </div>
            );
          } catch { return null; }
        })()}
      </div>

      {entry.source_doc_ids && (
        <div className="bg-white border border-[var(--border)] rounded-xl p-4 shadow-sm mb-6">
          <h3 className="font-mono text-xs tracking-wider uppercase text-[var(--text-muted)] mb-2">Quelldokumente</h3>
          <div className="flex flex-wrap gap-2">
            {String(entry.source_doc_ids).split(',').filter(Boolean).map(docId => (
              <Link key={docId} href={`/documents/${docId}`} className="text-sm bg-[var(--accent-light)] text-[var(--accent-dark)] px-3 py-1 rounded-lg no-underline hover:bg-[var(--accent)] hover:text-white transition-colors">
                Dokument ansehen
              </Link>
            ))}
          </div>
        </div>
      )}

      {entry.related && entry.related.length > 0 && (
        <div className="bg-white border border-[var(--border)] rounded-xl p-4 shadow-sm">
          <h3 className="font-mono text-xs tracking-wider uppercase text-[var(--text-muted)] mb-3">Verwandte Einträge</h3>
          <div className="flex flex-col gap-2">
            {entry.related.map(r => (
              <Link key={r.id} href={`/compendium/${r.id}`} className="flex items-center gap-3 p-3 border border-[var(--border)] rounded-lg hover:border-[var(--accent)] transition-all no-underline text-[var(--text)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                <div>
                  <div className="font-semibold text-sm">{r.title}</div>
                  <div className="text-xs text-[var(--text-muted)]">Modul {r.module_number} · {r.topic}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/compendium" className="text-sm text-[var(--accent)] hover:underline no-underline">
          &larr; Zurück zum Kompendium
        </Link>
       </div>
    </div>
    </>
  );
}