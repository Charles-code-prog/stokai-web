import { after, type NextRequest } from 'next/server';
import {
  checkCredentials, createSession, createUser, deleteSession, findUserByEmail, isSameOriginJson,
  markEmailVerified, normalizeEmail, passwordHashOf, SESSION_COOKIE, sessionCookie, setPassword,
  signupAllowed, userFromRequest, validPassword, verifyPassword, type SessionUser,
} from '@/lib/server/auth';
import { checkCode, hasActiveCode, issueCode, issueErrorMessage } from '@/lib/server/email-codes';
import { fail, handle, json } from '@/lib/server/http';
import { emailConfigured } from '@/lib/server/notify';

type Ctx = { params: Promise<{ action: string }> };

const publicUser = (u: SessionUser) => ({ id: u.id, email: u.email, emailVerified: u.emailVerified });

/** GET /api/auth/me → usuário logado (ou null) */
export async function GET(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { action } = await params;
    if (action !== 'me') return fail('Não encontrado', 404);
    const user = await userFromRequest(req);
    return json({
      user: user ? publicUser(user) : null,
      signupAllowed: signupAllowed(),
      emailEnabled: emailConfigured(),
    });
  });
}

/**
 * POST /api/auth/{login|signup|logout|password|verify|resend|forgot|reset}
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    if (!isSameOriginJson(req)) return fail('Requisição inválida', 403);
    const { action } = await params;
    const body = await req.json().catch(() => ({}));

    if (action === 'login' || action === 'signup') {
      const email = normalizeEmail(body.email);
      if (!email) return fail('E-mail inválido.', 400);
      if (!validPassword(body.password)) return fail('A senha precisa ter pelo menos 6 caracteres.', 400);

      let user: SessionUser | null;
      let codeSent: boolean | undefined;
      if (action === 'signup') {
        if (!signupAllowed()) return fail('Novos cadastros estão desativados neste Stokai.', 403);
        user = await createUser(email, body.password);
        if (!user) return fail('Este e-mail já tem conta. Use "Entrar".', 409);
        if (!user.emailVerified) codeSent = (await issueCode(user.id, user.email, 'verify')).ok;
      } else {
        user = await checkCredentials(email, body.password);
        if (!user) return fail('E-mail ou senha incorretos.', 401);
        // Ainda não confirmou: manda um código se não houver um válido
        if (!user.emailVerified && !(await hasActiveCode(user.id, 'verify'))) {
          codeSent = (await issueCode(user.id, user.email, 'verify')).ok;
        }
      }
      const res = json({ user: publicUser(user), codeSent });
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

    // ── Confirmação de e-mail (usuário logado, ainda não confirmado) ──────────
    if (action === 'verify' || action === 'resend') {
      const user = await userFromRequest(req);
      if (!user) return fail('Sessão expirada. Entre de novo.', 401);
      if (user.emailVerified) return json({ user: publicUser(user) });

      if (action === 'resend') {
        const r = await issueCode(user.id, user.email, 'verify');
        if (!r.ok) { const e = issueErrorMessage(r); return fail(e.message, e.status); }
        return json({ ok: true });
      }

      const result = await checkCode(user.id, 'verify', body.code);
      if (result === 'wrong') return fail('Código incorreto. Confira o e-mail e tente de novo.', 400);
      if (result === 'expired') return fail('Código expirado. Toque em "Reenviar código".', 400);
      await markEmailVerified(user.id);
      return json({ user: { ...publicUser(user), emailVerified: true } });
    }

    // ── Esqueci minha senha ───────────────────────────────────────────────────
    if (action === 'forgot') {
      if (!emailConfigured()) return fail('A recuperação por e-mail ainda não está ativada neste Stokai.', 503);
      const email = normalizeEmail(body.email);
      if (!email) return fail('E-mail inválido.', 400);
      const user = await findUserByEmail(email);
      // Mesma resposta exista ou não a conta (não revela quais e-mails estão cadastrados);
      // o envio roda depois da resposta para o tempo também não denunciar.
      if (user) after(() => issueCode(user.id, user.email, 'reset').then(() => undefined));
      return json({ ok: true });
    }

    if (action === 'reset') {
      const email = normalizeEmail(body.email);
      if (!email) return fail('E-mail inválido.', 400);
      if (!validPassword(body.password)) return fail('A nova senha precisa ter pelo menos 6 caracteres.', 400);
      const user = await findUserByEmail(email);
      const result = user ? await checkCode(user.id, 'reset', body.code) : 'wrong';
      if (!user || result === 'wrong') return fail('Código incorreto. Confira o e-mail e tente de novo.', 400);
      if (result === 'expired') return fail('Código expirado. Peça um novo.', 400);

      await setPassword(user.id, body.password); // encerra todas as sessões antigas
      await markEmailVerified(user.id);          // quem recebeu o código é dono do e-mail
      const res = json({ user: { ...publicUser(user), emailVerified: true } });
      res.cookies.set(sessionCookie(req, await createSession(user.id)));
      return res;
    }

    return fail('Não encontrado', 404);
  });
}
