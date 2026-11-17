'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

type Mode = 'entrar' | 'criar';

export default function LoginPage() {
  const router = useRouter();
  const { ready, user, signupAllowed, error: authError, login } = useAuth();
  const [mode, setMode] = useState<Mode>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) router.replace('/inicio');
  }, [ready, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'criar' && password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password, mode === 'criar');
      router.replace('/inicio');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">Stokai</div>
        <div className="auth-tagline">Vendas, gastos, estoque e encomendas do seu negócio.</div>

        {signupAllowed && (
          <div className="auth-tabs">
            <button className={mode === 'entrar' ? 'on' : ''} onClick={() => { setMode('entrar'); setError(null); }}>Entrar</button>
            <button className={mode === 'criar' ? 'on' : ''} onClick={() => { setMode('criar'); setError(null); }}>Criar conta</button>
          </div>
        )}

        {authError && <div className="auth-error" role="alert">{authError}</div>}

        <form onSubmit={submit}>
          <label className="field">
            <span className="field-label">E-mail</span>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Senha</span>
            <input
              className="input" type="password" required minLength={6}
              autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </label>
          {mode === 'criar' && (
            <label className="field">
              <span className="field-label">Repita a senha</span>
              <input
                className="input" type="password" required minLength={6} autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(e.target.value)}
              />
            </label>
          )}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="confirm-btn" type="submit" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  );
}
