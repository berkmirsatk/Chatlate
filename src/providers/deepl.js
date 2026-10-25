import { request, HttpError, InvalidResponseError } from '../http.js';
import { createQueuedProvider } from './queued.js';

// Anonymous oneshot requests allow 1,500 UTF-16 units across all texts.
const MAX_BATCH_CHARS = 1500;
const TARGETS = new Set(
  'ar bg cs da de de-CH el en-GB en-US es es-419 et fi fr fr-CA he hu id it ja ko lt lv nb nl pl pt-BR pt-PT ro ru sk sl sv tr uk vi zh-Hans zh-Hant'.split(
    ' ',
  ),
);

/** Oneshot expects lowercase base codes and case-sensitive regional variants.
 * @param {string} language */
function targetLanguage(language) {
  const code = language.toLowerCase().replaceAll('_', '-');
  if (['zh-tw', 'zh-hk', 'zh-mo', 'zh-hant'].includes(code)) return 'zh-Hant';
  if (code === 'zh' || code.startsWith('zh-')) return 'zh-Hans';
  const regional = {
    'en-gb': 'en-GB',
    'pt-pt': 'pt-PT',
    'fr-ca': 'fr-CA',
    'de-ch': 'de-CH',
    'es-419': 'es-419',
  };
  const base = code.split('-')[0];
  return regional[code] ?? { en: 'en-US', pt: 'pt-BR', iw: 'he', in: 'id', no: 'nb' }[base] ?? base;
}

/** @returns {import('../provider.js').Provider} */
export function createDeepLProvider() {
  return createQueuedProvider({
    id: 'deepl',
    name: 'DeepL',
    batchLimit: MAX_BATCH_CHARS,
    detectsEachText: true,
    async fetchParts(texts, to, signal) {
      // A single oversized fragment may enter the shared queue; preserve it for fallback.
      if (texts.reduce((size, text) => size + text.length, 0) > MAX_BATCH_CHARS)
        throw new InvalidResponseError('fragmentTooLong');
      const target = targetLanguage(to);
      if (!TARGETS.has(target)) {
        const error = new HttpError(400, '');
        error.temporary = true;
        throw error;
      }
      const data = await request(
        'https://oneshot-free.www.deepl.com/v1/translate',
        { 'content-type': 'application/json', Authorization: 'None' },
        signal,
        JSON.stringify({ text: texts, target_lang: target, usage_type: 'translate' }),
      );
      if (!Array.isArray(data?.translations) || data.translations.length !== texts.length)
        throw new InvalidResponseError();
      return data.translations.map((item) => {
        if (typeof item?.text !== 'string') throw new InvalidResponseError();
        return item.text;
      });
    },
  });
}
