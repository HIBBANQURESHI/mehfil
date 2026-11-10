import { NextRequest } from 'next/server';

/** CSRF defence alongside SameSite cookies: state changes must come from our own pages. */
export function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try { return new URL(origin).host === host; } catch { return false; }
}

/** The last X-Forwarded-For entry is the one our own reverse proxy added; earlier ones can be forged by the client. */
export const clientIp = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ?? '';
