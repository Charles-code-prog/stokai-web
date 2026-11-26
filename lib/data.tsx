'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth';
import { ApiError, apiBackend, applyQtyDelta, emptyTables, type Backend, type Tables } from './backend';
import { applyTheme, DARK, DEFAULT_ACCENT, LIGHT, type Colors, type ThemeMode } from './theme';
import type { BackupData, DBExpense, DBOrder, DBProduct, DBSale } from './types';

interface DataCtx {
  loaded: boolean;
  /** Mensagem do último erro de sincronização (null = tudo certo) */
  syncError: string | null;
  saving: boolean;
  clearError: () => void;

  products: DBProduct[];
  sales: DBSale[];       // timestamp DESC
  expenses: DBExpense[]; // timestamp DESC
  orders: DBOrder[];
  getPref: (key: string, def?: string) => string;

  insertProduct: (p: DBProduct) => void;
  updateProduct: (p: DBProduct) => void;
  deleteProduct: (id: string) => void;
  adjustProductQuantity: (productId: string, delta: number) => void;

  insertSale: (s: DBSale) => void;
  updateSale: (s: DBSale) => void;
  deleteSale: (id: string) => void;

  insertExpense: (e: DBExpense) => void;
  updateExpense: (e: DBExpense) => void;
  deleteExpense: (id: string) => void;
  /** Gasto parcelado: grava todas as parcelas (uma por mês) */
  insertExpenseSeries: (rows: DBExpense[]) => void;
  /** Troca gastos (ex.: editar/excluir uma série de parcelas) */
  replaceExpenses: (removeIds: string[], rows: DBExpense[]) => void;

  insertOrder: (o: DBOrder) => void;
  updateOrder: (o: DBOrder) => void;
  deleteOrder: (id: string) => void;

  setPref: (key: string, value: string) => void;
  exportAll: () => BackupData;
  importAll: (data: BackupData) => Promise<void>;
  reload: () => Promise<void>;

  // Tema
  theme: ThemeMode;
  accent: string;
  colors: Colors;
  setTheme: (t: ThemeMode) => void;
  setAccent: (a: string) => void;
}

const DataContext = createContext<DataCtx | null>(null);

const byTimestampDesc = <T extends { timestamp: number }>(a: T, b: T) => b.timestamp - a.timestamp;

/** Recria o provider (estado zerado) quando o usuário logado muda. */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const key = user ? `${user.id}:${user.emailVerified ? 'ok' : 'pendente'}` : 'anon';
  return <UserDataProvider key={key}>{children}</UserDataProvider>;
}

function UserDataProvider({ children }: { children: React.ReactNode }) {
  const { user, refresh: refreshAuth } = useAuth();
  const [tables, setTables] = useState<Tables>(emptyTables);
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  const backend = useMemo<Backend | null>(() => {
    // Sem e-mail confirmado o servidor não libera os dados
    return user?.emailVerified ? apiBackend() : null;
  }, [user]);

  const reload = useCallback(async () => {
    if (!backend) return;
    try {
      setTables(await backend.load());
      setSyncError(null);
    } catch (err) {
      setSyncError(errorMessage(err));
    } finally {
      setLoaded(true);
    }
  }, [backend]);

  useEffect(() => {
    if (!backend) return;
    let cancelled = false;
    backend.load().then(
      t => { if (!cancelled) { setTables(t); setSyncError(null); } },
      err => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) void refreshAuth();
        else setSyncError(errorMessage(err));
      },
    ).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [backend, refreshAuth]);

  // Escritas em fila: a ordem no servidor é a mesma em que o usuário agiu.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const run = useCallback(
    (op: (b: Backend) => Promise<void>) => {
      if (!backend) return;
      setPending(n => n + 1);
      queue.current = queue.current
        .then(() => op(backend))
        .catch(async err => {
          if (err instanceof ApiError && err.status === 401) { void refreshAuth(); return; } // sessão expirou → login
          setSyncError(errorMessage(err));
          // Volta para o estado real do servidor
          try { setTables(await backend.load()); } catch {}
        })
        .finally(() => setPending(n => n - 1));
    },
    [backend, refreshAuth],
  );

  const patch = (fn: (t: Tables) => Tables) => setTables(fn);

  // ── Ações (atualizam a tela na hora e gravam em segundo plano) ─────────────

  const api = useMemo(() => {
    const updateIn = <T extends { id: string }>(list: T[], id: string, p: Partial<T>) =>
      list.map(x => (x.id === id ? { ...x, ...p } : x));

    return {
      insertProduct(p: DBProduct) {
        const row = { ...p, updated_at: Date.now() };
        patch(t => ({ ...t, products: [row, ...t.products.filter(x => x.id !== p.id)] }));
        run(b => b.insert('products', row));
      },
      updateProduct(p: DBProduct) {
        const fields = {
          nome: p.nome, fornecedor: p.fornecedor, preco: p.preco, custo: p.custo,
          link: p.link, contato: p.contato, quantidade: p.quantidade, updated_at: Date.now(),
        };
        patch(t => ({ ...t, products: updateIn(t.products, p.id, fields) }));
        run(b => b.update('products', p.id, fields));
      },
      deleteProduct(id: string) {
        patch(t => ({ ...t, products: t.products.filter(x => x.id !== id) }));
        run(b => b.remove('products', id));
      },
      adjustProductQuantity(productId: string, delta: number) {
        patch(t => ({
          ...t,
          products: t.products.map(x =>
            x.id === productId ? { ...x, quantidade: applyQtyDelta(x.quantidade, delta) } : x),
        }));
        run(async b => {
          const q = await b.adjustQty(productId, delta);
          if (q !== null) patch(t => ({ ...t, products: updateIn(t.products, productId, { quantidade: q }) }));
        });
      },

      insertSale(s: DBSale) {
        const row = { ...s, custo_centavos: s.custo_centavos ?? 0 };
        patch(t => ({ ...t, sales: [...t.sales, row].sort(byTimestampDesc) }));
        run(b => b.insert('sales', row));
      },
      updateSale(s: DBSale) {
        const fields = {
          descricao: s.descricao, preco_centavos: s.preco_centavos, quantidade: s.quantidade,
          desconto_centavos: s.desconto_centavos, total_centavos: s.total_centavos,
          custo_centavos: s.custo_centavos ?? 0, plataforma: s.plataforma,
        };
        patch(t => ({ ...t, sales: updateIn(t.sales, s.id, fields) }));
        run(b => b.update('sales', s.id, fields));
      },
      deleteSale(id: string) {
        patch(t => ({ ...t, sales: t.sales.filter(x => x.id !== id) }));
        run(b => b.remove('sales', id));
      },

      insertExpense(e: DBExpense) {
        patch(t => ({ ...t, expenses: [...t.expenses, e].sort(byTimestampDesc) }));
        run(b => b.insert('expenses', e));
      },
      updateExpense(e: DBExpense) {
        const fields = { descricao: e.descricao, valor_centavos: e.valor_centavos };
        patch(t => ({ ...t, expenses: updateIn(t.expenses, e.id, fields) }));
        run(b => b.update('expenses', e.id, fields));
      },
      deleteExpense(id: string) {
        patch(t => ({ ...t, expenses: t.expenses.filter(x => x.id !== id) }));
        run(b => b.remove('expenses', id));
      },

      insertExpenseSeries(rows: DBExpense[]) {
        if (rows.length === 0) return;
        patch(t => ({ ...t, expenses: [...t.expenses, ...rows].sort(byTimestampDesc) }));
        run(b => b.insertMany('expenses', rows));
      },
      replaceExpenses(removeIds: string[], rows: DBExpense[]) {
        const gone = new Set(removeIds);
        patch(t => ({ ...t, expenses: [...t.expenses.filter(x => !gone.has(x.id)), ...rows].sort(byTimestampDesc) }));
        run(b => b.replace('expenses', removeIds, rows));
      },

      insertOrder(o: DBOrder) {
        patch(t => ({ ...t, orders: [o, ...t.orders] }));
        run(b => b.insert('orders', o));
      },
      updateOrder(o: DBOrder) {
        const fields = {
          descricao: o.descricao, preco_centavos: o.preco_centavos, quantidade: o.quantidade,
          custo_centavos: o.custo_centavos, cliente: o.cliente, contato: o.contato,
          delivery_day: o.delivery_day, delivery_month: o.delivery_month, delivery_year: o.delivery_year,
          delivery_hour: o.delivery_hour, status: o.status,
        };
        patch(t => ({ ...t, orders: updateIn(t.orders, o.id, fields) }));
        run(b => b.update('orders', o.id, fields));
      },
      deleteOrder(id: string) {
        patch(t => ({ ...t, orders: t.orders.filter(x => x.id !== id) }));
        run(b => b.remove('orders', id));
      },

      setPref(key: string, value: string) {
        patch(t => ({ ...t, preferences: { ...t.preferences, [key]: value } }));
        run(b => b.setPref(key, value));
      },
    };
  }, [run]);

  const exportAll = useCallback((): BackupData => ({
    app: 'stokai',
    version: 1,
    exported_at: Date.now(),
    products: tables.products,
    sales: tables.sales,
    expenses: tables.expenses,
    orders: tables.orders,
    preferences: tables.preferences,
  }), [tables]);

  const importAll = useCallback(async (data: BackupData) => {
    if (!backend) return;
    await queue.current; // espera escritas pendentes
    await backend.importAll(data);
    await reload();
  }, [backend, reload]);

  // ── Tema (salvo nas preferências do usuário) ──────────────────────────────

  const theme: ThemeMode = tables.preferences.theme === 'light' ? 'light' : 'dark';
  const accent = tables.preferences.accent || DEFAULT_ACCENT;

  useEffect(() => {
    if (loaded) applyTheme(theme, accent);
  }, [loaded, theme, accent]);

  const value: DataCtx = {
    loaded,
    syncError,
    saving: pending > 0,
    clearError: () => setSyncError(null),
    products: tables.products,
    sales: tables.sales,
    expenses: tables.expenses,
    orders: tables.orders,
    getPref: (key, def = '') => tables.preferences[key] ?? def,
    ...api,
    exportAll,
    importAll,
    reload,
    theme,
    accent,
    colors: theme === 'dark' ? DARK : LIGHT,
    setTheme: t => api.setPref('theme', t),
    setAccent: a => api.setPref('accent', a),
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataCtx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData fora do DataProvider');
  return ctx;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return 'Erro desconhecido';
}
