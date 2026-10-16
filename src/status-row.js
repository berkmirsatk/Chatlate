/**
 * Renders a themed status cell, with a declarative fallback.
 * Android views must be created on the UI thread. Until ready, use the normal row.
 * @param {() => void} invalidate
 */
export function createStatusRow(invalidate) {
  let key = '',
    revision = 0;
  /** @type {JavaObject | null} */
  let view = null;

  /** @param {string} text @param {boolean} success */
  const render = (text, success) => {
    const nextKey = `${success}:${text}`;
    if (nextKey !== key) {
      key = nextKey;
      const update = ++revision;
      view = null;
      try {
        const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
        const cellClass = inu.jvm.cls('org.telegram.ui.Cells.TextInfoPrivacyCell');
        const application = inu.jvm.cls('org.telegram.messenger.ApplicationLoader');
        const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
        utilities.callStatic(
          'runOnUIThread',
          inu.jvm.runnable(() => {
            if (revision !== update) return;
            try {
              const cell = new cellClass(application.getStaticField('applicationContext'));
              cell.call('setText', text);
              const colorKey = theme.getStaticField(
                success ? 'key_windowBackgroundWhiteGreenText' : 'key_text_RedRegular',
              );
              cell.call('setTextColor', theme.callStatic('getColor', colorKey));
              view = cell;
            } catch {
              // Older Android implementations can keep the standard status row.
            }
            // The UI callback must not call plugin-thread-only settings APIs.
            setTimeout(() => {
              if (revision === update) invalidate();
            }, 0);
          }),
        );
      } catch {
        // A missing native bridge must never prevent opening settings or translating.
      }
    }
    if (view) {
      try {
        return inu.android.nativeView(view);
      } catch {
        /* retain the readable fallback */
      }
    }
    return inu.ui.separator(text);
  };
  render.reset = () => {
    key = '';
    view = null;
    revision++;
  };
  return render;
}
