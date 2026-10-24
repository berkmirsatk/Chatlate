import { get } from './storage.js';
import { t } from './i18n.js';
import { ConnectionError, HttpError, InvalidResponseError, RateLimitError } from './http.js';
import { TRANSLATION_BUDGET_MS } from './limits.js';

/**
 * The host-selected provider stays first; saved priorities supply the remaining attempts.
 * Unknown, duplicate or malformed stored IDs never become network destinations.
 * @param {import('./provider.js').Provider} primary
 * @param {import('./provider.js').Provider[]} providers
 */
export function getProviderOrder(primary, providers) {
  let ids;
  try {
    ids = JSON.parse(get('fallback', '[]'));
  } catch {
    ids = [];
  }
  if (!Array.isArray(ids)) ids = [];
  const order = [primary];
  for (const id of ids) {
    const provider = providers.find((item) => item.id === id);
    if (provider && !order.includes(provider)) order.push(provider);
  }
  return order;
}

/** @param {unknown} error */
function recoverable(error) {
  return (
    error instanceof ConnectionError ||
    error instanceof RateLimitError ||
    error instanceof InvalidResponseError ||
    (error instanceof HttpError && error.temporary)
  );
}

/**
 * Bound each attempt without cancelling other subscribers to a shared provider queue.
 * @param {import('./provider.js').Provider} provider
 * @param {readonly string[]} texts
 * @param {string} to
 * @param {AbortSignal} signal
 * @param {number} budget
 * @param {readonly (string | null)[]} [from]
 */
async function attempt(provider, texts, to, signal, budget, from = undefined) {
  if (signal.aborted) throw new Error(t('cancelled'));
  const controller = new AbortController();
  let expired = false;
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort);
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, budget);
  try {
    return await provider.translateParts(texts, to, controller.signal, from);
  } catch (error) {
    if (signal.aborted) throw new Error(t('cancelled'));
    if (expired) throw new ConnectionError();
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    // Discard outstanding fragments if another fragment failed in this attempt.
    controller.abort();
  }
}

/** @param {import('./provider.js').Provider} primary @param {import('./provider.js').Provider[]} providers @returns {import('./provider.js').Provider} */
export function withFallback(primary, providers) {
  return {
    ...primary,
    cacheContext: () => JSON.stringify(getProviderOrder(primary, providers).map((item) => item.id)),
    async translateParts(texts, to, signal, from = undefined) {
      const order = getProviderOrder(primary, providers);
      if (order.length === 1) return primary.translateParts(texts, to, signal, from);
      const deadline = Date.now() + TRANSLATION_BUDGET_MS;
      for (const [index, provider] of order.entries()) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new ConnectionError();
        // Switch promptly to backups while retaining the shared host budget.
        const budget =
          index === order.length - 1
            ? remaining
            : Math.min(5000, Math.floor(remaining / (order.length - index)));
        try {
          return await attempt(provider, texts, to, signal, Math.max(1, budget), from);
        } catch (error) {
          if (signal.aborted || !recoverable(error) || index === order.length - 1) throw error;
          // Retry complete fragment sets; never mix provider outputs within a message.
        }
      }
      throw new ConnectionError();
    },
  };
}
