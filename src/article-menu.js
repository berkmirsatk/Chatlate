import { registeredProviderId } from './identity.js';
import { t } from './i18n.js';

/**
 * Inugram's state for the article page a viewer shows, or undefined. UI thread only.
 * @param {any} helper InstantViewHelper @param {any} viewer
 */
export function articleState(helper, viewer) {
  const page = viewer.call('getCurrentPageLayout')?.getField('adapter')?.getField('currentPage');
  const pages = helper.getStaticField('states').call('get', viewer);
  if (!page || !pages) return undefined;
  const states = pages.call('values').call('iterator');
  while (states.call('hasNext')) {
    const state = states.call('next');
    if (state.getField('original').call('equals', page)) return { page, state };
  }
  return undefined;
}

/**
 * Adds a service picker to the menu of Inugram's article (Instant View) translator.
 * Choosing another service translates an already translated page again with it.
 * Hook phases run on the UI thread; strings and provider changes happen on the plugin thread.
 * @param {import('./provider.js').Provider[]} providers
 * @param {ReturnType<typeof import('./provider-selection.js').createProviderSelection>} selection
 */
export function registerArticleMenu(providers, selection) {
  let title = '';
  /** @type {{options: any, viewer: any} | undefined} */
  let menu;
  function refresh() {
    title = t('translationService');
  }
  refresh();
  /** @type {() => import('./provider.js').Provider | undefined} */
  let activeProvider = () => undefined;
  /** @type {(container: any, anchor: any, viewer: any, shifted: boolean, extra?: (picker: any) => void) => void} */
  let openServices = () => {};
  /** @type {Set<() => void>} */
  const changeListeners = new Set();
  try {
    const helper = inu.jvm.cls('desu.inugram.helpers.translate.InstantViewHelper');
    const config = inu.jvm.cls('desu.inugram.InuConfig');
    const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
    const itemOptions = inu.jvm.cls('org.telegram.ui.Components.ItemOptions');
    const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
    activeProvider = () => {
      const key = String(config.getStaticField('TRANSLATION_PROVIDER').call('getValue'));
      return providers.find((provider) => key.endsWith(':' + registeredProviderId(provider.id)));
    };
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

    // The services open as a menu of their own, in the article menu's colours. UI thread only.
    openServices = (container, anchor, viewer, shifted, extra) => {
      const active = activeProvider();
      if (!active) return;
      const picker = itemOptions.callStatic(
        'makeOptions(Landroid/view/ViewGroup;Landroid/view/View;)Lorg/telegram/ui/Components/ItemOptions;',
        container,
        anchor,
      );
      try {
        style(picker, viewer.getField('actionBar'), shifted);
      } catch {
        /* the services still open in the default colours */
      }
      for (const [index, provider] of providers.entries())
        picker.call(
          'addChecked(ZLjava/lang/CharSequence;Ljava/lang/Runnable;)Lorg/telegram/ui/Components/ItemOptions;',
          provider === active,
          provider.name,
          picks[index],
        );
      extra?.(picker);
      picker.call('show()Lorg/telegram/ui/Components/ItemOptions;');
      menu = { options: picker, viewer };
    };

    // The article menu has no swipeback page, so the services open as a second menu in its place.
    const open = inu.jvm.runnable(() => {
      const current = menu;
      if (!current) return;
      try {
        const container = current.options.getField('container');
        const button = current.options.getField('scrimView');
        current.options.call('dismiss');
        openServices(container, button, current.viewer, true);
      } catch {
        /* the article already closed */
      }
    });

    /** Matches the article menu's colours, and its place under the menu button when shifted.
     * @param {any} picker @param {any} bar @param {boolean} shifted */
    function style(picker, bar, shifted) {
      const R = ')Lorg/telegram/ui/Components/ItemOptions;';
      const background = bar.getField('menuBackgroundColor');
      const text = bar.getField('menuTextColor');
      picker.call('setDimAlpha(I' + R, 0);
      picker.call('setColors(II' + R, text, bar.getField('menuIconColor'));
      if (shifted) picker.call('translate(FF' + R, 0, -utilities.callStatic('dp(F)I', 52));
      picker.call('setMinWidth(I' + R, 200);
      picker.call(
        'setSelectorColor(I' + R,
        theme.callStatic(
          'blendOver(II)I',
          background,
          theme.callStatic('multAlpha(IF)I', text, 0.1),
        ),
      );
      const light = utilities.callStatic('computePerceivedBrightness(I)F', background) > 0.721;
      picker.call('setBackgroundColor(I' + R, light ? 0xffffffff | 0 : 0xff1f1f1f | 0);
      picker.call('setGapBackgroundColor(I' + R, light ? 0xfff0f0f0 | 0 : 0xff121212 | 0);
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
          const found = articleState(helper, viewer);
          if (found && found.state.getField('applied') && !found.state.getField('loading')) {
            found.state.getField('richCache').call('clear');
            found.state.getField('stringCache').call('clear');
            found.state.setField('applied', false);
            helper.callStatic('onClick', viewer);
          }
        } catch {
          /* the page already closed */
        }
        for (const listener of changeListeners) listener();
      });
      utilities.callStatic('runOnUIThread', retranslate);
    }

    const dispose = inu.xposed.hookMethod(helper.getDeclaredMethod('addMenuItem'), {
      after(ctx) {
        try {
          const [options, , viewer] = ctx.args;
          if (ctx.throwable || !options || !viewer) return;
          const active = activeProvider();
          if (!active) return;
          const drawables = inu.jvm.cls('org.telegram.messenger.R$drawable');
          options.call(
            'add(ILjava/lang/CharSequence;Ljava/lang/CharSequence;Ljava/lang/Runnable;)Lorg/telegram/ui/Components/ItemOptions;',
            drawables.getStaticField('msg_language'),
            title,
            active.name,
            open,
          );
          menu = { options, viewer };
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
  return {
    refresh,
    /** The active Chatlate service, if Chatlate translates. */
    activeProvider: () => activeProvider(),
    /** Opens the services under a view of the article, with `extra` items below them. UI thread only.
     * @param {any} container @param {any} anchor @param {any} viewer @param {(picker: any) => void} [extra] */
    openServices: (container, anchor, viewer, extra) =>
      openServices(container, anchor, viewer, false, extra),
    /** Runs on the UI thread after the service changes. @param {() => void} listener */
    onChange: (listener) => changeListeners.add(listener),
  };
}
