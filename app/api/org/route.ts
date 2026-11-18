import type { NextRequest } from 'next/server';
import { isSameOriginJson } from '@/lib/server/auth';
import { contextFromRequest } from '@/lib/server/context';
import { fail, handle, json } from '@/lib/server/http';
import { createOrg, decideJoin, leaveOrg, orgInfo, removeMember, requestJoin } from '@/lib/server/org';

/** GET /api/org → empresa do usuário, membros e pedidos pendentes (para o dono) */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const ctx = await contextFromRequest(req);
    if (!ctx) return fail('Sessão expirada. Entre de novo.', 401);
    return json(await orgInfo(ctx));
  });
}

/** POST /api/org { op: create | join | approve | reject | remove | leave } */
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!isSameOriginJson(req)) return fail('Requisição inválida', 403);
    const ctx = await contextFromRequest(req);
    if (!ctx) return fail('Sessão expirada. Entre de novo.', 401);
    const b = await req.json().catch(() => ({}));
    const appUrl = req.nextUrl.origin;

    switch (b.op) {
      case 'create':
        return json(await createOrg(ctx, b.name, b.keyword, b.bringData === true));
      case 'join':
        return json(await requestJoin(ctx, b.name, b.keyword, appUrl));
      case 'approve':
        await decideJoin(ctx, b.userId, true, appUrl);
        return json({ ok: true });
      case 'reject':
        await decideJoin(ctx, b.userId, false, appUrl);
        return json({ ok: true });
      case 'remove':
        await removeMember(ctx, b.userId);
        return json({ ok: true });
      case 'leave':
        await leaveOrg(ctx);
        return json({ ok: true });
      default:
        return fail('Operação inválida', 400);
    }
  });
}
