// Schema do banco Turso (libSQL/SQLite). Aplicado automaticamente por lib/server/db.ts.
// Tudo é IF NOT EXISTS: seguro repetir. Para inspecionar no Turso: `turso db shell <banco>`.
export const SCHEMA_SQL = `
-- ════════════════════════════════════════════════════════════════════════════
-- Stokai — schema do banco Turso (libSQL / SQLite)
--
-- Não precisa rodar à mão: o servidor aplica este arquivo automaticamente na
-- primeira requisição (tudo é "IF NOT EXISTS", então é seguro repetir).
-- Mesmo formato do SQLite do app Expo, com user_id para separar cada conta.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,               -- sha256 do token do cookie
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS products (
  user_id    TEXT NOT NULL,
  id         TEXT NOT NULL,
  nome       TEXT NOT NULL DEFAULT '',
  fornecedor TEXT NOT NULL DEFAULT '',
  preco      TEXT NOT NULL DEFAULT '',       -- reais em texto ("35,00"), como no app
  custo      TEXT NOT NULL DEFAULT '',
  link       TEXT NOT NULL DEFAULT '',
  contato    TEXT NOT NULL DEFAULT '',
  quantidade TEXT NOT NULL DEFAULT '0',
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS sales (
  user_id           TEXT NOT NULL,
  id                TEXT NOT NULL,
  product_id        TEXT NOT NULL DEFAULT '',
  descricao         TEXT NOT NULL DEFAULT '',
  preco_centavos    INTEGER NOT NULL DEFAULT 0,
  quantidade        INTEGER NOT NULL DEFAULT 1,
  desconto_centavos INTEGER NOT NULL DEFAULT 0,
  total_centavos    INTEGER NOT NULL DEFAULT 0,
  custo_centavos    INTEGER NOT NULL DEFAULT 0,
  plataforma        TEXT NOT NULL DEFAULT '',
  day               INTEGER NOT NULL,
  month             INTEGER NOT NULL,
  year              INTEGER NOT NULL,
  timestamp         INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS sales_user_ts_idx ON sales (user_id, timestamp);

CREATE TABLE IF NOT EXISTS expenses (
  user_id        TEXT NOT NULL,
  id             TEXT NOT NULL,
  descricao      TEXT NOT NULL DEFAULT '',
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  day            INTEGER NOT NULL,
  month          INTEGER NOT NULL,
  year           INTEGER NOT NULL,
  timestamp      INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS expenses_user_ts_idx ON expenses (user_id, timestamp);

CREATE TABLE IF NOT EXISTS orders (
  user_id        TEXT NOT NULL,
  id             TEXT NOT NULL,
  descricao      TEXT NOT NULL DEFAULT '',
  preco_centavos INTEGER NOT NULL DEFAULT 0,
  quantidade     INTEGER NOT NULL DEFAULT 1,
  custo_centavos INTEGER NOT NULL DEFAULT 0,
  cliente        TEXT NOT NULL DEFAULT '',
  contato        TEXT NOT NULL DEFAULT '',
  delivery_day   INTEGER NOT NULL,
  delivery_month INTEGER NOT NULL,
  delivery_year  INTEGER NOT NULL,
  delivery_hour  INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'entregue')),
  timestamp      INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id TEXT NOT NULL,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, key)
);
`;
