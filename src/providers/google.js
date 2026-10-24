import { request, HttpError, InvalidResponseError } from '../http.js';
import { validate } from '../formatting.js';
import { createQueuedProvider } from './queued.js';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
// Google rejects some larger form bodies; bound the encoded size rather than the text length.
const MAX_ENCODED_BATCH = 10000;

/** @returns {import('../provider.js').Provider} */
export function createGoogleProvider() {
  function joinBatch(texts) {
    let tag = 900000;
    while (texts.some((text) => text.includes('⟦' + tag + ':'))) tag++;
    const marker = (i) => '⟦' + tag + ':' + i + '⟧';
    return {
      text: texts.map((text, i) => marker(i) + '\n' + text + '\n').join('') + marker(texts.length),
      marker,
    };
  }
  function splitBatch(text, count, marker) {
    const result = [];
    let end = 0;
    for (let i = 0; i <= count; i++) {
      const token = marker(i),
        at = text.indexOf(token, end);
      if (at < 0 || text.indexOf(token, at + token.length) !== -1)
        throw new InvalidResponseError('batchMarkers');
      if (i === 0) {
        if (text.slice(0, at).trim()) throw new InvalidResponseError();
      } else result.push(text.slice(end, at).trim());
      end = at + token.length;
    }
    if (text.slice(end).trim()) throw new InvalidResponseError();
    return validate(result, count);
  }
  async function fetchTranslation(text, to, signal) {
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    };
    let data;
    try {
      // Text goes in the form body: long non-Latin text exceeds Google's URL limit.
      data = await request(
        'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
          encodeURIComponent(to) +
          '&dt=t&ie=UTF-8&oe=UTF-8',
        headers,
        signal,
        'q=' + encodeURIComponent(text),
      );
    } catch (error) {
      // Google answers automated-traffic blocks with a redirect to its CAPTCHA page.
      if (error instanceof HttpError && error.status >= 300 && error.status < 400)
        error.rateLimited = true;
      throw error;
    }
    const rows = data?.[0];
    if (!Array.isArray(rows) || rows.length > 1000 || !rows.every(Array.isArray))
      throw new InvalidResponseError();
    // Rows without a string translation carry romanization for non-Latin text.
    const translated = rows.filter((row) => typeof row[0] === 'string');
    if (!translated.length || rows.some((row) => row[0] != null && typeof row[0] !== 'string'))
      throw new InvalidResponseError();
    return translated.map((row) => row[0]).join('');
  }
  return createQueuedProvider({
    id: 'google',
    name: 'Google',
    batchSize: (text) => encodeURIComponent(text).length,
    batchLimit: MAX_ENCODED_BATCH,
    async fetchParts(texts, to, signal) {
      const joined = texts.length > 1 ? joinBatch(texts) : null;
      const full = await fetchTranslation(joined ? joined.text : texts[0], to, signal);
      return joined ? splitBatch(full, texts.length, joined.marker) : validate([full], 1);
    },
  });
}
