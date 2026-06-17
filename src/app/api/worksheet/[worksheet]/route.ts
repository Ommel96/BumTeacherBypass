export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

const MAX_WORKSHEET = 200;
const MAX_FIELD_ID = 100;
const MAX_VALUE = 10000;

function validateString(val: unknown, maxLen: number, label: string): string | null {
  if (typeof val !== 'string' || val.length === 0) {
    return `Missing ${label}`;
  }
  if (val.length > maxLen) {
    return `${label} too long (max ${maxLen})`;
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { worksheet: string } }
) {
  try {
    const worksheet = decodeURIComponent(params.worksheet);
    const err = validateString(worksheet, MAX_WORKSHEET, 'worksheet');
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const db = getDb();
    const stmt = db.prepare(
      'SELECT field_id, value FROM worksheet_data WHERE worksheet = ?'
    );
    const rows = stmt.all(worksheet) as { field_id: string; value: string }[];
    const fields: Record<string, string> = {};
    for (const row of rows) {
      fields[row.field_id] = row.value;
    }

    return NextResponse.json({ fields });
  } catch (error) {
    console.error('Get worksheet error:', error);
    return NextResponse.json({ error: 'Failed to get worksheet' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { worksheet: string } }
) {
  try {
    const worksheet = decodeURIComponent(params.worksheet);
    const err = validateString(worksheet, MAX_WORKSHEET, 'worksheet');
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const body = await request.json();
    const { fields } = body;

    if (!fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
    }

    const entries = Object.entries(fields as Record<string, string>);

    for (const [fid, fval] of entries) {
      const fErr = validateString(fid, MAX_FIELD_ID, 'field_id');
      if (fErr) return NextResponse.json({ error: fErr }, { status: 400 });
      if (typeof fval !== 'string') {
        return NextResponse.json({ error: `field value for "${fid}" must be string` }, { status: 400 });
      }
      if (fval.length > MAX_VALUE) {
        return NextResponse.json({ error: `field value for "${fid}" too long` }, { status: 400 });
      }
    }

    const db = getDb();
    const upsertStmt = db.prepare(`
      INSERT INTO worksheet_data (worksheet, field_id, value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(worksheet, field_id)
      DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);

    const upsertMany = db.transaction((items: [string, string][]) => {
      for (const [field_id, value] of items) {
        upsertStmt.run(worksheet, field_id, value || '');
      }
    });

    upsertMany(entries);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Save worksheet error:', error);
    return NextResponse.json({ error: 'Failed to save worksheet' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { worksheet: string } }
) {
  try {
    const worksheet = decodeURIComponent(params.worksheet);
    const err = validateString(worksheet, MAX_WORKSHEET, 'worksheet');
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const db = getDb();
    const stmt = db.prepare('DELETE FROM worksheet_data WHERE worksheet = ?');
    stmt.run(worksheet);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete worksheet error:', error);
    return NextResponse.json({ error: 'Failed to delete worksheet' }, { status: 500 });
  }
}