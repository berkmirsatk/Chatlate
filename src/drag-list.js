import { setCustomIcon } from './native-icons.js';
import { t } from './i18n.js';
import { settingsBackground } from './native-style.js';

/** Keep one native group and its rows alive across reorders and enable/disable changes. */
export function createDragList() {
  let classes, state;
  let pending = false,
    disabled = false,
    revision = 0;

  function slide(row, y) {
    try {
      const animator = row.call('animate');
      animator.call('translationY', y);
      animator.call('setDuration', 160);
      animator.call('start');
    } catch {
      row.call('setTranslationY', y);
    }
  }

  function paint(current, animate = true) {
    const positions = [
      ...current.ids,
      ...current.providers.map((item) => item.id).filter((id) => !current.ids.includes(id)),
    ];
    for (const [index, id] of positions.entries()) {
      const active = current.ids.indexOf(id);
      const row = current.rows.get(id),
        label = current.labels.get(id),
        icon = current.icons.get(id);
      if (animate) slide(row, index * current.step);
      else row.call('setTranslationY', index * current.step);
      row.call('setTranslationZ', 0);
      label.call(
        'setText',
        active >= 0 ? `${active + 1}. ${current.names.get(id)}` : current.names.get(id),
      );
      label.call('setTextColor', active >= 0 ? current.textColor : current.disabledColor);
      setCustomIcon(
        current.symbols.get(id),
        active >= 0 ? 'minus' : 'plus',
        current.disabledColor,
        classes.utilities,
      );
      setCustomIcon(current.grips.get(id), 'reorder', current.disabledColor, classes.utilities);
      current.handles.get(id).call('setAlpha', active >= 0 && current.ids.length > 1 ? 1 : 0.35);
      icon.call('setAlpha', active >= 0 && current.ids.length === 1 ? 0.35 : 1);
      icon.call('setEnabled', !(active >= 0 && current.ids.length === 1));
      icon.call('setContentDescription', current.actions.get(id)[active >= 0 ? 0 : 1]);
    }
    current.finishing = false;
  }

  function reset() {
    const previous = state;
    state = undefined;
    pending = false;
    revision++;
    if (!previous) return;
    try {
      classes.utilities.callStatic(
        'runOnUIThread',
        inu.jvm.runnable(() => {
          try {
            previous.root.call('getParent')?.call('requestDisallowInterceptTouchEvent', false);
            for (const label of [...previous.labels.values(), ...previous.handles.values()])
              label.call('setOnTouchListener', null);
            for (const icon of previous.icons.values()) icon.call('setOnClickListener', null);
            for (const row of previous.rows.values()) row.call('animate').call('cancel');
          } catch {
            /* a detached view needs no cleanup */
          }
        }),
      );
    } catch {
      /* unloading host */
    }
  }

  /** @param {import('./provider.js').Provider[]} order */
  function sync(order) {
    const current = state;
    if (!current) return false;
    current.ids = order.map((item) => item.id);
    current.dragging = '';
    current.finishing = true;
    classes.utilities.callStatic(
      'runOnUIThread',
      inu.jvm.runnable(() => {
        if (state === current) paint(current);
      }),
    );
    return true;
  }

  function initialize() {
    if (classes) return;
    const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
    const touch = inu.jvm.defineClass({
      interfaces: [inu.jvm.cls('android.view.View$OnTouchListener')],
      methods: {
        onTouch: {
          params: ['android.view.View', 'android.view.MotionEvent'],
          returns: 'boolean',
          body: (_self, view, event) => {
            const current = state;
            if (!current || current.finishing || current.ids.length < 2) return false;
            try {
              const action = event.call('getActionMasked');
              if (action === 0) {
                const id = String(view.call('getTag'));
                if (!current.ids.includes(id)) return false;
                current.dragging = id;
                current.original = [...current.ids];
                current.from = current.ids.indexOf(id);
                current.target = current.from;
                current.startY = Number(event.call('getRawY'));
                for (const [index, entry] of current.ids.entries()) {
                  const row = current.rows.get(entry);
                  row.call('animate').call('cancel');
                  row.call('setTranslationY', index * current.step);
                }
                current.rows.get(id).call('setTranslationZ', 1);
                current.root.call('getParent')?.call('requestDisallowInterceptTouchEvent', true);
                return true;
              }
              if (!current.dragging) return false;
              const row = current.rows.get(current.dragging);
              if (action === 2 || action === 1) {
                const delta = Math.max(
                  -current.from * current.step,
                  Math.min(
                    (current.ids.length - 1 - current.from) * current.step,
                    Number(event.call('getRawY')) - current.startY,
                  ),
                );
                row.call('setTranslationY', current.from * current.step + delta);
                const target = current.from + Math.round(delta / current.step);
                if (target !== current.target) {
                  current.target = target;
                  current.ids = [...current.original];
                  current.ids.splice(current.from, 1);
                  current.ids.splice(target, 0, current.dragging);
                  for (const [index, id] of current.ids.entries()) {
                    if (id !== current.dragging) slide(current.rows.get(id), index * current.step);
                    current.labels
                      .get(id)
                      .call('setText', `${index + 1}. ${current.names.get(id)}`);
                  }
                }
                if (action === 1) {
                  slide(row, current.target * current.step);
                  row.call('setTranslationZ', 0);
                  current.root.call('getParent')?.call('requestDisallowInterceptTouchEvent', false);
                  current.dragging = '';
                  if (current.target !== current.from) {
                    current.finishing = true;
                    const ids = [...current.ids];
                    setTimeout(() => {
                      if (state === current) current.onReorder(ids);
                    }, 0);
                  } else {
                    paint(current);
                  }
                }
                return true;
              }
              if (action === 3 || action === 5 || action === 6) {
                current.root.call('getParent')?.call('requestDisallowInterceptTouchEvent', false);
                current.ids = [...current.original];
                current.dragging = '';
                paint(current);
              }
              return true;
            } catch {
              setTimeout(() => {
                if (state === current) {
                  current.ids = [...current.original];
                  sync(current.ids.map((id) => current.providers.find((item) => item.id === id)));
                }
              }, 0);
              return false;
            }
          },
        },
      },
    });
    const click = inu.jvm.defineClass({
      interfaces: [inu.jvm.cls('android.view.View$OnClickListener')],
      methods: {
        onClick: {
          params: ['android.view.View'],
          returns: 'void',
          body: (_self, view) => {
            const current = state;
            if (!current || current.dragging || current.finishing) return;
            const id = String(view.call('getTag'));
            if (current.ids.includes(id) && current.ids.length === 1) return;
            current.finishing = true;
            setTimeout(() => {
              if (state === current) current.onToggle(id);
            }, 0);
          },
        },
      },
    });
    classes = { utilities, touch, click };
  }

  return {
    reset,
    sync,
    isPending: () => pending,
    /**
     * @param {import('./provider.js').Provider[]} providers
     * @param {import('./provider.js').Provider[]} order
     * @param {(ids: string[]) => void} onReorder
     * @param {(id: string) => void} onToggle
     * @param {() => void} invalidate
     * @returns {inu.UIElement | null}
     */
    render(providers, order, onReorder, onToggle, invalidate) {
      if (disabled) return null;
      if (state) {
        state.onReorder = onReorder;
        state.onToggle = onToggle;
        if (
          !state.dragging &&
          !state.finishing &&
          JSON.stringify(state.ids) !== JSON.stringify(order.map((item) => item.id))
        )
          sync(order);
        try {
          return inu.android.nativeView(state.root);
        } catch {
          disabled = true;
          reset();
          return null;
        }
      }
      if (!pending) {
        pending = true;
        const buildRevision = revision;
        try {
          initialize();
          // Localization/storage APIs run here, outside the UI callback.
          const actions = new Map(
            providers.map((item) => [
              item.id,
              [t('disableProvider', { name: item.name }), t('enableProvider', { name: item.name })],
            ]),
          );
          classes.utilities.callStatic(
            'runOnUIThread',
            inu.jvm.runnable(() => {
              if (revision !== buildRevision) return;
              try {
                const context = inu.jvm
                  .cls('org.telegram.messenger.ApplicationLoader')
                  .getStaticField('applicationContext');
                const root = new (inu.jvm.cls('android.widget.FrameLayout'))(context);
                const step = classes.utilities.callStatic('dp', 56);
                root.call('setMinimumHeight', step * providers.length);
                root.call('setClipToPadding', true);
                const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
                settingsBackground(root, theme);
                const textColor = theme.callStatic(
                  'getColor',
                  theme.getStaticField('key_windowBackgroundWhiteBlackText'),
                );
                const disabledColor = theme.callStatic(
                  'getColor',
                  theme.getStaticField('key_windowBackgroundWhiteGrayText2'),
                );
                const background = theme.callStatic(
                  'getColor',
                  theme.getStaticField('key_windowBackgroundWhite'),
                );
                const rows = new Map(),
                  labels = new Map(),
                  icons = new Map(),
                  symbols = new Map(),
                  handles = new Map(),
                  grips = new Map();
                for (const item of providers) {
                  const row = new (inu.jvm.cls('android.widget.LinearLayout'))(context);
                  row.call('setOrientation', 0);
                  row.call('setTag', item.id);
                  row.call('setBackgroundColor', background);
                  row.call(
                    'setLayoutParams',
                    new (inu.jvm.cls('android.widget.FrameLayout$LayoutParams'))(-1, step),
                  );
                  const handle = new (inu.jvm.cls('android.widget.FrameLayout'))(context);
                  handle.call('setTag', item.id);
                  handle.call(
                    'setLayoutParams',
                    new (inu.jvm.cls('android.widget.LinearLayout$LayoutParams'))(
                      classes.utilities.callStatic('dp', 48),
                      step,
                    ),
                  );
                  const grip = new (inu.jvm.cls('android.widget.ImageView'))(context);
                  grip.call(
                    'setLayoutParams',
                    new (inu.jvm.cls('android.widget.FrameLayout$LayoutParams'))(
                      classes.utilities.callStatic('dp', 20),
                      classes.utilities.callStatic('dp', 20),
                      17,
                    ),
                  );
                  handle.call('addView', grip);
                  grips.set(item.id, grip);
                  handle.call('setOnTouchListener', new classes.touch());
                  handle.call('setClickable', false);
                  row.call('addView', handle);
                  handles.set(item.id, handle);
                  const label = new (inu.jvm.cls('android.widget.TextView'))(context);
                  label.call('setTag', item.id);
                  label.call('setTextSize', 18);
                  label.call('setGravity', 16);
                  label.call('setPadding', classes.utilities.callStatic('dp', 7), 0, 0, 0);
                  label.call(
                    'setLayoutParams',
                    new (inu.jvm.cls('android.widget.LinearLayout$LayoutParams'))(0, step, 1),
                  );
                  label.call('setClickable', false);
                  row.call('addView', label);
                  const icon = new (inu.jvm.cls('android.widget.FrameLayout'))(context);
                  icon.call('setTag', item.id);
                  icon.call(
                    'setLayoutParams',
                    new (inu.jvm.cls('android.widget.LinearLayout$LayoutParams'))(
                      classes.utilities.callStatic('dp', 48),
                      step,
                    ),
                  );
                  const symbol = new (inu.jvm.cls('android.widget.ImageView'))(context);
                  symbol.call(
                    'setLayoutParams',
                    new (inu.jvm.cls('android.widget.FrameLayout$LayoutParams'))(
                      classes.utilities.callStatic('dp', 20),
                      classes.utilities.callStatic('dp', 20),
                      17,
                    ),
                  );
                  icon.call('addView', symbol);
                  symbols.set(item.id, symbol);
                  icon.call('setOnClickListener', new classes.click());
                  icon.call('setClickable', true);
                  row.call('addView', icon);
                  rows.set(item.id, row);
                  labels.set(item.id, label);
                  icons.set(item.id, icon);
                  root.call('addView', row);
                }
                state = {
                  root,
                  rows,
                  labels,
                  icons,
                  symbols,
                  handles,
                  grips,
                  ids: order.map((item) => item.id),
                  providers,
                  names: new Map(providers.map((item) => [item.id, item.name])),
                  actions,
                  textColor,
                  disabledColor,
                  step,
                  dragging: '',
                  finishing: false,
                  original: [],
                  from: 0,
                  target: 0,
                  startY: 0,
                  onReorder,
                  onToggle,
                };
                paint(state, false);
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
