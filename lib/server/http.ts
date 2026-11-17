import 'server-only';
import { NextResponse } from 'next/server';
import { ConfigError } from './db';
import { BadRequest } from './data';

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const fail = (message: string, status: number) => json({ error: message }, status);

/** Converte exceções em respostas JSON com mensagem em português. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BadRequest) return fail(err.message, 400);
    if (err instanceof ConfigError) return fail(err.message, 503);
    console.error('[stokai] erro no servidor', err);
    return fail('Erro no servidor. Tente de novo em instantes.', 500);
  }
}
