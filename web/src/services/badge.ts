/**
 * Badging API (`navigator.setAppBadge`/`clearAppBadge`) — o "balãozinho" com
 * número sobre o ícone do PWA instalado. Best-effort: navegadores sem a API
 * simplesmente não fazem nada, sem lançar.
 */

interface BadgingNavigator {
  setAppBadge?(count?: number): Promise<void>;
  clearAppBadge?(): Promise<void>;
}

function badgingNavigator(): BadgingNavigator | null {
  const nav = (globalThis as { navigator?: BadgingNavigator }).navigator;
  return nav ?? null;
}

/** `true` se o ambiente atual expõe a Badging API. */
export function isBadgingSupported(): boolean {
  const nav = badgingNavigator();
  return !!nav && typeof nav.setAppBadge === 'function';
}

/** Define o badge com `count` (limpa quando `count <= 0`). */
export async function setBadge(count: number): Promise<void> {
  const nav = badgingNavigator();
  if (!nav) return;
  if (count > 0) {
    await nav.setAppBadge?.(count);
  } else {
    await nav.clearAppBadge?.();
  }
}

/** Remove o badge do ícone. */
export async function clearBadge(): Promise<void> {
  const nav = badgingNavigator();
  await nav?.clearAppBadge?.();
}
