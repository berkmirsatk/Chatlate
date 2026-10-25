const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./helpers/plugin-runtime.cjs');

class View {
  constructor() {
    this.children = [];
    this.values = {};
  }
  call(method, ...args) {
    if (method === 'addView') this.children.splice(args[1] ?? this.children.length, 0, args[0]);
    else if (method === 'getTag') return this.values.setTag;
    else if (method === 'getContext') return 'context';
    else this.values[method] = args.length > 1 ? args : args[0];
  }
}

function chatRuntime(installed = 'installation:chatlate.google') {
  let value = installed;
  const hooks = [],
    controllerCalls = [],
    ui = [];
  const config = {
    call(method, arg) {
      if (method === 'getValue') return value;
      if (method === 'setValue') value = arg;
    },
  };
  const messages = ['first', 'second'];
  const fragment = {
    getField: (name) => {
      assert.equal(name, 'messages');
      return { call: (method, index) => (method === 'size' ? messages.length : messages[index]) };
    },
  };
  const button = {
    getField: (name) =>
      ({ resourcesProvider: null, currentAccount: 0, dialogId: -1001, fragment })[name],
  };
  const swipeBack = { call: (method, ...args) => ui.push([method, ...args]) };
  const linear = new View();
  linear.children.push('translate to', 'hide');
  const layout = {
    pages: [],
    getField: (name) => (assert.equal(name, 'linearLayout'), linear),
    call(method, arg) {
      if (method === 'getContext') return 'context';
      if (method === 'getSwipeBack') return swipeBack;
      if (method === 'addViewToSwipeBack') return this.pages.push(arg) - 1 + 1;
    },
  };
  const popup = {
    call(method) {
      if (method === 'getContentView') return layout;
      ui.push([method]);
    },
  };
  const controller = {
    call(method, ...args) {
      controllerCalls.push([method, ...args]);
      if (method === 'isTranslatingDialog') return true;
    },
  };
  const native = {
    onUnload() {},
    xposed: { hookMethod: (method, hook) => (hooks.push({ method, hook }), () => {}) },
    jvm: {
      runnable: (fn) => fn,
      routine: (spec) => spec,
      defineClass: (spec) =>
        class {
          constructor() {
            this.spec = spec;
          }
        },
      cls(name) {
        const statics = {
          'desu.inugram.InuConfig': { TRANSLATION_PROVIDER: config },
          'org.telegram.messenger.R$drawable': { ic_ab_back: 1, msg_language: 2 },
          'org.telegram.messenger.R$string': { Back: 3 },
        };
        // Views are constructed with `new`; other classes only use their statics.
        return Object.assign(
          function () {
            return new View();
          },
          {
            getStaticField: (field) => {
              if (!(name in statics)) throw Error(name);
              return statics[name][field];
            },
            getDeclaredConstructor: () => ({ newInstance: () => new View() }),
            getDeclaredMethod: (descriptor) => descriptor,
            callStatic(method, ...args) {
              if (method === 'runOnUIThread') return args[0]();
              if (method === 'getString') return 'Back';
              if (method === 'getInstance') return { call: () => controller };
              throw Error(name + '.' + method);
            },
          },
        );
      },
    },
  };
  return {
    native,
    hooks,
    controllerCalls,
    ui,
    linear,
    layout,
    get value() {
      return value;
    },
    open() {
      const { hook } = hooks.find((entry) => entry.method.startsWith('showAsDropDown'));
      hook.before({ thisObject: popup, args: [{ call: () => button }] });
    },
  };
}

const click = (view) => view.values.setOnClickListener.spec.methods.onClick.body(null, view);

test('the translate bar menu offers every service under Translate to and marks the active one', () => {
  const runtime = chatRuntime();
  harness({}, undefined, 'en', runtime.native);
  runtime.open();
  const item = runtime.linear.children[1];
  assert.deepEqual(runtime.linear.children.slice(0, 1), ['translate to']);
  assert.deepEqual(item.values.setTextAndIcon, ['Translation service', 2]);
  assert.equal(item.values.setSubtext, 'Google');
  const [back, ...options] = runtime.layout.pages[0].children;
  assert.deepEqual(back.values.setTextAndIcon, ['Back', 1]);
  assert.deepEqual(
    Array.from(options, (option) => [option.values.setText, option.values.setChecked]),
    [
      ['Google', true],
      ['Yandex', false],
      ['Microsoft', false],
    ],
  );
  click(item);
  assert.deepEqual(runtime.ui, [['openForeground', 1]]);
});

test('choosing a service in the chat saves it and translates the open chat again', async () => {
  const runtime = chatRuntime();
  const h = harness({}, undefined, 'en', runtime.native);
  runtime.open();
  const yandex = runtime.layout.pages[0].children[2];
  click(yandex);
  assert.deepEqual(runtime.ui, [['dismiss']]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(runtime.value, 'installation:chatlate.yandex');
  assert.equal(h.storage.get('chatlate.provider'), 'yandex');
  assert.deepEqual(
    runtime.controllerCalls.map(([method, ...args]) => [method, ...args]),
    [
      ['isTranslatingDialog', -1001],
      ['invalidateTranslation', 'first'],
      ['invalidateTranslation', 'second'],
      ['toggleTranslatingDialog', -1001, false],
      ['toggleTranslatingDialog', -1001, true],
    ],
  );
});

test('the menu works in Turkish when Chatlate follows Turkish', () => {
  const runtime = chatRuntime('installation:chatlate.microsoft');
  harness({ language: 'tr', provider: 'microsoft' }, undefined, 'en', runtime.native);
  runtime.open();
  const item = runtime.linear.children[1];
  assert.equal(item.values.setTextAndIcon[0], 'Çeviri hizmeti');
  assert.equal(item.values.setSubtext, 'Microsoft');
});

test('a backup translation shows a short note above the translate bar and removes it', async () => {
  const panel = { calls: [], call: (...args) => panel.calls.push(args) },
    delayed = [];
  const fragment = {
    getField: (name) => (name === 'topPanelLayout' ? panel : undefined),
    call: () => null,
  };
  const native = {
    android: { getCurrentFragment: () => fragment },
    jvm: {
      runnable: (fn) => fn,
      cls: (name) =>
        Object.assign(
          function () {
            return new View();
          },
          {
            getStaticField: (field) => field,
            callStatic(method, ...args) {
              if (method === 'runOnUIThread') {
                if (args[1]) delayed.push(args);
                else args[0]();
              } else if (method === 'dp') return args[0];
              else if (method.startsWith('createLinear')) return { params: args };
              else if (method.startsWith('getColor')) return 0x777777;
              else throw Error(name + '.' + method);
            },
          },
        ),
    },
  };
  const h = harness(
    { fallback: '["google","yandex"]' },
    async (url) =>
      url.includes('yandex')
        ? { ok: true, json: async () => ({ code: 200, text: ['Merhaba'] }) }
        : { ok: false, status: 429, headers: { get: () => '' } },
    'en',
    native,
  );
  const { run } = require('./helpers/plugin-runtime.cjs');
  assert.equal((await run(h, [{ text: 'Hello' }]))[0].text, 'Merhaba');
  const [added] = panel.calls.filter(([method]) => method === 'addView');
  const note = added[1];
  assert.equal(note.values.setText, 'Google is limiting requests. Translated with Yandex.');
  assert.deepEqual(added[2].params, [-1, 32]);
  assert.deepEqual(
    panel.calls.filter(([method]) => method !== 'addView' && method !== 'getContext'),
    [
      ['setPriority', note, 11],
      ['setViewVisible', note, true, true],
    ],
  );
  // Hide after a moment, then remove once the panel's animation ends.
  delayed.shift()[0]();
  delayed.shift()[0]();
  assert.deepEqual(panel.calls.slice(-2), [
    ['setViewVisible', note, false, true],
    ['removeView', note],
  ]);
});
