import { request, HttpError, InvalidResponseError } from '../http.js';
import { createQueuedProvider } from './queued.js';

// Microsoft accepts up to 50,000 characters per request; stay well below it.
const MAX_BATCH_CHARS = 10000;
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** Microsoft names Chinese by script and uses modern codes for legacy aliases.
 * @param {string} language */
export function microsoftLanguage(language) {
  const code = language.toLowerCase().replace('_', '-');
  if (['zh-tw', 'zh-hk', 'zh-mo', 'zh-hant'].includes(code)) return 'zh-Hant';
  if (code === 'zh' || code.startsWith('zh-')) return 'zh-Hans';
  if (code === 'pt-pt') return 'pt-pt';
  if (code === 'sr') return 'sr-Cyrl';
  if (code === 'mn') return 'mn-Cyrl';
  const base = code.split('-')[0];
  return { iw: 'he', in: 'id', no: 'nb', tl: 'fil' }[base] ?? base;
}

/** The service escapes some markup characters in its output; undo what the source did not contain.
 * @param {string} source @param {string} translated */
function unescape(source, translated) {
  let text = translated;
  for (const [entity, char] of Object.entries(ENTITIES))
    if (!source.includes(entity)) text = text.replaceAll(entity, char);
  return text;
}

/** @returns {import('../provider.js').Provider} */
export function createMicrosoftProvider() {
  return createQueuedProvider({
    id: 'microsoft',
    name: 'Microsoft',
    batchLimit: MAX_BATCH_CHARS,
    // Each text is detected separately, so one request may mix languages.
    detectsEachText: true,
    async fetchParts(texts, to, signal) {
      let data;
      try {
        // The endpoint behind Edge's built-in translation; it needs no key.
        data = await request(
          'https://edge.microsoft.com/translate/translatetext?isEnterpriseClient=false&to=' +
            encodeURIComponent(microsoftLanguage(to)),
          { 'content-type': 'application/json' },
          signal,
          JSON.stringify(texts),
        );
      } catch (error) {
        // An unsupported target language; another service may support it.
        if (error instanceof HttpError && error.status === 400) error.temporary = true;
        throw error;
      }
      if (!Array.isArray(data) || data.length !== texts.length) throw new InvalidResponseError();
      return data.map((item, index) => {
        const translated = item?.translations?.[0]?.text;
        if (typeof translated !== 'string') throw new InvalidResponseError();
        return unescape(texts[index], translated);
      });
    },
  });
}
