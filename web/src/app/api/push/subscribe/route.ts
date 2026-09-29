import { NextResponse } from 'next/server';
import type { PushSubscription } from 'web-push';
import { addSubscription, removeSubscriptionIfAuthMatches, subscriptionCount } from '@/server/pushStore';
import { clientIp, hasValidKeys, isValidPushEndpoint, rateLimited, readJsonBody } from '@/server/pushSecurity';

// web-push é um pacote Node (usa `crypto`), então esta rota precisa do runtime
// Node, não do Edge.
export const runtime = 'nodejs';

/**
 * Registra uma inscrição de push enviada pelo cliente (`pushService.subscribeToPush`).
 *
 * ## Por que a validação é estrita
 * A rota é necessariamente anônima — o navegador se inscreve antes de existir
 * qualquer sessão. Sem validar o que entra, dois abusos ficam disponíveis:
 *
 * 1. **SSRF por procuração.** O `endpoint` é a URL que o servidor chamará, com
 *    credenciais VAPID, a cada disparo. Aceitar um endpoint arbitrário
 *    transformava o backend num cliente HTTP autenticado apontando para onde
 *    o atacante quisesse. Só hosts de serviços de push de navegador passam.
 * 2. **Exaustão de memória.** O store vive no processo; inscrições falsas em
 *    volume o derrubariam. O teto de [MAX_SUBSCRIPTIONS] limita o estrago.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Limite por IP (best-effort: o estado é do processo) contra quem tenta
  // encher o store com inscrições falsas e esgotar as vagas das legítimas.
  if (rateLimited(`subscribe:${clientIp(request)}`)) {
    return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429 });
  }

  const subscription = await readJsonBody<PushSubscription>(request);
  if (!subscription) {
    return NextResponse.json({ error: 'JSON inválido ou corpo grande demais.' }, { status: 400 });
  }

  if (!isValidPushEndpoint(subscription.endpoint) || !hasValidKeys(subscription.keys)) {
    return NextResponse.json({ error: 'Inscrição de push inválida.' }, { status: 400 });
  }

  if (!addSubscription(subscription)) {
    return NextResponse.json(
      { error: 'Limite de inscrições atingido.' },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, count: subscriptionCount() }, { status: 201 });
}

/** Cancela uma inscrição; exige o `keys.auth` da própria inscrição além do `endpoint`. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const body = await readJsonBody<{ endpoint?: string; keys?: { auth?: string } }>(request);
  if (!body) {
    return NextResponse.json({ error: 'JSON inválido ou corpo grande demais.' }, { status: 400 });
  }
  if (typeof body.endpoint !== 'string' || body.endpoint.length === 0) {
    return NextResponse.json({ error: 'endpoint ausente.' }, { status: 400 });
  }

  const auth = body.keys?.auth;
  if (typeof auth !== 'string' || !removeSubscriptionIfAuthMatches(body.endpoint, auth)) {
    return NextResponse.json({ error: 'Inscrição não encontrada.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, count: subscriptionCount() });
}
