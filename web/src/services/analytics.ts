/**
 * Plausible Analytics wrapper for tracking user interactions and app events.
 * Plausible is privacy-first and doesn't require cookie consent in most jurisdictions.
 */

export interface PlausibleEvent {
  name: string;
  props?: Record<string, string | number | boolean | undefined>;
}

/**
 * Track a custom event in Plausible Analytics.
 * Only works if `window.plausible` is available (Plausible script loaded).
 */
export function trackEvent(event: PlausibleEvent): void {
  if (typeof window === 'undefined' || !window.plausible) {
    return;
  }

  window.plausible(event.name, { props: event.props });
}

/**
 * Track game generation event.
 */
export function trackGameGeneration(params: {
  lottery: string;
  batchSize: number;
}): void {
  trackEvent({
    name: 'game_generation',
    props: {
      lottery: params.lottery,
      batch_size: params.batchSize,
    },
  });
}

/**
 * Track backtest analysis event.
 */
export function trackBacktestAnalysis(params: {
  lottery: string;
  source: 'auto' | 'manual' | 'seed';
}): void {
  trackEvent({
    name: 'backtest_analysis',
    props: {
      lottery: params.lottery,
      source: params.source,
    },
  });
}

/**
 * Track usage of backtest data in game generation.
 */
export function trackBacktestDataUsage(params: {
  lottery: string;
  dataSource: 'manual' | 'auto' | 'worker-computed';
}): void {
  trackEvent({
    name: 'backtest_data_usage',
    props: {
      lottery: params.lottery,
      data_source: params.dataSource,
    },
  });
}

/**
 * Track lottery selection change.
 */
export function trackLotterySelection(lottery: string): void {
  trackEvent({
    name: 'lottery_selection',
    props: {
      lottery,
    },
  });
}

/**
 * Extend window to include plausible function.
 */
declare global {
  interface Window {
    plausible?: (eventName: string, options: { props?: Record<string, string | number | boolean | undefined> }) => void;
  }
}
