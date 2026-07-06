export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

// Tracks whether the intro tutorial has been shown on this install.
// Stored in the settings table so it is per-install (survives browser changes),
// matching "runs once on new installs".

export async function GET() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'tutorialSeen'").get() as { value: string } | undefined;
    return NextResponse.json({ seen: row?.value === 'true' });
  } catch (error) {
    console.error('Tutorial flag read error:', error);
    // Fail closed: if the DB is unavailable, don't block the app with a tutorial loop
    return NextResponse.json({ seen: true });
  }
}

export async function POST() {
  try {
    const db = getDb();
    db.prepare("INSERT INTO settings (key, value) VALUES ('tutorialSeen', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'").run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Tutorial flag write error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
