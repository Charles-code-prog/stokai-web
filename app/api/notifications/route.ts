import type { NextRequest } from 'next/server';
import { isSameOriginJson, userFromRequest } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { fail, handle, json } from '@/lib/server/http';
import { emailConfigured } from '@/lib/server/notify';

/** GET /api/notifications → últimas 50 notificações, quantas não lidas e a preferência de e-mail */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await userFromRequest(req);
    if (!user || !user.emailVerified) return fail('Sessão expirada. Entre de novo.', 401);
    const c = await db();
    const [list, unread, pref] = await c.batch([
      {
        sql: `SELECT id, kind, title, body, data, created_at, read_at FROM notifications
              WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
        args: [user.id],
      },
      { sql: 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', args: [user.id] },
      { sql: 'SELECT email_notifications FROM users WHERE id = ?', args: [user.id] },
    ], 'read');
    return json({
      items: list.rows.map(r => ({
        id: String(r.id),
        kind: String(r.kind),
        title: String(r.title),
        body: String(r.body),
        data: (() => { try { return JSON.parse(String(r.data)); } catch { return {}; } })(),
        createdAt: Number(r.created_at),
        read: r.read_at !== null,
      })),
      unread: Number(unread.rows[0].n),
      emailEnabled: Number(pref.rows[0]?.email_notifications ?? 1) !== 0,
      emailConfigured: emailConfigured(),
    });
  });
}

/** POST /api/notifications { op: readAll | emailPref, enabled? } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!isSameOriginJson(req)) return fail('Requisição inválida', 403);
    const user = await userFromRequest(req);
    if (!user || !user.emailVerified) return fail('Sessão expirada. Entre de novo.', 401);
    const b = await req.json().catch(() => ({}));
    const c = await db();
    if (b.op === 'readAll') {
      await c.execute({
        sql: 'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
        args: [Date.now(), user.id],
      });
      return json({ ok: true });
    }
    if (b.op === 'emailPref') {
      await c.execute({
        sql: 'UPDATE users SET email_notifications = ? WHERE id = ?',
        args: [b.enabled ? 1 : 0, user.id],
      });
      return json({ ok: true });
    }
    return fail('Operação inválida', 400);
  });
}
