const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  code,
  harness,
  summaryValue,
  openOrder,
  orderAction,
  chooseProvider,
  waitUntil,
  ok,
  run,
  replyWith,
  runWith,
} = require('./helpers/plugin-runtime.cjs');
const { dragRuntime, nativeOrderPage } = require('./helpers/native-runtime.cjs');

test('Chatlate registers keyless providers and defaults to English', () => {
  const h = harness();
  assert.equal(h.registered.size, 2);
  assert.equal(h.registered.get('multi.google-free').name, 'Google');
  assert.equal(h.registered.get('multi.google-free').format, 'entities');
  assert.equal(h.page.title, 'Chatlate');
  const language = h.page.items().find((row) => row.id === 'language');
  assert.equal(language.text, 'Language');
  assert.equal(language.selected, 0);
  assert.equal(h.page.items().find((row) => row.id === 'test').text, 'Test connection');
});

test('language selection updates the UI and errors and survives reload', async () => {
  const h = harness();
  h.page
    .items()
    .find((row) => row.id === 'language')
    .onChange(1);
  assert.equal(h.page.items().find((row) => row.id === 'language').text, 'Dil');
  assert.equal(h.page.items().find((row) => row.id === 'test').text, 'Bağlantıyı test et');
  await assert.rejects(
    run(h, [{ text: 'a', entities: [{ _: 'messageEntityBold', offset: 0, length: 2 }] }]),
    /Geçersiz mesaj/,
  );
  const reloaded = harness({
    language: h.storage.get('multi-translate.language'),
    'settings-version': '3',
  });
  assert.equal(reloaded.page.items().find((row) => row.id === 'language').selected, 1);
  h.page
    .items()
    .find((row) => row.id === 'language')
    .onChange(0);
  assert.equal(h.page.items().find((row) => row.id === 'test').text, 'Test connection');
});

test('unsupported saved language falls back to English', () => {
  const h = harness({ language: 'de' });
  assert.equal(h.page.items().find((row) => row.id === 'language').text, 'Language');
});

test('upgrade removes obsolete configuration and preserves language and cooldown', () => {
  const until = String(Date.now() + 60000);
  const h = harness({
    language: 'tr',
    'google-free.blockedUntil': until,
    'obsolete.key': 'remove',
    'obsolete.option': 'remove',
    'settings-version': '2',
  });
  assert.equal(h.storage.has('multi-translate.obsolete.key'), false);
  assert.equal(h.storage.has('multi-translate.obsolete.option'), false);
  assert.equal(h.storage.get('multi-translate.language'), 'tr');
  assert.equal(h.storage.get('multi-translate.google-free.blockedUntil'), until);
  assert.equal(h.storage.get('multi-translate.settings-version'), '7');
});

test('connection test reports success in the selected language', async () => {
  const h = harness({}, replyWith(['Merhaba dünya']));
  h.page
    .items()
    .find((row) => row.id === 'test')
    .onClick();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(
    h.page
      .items()
      .some((row) => new RegExp('^Google: Connection successful\\. · [0-9]+ ms$').test(row.text)),
  );
});

test('automatic language follows the app and falls back to English for unsupported languages', () => {
  for (const [appLanguage, label] of [
    ['tr', 'Dil'],
    ['tr-TR', 'Dil'],
    ['tr_TR', 'Dil'],
    ['en-US', 'Language'],
    ['de', 'Language'],
    ['', 'Language'],
  ]) {
    const h = harness({}, undefined, appLanguage);
    const language = h.page.items().find((row) => row.id === 'language');
    assert.equal(language.text, label);
    assert.equal(language.selected, label === 'Dil' ? 1 : 0);
  }
});

test('manual override persists until the current app language is selected', () => {
  const h = harness({}, undefined, 'tr');
  h.page
    .items()
    .find((row) => row.id === 'language')
    .onChange(0);
  assert.equal(h.page.items().find((row) => row.id === 'language').text, 'Language');
  h.page
    .items()
    .find((row) => row.id === 'language')
    .onChange(1);
  assert.equal(h.page.items().find((row) => row.id === 'language').text, 'Dil');
  h.setAppLanguage('en');
  assert.equal(h.page.items().find((row) => row.id === 'language').text, 'Language');
});

test('connection test shows status and timing alongside fallback community controls', async () => {
  const h = harness({ language: 'tr' }, replyWith(['Merhaba dünya']));
  assert.deepEqual(
    Array.from(
      h.page.items().filter((row) => row.id),
      (row) => row.id,
    ),
    [
      'community.channel',
      'community.group',
      'community.github',
      'release.notes',
      'community.donate',
      'language',
      'provider',
      'test',
    ],
  );
  h.page
    .items()
    .find((row) => row.id === 'test')
    .onClick();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(
    h.page
      .items()
      .some((row) => new RegExp('^Google: Bağlantı başarılı\\. · [0-9]+ ms$').test(row.text)),
  );
});

test('connection test fallback reports failures without a success message', async () => {
  const h = harness({}, async () => {
    throw new Error('network failure');
  });
  h.page
    .items()
    .find((row) => row.id === 'test')
    .onClick();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(
    h.page
      .items()
      .some((row) =>
        new RegExp('^Google: Could not connect to the translation service\\. · [0-9]+ ms$').test(
          row.text,
        ),
      ),
  );
  assert.ok(h.page.items().every((row) => !String(row.text).includes('Connection successful')));
});

test('native connection statuses share one box and preserve individual themed colors', async () => {
  for (const outcomes of [[true], [false], [true, false]]) {
    const queue = [],
      cells = [];
    let onUi = false;
    class Cell {
      constructor(context) {
        assert.equal(onUi, true);
        assert.equal(context, 'app');
        this.values = {};
        cells.push(this);
      }
      call(method, ...args) {
        assert.equal(onUi, true);
        if (method === 'setPadding') this.padding = args;
        this.values[method] = args[0];
      }
    }
    class Group {
      constructor() {
        assert.equal(onUi, true);
        this.children = [];
        this.values = {};
      }
      call(method, value, ...args) {
        assert.equal(onUi, true);
        if (method === 'setPadding') this.padding = [value, ...args];
        if (method === 'addView') this.children.push(value);
        else if (method === 'removeAllViews') this.children = [];
        else this.values[method] = value;
      }
    }
    const native = {
      jvm: {
        runnable: (fn) => fn,
        cls: (name) => {
          if (name.endsWith('AndroidUtilities'))
            return {
              callStatic(method, fn) {
                if (method === 'dp') return fn;
                assert.equal(method, 'runOnUIThread');
                queue.push(fn);
              },
            };
          if (name === 'android.widget.TextView') return Cell;
          if (name === 'android.widget.LinearLayout$LayoutParams')
            return class {
              constructor(...args) {
                this.args = args;
              }
            };
          if (
            name === 'android.view.View' ||
            name === 'android.widget.LinearLayout' ||
            name === 'android.graphics.drawable.GradientDrawable'
          )
            return Group;
          if (name.endsWith('ApplicationLoader')) return { getStaticField: () => 'app' };
          if (name.endsWith('Theme'))
            return { getStaticField: (key) => key, callStatic: (method, key) => key };
          throw Error(name);
        },
      },
      android: { nativeView: (view) => ({ native: view }) },
    };
    const h = harness(
      outcomes.length > 1 ? { fallback: '1' } : {},
      async (url) => {
        const index = url.includes('yandex') ? 1 : 0;
        if (!outcomes[index]) throw Error('offline');
        return url.includes('yandex') ? ok({ code: 200, text: ['Merhaba'] }) : ok([[['Merhaba']]]);
      },
      'en',
      native,
    );
    h.page
      .items()
      .find((row) => row.id === 'test')
      .onClick();
    await waitUntil(
      () => h.page.items().find((row) => row.id === 'test').text === 'Test connection',
    );
    const pendingRows = h.page.items();
    assert.ok(pendingRows.every((row) => !/[🟢🔴]/u.test(String(row.text))));
    assert.ok(queue.length >= 1);
    assert.equal(cells.length, 0);
    onUi = true;
    while (queue.length) queue.shift()();
    onUi = false;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const rows = h.page.items().filter((row) => row.native);
    assert.equal(rows.length, 1);
    const group = rows[0].native;
    assert.equal(group.children.length, outcomes.length);
    assert.equal(group.values.setOrientation, 1);
    assert.equal(group.values.setClipToOutline, false);
    assert.equal(group.values.setBackgroundColor, 'key_windowBackgroundWhite');
    assert.deepEqual(group.padding, [0, 8, 0, 8]);
    for (const [index, success] of outcomes.entries()) {
      const cell = group.children[index],
        name = index ? 'Yandex' : 'Google';
      assert.ok(cell.values.setText.startsWith(name + ': '));
      assert.deepEqual(cell.padding, [23, 4, 23, 4]);
      assert.equal(cell.values.setIncludeFontPadding, false);
      assert.deepEqual(cell.values.setLayoutParams.args, [-1, -2]);
      assert.equal(
        cell.values.setTextColor,
        success ? 'key_windowBackgroundWhiteGreenText' : 'key_text_RedRegular',
      );
    }
    h.page.items();
    assert.equal(queue.length, 0);
  }
});

test('inline provider selection persists and connection test uses it without a popup', async () => {
  let calls = 0;
  const h = harness({}, async (url) => {
    calls++;
    assert.ok(url.includes('yandex'));
    return ok({ code: 200, text: ['Merhaba dünya'] });
  });
  const row = h.page.items().find((row) => row.id === 'provider');
  assert.ok(row.value.endsWith('▾'));
  chooseProvider(h, 1);
  assert.equal(summaryValue(h), '1. Yandex');
  assert.equal(h.opened, undefined);
  h.page
    .items()
    .find((row) => row.id === 'test')
    .onClick();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(calls, 1);
  assert.ok(h.page.items().some((row) => String(row.text).includes('Connection successful')));
});

test('upgrade removes DeepL state and preserves the selected supported provider', () => {
  const h = harness({
    'settings-version': '3',
    'deepl-free.blockedUntil': '12345',
    provider: 'yandex-free',
  });
  assert.equal(h.storage.has('multi-translate.deepl-free.blockedUntil'), false);
  assert.equal(h.storage.get('multi-translate.provider'), 'yandex-free');
  assert.equal(h.registered.has('multi.deepl-free'), false);
});

test('native provider selection synchronizes the active installation and respects other providers', () => {
  let value = 'installation-123:multi.google-free';
  const config = {
    call(method, arg) {
      if (method === 'getValue') return value;
      if (method === 'setValue') value = arg;
      else throw Error(method);
    },
  };
  const native = {
    jvm: {
      cls(name) {
        if (name !== 'desu.inugram.InuConfig') throw Error(name);
        return {
          getStaticField: (field) => {
            if (field === 'INSTANCE') return { call: () => config };
            throw Error(field);
          },
        };
      },
    },
  };
  const h = harness({}, undefined, 'en', native);
  chooseProvider(h, 1);
  assert.equal(value, 'installation-123:multi.yandex-free');
  value = 'installation-123:multi.google-free';
  assert.equal(summaryValue(h), '1. Google → 2. Yandex');
  value = 'another-plugin:unrelated';
  chooseProvider(h, 1);
  assert.equal(value, 'another-plugin:unrelated');
  value = '';
  chooseProvider(h, 0);
  assert.equal(value, 'installation-123:multi.google-free');
  value = 'installation-123:multi.deepl-free';
  harness({}, undefined, 'en', native);
  assert.equal(value, 'installation-123:multi.google-free');
});

test('description hooks affect only Chatlate, follow plugin language and dispose on unload', () => {
  const hooks = new Map();
  let unload;
  let disposed = 0;
  const native = {
    jvm: {
      cls(name) {
        if (name !== 'desu.inugram.core.plugins.PluginManifest') throw Error(name);
        return { getDeclaredMethod: (method) => method };
      },
    },
    xposed: {
      hookMethod(method, hook) {
        hooks.set(method, hook);
        return () => {
          disposed++;
        };
      },
    },
    onUnload(fn) {
      const previous = unload;
      unload = () => {
        previous?.();
        fn();
      };
    },
  };
  const h = harness({}, undefined, 'tr', native);
  function description(id, method, lang) {
    let output = 'original';
    hooks.get(method).after({
      thisObject: { call: () => id },
      args: method === 'description' ? [lang] : [],
      throwable: null,
      setReturnValue: (value) => {
        output = value;
      },
    });
    return output;
  }
  const own = 'io.inugram.community.chatlate';
  assert.match(description(own, 'description', 'tr'), /Biçimlendirmeyi koruyan sohbet çevirisi/);
  assert.match(description(own, 'getDescription'), /Biçimlendirmeyi koruyan sohbet çevirisi/);
  assert.equal(description('another.plugin', 'description', 'tr'), 'original');
  h.page
    .items()
    .find((row) => row.id === 'language')
    .onChange(0);
  assert.equal(
    description(own, 'description', 'tr'),
    'Chat translation with formatting preserved.',
  );
  h.page
    .items()
    .find((row) => row.id === 'language')
    .onChange(1);
  assert.match(description(own, 'description', 'tr'), /Biçimlendirmeyi koruyan sohbet çevirisi/);
  assert.match(description(own, 'description', 'de'), /^Chat translation/);
  unload();
  assert.equal(disposed, 2);
});

test('provider sync supports direct Kotlin fields and verifies the actual app value', () => {
  let value = 'real-installation:multi.google-free';
  const config = {
    call(method, arg) {
      if (method === 'getValue') return value;
      if (method === 'setValue') {
        value = arg;
        return;
      }
      throw Error(method);
    },
  };
  const native = {
    jvm: {
      cls(name) {
        if (name !== 'desu.inugram.InuConfig') throw Error(name);
        return {
          getStaticField(field) {
            assert.equal(field, 'TRANSLATION_PROVIDER');
            return config;
          },
        };
      },
    },
  };
  const h = harness({}, undefined, 'en', native);
  const row = h.page.items().find((row) => row.id === 'provider');
  assert.equal(row.text, 'Translation provider');
  chooseProvider(h, 1);
  assert.equal(value, 'real-installation:multi.yandex-free');
  assert.equal(summaryValue(h), '1. Yandex');
  assert.equal(h.storage.get('multi-translate.provider'), 'yandex-free');
});

test('failed provider writes retain the real selection and show a synchronization error', () => {
  const config = {
    call(method) {
      if (method === 'getValue') return 'real-installation:multi.google-free';
      if (method === 'setValue') return;
      throw Error(method);
    },
  };
  const native = {
    jvm: {
      cls(name) {
        if (name !== 'desu.inugram.InuConfig') throw Error(name);
        return { getStaticField: () => config };
      },
    },
  };
  const h = harness({}, undefined, 'en', native);
  chooseProvider(h, 1);
  assert.equal(summaryValue(h), '1. Google → 2. Yandex');
  assert.equal(h.storage.has('multi-translate.provider'), false);
  assert.ok(h.page.items().some((row) => String(row.text).includes('Could not update Inugram')));
});

test('fresh install activates Google from Telegram using the persisted installation identity', () => {
  const install = 'a123456789abcdef0123456789abcdef';
  let value = '';
  const config = {
    call(method, arg) {
      if (method === 'getValue') return value;
      if (method === 'setValue') {
        value = arg;
        return;
      }
      throw Error(method);
    },
  };
  const state = {
    call(method) {
      assert.equal(method, 'getValue');
      return JSON.stringify([
        { id: 'b123456789abcdef0123456789abcdef', pluginId: 'other.plugin', enabled: true },
        { id: install, pluginId: 'io.inugram.community.chatlate', enabled: true },
      ]);
    },
  };
  const native = {
    jvm: {
      cls(name) {
        if (name !== 'desu.inugram.InuConfig') throw Error(name);
        return { getStaticField: (field) => (field === 'TRANSLATION_PROVIDER' ? config : state) };
      },
    },
  };
  const h = harness({}, undefined, 'en', native);
  assert.equal(value, install + ':multi.google-free');
  assert.equal(summaryValue(h), '1. Google');
  value = '';
  const saved = Object.fromEntries(
    [...h.storage].map(([k, v]) => [k.replace('multi-translate.', ''), v]),
  );
  harness(saved, undefined, 'en', native);
  assert.equal(value, install + ':multi.google-free');
  chooseProvider(h, 0);
  assert.equal(value, install + ':multi.google-free');
  chooseProvider(h, 1);
  assert.equal(value, install + ':multi.yandex-free');
});

test('resumed plugin screens refresh descriptions after the resume hook has returned', () => {
  let unload,
    onUi = false,
    updates = 0;
  const queue = [],
    hooks = new Map();
  const adapter = {
    update(value) {
      assert.equal(onUi, true);
      assert.equal(value, true);
      updates++;
    },
  };
  const fragment = {
    getField(name) {
      assert.equal(name, 'listView');
      return { call: () => adapter };
    },
  };
  const native = {
    android: {
      getCurrentFragment() {
        throw Error('Global current fragment may be stale');
      },
    },
    jvm: {
      runnable() {
        throw Error('JS callbacks suppress nested hooks');
      },
      routine(spec, captures) {
        assert.equal(captures[0], adapter);
        return Function('adapter', 'return (' + spec.source + ');')(captures[0]);
      },
      cls(name) {
        if (name.endsWith('PluginManifest')) return { getDeclaredMethod: (method) => method };
        if (name.endsWith('AndroidUtilities'))
          return {
            callStatic(method, fn, delay) {
              assert.equal(method, 'runOnUIThread');
              assert.ok(delay > 0);
              queue.push(fn);
            },
          };
        if (name.endsWith('PluginInfoActivity') || name.endsWith('PluginsActivity'))
          return { getDeclaredMethod: (method) => name + '.' + method };
        throw Error(name);
      },
    },
    xposed: {
      hookMethod(method, hook) {
        hooks.set(method, hook);
        return () => {};
      },
    },
    onUnload(fn) {
      const previous = unload;
      unload = () => {
        previous?.();
        fn();
      };
    },
  };
  harness({}, undefined, 'en', native);
  for (const name of ['PluginInfoActivity', 'PluginsActivity']) {
    const before = updates;
    hooks
      .get('desu.inugram.ui.settings.' + name + '.onResume')
      .after({ thisObject: fragment, throwable: null });
    assert.equal(updates, before);
    onUi = true;
    queue.shift()();
    onUi = false;
    assert.equal(updates, before + 1);
  }
  unload();
});

test('external provider changes do not display the previous provider connection result', async () => {
  let value = 'installation-123:multi.google-free';
  const config = {
    call(method, arg) {
      if (method === 'getValue') return value;
      if (method === 'setValue') {
        value = arg;
        return;
      }
      throw Error(method);
    },
  };
  const native = {
    jvm: {
      cls(name) {
        if (name !== 'desu.inugram.InuConfig') throw Error(name);
        return { getStaticField: () => config };
      },
    },
  };
  const h = harness({}, replyWith(['Merhaba']), 'en', native);
  h.page
    .items()
    .find((row) => row.id === 'test')
    .onClick();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(
    h.page
      .items()
      .some((row) => new RegExp('^Google: Connection successful\\. · [0-9]+ ms$').test(row.text)),
  );
  value = 'installation-123:multi.yandex-free';
  assert.equal(summaryValue(h), '1. Yandex');
  assert.ok(
    h.page.items().every((row) => !/^Google: Connection successful\. · [0-9]+ ms$/.test(row.text)),
  );
});

test('provider priorities expand on the main page with localized controls', () => {
  const h = harness({ language: 'tr' });
  const page = openOrder(h);
  assert.equal(page, h.page);
  assert.equal(h.opened, undefined);
  orderAction(h, 'Ekle: Yandex');
  assert.equal(summaryValue(h), '1. Google → 2. Yandex');
  assert.equal(h.storage.get('multi-translate.fallback'), '["google-free","yandex-free"]');
  const reloaded = harness({ fallback: '["google-free","yandex-free"]', 'settings-version': '7' });
  assert.equal(summaryValue(reloaded), '1. Google → 2. Yandex');
  orderAction(h, 'Kaldır: Yandex');
  assert.equal(summaryValue(h), '1. Google');
});

test('changing primary provider swaps order and never retries the primary twice', async () => {
  const h = harness({ fallback: 'yandex-free' }, async (url) =>
    url.includes('yandex') ? { ok: false, status: 503 } : ok([[['Merhaba']]]),
  );
  chooseProvider(h, 1);
  assert.equal(summaryValue(h), '1. Yandex → 2. Google');
  assert.equal(summaryValue(h), '1. Yandex → 2. Google');
  assert.equal((await runWith(h, 'yandex-free', [{ text: 'Hello' }]))[0].text, 'Merhaba');
});

test('migration converts old backup choices and removes unsupported IDs', () => {
  for (const [provider, backup] of [
    ['google-free', 'yandex-free'],
    ['yandex-free', 'google-free'],
  ]) {
    const h = harness({ provider, fallback: '1', 'settings-version': '5' });
    assert.deepEqual(JSON.parse(h.storage.get('multi-translate.fallback')), [provider, backup]);
  }
  for (const fallback of ['0', 'deepl-free', 'unknown']) {
    const h = harness({ fallback, 'settings-version': '6' });
    assert.equal(summaryValue(h), '1. Google');
  }
});

test('moving a provider changes native selection and saves the complete priority order', () => {
  let value = 'real-installation:multi.google-free';
  const config = {
    call(method, arg) {
      if (method === 'getValue') return value;
      if (method === 'setValue') {
        value = arg;
        return;
      }
      throw Error(method);
    },
  };
  const native = {
    jvm: {
      cls(name) {
        if (name !== 'desu.inugram.InuConfig') throw Error(name);
        return { getStaticField: () => config };
      },
    },
  };
  const h = harness({ fallback: 'yandex-free' }, undefined, 'en', native);
  orderAction(h, 'Move up: Yandex');
  assert.equal(value, 'real-installation:multi.yandex-free');
  assert.equal(summaryValue(h), '1. Yandex → 2. Google');
  assert.equal(h.storage.get('multi-translate.fallback'), '["yandex-free","google-free"]');
  orderAction(h, 'Move down: Yandex');
  assert.equal(value, 'real-installation:multi.google-free');
});

test('failed native reordering does not save a priority order that was not applied', () => {
  const config = {
    call(method) {
      if (method === 'getValue') return 'real-installation:multi.google-free';
      if (method === 'setValue') return;
      throw Error(method);
    },
  };
  const native = {
    jvm: {
      cls(name) {
        if (name !== 'desu.inugram.InuConfig') throw Error(name);
        return { getStaticField: () => config };
      },
    },
  };
  const h = harness({ fallback: 'yandex-free' }, undefined, 'en', native);
  const before = h.storage.get('multi-translate.fallback');
  orderAction(h, 'Move up: Yandex');
  assert.equal(h.storage.get('multi-translate.fallback'), before);
  assert.ok(h.page.items().some((row) => String(row.text).includes('Could not update Inugram')));
});

test('connection test follows enabled order, isolates failures and ignores repeated clicks', async () => {
  const calls = [];
  const h = harness({ fallback: '1' }, async (url) => {
    calls.push(url.includes('yandex') ? 'Yandex' : 'Google');
    return url.includes('yandex') ? { ok: false, status: 503 } : ok([[['Merhaba']]]);
  });
  chooseProvider(h, 1);
  const button = h.page.items().find((row) => row.id === 'test');
  button.onClick();
  button.onClick();
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.deepEqual(calls, ['Yandex', 'Google']);
  const statusBox = h.page.items().filter((row) => /^(Google|Yandex):/.test(row.text));
  assert.equal(statusBox.length, 1);
  const statuses = statusBox[0].text.split('\n');
  assert.equal(statuses.length, 2);
  assert.match(statuses[0], /^Yandex: .*503.* ms$/);
  assert.match(statuses[1], /^Google: Connection successful.* ms$/);
  assert.equal(summaryValue(h), '1. Yandex → 2. Google');
});

test('timing out a service still tests the next enabled provider', async () => {
  const calls = [];
  const h = harness(
    { fallback: '1' },
    async (url, options) => {
      calls.push(url.includes('yandex') ? 'Yandex' : 'Google');
      if (url.includes('yandex')) return ok({ code: 200, text: ['Merhaba'] });
      return new Promise((resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }),
      );
    },
    'en',
    {},
    { setTimeout: (fn, ms) => setTimeout(fn, ms === 25000 ? 100 : ms) },
  );
  h.page
    .items()
    .find((row) => row.id === 'test')
    .onClick();
  await new Promise((resolve) => setTimeout(resolve, 240));
  assert.deepEqual(calls, ['Google', 'Yandex']);
  const rows = h.page.items();
  assert.ok(rows.some((row) => /^Google:/.test(row.text)));
  assert.ok(rows.some((row) => /^Yandex: Connection successful/m.test(row.text)));
  assert.equal(rows.find((row) => row.id === 'test').text, 'Test connection');
});

test('closing settings aborts the running connection test and skips remaining services', async () => {
  const calls = [];
  let started, signal;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  const h = harness({ fallback: '1' }, async (url, options) => {
    calls.push(url);
    signal = options.signal;
    started();
    return new Promise((resolve, reject) =>
      signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }),
    );
  });
  h.page
    .items()
    .find((row) => row.id === 'test')
    .onClick();
  await began;
  h.page.onClose();
  const refreshes = h.page.invalidations;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(signal.aborted, true);
  assert.equal(calls.length, 1);
  assert.equal(h.page.invalidations, refreshes);
  assert.ok(h.page.items().every((row) => !/^(Google|Yandex):/.test(row.text)));
});

test('language flags use rounded local images in both the selected value and popup', async () => {
  const runtime = dragRuntime(true, false, true),
    h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const root = h.page.items().find((row) => row.native).native;
  assert.equal(root.children[0].values.setText, 'Language');
  assert.deepEqual(
    root.children[1].calls.find((call) => call[0] === 'setTextSize'),
    ['setTextSize', 0, 16],
  );
  const english = root.children[1].values.setText;
  assert.equal(english.args[0], '\uFFFC  English');
  const drawable = english.values.setSpan.args[0],
    bitmap = drawable.args[1];
  assert.equal(bitmap.width, 24);
  assert.equal(bitmap.height, 16);
  assert.deepEqual(bitmap.canvas.values.clipPath.calls[0].slice(0, 7), [
    'addRoundRect',
    0,
    0,
    24,
    16,
    3,
    3,
  ]);
  runtime.click(root);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  const menu = runtime.menus[0];
  assert.equal(menu.items.length, 2);
  assert.equal(menu.show, true);
  assert.equal(menu.drawScrim, false);
  assert.equal(menu.items[0][0], english);
  assert.equal(menu.items[1][0].args[0], '\uFFFC  Türkçe');
  runtime.onUiThread(() => menu.items[1][1]());
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  runtime.flush();
  assert.equal(h.storage.get('multi-translate.language'), 'tr');
  assert.equal(h.page.items().find((row) => row.native).native, root);
  assert.equal(root.children[0].values.setText, 'Dil');
  assert.equal(root.children[1].values.setText, menu.items[1][0]);
  h.page.onClose();
  runtime.flush();
  assert.equal(root.values.setOnClickListener, null);
  assert.equal(menu.dismiss, true);
});

test('plain language names remain available without native flag rendering', () => {
  const h = harness();
  assert.deepEqual(Array.from(h.page.items().find((row) => row.id === 'language').items), [
    'English',
    'Türkçe',
  ]);
});

test('closing settings discards a queued language selection', async () => {
  const runtime = dragRuntime(true, false, true),
    h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const root = h.page.items().find((row) => row.native).native;
  runtime.click(root);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  runtime.onUiThread(() => runtime.menus[0].items[1][1]());
  h.page.onClose();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(h.storage.has('multi-translate.language'), false);
});

test('language popup anchors the outer settings row so Inugram clips its actual section corners', async () => {
  const runtime = dragRuntime(true, false, true, true),
    h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const root = h.page.items().find((row) => row.native).native;
  runtime.click(root);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  const menu = runtime.menus[0];
  assert.equal(menu.anchor, root.parent);
  assert.equal(menu.anchor.outerRow, true);
  assert.equal(menu.drawScrim, undefined);
  assert.equal(root.values.setClipToOutline, false);
  h.page.onClose();
  runtime.flush();
  assert.equal(menu.dismiss, true);
});

test('enabling restores the saved provider without Use buttons and provider labels remain inert', async () => {
  const runtime = dragRuntime();
  const originalClass = runtime.native.jvm.cls;
  let selected = '';
  const install = 'a123456789abcdef0123456789abcdef';
  const config = {
    call(method, value) {
      if (method === 'getValue') return selected;
      if (method === 'setValue') {
        selected = value;
        return;
      }
      throw Error(method);
    },
  };
  const metadata = {
    call() {
      return JSON.stringify([
        { id: install, pluginId: 'io.inugram.community.chatlate', enabled: true },
      ]);
    },
  };
  runtime.native.jvm.cls = (name) =>
    name === 'desu.inugram.InuConfig'
      ? { getStaticField: (field) => (field === 'TRANSLATION_PROVIDER' ? config : metadata) }
      : originalClass(name);
  const h = harness(
    { 'settings-version': '7', provider: 'yandex-free', fallback: '["yandex-free","google-free"]' },
    undefined,
    'en',
    runtime.native,
  );
  assert.equal(selected, install + ':multi.yandex-free');
  const { page, root } = await nativeOrderPage(h, runtime);
  runtime.click(root.children[0].children[1]);
  assert.equal(selected, install + ':multi.yandex-free');
  assert.equal(
    page.items().find((row) => row.id === 'activate'),
    undefined,
  );
  page.onClose();
  runtime.flush();
  assert.equal(selected, install + ':multi.yandex-free');
});

test('disable returns to Telegram after metadata changes and re-enable restores saved order', () => {
  const install = 'a123456789abcdef0123456789abcdef';
  let value = '',
    enabled = true;
  let unloaders = [];
  const config = {
    call(method, arg) {
      if (method === 'getValue') return value;
      if (method === 'setValue') {
        value = arg;
        return;
      }
      throw Error(method);
    },
  };
  const metadata = {
    call() {
      return JSON.stringify([{ id: install, pluginId: 'io.inugram.community.chatlate', enabled }]);
    },
  };
  const native = {
    onUnload(fn) {
      unloaders.push(fn);
    },
    jvm: {
      cls(name) {
        if (name !== 'desu.inugram.InuConfig') throw Error(name);
        return {
          getStaticField: (field) => (field === 'TRANSLATION_PROVIDER' ? config : metadata),
        };
      },
    },
  };
  const h = harness(
    { provider: 'yandex-free', fallback: '["yandex-free","google-free"]' },
    undefined,
    'en',
    native,
  );
  assert.equal(value, install + ':multi.yandex-free');
  enabled = false;
  unloaders.forEach((fn) => fn());
  assert.equal(value, '');
  assert.equal(h.storage.get('multi-translate.provider'), 'yandex-free');
  assert.equal(h.storage.get('multi-translate.fallback'), '["yandex-free","google-free"]');
  enabled = true;
  unloaders = [];
  const saved = Object.fromEntries(
    [...h.storage].map(([k, v]) => [k.replace('multi-translate.', ''), v]),
  );
  harness(saved, undefined, 'en', native);
  assert.equal(value, install + ':multi.yandex-free');
  value = install + ':multi.google-free';
  unloaders.forEach((fn) => fn());
  assert.equal(value, '');
});

test('unload leaves externally selected providers alone and safely handles failed writes', () => {
  for (const external of ['', 'another-plugin:provider']) {
    let value = 'own-install:multi.google-free',
      unloaders = [];
    const config = {
      call(method, arg) {
        if (method === 'getValue') return value;
        if (method === 'setValue') {
          value = arg;
          return;
        }
        throw Error(method);
      },
    };
    const native = {
      onUnload(fn) {
        unloaders.push(fn);
      },
      jvm: {
        cls(name) {
          if (name !== 'desu.inugram.InuConfig') throw Error(name);
          return {
            getStaticField: (field) => {
              if (field !== 'TRANSLATION_PROVIDER') throw Error(field);
              return config;
            },
          };
        },
      },
    };
    harness({}, undefined, 'en', native);
    value = external;
    unloaders.forEach((fn) => fn());
    assert.equal(value, external);
  }
  const failedUnloaders = [];
  let rejectWrites = false;
  const config = {
    call(method, arg) {
      if (method === 'getValue') return 'own-install:multi.google-free';
      if (method === 'setValue') {
        if (rejectWrites) throw Error('Write failed');
        return;
      }
      throw Error(method);
    },
  };
  harness({}, undefined, 'en', {
    onUnload(fn) {
      failedUnloaders.push(fn);
    },
    jvm: {
      cls() {
        return {
          getStaticField: (field) => {
            if (field !== 'TRANSLATION_PROVIDER') throw Error(field);
            return config;
          },
        };
      },
    },
  });
  rejectWrites = true;
  assert.doesNotThrow(() => failedUnloaders.forEach((fn) => fn()));
  const unloaders = [];
  harness({}, undefined, 'en', {
    onUnload(fn) {
      unloaders.push(fn);
    },
    jvm: {
      cls() {
        throw Error('Native access unavailable');
      },
    },
  });
  assert.doesNotThrow(() => unloaders.forEach((fn) => fn()));
});

test('selected description survives hook disposal without changing another plugin or its source', () => {
  const own = 'io.inugram.community.chatlate',
    unloaders = [],
    hooks = new Map();
  let constructions = 0;
  function Manifest(
    name,
    author,
    id,
    version,
    description,
    localized,
    icon,
    grants,
    api,
    platform,
    raw,
  ) {
    constructions++;
    const values = {
      Name: name,
      Author: author,
      DeclaredId: id,
      Id: id,
      Version: version,
      Description: description,
      LocalizedDescriptions: localized,
      Icon: icon,
      Grants: grants,
      PluginApi: api,
      Platform: platform,
      Raw: raw,
    };
    return {
      call(method, ...args) {
        if (method === 'description') return localized.values.get(args[0]) || description;
        if (method.startsWith('get')) return values[method.slice(3)];
        throw Error(method);
      },
    };
  }
  Manifest.getDeclaredMethod = (method) => method;
  function JavaMap() {
    this.values = new Map();
    this.call = (method, ...args) => {
      assert.equal(method, 'put');
      this.values.set(...args);
    };
  }
  const makeManifest = (id) =>
    new Manifest(
      'Chatlate',
      '@real4265726B',
      id,
      '1.8.31',
      'Original',
      new JavaMap(),
      'sticker',
      ['unsafe.jvm'],
      1,
      null,
      { original: true },
    );
  const ownPlugin = {
    manifest: makeManifest(own),
    source: 'untouched',
    call(method) {
      assert.equal(method, 'getManifest');
      return this.manifest;
    },
    setField(field, value) {
      assert.equal(field, 'manifest');
      this.manifest = value;
    },
  };
  const other = { ...ownPlugin, manifest: makeManifest('another.plugin') },
    otherManifest = other.manifest;
  const plugins = {
    call(method, index) {
      if (method === 'size') return 2;
      if (method === 'get') return [other, ownPlugin][index];
      throw Error(method);
    },
  };
  const native = {
    onUnload(fn) {
      unloaders.push(fn);
    },
    xposed: {
      hookMethod(method, hook) {
        hooks.set(method, hook);
        return () => hooks.delete(method);
      },
    },
    jvm: {
      cls(name) {
        if (name.endsWith('PluginManager'))
          return { getStaticField: () => ({ call: () => plugins }) };
        if (name.endsWith('PluginManifest')) return Manifest;
        if (name === 'java.util.LinkedHashMap') return JavaMap;
        throw Error(name);
      },
    },
  };
  const h = harness({ language: 'tr' }, undefined, 'en', native);
  assert.match(ownPlugin.manifest.call('getDescription'), /Biçimlendirmeyi/);
  assert.match(ownPlugin.manifest.call('description', 'en'), /Biçimlendirmeyi/);
  const before = constructions;
  h.page.items();
  h.page.items();
  assert.equal(constructions, before);
  h.page
    .items()
    .find((row) => row.id === 'language')
    .onChange(0);
  assert.equal(
    ownPlugin.manifest.call('getDescription'),
    'Chat translation with formatting preserved.',
  );
  h.page
    .items()
    .find((row) => row.id === 'language')
    .onChange(1);
  unloaders.forEach((fn) => fn());
  assert.equal(hooks.size, 0);
  assert.match(ownPlugin.manifest.call('getDescription'), /Biçimlendirmeyi/);
  assert.match(ownPlugin.manifest.call('description', 'tr'), /Biçimlendirmeyi/);
  assert.equal(other.manifest, otherManifest);
  assert.equal(ownPlugin.source, 'untouched');
  assert.deepEqual(ownPlugin.manifest.call('getRaw'), { original: true });
});

test('closing settings discards pending cooldown cells and allows a clean reopen', async () => {
  const runtime = dragRuntime(),
    h = harness(
      { 'google-free.blockedUntil': String(Date.now() + 120000) },
      undefined,
      'en',
      runtime.native,
    );
  h.page.items();
  assert.ok(runtime.queue.length >= 1);
  h.page.onClose();
  const before = h.page.invalidations;
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(h.page.invalidations, before);
  h.page.items();
  assert.ok(runtime.queue.length >= 1);
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const status = h.page.items().find((row) => row.native)?.native;
  assert.match(status.values.setText, /rate limit/);
  h.page.onClose();
  runtime.flush();
});
