import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';

// ── Data directory ──
// Use /app/data (Docker volume mount). The entrypoint chowns it to the nextjs user.
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'worksheets.db');

// Export so other modules (document-store, tool-gaps-store) use the same path
export { DATA_DIR };

// ── Clean up stale WAL/SHM files ──
// If the database was previously opened in WAL mode, stale -wal and -shm files
// may remain. These cause SQLITE_IOERR_SHMSIZE on Docker volumes that don't
// support mmap. Delete them before opening so SQLite starts clean.
try {
  const shmPath = DB_PATH + '-shm';
  const walPath = DB_PATH + '-wal';
  if (fs.existsSync(shmPath)) {
    fs.unlinkSync(shmPath);
    console.log('SQLite: deleted stale -shm file');
  }
  if (fs.existsSync(walPath)) {
    fs.unlinkSync(walPath);
    console.log('SQLite: deleted stale -wal file');
  }
} catch (e) {
  console.warn('SQLite: could not clean up stale WAL/SHM files:', e instanceof Error ? e.message : e);
}

const globalForDb = globalThis as unknown as {
  _db: Database.Database | undefined;
  _seeded: boolean | undefined;
  _migrated_providers: boolean | undefined;
};

function getOrCreateDb(): Database.Database {
  if (globalForDb._db) return globalForDb._db;

  const db = new Database(DB_PATH);
  // Use DELETE journal mode (not WAL) — WAL requires mmap/shared memory which
  // fails on many Docker volume filesystems with SQLITE_IOERR_SHMSIZE.
  // DELETE mode works everywhere; the performance difference is negligible
  // for this app's single-user workload.
  db.pragma('journal_mode = DELETE');
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
      interactive_examples TEXT NOT NULL DEFAULT '',
      source_doc_ids TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_compendium_module ON compendium(module_number, topic);

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      custom_models TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lernziele (
      id          TEXT PRIMARY KEY,
      module_number TEXT NOT NULL,
      goal        TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'manual',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_lernziele_module ON lernziele(module_number);

    CREATE TABLE IF NOT EXISTS exams (
      id          TEXT PRIMARY KEY,
      module_number TEXT NOT NULL,
      title       TEXT NOT NULL DEFAULT '',
      goal_ids    TEXT NOT NULL DEFAULT '[]',
      goal_texts  TEXT NOT NULL DEFAULT '[]',
      exam_data   TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'ready',
      error       TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_exams_module ON exams(module_number);

    CREATE TABLE IF NOT EXISTS exam_attempts (
      id          TEXT PRIMARY KEY,
      exam_id     TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      answers     TEXT NOT NULL DEFAULT '{}',
      graded      TEXT NOT NULL DEFAULT '[]',
      score       REAL NOT NULL DEFAULT 0,
      max_score   REAL NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON exam_attempts(exam_id);

    CREATE TABLE IF NOT EXISTS page_versions (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      worksheet_data TEXT,
      content TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_page_versions_page ON page_versions(page_id, version);
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
  if (!docCols.includes('processing_step')) {
    db.exec("ALTER TABLE documents ADD COLUMN processing_step TEXT NOT NULL DEFAULT ''");
  }
  if (!docCols.includes('processing_timings')) {
    db.exec("ALTER TABLE documents ADD COLUMN processing_timings TEXT NOT NULL DEFAULT ''");
  }

  const pageInfo = db.prepare("PRAGMA table_info(pages)").all() as Array<{ name: string }>;
  const pageCols = pageInfo.map(c => c.name);
  if (!pageCols.includes('worksheet_data')) {
    db.exec("ALTER TABLE pages ADD COLUMN worksheet_data TEXT");
  }

  const examInfo = db.prepare("PRAGMA table_info(exams)").all() as Array<{ name: string }>;
  const examCols = examInfo.map(c => c.name);
  if (examCols.length > 0) {
    if (!examCols.includes('status')) db.exec("ALTER TABLE exams ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'");
    if (!examCols.includes('error')) db.exec("ALTER TABLE exams ADD COLUMN error TEXT NOT NULL DEFAULT ''");
    if (!examCols.includes('goal_texts')) db.exec("ALTER TABLE exams ADD COLUMN goal_texts TEXT NOT NULL DEFAULT '[]'");
  }

  // Exams stuck in "generating" from a previous server run
  if (!globalForDb._seeded) {
    try {
      const stuck = db.prepare("UPDATE exams SET status = 'error', error = 'Generierung wurde unterbrochen (Neustart)' WHERE status = 'generating'").run();
      if (stuck.changes > 0) console.log(`Recovery: reset ${stuck.changes} stuck exam generation(s)`);
    } catch {}
  }

  const compendiumInfo = db.prepare("PRAGMA table_info(compendium)").all() as Array<{ name: string }>;
  const compendiumCols = compendiumInfo.map(c => c.name);
  if (!compendiumCols.includes('interactive_examples')) {
    db.exec("ALTER TABLE compendium ADD COLUMN interactive_examples TEXT NOT NULL DEFAULT ''");
  }

  if (!globalForDb._migrated_providers) {
    const settingsRows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const settingsMap: Record<string, string> = {};
    for (const row of settingsRows) {
      settingsMap[row.key] = row.value;
    }

    if (settingsMap.provider && !settingsMap.defaultProviderId) {
      const providerId = crypto.randomUUID();
      const providerType = settingsMap.provider || 'openai';
      const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; models: string[] }> = {
        openai: { baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini'] },
        anthropic: { baseUrl: 'https://api.anthropic.com/v1', models: ['claude-sonnet-4-20250514'] },
        ollama: { baseUrl: 'http://localhost:11434', models: ['llama3.2'] },
        'ollama-cloud': { baseUrl: 'https://ollama.com', models: ['glm-5.1'] },
        'openai-compatible': { baseUrl: 'http://localhost:8080/v1', models: [] },
      };
      const defaults = PROVIDER_DEFAULTS[providerType] || PROVIDER_DEFAULTS.openai;
      try {
        const insertProvider = db.prepare(`
          INSERT INTO providers (id, name, type, api_key, base_url, model, custom_models)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const providerNames: Record<string, string> = {
          openai: 'OpenAI',
          anthropic: 'Anthropic',
          ollama: 'Ollama (Lokal)',
          'ollama-cloud': 'Ollama Cloud',
          'openai-compatible': 'OpenAI-Compatible',
        };
        insertProvider.run(
          providerId,
          providerNames[providerType] || providerType,
          providerType,
          settingsMap.apiKey || '',
          settingsMap.baseUrl || defaults.baseUrl,
          settingsMap.model || defaults.models[0] || '',
          settingsMap.customModels || ''
        );
        const upsertSetting = db.prepare(`
          INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);
        upsertSetting.run('defaultProviderId', providerId);
      } catch (e) {
        console.error('Migration: failed to create provider from settings', e);
      }
    }
    globalForDb._migrated_providers = true;
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

  // Recover orphaned documents: any document stuck in "processing" status
  // from a previous server run (e.g. container restart) should be reset so
  // the user can re-upload or the document is shown as errored.
  if (!globalForDb._seeded) {
    const orphaned = db.prepare("UPDATE documents SET status = 'error', processing_step = 'error' WHERE status = 'processing'").run();
    if (orphaned.changes > 0) {
      console.log(`Recovery: reset ${orphaned.changes} orphaned document(s) from 'processing' to 'error'`);
    }
    // The preinstalled seed worksheets were removed from the app — clean up any
    // rows left behind by earlier versions (pages cascade via FK).
    try {
      const removedSeeds = db.prepare("DELETE FROM documents WHERE id LIKE 'seed-%'").run();
      db.prepare("DELETE FROM worksheet_data WHERE worksheet LIKE 'seed-%'").run();
      if (removedSeeds.changes > 0) {
        console.log(`Cleanup: removed ${removedSeeds.changes} preinstalled seed worksheet(s)`);
      }
    } catch (e) {
      console.warn('Cleanup of seed worksheets failed:', e);
    }
    globalForDb._seeded = true;
  }

  return db;
}

export default getOrCreateDb;