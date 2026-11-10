'use client';
import useSWR, { SWRConfiguration } from 'swr';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public fields?: Record<string, string>, public data?: Record<string, unknown>) { super(message); }
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message ?? 'Something went wrong. Please try again.', res.status, data.code, data.fields, data);
  return data as T;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET');
  const res = await fetch(`/api/proxy/v1${path}`, { method, headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
  if (res.status === 401 && typeof window !== 'undefined') {
    const login = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
    if (window.location.pathname !== login) window.location.href = `${login}?next=${encodeURIComponent(window.location.pathname)}`;
  }
  return parse<T>(res);
}

export async function session<T = any>(action: string, body?: unknown): Promise<T> {
  return parse<T>(await fetch(`/api/session/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }));
}

export function useApi<T = any>(path: string | null, config?: SWRConfiguration) {
  return useSWR<T>(path, (p: string) => api<T>(p), { revalidateOnFocus: true, ...config });
}

export interface Paged<T = any> { items: T[]; total: number; page: number; pageSize: number }
