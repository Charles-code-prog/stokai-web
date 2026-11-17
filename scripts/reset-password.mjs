// Redefine a senha de uma conta direto no banco (não há envio de e-mail no Stokai).
//
// Uso (PowerShell ou terminal, dentro da pasta stokai-web):
//   node --env-file=.env.local scripts/reset-password.mjs email@exemplo.com novaSenha
//
// O .env.local precisa ter TURSO_DATABASE_URL e TURSO_AUTH_TOKEN (os mesmos do Vercel).
import { createClient } from '@libsql/client';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 6) {
  console.error('Uso: node --env-file=.env.local scripts/reset-password.mjs <email> <nova senha (mín. 6)>');
  process.exit(1);
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:stokai-local.db',
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

const salt = randomBytes(16);
const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const stored = `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;

const user = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email.trim().toLowerCase()] });
if (!user.rows[0]) {
  console.error(`Nenhuma conta com o e-mail ${email}.`);
  process.exit(1);
}
const id = String(user.rows[0].id);
await db.batch([
  { sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [stored, id] },
  { sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] },
], 'write');
console.log(`Senha de ${email} redefinida. Todos os aparelhos precisarão entrar de novo.`);
