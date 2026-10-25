import { get } from './storage.js';
import { t } from './i18n.js';
import { ConnectionError, HttpError, InvalidResponseError, RateLimitError } from './http.js';
import { TRANSLATION_BUDGET_MS } from './limits.js';

// A service that answers slower than this hands the text to the next one in the order.
const ATTEMPT_MS = 3500;
// An unresponsive service moves to the end of the order for a while.
const SLOW_MS = 60000;
const NOTICE_INTERVAL_MS = 60000;
const slowUntil = new Map();
const noticeShown = new Map();
/** @type {(text: string) => void} */
let notify = () => {};

/** @param {(text: string) => void} listener Receives a short note when a backup service translated. */
export function onProviderSwitch(listener) {
  notify = listener;
}

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

/** @param {unknown} error */
function switchReason(error) {
  if (error instanceof RateLimitError || (error instanceof HttpError && error.rateLimited))
    return 'switchedLimited';
  return error instanceof ConnectionError ? 'switchedSlow' : 'switchedFailed';
}

/** @param {import('./provider.js').Provider} primary @param {import('./provider.js').Provider[]} providers @returns {import('./provider.js').Provider} */
export function withFallback(primary, providers) {
  return {
    ...primary,
    async translateParts(texts, to, signal, from = undefined) {
      const preferred = getProviderOrder(primary, providers);
      if (preferred.length === 1) return primary.translateParts(texts, to, signal, from);
      const now = Date.now();
      const slow = (provider) => (slowUntil.get(provider.id) ?? 0) > now;
      // Recently unresponsive services are tried last instead of delaying every message.
      const order = [...preferred.filter((provider) => !slow(provider)), ...preferred.filter(slow)];
      const deadline = now + TRANSLATION_BUDGET_MS;
      let firstError;
      for (const [index, provider] of order.entries()) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new ConnectionError();
        // Switch promptly to backups while retaining the shared host budget.
        const budget =
          index === order.length - 1
            ? remaining
            : Math.min(
                // Waiting for the service's own request spacing is not slowness.
                ATTEMPT_MS + (provider.queueDelay?.() ?? 0),
                Math.floor(remaining / (order.length - index)),
              );
        try {
          const result = await attempt(provider, texts, to, signal, Math.max(1, budget), from);
          slowUntil.delete(provider.id);
          if (provider !== preferred[0]) announce(preferred[0], provider, firstError);
          return result;
        } catch (error) {
          if (signal.aborted || !recoverable(error) || index === order.length - 1) throw error;
          if (error instanceof ConnectionError) slowUntil.set(provider.id, Date.now() + SLOW_MS);
          if (provider === preferred[0]) firstError = error;
          // Retry complete fragment sets; never mix provider outputs within a message.
        }
      }
      throw new ConnectionError();
    },
  };
}

/** One short note per service pair and minute, so a whole chat does not repeat it.
 * @param {import('./provider.js').Provider} preferred @param {import('./provider.js').Provider} used @param {unknown} error */
function announce(preferred, used, error) {
  const key = preferred.id + '>' + used.id;
  if ((noticeShown.get(key) ?? 0) > Date.now()) return;
  noticeShown.set(key, Date.now() + NOTICE_INTERVAL_MS);
  // A skipped slow service has no error of its own in this request.
  const reason = error === undefined ? 'switchedSlow' : switchReason(error);
  try {
    notify(t(reason, { from: preferred.name, to: used.name }));
  } catch {
    /* a missing notice must never fail a finished translation */
  }
}
