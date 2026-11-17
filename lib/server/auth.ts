import 'server-only';
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextRequest } from 'next/server';
import { db } from './db';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const SESSION_COOKIE = 'stokai_session';
export const SESSION_DAYS = 60;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export type SessionUser = { id: string; email: string };

// ─── Senhas ──────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Hash fixo para gastar o mesmo tempo quando o e-mail não existe (não revela quais e-mails têm conta). */
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

// ─── Validação ───────────────────────────────────────────────────────────────

export function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export function validPassword(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length >= 6 && raw.length <= 200;
}

// ─── Usuários e sessões ──────────────────────────────────────────────────────

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createUser(email: string, password: string): Promise<SessionUser | null> {
  const c = await db();
  const id = randomUUID();
  const r = await c.execute({
    sql: 'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO NOTHING',
    args: [id, email, await hashPassword(password), Date.now()],
  });
  return r.rowsAffected === 1 ? { id, email } : null;
}

export async function checkCredentials(email: string, password: string): Promise<SessionUser | null> {
  const c = await db();
  const r = await c.execute({ sql: 'SELECT id, email, password_hash FROM users WHERE email = ?', args: [email] });
  const row = r.rows[0];
  const ok = await verifyPassword(password, row ? String(row.password_hash) : DUMMY_HASH);
  return row && ok ? { id: String(row.id), email: String(row.email) } : null;
}

export async function setPassword(userId: string, password: string, keepTokenHash?: string) {
  const c = await db();
  await c.batch([
    { sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [await hashPassword(password), userId] },
    // Encerra as outras sessões (outros aparelhos) por segurança
    { sql: 'DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', args: [userId, keepTokenHash ?? ''] },
  ], 'write');
}

export async function passwordHashOf(userId: string): Promise<string | null> {
  const c = await db();
  const r = await c.execute({ sql: 'SELECT password_hash FROM users WHERE id = ?', args: [userId] });
  return r.rows[0] ? String(r.rows[0].password_hash) : null;
}

/** Cria uma sessão e devolve o token (vai no cookie; no banco fica só o hash). */
export async function createSession(userId: string): Promise<string> {
  const c = await db();
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  await c.batch([
    { sql: 'DELETE FROM sessions WHERE expires_at < ?', args: [now] },
    {
      sql: 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      args: [sha256(token), userId, now + SESSION_DAYS * 86_400_000],
    },
  ], 'write');
  return token;
}

export async function deleteSession(token: string) {
  const c = await db();
  await c.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [sha256(token)] });
}

export async function userFromRequest(req: NextRequest): Promise<(SessionUser & { tokenHash: string }) | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const c = await db();
  const tokenHash = sha256(token);
  const r = await c.execute({
    sql: `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > ?`,
    args: [tokenHash, Date.now()],
  });
  const row = r.rows[0];
  return row ? { id: String(row.id), email: String(row.email), tokenHash } : null;
}

export function sessionCookie(req: NextRequest, token: string, maxAgeSeconds = SESSION_DAYS * 86_400) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/**
 * Proteção contra requisições de outros sites (CSRF): mutações só aceitam JSON
 * e, quando o navegador informa a origem, ela precisa ser este próprio site.
 */
export function isSameOriginJson(req: NextRequest): boolean {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const signupAllowed = () => process.env.ALLOW_SIGNUP !== 'false';
