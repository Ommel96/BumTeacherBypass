export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { readFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import getDb from '@/lib/db';

// Download a consistent snapshot of the entire database (documents, worksheets,
// compendium, Lernziele, exams, attempts, settings — everything except the
// original uploaded files).
export async function GET() {
  const tmpPath = path.join(os.tmpdir(), `btb-backup-${uuidv4()}.db`);
  try {
    const db = getDb();
    await db.backup(tmpPath); // proper SQLite online backup — safe while running
    const buffer = await readFile(tmpPath);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="bumteacherbypass-backup-${date}.db"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('Backup error:', error);
    return NextResponse.json({ error: 'Backup fehlgeschlagen' }, { status: 500 });
  } finally {
    unlink(tmpPath).catch(() => {});
  }
}
