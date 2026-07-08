import { v4 as uuidv4 } from 'uuid';
import getDb from './db';

export interface Lernziel {
  id: string;
  module_number: string;
  goal: string;
  source: string;
  created_at: string;
}

export function listLernziele(moduleNumber?: string): Lernziel[] {
  const db = getDb();
  if (moduleNumber) {
    return db.prepare('SELECT * FROM lernziele WHERE module_number = ? ORDER BY created_at ASC').all(moduleNumber) as Lernziel[];
  }
  return db.prepare('SELECT * FROM lernziele ORDER BY module_number, created_at ASC').all() as Lernziel[];
}

export function getLernziele(ids: string[]): Lernziel[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM lernziele WHERE id IN (${placeholders})`).all(...ids) as Lernziel[];
}

export function addLernziele(moduleNumber: string, goals: string[], source: string = 'manual'): Lernziel[] {
  const db = getDb();
  const insert = db.prepare('INSERT INTO lernziele (id, module_number, goal, source) VALUES (?, ?, ?, ?)');
  // Skip duplicates (same module + same normalized text)
  const existing = new Set(
    listLernziele(moduleNumber).map(l => l.goal.trim().toLowerCase())
  );
  const added: Lernziel[] = [];
  for (const raw of goals) {
    const goal = raw.trim();
    if (!goal || existing.has(goal.toLowerCase())) continue;
    const id = uuidv4();
    insert.run(id, moduleNumber, goal, source);
    existing.add(goal.toLowerCase());
    added.push({ id, module_number: moduleNumber, goal, source, created_at: new Date().toISOString() });
  }
  return added;
}

export function updateLernziel(id: string, goal: string): void {
  getDb().prepare('UPDATE lernziele SET goal = ? WHERE id = ?').run(goal.trim(), id);
}

export function deleteLernziel(id: string): void {
  getDb().prepare('DELETE FROM lernziele WHERE id = ?').run(id);
}

/** Modules that have at least one Lernziel (for the exam-creation picker). */
export function listModulesWithLernziele(): Array<{ module_number: string; count: number }> {
  return getDb().prepare(
    'SELECT module_number, COUNT(*) as count FROM lernziele GROUP BY module_number ORDER BY module_number'
  ).all() as Array<{ module_number: string; count: number }>;
}
