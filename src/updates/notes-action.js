import { updateMessages } from './messages.js';

const FIND_ATTEMPTS = 20;
const FIND_INTERVAL_MS = 100;
// Menu items are identified by integer tags; keep clear of the host's small IDs.
const FIRST_ITEM_ID = 0x43a70000;

let listenerClass;
const handlers = new Map();
/** Pages that already carry an icon, so a second action never adds another. */
const claimed = new Set();
let nextId = 0;

/**
 * A translate icon in the top-right corner of a release-notes page.
 * The SDK page has no header actions, so it goes into the page's own action bar.
 * @param {string} title The page title, which identifies its screen.
 * @param {import('./remote-notes.js').NotesTranslation} translation
 */
export function createNotesAction(title, translation) {
  const id = FIRST_ITEM_ID + ++nextId;
  let item,
    timer,
    page,
    disposed = false;
  let android, theme;
  // Set by the UI thread once the icon is in the action bar.
  /** @type {{item: any, defaultColor: number}} */
  const pending = { item: undefined, defaultColor: 0 };

  // State is read here, on the plugin thread; the UI callback only applies it.
  function apply() {
    if (!item || disposed) return;
    const state = {
      visible: translation.available(),
      busy: translation.busy(),
      active: translation.active(),
      label: translation.active() ? updateMessages().showOriginal : updateMessages().translate,
    };
    const view = item;
    const defaultColor = pending.defaultColor;
    android.callStatic(
      'runOnUIThread',
      inu.jvm.runnable(() => {
        try {
          // The accent colour marks a translated page.
          view.call(
            'setIconColor',
            state.active
              ? theme.callStatic(
                  'getColor',
                  theme.getStaticField('key_windowBackgroundWhiteBlueText'),
                )
              : defaultColor,
          );
          view.call('setAlpha', state.busy ? 0.5 : 1);
          view.call('setEnabled', !state.busy);
          view.call('setContentDescription', state.label);
          view.call('setVisibility', state.visible ? 0 : 8);
        } catch {
          /* the page already closed */
        }
      }),
    );
  }

  function attach(fragment) {
    android = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
    theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
    listenerClass ||= inu.jvm.defineClass({
      interfaces: [inu.jvm.cls('android.view.View$OnClickListener')],
      methods: {
        onClick: {
          params: ['android.view.View'],
          returns: 'void',
          body: (_self, view) => {
            const handler = handlers.get(Number(view.call('getTag')));
            // Translating needs the plugin thread.
            if (handler) setTimeout(handler, 0);
          },
        },
      },
    });
    handlers.set(id, () => {
      if (!disposed) translation.toggle();
    });
    const listener = new listenerClass();
    let fallbackIcon = 0;
    try {
      fallbackIcon = inu.jvm
        .cls('org.telegram.messenger.R$drawable')
        .getStaticField('msg_translate');
    } catch {}
    android.callStatic(
      'runOnUIThread',
      inu.jvm.runnable(() => {
        try {
          const actionBar = fragment.call('getActionBar');
          if (!actionBar || disposed) return;
          const context = actionBar.call('getContext');
          const icon =
            context
              .call('getResources')
              .call('getIdentifier', 'msg_translate', 'drawable', context.call('getPackageName')) ||
            fallbackIcon;
          const added = actionBar
            .call('createMenu')
            .call('addItem(II)Lorg/telegram/ui/ActionBar/ActionBarMenuItem;', id, icon);
          // Replaces the menu's own handler, which would forward the tap to the page.
          added.call('setOnClickListener', listener);
          added.call('setVisibility', 8);
          // The page may have closed while the icon was being added.
          if (disposed) {
            added.call('getParent')?.call('removeView', added);
            return;
          }
          pending.defaultColor = actionBar.getField('itemsColor');
          pending.item = added;
        } catch {
          /* the notes stay readable without the icon */
        }
      }),
    );
    // The icon exists once the UI callback ran; apply its state from the plugin thread.
    const adopt = (attempt = 0) => {
      timer = undefined;
      if (disposed) return;
      if (pending.item) {
        item = pending.item;
        apply();
      } else if (attempt < FIND_ATTEMPTS)
        timer = setTimeout(() => adopt(attempt + 1), FIND_INTERVAL_MS / 2);
    };
    timer = setTimeout(adopt, 0);
  }

  function find(attempt = 0) {
    timer = undefined;
    if (disposed) return;
    try {
      const fragment = inu.android.getCurrentFragment();
      if (
        fragment &&
        String(fragment.call('getTitle')) === title &&
        ![...claimed].some((other) => other.call('equals', fragment))
      ) {
        page = fragment;
        claimed.add(fragment);
        attach(fragment);
        return;
      }
    } catch {
      /* not shown yet */
    }
    if (attempt < FIND_ATTEMPTS) timer = setTimeout(() => find(attempt + 1), FIND_INTERVAL_MS);
  }

  return {
    /** Call after the page opens. */
    attach: () => find(),
    /** Call whenever the notes or their translation change. */
    update: apply,
    /** Whether the page was found on screen. */
    found: () => page !== undefined,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      timer = undefined;
      handlers.delete(id);
      if (page) claimed.delete(page);
      const view = item ?? pending.item;
      item = pending.item = undefined;
      if (!view) return;
      try {
        android.callStatic(
          'runOnUIThread',
          inu.jvm.runnable(() => {
            try {
              view.call('getParent')?.call('removeView', view);
            } catch {}
          }),
        );
      } catch {
        /* unloading host */
      }
    },
  };
}
