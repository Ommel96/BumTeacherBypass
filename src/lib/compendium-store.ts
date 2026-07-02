import getDb from './db';
import { v4 as uuidv4 } from 'uuid';

export interface CompendiumEntry {
  id: string;
  module_number: string;
  topic: string;
  title: string;
  content: string;
  keywords: string;
  interactive_examples: string;
  source_doc_ids: string;
  created_at: string;
  updated_at: string;
}

export function getCompendiumEntry(id: string): CompendiumEntry | undefined {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM compendium
     WHERE id = ? OR keywords LIKE ? OR topic = ? OR title LIKE ?
     LIMIT 1`
  ).get(id, `%${id}%`, id, `%${id}%`) as CompendiumEntry | undefined;
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

  // Helper: merge two content strings, avoiding duplicate ### headings
  const mergeContent = (existing: string, newContent: string): string => {
    if (!existing) return newContent;
    if (!newContent) return existing;
    // Extract existing ### headings to avoid duplicating
    const existingHeadings = new Set(
      existing.match(/^###\s+.+$/gm)?.map(h => h.trim().toLowerCase()) || []
    );
    const newHeadings = newContent.match(/^###\s+.+$/gm) || [];
    // If all new headings already exist, only append content without headings
    const allDupes = newHeadings.length > 0 && newHeadings.every(h => existingHeadings.has(h.trim().toLowerCase()));
    if (allDupes) {
      // Content is already covered — skip
      return existing;
    }
    return existing + '\n\n' + newContent;
  };

  // Helper: merge interactive_examples JSON arrays
  const mergeExamples = (existing: string, newExamples: string): string => {
    let existingArr: unknown[] = [];
    let newArr: unknown[] = [];
    try { existingArr = JSON.parse(existing || '[]'); } catch {}
    try { newArr = JSON.parse(newExamples || '[]'); } catch {}
    if (newArr.length === 0) return existing || '[]';
    if (existingArr.length === 0) return newExamples || '[]';
    return JSON.stringify([...existingArr, ...newArr]);
  };

  // Helper: merge keywords (union, dedup)
  const mergeKeywords = (existing: string, newKw: string): string => {
    const existingKw = existing.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const newKeywords = newKw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    return Array.from(new Set([...existingKw, ...newKeywords])).join(',');
  };

  // Helper: merge source_doc_ids (union, dedup)
  const mergeSourceDocIds = (existing: string, newIds: string): string => {
    const existingIds = existing.split(',').filter(Boolean);
    const newIdList = newIds.split(',').filter(Boolean);
    return Array.from(new Set([...existingIds, ...newIdList])).join(',');
  };

  // 1. Exact title match — merge content, keywords, examples, source_doc_ids
  const existing = db.prepare('SELECT id, content, keywords, interactive_examples, source_doc_ids FROM compendium WHERE module_number = ? AND topic = ? AND title = ?').get(entry.module_number, entry.topic, entry.title) as { id: string; content: string; keywords: string; interactive_examples: string; source_doc_ids: string } | undefined;

  if (existing) {
    db.prepare('UPDATE compendium SET content = ?, keywords = ?, interactive_examples = ?, source_doc_ids = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      mergeContent(existing.content, entry.content),
      mergeKeywords(existing.keywords, entry.keywords),
      mergeExamples(existing.interactive_examples, entry.interactive_examples || ''),
      mergeSourceDocIds(existing.source_doc_ids, entry.source_doc_ids),
      existing.id,
    );
    return existing.id;
  }

  // 2. Similar keywords match — merge into the closest existing entry
  const similar = db.prepare('SELECT id, content, keywords, interactive_examples, source_doc_ids FROM compendium WHERE module_number = ? AND topic = ?').all(entry.module_number, entry.topic) as Array<{ id: string; content: string; keywords: string; interactive_examples: string; source_doc_ids: string }>;
  for (const s of similar) {
    const existingKeywords = s.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const newKeywords = entry.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const overlap = newKeywords.filter(k => existingKeywords.includes(k));
    if (overlap.length >= 2 || (newKeywords.length > 0 && overlap.length === newKeywords.length)) {
      db.prepare('UPDATE compendium SET content = ?, keywords = ?, interactive_examples = ?, source_doc_ids = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
        mergeContent(s.content, entry.content),
        mergeKeywords(s.keywords, entry.keywords),
        mergeExamples(s.interactive_examples, entry.interactive_examples || ''),
        mergeSourceDocIds(s.source_doc_ids, entry.source_doc_ids),
        s.id,
      );
      return s.id;
    }
  }

  // 3. New entry
  const id = entry.id || uuidv4();
  db.prepare('INSERT INTO compendium (id, module_number, topic, title, content, keywords, interactive_examples, source_doc_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, entry.module_number, entry.topic, entry.title, entry.content, entry.keywords, entry.interactive_examples || '', entry.source_doc_ids);
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