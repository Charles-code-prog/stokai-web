'use client';

import { useEffect, useState } from 'react';
import { IoMailUnreadOutline } from 'react-icons/io5';
import { useAuth } from '@/lib/auth';

/** Campo de código de 6 dígitos (aceita colar o código com espaços). */
export function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <input
      className="input code-input"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      placeholder="000000"
      aria-label="Código de 6 dígitos"
      autoFocus={autoFocus}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
    />
  );
}

/** Contagem regressiva para o botão "Reenviar código". */
export function useCooldown(): [number, (seconds: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return [left, setLeft];
}

/** Tela mostrada depois do cadastro até a pessoa digitar o código recebido por e-mail. */
export function VerifyEmailScreen() {
  const { user, verifyEmail, resendCode, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useCooldown();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await verifyEmail(code);
    } catch (err) {
      setError((err as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setInfo(null);
    try {
      await resendCode();
      setInfo('Enviamos um código novo. Confira também a caixa de spam.');
      setCooldown(60);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      const m = /Aguarde (\d+)/.exec(msg);
      if (m) setCooldown(Number(m[1]));
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">Stokai</div>
        <div className="verify-icon"><IoMailUnreadOutline size={34} /></div>
        <div className="auth-title">Confirme seu e-mail</div>
        <p className="auth-text">
          Enviamos um código de 6 dígitos para <strong>{user?.email}</strong>. Digite abaixo para liberar sua conta.
        </p>
        <form onSubmit={submit}>
          <CodeInput value={code} onChange={setCode} autoFocus />
          {error && <div className="auth-error" role="alert">{error}</div>}
          {info && <div className="auth-info" role="status">{info}</div>}
          <button className="confirm-btn" type="submit" disabled={busy || code.length !== 6}>
            {busy ? 'Confirmando…' : 'Confirmar e-mail'}
          </button>
        </form>
        <div className="auth-links">
          <button className="auth-link" type="button" onClick={resend} disabled={cooldown > 0}>
            {cooldown > 0 ? `Reenviar código (${cooldown} s)` : 'Reenviar código'}
          </button>
          <button className="auth-link muted" type="button" onClick={() => void signOut()}>
            Usar outro e-mail
          </button>
        </div>
      </div>
    </div>
  );
}
