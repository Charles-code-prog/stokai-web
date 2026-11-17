import type { NextRequest } from 'next/server';
import { isSameOriginJson, userFromRequest } from '@/lib/server/auth';
import { adjustQty, importAll, insertRow, isRowTable, loadAll, removeRow, setPref, updateRow } from '@/lib/server/data';
import { fail, handle, json } from '@/lib/server/http';

/** GET /api/data → todos os dados do usuário logado */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await userFromRequest(req);
    if (!user) return fail('Sessão expirada. Entre de novo.', 401);
    return json(await loadAll(user.id));
  });
}

/** POST /api/data { op, ... } → uma alteração */
export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!isSameOriginJson(req)) return fail('Requisição inválida', 403);
    const user = await userFromRequest(req);
    if (!user) return fail('Sessão expirada. Entre de novo.', 401);
    const b = await req.json().catch(() => null);
    if (!b || typeof b !== 'object') return fail('Requisição inválida', 400);

    switch (b.op) {
      case 'insert':
        if (!isRowTable(b.table)) return fail('Tabela inválida', 400);
        await insertRow(user.id, b.table, b.row ?? {});
        return json({ ok: true });
      case 'update':
        if (!isRowTable(b.table)) return fail('Tabela inválida', 400);
        await updateRow(user.id, b.table, b.id, b.patch ?? {});
        return json({ ok: true });
      case 'remove':
        if (!isRowTable(b.table)) return fail('Tabela inválida', 400);
        await removeRow(user.id, b.table, b.id);
        return json({ ok: true });
      case 'adjustQty':
        return json({ quantidade: await adjustQty(user.id, b.productId, b.delta) });
      case 'setPref':
        await setPref(user.id, b.key, b.value);
        return json({ ok: true });
      case 'import':
        await importAll(user.id, b.data);
        return json({ ok: true });
      default:
        return fail('Operação inválida', 400);
    }
  });
}
