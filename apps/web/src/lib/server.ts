import { cookies } from 'next/headers';
import { ACCESS_COOKIE, API_URL } from './session';

const internal: Record<string, string> = process.env.INTERNAL_API_KEY ? { 'x-internal-key': process.env.INTERNAL_API_KEY } : {};

export async function publicGet<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/v1${path}`, { headers: internal, next: { revalidate } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch { return null; }
}

export interface Me {
  id: string; name: string; phone: string | null; email: string | null; avatarUrl: string | null; cityId: string | null; adminSession: boolean;
  admin: { isSuper: boolean; permissions: string[]; role: string } | null;
  vendor: { id: string; businessName: string; status: string; slug: string; statusReason: string | null; role: string } | null;
}

export async function getMe(): Promise<Me | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/v1/auth/me`, { headers: { ...internal, Authorization: `Bearer ${token}` }, cache: 'no-store' });
    return res.ok ? ((await res.json()) as Me) : null;
  } catch { return null; }
}
