import type { DBExpense } from './types';

export const MAX_PARCELAS = 48;

export const isSeries = (e: Pick<DBExpense, 'parcelas_total'>) => (e.parcelas_total ?? 0) > 1;

/** Divide o total em n parcelas; os centavos que sobram vão para a 1ª (ex.: 100,00 em 3x → 33,34 + 33,33 + 33,33). */
export function splitCents(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? rest : 0));
}

/**
 * Monta as parcelas de um gasto: uma linha por mês a partir da data inicial, sempre no mesmo dia
 * (se o mês for mais curto, usa o último dia: 31/01 → 28/02 → 31/03).
 */
export function buildSeries(opts: {
  descricao: string;
  totalCents: number;
  parcelas: number;
  start: { day: number; month: number; year: number };
  firstTimestamp: number;
  groupId: string;
}): DBExpense[] {
  const { descricao, totalCents, parcelas, start, firstTimestamp, groupId } = opts;
  const values = splitCents(totalCents, parcelas);
  const t0 = new Date(firstTimestamp);
  return values.map((valor, i) => {
    const monthIndex = start.month - 1 + i;
    const year = start.year + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const day = Math.min(start.day, lastDay);
    const timestamp = i === 0
      ? firstTimestamp
      : new Date(year, month - 1, day, t0.getHours(), t0.getMinutes(), t0.getSeconds()).getTime();
    return {
      id: `${groupId}-${i + 1}`,
      descricao,
      valor_centavos: valor,
      day, month, year, timestamp,
      parcela_grupo: groupId,
      parcela_num: i + 1,
      parcelas_total: parcelas,
      valor_total_centavos: totalCents,
    };
  });
}
