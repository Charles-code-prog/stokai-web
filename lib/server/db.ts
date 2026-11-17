import 'server-only';
import { createClient, type Client } from '@libsql/client';
import { SCHEMA_SQL } from './schema';

/**
 * Conexão com o Turso. Só roda no servidor: o token do banco nunca vai para o navegador.
 *
 * - Produção (Vercel): TURSO_DATABASE_URL=libsql://...turso.io + TURSO_AUTH_TOKEN
 * - Desenvolvimento sem variáveis: arquivo local stokai-local.db (mesmo motor libSQL)
 */
let client: Client | null = null;
let ready: Promise<void> | null = null;

export class ConfigError extends Error {}

function getClient(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL || (process.env.VERCEL ? '' : 'file:stokai-local.db');
  if (!url) {
    throw new ConfigError('Banco não configurado: defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no Vercel.');
  }
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  return client;
}

/** Cliente pronto para uso, com as tabelas criadas (uma vez por instância do servidor). */
export async function db(): Promise<Client> {
  const c = getClient();
  if (!ready) {
    ready = c
      .batch(splitStatements(SCHEMA_SQL), 'write')
      .then(() => undefined)
      .catch(err => {
        ready = null; // tenta de novo na próxima requisição
        throw err;
      });
  }
  await ready;
  return c;
}

function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}
