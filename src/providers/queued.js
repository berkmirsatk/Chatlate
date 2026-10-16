import { createCache } from '../cache.js';
import { t } from '../i18n.js';
import { get, put } from '../storage.js';
import { HttpError, RateLimitError } from '../http.js';
import { validate } from '../formatting.js';
import { MAX_COOLDOWN_MS, TRANSLATION_BUDGET_MS } from '../limits.js';

const MIN_REQUEST_INTERVAL_MS = 1800;
const BATCH_MAX_CHARS = 3500;
const MAX_QUEUE_ENTRIES = 200;
const COLLECTION_WINDOW_MS = 60;

/**
 * Shared bounded queue, fragment caching, cancellation and persisted rate-limit cooldown.
 * @param {{id: string, name: string, fetchParts: (texts: string[], to: string, signal: AbortSignal) => Promise<string[]>}} config
 * @returns {import('../provider.js').Provider}
 */
export function createQueuedProvider({ id, name, fetchParts }) {
  // One shared queue across all chats and the connection-test button.
  const cache = createCache((value) => value.length);
  const pending = new Map();
  let running = false;
  let nextStart = 0;
  const storedCooldown = Number(get(id + '.blockedUntil', '0'));
  let blockedUntil = Number.isFinite(storedCooldown)
    ? Math.min(storedCooldown, Date.now() + MAX_COOLDOWN_MS)
    : 0;
  let consecutive429 = 0;
  function cooldownError() {
    return new RateLimitError(
      t('rateLimited', { seconds: Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000)) }),
    );
  }
  function finishEntry(entry, error, value = undefined) {
    if (pending.get(entry.key) === entry) pending.delete(entry.key);
    for (const waiter of [...entry.waiters]) waiter.finish(error, value);
  }
  async function processQueue() {
    if (running) return;
    running = true;
    try {
      // Collect same-turn requests from different chats into one HTTP request.
      await new Promise((resolve) => setTimeout(() => resolve(undefined), COLLECTION_WINDOW_MS));
      while (pending.size) {
        if (blockedUntil > Date.now()) {
          for (const entry of [...pending.values()]) finishEntry(entry, cooldownError());
          break;
        }
        const delay = nextStart - Date.now();
        if (delay > 0) await new Promise((resolve) => setTimeout(() => resolve(undefined), delay));
        const entries = [];
        let to = '',
          size = 0;
        for (const entry of pending.values()) {
          if (!entry.waiters.size) {
            pending.delete(entry.key);
            continue;
          }
          if (entries.length && entry.to !== to) continue;
          if (entries.length && size + entry.text.length + 40 > BATCH_MAX_CHARS) break;
          entries.push(entry);
          to = entry.to;
          size += entry.text.length + 40;
          if (entries.length >= 40) break;
        }
        if (!entries.length) continue;
        const controller = new AbortController();
        for (const entry of entries)
          entry.cancelBatch = () => {
            if (entries.every((e) => !e.waiters.size)) controller.abort();
          };
        try {
          nextStart = Date.now() + MIN_REQUEST_INTERVAL_MS;
          const results = validate(
            await fetchParts(
              entries.map((entry) => entry.text),
              to,
              controller.signal,
            ),
            entries.length,
          );
          consecutive429 = 0;
          for (let i = 0; i < entries.length; i++) {
            cache.set(entries[i].key, results[i]);
            finishEntry(entries[i], null, results[i]);
          }
        } catch (error) {
          if (error instanceof HttpError && error.status === 429) {
            consecutive429++;
            const backoff = Math.min(MAX_COOLDOWN_MS, 60000 * 2 ** Math.min(consecutive429 - 1, 4));
            blockedUntil = Date.now() + Math.max(backoff, error.retryAfterMs);
            // Reloading the plugin must not immediately hammer an already limited service.
            try {
              put(id + '.blockedUntil', String(blockedUntil));
            } catch {}
            error = cooldownError();
          }
          for (const entry of entries) finishEntry(entry, error);
        } finally {
          for (const entry of entries) entry.cancelBatch = null;
        }
      }
    } finally {
      running = false;
    }
  }
  function enqueuePart(text, to, signal) {
    if (signal.aborted) return Promise.reject(new Error(t('cancelled')));
    const key = JSON.stringify([to, text]);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (blockedUntil > Date.now()) return Promise.reject(cooldownError());
    if (text.length > 4000) return Promise.reject(new Error(t('fragmentTooLong')));
    let entry = pending.get(key);
    if (!entry) {
      if (pending.size >= MAX_QUEUE_ENTRIES) return Promise.reject(new Error(t('queueFull')));
      entry = { key, text, to, waiters: new Set(), cancelBatch: null };
      pending.set(key, entry);
    }
    const promise = new Promise((resolve, reject) => {
      let timer;
      let settled = false;
      const waiter = {
        finish(error, value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
          entry.waiters.delete(waiter);
          if (!entry.waiters.size) {
            if (pending.get(key) === entry) pending.delete(key);
            entry.cancelBatch?.();
          }
          if (error) reject(error);
          else resolve(value);
        },
      };
      const abort = () => waiter.finish(new Error(t('cancelled')));
      entry.waiters.add(waiter);
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => waiter.finish(new Error(t('queueTimeout'))), TRANSLATION_BUDGET_MS);
      if (signal.aborted) abort();
    });
    void processQueue();
    return promise;
  }

  return {
    id,
    name,
    async translateParts(texts, to, signal) {
      return validate(
        await Promise.all(texts.map((text) => enqueuePart(text, to, signal))),
        texts.length,
      );
    },
    clearCache: () => cache.clear(),
    cooldownMessage: () => (blockedUntil > Date.now() ? cooldownError().message : ''),
  };
}
