import { getAppLanguageCode, t } from './i18n.js';
import { updateMessages } from './updates/messages.js';

// Views are identified by integer tags; keep clear of the host's small IDs.
const FIRST_ID = 0x43a80000;
const SHEET_INTERVAL_MS = 1000;
// Long enough for the user to read the notes.
const SHEET_CHECKS = 600;
const SET = 'set(Lorg/telegram/tgnet/tl/TL_iv$RichMessage;)V';
const ADD_VIEW = 'addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V';

/**
 * A translate icon on Inugram's What's new: the settings page, the sheet shown after an update
 * and the sheet that offers one. Like Chatlate's own release notes, it translates into the app's
 * language with the preferred Chatlate service and tapping it again shows the original.
 * Releases are translated one at a time, and only those on screen: the rest follow on scrolling.
 * Inugram's own rich-text translator splits and rebuilds the notes, so formatting and links stay.
 * Hooks, taps and replies arrive on other threads; they only use runnables created here.
 * @param {ReturnType<typeof import('./provider-selection.js').createProviderSelection>} selection
 */
export function registerWhatsNew(selection) {
  // Read on the plugin thread; other threads only use the copies.
  let to = '';
  let labels = { translate: '', showOriginal: '' };
  function refresh() {
    try {
      const code = getAppLanguageCode();
      // The notes are written in English.
      to = code && code !== 'en' ? code : '';
      const text = updateMessages();
      labels = { translate: text.translate, showOriginal: text.showOriginal };
    } catch {
      to = '';
    }
  }
  refresh();
  try {
    const helper = inu.jvm.cls('desu.inugram.helpers.translate.TranslationProviderHelper');
    const page = inu.jvm.cls('desu.inugram.ui.settings.WhatsNewActivity');
    const sheet = inu.jvm.cls('desu.inugram.ui.ChangelogSheet');
    const connections = inu.jvm.cls('org.telegram.tgnet.ConnectionsManager');
    const accounts = inu.jvm.cls('org.telegram.messenger.UserConfig');
    const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
    const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
    const layoutHelper = inu.jvm.cls('org.telegram.ui.Components.LayoutHelper');
    const ImageView = inu.jvm.cls('android.widget.ImageView');
    const icon = inu.jvm.cls('org.telegram.messenger.R$drawable').getStaticField('msg_translate');
    const onUi = (/** @type {any} */ runnable) =>
      utilities.callStatic('runOnUIThread(Ljava/lang/Runnable;)V', runnable);

    /**
     * One screen's notes and its icon.
     * @typedef {{id: number, icon: any, menu: boolean, color: number, views: () => any[], title?: any,
     *   entries: {view: any, original: any, translated?: any, failed?: boolean}[],
     *   active: boolean, busy: boolean, stalled: boolean, closed: boolean, key: string, to: string}} Surface
     */
    /** @type {Map<number, Surface>} */
    const surfaces = new Map();
    let nextId = 0;
    /** @type {Surface | undefined} */
    let pageSurface;
    /** The request in flight; the notes are translated one release at a time.
     * @type {{surface: Surface, entry: Surface['entries'][number]} | undefined} */
    let job;
    /** @type {any[]} */
    const replies = [];
    /** @type {Surface | undefined} */
    let tapped;

    /** @param {any} list A java.util.List, or null. */
    const items = (list) =>
      list ? Array.from({ length: list.call('size') }, (_, index) => list.call('get', index)) : [];

    /** @param {Surface} surface */
    function paint(surface) {
      try {
        const color = surface.active
          ? theme.callStatic('getColor', theme.getStaticField('key_windowBackgroundWhiteBlueText'))
          : surface.color;
        if (surface.menu) surface.icon.call('setIconColor', color);
        else surface.icon.call('setColorFilter(I)V', color);
        surface.icon.call('setAlpha', surface.busy ? 0.5 : 1);
        surface.icon.call('setEnabled', !surface.busy);
        surface.icon.call(
          'setContentDescription',
          surface.active ? labels.showOriginal : labels.translate,
        );
      } catch {
        /* the screen already closed */
      }
    }

    /** @param {any} view */
    function isNotes(view) {
      try {
        return !!view.getField('richMessage');
      } catch {
        return false;
      }
    }

    /** @param {Surface} surface */
    function collect(surface) {
      for (const view of surface.views()) {
        if (surface.entries.some((entry) => entry.view.call('equals', view))) continue;
        try {
          // Only the notes view has this field; the bridge offers no class check.
          const original = view.getField('richMessage');
          if (!original) continue;
          surface.entries.push({ view, original });
          // Releases further down are translated when they scroll into view.
          view.call('addOnAttachStateChangeListener', attach);
        } catch {
          /* not a notes view */
        }
      }
    }

    /** An untranslated release that is on screen. @param {Surface['entries'][number]} entry */
    function waiting(entry) {
      if (entry.translated) return false;
      try {
        return !!entry.view.call('isAttachedToWindow');
      } catch {
        return true;
      }
    }

    /** Sends the next release on screen, or finishes. UI thread. @param {Surface} surface */
    function next(surface) {
      // A failure stops the rest, so it is reported at once.
      const entry =
        surface.closed || surface.entries.some((candidate) => candidate.failed)
          ? undefined
          : surface.entries.find(waiting);
      if (!entry) {
        job = undefined;
        surface.busy = false;
        if (surface.entries.some((candidate) => candidate.failed)) {
          for (const candidate of surface.entries) candidate.failed = false;
          // Scrolling does not try again; the next tap does.
          surface.stalled = true;
          // Nothing was translated: back to the original state.
          if (!surface.entries.some((candidate) => candidate.translated)) surface.active = false;
          setTimeout(() => inu.ui.toast(t('connectionFailed')), 0);
        }
        paint(surface);
        return;
      }
      job = { surface, entry };
      try {
        entry.view.call('setTranslationLoading', true);
        const request = helper.callStatic(
          'createRichRequest(Lorg/telegram/tgnet/tl/TL_iv$RichMessage;Ljava/lang/String;Ljava/lang/String;)Lorg/telegram/tgnet/TLObject;',
          entry.original,
          'en',
          surface.to,
        );
        // The preferred Chatlate service translates, whichever service chats use.
        helper.callStatic('setRequestProvider', request, surface.key);
        connections
          .callStatic('getInstance', accounts.getStaticField('selectedAccount'))
          .call(
            'sendRequest(Lorg/telegram/tgnet/TLObject;Lorg/telegram/tgnet/RequestDelegate;)I',
            request,
            delegate,
          );
      } catch {
        replies.push(null);
        onUi(settle);
      }
    }

    // Applies a reply on the UI thread.
    const settle = inu.jvm.runnable(() => {
      while (replies.length) {
        const reply = replies.shift();
        const current = job;
        if (!current) continue;
        const { surface, entry } = current;
        try {
          entry.view.call('setTranslationLoading', false);
          const result = reply?.getField('result');
          if (result && result.call('size') > 0) {
            entry.translated = result.call('get', 0);
            if (surface.active && !surface.closed) entry.view.call(SET, entry.translated);
          } else entry.failed = true;
        } catch {
          entry.failed = true;
        }
        next(surface);
      }
    });
    const delegate = new (inu.jvm.defineClass({
      interfaces: [inu.jvm.cls('org.telegram.tgnet.RequestDelegate')],
      methods: {
        run: {
          params: ['org.telegram.tgnet.TLObject', 'org.telegram.tgnet.TLRPC$TL_error'],
          returns: 'void',
          // Telegram answers on its network thread.
          body: (_self, response) => {
            replies.push(response);
            onUi(settle);
          },
        },
      },
    }))();

    // Translates, or shows the original again. UI thread.
    const toggle = inu.jvm.runnable(() => {
      const surface = tapped;
      tapped = undefined;
      if (!surface || surface.closed || surface.busy || job) return;
      try {
        if (surface.active) {
          surface.active = false;
          for (const entry of surface.entries) entry.view.call(SET, entry.original);
        } else {
          collect(surface);
          if (!surface.entries.length) return;
          surface.active = true;
          surface.stalled = false;
          for (const entry of surface.entries)
            if (entry.translated) entry.view.call(SET, entry.translated);
          if (surface.entries.some(waiting)) {
            surface.busy = true;
            next(surface);
          }
        }
      } catch {
        /* the screen already closed */
      }
      paint(surface);
    });
    // Translates releases that scrolled into view on a translated screen. UI thread.
    const resume = inu.jvm.runnable(() => {
      if (job) return;
      for (const surface of surfaces.values()) {
        if (!surface.active || surface.busy || surface.stalled || surface.closed) continue;
        try {
          if (!surface.entries.some(waiting)) continue;
          surface.busy = true;
          paint(surface);
          next(surface);
          return;
        } catch {
          /* the screen already closed */
        }
      }
    });
    const click = new (inu.jvm.defineClass({
      interfaces: [inu.jvm.cls('android.view.View$OnClickListener')],
      methods: {
        onClick: {
          params: ['android.view.View'],
          returns: 'void',
          body: (_self, view) => {
            const surface = surfaces.get(Number(view.call('getTag')));
            if (!surface) return;
            // The service and the language are read on the plugin thread.
            setTimeout(() => {
              refresh();
              const key = selection.key();
              if (!key || !to) {
                if (!key) inu.ui.toast(t('selectInApp'));
                return;
              }
              surface.key = key;
              surface.to = to;
              tapped = surface;
              onUi(toggle);
            }, 0);
          },
        },
      },
    }))();

    /** @param {Omit<Surface, 'id' | 'entries' | 'active' | 'busy' | 'stalled' | 'closed' | 'key' | 'to'>} parts */
    function open(parts) {
      /** @type {Surface} */
      const surface = {
        ...parts,
        id: FIRST_ID + ++nextId,
        entries: [],
        active: false,
        busy: false,
        stalled: false,
        closed: false,
        key: '',
        to: '',
      };
      surfaces.set(surface.id, surface);
      // Screens do not say when they close; a few recent ones are enough.
      for (const [id, old] of surfaces) {
        if (surfaces.size <= 4) break;
        if (old === pageSurface || old === surface) continue;
        close(old);
        surfaces.delete(id);
      }
      surface.icon.call('setTag(Ljava/lang/Object;)V', surface.id);
      surface.icon.call('setOnClickListener', click);
      paint(surface);
      return surface;
    }

    // Inugram shows its sheet after an update before plugins start, so the icon misses it.
    // Once that sheet closes, a bulletin offers the What's new page, where the icon works.
    let caughtSheet = false;
    let watching = true;
    /** @type {any} */
    let presenter;
    const openPage = inu.jvm.runnable(() => {
      try {
        presenter?.call('presentFragment(Lorg/telegram/ui/ActionBar/BaseFragment;)Z', new page());
      } catch {
        /* the app moved on */
      }
      presenter = undefined;
    });
    const sheetOpen = () => {
      try {
        const ref = inu.jvm
          .cls('desu.inugram.helpers.update.UpdateHelper')
          .getStaticField('whatsNewSheetActivity');
        return !!ref?.call('get');
      } catch {
        return false;
      }
    };
    function watchSheet() {
      if (!to || !sheetOpen()) return;
      let checks = 0;
      const check = () => {
        if (!watching || caughtSheet) return;
        if (sheetOpen()) {
          if (++checks < SHEET_CHECKS) setTimeout(check, SHEET_INTERVAL_MS);
          return;
        }
        try {
          const config = inu.jvm.cls('desu.inugram.InuConfig');
          // "Don't show again" turns What's new off; leave it be.
          if (!config.getStaticField('WHATS_NEW_ON_UPDATE').call('getValue')) return;
        } catch {
          /* offer it anyway */
        }
        if (!selection.key()) return;
        let icon;
        try {
          icon = inu.icons.common('translate');
        } catch {
          return;
        }
        void inu.ui
          .bulletin({
            text: t('whatsNewTranslate'),
            button: t('whatsNewOpen'),
            icon,
            duration: 6000,
          })
          .then((result) => {
            if (result === 'dismissed' || !watching) return;
            presenter = inu.android.getCurrentFragment();
            if (presenter) onUi(openPage);
          })
          .catch(() => {});
      };
      setTimeout(check, SHEET_INTERVAL_MS);
    }

    /** @param {Surface} surface */
    function close(surface) {
      surface.closed = true;
      surfaces.delete(surface.id);
    }

    // The sheet's title is a list row; the icon joins it in the row's frame once that exists.
    const place = inu.jvm.runnable(() => {
      for (const surface of surfaces.values()) {
        if (!surface.title || surface.closed) continue;
        try {
          const frame = surface.title.call('getParent');
          const current = surface.icon.call('getParent');
          if (!frame || (current && current.call('equals', frame))) continue;
          current?.call('removeView', surface.icon);
          frame.call(
            ADD_VIEW,
            surface.icon,
            layoutHelper.callStatic(
              'createFrame(IFIFFFF)Landroid/widget/FrameLayout$LayoutParams;',
              36,
              36,
              53,
              0,
              7,
              12,
              0,
            ),
          );
        } catch {
          /* the sheet already closed */
        }
      }
    });
    const attach = new (inu.jvm.defineClass({
      interfaces: [inu.jvm.cls('android.view.View$OnAttachStateChangeListener')],
      methods: {
        onViewAttachedToWindow: {
          params: ['android.view.View'],
          returns: 'void',
          body: () => {
            onUi(place);
            onUi(resume);
          },
        },
        onViewDetachedFromWindow: {
          params: ['android.view.View'],
          returns: 'void',
          body: () => {},
        },
      },
    }))();

    const disposers = [
      inu.xposed.hookMethod(page.getDeclaredMethod('createView'), {
        after(ctx) {
          try {
            const fragment = ctx.thisObject;
            // The header outlives the page's views, so an earlier icon may still be there.
            if (pageSurface) {
              close(pageSurface);
              pageSurface.icon.call('getParent')?.call('removeView', pageSurface.icon);
            }
            pageSurface = undefined;
            if (!fragment) return;
            const bar = fragment.call('getSimpleActionBar');
            if (!bar || !to) return;
            const menu = bar.call('createMenu');
            const id = FIRST_ID;
            const item = menu.call(
              'addItem(II)Lorg/telegram/ui/ActionBar/SimpleActionBarMenuItem;',
              id,
              icon,
            );
            pageSurface = open({
              icon: item,
              menu: true,
              color: bar.getField('itemsColor'),
              views: () => items(fragment.getField('releaseViews')),
            });
          } catch {
            /* the page stays as it is */
          }
        },
      }),
      inu.xposed.hookAllConstructors(sheet, {
        after(ctx) {
          try {
            if (ctx.throwable || !to) return;
            const [title, ...rows] = items(ctx.thisObject?.getField('rows'));
            if (!title || !rows.some(isNotes)) return;
            const color = theme.callStatic('getColor', theme.getStaticField('key_dialogTextBlack'));
            const view = new ImageView(title.call('getContext'));
            view.call(
              'setScaleType',
              inu.jvm.cls('android.widget.ImageView$ScaleType').getStaticField('CENTER'),
            );
            view.call('setImageResource', icon);
            view.call(
              'setBackground',
              theme.callStatic(
                'createSelectorDrawable(II)Landroid/graphics/drawable/Drawable;',
                theme.callStatic('multAlpha(IF)I', color, 0.1),
                1,
              ),
            );
            title.call('addOnAttachStateChangeListener', attach);
            caughtSheet = true;
            open({ icon: view, menu: false, color, views: () => rows, title });
          } catch {
            /* the sheet stays as it is */
          }
        },
      }),
    ];
    watchSheet();
    inu.onUnload(() => {
      watching = false;
      for (const dispose of disposers) dispose();
      const open = [...surfaces.values()];
      surfaces.clear();
      for (const surface of open) surface.closed = true;
      try {
        onUi(
          inu.jvm.runnable(() => {
            for (const surface of open) {
              try {
                for (const entry of surface.entries) entry.view.call(SET, entry.original);
                surface.icon.call('getParent')?.call('removeView', surface.icon);
              } catch {
                /* the screen already closed */
              }
            }
          }),
        );
      } catch {
        /* unloading host */
      }
    });
  } catch {
    /* hosts before Inugram's What's new have nothing to translate */
  }
  return { refresh };
}
