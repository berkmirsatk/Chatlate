import { articleState } from './article-menu.js';

const BAR_HEIGHT_DP = 40;
const DETECTION_CHECKS = 20;

/**
 * A translate bar under the article's header, like the one in chats, while Chatlate translates.
 * It shows once Inugram has detected a page language other than the target and outside the
 * Do Not Translate list. Its menu holds the services and Hide, which hides it for that article.
 * Everything here runs on the UI thread; listeners and runnables are created at registration.
 * @param {ReturnType<typeof import('./article-menu.js').registerArticleMenu>} articleMenu
 */
export function registerArticleBar(articleMenu) {
  try {
    const helper = inu.jvm.cls('desu.inugram.helpers.translate.InstantViewHelper');
    const viewerClass = inu.jvm.cls('org.telegram.ui.ArticleViewer');
    const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
    const layoutHelper = inu.jvm.cls('org.telegram.ui.Components.LayoutHelper');
    const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
    const alert = inu.jvm.cls('org.telegram.ui.Components.TranslateAlert2');
    const locale = inu.jvm.cls('org.telegram.messenger.LocaleController');
    const strings = inu.jvm.cls('org.telegram.messenger.R$string');
    const drawables = inu.jvm.cls('org.telegram.messenger.R$drawable');
    const FrameLayout = inu.jvm.cls('android.widget.FrameLayout');
    const TextView = inu.jvm.cls('android.widget.TextView');
    const ImageView = inu.jvm.cls('android.widget.ImageView');
    const View = inu.jvm.cls('android.view.View');
    const text = (/** @type {string} */ key) =>
      String(locale.callStatic('getString(I)Ljava/lang/String;', strings.getStaticField(key)));
    const frame = (/** @type {number[]} */ ...args) =>
      layoutHelper.callStatic(
        args.length === 3
          ? 'createFrame(FFI)Landroid/widget/FrameLayout$LayoutParams;'
          : 'createFrame(IFIFFFF)Landroid/widget/FrameLayout$LayoutParams;',
        ...args,
      );

    /** @type {{viewer: any, view: any, label: any, button: any, divider: any, shown: boolean, y: number, padded: any[], height: number} | undefined} */
    let bar;
    /** Articles whose bar was hidden, until the plugin reloads. */
    const hidden = new Set();
    /** @type {(() => void) | undefined} */
    let unfollow;
    let checks = 0;

    const click = inu.jvm.defineClass({
      interfaces: [inu.jvm.cls('android.view.View$OnClickListener')],
      methods: {
        onClick: {
          params: ['android.view.View'],
          returns: 'void',
          body: (_self, view) => {
            const current = bar;
            if (!current) return;
            try {
              if (String(view.call('getTag')) === 'chatlate.menu') openMenu(current);
              else {
                helper.callStatic('onClick', current.viewer);
                update();
              }
            } catch {
              /* the article already closed */
            }
          },
        },
      },
    });
    const hide = inu.jvm.runnable(() => {
      const current = bar;
      if (!current) return;
      try {
        const found = articleState(helper, current.viewer);
        if (found) hidden.add(String(found.page.getField('url')));
      } catch {
        /* the article already closed */
      }
      update();
    });
    // Inugram detects the page language in the background, so check again for a while.
    const check = inu.jvm.runnable(() => {
      update();
      if (bar && !bar.shown && ++checks < DETECTION_CHECKS) later();
    });
    const later = () => utilities.callStatic('runOnUIThread(Ljava/lang/Runnable;J)V', check, 300);

    /** @param {NonNullable<typeof bar>} current */
    function openMenu(current) {
      articleMenu.openServices(
        current.viewer.getField('containerView'),
        current.button,
        current.viewer,
        (picker) => {
          picker.call('addGap()Lorg/telegram/ui/Components/ItemOptions;');
          picker.call(
            'add(Ljava/lang/CharSequence;Ljava/lang/Runnable;)Lorg/telegram/ui/Components/ItemOptions;',
            text('Hide'),
            hide,
          );
        },
      );
    }

    /** @param {any} viewer */
    function attach(viewer) {
      if (bar?.viewer.call('equals', viewer)) return bar;
      if (bar) detach(bar);
      const container = viewer.getField('containerView');
      const context = container.call('getContext');
      const listener = new click();
      const view = new FrameLayout(context);
      const label = new TextView(context);
      label.call('setTextSize(IF)V', 1, 14);
      label.call('setTypeface(Landroid/graphics/Typeface;)V', utilities.callStatic('bold'));
      label.call('setGravity', 17);
      label.call('setSingleLine(Z)V', true);
      label.call(
        'setEllipsize',
        inu.jvm.cls('android.text.TextUtils$TruncateAt').getStaticField('END'),
      );
      label.call('setTag(Ljava/lang/Object;)V', 'chatlate.translate');
      label.call('setOnClickListener', listener);
      view.call(
        'addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V',
        label,
        frame(-1, -1, 51, 48, 0, 48, 0),
      );
      const button = new ImageView(context);
      button.call(
        'setScaleType',
        inu.jvm.cls('android.widget.ImageView$ScaleType').getStaticField('CENTER'),
      );
      button.call('setImageResource', drawables.getStaticField('msg_mini_customize'));
      button.call('setTag(Ljava/lang/Object;)V', 'chatlate.menu');
      button.call('setOnClickListener', listener);
      view.call(
        'addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V',
        button,
        frame(48, -1, 21),
      );
      const divider = new View(context);
      view.call(
        'addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V',
        divider,
        frame(-1, 0.5, 87),
      );
      view.call('setVisibility', 8);
      // Below the header in drawing order, so the header covers it while they move.
      container.call(
        'addView(Landroid/view/View;ILandroid/view/ViewGroup$LayoutParams;)V',
        view,
        container.call('indexOfChild', viewer.getField('actionBar')),
        frame(-1, BAR_HEIGHT_DP, 48),
      );
      bar = {
        viewer,
        view,
        label,
        button,
        divider,
        shown: false,
        y: -1,
        padded: [],
        height: utilities.callStatic('dp(F)I', BAR_HEIGHT_DP),
      };
      return bar;
    }

    /** @param {NonNullable<typeof bar>} current */
    function detach(current) {
      show(current, false);
      try {
        current.view.call('getParent')?.call('removeView', current.view);
      } catch {
        /* the article already closed */
      }
      if (bar === current) bar = undefined;
    }

    function update() {
      const current = bar;
      if (!current) return;
      try {
        const layout = current.viewer.call('getCurrentPageLayout');
        const found =
          articleMenu.activeProvider() && layout?.getField('type') === 0
            ? articleState(helper, current.viewer)
            : undefined;
        const state = found?.state;
        if (
          !found ||
          !state.getField('detectionDone') ||
          state.getField('detectedSrcLang') == null ||
          state.getField('unavailable') ||
          hidden.has(String(found.page.getField('url')))
        )
          return show(current, false);
        current.label.call(
          'setText(Ljava/lang/CharSequence;)V',
          state.getField('loading')
            ? text('InuTranslating')
            : state.getField('applied')
              ? text('ShowOriginalButton')
              : text('TranslateToButton').replace(
                  /%(1\$)?s/,
                  String(alert.callStatic('languageName', alert.callStatic('getToLanguage'))),
                ),
        );
        paint(current);
        pad(current, layout.getField('listView'));
        show(current, true);
        follow();
      } catch {
        /* the stock article stays as it is */
      }
    }

    /** Takes the header's colours, which follow the article's theme. @param {NonNullable<typeof bar>} current */
    function paint(current) {
      const header = current.viewer.getField('actionBar');
      const background = header.call('getBackgroundColor()I');
      const foreground = header.call('getTextColor');
      current.view.call('setBackgroundColor', background);
      current.label.call('setTextColor(I)V', foreground);
      current.label.call(
        'setBackground',
        theme.callStatic(
          'createSelectorDrawable(II)Landroid/graphics/drawable/Drawable;',
          theme.callStatic('multAlpha(IF)I', foreground, 0.1),
          2,
        ),
      );
      current.button.call(
        'setColorFilter(I)V',
        theme.callStatic('multAlpha(IF)I', foreground, 0.6),
      );
      current.divider.call(
        'setBackgroundColor',
        theme.callStatic(
          'blendOver(II)I',
          background,
          theme.callStatic('multAlpha(IF)I', foreground, 0.12),
        ),
      );
    }

    /** Moves the page's text down by the bar, once per list. @param {NonNullable<typeof bar>} current @param {any} list */
    function pad(current, list) {
      if (current.padded.some((padded) => padded.call('equals', list))) return;
      shift(list, current.height);
      current.padded.push(list);
    }

    /** @param {any} list @param {number} by */
    function shift(list, by) {
      list.call(
        'setPadding',
        list.call('getPaddingLeft'),
        list.call('getPaddingTop') + by,
        list.call('getPaddingRight'),
        list.call('getPaddingBottom'),
      );
    }

    /** @param {NonNullable<typeof bar>} current @param {boolean} visible */
    function show(current, visible) {
      if (current.shown === visible) return;
      current.shown = visible;
      current.view.call('setVisibility', visible ? 0 : 8);
      if (visible) {
        // The header shrinks while the article scrolls; the bar stays right under it.
        unfollow = inu.xposed.hookMethod(viewerClass.getDeclaredMethod('setCurrentHeaderHeight'), {
          after: () => follow(),
        });
        return;
      }
      unfollow?.();
      unfollow = undefined;
      for (const list of current.padded.splice(0)) {
        try {
          shift(list, -current.height);
        } catch {
          /* the page already closed */
        }
      }
    }

    function follow() {
      const current = bar;
      if (!current?.shown) return;
      try {
        const header = current.viewer.getField('actionBar');
        const y =
          header.call('getTop') +
          header.call('topPadding') +
          Math.max(
            current.viewer.getField('currentHeaderHeight'),
            utilities.callStatic('dp(F)I', 24),
          );
        if (y === current.y) return;
        current.y = y;
        current.view.call('setTranslationY', y);
      } catch {
        /* the article already closed */
      }
    }

    const disposers = [
      inu.xposed.hookMethod(helper.getDeclaredMethod('onPageOpened'), {
        after(ctx) {
          const [viewer] = ctx.args;
          if (!viewer) return;
          try {
            attach(viewer);
            checks = 0;
            update();
            if (bar && !bar.shown) later();
          } catch {
            /* the article opens without the bar */
          }
        },
      }),
      // Translation starts, progresses, finishes and is undone through these.
      ...['invalidatePages', 'startProgress', 'finishProgress'].map((name) =>
        inu.xposed.hookMethod(helper.getDeclaredMethod(name), { after: () => update() }),
      ),
      // A web page or another article replaces the page.
      inu.xposed.hookMethod(
        inu.jvm.cls('org.telegram.ui.ArticleViewer$PageLayout').getDeclaredMethod('setType'),
        { after: () => update() },
      ),
    ];
    articleMenu.onChange(update);
    inu.onUnload(() => {
      if (bar) detach(bar);
      for (const dispose of disposers) dispose();
    });
  } catch {
    /* hosts without the article translator have no bar */
  }
}
