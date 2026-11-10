import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, API_URL, clearSessionCookies, setSessionCookies } from '@/lib/session';
import { clientIp, isSameOrigin } from '@/lib/origin';

const ROUTES: Record<string, string> = { login: 'auth/login', verify: 'auth/verify-phone', 'admin-login': 'auth/admin/login', 'admin-enroll': 'auth/admin/enroll' };

/** Exchanges credentials for tokens and puts them in HttpOnly cookies. The tokens never reach browser JavaScript. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const { action } = await ctx.params;
  const forwarded = { 'x-forwarded-for': clientIp(req), 'user-agent': req.headers.get('user-agent') ?? '' };

  if (action === 'logout') {
    const token = req.cookies.get(ACCESS_COOKIE)?.value;
    if (token) await fetch(`${API_URL}/v1/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    const res = NextResponse.json({ ok: true });
    clearSessionCookies(res.cookies);
    return res;
  }

  const target = ROUTES[action];
  if (!target) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const upstream = await fetch(`${API_URL}/v1/${target}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...forwarded }, body: await req.text() });
  const body = await upstream.json();
  if (upstream.ok && body.accessToken) {
    const { accessToken, refreshToken, ...rest } = body;
    const res = NextResponse.json({ ...rest, ok: true });
    setSessionCookies(res.cookies, { accessToken, refreshToken });
    return res;
  }
  return NextResponse.json(body, { status: upstream.status });
}
