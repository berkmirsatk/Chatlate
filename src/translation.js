import { createCache } from './cache.js';
import { t } from './i18n.js';
import { plan, assemble, validate } from './formatting.js';

/**
 * Preserve Telegram entities while translating only unprotected text fragments.
 * @param {import('./provider.js').Provider} provider
 */
export function createTranslator(provider) {
  const cache = createCache((value) => JSON.stringify(value).length);
  return {
    /** @param {inu.TranslationRequest<TextWithEntities>} request */
    async translate(request) {
      if (request.signal.aborted) throw new Error(t('cancelled'));
      if (
        request.texts.length > 100 ||
        request.texts.reduce((size, input) => size + input.text.length, 0) > 18000 ||
        request.texts.some((input) => (input.entities?.length ?? 0) > 1000)
      )
        throw new Error(t('tooLarge'));
      const plans = request.texts.map(plan);
      const outputs = [];
      const missing = [];
      const context = provider.cacheContext?.() ?? '';
      const keys = request.texts.map((text) =>
        JSON.stringify([provider.id, context, request.to, text]),
      );
      for (let i = 0; i < plans.length; i++) {
        if (cache.has(keys[i])) outputs[i] = structuredClone(cache.get(keys[i]));
        else missing.push(i);
      }
      const parts = missing.flatMap((i) =>
        plans[i].pieces.filter((piece) => piece.translate).map((piece) => piece.body),
      );
      // The host enforces a 30-second budget; bound payload size and queue pressure.
      if (parts.length > 100 || parts.join('').length > 18000) throw new Error(t('tooLarge'));
      const translated = parts.length
        ? validate(await provider.translateParts(parts, request.to, request.signal), parts.length)
        : [];
      if (request.signal.aborted) throw new Error(t('cancelled'));
      let offset = 0;
      for (const i of missing) {
        const count = plans[i].pieces.filter((piece) => piece.translate).length;
        outputs[i] = assemble(plans[i], translated.slice(offset, offset + count));
        offset += count;
        cache.set(keys[i], structuredClone(outputs[i]));
      }
      return outputs;
    },
  };
}
