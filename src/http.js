import { t } from './i18n.js';
import { MAX_COOLDOWN_MS } from './limits.js';

export class ConnectionError extends Error {
  constructor() {
    super(t('connectionFailed'));
  }
}

export class RateLimitError extends Error {}

/** A malformed or changed provider response; another provider may still succeed. */
export class InvalidResponseError extends Error {
  /** @param {Parameters<typeof t>[0]} key */
  constructor(key = 'invalidBatch') {
    super(t(key));
  }
}

export class HttpError extends Error {
  constructor(status, retryAfter) {
    super(status === 429 ? t('httpRateLimited') : t('http', { status }));
    this.status = status;
    /** Providers may mark other statuses, such as a block-page redirect, as rate limits. */
    this.rateLimited = status === 429;
    const seconds = Number(retryAfter);
    const until = Date.parse(retryAfter);
    this.retryAfterMs = Math.min(
      MAX_COOLDOWN_MS,
      Number.isFinite(seconds) && seconds > 0
        ? seconds * 1000
        : Number.isFinite(until)
          ? Math.max(0, until - Date.now())
          : 0,
    );
  }
}

/** @param {string} url @param {Record<string, string>} headers @param {AbortSignal} signal @param {string=} body */
export async function request(url, headers, signal, body = undefined) {
  let response;
  try {
    response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'manual',
      body,
      headers,
      signal,
      timeout: 23000,
    });
  } catch {
    throw signal.aborted ? new Error(t('cancelled')) : new ConnectionError();
  }
  if (!response.ok) {
    // Provider errors may contain source text; expose only the status and retry interval.
    throw new HttpError(response.status, response.headers?.get('retry-after') ?? '');
  }
  try {
    return await response.json();
  } catch {
    if (signal.aborted) throw new Error(t('cancelled'));
    throw new InvalidResponseError();
  }
}
