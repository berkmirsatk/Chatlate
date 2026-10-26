import { t } from './i18n.js';

/** Searchable native bottom sheet. All view work stays on the UI thread. */
export function createDraftLanguagePicker() {
  let active, classes;
  const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
  const post = (fn) => utilities.callStatic('runOnUIThread', inu.jvm.runnable(fn));
  /** @param {string | null} code @param {boolean} closeSheet */
  function finish(code = null, closeSheet = true) {
    const state = active;
    active = undefined;
    if (!state) return;
    setTimeout(() => state.resolve(code), 0);
    if (closeSheet && state.sheet) {
      // BottomSheet invokes its hide listener synchronously. Detach it before calling
      // dismiss from a JVM callback, otherwise QuickJS would be entered recursively.
      state.sheet.call('setOnHideListener', null);
      state.sheet.call('dismiss');
    }
  }
  function prepare() {
    if (classes) return;
    const click = inu.jvm.defineClass({
      interfaces: [inu.jvm.cls('android.view.View$OnClickListener')],
      methods: {
        onClick: {
          params: ['android.view.View'],
          returns: 'void',
          body: (_self, view) => finish(String(view.call('getTag'))),
        },
      },
    });
    const search = inu.jvm.defineClass({
      interfaces: [inu.jvm.cls('android.text.TextWatcher')],
      methods: {
        beforeTextChanged: {
          params: ['java.lang.CharSequence', 'int', 'int', 'int'],
          returns: 'void',
          body() {},
        },
        afterTextChanged: { params: ['android.text.Editable'], returns: 'void', body() {} },
        onTextChanged: {
          params: ['java.lang.CharSequence', 'int', 'int', 'int'],
          returns: 'void',
          body: (_self, text) => {
            const query = (typeof text === 'string' ? text : String(text.call('toString')))
              .trim()
              .toLocaleLowerCase();
            for (const row of active?.rows ?? [])
              row.view.call('setVisibility', row.search.includes(query) ? 0 : 8);
          },
        },
      },
    });
    classes = { click, search };
  }
  return {
    /** @param {{code: string, name: string}[]} options @param {string} selected @param {AbortSignal=} signal @returns {Promise<string | null>} */
    choose(options, selected, signal) {
      if (signal?.aborted) return Promise.resolve(null);
      prepare();
      const title = t('draftLanguage'),
        hint = t('draftSearch');
      return new Promise((resolve, reject) => {
        /** @type {{sheet: any, rows: {view: any, search: string}[], resolve: (code: string | null) => void}} */
        const state = {
          sheet: undefined,
          rows: [],
          resolve: (code) => {
            signal?.removeEventListener('abort', abort);
            resolve(code);
          },
        };
        const abort = () =>
          post(() => {
            if (active === state) finish();
            else state.resolve(null);
          });
        signal?.addEventListener('abort', abort);
        const dismiss = inu.jvm.runnable(() => {
          if (active === state) finish(null, false);
        });
        post(() => {
          try {
            finish();
            const fragment = inu.android.getCurrentFragment();
            if (!fragment) {
              setTimeout(() => state.resolve(null), 0);
              return;
            }
            const context = fragment.call('getParentActivity');
            const theme = inu.jvm.cls('org.telegram.ui.ActionBar.Theme');
            const color = (key) => theme.callStatic('getColor', theme.getStaticField(key));
            const dp = (size) => utilities.callStatic('dp', size);
            const params = inu.jvm.cls('android.widget.LinearLayout$LayoutParams');
            const layout = new (inu.jvm.cls('android.widget.LinearLayout'))(context);
            layout.call('setOrientation', 1);
            const input = new (inu.jvm.cls('org.telegram.ui.Components.EditTextBoldCursor'))(
              context,
            );
            input.call('setSingleLine', true);
            input.call('setTextSize', 16);
            input.call('setHint', hint);
            input.call('setTextColor', color('key_dialogTextBlack'));
            input.call('setHintTextColor', color('key_dialogTextHint'));
            input.call('setPadding', dp(24), 0, dp(24), 0);
            input.call('setLayoutParams', new params(-1, dp(52)));
            layout.call('addView', input);
            const scroll = new (inu.jvm.cls('android.widget.ScrollView'))(context);
            scroll.call('setLayoutParams', new params(-1, dp(320)));
            const list = new (inu.jvm.cls('android.widget.LinearLayout'))(context);
            list.call('setOrientation', 1);
            const rows = [];
            for (const option of options) {
              const cell = new (inu.jvm.cls('android.widget.TextView'))(context);
              cell.call('setText', option.name);
              cell.call('setTextSize', 16);
              cell.call('setGravity', 16);
              cell.call('setPadding', dp(24), 0, dp(24), 0);
              cell.call(
                'setTextColor',
                color(option.code === selected ? 'key_dialogTextBlue' : 'key_dialogTextBlack'),
              );
              cell.call('setBackground', theme.callStatic('getSelectorDrawable', false));
              cell.call('setLayoutParams', new params(-1, dp(48)));
              cell.call('setTag', option.code);
              cell.call('setOnClickListener', new classes.click());
              list.call('addView', cell);
              rows.push({
                view: cell,
                search: (option.name + ' ' + option.code).toLocaleLowerCase(),
              });
            }
            scroll.call('addView', list);
            layout.call('addView', scroll);
            const builder = new (inu.jvm.cls('org.telegram.ui.ActionBar.BottomSheet$Builder'))(
              context,
              true,
            );
            builder.call('setTitle', title);
            builder.call('setCustomView', layout);
            const sheet = builder.call('create');
            state.sheet = sheet;
            state.rows = rows;
            active = state;
            input.call('addTextChangedListener', new classes.search());
            sheet.call('setOnDismissListener', dismiss);
            sheet.call('show');
          } catch (error) {
            if (active === state) {
              active = undefined;
              state.sheet?.call('setOnHideListener', null);
              state.sheet?.call('dismiss');
            }
            signal?.removeEventListener('abort', abort);
            setTimeout(() => reject(error), 0);
          }
        });
      });
    },
    dispose() {
      post(() => finish());
    },
  };
}
