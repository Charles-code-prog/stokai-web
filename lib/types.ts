// ─── Types ──────────────────────────────────────────────────────────────────

export interface DBProduct {
  id: string;
  nome: string;
  fornecedor: string;
  preco: string;
  custo: string;
  link: string;
  contato: string;
  quantidade: string;
  updated_at: number;
}

export interface DBSale {
  id: string;
  product_id: string;
  descricao: string;
  preco_centavos: number;
  quantidade: number;
  desconto_centavos: number;
  total_centavos: number;
  custo_centavos: number;   // custo unitário; 0 = usar custo do produto
  plataforma: string;
  day: number;
  month: number;
  year: number;
  timestamp: number;
}

export interface DBExpense {
  id: string;
  descricao: string;
  valor_centavos: number;
  day: number;
  month: number;
  year: number;
  timestamp: number;
}

export interface DBOrder {
  id: string;
  descricao: string;
  preco_centavos: number;
  quantidade: number;
  custo_centavos: number;
  cliente: string;
  contato: string;
  delivery_day: number;
  delivery_month: number;
  delivery_year: number;
  delivery_hour: number;
  status: 'pendente' | 'entregue';
  timestamp: number;
}

export interface BackupData {
  app: 'stokai';
  version: 1;
  exported_at: number;
  products: DBProduct[];
  sales: DBSale[];
  expenses: DBExpense[];
  orders: DBOrder[];
  preferences: Record<string, string>;
}
