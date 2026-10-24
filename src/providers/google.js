import { request, HttpError, InvalidResponseError } from '../http.js';
import { createQueuedProvider } from './queued.js';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
// Google rejects some larger form bodies; bound the encoded size rather than the text length.
const MAX_ENCODED_BATCH = 10000;

/** This endpoint reads text as HTML, so keep literal markup and entities as text.
 * @param {string} text */
const escape = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const encodedSize = (text) => encodeURIComponent(escape(text)).length;

/** @returns {import('../provider.js').Provider} */
export function createGoogleProvider() {
  return createQueuedProvider({
    id: 'google',
    name: 'Google',
    batchSize: encodedSize,
    batchLimit: MAX_ENCODED_BATCH,
    // Each text is detected separately, so one request may mix languages.
    detectsEachText: true,
    async fetchParts(texts, to, signal) {
      const headers = {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      };
      let data;
      try {
        // Text goes in the form body: long non-Latin text exceeds Google's URL limit.
        data = await request(
          'https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=' +
            encodeURIComponent(to),
          headers,
          signal,
          texts.map((text) => 'q=' + encodeURIComponent(escape(text))).join('&'),
        );
      } catch (error) {
        if (error instanceof HttpError) {
          // Google answers automated-traffic blocks with a redirect to its CAPTCHA page.
          if (error.status >= 300 && error.status < 400) error.rateLimited = error.temporary = true;
          // Some Google front ends reject large form bodies that others accept.
          if (error.status === 405 || error.status === 413) error.temporary = true;
        }
        throw error;
      }
      // Each text yields [translation, detected language]; a lone text may come back unwrapped.
      const items = texts.length === 1 && typeof data?.[0] === 'string' ? [data] : data;
      if (!Array.isArray(items) || items.length !== texts.length) throw new InvalidResponseError();
      return items.map((item) => {
        const translated = typeof item === 'string' ? item : Array.isArray(item) ? item[0] : null;
        if (typeof translated !== 'string') throw new InvalidResponseError();
        return translated;
      });
    },
  });
}
