'use client';

import Link from 'next/link';
import React from 'react';
import { WorksheetProvider, useWorksheet } from './WorksheetProvider';
import { Breadcrumb, Section, Story, InputField, TableInput, GivenCell, LabelCell, CheckButton, ResetButton, ButtonGroup, Feedback, HintToggle, HintContent, InfoNote, ExampleCalc, PageHeader } from './WorksheetComponents';
import type { WorksheetData, WorksheetSection, WorksheetField, WorksheetTable, WorksheetCheckGroup, WorksheetHint, CompendiumRef } from '@/lib/worksheet-schema';

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
        parts.push(<code key={key++}>{earliest.content}</code>);
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
    return <p className="task-description">{renderMarkdown(text)}</p>;
  }
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} className="task-description">{renderMarkdown(p)}</p>
      ))}
    </>
  );
}

function renderField(field: WorksheetField) {
  return (
    <InputField
      key={field.id}
      id={field.id}
      label={field.label}
      placeholder={field.placeholder}
      type={field.type}
      compendiumRef={field.compendiumRef}
    />
  );
}

function renderTable(table: WorksheetTable) {
  return (
    <div style={{ overflowX: 'auto' }} key={table.id}>
      <table className="edit-table">
        <thead>
          <tr>
            {table.columns.map(col => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri}>
              {table.columns.map(col => {
                const val = row[col.key] ?? '';
                if (col.editable) {
                  return (
                    <td key={col.key}>
                      <TableInput id={`${table.id}-r${ri + 1}-${col.key}`} placeholder={col.placeholder} />
                    </td>
                  );
                }
                const isFirstCol = col.key === table.columns[0]?.key;
                if (isFirstCol) {
                  return <LabelCell key={col.key}>{renderMarkdown(val || `Zeile ${ri + 1}`)}</LabelCell>;
                }
                return <GivenCell key={col.key}>{renderMarkdown(val || `Zeile ${ri + 1}`)}</GivenCell>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CheckGroupButtons({ checkGroup }: { checkGroup: WorksheetCheckGroup }) {
  const { checkFields } = useWorksheet();

  return (
    <div key={checkGroup.id}>
      <ButtonGroup>
        <CheckButton onClick={() => {
          checkFields(
            checkGroup.checks.map(c => ({
              fieldId: c.fieldId,
              expected: c.expected,
              hint: c.hint,
              opts: c.opts,
            })),
            checkGroup.feedbackId
          );
        }}>
          {checkGroup.label || 'Prüfen'}
        </CheckButton>
        <ResetButton ids={checkGroup.checks.map(c => c.fieldId)}>Zurücksetzen</ResetButton>
      </ButtonGroup>
      <Feedback id={checkGroup.feedbackId} />
    </div>
  );
}

function renderHints(hints: WorksheetHint[]) {
  return hints.map(hint => (
    <div key={hint.id}>
      <HintToggle hintId={hint.id}>{hint.label || 'Tipp anzeigen'}</HintToggle>
      <HintContent id={hint.id}>{renderMarkdown(hint.content)}</HintContent>
    </div>
  ));
}

function renderSection(section: WorksheetSection, idx: number) {
  switch (section.type) {
    case 'story':
      return (
        <Story key={`story-${idx}`}>
          {renderContent(section.content)}
        </Story>
      );

    case 'info':
      return (
        <InfoNote key={`info-${idx}`}>
          {renderContent(section.content)}
        </InfoNote>
      );

    case 'example':
      return (
        <ExampleCalc key={`example-${idx}`}>
          {renderContent(section.content)}
        </ExampleCalc>
      );

    case 'section':
    default:
      return (
        <Section key={`section-${idx}`} number={section.number} title={section.title ? renderMarkdown(section.title) as React.ReactNode : undefined}>
          {section.content && renderContent(section.content)}
          {section.fields?.map(field => renderField(field))}
          {section.table && renderTable(section.table)}
          {section.checkGroups?.map(cg => (
            <CheckGroupButtons key={cg.id} checkGroup={cg} />
          ))}
          {(!section.checkGroups || section.checkGroups.length === 0) && section.resets && section.resets.length > 0 && (
            <ButtonGroup>
              <ResetButton ids={section.resets}>Zurücksetzen</ResetButton>
            </ButtonGroup>
          )}
          {section.hints && section.hints.length > 0 && renderHints(section.hints)}
          {section.compendiumRefs && section.compendiumRefs.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {section.compendiumRefs.map((cr: CompendiumRef | string, i: number) => {
                const ref = typeof cr === 'string' ? cr : cr.ref;
                const label = typeof cr === 'string' ? cr : cr.label;
                return (
                  <Link
                    key={i}
                    href={`/compendium/${ref}`}
                    className="compendium-ref-link inline-flex items-center gap-1.5 text-xs bg-[var(--accent-light)] text-[var(--accent-dark)] px-2.5 py-1 rounded-lg no-underline hover:bg-[var(--accent)] hover:text-white transition-colors font-medium"
                    target="_blank"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </Section>
      );
  }
}

function DynamicWorksheetContent({ data, breadcrumbItems }: { data: WorksheetData; breadcrumbItems: Array<{ label: string; href?: string }> }) {
  return (
    <div className="container">
      <Breadcrumb items={breadcrumbItems} />
      <PageHeader
        label={data.label || ''}
        title={data.title}
        subtitle={data.subtitle}
      />
      {data.sections.map((section, idx) => renderSection(section, idx))}
    </div>
  );
}

export default function DynamicWorksheetRenderer({
  data,
  worksheetKey,
  breadcrumbItems,
}: {
  data: WorksheetData;
  worksheetKey: string;
  breadcrumbItems: Array<{ label: string; href?: string }>;
}) {
  return (
    <WorksheetProvider worksheetKey={worksheetKey}>
      <DynamicWorksheetContent data={data} breadcrumbItems={breadcrumbItems} />
    </WorksheetProvider>
  );
}