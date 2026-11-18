import 'server-only';
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { hashPassword, verifyPassword } from './auth';
import { BadRequest, ROW_TABLES } from './data';
import { membershipOf, type Ctx } from './context';
import { displayName, notify, sendEmail } from './notify';

const MAX_JOIN_FAILS_PER_HOUR = 10;

export function normalizeOrgName(raw: unknown): { name: string; key: string } {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60) throw new BadRequest('O nome da empresa precisa ter entre 2 e 60 caracteres.');
  return { name, key: name.toLocaleLowerCase('pt-BR') };
}

function checkKeyword(raw: unknown): string {
  const k = String(raw ?? '').trim();
  if (k.length < 4 || k.length > 100) throw new BadRequest('A palavra-chave precisa ter pelo menos 4 caracteres.');
  return k;
}

async function ownerOf(orgId: string): Promise<{ id: string; email: string } | null> {
  const c = await db();
  const r = await c.execute({
    sql: 'SELECT u.id, u.email FROM organizations o JOIN users u ON u.id = o.owner_id WHERE o.id = ?',
    args: [orgId],
  });
  return r.rows[0] ? { id: String(r.rows[0].id), email: String(r.rows[0].email) } : null;
}

// ─── Informações para a tela Conta ───────────────────────────────────────────

export async function orgInfo(ctx: Ctx) {
  const m = ctx.membership;
  if (!m) return { membership: null };
  if (m.status !== 'approved') return { membership: m };

  const c = await db();
  const r = await c.execute({
    sql: `SELECT u.id, u.email, m.role, m.status, m.created_at,
                 (SELECT value FROM preferences p WHERE p.user_id = u.id AND p.key = 'user_name') AS name
            FROM memberships m JOIN users u ON u.id = m.user_id
           WHERE m.org_id = ?
           ORDER BY m.status = 'pending' DESC, m.role = 'owner' DESC, m.created_at`,
    args: [m.orgId],
  });
  const people = r.rows.map(row => ({
    userId: String(row.id),
    email: String(row.email),
    name: row.name ? String(row.name) : '',
    role: String(row.role),
    status: String(row.status),
    since: Number(row.created_at),
  }));
  return {
    membership: m,
    members: people.filter(p => p.status === 'approved'),
    // só o dono vê (e decide) os pedidos pendentes
    pending: m.role === 'owner' ? people.filter(p => p.status === 'pending') : [],
  };
}

// ─── Criar ───────────────────────────────────────────────────────────────────

export async function createOrg(ctx: Ctx, rawName: unknown, rawKeyword: unknown, bringData: boolean) {
  if (ctx.membership) throw new BadRequest('Você já participa de uma empresa (ou tem um pedido pendente).');
  const { name, key } = normalizeOrgName(rawName);
  const keyword = checkKeyword(rawKeyword);
  const c = await db();

  const exists = await c.execute({ sql: 'SELECT 1 FROM organizations WHERE name_key = ?', args: [key] });
  if (exists.rows.length) throw new BadRequest('Já existe uma empresa com esse nome. Escolha outro.');

  const orgId = randomUUID();
  const now = Date.now();
  await c.batch([
    {
      sql: 'INSERT INTO organizations (id, name, name_key, keyword_hash, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [orgId, name, key, await hashPassword(keyword), ctx.user.id, now],
    },
    {
      sql: "INSERT INTO memberships (user_id, org_id, role, status, created_at) VALUES (?, ?, 'owner', 'approved', ?)",
      args: [ctx.user.id, orgId, now],
    },
    // Quem cria pode levar os próprios dados para a empresa
    ...(bringData
      ? ROW_TABLES.map(t => ({ sql: `UPDATE ${t} SET user_id = ? WHERE user_id = ?`, args: [orgId, ctx.user.id] }))
      : []),
  ], 'write');
  return { orgId, name };
}

// ─── Pedir para entrar ───────────────────────────────────────────────────────

export async function requestJoin(ctx: Ctx, rawName: unknown, rawKeyword: unknown, appUrl: string) {
  if (ctx.membership) throw new BadRequest('Você já participa de uma empresa (ou tem um pedido pendente).');
  const { key } = normalizeOrgName(rawName);
  const keyword = String(rawKeyword ?? '').trim();
  const c = await db();

  const hourAgo = Date.now() - 3_600_000;
  const fails = await c.execute({
    sql: 'SELECT COUNT(*) AS n FROM join_attempts WHERE user_id = ? AND at > ?',
    args: [ctx.user.id, hourAgo],
  });
  if (Number(fails.rows[0].n) >= MAX_JOIN_FAILS_PER_HOUR) {
    throw new BadRequest('Muitas tentativas. Espere uma hora e tente de novo.');
  }

  const r = await c.execute({
    sql: 'SELECT id, name, keyword_hash, owner_id FROM organizations WHERE name_key = ?',
    args: [key],
  });
  const org = r.rows[0];
  const ok = await verifyPassword(keyword, org ? String(org.keyword_hash) : 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64'));
  if (!org || !ok) {
    await c.batch([
      { sql: 'DELETE FROM join_attempts WHERE at < ?', args: [hourAgo] },
      { sql: 'INSERT INTO join_attempts (user_id, at) VALUES (?, ?)', args: [ctx.user.id, Date.now()] },
    ], 'write');
    throw new BadRequest('Nome da empresa ou palavra-chave incorretos.');
  }

  const orgId = String(org.id);
  const orgName = String(org.name);
  await c.execute({
    sql: "INSERT INTO memberships (user_id, org_id, role, status, created_at) VALUES (?, ?, 'member', 'pending', ?)",
    args: [ctx.user.id, orgId, Date.now()],
  });

  const owner = await ownerOf(orgId);
  if (owner) {
    const who = await displayName(ctx.user.id, ctx.user.email);
    await notify([owner.id], {
      kind: 'join_request',
      title: 'Pedido para entrar na empresa',
      body: `${who} (${ctx.user.email}) quer entrar em ${orgName}.`,
      data: { userId: ctx.user.id, email: ctx.user.email },
    });
    await sendEmail([owner.email], `Stokai: ${who} quer entrar em ${orgName}`, [
      `${who} (${ctx.user.email}) pediu para entrar na empresa ${orgName}.`,
      'Abra o Stokai em Conta → Empresa para aprovar ou recusar.',
    ], appUrl);
  }
  return { orgName };
}

// ─── Decisões do dono ────────────────────────────────────────────────────────

async function requireOwner(ctx: Ctx) {
  const m = ctx.membership;
  if (!m || m.role !== 'owner' || m.status !== 'approved') throw new BadRequest('Só quem criou a empresa pode fazer isso.');
  return m;
}

async function pendingOrMember(orgId: string, userId: unknown, status: 'pending' | 'approved') {
  if (typeof userId !== 'string') throw new BadRequest('Usuário inválido.');
  const c = await db();
  const r = await c.execute({
    sql: `SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE m.org_id = ? AND m.user_id = ? AND m.status = ? AND m.role = 'member'`,
    args: [orgId, userId, status],
  });
  if (!r.rows[0]) throw new BadRequest(status === 'pending' ? 'Pedido não encontrado.' : 'Membro não encontrado.');
  return { userId, email: String(r.rows[0].email) };
}

export async function decideJoin(ctx: Ctx, userId: unknown, approve: boolean, appUrl: string) {
  const m = await requireOwner(ctx);
  const target = await pendingOrMember(m.orgId, userId, 'pending');
  const c = await db();
  if (approve) {
    await c.execute({
      sql: "UPDATE memberships SET status = 'approved', created_at = ? WHERE user_id = ? AND org_id = ?",
      args: [Date.now(), target.userId, m.orgId],
    });
    await notify([target.userId], {
      kind: 'join_approved',
      title: 'Você entrou na empresa',
      body: `Seu pedido para entrar em ${m.orgName} foi aprovado. Agora você vê os dados da empresa.`,
    });
    await sendEmail([target.email], `Stokai: você entrou em ${m.orgName}`, [
      `Seu pedido para entrar na empresa ${m.orgName} foi aprovado.`,
      'Agora você vê e registra vendas, gastos, estoque e encomendas da empresa.',
    ], appUrl);
  } else {
    await c.execute({ sql: 'DELETE FROM memberships WHERE user_id = ? AND org_id = ?', args: [target.userId, m.orgId] });
    await notify([target.userId], {
      kind: 'join_rejected',
      title: 'Pedido recusado',
      body: `Seu pedido para entrar em ${m.orgName} foi recusado.`,
    });
  }
}

export async function removeMember(ctx: Ctx, userId: unknown) {
  const m = await requireOwner(ctx);
  const target = await pendingOrMember(m.orgId, userId, 'approved');
  const c = await db();
  await c.execute({ sql: 'DELETE FROM memberships WHERE user_id = ? AND org_id = ?', args: [target.userId, m.orgId] });
  await notify([target.userId], {
    kind: 'member_removed',
    title: 'Você saiu da empresa',
    body: `Você foi removido de ${m.orgName}. Seus dados pessoais voltaram a aparecer.`,
  });
}

// ─── Sair / cancelar pedido ──────────────────────────────────────────────────

export async function leaveOrg(ctx: Ctx) {
  const m = ctx.membership ?? (await membershipOf(ctx.user.id));
  if (!m) throw new BadRequest('Você não participa de nenhuma empresa.');
  if (m.role === 'owner') throw new BadRequest('Quem criou a empresa não pode sair dela.');
  const c = await db();
  await c.execute({ sql: 'DELETE FROM memberships WHERE user_id = ?', args: [ctx.user.id] });
  if (m.status === 'approved') {
    const owner = await ownerOf(m.orgId);
    if (owner) {
      const who = await displayName(ctx.user.id, ctx.user.email);
      await notify([owner.id], { kind: 'member_left', title: 'Membro saiu', body: `${who} saiu de ${m.orgName}.` });
    }
  }
}
