export const ACCESS_COOKIE = 'mf_at';
export const REFRESH_COOKIE = 'mf_rt';
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const secure = process.env.NODE_ENV === 'production';

// HttpOnly: page scripts can never read these tokens, so an XSS bug can't steal a session.
const base = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };

interface CookieWriter { set(name: string, value: string, options: object): unknown }

export function setSessionCookies(jar: CookieWriter, tokens: { accessToken: string; refreshToken?: string }) {
  jar.set(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: 15 * 60 });
  if (tokens.refreshToken) jar.set(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: 30 * 86400 });
}

export function clearSessionCookies(jar: CookieWriter) {
  jar.set(ACCESS_COOKIE, '', { ...base, maxAge: 0 });
  jar.set(REFRESH_COOKIE, '', { ...base, maxAge: 0 });
}

/** Only same-site paths, so a crafted ?next= can't send someone to another website after login. */
export function safeNext(next: string | null | undefined, fallback = '/account') {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback;
}
