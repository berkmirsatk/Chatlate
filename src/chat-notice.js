const VISIBLE_MS = 3500;
const HIDE_ANIMATION_MS = 500;
// Telegram orders top-panel rows by priority: pinned messages are 1, the translate bar 12.
const PRIORITY = 11;

/** A short note in the open chat's top panel, just above the translate bar. */
export function createChatNotice() {
  /** @type {{panel?: any, view?: any} | undefined} */
  let shown;
  /** @param {{panel?: any, view?: any}} notice */
  function remove(notice) {
    try {
      notice.panel?.call('removeView', notice.view);
    } catch {
      /* the chat already closed */
    }
    notice.panel = notice.view = undefined;
  }
  const utilities = () => inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
  inu.onUnload?.(() => {
    const notice = shown;
    shown = undefined;
    if (!notice) return;
    try {
      utilities().callStatic(
        'runOnUIThread',
        inu.jvm.runnable(() => remove(notice)),
      );
    } catch {
      /* unloading host */
    }
  });
  /** @param {string} text */
  return function show(text) {
    let fragment;
    try {
      fragment = inu.android.getCurrentFragment();
      // Only a chat screen has this panel.
      if (!fragment?.getField('topPanelLayout')) fragment = undefined;
    } catch {
      fragment = undefined;
    }
    if (!fragment) {
      void inu.ui
        .bulletin({ text, icon: inu.icons.animation('info'), duration: 'short', position: 'top' })
        .catch(() => {});
      return;
    }
    const android = utilities();
    /** @type {{panel?: any, view?: any}} */
    const notice = {};
    // Callbacks only touch views; everything they schedule is created here, on the plugin thread.
    const drop = inu.jvm.runnable(() => {
      if (shown !== notice) return;
      shown = undefined;
      remove(notice);
    });
    const hide = inu.jvm.runnable(() => {
      if (shown !== notice) return;
      try {
        notice.panel.call('setViewVisible', notice.view, false, true);
        android.callStatic('runOnUIThread', drop, HIDE_ANIMATION_MS);
      } catch {
        // Calling `drop` from here would re-enter this plugin, so finish inline.
        shown = undefined;
        remove(notice);
      }
    });
    const build = inu.jvm.runnable(() => {
      try {
        const panel = fragment.getField('topPanelLayout');
        if (!panel) return;
        if (shown) remove(shown);
        const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
        const dp = (value) => android.callStatic('dp', value);
        const view = new (inu.jvm.cls('android.widget.TextView'))(panel.call('getContext'));
        view.call('setText', text);
        view.call('setTextSize', 14);
        view.call('setGravity', 17);
        view.call('setSingleLine', true);
        view.call(
          'setEllipsize',
          inu.jvm.cls('android.text.TextUtils$TruncateAt').getStaticField('END'),
        );
        view.call('setPadding', dp(16), 0, dp(16), 0);
        view.call(
          'setTextColor',
          theme.callStatic(
            'getColor(ILorg/telegram/ui/ActionBar/Theme$ResourcesProvider;)I',
            theme.getStaticField('key_chat_topPanelMessage'),
            fragment.call('getResourceProvider'),
          ),
        );
        panel.call(
          'addView',
          view,
          inu.jvm
            .cls('org.telegram.ui.Components.LayoutHelper')
            .callStatic('createLinear(II)Landroid/widget/LinearLayout$LayoutParams;', -1, 32),
        );
        notice.panel = panel;
        notice.view = view;
        shown = notice;
        panel.call('setPriority', view, PRIORITY);
        panel.call('setViewVisible', view, true, true);
        android.callStatic('runOnUIThread', hide, VISIBLE_MS);
      } catch {
        /* host internals changed; the translation itself already succeeded */
        remove(notice);
      }
    });
    android.callStatic('runOnUIThread', build);
  };
}
