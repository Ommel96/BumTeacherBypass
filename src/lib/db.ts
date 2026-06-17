import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { seedWorksheets } from './seed';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'worksheets.db');

const globalForDb = globalThis as unknown as {
  _db: Database.Database | undefined;
  _seeded: boolean | undefined;
};

function getOrCreateDb(): Database.Database {
  if (globalForDb._db) return globalForDb._db;

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS documents (
      id         TEXT PRIMARY KEY,
      filename   TEXT NOT NULL,
      mime_type  TEXT NOT NULL,
      size       INTEGER NOT NULL,
      status     TEXT NOT NULL DEFAULT 'uploaded',
      year       TEXT NOT NULL DEFAULT '',
      semester   TEXT NOT NULL DEFAULT '',
      module_number TEXT NOT NULL DEFAULT '',
      topic      TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pages (
      id          TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      title       TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL DEFAULT '',
      raw_text    TEXT NOT NULL DEFAULT '',
      worksheet_data TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pages_document ON pages(document_id);
    CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(year, semester, module_number, topic);

    CREATE TABLE IF NOT EXISTS worksheet_data (
      worksheet  TEXT NOT NULL,
      field_id   TEXT NOT NULL,
      value      TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (worksheet, field_id)
    );

    CREATE TABLE IF NOT EXISTS compendium (
      id          TEXT PRIMARY KEY,
      module_number TEXT NOT NULL DEFAULT '',
      topic       TEXT NOT NULL DEFAULT '',
      title       TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      keywords    TEXT NOT NULL DEFAULT '',
      source_doc_ids TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_compendium_module ON compendium(module_number, topic);
  `);

  const docInfo = db.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>;
  const docCols = docInfo.map(c => c.name);
  if (!docCols.includes('year')) {
    db.exec("ALTER TABLE documents ADD COLUMN year TEXT NOT NULL DEFAULT ''");
  }
  if (!docCols.includes('semester')) {
    db.exec("ALTER TABLE documents ADD COLUMN semester TEXT NOT NULL DEFAULT ''");
  }
  if (!docCols.includes('module_number')) {
    db.exec("ALTER TABLE documents ADD COLUMN module_number TEXT NOT NULL DEFAULT ''");
  }
  if (!docCols.includes('topic')) {
    db.exec("ALTER TABLE documents ADD COLUMN topic TEXT NOT NULL DEFAULT ''");
  }

  const pageInfo = db.prepare("PRAGMA table_info(pages)").all() as Array<{ name: string }>;
  const pageCols = pageInfo.map(c => c.name);
  if (!pageCols.includes('worksheet_data')) {
    db.exec("ALTER TABLE pages ADD COLUMN worksheet_data TEXT");
  }

  globalForDb._db = db;

  // Normalize existing topic/module_number to lowercase slug format
  try {
    db.exec(`
      UPDATE documents SET topic = LOWER(REPLACE(REPLACE(topic, ' ', '-'), ' ', '-'))
      WHERE topic != LOWER(topic) OR topic LIKE '% %'
    `);
    db.exec(`
      UPDATE documents SET module_number = LOWER(REPLACE(REPLACE(module_number, ' ', '-'), ' ', '-'))
      WHERE module_number != LOWER(module_number) OR module_number LIKE '% %'
    `);
  } catch {}

  if (!globalForDb._seeded) {
    globalForDb._seeded = true;
    seedWorksheets();
  }

  return db;
}

export default getOrCreateDb;