import { settingsBackground, previewTextSize } from './native-style.js';
import { createExpansionIcon, setCustomIcon } from './native-icons.js';

/** Native Android marquee: scroll the actual summary only when its measured width overflows. */
export function createMarqueeRow(invalidate) {
  let state;
  let pending = false;
  let disabled = false;
  let listenerClass;
  let revision = 0;

  function updateOverflow() {
    const current = state;
    if (!current) return;
    const value = current.value;
    const available =
      value.call('getWidth') -
      value.call('getCompoundPaddingLeft') -
      value.call('getCompoundPaddingRight');
    const width = value.call('getPaint').call('measureText', current.summary);
    const overflow = available > 0 && width > available;
    value.call('setSelected', overflow);
    value.call('setHorizontalFadingEdgeEnabled', overflow);
  }

  function reset() {
    const previous = state;
    state = undefined;
    pending = false;
    revision++;
    if (!previous) return;
    try {
      inu.jvm.cls('org.telegram.messenger.AndroidUtilities').callStatic(
        'runOnUIThread',
        inu.jvm.runnable(() => {
          try {
            previous.value.call('setSelected', false);
            previous.value.call('removeOnLayoutChangeListener', previous.layoutListener);
            previous.root.call('setOnClickListener', null);
          } catch {}
        }),
      );
    } catch {
      /* unloading host */
    }
  }

  return {
    reset,
    /** @param {string} title @param {string} summary @param {() => void} onClick @param {boolean} [expanded] @returns {inu.UIElement | null} */
    render(title, summary, onClick, expanded = false) {
      if (disabled) return null;
      const key = title + ':' + summary + ':' + expanded;
      if (state) {
        const current = state;
        current.onClick = onClick;
        if (current.key !== key) {
          current.key = key;
          try {
            inu.jvm.cls('org.telegram.messenger.AndroidUtilities').callStatic(
              'runOnUIThread',
              inu.jvm.runnable(() => {
                if (state !== current || current.key !== key) return;
                current.label.call('setText', title);
                if (current.summary !== summary) {
                  current.value.call('setSelected', false);
                  current.value.call('setText', summary);
                  current.value.call('setContentDescription', summary);
                  current.summary = summary;
                  updateOverflow();
                }
                const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
                setCustomIcon(
                  current.chevron,
                  'chevron',
                  theme.callStatic(
                    'getColor',
                    theme.getStaticField('key_windowBackgroundWhiteGrayText2'),
                  ),
                  inu.jvm.cls('org.telegram.messenger.AndroidUtilities'),
                );
                current.chevron.call('setRotation', expanded ? 180 : 0);
                current.root.call('setContentDescription', title + ': ' + summary);
              }),
            );
          } catch {
            disabled = true;
            reset();
            return null;
          }
        }
        try {
          return inu.android.nativeView(current.root);
        } catch {
          disabled = true;
          reset();
          return null;
        }
      }
      if (!pending) {
        reset();
        pending = true;
        const buildRevision = revision;
        try {
          const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
          const ellipsize = inu.jvm.cls('android.text.TextUtils$TruncateAt');
          const marquee = ellipsize.getStaticField('MARQUEE');
          const end = ellipsize.getStaticField('END');
          if (!listenerClass)
            listenerClass = inu.jvm.defineClass({
              interfaces: [
                inu.jvm.cls('android.view.View$OnClickListener'),
                inu.jvm.cls('android.view.View$OnLayoutChangeListener'),
              ],
              methods: {
                onClick: {
                  params: ['android.view.View'],
                  returns: 'void',
                  body: () => {
                    const current = state;
                    setTimeout(() => {
                      if (current && state === current) current.onClick();
                    }, 0);
                  },
                },
                onLayoutChange: {
                  params: [
                    'android.view.View',
                    'int',
                    'int',
                    'int',
                    'int',
                    'int',
                    'int',
                    'int',
                    'int',
                  ],
                  returns: 'void',
                  body: () => {
                    updateOverflow();
                  },
                },
              },
            });
          utilities.callStatic(
            'runOnUIThread',
            inu.jvm.runnable(() => {
              if (revision !== buildRevision) return;
              try {
                const context = inu.jvm
                  .cls('org.telegram.messenger.ApplicationLoader')
                  .getStaticField('applicationContext');
                const layout = inu.jvm.cls('android.widget.LinearLayout');
                const params = inu.jvm.cls('android.widget.LinearLayout$LayoutParams');
                const textView = inu.jvm.cls('android.widget.TextView');
                const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
                const root = new layout(context);
                root.call('setOrientation', 0);
                root.call('setGravity', 16);
                root.call('setClipToPadding', true);
                root.call('setMinimumHeight', utilities.callStatic('dp', 56));
                const padding = utilities.callStatic('dp', 23);
                root.call('setPadding', 0, 0, 0, 0);
                settingsBackground(root, theme);
                try {
                  root.call('setForeground', theme.callStatic('getSelectorDrawable', false));
                  root.call('setForegroundGravity', 119);
                } catch {}
                const label = new textView(context);
                label.call('setPadding', padding, 0, 0, 0);
                label.call('setText', title);
                label.call('setTextSize', 18);
                label.call('setGravity', 16);
                label.call('setSingleLine', true);
                label.call('setEllipsize', end);
                label.call(
                  'setTextColor',
                  theme.callStatic(
                    'getColor',
                    theme.getStaticField('key_windowBackgroundWhiteBlackText'),
                  ),
                );
                label.call('setLayoutParams', new params(-2, utilities.callStatic('dp', 56)));
                root.call('addView', label);
                const value = new textView(context);
                value.call('setText', summary);
                previewTextSize(value, utilities);
                value.call('setGravity', 21);
                value.call('setSingleLine', true);
                value.call('setEllipsize', marquee);
                value.call('setMarqueeRepeatLimit', -1);
                value.call('setSelected', false);
                value.call('setHorizontalFadingEdgeEnabled', false);
                value.call('setContentDescription', summary);
                value.call(
                  'setTextColor',
                  theme.callStatic(
                    'getColor',
                    theme.getStaticField('key_windowBackgroundWhiteValueText'),
                  ),
                );
                const valueParams = new params(0, utilities.callStatic('dp', 56), 1);
                valueParams.call('setMargins', utilities.callStatic('dp', 12), 0, 0, 0);
                value.call('setLayoutParams', valueParams);
                root.call('addView', value);
                const iconSlot = new (inu.jvm.cls('android.widget.FrameLayout'))(context);
                iconSlot.call(
                  'setLayoutParams',
                  new params(utilities.callStatic('dp', 48), utilities.callStatic('dp', 56)),
                );
                const iconColor = theme.callStatic(
                  'getColor',
                  theme.getStaticField('key_windowBackgroundWhiteGrayText2'),
                );
                const chevron = createExpansionIcon(context, iconColor, utilities, expanded);
                const iconParams = new (inu.jvm.cls('android.widget.FrameLayout$LayoutParams'))(
                  utilities.callStatic('dp', 20),
                  utilities.callStatic('dp', 20),
                  17,
                );
                chevron.call('setLayoutParams', iconParams);
                iconSlot.call('addView', chevron);
                root.call('addView', iconSlot);
                root.call('setContentDescription', title + ': ' + summary);
                root.call('setOnClickListener', new listenerClass());
                root.call('setClickable', true);
                const layoutListener = new listenerClass();
                state = { key, root, label, value, chevron, summary, onClick, layoutListener };
                value.call('addOnLayoutChangeListener', layoutListener);
              } catch {
                disabled = true;
              }
              pending = false;
              setTimeout(() => {
                if (revision === buildRevision) invalidate();
              }, 0);
            }),
          );
        } catch {
          disabled = true;
          pending = false;
        }
      }
      return null;
    },
  };
}
