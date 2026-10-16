import { createQueuedProvider } from './queued.js';
import { request, HttpError } from '../http.js';
import { t } from '../i18n.js';

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
        encodeURIComponent(to);
      const body = texts.map((text) => 'text=' + encodeURIComponent(text)).join('&');
      const data = await request(
        url,
        { 'content-type': 'application/x-www-form-urlencoded' },
        signal,
        body,
      );
      if (data?.code !== 200) {
        if (Number.isInteger(data?.code)) throw new HttpError(data.code, '');
        throw new Error(t('invalidBatch'));
      }
      return data.text;
    },
  });
}
