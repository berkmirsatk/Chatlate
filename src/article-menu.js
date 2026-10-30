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
  /** @type {{options: any, picker: any, viewer: any} | undefined} */
  let menu;
  function refresh() {
    title = t('translationService');
  }
  refresh();
  try {
    const helper = inu.jvm.cls('desu.inugram.helpers.translate.InstantViewHelper');
    const config = inu.jvm.cls('desu.inugram.InuConfig');
    const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
    // Runnables are created here, on the plugin thread; menu callbacks only use them.
    const open = inu.jvm.runnable(() => {
      try {
        menu?.options.call('openSwipeback', menu.picker);
      } catch {
        /* the menu already closed */
      }
    });
    const back = inu.jvm.runnable(() => {
      try {
        menu?.options.call('closeSwipeback');
      } catch {
        /* the menu already closed */
      }
    });
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
          const picker = options.call('makeSwipeback');
          // ItemOptions overloads `add` by argument types, so name the one meant.
          picker.call(
            'add(ILjava/lang/CharSequence;Ljava/lang/Runnable;)Lorg/telegram/ui/Components/ItemOptions;',
            drawables.getStaticField('ic_ab_back'),
            inu.jvm
              .cls('org.telegram.messenger.LocaleController')
              .callStatic(
                'getString',
                inu.jvm.cls('org.telegram.messenger.R$string').getStaticField('Back'),
              ),
            back,
          );
          for (const [index, provider] of providers.entries())
            picker.call(
              'addChecked(ZLjava/lang/CharSequence;Ljava/lang/Runnable;)Lorg/telegram/ui/Components/ItemOptions;',
              provider === active,
              provider.name,
              picks[index],
            );
          options.call(
            'add(ILjava/lang/CharSequence;Ljava/lang/CharSequence;Ljava/lang/Runnable;)Lorg/telegram/ui/Components/ItemOptions;',
            drawables.getStaticField('msg_language'),
            title,
            active.name,
            open,
          );
          menu = { options, picker, viewer };
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
