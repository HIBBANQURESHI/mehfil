import { router } from 'expo-router';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearTokens, loadTokens, saveTokens, setSignedOutHandler, Tokens } from './api';
import { registerPush, unregisterPush } from './push';

export interface User { id: string; name: string; phone: string | null; email: string | null }
interface Auth { ready: boolean; user: User | null; signIn: (t: Tokens) => Promise<void>; signOut: () => Promise<void>; reload: () => Promise<void>; requireAuth: (next: string) => boolean }
const Ctx = createContext<Auth>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const reload = useCallback(async () => {
    try { setUser(await api<User>('/auth/me')); } catch (e: any) { if (e.status === 401) setUser(null); }
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => setUser(null));
    (async () => { if (await loadTokens()) await reload(); setReady(true); })();
  }, [reload]);

  const signIn = useCallback(async (t: Tokens) => { await saveTokens(t); await reload(); registerPush().catch(() => undefined); }, [reload]);
  const signOut = useCallback(async () => {
    await unregisterPush().catch(() => undefined);
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    await clearTokens();
    setUser(null);
  }, []);
  // Browsing is open to guests. An account is only needed once they act on something.
  const requireAuth = useCallback((next: string) => { if (user) return true; router.push({ pathname: '/login', params: { next } }); return false; }, [user]);

  const value = useMemo(() => ({ ready, user, signIn, signOut, reload, requireAuth }), [ready, user, signIn, signOut, reload, requireAuth]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
