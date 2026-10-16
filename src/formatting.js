import { t } from './i18n.js';
const protectedTypes = new Set([
  'messageEntityCode',
  'messageEntityPre',
  'messageEntityUrl',
  'messageEntityEmail',
  'messageEntityPhone',
  'messageEntityMention',
  'messageEntityMentionName',
  'inputMessageEntityMentionName',
  'messageEntityHashtag',
  'messageEntityCashtag',
  'messageEntityBotCommand',
  'messageEntityCustomEmoji',
  'messageEntityUnknown',
]);

// Split at entity boundaries. Formatting never depends on provider-generated markup.
/** @param {TextWithEntities} input */
export function plan(input) {
  const text = input.text;
  const entities = (input.entities ?? []).map((e) => ({ ...e }));
  const points = new Set([0, text.length]);
  // Keep paragraph boundaries and line breaks byte-for-byte.
  const lineBreaks = /\r\n|\r|\n/g;
  let line;
  while ((line = lineBreaks.exec(text))) {
    points.add(line.index);
    points.add(line.index + line[0].length);
  }
  for (const e of entities) {
    if (
      !Number.isInteger(e.offset) ||
      !Number.isInteger(e.length) ||
      e.offset < 0 ||
      e.length <= 0 ||
      e.offset + e.length > text.length
    )
      throw new Error(t('invalidFormatting'));
    for (const p of [e.offset, e.offset + e.length]) {
      if (
        p > 0 &&
        p < text.length &&
        /[\uD800-\uDBFF]/.test(text[p - 1]) &&
        /[\uDC00-\uDFFF]/.test(text[p])
      )
        throw new Error(t('invalidEmoji'));
      points.add(p);
    }
  }
  const bounds = [...points].sort((a, b) => a - b);
  const pieces = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i],
      end = bounds[i + 1],
      raw = text.slice(start, end);
    const locked = entities.some(
      (e) => protectedTypes.has(e._) && e.offset <= start && e.offset + e.length >= end,
    );
    const leading = raw.match(/^\s*/)?.[0] ?? '';
    const trailing = raw.slice(leading.length).match(/\s*$/)?.[0] ?? '';
    const body = raw.slice(leading.length, raw.length - trailing.length);
    pieces.push({
      start,
      end,
      raw,
      leading,
      trailing,
      body,
      translate: !locked && /\p{L}/u.test(body),
    });
  }
  return { entities, pieces };
}
export function assemble(p, translated) {
  const mapped = new Map([[0, 0]]);
  let text = '',
    n = 0;
  for (const piece of p.pieces) {
    mapped.set(piece.start, text.length);
    text += piece.translate ? piece.leading + translated[n++] + piece.trailing : piece.raw;
    mapped.set(piece.end, text.length);
  }
  if (n !== translated.length) throw new Error(t('partMismatch'));
  const entities = p.entities
    .map((e) => {
      const start = mapped.get(e.offset),
        end = mapped.get(e.offset + e.length);
      if (start === undefined || end === undefined) throw new Error(t('missingRange'));
      return { ...e, offset: start, length: end - start };
    })
    .filter((e) => e.length > 0);
  return { text, entities };
}
export function validate(result, count) {
  if (
    !Array.isArray(result) ||
    result.length !== count ||
    result.some(
      (t) => typeof t !== 'string' || !t.trim() || /[\r\n]/.test(t) || t.length > 50000,
    ) ||
    result.reduce((size, text) => size + text.length, 0) > 100000
  )
    throw new Error(t('invalidResponse'));
  return result;
}
