import { t } from '../i18n.js';
import { request } from '../http.js';
import { validate } from '../formatting.js';
import { createQueuedProvider } from './queued.js';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

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
        throw new Error(t('batchMarkers'));
      if (i === 0) {
        if (text.slice(0, at).trim()) throw new Error(t('invalidBatch'));
      } else result.push(text.slice(end, at).trim());
      end = at + token.length;
    }
    if (text.slice(end).trim()) throw new Error(t('invalidBatch'));
    return validate(result, count);
  }
  async function fetchTranslation(text, to, signal) {
    const headers = { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' };
    const data = await request(
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
        encodeURIComponent(to) +
        '&dt=t&ie=UTF-8&oe=UTF-8&otf=1&ssel=0&tsel=0&kc=7&dt=at&dt=bd&dt=ex&dt=ld&dt=md&dt=qca&dt=rw&dt=rm&dt=ss&q=' +
        encodeURIComponent(text),
      headers,
      signal,
    );
    if (
      !Array.isArray(data?.[0]) ||
      data[0].length > 1000 ||
      data[0].some((row) => !Array.isArray(row) || typeof row[0] !== 'string')
    )
      throw new Error(t('invalidBatch'));
    return data[0].map((row) => row[0]).join('');
  }
  return createQueuedProvider({
    id: 'google-free',
    name: 'Google',
    async fetchParts(texts, to, signal) {
      const joined = texts.length > 1 ? joinBatch(texts) : null;
      const full = await fetchTranslation(joined ? joined.text : texts[0], to, signal);
      return joined ? splitBatch(full, texts.length, joined.marker) : validate([full], 1);
    },
  });
}
