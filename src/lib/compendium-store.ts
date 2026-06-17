import getDb from './db';
import { v4 as uuidv4 } from 'uuid';

export interface CompendiumEntry {
  id: string;
  module_number: string;
  topic: string;
  title: string;
  content: string;
  keywords: string;
  source_doc_ids: string;
  created_at: string;
  updated_at: string;
}

export function getCompendiumEntry(id: string): CompendiumEntry | undefined {
  const db = getDb();
  let entry = db.prepare('SELECT * FROM compendium WHERE id = ?').get(id) as CompendiumEntry | undefined;
  if (!entry) {
    entry = db.prepare('SELECT * FROM compendium WHERE keywords LIKE ? LIMIT 1').get(`%${id}%`) as CompendiumEntry | undefined;
  }
  if (!entry) {
    entry = db.prepare('SELECT * FROM compendium WHERE topic = ? LIMIT 1').get(id) as CompendiumEntry | undefined;
  }
  if (!entry) {
    entry = db.prepare('SELECT * FROM compendium WHERE title LIKE ? LIMIT 1').get(`%${id}%`) as CompendiumEntry | undefined;
  }
  return entry;
}

export function listCompendiumEntries(moduleNumber?: string, topic?: string): CompendiumEntry[] {
  const db = getDb();
  if (!moduleNumber && !topic) {
    return db.prepare('SELECT * FROM compendium ORDER BY module_number, topic, title').all() as CompendiumEntry[];
  }
  const conditions: string[] = [];
  const params: string[] = [];
  if (moduleNumber) { conditions.push('module_number = ?'); params.push(moduleNumber); }
  if (topic) { conditions.push('LOWER(topic) = ?'); params.push(topic.toLowerCase()); }
  return db.prepare(`SELECT * FROM compendium WHERE ${conditions.join(' AND ')} ORDER BY title`).all(...params) as CompendiumEntry[];
}

export function searchCompendium(query: string): CompendiumEntry[] {
  const db = getDb();
  const like = `%${query}%`;
  return db.prepare(
    'SELECT * FROM compendium WHERE title LIKE ? OR content LIKE ? OR keywords LIKE ? ORDER BY module_number, topic LIMIT 20'
  ).all(like, like, like) as CompendiumEntry[];
}

export function findCompendiumByKeywords(keywords: string[]): CompendiumEntry[] {
  const db = getDb();
  if (keywords.length === 0) return [];
  const conditions = keywords.map(() => 'keywords LIKE ?').join(' OR ');
  const params = keywords.map(k => `%${k}%`);
  return db.prepare(
    `SELECT * FROM compendium WHERE ${conditions} ORDER BY module_number, topic LIMIT 10`
  ).all(...params) as CompendiumEntry[];
}

export function upsertCompendiumEntry(entry: Omit<CompendiumEntry, 'created_at' | 'updated_at'>): string {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM compendium WHERE module_number = ? AND topic = ? AND title = ?').get(entry.module_number, entry.topic, entry.title) as { id: string } | undefined;

  if (existing) {
    db.prepare('UPDATE compendium SET content = ?, keywords = ?, source_doc_ids = ?, updated_at = datetime(\'now\') WHERE id = ?').run(entry.content, entry.keywords, entry.source_doc_ids, existing.id);
    return existing.id;
  }

  const similar = db.prepare('SELECT id, content, keywords, source_doc_ids FROM compendium WHERE module_number = ? AND topic = ?').all(entry.module_number, entry.topic) as Array<{ id: string; content: string; keywords: string; source_doc_ids: string }>;
  for (const s of similar) {
    const existingKeywords = s.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const newKeywords = entry.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const overlap = newKeywords.filter(k => existingKeywords.includes(k));
    if (overlap.length >= 2 || (newKeywords.length > 0 && overlap.length === newKeywords.length)) {
      const mergedContent = s.content + '\n\n### ' + entry.title + '\n' + entry.content;
      const mergedKeywords = Array.from(new Set([...existingKeywords, ...newKeywords])).join(',');
      const mergedSourceDocIds = [s.source_doc_ids, entry.source_doc_ids].filter(Boolean).join(',');
      db.prepare('UPDATE compendium SET content = ?, keywords = ?, source_doc_ids = ?, updated_at = datetime(\'now\') WHERE id = ?').run(mergedContent, mergedKeywords, mergedSourceDocIds, s.id);
      return s.id;
    }
  }

  const id = entry.id || uuidv4();
  db.prepare('INSERT INTO compendium (id, module_number, topic, title, content, keywords, source_doc_ids) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, entry.module_number, entry.topic, entry.title, entry.content, entry.keywords, entry.source_doc_ids);
  return id;
}

export function deleteCompendiumEntry(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM compendium WHERE id = ?').run(id);
}

export function findCompendiumRefs(keywords: string[]): Array<{ id: string; title: string }> {
  const entries = findCompendiumByKeywords(keywords);
  return entries.map(e => ({ id: e.id, title: e.title }));
}