import { createCache } from '../cache.js';
import { t } from '../i18n.js';
import { get, put } from '../storage.js';
import { HttpError, RateLimitError } from '../http.js';
import { validate } from '../formatting.js';
import { MAX_COOLDOWN_MS, TRANSLATION_BUDGET_MS } from '../limits.js';

const MIN_REQUEST_INTERVAL_MS = 1800;
const BATCH_MAX_CHARS = 3500;
// An article arrives as many requests at once.
const MAX_QUEUE_ENTRIES = 1000;
const MAX_IN_FLIGHT = 3;
const MAX_BATCH_ENTRIES = 40;
const COLLECTION_WINDOW_MS = 60;
/** @type {[string, RegExp][]} */
const SCRIPTS = [
  ['han', /\p{Script=Han}/gu],
  ['hangul', /\p{Script=Hangul}/gu],
  ['cyrillic', /\p{Script=Cyrillic}/gu],
  ['arabic', /\p{Script=Arabic}/gu],
  ['hebrew', /\p{Script=Hebrew}/gu],
  ['greek', /\p{Script=Greek}/gu],
  ['thai', /\p{Script=Thai}/gu],
  ['devanagari', /\p{Script=Devanagari}/gu],
  ['latin', /\p{Script=Latin}/gu],
];

/** The dominant writing system, so text of unknown language is not batched with another script.
 * @param {string} text */
function writingSystem(text) {
  // Japanese mixes kana with Han characters.
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'kana';
  let best = 'other',
    count = 0;
  for (const [name, pattern] of SCRIPTS) {
    const found = text.match(pattern)?.length ?? 0;
    if (found > count) [best, count] = [name, found];
  }
  return best;
}

/**
 * Shared bounded queue, fragment caching, cancellation and persisted rate-limit cooldown.
 * `batchSize` measures a fragment against `batchLimit` when a service bounds its request size.
 * Services that detect one language per request keep each batch to one language or script;
 * `detectsEachText` lifts that for services that detect every text separately.
 * `busyInterval` spaces requests while more text is waiting, such as a long article.
 * @param {{id: string, name: string, fetchParts: (texts: string[], to: string, signal: AbortSignal) => Promise<string[]>, batchSize?: (text: string) => number, batchLimit?: number, detectsEachText?: boolean, busyInterval?: number}} config
 * @returns {import('../provider.js').Provider}
 */
export function createQueuedProvider({
  id,
  name,
  fetchParts,
  batchSize = (text) => text.length,
  batchLimit = BATCH_MAX_CHARS,
  detectsEachText = false,
  busyInterval = MIN_REQUEST_INTERVAL_MS,
}) {
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
  /** @param {any[]} entries @param {string} to */
  async function send(entries, to) {
    const controller = new AbortController();
    for (const entry of entries)
      entry.cancelBatch = () => {
        if (entries.every((e) => !e.waiters.size)) controller.abort();
      };
    try {
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
      if (error instanceof HttpError && error.rateLimited) {
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
  /** Batches start one interval apart; a long backlog keeps a few requests in flight at once. */
  async function processQueue() {
    if (running) return;
    running = true;
    /** @type {Set<Promise<void>>} */
    const inFlight = new Set();
    try {
      // Collect same-turn requests from different chats into one HTTP request.
      await new Promise((resolve) => setTimeout(() => resolve(undefined), COLLECTION_WINDOW_MS));
      for (;;) {
        if (blockedUntil > Date.now()) {
          for (const entry of [...pending.values()])
            if (!entry.sending) finishEntry(entry, cooldownError());
        }
        const waiting = [...pending.values()].some((entry) => !entry.sending);
        if (!waiting || inFlight.size >= MAX_IN_FLIGHT) {
          if (!inFlight.size) break;
          await Promise.race(inFlight);
          continue;
        }
        const delay = nextStart - Date.now();
        if (delay > 0) await new Promise((resolve) => setTimeout(() => resolve(undefined), delay));
        const entries = [];
        let to = '',
          group = '',
          size = 0;
        for (const entry of pending.values()) {
          if (entry.sending) continue;
          if (!entry.waiters.size) {
            pending.delete(entry.key);
            continue;
          }
          // Services detect one source language per request, so keep each batch to one.
          if (entries.length && (entry.to !== to || entry.group !== group)) continue;
          if (entries.length && size + batchSize(entry.text) + 40 > batchLimit) break;
          entries.push(entry);
          to = entry.to;
          group = entry.group;
          size += batchSize(entry.text) + 40;
          if (entries.length >= MAX_BATCH_ENTRIES) break;
        }
        if (!entries.length) continue;
        for (const entry of entries) entry.sending = true;
        const busy = [...pending.values()].some((entry) => !entry.sending);
        nextStart = Date.now() + (busy ? busyInterval : MIN_REQUEST_INTERVAL_MS);
        const task = send(entries, to).finally(() => inFlight.delete(task));
        inFlight.add(task);
      }
    } finally {
      running = false;
    }
  }
  function enqueuePart(text, to, from, signal) {
    if (signal.aborted) return Promise.reject(new Error(t('cancelled')));
    const key = JSON.stringify([to, from, text]);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (blockedUntil > Date.now()) return Promise.reject(cooldownError());
    if (text.length > 4000) return Promise.reject(new Error(t('fragmentTooLong')));
    let entry = pending.get(key);
    if (!entry) {
      if (pending.size >= MAX_QUEUE_ENTRIES) return Promise.reject(new Error(t('queueFull')));
      // The app often sends no detected language; then group by writing system instead.
      const group = detectsEachText
        ? ''
        : from
          ? 'language:' + from
          : 'script:' + writingSystem(text);
      entry = { key, text, to, group, waiters: new Set(), cancelBatch: null, sending: false };
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
    async translateParts(texts, to, signal, from = undefined) {
      return validate(
        await Promise.all(
          texts.map((text, i) =>
            enqueuePart(text, to, typeof from?.[i] === 'string' ? from[i] : null, signal),
          ),
        ),
        texts.length,
      );
    },
    clearCache: () => cache.clear(),
    // Text already waiting is sent first, so count its batches too.
    queueDelay() {
      let size = 0,
        count = 0;
      for (const entry of pending.values())
        if (!entry.sending) {
          size += batchSize(entry.text) + 40;
          count++;
        }
      const batches = Math.max(Math.ceil(size / batchLimit), Math.ceil(count / MAX_BATCH_ENTRIES));
      return Math.max(0, nextStart - Date.now()) + batches * busyInterval;
    },
    cooldownMessage: () => (blockedUntil > Date.now() ? cooldownError().message : ''),
  };
}
