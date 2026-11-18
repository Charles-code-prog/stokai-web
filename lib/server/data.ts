import 'server-only';
import type { InStatement, Row } from '@libsql/client';
import { db } from './db';
import type { BackupData } from '@/lib/types';

/**
 * Todas as consultas usam colunas desta lista branca e parâmetros "?":
 * nada que vem do navegador vira texto SQL. Toda consulta filtra por user_id.
 */
type Kind = 'text' | 'int' | 'status';

const COLUMNS = {
  products: {
    nome: 'text', fornecedor: 'text', preco: 'text', custo: 'text', link: 'text',
    contato: 'text', quantidade: 'text', updated_at: 'int',
  },
  sales: {
    product_id: 'text', descricao: 'text', preco_centavos: 'int', quantidade: 'int',
    desconto_centavos: 'int', total_centavos: 'int', custo_centavos: 'int', plataforma: 'text',
    day: 'int', month: 'int', year: 'int', timestamp: 'int',
  },
  expenses: {
    descricao: 'text', valor_centavos: 'int', day: 'int', month: 'int', year: 'int', timestamp: 'int',
  },
  orders: {
    descricao: 'text', preco_centavos: 'int', quantidade: 'int', custo_centavos: 'int',
    cliente: 'text', contato: 'text', delivery_day: 'int', delivery_month: 'int',
    delivery_year: 'int', delivery_hour: 'int', status: 'status', timestamp: 'int',
  },
} as const satisfies Record<string, Record<string, Kind>>;

/** Campos que uma edição pode mudar (data e timestamp ficam como estavam, igual ao app). */
const UPDATABLE: Record<RowTable, readonly string[]> = {
  products: ['nome', 'fornecedor', 'preco', 'custo', 'link', 'contato', 'quantidade', 'updated_at'],
  sales: ['descricao', 'preco_centavos', 'quantidade', 'desconto_centavos', 'total_centavos', 'custo_centavos', 'plataforma'],
  expenses: ['descricao', 'valor_centavos'],
  orders: ['descricao', 'preco_centavos', 'quantidade', 'custo_centavos', 'cliente', 'contato',
    'delivery_day', 'delivery_month', 'delivery_year', 'delivery_hour', 'status'],
};

const ORDER_BY: Record<RowTable, string> = {
  products: 'rowid DESC',          // como no app: mais recente primeiro
  sales: 'timestamp DESC, rowid DESC',
  expenses: 'timestamp DESC, rowid DESC',
  orders: 'rowid DESC',
};

export type RowTable = keyof typeof COLUMNS;
export const ROW_TABLES = Object.keys(COLUMNS) as RowTable[];

export class BadRequest extends Error {}

const MAX_TEXT = 2000;
const MAX_PREF = 300_000; // foto de perfil em data URL cabe com folga

function coerce(kind: Kind, v: unknown): string | bigint {
  if (kind === 'int') {
    // BigInt → o libSQL grava INTEGER (um number do JS iria como REAL)
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER ? BigInt(Math.trunc(n)) : BigInt(0);
  }
  if (kind === 'status') return v === 'entregue' ? 'entregue' : 'pendente';
  return String(v ?? '').slice(0, MAX_TEXT);
}

export function isRowTable(t: unknown): t is RowTable {
  return typeof t === 'string' && t in COLUMNS;
}

function checkId(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) throw new BadRequest('id inválido');
  return id;
}

function insertStatement(userId: string, table: RowTable, row: Record<string, unknown>): InStatement {
  const cols = Object.entries(COLUMNS[table]) as [string, Kind][];
  return {
    sql: `INSERT INTO ${table} (user_id, id, ${cols.map(([c]) => c).join(', ')})
          VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
    args: [userId, checkId(row.id), ...cols.map(([c, k]) => coerce(k, row[c]))],
  };
}

function toObject(table: RowTable, r: Row) {
  const out: Record<string, unknown> = { id: String(r.id) };
  for (const [c, k] of Object.entries(COLUMNS[table]) as [string, Kind][]) {
    out[c] = k === 'int' ? Number(r[c]) : String(r[c] ?? '');
  }
  return out;
}

// ─── Operações ───────────────────────────────────────────────────────────────

/** scope = dono dos dados (usuário ou empresa); userId = dono das preferências (sempre pessoais) */
export async function loadAll(scope: string, userId: string) {
  const c = await db();
  const [products, sales, expenses, orders, prefs] = await c.batch(
    [
      ...ROW_TABLES.map(t => ({
        sql: `SELECT id, ${Object.keys(COLUMNS[t]).join(', ')} FROM ${t} WHERE user_id = ? ORDER BY ${ORDER_BY[t]}`,
        args: [scope],
      })),
      { sql: 'SELECT key, value FROM preferences WHERE user_id = ?', args: [userId] },
    ],
    'read',
  );
  return {
    products: products.rows.map(r => toObject('products', r)),
    sales: sales.rows.map(r => toObject('sales', r)),
    expenses: expenses.rows.map(r => toObject('expenses', r)),
    orders: orders.rows.map(r => toObject('orders', r)),
    preferences: Object.fromEntries(prefs.rows.map(r => [String(r.key), String(r.value)])),
  };
}

export async function insertRow(userId: string, table: RowTable, row: Record<string, unknown>) {
  const c = await db();
  if (table === 'products') {
    // INSERT OR REPLACE do app: se o id já existe, substitui (e vai para o topo da lista)
    await c.batch([
      { sql: 'DELETE FROM products WHERE user_id = ? AND id = ?', args: [userId, checkId(row.id)] },
      insertStatement(userId, table, row),
    ], 'write');
  } else {
    await c.execute(insertStatement(userId, table, row));
  }
}

export async function updateRow(userId: string, table: RowTable, id: unknown, patch: Record<string, unknown>) {
  const allowed = UPDATABLE[table].filter(c => c in patch);
  if (allowed.length === 0) return;
  const kinds = COLUMNS[table] as Record<string, Kind>;
  const c = await db();
  await c.execute({
    sql: `UPDATE ${table} SET ${allowed.map(col => `${col} = ?`).join(', ')} WHERE user_id = ? AND id = ?`,
    args: [...allowed.map(col => coerce(kinds[col], patch[col])), userId, checkId(id)],
  });
}

export async function removeRow(userId: string, table: RowTable, id: unknown) {
  const c = await db();
  await c.execute({ sql: `DELETE FROM ${table} WHERE user_id = ? AND id = ?`, args: [userId, checkId(id)] });
}

/** Mesma regra do app: inteiro no início do texto + delta, nunca abaixo de 0. */
export async function adjustQty(userId: string, productId: unknown, delta: unknown): Promise<string | null> {
  const d = Math.trunc(Number(delta));
  if (!Number.isFinite(d)) throw new BadRequest('delta inválido');
  const c = await db();
  const r = await c.execute({
    sql: `UPDATE products
             SET quantidade = CAST(MAX(0, CAST(COALESCE(quantidade, '0') AS INTEGER) + CAST(? AS INTEGER)) AS TEXT)
           WHERE user_id = ? AND id = ?
       RETURNING quantidade`,
    args: [BigInt(d), userId, checkId(productId)], // BigInt → INTEGER (number iria como REAL: "7.0")
  });
  return r.rows[0] ? String(r.rows[0].quantidade) : null;
}

export async function setPref(userId: string, key: unknown, value: unknown) {
  if (typeof key !== 'string' || !/^[a-z_]{1,40}$/.test(key)) throw new BadRequest('preferência inválida');
  const v = String(value ?? '');
  if (v.length > MAX_PREF) throw new BadRequest('valor muito grande');
  const c = await db();
  await c.execute({
    sql: `INSERT INTO preferences (user_id, key, value) VALUES (?, ?, ?)
          ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value`,
    args: [userId, key, v],
  });
}

/** Substitui todos os dados do usuário pelo backup, numa transação só. */
export async function importAll(scope: string, userId: string, data: BackupData) {
  if (!data || data.app !== 'stokai') throw new BadRequest('arquivo não é um backup do Stokai');
  for (const t of ROW_TABLES) {
    if (!Array.isArray(data[t])) throw new BadRequest(`backup sem a lista "${t}"`);
  }
  const prefs = data.preferences && typeof data.preferences === 'object' ? data.preferences : {};

  const stmts: InStatement[] = [
    ...ROW_TABLES.map(t => ({ sql: `DELETE FROM ${t} WHERE user_id = ?`, args: [scope] })),
    { sql: 'DELETE FROM preferences WHERE user_id = ?', args: [userId] },
  ];
  for (const t of ROW_TABLES) {
    const rows = data[t] as unknown as Record<string, unknown>[];
    // products/orders são listados por rowid DESC: inserir do mais antigo ao mais novo
    const ordered = t === 'products' || t === 'orders' ? [...rows].reverse() : rows;
    const seen = new Set<string>();
    for (const row of ordered) {
      const id = checkId(row?.id);
      if (seen.has(id)) continue;
      seen.add(id);
      stmts.push(insertStatement(scope, t, row));
    }
  }
  for (const [k, v] of Object.entries(prefs)) {
    if (/^[a-z_]{1,40}$/.test(k) && String(v).length <= MAX_PREF) {
      stmts.push({ sql: 'INSERT INTO preferences (user_id, key, value) VALUES (?, ?, ?)', args: [userId, k, String(v)] });
    }
  }
  const c = await db();
  await c.batch(stmts, 'write');
}
