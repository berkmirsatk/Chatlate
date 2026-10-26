const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const code = buildSync({
  stdin: {
    contents: "export { createDraftLanguagePicker } from './src/draft-language-picker.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Picker',
}).outputFiles[0].text;
function runtime() {
  let entered = false;
  const enter = (fn, ...args) => {
    assert.equal(entered, false, 'plugin engine is re-entered');
    entered = true;
    try {
      return fn(...args);
    } finally {
      entered = false;
    }
  };
  const views = [],
    sheets = [];
  class View {
    constructor() {
      this.values = {};
      this.calls = [];
      views.push(this);
    }
    call(method, ...args) {
      this.calls.push(method);
      if (method === 'create') {
        const sheet = new View();
        sheets.push(sheet);
        return sheet;
      }
      if (method === 'getTag') return this.values.setTag;
      if (method === 'setOnHideListener' && args[0] === null)
        this.values.setOnDismissListener = null;
      if (method === 'dismiss') this.values.setOnDismissListener?.();
      this.values[method] = args[0];
      return this;
    }
  }
  const context = {
    setTimeout,
    localStorage: { getItem: () => null },
    inu: {
      info: () => ({ language: 'en' }),
      android: { getCurrentFragment: () => ({ call: () => 'activity' }) },
      jvm: {
        runnable:
          (fn) =>
          (...args) =>
            enter(fn, ...args),
        defineClass: (spec) =>
          class {
            spec = spec;
          },
        cls(name) {
          if (name === 'org.telegram.messenger.AndroidUtilities')
            return { callStatic: (method, arg) => (method === 'runOnUIThread' ? arg() : arg) };
          if (name.endsWith('.Theme'))
            return { getStaticField: (field) => field, callStatic: (_method, value) => value };
          return View;
        },
      },
    },
  };
  vm.runInNewContext(code, context);
  const picker = context.Picker.createDraftLanguagePicker();
  const options = [
    { code: 'tr', name: 'Türkçe' },
    { code: 'en', name: 'English' },
  ];
  return {
    views,
    sheets,
    picker,
    choose: () => picker.choose(options, 'tr'),
    click: (view) => enter(view.values.setOnClickListener.spec.methods.onClick.body, null, view),
  };
}

test('language search filters native rows and selecting one resolves its code', async () => {
  const r = runtime();
  const result = r.choose();
  const input = r.views.find((view) => view.values.setHint === 'Search languages');
  const rows = r.views.filter((view) => ['tr', 'en'].includes(view.values.setTag));
  input.values.addTextChangedListener.spec.methods.onTextChanged.body(null, 'eng', 0, 0, 3);
  assert.equal(rows[0].values.setVisibility, 8);
  assert.equal(rows[1].values.setVisibility, 0);
  r.click(rows[1]);
  assert.equal(await result, 'en');
  assert.ok(r.sheets[0].calls.includes('dismiss'));
});

test('dismissing an old sheet cannot cancel a newer language selection', async () => {
  const r = runtime();
  const first = r.choose();
  const oldDismiss = r.sheets[0].values.setOnDismissListener;
  const second = r.choose();
  assert.equal(await first, null);
  oldDismiss();
  const rows = r.views.filter((view) => view.values.setTag === 'tr');
  r.click(rows[1]);
  assert.equal(await second, 'tr');
});

test('disposing the picker resolves cancellation and dismisses its sheet', async () => {
  const r = runtime();
  const result = r.choose();
  r.picker.dispose();
  assert.equal(await result, null);
});

test('a native dismissal resolves cancellation without recursively dismissing again', async () => {
  const r = runtime();
  const result = r.choose();
  r.sheets[0].call('dismiss');
  assert.equal(await result, null);
  assert.equal(r.sheets[0].calls.filter((method) => method === 'dismiss').length, 1);
});
