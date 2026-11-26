'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PasswordInput } from '@/components/ui';
import { CodeInput, useCooldown } from '@/components/verify-email';

type Mode = 'entrar' | 'criar' | 'recuperar';

export default function LoginPage() {
  const router = useRouter();
  const { ready, user, signupAllowed, emailEnabled, error: authError, login, forgotPassword, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Recuperação: depois de pedir o código, mostra código + nova senha
  const [codeRequested, setCodeRequested] = useState(false);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useCooldown();

  useEffect(() => {
    if (ready && user) router.replace('/inicio');
  }, [ready, user, router]);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setInfo(null);
    setPassword('');
    setConfirm('');
    setCode('');
    setCodeRequested(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode !== 'entrar' && password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'recuperar') {
        await resetPassword(email.trim(), code, password);
      } else {
        await login(email.trim(), password, mode === 'criar');
      }
      router.replace('/inicio');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      setCodeRequested(true);
      setCooldown(60);
      setInfo(`Se houver uma conta com ${email.trim()}, enviamos um código de 6 dígitos para ela. Confira também a caixa de spam.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const emailField = (
    <label className="field">
      <span className="field-label">E-mail</span>
      <input
        className="input" type="email" autoComplete="email" required
        value={email} onChange={e => setEmail(e.target.value)}
        readOnly={mode === 'recuperar' && codeRequested}
      />
    </label>
  );

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">Stokai</div>
        <div className="auth-tagline">Vendas, gastos, estoque e encomendas do seu negócio.</div>

        {mode !== 'recuperar' && signupAllowed && (
          <div className="auth-tabs">
            <button className={mode === 'entrar' ? 'on' : ''} onClick={() => switchMode('entrar')}>Entrar</button>
            <button className={mode === 'criar' ? 'on' : ''} onClick={() => switchMode('criar')}>Criar conta</button>
          </div>
        )}

        {authError && <div className="auth-error" role="alert">{authError}</div>}

        {mode === 'recuperar' ? (
          <>
            <div className="auth-title">Criar nova senha</div>
            {!codeRequested ? (
              <form onSubmit={requestCode}>
                <p className="auth-text">Informe o e-mail da sua conta. Vamos enviar um código para você criar uma senha nova.</p>
                {emailField}
                {error && <div className="auth-error" role="alert">{error}</div>}
                <button className="confirm-btn" type="submit" disabled={busy}>
                  {busy ? 'Enviando…' : 'Enviar código'}
                </button>
              </form>
            ) : (
              <form onSubmit={submit}>
                {info && <div className="auth-info" role="status">{info}</div>}
                {emailField}
                <label className="field">
                  <span className="field-label">Código recebido</span>
                  <CodeInput value={code} onChange={setCode} autoFocus />
                </label>
                <label className="field">
                  <span className="field-label">Nova senha (mín. 6 caracteres)</span>
                  <PasswordInput required minLength={6} autoComplete="new-password" value={password} onChange={setPassword} />
                </label>
                <label className="field">
                  <span className="field-label">Repita a nova senha</span>
                  <PasswordInput required minLength={6} autoComplete="new-password" value={confirm} onChange={setConfirm} />
                </label>
                {error && <div className="auth-error" role="alert">{error}</div>}
                <button className="confirm-btn" type="submit" disabled={busy || code.length !== 6}>
                  {busy ? 'Salvando…' : 'Salvar nova senha e entrar'}
                </button>
                <div className="auth-links">
                  <button className="auth-link" type="button" onClick={() => void requestCode()} disabled={busy || cooldown > 0}>
                    {cooldown > 0 ? `Reenviar código (${cooldown} s)` : 'Reenviar código'}
                  </button>
                </div>
              </form>
            )}
            <div className="auth-links">
              <button className="auth-link muted" type="button" onClick={() => switchMode('entrar')}>Voltar para entrar</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            {emailField}
            <label className="field">
              <span className="field-label">Senha</span>
              <PasswordInput
                required minLength={6}
                autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
                value={password} onChange={setPassword}
              />
            </label>
            {mode === 'criar' && (
              <label className="field">
                <span className="field-label">Repita a senha</span>
                <PasswordInput
                  required minLength={6} autoComplete="new-password"
                  value={confirm} onChange={setConfirm}
                />
              </label>
            )}
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="confirm-btn" type="submit" disabled={busy}>
              {busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : 'Criar conta'}
            </button>
            {mode === 'entrar' && emailEnabled && (
              <div className="auth-links">
                <button className="auth-link" type="button" onClick={() => switchMode('recuperar')}>Esqueci minha senha</button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
