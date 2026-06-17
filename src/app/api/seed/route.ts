export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

interface SeedWorksheet {
  htmlPath: string;
  title: string;
  year: string;
  semester: string;
  moduleNumber: string;
  topic: string;
  filename: string;
}

const SEED_WORKSHEETS: SeedWorksheet[] = [
  {
    htmlPath: 'public/year-1/semester-2/114/codierung/morse-code.html',
    title: 'Morse Code & Huffman Codierung',
    year: '1',
    semester: '2',
    moduleNumber: '114',
    topic: 'codierung',
    filename: 'morse-code.pdf',
  },
  {
    htmlPath: 'public/year-1/semester-2/114/codierung/zahlensysteme.html',
    title: 'Zahlensysteme',
    year: '1',
    semester: '2',
    moduleNumber: '114',
    topic: 'codierung',
    filename: 'zahlensysteme.pdf',
  },
  {
    htmlPath: 'public/year-1/semester-2/114/codierung/uebung-zahlensysteme.html',
    title: 'Übung Zahlensysteme',
    year: '1',
    semester: '2',
    moduleNumber: '114',
    topic: 'codierung',
    filename: 'uebung-zahlensysteme.pdf',
  },
  {
    htmlPath: 'public/year-1/semester-2/114/bitoperatoren/uebungen-bitoperatoren.html',
    title: 'Übungen Bitoperatoren',
    year: '1',
    semester: '2',
    moduleNumber: '114',
    topic: 'bitoperatoren',
    filename: 'uebungen-bitoperatoren.pdf',
  },
  {
    htmlPath: 'public/year-1/semester-2/114/binaere-interpretationen/binaere-interpretationen.html',
    title: 'Binäre Interpretationen',
    year: '1',
    semester: '2',
    moduleNumber: '114',
    topic: 'binaere-interpretationen',
    filename: 'binaere-interpretationen.pdf',
  },
  {
    htmlPath: 'public/year-1/semester-2/114/binaere-interpretationen/zweierkomplement.html',
    title: 'Zweierkomplement',
    year: '1',
    semester: '2',
    moduleNumber: '114',
    topic: 'binaere-interpretationen',
    filename: 'zweierkomplement.pdf',
  },
  {
    htmlPath: 'public/year-1/semester-2/164/assoziationen/vertiefungsfragen.html',
    title: '12.1.1 Vertiefungsfragen',
    year: '1',
    semester: '2',
    moduleNumber: '164',
    topic: 'assoziationen',
    filename: 'vertiefungsfragen.pdf',
  },
  {
    htmlPath: 'public/year-1/semester-2/164/assoziationen/zusammenfassung-unnn.html',
    title: '12.1.2 Zusammenfassung UN/NN',
    year: '1',
    semester: '2',
    moduleNumber: '164',
    topic: 'assoziationen',
    filename: 'zusammenfassung-unnn.pdf',
  },
];

export async function GET() {
  try {
    const db = getDb();
    const fs = await import('fs');
    const pathModule = await import('path');

    const existing = db.prepare("SELECT COUNT(*) as count FROM documents WHERE id LIKE 'seed-%'").get() as { count: number };
    if (existing.count > 0) {
      return NextResponse.json({ ok: true, message: `Already seeded (${existing.count} worksheets exist)`, count: 0 });
    }

    const insertDoc = db.prepare(`
      INSERT INTO documents (id, filename, mime_type, size, status, year, semester, module_number, topic)
      VALUES (?, ?, ?, ?, 'processed', ?, ?, ?, ?)
    `);

    const insertPage = db.prepare(`
      INSERT INTO pages (id, document_id, page_number, title, content, raw_text, worksheet_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    for (const ws of SEED_WORKSHEETS) {
      const fullPath = pathModule.join(process.cwd(), ws.htmlPath);
      if (!fs.existsSync(fullPath)) {
        continue;
      }

      const htmlContent = fs.readFileSync(fullPath, 'utf-8');
      const mainMatch = htmlContent.match(/<main[^>]*>([\s\S]*?)<\/main>/);
      const mainContent = mainMatch ? mainMatch[1] : htmlContent;

      const docId = `seed-${ws.year}-${ws.semester}-m${ws.moduleNumber}-${ws.topic}-${count}`;
      const pageId = `seed-page-${count}`;

      insertDoc.run(docId, ws.filename, 'text/html', htmlContent.length, ws.year, ws.semester, ws.moduleNumber, ws.topic);
      insertPage.run(pageId, docId, 1, ws.title, mainContent, '', null);

      count++;
    }

    return NextResponse.json({ ok: true, message: `Seeded ${count} worksheets`, count });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Failed to seed worksheets', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}