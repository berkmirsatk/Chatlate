import { LANGUAGES } from './language-catalog.js';
import { createLanguageLabels } from './language-flags.js';
import { settingsBackground, previewTextSize } from './native-style.js';

/** Native language selector with image labels; retain the SDK selector if unavailable. */
export function createLanguageRow(invalidate) {
  let state, listenerClass;
  let pending = false,
    disabled = false,
    revision = 0;

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
            previous.root.call('setOnClickListener', null);
            previous.menu?.call('dismiss');
          } catch {
            /* detached view */
          }
        }),
      );
    } catch {
      /* unloading host */
    }
  }

  function openMenu(current) {
    try {
      const fragment = inu.android.getCurrentFragment();
      if (!fragment) throw new Error('No active settings fragment');
      inu.jvm.cls('org.telegram.messenger.AndroidUtilities').callStatic(
        'runOnUIThread',
        inu.jvm.runnable(() => {
          if (state !== current) return;
          try {
            // Custom SDK rows are wrapped; anchor the actual RecyclerListView child.
            // Inugram can then apply its section corner shape to the popup scrim.
            let anchor;
            try {
              const listClass = inu.jvm.cls('org.telegram.ui.Components.RecyclerListView');
              let view = current.root;
              for (let depth = 0; depth < 8; depth++) {
                const parent = view.call('getParent');
                if (listClass.isInstance(parent)) {
                  anchor = view;
                  break;
                }
                if (!parent) break;
                view = parent;
              }
            } catch {
              /* older hosts can omit the cloned row */
            }
            const menu = inu.jvm
              .cls('org.telegram.ui.Components.ItemOptions')
              .callStatic('makeOptions', fragment, anchor || current.root);
            if (!anchor) menu.call('setDrawScrim', false);
            for (const [index, label] of current.labels.entries())
              menu.call(
                'add',
                label,
                inu.jvm.runnable(() => {
                  setTimeout(() => {
                    if (state === current) current.onChange(index);
                  }, 0);
                }),
              );
            current.menu = menu;
            menu.call('show');
          } catch {
            disabled = true;
            reset();
            setTimeout(invalidate, 0);
          }
        }),
      );
    } catch {
      disabled = true;
      reset();
      invalidate();
    }
  }

  return {
    reset,
    /** @param {string} title @param {string} language @param {(index: number) => void} onChange @returns {inu.UIElement | null} */
    render(title, language, onChange) {
      if (disabled) return null;
      const index = Math.max(
        0,
        LANGUAGES.findIndex((item) => item.code === language),
      );
      const key = title + ':' + language;
      if (state) {
        const current = state;
        current.onChange = onChange;
        if (current.key !== key) {
          current.key = key;
          inu.jvm.cls('org.telegram.messenger.AndroidUtilities').callStatic(
            'runOnUIThread',
            inu.jvm.runnable(() => {
              if (state !== current || current.key !== key) return;
              try {
                current.label.call('setText', title);
                current.value.call('setText', current.labels[index]);
                current.root.call('setContentDescription', title + ': ' + LANGUAGES[index].name);
              } catch {
                disabled = true;
                reset();
                setTimeout(invalidate, 0);
              }
            }),
          );
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
        const buildRevision = revision;
        try {
          // Check menu availability before allocating a listener class.
          inu.jvm.cls('org.telegram.ui.Components.ItemOptions');
          const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
          if (!listenerClass)
            listenerClass = inu.jvm.defineClass({
              interfaces: [inu.jvm.cls('android.view.View$OnClickListener')],
              methods: {
                onClick: {
                  params: ['android.view.View'],
                  returns: 'void',
                  body: () => {
                    const current = state;
                    setTimeout(() => {
                      if (current && state === current) openMenu(current);
                    }, 0);
                  },
                },
              },
            });
          pending = true;
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
                const text = inu.jvm.cls('android.widget.TextView');
                const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
                const root = new layout(context),
                  label = new text(context),
                  value = new text(context);
                const labels = createLanguageLabels(context, utilities);
                root.call('setOrientation', 0);
                root.call('setGravity', 16);
                root.call('setMinimumHeight', utilities.callStatic('dp', 56));
                settingsBackground(root, theme);
                root.call('setForeground', theme.callStatic('getSelectorDrawable', false));
                root.call('setForegroundGravity', 119);
                label.call('setText', title);
                label.call('setTextSize', 18);
                label.call('setGravity', 16);
                label.call('setPadding', utilities.callStatic('dp', 23), 0, 0, 0);
                label.call(
                  'setTextColor',
                  theme.callStatic(
                    'getColor',
                    theme.getStaticField('key_windowBackgroundWhiteBlackText'),
                  ),
                );
                label.call('setLayoutParams', new params(-2, utilities.callStatic('dp', 56)));
                root.call('addView', label);
                value.call('setText', labels[index]);
                previewTextSize(value, utilities);
                value.call('setGravity', 21);
                value.call('setSingleLine', true);
                value.call(
                  'setEllipsize',
                  inu.jvm.cls('android.text.TextUtils$TruncateAt').getStaticField('MARQUEE'),
                );
                value.call('setMarqueeRepeatLimit', -1);
                value.call('setSelected', true);
                value.call(
                  'setPadding',
                  utilities.callStatic('dp', 12),
                  0,
                  utilities.callStatic('dp', 23),
                  0,
                );
                value.call(
                  'setTextColor',
                  theme.callStatic(
                    'getColor',
                    theme.getStaticField('key_windowBackgroundWhiteValueText'),
                  ),
                );
                value.call('setLayoutParams', new params(0, utilities.callStatic('dp', 56), 1));
                root.call('addView', value);
                root.call('setContentDescription', title + ': ' + LANGUAGES[index].name);
                root.call('setOnClickListener', new listenerClass());
                root.call('setClickable', true);
                state = { root, label, value, labels, key, onChange, menu: undefined };
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
