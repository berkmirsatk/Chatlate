import { createDraftLanguagePicker } from './draft-language-picker.js';
import { registerDraftSendMenu } from './draft-send-menu.js';
import { createTranslator } from './translation.js';
import { withFallback } from './fallback.js';
import { get, put } from './storage.js';
import { t } from './i18n.js';

/** Translate drafts in the native composer; sending remains the user's action.
 * @param {import('./provider.js').Provider[]} providers
 * @param {ReturnType<typeof import('./provider-selection.js').createProviderSelection>} selection */
export function registerDraftTranslation(providers, selection) {
  if (!inu.android?.getCurrentFragment || !inu.onUnload) return { refresh() {} };
  const states = new Map();
  let languagePicker;
  const disposers = [];
  let disposed = false;
  const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
  const onUi = (fn) =>
    new Promise((resolve, reject) => {
      utilities.callStatic(
        'runOnUIThread',
        inu.jvm.runnable(() => {
          try {
            const result = fn();
            setTimeout(() => resolve(result), 0);
          } catch (error) {
            setTimeout(() => reject(error), 0);
          }
        }),
      );
    });
  const current = (ctx) => {
    const chat = inu.android.getCurrentFragment();
    if (
      !chat ||
      Number(chat.call('getCurrentAccount')) !== ctx.account.id ||
      Number(chat.call('getDialogId')) !== ctx.dialogId
    )
      return null;
    return chat;
  };
  // Work on copies: entity extraction must not mutate the editable draft.
  const read = (chat) => {
    const composer = chat.getField('chatActivityEnterView');
    if (!composer || chat.getField('editingMessageObject') !== null) return null;
    const edit = composer.call('getEditField');
    const value = composer.call('getFieldText');
    if (!edit || value === null) return null;
    const original = new (inu.jvm.cls('android.text.SpannableStringBuilder'))(value);
    const arrays = inu.jvm.cls('java.lang.reflect.Array');
    const input = arrays.callStatic('newInstance', inu.jvm.cls('java.lang.CharSequence'), 1);
    arrays.callStatic(
      'set',
      input,
      0,
      new (inu.jvm.cls('android.text.SpannableStringBuilder'))(original),
    );
    const entities = inu.jvm
      .cls('org.telegram.messenger.MediaDataController')
      .callStatic('getInstance', chat.call('getCurrentAccount'))
      .call('getEntities', input, true, false);
    const content = new (inu.jvm.cls('org.telegram.tgnet.TLRPC$TL_textWithEntities'))();
    content.setField('text', String(original.call('toString')));
    content.setField('entities', entities || new (inu.jvm.cls('java.util.ArrayList'))());
    const text = /** @type {TextWithEntities} */ (inu.jvm.toTl(content));
    return { composer, edit, original, text, signature: JSON.stringify(text) };
  };
  const idOf = (chat) => Number(chat.call('getClassGuid'));
  function forget(id) {
    const state = states.get(id);
    states.delete(id);
    if (state?.controller) setTimeout(() => state.controller.abort(), 0);
  }
  async function open(ctx) {
    let owned;
    try {
      const chat = current(ctx);
      if (!chat) return;
      const snapshot = await onUi(() => read(chat));
      if (!snapshot?.text.text.trim() || disposed) return;
      const id = idOf(chat);
      const active = current(ctx);
      if (!active || idOf(active) !== id) return;
      const prior = states.get(id);
      const previous = prior?.done && prior.signature === snapshot.signature ? prior : undefined;
      forget(id);
      if (states.size >= 20) forget(states.keys().next().value);
      const state = {
        controller: new AbortController(),
        original: previous?.original ?? snapshot.original,
        signature: '',
        done: false,
      };
      states.set(id, state);
      owned = { id, state, previous };
      const languages = inu.jvm
        .cls('org.telegram.messenger.TranslateController')
        .callStatic('getLanguages');
      const options = [];
      for (let i = 0; i < Number(languages.call('size')); i++) {
        const item = languages.call('get', i);
        options.push({
          code: String(item.getField('code')),
          name: String(item.getField('displayName')),
        });
      }
      const saved = get('draft.language', 'en');
      languagePicker ??= createDraftLanguagePicker();
      const target = await languagePicker.choose(options, saved, state.controller.signal);
      const valid = () => !disposed && states.get(id) === state && !state.controller.signal.aborted;
      if (!valid()) return;
      if (target === null) {
        forget(id);
        if (previous) states.set(id, previous);
        return;
      }
      const activeChat = current(ctx);
      if (!activeChat || idOf(activeChat) !== id) {
        forget(id);
        return;
      }
      put('draft.language', target);
      inu.ui.toast(t('draftTranslating'));
      const primary = providers[selection.read().index];
      const [result] = await createTranslator(withFallback(primary, providers)).translate({
        texts: [snapshot.text],
        from: [null],
        to: target,
        signal: state.controller.signal,
      });
      if (!valid()) return;
      const nativeResult = inu.jvm.fromTl({
        _: 'textWithEntities',
        text: result.text,
        entities: result.entities ?? [],
      });
      const applied = await onUi(() => {
        const active = current(ctx);
        if (!valid() || !active || idOf(active) !== id) return false;
        const latest = read(chat);
        if (!latest || latest.signature !== snapshot.signature) return false;
        const entities = nativeResult.getField('entities');
        const buffer = new (inu.jvm.cls('android.text.SpannableStringBuilder'))(result.text);
        const messages = inu.jvm.cls('org.telegram.messenger.MessageObject');
        messages.callStatic('addEntitiesToText', buffer, entities, false, false, false, false);
        const metrics = snapshot.edit.call('getPaint').call('getFontMetricsInt');
        const formatted = messages.callStatic('replaceAnimatedEmoji', buffer, entities, metrics);
        snapshot.composer.call('setFieldText', formatted);
        snapshot.edit.call('setSelection', result.text.length);
        state.signature = read(chat)?.signature ?? '';
        state.done = true;
        return true;
      });
      if (!valid()) return;
      if (!applied) {
        forget(id);
        inu.ui.toast(t('draftChanged'));
        return;
      }
      inu.ui.toast(t('draftReady'));
    } catch (error) {
      const aborted =
        owned?.state.controller.signal.aborted || (owned && states.get(owned.id) !== owned.state);
      if (owned && states.get(owned.id) === owned.state) {
        forget(owned.id);
        if (!disposed && owned.previous) states.set(owned.id, owned.previous);
      }
      if (!disposed && !aborted) inu.ui.toast(error?.message || t('connectionFailed'));
    }
  }
  async function restore(ctx) {
    try {
      const chat = current(ctx);
      if (!chat) return;
      const id = idOf(chat),
        state = states.get(id);
      if (!state?.done) return;
      const restored = await onUi(() => {
        const active = current(ctx);
        if (disposed || !active || idOf(active) !== id) return false;
        const latest = read(chat);
        if (!latest || states.get(id) !== state || latest.signature !== state.signature)
          return false;
        latest.composer.call('setFieldText', state.original);
        return true;
      });
      if (restored) forget(id);
      else inu.ui.toast(t('draftChanged'));
    } catch {
      inu.ui.toast(t('draftChanged'));
    }
  }
  try {
    disposers.push(
      inu.xposed.hookMethod(
        inu.jvm.cls('org.telegram.ui.ChatActivity').getDeclaredMethod('onFragmentDestroy'),
        {
          before(ctx) {
            forget(idOf(ctx.thisObject));
          },
        },
      ),
    );
  } catch {
    /* Current-fragment and draft checks still prevent stale writes. */
  }
  const sendMenu = registerDraftSendMenu({
    translate: (ctx) => {
      void open(ctx);
    },
    restore: (ctx) => {
      void restore(ctx);
    },
    canRestore: (chat) => !!states.get(idOf(chat))?.done,
  });
  inu.onUnload(() => {
    disposed = true;
    languagePicker?.dispose();
    for (const state of states.values()) state.controller.abort();
    states.clear();
    for (const dispose of disposers) dispose();
  });
  return sendMenu;
}
