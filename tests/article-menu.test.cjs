const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./helpers/plugin-runtime.cjs');

function articleRuntime({ applied = true, installed = 'installation:chatlate.google' } = {}) {
  let value = installed;
  const hooks = new Map(),
    clicks = [];
  const config = {
    call(method, arg) {
      if (method === 'getValue') return value;
      if (method === 'setValue') value = arg;
    },
  };
  const page = { call: (method, other) => method === 'equals' && other === page };
  const viewer = {
    call: (method) =>
      method === 'getCurrentPageLayout'
        ? { getField: () => ({ getField: () => page }) }
        : undefined,
  };
  const caches = { rich: ['rich'], string: ['string'] };
  const state = {
    fields: { applied, loading: false },
    getField(name) {
      if (name === 'original') return page;
      if (name === 'richCache') return { call: () => caches.rich.splice(0) };
      if (name === 'stringCache') return { call: () => caches.string.splice(0) };
      return this.fields[name];
    },
    setField(name, next) {
      this.fields[name] = next;
    },
  };
  const states = {
    call: (method, key) =>
      method === 'get' && key === viewer
        ? {
            call: () => ({
              call: () => {
                const items = [state];
                return { call: (name) => (name === 'hasNext' ? items.length > 0 : items.shift()) };
              },
            }),
          }
        : undefined,
  };
  const bar = {
    getField: (name) => ({ menuBackgroundColor: 0, menuTextColor: -1, menuIconColor: -1 })[name],
  };
  const row = { call: (method) => (method === 'getParent' ? bar : undefined) };
  const button = { call: (method) => (method === 'getParent' ? row : undefined) };
  const menus = [];
  const menu = (label) => {
    const created = {
      label,
      items: [],
      calls: [],
      getField: (name) => ({ container: 'container', scrimView: button })[name],
      call(signature, ...args) {
        const method = signature.split('(')[0];
        // Overloaded methods must be named by their full signature.
        if (!signature.includes('(') && method !== 'dismiss' && method !== 'makeSwipeback')
          throw Error('ambiguous ' + method);
        // The article menu is made without a swipeback page.
        if (method === 'makeSwipeback') throw Error('no swipeback');
        if (method === 'add' || method === 'addChecked') this.items.push([method, ...args]);
        else this.calls.push([method, ...args]);
      },
    };
    menus.push(created);
    return created;
  };
  const options = menu('options');
  const native = {
    onUnload() {},
    xposed: { hookMethod: (method, hook) => (hooks.set(method, hook), () => {}) },
    jvm: {
      runnable: (fn) => fn,
      cls: (name) => ({
        getStaticField(field) {
          if (field === 'TRANSLATION_PROVIDER') return config;
          if (field === 'states') return states;
          return field;
        },
        getDeclaredMethod: (method) => name.split('.').pop() + '.' + method,
        callStatic(method, ...args) {
          if (method === 'runOnUIThread') return args[0]();
          if (method === 'getString') return 'Back';
          if (method === 'onClick') return clicks.push(args[0]);
          if (method.startsWith('makeOptions')) return menu('picker');
          if (
            method.startsWith('dp') ||
            method.startsWith('blendOver') ||
            method.startsWith('multAlpha')
          )
            return 0;
          if (method.startsWith('computePerceivedBrightness')) return 0;
          throw Error(name + '.' + method);
        },
      }),
    },
  };
  return {
    native,
    options,
    get picker() {
      return menus.find((created) => created.label === 'picker');
    },
    clicks,
    caches,
    state,
    viewer,
    get value() {
      return value;
    },
    open: () => hooks.get('InstantViewHelper.addMenuItem').after({ args: [options, null, viewer] }),
  };
}

test('the article menu opens every service in a second menu and marks the active one', () => {
  const runtime = articleRuntime();
  harness({}, undefined, 'en', runtime.native);
  runtime.open();
  assert.deepEqual(runtime.options.items[0].slice(0, 4), [
    'add',
    'msg_language',
    'Translation service',
    'Google',
  ]);
  runtime.options.items[0][4]();
  assert.deepEqual(runtime.options.calls, [['dismiss']]);
  assert.equal(runtime.picker.calls.at(-1)[0], 'show');
  // It takes the article menu's colours from the action bar.
  assert.ok(
    runtime.picker.calls.some(([method, ...args]) => method === 'setColors' && args[0] === -1),
  );
  assert.deepEqual(
    runtime.picker.items.map(([, checked, name]) => [name, checked]),
    [
      ['Google', true],
      ['Yandex', false],
      ['Microsoft', false],
    ],
  );
});

test('choosing another service translates an already translated page again', async () => {
  const runtime = articleRuntime();
  harness({}, undefined, 'en', runtime.native);
  runtime.open();
  runtime.options.items[0][4]();
  runtime.picker.items[1][3]();
  assert.deepEqual(runtime.picker.calls.at(-1), ['dismiss']);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(runtime.value, 'installation:chatlate.yandex');
  assert.deepEqual(runtime.caches, { rich: [], string: [] });
  assert.equal(runtime.state.fields.applied, false);
  assert.deepEqual(runtime.clicks, [runtime.viewer]);
});

test('an untranslated page keeps its state and only the choice is saved', async () => {
  const runtime = articleRuntime({ applied: false });
  harness({}, undefined, 'en', runtime.native);
  runtime.open();
  runtime.options.items[0][4]();
  runtime.picker.items[2][3]();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(runtime.value, 'installation:chatlate.microsoft');
  assert.deepEqual(runtime.clicks, []);
  assert.deepEqual(runtime.caches, { rich: ['rich'], string: ['string'] });
});

test('another translation service leaves the article menu as it is', () => {
  const runtime = articleRuntime({ installed: '' });
  harness({}, undefined, 'en', runtime.native);
  runtime.open();
  assert.deepEqual(runtime.options.items, []);
});
