export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import getDb, { closeDb, DATA_DIR } from '@/lib/db';

// Replace the database with an uploaded backup. The current connection is
// closed, the file swapped, and the next access reopens + re-migrates it.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Keine Datei erhalten' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    // SQLite files start with "SQLite format 3" followed by a NUL byte
    if (buffer.length < 100 || !buffer.subarray(0, 15).toString('utf-8').startsWith('SQLite format 3')) {
      return NextResponse.json({ error: 'Das ist keine gültige Backup-Datei (SQLite erwartet).' }, { status: 400 });
    }

    closeDb();
    await writeFile(path.join(DATA_DIR, 'worksheets.db'), buffer);
    // Reopen immediately so migrations run and errors surface here, not later
    getDb();
    console.log(`Backup restored (${(buffer.length / 1024).toFixed(0)} KB)`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Restore error:', error);
    return NextResponse.json({ error: 'Wiederherstellung fehlgeschlagen' }, { status: 500 });
  }
}
