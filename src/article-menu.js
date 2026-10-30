import { registeredProviderId } from './identity.js';
import { t } from './i18n.js';

/**
 * Adds a service picker to the menu of Inugram's article (Instant View) translator.
 * Choosing another service translates an already translated page again with it.
 * Hook phases run on the UI thread; strings and provider changes happen on the plugin thread.
 * @param {import('./provider.js').Provider[]} providers
 * @param {ReturnType<typeof import('./provider-selection.js').createProviderSelection>} selection
 */
export function registerArticleMenu(providers, selection) {
  let title = '';
  /** @type {{options: any, viewer: any, active: import('./provider.js').Provider} | undefined} */
  let menu;
  function refresh() {
    title = t('translationService');
  }
  refresh();
  try {
    const helper = inu.jvm.cls('desu.inugram.helpers.translate.InstantViewHelper');
    const config = inu.jvm.cls('desu.inugram.InuConfig');
    const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
    const itemOptions = inu.jvm.cls('org.telegram.ui.Components.ItemOptions');
    const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
    // Runnables are created here, on the plugin thread; menu callbacks only use them.
    const picks = providers.map((provider) =>
      inu.jvm.runnable(() => {
        const current = menu;
        if (!current) return;
        try {
          current.options.call('dismiss');
        } catch {
          /* the menu already closed */
        }
        // Saving the choice needs the plugin thread.
        setTimeout(() => choose(provider.id, current.viewer), 0);
      }),
    );
    // The article menu has no swipeback page, so the services open as a second menu in its place.
    const open = inu.jvm.runnable(() => {
      const current = menu;
      if (!current) return;
      try {
        const container = current.options.getField('container');
        const button = current.options.getField('scrimView');
        current.options.call('dismiss');
        const picker = itemOptions.callStatic(
          'makeOptions(Landroid/view/ViewGroup;Landroid/view/View;)Lorg/telegram/ui/Components/ItemOptions;',
          container,
          button,
        );
        try {
          // The menu button sits in the action bar's right-hand row.
          style(picker, button.call('getParent').call('getParent'));
        } catch {
          /* the services still open in the default colours */
        }
        for (const [index, provider] of providers.entries())
          picker.call(
            'addChecked(ZLjava/lang/CharSequence;Ljava/lang/Runnable;)Lorg/telegram/ui/Components/ItemOptions;',
            provider === current.active,
            provider.name,
            picks[index],
          );
        picker.call('show()Lorg/telegram/ui/Components/ItemOptions;');
        menu = { ...current, options: picker };
      } catch {
        /* the article already closed */
      }
    });

    /** Matches the article menu's own colours and position. @param {any} picker @param {any} bar */
    function style(picker, bar) {
      const background = bar.getField('menuBackgroundColor');
      const text = bar.getField('menuTextColor');
      picker.call('setDimAlpha(I)Lorg/telegram/ui/Components/ItemOptions;', 0);
      picker.call(
        'setColors(II)Lorg/telegram/ui/Components/ItemOptions;',
        text,
        bar.getField('menuIconColor'),
      );
      picker.call(
        'translate(FF)Lorg/telegram/ui/Components/ItemOptions;',
        0,
        -utilities.callStatic('dp(F)I', 52),
      );
      picker.call('setMinWidth(I)Lorg/telegram/ui/Components/ItemOptions;', 200);
      picker.call(
        'setSelectorColor(I)Lorg/telegram/ui/Components/ItemOptions;',
        theme.callStatic(
          'blendOver(II)I',
          background,
          theme.callStatic('multAlpha(IF)I', text, 0.1),
        ),
      );
      const light = utilities.callStatic('computePerceivedBrightness(I)F', background) > 0.721;
      picker.call(
        'setBackgroundColor(I)Lorg/telegram/ui/Components/ItemOptions;',
        light ? 0xffffffff | 0 : 0xff1f1f1f | 0,
      );
    }

    /** @param {string} id @param {any} viewer */
    function choose(id, viewer) {
      const outcome = selection.select(providers.findIndex((provider) => provider.id === id));
      if (outcome !== 'applied') {
        inu.ui.toast(t(outcome === 'inactive' ? 'selectInApp' : 'providerSyncFailed'));
        return;
      }
      // Inugram keeps the page's translation; drop it and translate again with the new service.
      const retranslate = inu.jvm.runnable(() => {
        try {
          const page = viewer
            .call('getCurrentPageLayout')
            ?.getField('adapter')
            ?.getField('currentPage');
          const pages = helper.getStaticField('states').call('get', viewer);
          if (!page || !pages) return;
          const states = pages.call('values').call('iterator');
          while (states.call('hasNext')) {
            const state = states.call('next');
            if (!state.getField('original').call('equals', page)) continue;
            if (!state.getField('applied') || state.getField('loading')) return;
            state.getField('richCache').call('clear');
            state.getField('stringCache').call('clear');
            state.setField('applied', false);
            helper.callStatic('onClick', viewer);
            return;
          }
        } catch {
          /* the page already closed */
        }
      });
      utilities.callStatic('runOnUIThread', retranslate);
    }

    const dispose = inu.xposed.hookMethod(helper.getDeclaredMethod('addMenuItem'), {
      after(ctx) {
        try {
          const [options, , viewer] = ctx.args;
          if (ctx.throwable || !options || !viewer) return;
          const key = String(config.getStaticField('TRANSLATION_PROVIDER').call('getValue'));
          const active = providers.find((provider) =>
            key.endsWith(':' + registeredProviderId(provider.id)),
          );
          if (!active) return;
          const drawables = inu.jvm.cls('org.telegram.messenger.R$drawable');
          options.call(
            'add(ILjava/lang/CharSequence;Ljava/lang/CharSequence;Ljava/lang/Runnable;)Lorg/telegram/ui/Components/ItemOptions;',
            drawables.getStaticField('msg_language'),
            title,
            active.name,
            open,
          );
          menu = { options, viewer, active };
        } catch {
          /* the stock menu still opens */
        }
      },
    });
    inu.onUnload(() => {
      menu = undefined;
      dispose();
    });
  } catch {
    /* hosts without the article translator keep their own menu */
  }
  return { refresh };
}
