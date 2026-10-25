import { registeredProviderId } from './identity.js';
import { t } from './i18n.js';

const STOCK_REFRESH_DELAY_MS = 150;

/**
 * Adds a service picker to the chat translate bar's menu.
 * Hook phases run on the UI thread, so storage, translation strings and provider
 * changes happen on the plugin thread before or after them.
 * @param {import('./provider.js').Provider[]} providers
 * @param {ReturnType<typeof import('./provider-selection.js').createProviderSelection>} selection
 */
export function registerChatMenu(providers, selection) {
  let title = '';
  /** @type {any} */
  let menu;
  function refresh() {
    title = t('translationService');
  }
  refresh();
  try {
    const TranslateButton = inu.jvm.cls('org.telegram.ui.Components.TranslateButton');
    const popupClass = inu.jvm.cls('org.telegram.ui.ActionBar.ActionBarPopupWindow');
    const subItem = inu.jvm.cls('org.telegram.ui.ActionBar.ActionBarMenuSubItem');
    const plainItem = subItem.getDeclaredConstructor(
      '(Landroid/content/Context;ZZLorg/telegram/ui/ActionBar/Theme$ResourcesProvider;)V',
    );
    const checkItem = subItem.getDeclaredConstructor(
      '(Landroid/content/Context;IZZLorg/telegram/ui/ActionBar/Theme$ResourcesProvider;)V',
    );
    const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
    const click = inu.jvm.defineClass({
      interfaces: [inu.jvm.cls('android.view.View$OnClickListener')],
      methods: {
        onClick: {
          params: ['android.view.View'],
          returns: 'void',
          body: (_self, view) => {
            const current = menu;
            if (!current) return;
            try {
              const tag = String(view.call('getTag'));
              const swipeBack = current.layout.call('getSwipeBack');
              if (tag === 'open') swipeBack.call('openForeground', current.page);
              else if (tag === 'back') swipeBack.call('closeForeground');
              else {
                current.popup.call('dismiss');
                const id = tag;
                // Saving the choice needs the plugin thread.
                setTimeout(() => choose(id, current.button), 0);
              }
            } catch {
              /* the menu already closed */
            }
          },
        },
      },
    });

    /** @param {any} popup @param {any} button */
    function addItems(popup, button) {
      const layout = popup.call('getContentView');
      const context = layout.call('getContext');
      const resources = button.getField('resourcesProvider');
      const drawables = inu.jvm.cls('org.telegram.messenger.R$drawable');
      const key = String(
        inu.jvm
          .cls('desu.inugram.InuConfig')
          .getStaticField('TRANSLATION_PROVIDER')
          .call('getValue'),
      );
      const active = providers.find((provider) =>
        key.endsWith(':' + registeredProviderId(provider.id)),
      );
      const listener = new click();
      const page = new (inu.jvm.cls('android.widget.LinearLayout'))(context);
      page.call('setOrientation', 1);
      const back = plainItem.newInstance(context, true, false, resources);
      back.call(
        'setTextAndIcon',
        inu.jvm
          .cls('org.telegram.messenger.LocaleController')
          .callStatic(
            'getString',
            inu.jvm.cls('org.telegram.messenger.R$string').getStaticField('Back'),
          ),
        drawables.getStaticField('ic_ab_back'),
      );
      back.call('setTag', 'back');
      back.call('setOnClickListener', listener);
      page.call('addView', back);
      for (const [index, provider] of providers.entries()) {
        const option = checkItem.newInstance(
          context,
          2,
          false,
          index === providers.length - 1,
          resources,
        );
        option.call('setChecked', provider === active);
        option.call('setText', provider.name);
        option.call('setTag', provider.id);
        if (provider !== active) option.call('setOnClickListener', listener);
        page.call('addView', option);
      }
      const item = plainItem.newInstance(context, false, false, resources);
      item.call('setTextAndIcon', title, drawables.getStaticField('msg_language'));
      if (active) item.call('setSubtext', active.name);
      item.call('setItemHeight', 56);
      item.call('setTag', 'open');
      item.call('setOnClickListener', listener);
      // Right below "Translate to".
      layout.getField('linearLayout').call('addView', item, 1);
      menu = { popup, layout, button, page: layout.call('addViewToSwipeBack', page) };
    }

    /** @param {string} id @param {any} button */
    function choose(id, button) {
      const outcome = selection.select(providers.findIndex((provider) => provider.id === id));
      if (outcome !== 'applied') {
        inu.ui.toast(t(outcome === 'inactive' ? 'selectInApp' : 'providerSyncFailed'));
        return;
      }
      const controller = inu.jvm
        .cls('org.telegram.messenger.MessagesController')
        .callStatic('getInstance', button.getField('currentAccount'))
        .call('getTranslateController');
      const dialogId = button.getField('dialogId');
      const resume = inu.jvm.runnable(() => {
        try {
          controller.call('toggleTranslatingDialog', dialogId, true);
        } catch {
          /* the chat already closed */
        }
      });
      // Translations from the previous service would otherwise stay on screen.
      const retranslate = inu.jvm.runnable(() => {
        try {
          if (!controller.call('isTranslatingDialog', dialogId)) return;
          const messages = button.getField('fragment').getField('messages');
          for (let index = 0, size = Number(messages.call('size')); index < size; index++)
            controller.call('invalidateTranslation', messages.call('get', index));
          controller.call('toggleTranslatingDialog', dialogId, false);
          utilities.callStatic('runOnUIThread', resume, STOCK_REFRESH_DELAY_MS);
        } catch {
          /* the chat already closed */
        }
      });
      utilities.callStatic('runOnUIThread', retranslate);
    }

    const dispose = inu.xposed.hookMethod(
      popupClass.getDeclaredMethod('showAsDropDown(Landroid/view/View;II)V'),
      {
        // Only the translate bar's menu, without entering JS for every other popup.
        filter: inu.jvm.routine(
          (anchor) => anchor !== null && anchor.getParent() instanceof TranslateButton,
        ),
        before(ctx) {
          try {
            addItems(ctx.thisObject, ctx.args[0].call('getParent'));
          } catch {
            /* the stock menu still opens */
          }
        },
      },
    );
    inu.onUnload(() => {
      menu = undefined;
      dispose();
    });
  } catch {
    /* hosts without hooking keep the stock menu */
  }
  return { refresh };
}
