import type { NextRequest } from 'next/server';
import {
  checkCredentials, createSession, createUser, deleteSession, isSameOriginJson, normalizeEmail,
  passwordHashOf, SESSION_COOKIE, sessionCookie, setPassword, signupAllowed, userFromRequest,
  validPassword, verifyPassword,
} from '@/lib/server/auth';
import { fail, handle, json } from '@/lib/server/http';

type Ctx = { params: Promise<{ action: string }> };

/** GET /api/auth/me → usuário logado (ou null) */
export async function GET(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { action } = await params;
    if (action !== 'me') return fail('Não encontrado', 404);
    const user = await userFromRequest(req);
    return json({ user: user ? { id: user.id, email: user.email } : null, signupAllowed: signupAllowed() });
  });
}

/** POST /api/auth/{login|signup|logout|password} */
export async function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    if (!isSameOriginJson(req)) return fail('Requisição inválida', 403);
    const { action } = await params;
    const body = await req.json().catch(() => ({}));

    if (action === 'login' || action === 'signup') {
      const email = normalizeEmail(body.email);
      if (!email) return fail('E-mail inválido.', 400);
      if (!validPassword(body.password)) return fail('A senha precisa ter pelo menos 6 caracteres.', 400);

      let user;
      if (action === 'signup') {
        if (!signupAllowed()) return fail('Novos cadastros estão desativados neste Stokai.', 403);
        user = await createUser(email, body.password);
        if (!user) return fail('Este e-mail já tem conta. Use "Entrar".', 409);
      } else {
        user = await checkCredentials(email, body.password);
        if (!user) return fail('E-mail ou senha incorretos.', 401);
      }
      const res = json({ user });
      res.cookies.set(sessionCookie(req, await createSession(user.id)));
      return res;
    }

    if (action === 'logout') {
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      if (token) await deleteSession(token);
      const res = json({ ok: true });
      res.cookies.set(sessionCookie(req, '', 0));
      return res;
    }

    if (action === 'password') {
      const user = await userFromRequest(req);
      if (!user) return fail('Sessão expirada. Entre de novo.', 401);
      const stored = await passwordHashOf(user.id);
      if (!stored || typeof body.current !== 'string' || !(await verifyPassword(body.current, stored))) {
        return fail('Senha atual incorreta.', 400);
      }
      if (!validPassword(body.password)) return fail('A nova senha precisa ter pelo menos 6 caracteres.', 400);
      await setPassword(user.id, body.password, user.tokenHash);
      return json({ ok: true });
    }

    return fail('Não encontrado', 404);
  });
}
