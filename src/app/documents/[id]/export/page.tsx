'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { WorksheetData } from '@/lib/worksheet-schema';

const PrintableWorksheetRenderer = dynamic(
  () => import('@/components/worksheet/PrintableWorksheetRenderer'),
  { ssr: false }
);

interface PageData {
  id: string;
  document_id: string;
  page_number: number;
  title: string;
  content: string;
  raw_text: string;
  worksheet_data: string | null;
}

interface DocumentData {
  document: {
    id: string;
    filename: string;
    year: string;
    semester: string;
    module_number: string;
    topic: string;
  };
  pages: PageData[];
}

function parseWorksheetData(raw: string | null): WorksheetData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.title && Array.isArray(parsed.sections)) {
      return parsed as WorksheetData;
    }
  } catch {}
  return null;
}

export default function ExportPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then(r => r.json())
      .then(json => {
        setData(json);
        if (json.pages?.length > 0) setActivePage(json.pages[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', textAlign: 'center', color: '#7a6f63' }}>
        Laden...
      </div>
    );
  }

  if (!data || !data.pages || data.pages.length === 0) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', textAlign: 'center', color: '#7a6f63' }}>
        Keine Arbeitsblattdaten für den Export verfügbar.
      </div>
    );
  }

  const currentPage = data.pages.find(p => p.id === activePage) || data.pages[0];
  const worksheetData = parseWorksheetData(currentPage.worksheet_data);

  if (!worksheetData) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', textAlign: 'center', color: '#7a6f63' }}>
        Diese Seite wurde noch nicht in ein interaktives Arbeitsblatt umgewandelt.
      </div>
    );
  }

  return (
    <>
      {data.pages.length > 1 && (
        <div className="no-print" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: 'white',
          borderBottom: '1px solid #e8e2d8',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          zIndex: 100,
        }}>
          {data.pages.map(page => {
            const pwd = parseWorksheetData(page.worksheet_data);
            return (
              <button
                key={page.id}
                onClick={() => setActivePage(page.id)}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  border: activePage === page.id ? 'none' : '1px solid #e8e2d8',
                  background: activePage === page.id ? '#b8860b' : 'white',
                  color: activePage === page.id ? 'white' : '#7a6f63',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Seite {page.page_number}: {pwd?.title || page.title || `Seite ${page.page_number}`}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ marginTop: data.pages.length > 1 ? '60px' : 0 }}>
        <PrintableWorksheetRenderer
          data={worksheetData}
          worksheetKey={`doc-${id}-page-${currentPage.page_number}`}
        />
      </div>
    </>
  );
}