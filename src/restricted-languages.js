import { get, put } from './storage.js';

const MAX_OPENED = 200;

/**
 * Telegram ignores the Do Not Translate list without Premium, and treats text already in the
 * target language as translatable, so a Turkish chat with a few English words still offers
 * "Translate to Turkish". While a Chatlate service is selected, both count as not translatable.
 * Runs as routines: Telegram asks for every message it checks.
 */
export function registerRestrictedLanguages() {
  try {
    const config = inu.jvm.cls('desu.inugram.InuConfig');
    const selected = config.getStaticField('TRANSLATION_PROVIDER');
    /** @type {any} */
    const Restricted = inu.jvm.cls('org.telegram.ui.RestrictedLanguagesSelectActivity');
    /** @type {any} */
    const Alert = inu.jvm.cls('org.telegram.ui.Components.TranslateAlert2');
    const Controller = inu.jvm.cls('org.telegram.messenger.TranslateController');
    const dispose = inu.xposed.hookMethod(
      Controller.getDeclaredMethod('isLanguageRestricted(Ljava/lang/String;)Z'),
      {
        after: inu.xposed.routine((ctx) => {
          const language = ctx.args[0];
          if (language === null || !selected.getValue().contains(':chatlate.')) return;
          const to = Alert.getToLanguage();
          ctx.setReturnValue(
            Restricted.getRestrictedLanguages().contains(language) ||
              (to !== null &&
                (to.equals(language) ||
                  to.startsWith(language + '-') ||
                  to.startsWith(language + '_'))),
          );
        }),
      },
    );
    // Chats whose translation the user turned on keep their bar until Hide, even when their
    // messages do not count as translatable, so Show original does not take the bar away.
    /** @type {string[]} */
    let saved = [];
    try {
      const stored = JSON.parse(get('openedChats', '[]'));
      if (Array.isArray(stored)) saved = stored.filter((key) => typeof key === 'string');
    } catch {}
    /** @type {any} */
    const opened = inu.jvm
      .cls('java.util.Collections')
      .callStatic('synchronizedSet', new (inu.jvm.cls('java.util.HashSet'))());
    for (const key of saved) opened.call('add', key);
    const remember = (key, keep) => {
      saved = saved.filter((item) => item !== key);
      if (keep) saved = [...saved, key].slice(-MAX_OPENED);
      try {
        put('openedChats', JSON.stringify(saved));
      } catch {}
    };
    const chatKey = (ctx) => ctx.thisObject.getField('currentAccount') + ':' + ctx.args[0];
    const disposeBar = inu.xposed.hookMethod(
      Controller.getDeclaredMethod('isDialogTranslatable(J)Z'),
      {
        after: inu.xposed.routine((ctx) => {
          if (ctx.returnValue || !selected.getValue().contains(':chatlate.')) return;
          const translating = ctx.thisObject.translatingDialogs.get(ctx.args[0]);
          if (
            (translating !== null && translating.booleanValue()) ||
            opened.contains('' + ctx.thisObject.currentAccount + ':' + ctx.args[0])
          )
            ctx.setReturnValue(true);
        }),
      },
    );
    // Turning a translation on and pressing Hide are rare, so these stay in JS.
    const disposeOpen = inu.xposed.hookMethod(
      Controller.getDeclaredMethod('toggleTranslatingDialog(JZ)Z'),
      {
        after(ctx) {
          if (ctx.args[1] !== true) return;
          const key = chatKey(ctx);
          opened.call('add', key);
          setTimeout(() => remember(key, true), 0);
        },
      },
    );
    const disposeHide = inu.xposed.hookMethod(
      Controller.getDeclaredMethod('setHideTranslateDialog(JZZ)V'),
      {
        // Undo on the Hide notice unhides the chat, which brings its bar back. Before Telegram's
        // own update of the chat, so the bar shows right away.
        before(ctx) {
          const hide = ctx.args[1] === true;
          const key = chatKey(ctx);
          opened.call(hide ? 'remove' : 'add', key);
          setTimeout(() => remember(key, !hide), 0);
        },
      },
    );
    // Follow the panel's visibility, including manually opened bars in same-language chats.
    const updateItem = inu.xposed.routine((ctx) => {
      const chat = ctx.thisObject;
      const item = chat.translateItem;
      if (item === null || !selected.getValue().contains(':chatlate.')) return;
      const panel = chat.topPanelLayout;
      const button = chat.translateButton;
      const visible = panel !== null && button !== null && panel.isViewVisible(button);
      item.setVisibility(visible ? 8 : 0);
    });
    const Chat = inu.jvm.cls('org.telegram.ui.ChatActivity');
    const disposeItem = inu.xposed.hookMethod(
      Chat.getDeclaredMethod('updateTranslateItemVisibility'),
      { after: updateItem },
    );
    const disposePanel = inu.xposed.hookMethod(Chat.getDeclaredMethod('updateTopPanel(Z)V'), {
      after: updateItem,
    });
    inu.onUnload(() => {
      dispose();
      disposeBar();
      disposeOpen();
      disposeHide();
      disposeItem();
      disposePanel();
    });
    // Chats marked translatable before are checked again with these rules.
    const accounts = Number(
      inu.jvm.cls('org.telegram.messenger.UserConfig').getStaticField('MAX_ACCOUNT_COUNT'),
    );
    const recheck = inu.jvm.runnable(() => {
      for (let account = 0; account < accounts; account++) {
        try {
          const user = inu.jvm.cls('org.telegram.messenger.UserConfig');
          if (!user.callStatic('getInstance', account).call('isClientActivated')) continue;
          inu.jvm
            .cls('org.telegram.messenger.MessagesController')
            .callStatic('getInstance', account)
            .call('getTranslateController')
            .call('checkRestrictedLanguagesUpdate');
        } catch {
          /* an account that is not set up */
        }
      }
    });
    inu.jvm.cls('org.telegram.messenger.AndroidUtilities').callStatic('runOnUIThread', recheck);
  } catch {
    /* hosts without hooking keep Telegram's own rules */
  }
}
