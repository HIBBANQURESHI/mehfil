import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import useSWR, { mutate as mutateGlobal, SWRConfiguration } from 'swr';

const LOCAL = /\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/;
// On a phone, "localhost" is the phone itself. During development, point it at the computer Expo is serving
// the app from instead. Real https addresses are left untouched.
const devHost = Platform.OS === 'web' ? undefined : Constants.expoConfig?.hostUri?.split(':')[0];
export const toDevice = (url: string) => (devHost ? url.replace(LOCAL, `//${devHost}`) : url);

export const API_URL = toDevice(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000');
export const SITE_URL = toDevice(process.env.EXPO_PUBLIC_SITE_URL ?? 'http://localhost:3000');

const ACCESS = 'mf_access', REFRESH = 'mf_refresh';

// SecureStore is the phone's encrypted keychain. The web fallback exists only for browser previews.
const store = {
  get: (k: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.getItem(k) ?? null) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.setItem(k, v)) : SecureStore.setItemAsync(k, v)),
  del: (k: string) => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.removeItem(k)) : SecureStore.deleteItemAsync(k)),
};

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public fields?: Record<string, string>, public data?: Record<string, unknown>) { super(message); }
}

export interface Tokens { accessToken: string; refreshToken?: string }
let access: string | null = null;
let onSignedOut: (() => void) | null = null;
export const setSignedOutHandler = (fn: () => void) => { onSignedOut = fn; };

export async function loadTokens() { access = await store.get(ACCESS); return !!(access || (await store.get(REFRESH))); }
export async function saveTokens(t: Tokens) { access = t.accessToken; await store.set(ACCESS, t.accessToken); if (t.refreshToken) await store.set(REFRESH, t.refreshToken); }
export async function clearTokens() { access = null; await store.del(ACCESS); await store.del(REFRESH); }

// One refresh at a time: refresh tokens rotate, so parallel 401s must share the same renewal.
let refreshing: Promise<boolean> | null = null;
function refresh() {
  refreshing ??= (async () => {
    try {
      const refreshToken = await store.get(REFRESH);
      if (!refreshToken) return false;
      const res = await fetch(`${API_URL}/v1/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
      if (res.status === 401) { await clearTokens(); onSignedOut?.(); return false; }
      if (!res.ok) return false;
      await saveTokens(await res.json());
      return true;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const send = () => fetch(`${API_URL}/v1${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(access ? { Authorization: `Bearer ${access}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let res: Response;
  try { res = await send(); } catch { throw new ApiError('No internet connection. Please try again.', 0, 'NETWORK'); }
  if (res.status === 401 && !path.startsWith('/auth/login') && (await refresh())) res = await send();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message ?? 'Something went wrong. Please try again.', res.status, data.code, data.fields, data);
  return data as T;
}

/** Re-fetches every cached notification list and count, so the bell badge updates wherever it is shown. */
export function refreshNotifications() {
  return mutateGlobal((key) => typeof key === 'string' && key.startsWith('/notifications'));
}

export function useApi<T = any>(path: string | null, config?: SWRConfiguration) {
  return useSWR<T>(path, (p: string) => api<T>(p), config);
}

export interface Paged<T = any> { items: T[]; total: number; page: number; pageSize: number }

/** Notification links are written for the website; this maps them onto app screens. */
export function linkToRoute(link?: string | null): string | null {
  if (!link) return null;
  const m = link.match(/^\/account\/(bookings|quotations|enquiries|messages|support)\/([\w-]+)/);
  return m ? `/${m[1]}/${m[2]}` : link.startsWith('/account') ? '/notifications' : null;
}
