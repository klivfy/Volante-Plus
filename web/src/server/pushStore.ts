import webpush, { PushSubscription, WebPushError } from 'web-push';

/**
 * Backend de push minimalista para rodar como função serverless (Vercel).
 *
 * IMPORTANTE — persistência: as inscrições vivem em memória do processo. Numa
 * função serverless isso significa que **não** sobrevivem a cold starts nem são
 * compartilhadas entre instâncias — é um esqueleto funcional para demonstração
 * e desenvolvimento. Em produção, troque `store` por um armazenamento real
 * (KV/Redis/Postgres); a interface (`addSubscription`/`removeSubscription`/
 * `sendToAll`) foi desenhada para que só esta camada precise mudar.
 *
 * Chaves VAPID vêm do ambiente:
 * - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (gere com `npx web-push generate-vapid-keys`)
 * - `VAPID_SUBJECT` (mailto: ou URL do app)
 */

const store = new Map<string, PushSubscription>();

let configured = false;

/** Configura o web-push com as chaves VAPID do ambiente. Retorna `false` se faltarem chaves. */
export function configureWebPush(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:contato@volante.plus';
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * Teto de inscrições mantidas em memória.
 *
 * WHY: o store é um `Map` no processo e a rota de inscrição é anônima por
 * necessidade. Sem teto, um laço de requisições forjadas cresce o mapa até
 * derrubar a função. O limite escolhido cabe folgadamente numa função
 * serverless e é ordens de grandeza maior que a base real esperada.
 */
export const MAX_SUBSCRIPTIONS = 50_000;

/**
 * Registra a inscrição. Devolve `false` quando o teto foi atingido — o
 * chamador responde 503 em vez de aceitar em silêncio e estourar a memória.
 */
export function addSubscription(subscription: PushSubscription): boolean {
  if (!store.has(subscription.endpoint) && store.size >= MAX_SUBSCRIPTIONS) return false;
  store.set(subscription.endpoint, subscription);
  return true;
}

export function removeSubscription(endpoint: string): void {
  store.delete(endpoint);
}

/**
 * Remove a inscrição só se `auth` for o segredo `keys.auth` guardado para o
 * endpoint — quem conhece apenas a URL não consegue cancelar a de outro.
 * Devolve `true` se removeu.
 */
export function removeSubscriptionIfAuthMatches(endpoint: string, auth: string): boolean {
  const existing = store.get(endpoint);
  if (!existing || existing.keys?.auth !== auth) return false;
  store.delete(endpoint);
  return true;
}

export function subscriptionCount(): number {
  return store.size;
}

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
}

/**
 * Envia `message` para todas as inscrições. Inscrições rejeitadas com 404/410
 * (o navegador cancelou/expirou) são removidas do store. Retorna quantas foram
 * entregues com sucesso.
 */
export async function sendToAll(message: PushMessage): Promise<number> {
  if (!configureWebPush()) {
    throw new Error('Chaves VAPID ausentes: defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.');
  }

  const payload = JSON.stringify(message);
  let delivered = 0;

  await Promise.all(
    [...store.values()].map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, payload);
        delivered++;
      } catch (error) {
        const statusCode = error instanceof WebPushError ? error.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          store.delete(subscription.endpoint);
        }
      }
    }),
  );

  return delivered;
}
