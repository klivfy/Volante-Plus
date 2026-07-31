import { NextResponse } from 'next/server';
import type { PushSubscription } from 'web-push';
import { addSubscription, removeSubscription, subscriptionCount } from '@/server/pushStore';

// web-push é um pacote Node (usa `crypto`), então esta rota precisa do runtime
// Node, não do Edge.
export const runtime = 'nodejs';

/** Registra uma inscrição de push enviada pelo cliente (`pushService.subscribeToPush`). */
export async function POST(request: Request): Promise<NextResponse> {
  let subscription: PushSubscription;
  try {
    subscription = (await request.json()) as PushSubscription;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (!subscription?.endpoint || !subscription.keys) {
    return NextResponse.json({ error: 'Inscrição de push inválida.' }, { status: 400 });
  }

  addSubscription(subscription);
  return NextResponse.json({ ok: true, count: subscriptionCount() }, { status: 201 });
}

/** Cancela uma inscrição pelo seu `endpoint`. */
export async function DELETE(request: Request): Promise<NextResponse> {
  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (!body.endpoint) {
    return NextResponse.json({ error: 'endpoint ausente.' }, { status: 400 });
  }

  removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true, count: subscriptionCount() });
}
