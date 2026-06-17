import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import getDb from './db';

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads');

export function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9äöüß-]/g, '');
}

export interface DocumentRow {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  status: 'uploaded' | 'processing' | 'processed' | 'error';
  year: string;
  semester: string;
  module_number: string;
  topic: string;
  created_at: string;
  updated_at: string;
}

export interface PageRow {
  id: string;
  document_id: string;
  page_number: number;
  title: string;
  content: string;
  raw_text: string;
  worksheet_data: string | null;
  created_at: string;
  updated_at: string;
}

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function saveUploadedFile(
  file: File,
  meta?: { year?: string; semester?: string; module_number?: string; topic?: string }
): Promise<{ id: string; filePath: string }> {
  await ensureUploadDir();

  const id = uuidv4();
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || (file.type === 'application/pdf' ? '.pdf' : '.docx');
  const filePath = path.join(UPLOAD_DIR, `${id}${ext}`);

  await fs.writeFile(filePath, buffer);

  const db = getDb();
  const insertStmt = db.prepare(`
    INSERT INTO documents (id, filename, mime_type, size, status, year, semester, module_number, topic)
    VALUES (?, ?, ?, ?, 'uploaded', ?, ?, ?, ?)
  `);
  const normalizedModule = slugify(meta?.module_number || '');
  const normalizedTopic = slugify(meta?.topic || '');
  insertStmt.run(id, file.name, file.type || 'application/octet-stream', file.size, meta?.year || '', meta?.semester || '', normalizedModule, normalizedTopic);

  return { id, filePath };
}

export function getDocument(id: string): DocumentRow | undefined {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
  return stmt.get(id) as DocumentRow | undefined;
}

export function listDocuments(): DocumentRow[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM documents ORDER BY created_at DESC');
  return stmt.all() as DocumentRow[];
}

export function listDocumentsByCategory(year?: string, semester?: string, moduleNumber?: string, topic?: string): DocumentRow[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: string[] = [];

  if (year) { conditions.push('year = ?'); params.push(year); }
  if (semester) { conditions.push('semester = ?'); params.push(semester); }
  if (moduleNumber) { conditions.push('LOWER(module_number) = ?'); params.push(slugify(moduleNumber)); }
  if (topic) { conditions.push('LOWER(topic) = ?'); params.push(slugify(topic)); }

  if (conditions.length === 0) {
    return listDocuments();
  }

  const query = `SELECT * FROM documents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
  const stmt = db.prepare(query);
  return stmt.all(...params) as DocumentRow[];
}

export function updateDocumentStatus(id: string, status: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE documents SET status = ?, updated_at = datetime('now') WHERE id = ?
  `);
  stmt.run(status, id);
}

export function updateDocumentCategory(id: string, year: string, semester: string, moduleNumber: string, topic: string): void {
  const db = getDb();
  const normalizedModule = slugify(moduleNumber);
  const normalizedTopic = slugify(topic);
  const stmt = db.prepare(`
    UPDATE documents SET year = ?, semester = ?, module_number = ?, topic = ?, updated_at = datetime('now') WHERE id = ?
  `);
  stmt.run(year, semester, normalizedModule, normalizedTopic, id);
}

export function insertPage(page: {
  id: string;
  document_id: string;
  page_number: number;
  title: string;
  content: string;
  raw_text: string;
  worksheet_data: string | null;
}): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO pages (id, document_id, page_number, title, content, raw_text, worksheet_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(page.id, page.document_id, page.page_number, page.title, page.content, page.raw_text, page.worksheet_data);
}

export function getPagesByDocument(documentId: string): PageRow[] {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT * FROM pages WHERE document_id = ? ORDER BY page_number'
  );
  return stmt.all(documentId) as PageRow[];
}

export function getPage(id: string): PageRow | undefined {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM pages WHERE id = ?');
  return stmt.get(id) as PageRow | undefined;
}

export function updatePageContent(id: string, content: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE pages SET content = ?, updated_at = datetime('now') WHERE id = ?
  `);
  stmt.run(content, id);
}

export function updatePageTitle(id: string, title: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE pages SET title = ?, updated_at = datetime('now') WHERE id = ?
  `);
  stmt.run(title, id);
}

export function updatePageWorksheetData(id: string, worksheetData: string | null): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE pages SET worksheet_data = ?, updated_at = datetime('now') WHERE id = ?
  `);
  stmt.run(worksheetData, id);
}

export async function deleteDocument(id: string): Promise<void> {
  const db = getDb();
  db.prepare('DELETE FROM pages WHERE document_id = ?').run(id);
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);

  try {
    const files = await fs.readdir(UPLOAD_DIR);
    for (const f of files) {
      if (f.startsWith(id)) {
        await fs.unlink(path.join(UPLOAD_DIR, f));
      }
    }
  } catch {}
}