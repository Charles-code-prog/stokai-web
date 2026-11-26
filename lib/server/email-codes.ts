import 'server-only';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { db } from './db';
import { sendCodeEmail } from './notify';

export type CodePurpose = 'verify' | 'reset';

export const CODE_MINUTES = 30;
const MAX_ATTEMPTS = 5;          // chutes por código; depois ele é apagado
const RESEND_SECONDS = 60;       // intervalo mínimo entre dois envios
const MAX_SENDS_PER_HOUR = 6;

const hashCode = (userId: string, purpose: CodePurpose, code: string) =>
  createHash('sha256').update(`${userId}:${purpose}:${code}`).digest('hex');

export type IssueResult =
  | { ok: true }
  | { ok: false; reason: 'wait'; seconds: number }
  | { ok: false; reason: 'limit' }
  | { ok: false; reason: 'send' };

/**
 * Gera um código novo (substitui o anterior) e envia por e-mail.
 * Respeita o intervalo entre envios e o limite por hora.
 */
export async function issueCode(userId: string, email: string, purpose: CodePurpose): Promise<IssueResult> {
  const c = await db();
  const now = Date.now();
  const [last, sends] = await c.batch([
    { sql: 'SELECT created_at FROM email_codes WHERE user_id = ? AND purpose = ?', args: [userId, purpose] },
    { sql: 'SELECT COUNT(*) AS n FROM email_sends WHERE user_id = ? AND at > ?', args: [userId, now - 3_600_000] },
  ], 'read');
  const lastAt = last.rows[0] ? Number(last.rows[0].created_at) : 0;
  const wait = Math.ceil((lastAt + RESEND_SECONDS * 1000 - now) / 1000);
  if (wait > 0) return { ok: false, reason: 'wait', seconds: wait };
  if (Number(sends.rows[0].n) >= MAX_SENDS_PER_HOUR) return { ok: false, reason: 'limit' };

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await c.batch([
    { sql: 'DELETE FROM email_sends WHERE at < ?', args: [now - 3_600_000] },
    { sql: 'INSERT INTO email_sends (user_id, at) VALUES (?, ?)', args: [userId, now] },
    {
      sql: `INSERT INTO email_codes (user_id, purpose, code_hash, expires_at, attempts, created_at)
            VALUES (?, ?, ?, ?, 0, ?)
            ON CONFLICT (user_id, purpose) DO UPDATE SET
              code_hash = excluded.code_hash, expires_at = excluded.expires_at,
              attempts = 0, created_at = excluded.created_at`,
      args: [userId, purpose, hashCode(userId, purpose, code), now + CODE_MINUTES * 60_000, now],
    },
  ], 'write');

  const sent = await sendCodeEmail(email, purpose, code, CODE_MINUTES);
  if (!sent) {
    // Não saiu: libera um novo pedido na hora
    await c.execute({ sql: 'DELETE FROM email_codes WHERE user_id = ? AND purpose = ?', args: [userId, purpose] });
    return { ok: false, reason: 'send' };
  }
  return { ok: true };
}

/** Há um código válido ainda não usado? (evita reenviar a cada login) */
export async function hasActiveCode(userId: string, purpose: CodePurpose): Promise<boolean> {
  const c = await db();
  const r = await c.execute({
    sql: 'SELECT 1 FROM email_codes WHERE user_id = ? AND purpose = ? AND expires_at > ? AND attempts < ?',
    args: [userId, purpose, Date.now(), MAX_ATTEMPTS],
  });
  return r.rows.length > 0;
}

export type CheckResult = 'ok' | 'wrong' | 'expired';

/** Confere o código. Certo → apaga (uso único). Errado → conta a tentativa. */
export async function checkCode(userId: string, purpose: CodePurpose, raw: unknown): Promise<CheckResult> {
  const code = String(raw ?? '').replace(/\D/g, '');
  const c = await db();
  const r = await c.execute({
    sql: 'SELECT code_hash, expires_at, attempts FROM email_codes WHERE user_id = ? AND purpose = ?',
    args: [userId, purpose],
  });
  const row = r.rows[0];
  if (!row || Number(row.expires_at) < Date.now() || Number(row.attempts) >= MAX_ATTEMPTS) return 'expired';

  const expected = Buffer.from(String(row.code_hash), 'hex');
  const actual = Buffer.from(hashCode(userId, purpose, code), 'hex');
  if (code.length === 6 && timingSafeEqual(expected, actual)) {
    await c.execute({ sql: 'DELETE FROM email_codes WHERE user_id = ? AND purpose = ?', args: [userId, purpose] });
    return 'ok';
  }
  await c.execute({
    sql: 'UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ? AND purpose = ?',
    args: [userId, purpose],
  });
  return Number(row.attempts) + 1 >= MAX_ATTEMPTS ? 'expired' : 'wrong';
}

export function issueErrorMessage(r: Exclude<IssueResult, { ok: true }>): { message: string; status: number } {
  if (r.reason === 'wait') return { message: `Aguarde ${r.seconds} s para pedir outro código.`, status: 429 };
  if (r.reason === 'limit') return { message: 'Muitos códigos pedidos. Tente de novo daqui a uma hora.', status: 429 };
  return { message: 'Não foi possível enviar o e-mail agora. Tente de novo em instantes.', status: 502 };
}
