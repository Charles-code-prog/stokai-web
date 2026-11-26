import 'server-only';
import type { NextRequest } from 'next/server';
import { db } from './db';
import { userFromRequest, type SessionUser } from './auth';

export type Membership = {
  orgId: string;
  orgName: string;
  role: 'owner' | 'member';
  status: 'pending' | 'approved';
};

export type Ctx = {
  user: SessionUser & { tokenHash: string };
  /** De quem são os dados que o usuário vê agora: id da empresa (se aprovado) ou o próprio id */
  scope: string;
  membership: Membership | null;
};

export async function membershipOf(userId: string): Promise<Membership | null> {
  const c = await db();
  const r = await c.execute({
    sql: `SELECT m.org_id, m.role, m.status, o.name FROM memberships m
          JOIN organizations o ON o.id = m.org_id WHERE m.user_id = ?`,
    args: [userId],
  });
  const row = r.rows[0];
  return row
    ? {
        orgId: String(row.org_id),
        orgName: String(row.name),
        role: row.role === 'owner' ? 'owner' : 'member',
        status: row.status === 'approved' ? 'approved' : 'pending',
      }
    : null;
}

/** Usuário logado + espaço de dados ativo, ou null se não estiver logado. */
export async function contextFromRequest(req: NextRequest): Promise<Ctx | null> {
  const user = await userFromRequest(req);
  // E-mail ainda não confirmado: nada de dados até confirmar
  if (!user || !user.emailVerified) return null;
  const membership = await membershipOf(user.id);
  const scope = membership?.status === 'approved' ? membership.orgId : user.id;
  return { user, scope, membership };
}
