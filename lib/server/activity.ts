import 'server-only';
import type { Ctx } from './context';
import type { RowTable } from './data';
import { displayName, notify, sendEmail, spaceMembers, type NotificationKind } from './notify';

const brl = (cents: unknown) => {
  const n = Math.round(Number(cents) || 0);
  const abs = (Math.abs(n) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${n < 0 ? '-' : ''}${abs}`;
};
const str = (v: unknown, max = 80) => String(v ?? '').trim().slice(0, max);
const pad = (v: unknown) => String(Math.trunc(Number(v) || 0)).padStart(2, '0');

/**
 * Venda, gasto ou encomenda registrada:
 * - notificação no app para os OUTROS membros da empresa;
 * - e-mail para TODOS os membros (inclusive quem registrou) que deixaram os e-mails ligados.
 * Nunca lança erro (roda depois da resposta).
 */
export async function notifyActivity(ctx: Ctx, table: RowTable, row: Record<string, unknown>, appUrl: string) {
  try {
    const who = await displayName(ctx.user.id, ctx.user.email);
    const space = ctx.membership?.status === 'approved' ? ` em ${ctx.membership.orgName}` : '';

    let kind: NotificationKind;
    let title: string;
    let lines: string[];
    if (table === 'sales') {
      kind = 'sale';
      const desc = str(row.descricao) || 'Venda';
      title = `Nova venda: ${desc} — ${brl(row.total_centavos)}`;
      lines = [
        `${who} registrou uma venda${space}.`,
        `${desc}: ${row.quantidade} × ${brl(row.preco_centavos)}` +
          (Number(row.desconto_centavos) > 0 ? ` (desconto ${brl(row.desconto_centavos)})` : '') +
          ` = ${brl(row.total_centavos)}`,
      ];
      if (str(row.plataforma)) lines.push(`Plataforma: ${str(row.plataforma)}`);
    } else if (table === 'expenses') {
      kind = 'expense';
      const desc = str(row.descricao) || 'Gasto';
      title = `Novo gasto: ${desc} — ${brl(row.valor_centavos)}`;
      lines = [`${who} registrou um gasto${space}.`, `${desc}: ${brl(row.valor_centavos)}`];
    } else if (table === 'orders') {
      kind = 'order';
      const desc = str(row.descricao) || 'Encomenda';
      const total = (Number(row.preco_centavos) || 0) * (Number(row.quantidade) || 0);
      title = `Nova encomenda: ${desc} — ${brl(total)}`;
      lines = [
        `${who} cadastrou uma encomenda${space}.`,
        `${desc}: ${row.quantidade} × ${brl(row.preco_centavos)} = ${brl(total)}`,
        `Entrega: ${pad(row.delivery_day)}/${pad(row.delivery_month)}/${row.delivery_year} às ${pad(row.delivery_hour)}h`,
      ];
      if (str(row.cliente)) lines.push(`Cliente: ${str(row.cliente)}`);
    } else {
      return;
    }

    const members = await spaceMembers(ctx.scope);
    await notify(members.filter(m => m.id !== ctx.user.id).map(m => m.id), { kind, title, body: lines.join('\n') });
    await sendEmail(members.filter(m => m.wantsEmail).map(m => m.email), `Stokai: ${title}`, lines, appUrl);
  } catch (err) {
    console.error('[stokai] falha ao notificar movimentação', err);
  }
}
