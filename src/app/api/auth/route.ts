export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.json({ ok: true }); // auth disabled

  const body = await request.json().catch(() => ({}));
  if (String(body?.password || '') !== password) {
    return NextResponse.json({ error: 'Falsches Passwort' }, { status: 401 });
  }
  const token = createHash('sha256').update(password).digest('hex');
  const res = NextResponse.json({ ok: true });
  res.cookies.set('btb_auth', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 90, // 90 days
  });
  return res;
}
