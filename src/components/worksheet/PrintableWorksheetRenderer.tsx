'use client';

import React, { useEffect, useState } from 'react';
import type { WorksheetData, WorksheetSection, WorksheetField, WorksheetTable } from '@/lib/worksheet-schema';

interface MatchResult {
  type: 'bold' | 'code' | 'linebreak';
  index: number;
  length: number;
  content: string;
}

function renderMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);
    const lineBreakMatch = remaining.match(/\n/);

    const candidates: MatchResult[] = [];

    if (boldMatch && boldMatch.index !== undefined) {
      candidates.push({ type: 'bold', index: boldMatch.index, length: boldMatch[0].length, content: boldMatch[1] });
    }
    if (codeMatch && codeMatch.index !== undefined) {
      candidates.push({ type: 'code', index: codeMatch.index, length: codeMatch[0].length, content: codeMatch[1] });
    }
    if (lineBreakMatch && lineBreakMatch.index !== undefined) {
      candidates.push({ type: 'linebreak', index: lineBreakMatch.index, length: 1, content: '' });
    }

    let earliest: MatchResult | null = null;
    for (const c of candidates) {
      if (!earliest || c.index < earliest.index) earliest = c;
    }

    if (!earliest) {
      parts.push(remaining);
      break;
    }

    if (earliest.index > 0) {
      parts.push(remaining.substring(0, earliest.index));
    }

    switch (earliest.type) {
      case 'bold':
        parts.push(<strong key={key++}>{earliest.content}</strong>);
        break;
      case 'code':
        parts.push(<code key={key++} className="font-mono bg-gray-100 px-1 rounded text-sm">{earliest.content}</code>);
        break;
      case 'linebreak':
        parts.push(<br key={key++} />);
        break;
    }

    remaining = remaining.substring(earliest.index + earliest.length);
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function renderContent(text: string): React.ReactNode {
  const paragraphs = text.split(/\n\n+/);
  if (paragraphs.length <= 1) {
    return <p style={{ lineHeight: 1.7, margin: '0.5rem 0' }}>{renderMarkdown(text)}</p>;
  }
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ lineHeight: 1.7, margin: '0.5rem 0' }}>{renderMarkdown(p)}</p>
      ))}
    </>
  );
}

function PrintableField({ field, value }: { field: WorksheetField; value: string }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#7a6f63', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
        {field.label}
      </div>
      {field.type === 'textarea' ? (
        <div style={{
          minHeight: '80px',
          border: '1px solid #e8e2d8',
          borderRadius: '8px',
          padding: '0.6rem 0.75rem',
          fontFamily: 'DM Sans, sans-serif',
          fontSize: '0.9rem',
          lineHeight: 1.6,
          background: value ? '#fefdfb' : 'transparent',
          whiteSpace: 'pre-wrap',
        }}>
          {value || <span style={{ color: '#ccc' }}>&nbsp;</span>}
        </div>
      ) : (
        <div style={{
          borderBottom: '1px solid #e8e2d8',
          padding: '0.35rem 0',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.9rem',
          minHeight: '1.6rem',
        }}>
          {value || <span style={{ color: '#ccc' }}>&nbsp;</span>}
        </div>
      )}
    </div>
  );
}

function PrintableTable({ table, fields }: { table: WorksheetTable; fields: Record<string, string> }) {
  return (
    <div style={{ overflowX: 'auto', margin: '1rem 0' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.9rem',
      }}>
        <thead>
          <tr>
            {table.columns.map(col => (
              <th key={col.key} style={{
                background: '#f5ecd4',
                color: '#8b6508',
                fontWeight: 600,
                padding: '0.5rem 0.65rem',
                textAlign: 'left',
                borderBottom: '2px solid #b8860b',
                fontSize: '0.8rem',
                letterSpacing: '0.03em',
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri}>
              {table.columns.map(col => {
                const val = row[col.key] ?? '';
                const isFirstCol = col.key === table.columns[0]?.key;

                if (col.editable) {
                  const cellId = `${table.id}-r${ri + 1}-${col.key}`;
                  const cellValue = fields[cellId] || '';
                  return (
                    <td key={col.key} style={{
                      padding: '0.4rem 0.65rem',
                      borderBottom: '1px solid #e8e2d8',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '0.9rem',
                    }}>
                      {cellValue || <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                  );
                }

                return (
                  <td key={col.key} style={{
                    padding: '0.4rem 0.65rem',
                    borderBottom: '1px solid #e8e2d8',
                    fontWeight: isFirstCol ? 500 : 600,
                    fontFamily: isFirstCol ? 'DM Sans, sans-serif' : 'JetBrains Mono, monospace',
                    fontSize: '0.9rem',
                    background: isFirstCol ? 'rgba(184,134,11,0.04)' : (val ? 'rgba(184,134,11,0.04)' : 'transparent'),
                    minWidth: isFirstCol ? '8rem' : undefined,
                  }}>
                    {renderMarkdown(val || `Zeile ${ri + 1}`)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderSection(section: WorksheetSection, idx: number, fields: Record<string, string>) {
  switch (section.type) {
    case 'story':
      return (
        <div key={`story-${idx}`} style={{
          background: 'white',
          border: '1px solid #e8e2d8',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.25rem',
        }}>
          <div style={{ fontFamily: 'Crimson Pro, serif', fontSize: '1.05rem', lineHeight: 1.7 }}>
            {renderContent(section.content)}
          </div>
        </div>
      );

    case 'info':
      return (
        <div key={`info-${idx}`} style={{
          fontSize: '0.9rem',
          color: '#7a6f63',
          padding: '0.75rem',
          background: '#f0ede7',
          borderRadius: '8px',
          margin: '1rem 0',
          lineHeight: 1.65,
        }}>
          {renderContent(section.content)}
        </div>
      );

    case 'example':
      return (
        <div key={`example-${idx}`} style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.9rem',
          background: '#f5ecd4',
          padding: '0.75rem',
          borderRadius: '8px',
          margin: '1rem 0',
          lineHeight: 1.8,
        }}>
          {renderContent(section.content)}
        </div>
      );

    case 'section':
    default: {
      return (
        <div key={`section-${idx}`} style={{
          background: 'white',
          border: '1px solid #e8e2d8',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.25rem',
          breakInside: 'avoid',
        }}>
          {section.number !== undefined && section.title && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{
                background: '#b8860b',
                color: 'white',
                width: '2rem',
                height: '2rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.85rem',
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {section.number}
              </div>
              <h2 style={{ fontFamily: 'Crimson Pro, serif', fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>
                {renderMarkdown(typeof section.title === 'string' ? section.title : String(section.title))}
              </h2>
            </div>
          )}
          {section.content && renderContent(section.content)}
          {section.fields?.map(field => (
            <PrintableField key={field.id} field={field} value={fields[field.id] || ''} />
          ))}
          {section.table && <PrintableTable table={section.table} fields={fields} />}
        </div>
      );
    }
  }
}

export default function PrintableWorksheetRenderer({
  data,
  worksheetKey,
}: {
  data: WorksheetData;
  worksheetKey: string;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/worksheet/${encodeURIComponent(worksheetKey)}`);
        if (res.ok) {
          const d = await res.json();
          if (d?.fields && Object.keys(d.fields).length > 0) {
            setFields(d.fields);
            setReady(true);
            return;
          }
        }
      } catch {}
      try {
        const raw = localStorage.getItem(`btb_${worksheetKey}`);
        if (raw) setFields(JSON.parse(raw));
      } catch {}
      setReady(true);
    };
    load();
  }, [worksheetKey]);

  useEffect(() => {
    if (ready) {
      setTimeout(() => window.print(), 300);
    }
  }, [ready]);

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '2rem 1.5rem',
      fontFamily: 'DM Sans, sans-serif',
      color: '#2c2520',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '2px solid #e8e2d8' }}>
        {data.label && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b8860b', marginBottom: '0.5rem' }}>
            {data.label}
          </div>
        )}
        <h1 style={{ fontFamily: 'Crimson Pro, serif', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>
          {data.title}
        </h1>
        {data.subtitle && (
          <p style={{ color: '#7a6f63', fontSize: '0.85rem', margin: 0 }}>{data.subtitle}</p>
        )}
      </div>

      {data.sections.map((section, idx) => renderSection(section, idx, fields))}

      {!ready && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#7a6f63' }}>
          Antworten werden geladen...
        </div>
      )}
    </div>
  );
}