import { decodeJwt } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, API_URL, clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from '@/lib/session';

const loginFor = (path: string) => (path.startsWith('/admin') ? '/admin/login' : '/login');

function expiringSoon(token: string) {
  try { return (decodeJwt(token).exp ?? 0) * 1000 < Date.now() + 15_000; } catch { return true; }
}

/**
 * First gate for every private page: no session, no page. It also renews an expiring token, which server
 * components can't do. Which role may see what is decided by the layouts and, authoritatively, by the API.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === '/admin/login') return NextResponse.next();

  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const toLogin = () => {
    const url = new URL(loginFor(pathname), req.url);
    url.searchParams.set('next', pathname + search);
    const res = NextResponse.redirect(url);
    clearSessionCookies(res.cookies);
    return res;
  };

  if (access && !expiringSoon(access)) return NextResponse.next();
  if (!refresh) return toLogin();

  let r: Response;
  try {
    r = await fetch(`${API_URL}/v1/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) });
  } catch { return NextResponse.next(); }
  if (!r.ok) return toLogin();

  const tokens = (await r.json()) as { accessToken: string; refreshToken?: string };
  req.cookies.set(ACCESS_COOKIE, tokens.accessToken);
  const res = NextResponse.next({ request: { headers: new Headers({ ...Object.fromEntries(req.headers), cookie: req.cookies.toString() }) } });
  setSessionCookies(res.cookies, tokens);
  return res;
}

export const config = { matcher: ['/account/:path*', '/vendor/:path*', '/admin/:path*'] };
