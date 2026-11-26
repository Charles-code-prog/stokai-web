'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './backend';

export type AuthUser = { id: string; email: string; emailVerified: boolean };

interface AuthCtx {
  /** false até sabermos se há sessão */
  ready: boolean;
  user: AuthUser | null;
  signupAllowed: boolean;
  /** Envio de e-mail configurado no servidor (recuperar senha / confirmar cadastro) */
  emailEnabled: boolean;
  /** Erro ao falar com o servidor (ex.: banco não configurado) */
  error: string | null;
  login: (email: string, password: string, signup?: boolean) => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendCode: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

type Me = { user: AuthUser | null; signupAllowed: boolean; emailEnabled?: boolean };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [signupAllowed, setSignupAllowed] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((me: Me) => {
    setUser(prev => (prev?.id === me.user?.id && prev?.emailVerified === me.user?.emailVerified ? prev : me.user));
    setSignupAllowed(me.signupAllowed);
    setEmailEnabled(!!me.emailEnabled);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api<Me>('/api/auth/me'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReady(true);
    }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    api<Me>('/api/auth/me').then(
      me => { if (!cancelled) apply(me); },
      err => { if (!cancelled) setError((err as Error).message); },
    ).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [apply]);

  const login = useCallback(async (email: string, password: string, signup = false) => {
    const r = await api<{ user: AuthUser }>(`/api/auth/${signup ? 'signup' : 'login'}`, { email, password });
    setUser(r.user);
  }, []);

  const verifyEmail = useCallback(async (code: string) => {
    const r = await api<{ user: AuthUser }>('/api/auth/verify', { code });
    setUser(r.user);
  }, []);

  const resendCode = useCallback(async () => {
    await api('/api/auth/resend', {});
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await api('/api/auth/forgot', { email });
  }, []);

  const resetPassword = useCallback(async (email: string, code: string, password: string) => {
    const r = await api<{ user: AuthUser }>('/api/auth/reset', { email, code, password });
    setUser(r.user);
  }, []);

  const signOut = useCallback(async () => {
    try { await api('/api/auth/logout', {}); } catch {}
    setUser(null);
    router.replace('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{
      ready, user, signupAllowed, emailEnabled, error, login, verifyEmail, resendCode, forgotPassword, resetPassword, signOut, refresh,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
