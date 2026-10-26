import { t } from './i18n.js';

/** Add draft actions before Inugram measures and opens its send-preview menu.
 * @param {{translate: (ctx: any) => void, restore: (ctx: any) => void, canRestore: (chat: any) => boolean}} actions */
export function registerDraftSendMenu(actions) {
  let menu;
  let translateText = '',
    restoreText = '';
  const refresh = () => {
    translateText = t('draftTranslate');
    restoreText = t('draftRestore');
  };
  refresh();
  try {
    const choose = (restore) => {
      const current = menu;
      menu = undefined;
      if (!current) return;
      current.preview.call('dismiss', false);
      current.composer.setField('messageSendPreview', null);
      const ctx = {
        account: { id: Number(current.chat.call('getCurrentAccount')) },
        dialogId: Number(current.chat.call('getDialogId')),
      };
      setTimeout(() => (restore ? actions.restore(ctx) : actions.translate(ctx)), 0);
    };
    // Runnables are created on the plugin thread, then reused by UI-thread hooks.
    const translate = inu.jvm.runnable(() => choose(false));
    const restore = inu.jvm.runnable(() => choose(true));
    const icon = inu.jvm.cls('org.telegram.messenger.R$drawable').getStaticField('msg_translate');
    const dispose = inu.xposed.hookMethod(
      inu.jvm
        .cls('desu.inugram.helpers.chat.ChatActionsHelper')
        .getDeclaredMethod(
          'showSendPreview(Lorg/telegram/ui/Components/ChatActivityEnterView;Lorg/telegram/ui/Components/ItemOptions;Lorg/telegram/ui/MessageSendPreview;)V',
        ),
      {
        before(ctx) {
          try {
            const [composer, options, preview] = ctx.args;
            const chat = composer.getField('parentFragment');
            if (
              !chat ||
              chat.getField('editingMessageObject') !== null ||
              composer.call('getFieldText') === null
            )
              return;
            menu = { composer, preview, chat };
            options.call('add', icon, translateText, translate);
            if (actions.canRestore(chat)) options.call('add', icon, restoreText, restore);
          } catch {
            /* Keep the host's normal send menu on unsupported versions. */
          }
        },
      },
    );
    inu.onUnload(() => {
      menu = undefined;
      dispose();
    });
  } catch {
    /* The standard chat action remains available. */
  }
  return { refresh };
}
