import { NextResponse } from 'next/server';
import { PushMessage, sendToAll } from '@/server/pushStore';
import {
  MAX_BODY_LENGTH,
  MAX_TITLE_LENGTH,
  clampNotificationText,
  readJsonBody,
  sameOriginPath,
  secretMatches,
} from '@/server/pushSecurity';

export const runtime = 'nodejs';

/**
 * Dispara um push para todos os inscritos — chamado quando um novo sorteio é
 * detectado. Pensado para ser acionado por um Vercel Cron (ou um webhook do
 * sincronizador), protegido pelo segredo compartilhado em `PUSH_SEND_SECRET`
 * (header `x-push-secret` ou `Authorization: Bearer <secret>`).
 *
 * ## Por que a rota falha fechada
 * A versão anterior só exigia o segredo `if (secret)` — sem a variável de
 * ambiente definida, a rota ficava **aberta a qualquer um**. Quem a
 * encontrasse escolheria o título, o texto e o destino do clique de uma
 * notificação entregue com o nome e o ícone do Volante+ a todos os inscritos.
 * Um deploy que esqueça de configurar o segredo não pode virar isso; agora a
 * ausência de configuração devolve 503 e nada é enviado.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.PUSH_SEND_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Envio de push não configurado: defina PUSH_SEND_SECRET.' },
      { status: 503 },
    );
  }

  const provided =
    request.headers.get('x-push-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (!secretMatches(provided, secret)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const body = await readJsonBody<Partial<PushMessage>>(request);
  if (!body) {
    return NextResponse.json({ error: 'JSON inválido ou corpo grande demais.' }, { status: 400 });
  }
  if (typeof body.title !== 'string' || typeof body.body !== 'string') {
    return NextResponse.json({ error: 'title e body são obrigatórios.' }, { status: 400 });
  }

  const title = clampNotificationText(body.title, MAX_TITLE_LENGTH);
  const text = clampNotificationText(body.body, MAX_BODY_LENGTH);
  if (!title || !text) {
    return NextResponse.json({ error: 'title e body não podem ser vazios.' }, { status: 400 });
  }

  // O destino do clique é normalizado para um caminho do próprio app: a
  // notificação não pode ser usada para abrir um site de terceiros.
  const message: PushMessage = { title, body: text, url: sameOriginPath(body.url) };

  try {
    const delivered = await sendToAll(message);
    return NextResponse.json({ ok: true, delivered });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Falha ao enviar.';
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
