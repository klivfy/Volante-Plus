import { NextResponse } from 'next/server';
import { PushMessage, sendToAll } from '@/server/pushStore';

export const runtime = 'nodejs';

/**
 * Dispara um push para todos os inscritos — chamado quando um novo sorteio é
 * detectado. Pensado para ser acionado por um Vercel Cron (ou um webhook do
 * sincronizador), protegido por um segredo compartilhado em `PUSH_SEND_SECRET`
 * (header `x-push-secret` ou `Authorization: Bearer <secret>`).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.PUSH_SEND_SECRET;
  if (secret) {
    const header =
      request.headers.get('x-push-secret') ??
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      '';
    if (header !== secret) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
  }

  let message: PushMessage;
  try {
    const body = (await request.json()) as Partial<PushMessage>;
    if (!body.title || !body.body) {
      return NextResponse.json({ error: 'title e body são obrigatórios.' }, { status: 400 });
    }
    message = { title: body.title, body: body.body, url: body.url };
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  try {
    const delivered = await sendToAll(message);
    return NextResponse.json({ ok: true, delivered });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Falha ao enviar.';
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
