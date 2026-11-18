import { after, type NextRequest } from 'next/server';
import { isSameOriginJson } from '@/lib/server/auth';
import { contextFromRequest } from '@/lib/server/context';
import { adjustQty, importAll, insertRow, isRowTable, loadAll, removeRow, setPref, updateRow } from '@/lib/server/data';
import { fail, handle, json } from '@/lib/server/http';
import { notifyActivity } from '@/lib/server/activity';

/** GET /api/data → dados do espaço ativo (empresa ou pessoal) + preferências pessoais */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const ctx = await contextFromRequest(req);
    if (!ctx) return fail('Sessão expirada. Entre de novo.', 401);
    return json(await loadAll(ctx.scope, ctx.user.id));
  });
}

/** POST /api/data { op, ... } → uma alteração */
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!isSameOriginJson(req)) return fail('Requisição inválida', 403);
    const ctx = await contextFromRequest(req);
    if (!ctx) return fail('Sessão expirada. Entre de novo.', 401);
    const b = await req.json().catch(() => null);
    if (!b || typeof b !== 'object') return fail('Requisição inválida', 400);

    switch (b.op) {
      case 'insert': {
        if (!isRowTable(b.table)) return fail('Tabela inválida', 400);
        const row = b.row ?? {};
        await insertRow(ctx.scope, b.table, row);
        if (b.table !== 'products') {
          const table = b.table;
          const appUrl = req.nextUrl.origin;
          // Avisa a equipe depois de responder (não atrasa o app)
          after(() => notifyActivity(ctx, table, row, appUrl));
        }
        return json({ ok: true });
      }
      case 'update':
        if (!isRowTable(b.table)) return fail('Tabela inválida', 400);
        await updateRow(ctx.scope, b.table, b.id, b.patch ?? {});
        return json({ ok: true });
      case 'remove':
        if (!isRowTable(b.table)) return fail('Tabela inválida', 400);
        await removeRow(ctx.scope, b.table, b.id);
        return json({ ok: true });
      case 'adjustQty':
        return json({ quantidade: await adjustQty(ctx.scope, b.productId, b.delta) });
      case 'setPref':
        await setPref(ctx.user.id, b.key, b.value); // preferências são sempre pessoais
        return json({ ok: true });
      case 'import':
        if (ctx.membership?.status === 'approved' && ctx.membership.role !== 'owner') {
          return fail('Só quem criou a empresa pode importar um backup sobre os dados dela.', 403);
        }
        await importAll(ctx.scope, ctx.user.id, b.data);
        return json({ ok: true });
      default:
        return fail('Operação inválida', 400);
    }
  });
}
