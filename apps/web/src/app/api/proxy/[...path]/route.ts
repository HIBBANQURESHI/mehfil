import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, API_URL, clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from '@/lib/session';
import { clientIp, isSameOrigin } from '@/lib/origin';

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  if (path[0] !== 'v1' || path.includes('..')) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const mutating = req.method !== 'GET';
  if (mutating && !isSameOrigin(req)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const url = `${API_URL}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const body = mutating ? await req.arrayBuffer() : undefined;
  const headers: Record<string, string> = { 'x-forwarded-for': clientIp(req), 'user-agent': req.headers.get('user-agent') ?? '' };
  const type = req.headers.get('content-type');
  if (type) headers['content-type'] = type;
  const send = (token?: string) => fetch(url, { method: req.method, headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body, cache: 'no-store' });

  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  let upstream = await send(access);
  let renewed: { accessToken: string; refreshToken?: string } | null = null;
  let expired = false;

  if (upstream.status === 401 && refresh) {
    const r = await fetch(`${API_URL}/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) });
    if (r.ok) { renewed = await r.json(); upstream = await send(renewed!.accessToken); }
    else expired = true;
  }

  const res = new NextResponse(upstream.status === 204 ? null : upstream.body, { status: upstream.status });
  for (const h of ['content-type', 'content-disposition', 'cache-control']) { const v = upstream.headers.get(h); if (v) res.headers.set(h, v); }
  if (renewed) setSessionCookies(res.cookies, renewed);
  if (expired) clearSessionCookies(res.cookies);
  return res;
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
