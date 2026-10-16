import { settingsBackground } from './native-style.js';

/** One settings box containing independently colored connection results. */
export function createStatusGroup(invalidate) {
  let key = '';
  let root;
  let revision = 0;

  function reset() {
    key = '';
    root = undefined;
    revision++;
  }

  return {
    reset,
    /** @param {{text: string, successful: boolean}[]} results @returns {inu.UIElement} */
    render(results) {
      const nextKey = JSON.stringify(results);
      if (key !== nextKey) {
        key = nextKey;
        const update = ++revision;
        try {
          const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
          const application = inu.jvm.cls('org.telegram.messenger.ApplicationLoader');
          const layout = inu.jvm.cls('android.widget.LinearLayout');
          const cellClass = inu.jvm.cls('android.widget.TextView');
          const params = inu.jvm.cls('android.widget.LinearLayout$LayoutParams');
          const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
          utilities.callStatic(
            'runOnUIThread',
            inu.jvm.runnable(() => {
              if (revision !== update) return;
              try {
                const context = application.getStaticField('applicationContext');
                const group = root || new layout(context);
                group.call('setOrientation', 1);
                group.call(
                  'setPadding',
                  0,
                  utilities.callStatic('dp', 8),
                  0,
                  utilities.callStatic('dp', 8),
                );
                settingsBackground(group, theme);
                group.call('removeAllViews');
                for (const result of results) {
                  const cell = new cellClass(context);
                  cell.call('setText', result.text);
                  cell.call('setTextSize', 16);
                  cell.call('setIncludeFontPadding', false);
                  cell.call(
                    'setPadding',
                    utilities.callStatic('dp', 23),
                    utilities.callStatic('dp', 4),
                    utilities.callStatic('dp', 23),
                    utilities.callStatic('dp', 4),
                  );
                  cell.call('setLayoutParams', new params(-1, -2));
                  const color = theme.getStaticField(
                    result.successful
                      ? 'key_windowBackgroundWhiteGreenText'
                      : 'key_text_RedRegular',
                  );
                  cell.call('setTextColor', theme.callStatic('getColor', color));
                  group.call('addView', cell);
                }
                root = group;
              } catch {
                root = undefined;
              }
              setTimeout(() => {
                if (revision === update) invalidate();
              }, 0);
            }),
          );
        } catch {
          root = undefined;
        }
      }
      if (root) {
        try {
          return inu.android.nativeView(root);
        } catch {
          /* use one multiline fallback */
        }
      }
      return inu.ui.separator(results.map((result) => result.text).join('\n'));
    },
  };
}
