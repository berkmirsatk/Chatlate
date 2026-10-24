/**
 * Inugram's "Keep original after translation" covers single messages only. With it on and a
 * Chatlate service selected, whole-chat translations show the original below them too, in
 * Inugram's own layout. Runs as a routine: it is called whenever a message is drawn.
 */
export function registerKeepOriginal() {
  try {
    const helper = inu.jvm.cls('desu.inugram.helpers.translate.TranslateHelper');
    const config = inu.jvm.cls('desu.inugram.InuConfig');
    const keep = config.getStaticField('KEEP_ORIGINAL_AFTER_TRANSLATION');
    const selected = config.getStaticField('TRANSLATION_PROVIDER');
    // Routine values are Java values; the typings only describe JS handles.
    /** @type {any} */
    const TextWithEntities = inu.jvm.cls('org.telegram.tgnet.TLRPC$TL_textWithEntities');
    /** @type {any} */
    const MessageEntity = inu.jvm.cls('org.telegram.tgnet.TLRPC$MessageEntity');
    /** @type {any} */
    const SerializedData = inu.jvm.cls('org.telegram.tgnet.SerializedData');
    /** @type {any} */
    const ArrayList = inu.jvm.cls('java.util.ArrayList');
    // The same translation object always gets the same merged one, so redraws see no change.
    const merged = inu.jvm
      .cls('java.util.Collections')
      .callStatic('synchronizedMap', new (inu.jvm.cls('java.util.WeakHashMap'))());
    // Inugram's own separator, so both kinds of translation look alike.
    /** @type {any} */
    const SEPARATOR = '\n\n--------\n\n';
    const dispose = inu.xposed.hookMethod(helper.getDeclaredMethod('viewTranslatedText'), {
      after: inu.xposed.routine((ctx) => {
        const translated = ctx.returnValue;
        const message = ctx.args[0];
        if (translated === null || message === null || !keep.getValue()) return;
        if (!selected.getValue().contains(':chatlate.')) return;
        const owner = message.messageOwner;
        if (owner === null || owner.message === null || owner.message.length() === 0) return;
        const text = translated.text;
        // Single-message translations arrive already merged.
        if (text === null || text.length() === 0 || text.endsWith(SEPARATOR + owner.message))
          return;
        const cached = merged.get(translated);
        if (cached !== null) {
          ctx.setReturnValue(cached);
          return;
        }
        const result = new TextWithEntities();
        result.text = text + SEPARATOR + owner.message;
        result.entities = new ArrayList();
        if (translated.entities !== null) result.entities.addAll(translated.entities);
        if (owner.entities !== null) {
          const shift = text.length() + SEPARATOR.length();
          for (const entity of owner.entities) {
            // A serialized copy, so the message's own entities keep their offsets.
            const out = new SerializedData(entity.getObjectSize());
            entity.serializeToStream(out);
            const input = new SerializedData(out.toByteArray());
            const copy = MessageEntity.TLdeserialize(input, input.readInt32(false), false);
            out.cleanup();
            input.cleanup();
            if (copy !== null) {
              copy.offset = copy.offset + shift;
              result.entities.add(copy);
            }
          }
        }
        merged.put(translated, result);
        ctx.setReturnValue(result);
      }),
    });
    inu.onUnload(() => dispose());
  } catch {
    /* hosts without the helper or hooking keep their own behavior */
  }
}
