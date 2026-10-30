import { t } from './i18n.js';
import { plan, assemble, validate } from './formatting.js';

// Inugram's article translator sends up to 25,000 characters in one request.
const MAX_REQUEST_CHARS = 26000;

/**
 * Preserve Telegram entities while translating only unprotected text fragments.
 * @param {import('./provider.js').Provider} provider
 */
export function createTranslator(provider) {
  return {
    /** @param {inu.TranslationRequest<TextWithEntities>} request */
    async translate(request) {
      if (request.signal.aborted) throw new Error(t('cancelled'));
      if (
        request.texts.length > 100 ||
        request.texts.reduce((size, input) => size + input.text.length, 0) > MAX_REQUEST_CHARS ||
        request.texts.some((input) => (input.entities?.length ?? 0) > 1000)
      )
        throw new Error(t('tooLarge'));
      const plans = request.texts.map(plan);
      // Providers cache translated fragments, so repeated text makes no new request.
      const parts = plans.flatMap((p) =>
        p.pieces.filter((piece) => piece.translate).map((piece) => piece.body),
      );
      // Fragments carry their message's detected language for services that batch by language.
      const sources = plans.flatMap((p, i) =>
        p.pieces
          .filter((piece) => piece.translate)
          .map(() => (typeof request.from?.[i] === 'string' ? request.from[i] : null)),
      );
      // The host enforces a 30-second budget; bound payload size and queue pressure.
      if (parts.length > 100 || parts.join('').length > MAX_REQUEST_CHARS)
        throw new Error(t('tooLarge'));
      const translated = parts.length
        ? validate(
            await provider.translateParts(parts, request.to, request.signal, sources),
            parts.length,
          )
        : [];
      if (request.signal.aborted) throw new Error(t('cancelled'));
      let offset = 0;
      return plans.map((p) => {
        const count = p.pieces.filter((piece) => piece.translate).length;
        offset += count;
        return assemble(p, translated.slice(offset - count, offset));
      });
    },
  };
}
