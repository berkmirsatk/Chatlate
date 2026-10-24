import { createQueuedProvider } from './queued.js';
import { request, HttpError, InvalidResponseError } from '../http.js';

/** Yandex accepts base codes for regional Chinese and modern codes for legacy aliases.
 * @param {string} language */
export function yandexLanguage(language) {
  const code = language.toLowerCase();
  if (code === 'zh' || code.startsWith('zh-') || code.startsWith('zh_')) return 'zh';
  return { iw: 'he', jw: 'jv', in: 'id', ji: 'yi' }[code] ?? language;
}

/** @returns {import('../provider.js').Provider} */
export function createYandexProvider() {
  return createQueuedProvider({
    id: 'yandex-free',
    name: 'Yandex',
    async fetchParts(texts, to, signal) {
      // The public Android translation endpoint accepts repeated text fields.
      const id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(
        '',
      );
      const url =
        'https://translate.yandex.net/api/v1/tr.json/translate?id=' +
        id +
        '-0-0&srv=android&lang=' +
        encodeURIComponent(yandexLanguage(to));
      const body = texts.map((text) => 'text=' + encodeURIComponent(text)).join('&');
      const data = await request(
        url,
        { 'content-type': 'application/x-www-form-urlencoded' },
        signal,
        body,
      );
      if (data?.code !== 200) {
        if (Number.isInteger(data?.code)) throw new HttpError(data.code, '');
        throw new InvalidResponseError();
      }
      return data.text;
    },
  });
}
