import 'server-only';
import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import nodemailer, { type Transporter } from 'nodemailer';
import { db } from './db';

// ─── Notificações dentro do app ──────────────────────────────────────────────

export type NotificationKind =
  | 'join_request' | 'join_approved' | 'join_rejected' | 'member_left' | 'member_removed'
  | 'sale' | 'expense' | 'order';

export async function notify(
  userIds: string[],
  n: { kind: NotificationKind; title: string; body?: string; data?: Record<string, unknown> },
) {
  if (userIds.length === 0) return;
  const c = await db();
  const now = Date.now();
  await c.batch(
    userIds.map(uid => ({
      sql: `INSERT INTO notifications (id, user_id, kind, title, body, data, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), uid, n.kind, n.title, n.body ?? '', JSON.stringify(n.data ?? {}), now],
    })),
    'write',
  );
}

// ─── E-mail (Gmail com senha de app) ─────────────────────────────────────────

let transporter: Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  if (!user || !pass) return null;
  transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  return transporter;
}

export function emailConfigured(): boolean {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || !!process.env.MAIL_OUTBOX_FILE;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/**
 * Envia um e-mail (cópia oculta para todos os destinatários).
 * Nunca lança erro: falha de e-mail não pode quebrar o registro de uma venda.
 */
export async function sendEmail(to: string[], subject: string, lines: string[], appUrl: string) {
  const recipients = [...new Set(to.filter(Boolean))];
  if (recipients.length === 0) return;

  const text = [...lines, '', `Abrir o Stokai: ${appUrl}`, '', 'Para parar de receber, desligue em Conta → Notificações.'].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1A1D2E">
    <div style="font-size:20px;font-weight:800;color:#00B894;margin-bottom:12px">Stokai</div>
    ${lines.map(l => `<p style="margin:6px 0">${escapeHtml(l)}</p>`).join('')}
    <p style="margin:18px 0"><a href="${escapeHtml(appUrl)}" style="background:#00D4AA;color:#0F1117;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Abrir o Stokai</a></p>
    <p style="font-size:12px;color:#6B7280">Para parar de receber, desligue em Conta → Notificações.</p>
  </div>`;

  try {
    // Desenvolvimento/testes: grava os e-mails num arquivo em vez de enviar
    if (process.env.MAIL_OUTBOX_FILE) {
      await appendFile(process.env.MAIL_OUTBOX_FILE, JSON.stringify({ to: recipients, subject, text }) + '\n');
      return;
    }
    const t = getTransporter();
    if (!t) return; // e-mail não configurado: só notificação no app
    await t.sendMail({
      from: `"Stokai" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      bcc: recipients,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error('[stokai] falha ao enviar e-mail', err);
  }
}

// ─── Destinatários ───────────────────────────────────────────────────────────

/** Membros aprovados do espaço (empresa) ou o próprio usuário, com e-mail e preferência. */
export async function spaceMembers(scope: string): Promise<{ id: string; email: string; wantsEmail: boolean }[]> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT u.id, u.email, u.email_notifications FROM users u
          WHERE u.id IN (SELECT user_id FROM memberships WHERE org_id = ? AND status = 'approved')
             OR u.id = ?`,
    args: [scope, scope],
  });
  return r.rows.map(row => ({
    id: String(row.id),
    email: String(row.email),
    wantsEmail: Number(row.email_notifications) !== 0,
  }));
}

export async function displayName(userId: string, fallback: string): Promise<string> {
  const c = await db();
  const r = await c.execute({
    sql: "SELECT value FROM preferences WHERE user_id = ? AND key = 'user_name'",
    args: [userId],
  });
  const name = r.rows[0] ? String(r.rows[0].value).trim() : '';
  return name || fallback;
}
