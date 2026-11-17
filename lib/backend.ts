import type { BackupData, DBExpense, DBOrder, DBProduct, DBSale } from './types';

export interface Tables {
  products: DBProduct[];   // mais recente primeiro
  sales: DBSale[];         // timestamp DESC
  expenses: DBExpense[];   // timestamp DESC
  orders: DBOrder[];       // mais recente primeiro
  preferences: Record<string, string>;
}

export type RowTable = 'products' | 'sales' | 'expenses' | 'orders';
type RowOf<T extends RowTable> = Tables[T][number];

/** Interface usada pela tela; a implementação conversa com as rotas /api/data (Turso no servidor). */
export interface Backend {
  load(): Promise<Tables>;
  insert<T extends RowTable>(table: T, row: RowOf<T>): Promise<void>;
  update<T extends RowTable>(table: T, id: string, patch: Partial<RowOf<T>>): Promise<void>;
  remove(table: RowTable, id: string): Promise<void>;
  /** Retorna a nova quantidade (texto) ou null se o produto não existe. */
  adjustQty(productId: string, delta: number): Promise<string | null>;
  setPref(key: string, value: string): Promise<void>;
  importAll(data: BackupData): Promise<void>;
}

export const emptyTables = (): Tables => ({ products: [], sales: [], expenses: [], orders: [], preferences: {} });

/** Mesma regra do SQL: inteiro do início do texto + delta, nunca abaixo de 0. */
export function applyQtyDelta(quantidade: string, delta: number): string {
  const m = /^\s*(-?\d+)/.exec(quantidade || '');
  return String(Math.max(0, (m ? parseInt(m[1], 10) : 0) + delta));
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** fetch para as rotas do próprio app, com mensagem de erro amigável. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique a internet.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Erro ${res.status}`, res.status);
  return data as T;
}

export function apiBackend(): Backend {
  const op = (body: Record<string, unknown>) => api<{ ok?: boolean; quantidade?: string | null }>('/api/data', body);
  return {
    load: () => api<Tables>('/api/data'),
    insert: async (table, row) => { await op({ op: 'insert', table, row }); },
    update: async (table, id, patch) => { await op({ op: 'update', table, id, patch }); },
    remove: async (table, id) => { await op({ op: 'remove', table, id }); },
    adjustQty: async (productId, delta) => (await op({ op: 'adjustQty', productId, delta })).quantidade ?? null,
    setPref: async (key, value) => { await op({ op: 'setPref', key, value }); },
    importAll: async data => { await op({ op: 'import', data }); },
  };
}
