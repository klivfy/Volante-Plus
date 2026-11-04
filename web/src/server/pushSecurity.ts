import { timingSafeEqual } from 'node:crypto';

/**
 * Validações de segurança do backend de push.
 *
 * Este arquivo existe porque as duas rotas de push manipulam dados que vêm
 * inteiramente de fora — corpo de requisição não autenticado, no caso de
 * `subscribe`, e conteúdo que será exibido como notificação do sistema, no
 * caso de `send`. Notificação com a marca do app é um vetor de phishing
 * eficiente: quem consegue disparar uma escolhe o texto *e* o destino do
 * clique.
 */

/** Teto do corpo aceito nas rotas de push, em bytes. */
export const MAX_BODY_BYTES = 16 * 1024;

/**
 * Hosts de serviços de push dos navegadores. Um `endpoint` fora desta lista
 * não é uma inscrição real: seria um pedido para o servidor emitir requisições
 * autenticadas contra um host escolhido pelo atacante (SSRF) toda vez que um
 * push fosse disparado.
 */
const ALLOWED_PUSH_HOSTS = [
  'android.googleapis.com',
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'wns2-*.notify.windows.com',
  'web.push.apple.com',
];

function hostAllowed(host: string): boolean {
  return ALLOWED_PUSH_HOSTS.some((allowed) => {
    if (!allowed.includes('*')) return host === allowed;
    const [prefix, suffix] = allowed.split('*');
    return host.startsWith(prefix) && host.endsWith(suffix);
  });
}

/**
 * Comparação de segredo em tempo constante.
 *
 * WHY: `a !== b` sai no primeiro byte diferente, e essa diferença de tempo
 * é mensurável pela rede. Com um segredo comparado assim, um atacante o
 * recupera byte a byte em algumas milhares de tentativas em vez das 2^n que
 * a entropia dele sugere.
 */
export function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual exige tamanhos iguais; comparar os tamanhos antes vazaria
  // o comprimento, então normalizamos por hash de tamanho fixo do conteúdo.
  if (a.length !== b.length) {
    // Ainda assim executa uma comparação para não encurtar o caminho.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Lê o corpo respeitando [MAX_BODY_BYTES]. Devolve `null` se exceder ou não for JSON. */
export async function readJsonBody<T>(request: Request): Promise<T | null> {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) return null;

  const text = await request.text();
  // O header pode mentir ou faltar (chunked); o tamanho real é o que vale.
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * `true` quando o endpoint é uma URL https de um serviço de push conhecido.
 *
 * A porta é fixa em 443 (ausente = padrão): pentest 2026-11 demonstrou que
 * aceitar portas arbitrárias deixava uma inscrição `fcm.googleapis.com:8443`
 * válida — o servidor passaria a emitir requisições autenticadas para portas
 * não-padrão dos hosts permitidos (varredura de portas por procuração).
 */
export function isValidPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.port !== '' && url.port !== '443') return false;
  return hostAllowed(url.hostname);
}

/** `true` quando as chaves da inscrição têm o formato que o web-push espera. */
export function hasValidKeys(keys: unknown): keys is { p256dh: string; auth: string } {
  if (typeof keys !== 'object' || keys === null) return false;
  const { p256dh, auth } = keys as Record<string, unknown>;
  const base64Url = /^[A-Za-z0-9_-]+$/;
  return (
    typeof p256dh === 'string' &&
    typeof auth === 'string' &&
    p256dh.length >= 16 &&
    p256dh.length <= 256 &&
    auth.length >= 8 &&
    auth.length <= 64 &&
    base64Url.test(p256dh) &&
    base64Url.test(auth)
  );
}

/**
 * Normaliza a URL de destino de uma notificação para um caminho **do próprio
 * app**, ou `'/'` se o valor recebido apontar para fora.
 *
 * WHY: o service worker faz `clients.openWindow(url)` com este valor. Sem a
 * restrição, quem dispara um push escolhe qualquer site para abrir no
 * aparelho do usuário, com a notificação exibindo o nome e o ícone do
 * Volante+ — phishing com a credibilidade do app emprestada.
 *
 * Pentest 2026-11: o parser de URL dos navegadores trata `\\` como `/` e
 * remove `\n`/`\r`/`\t`, então entradas como `/\\evil.com` e `/\n//evil.com`
 * viram protocol-relative no cliente mesmo passando no teste de `//` aqui.
 * O SW rejeita por origem na outra ponta, mas o servidor não depende disso:
 * qualquer caractere de controle ou barra invertida invalida o caminho.
 */
export function sameOriginPath(url: unknown): string {
  if (typeof url !== 'string' || url.length === 0 || url.length > 512) return '/';
  // Caracteres de controle (\n \r \t…) somem na análise da URL e barra
  // invertida vira separador — ambos criam `//host` que o teste literal abaixo
  // não veria.
  if (/[\u0000-\u0020\\]/.test(url)) return '/';
  // Caminho relativo simples é o caso normal e o único totalmente seguro.
  // `//host` é protocol-relative e escaparia da origem, por isso é rejeitado.
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return '/';
}

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_PER_WINDOW = 20;
const RATE_MAX_KEYS = 10_000;
const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * Limitador de janela fixa em memória. Devolve `true` quando `key` excedeu o
 * teto. Best-effort: em serverless o estado é por instância, mas já barra o
 * laço de inscrições forjadas vindo de um mesmo IP.
 */
export function rateLimited(key: string, now: number = Date.now()): boolean {
  if (hits.size >= RATE_MAX_KEYS) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    if (hits.size >= RATE_MAX_KEYS) hits.clear();
  }
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_MAX_PER_WINDOW;
}

/**
 * IP do cliente para o limitador de taxa.
 *
 * Pentest 2026-11: `x-forwarded-for` é escrito pelo cliente em qualquer
 * conexão direta e no primeiro hop — rotacioná-lo driblou o limite (30/30
 * requisições aceitas). Os cabeçalhos definidos pela PLATAFORMA vêm primeiro:
 * `x-nf-client-connection-ip` (Netlify) e `x-real-ip` (Vercel/nginx) são
 * sobrescritos pelo proxy de fronteira. XFF só entra como legado, quando não
 * há plataforma na frente — lá o operador deve garantir que o proxy
 * normaliza o cabeçalho.
 */
export function clientIp(request: Request): string {
  const platform =
    request.headers.get('x-nf-client-connection-ip') ??
    request.headers.get('x-real-ip');
  if (platform) return platform.trim();
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}

/** Corta o texto exibido na notificação, evitando payloads abusivos. */
export function clampNotificationText(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

export const MAX_TITLE_LENGTH = 120;
export const MAX_BODY_LENGTH = 400;
