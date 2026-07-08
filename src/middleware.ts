import { NextRequest, NextResponse } from 'next/server';

// Optional password protection: set APP_PASSWORD (e.g. in docker-compose) to
// require a login. Unset = open, exactly as before. The cookie holds a SHA-256
// of the password, so a changed password invalidates all sessions.

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  // Login page and its API stay reachable
  if (pathname === '/login' || pathname === '/api/auth') return NextResponse.next();

  const cookie = request.cookies.get('btb_auth')?.value;
  if (cookie && cookie === await sha256Hex(password)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
