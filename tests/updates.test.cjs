const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const { buildSync } = require('esbuild');
const fixture = buildSync({
  stdin: {
    contents:
      "export { createUpdates } from './src/updates/index.js'; export { isNewer } from './src/updates/version.js'; export { githubReleaseUrl } from './src/updates/release-link.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Updates',
}).outputFiles[0].text;

function harness(source = null, version = '', language = 'en') {
  if (source) source = { changelog: async () => [latest()], ...source };
  let opened,
    invalidations = 0,
    celebrations = 0;
  const storage = new Map([['chatlate.update.pendingVersion', version]]);
  const timers = new Map(),
    native = [],
    toasts = [],
    urls = [];
  let nextTimer = 0;
  const context = {
    inu: {
      info: () => ({ language }),
      openUrl: (url) => urls.push(url),
      utils: { md: (text) => ({ text, entities: [] }) },
      ui: {
        settingsPage: (p) => ({
          ...p,
          invalidations: 0,
          invalidate() {
            this.invalidations++;
          },
          dispose() {},
        }),
        button: (p) => p,
        header: (text) => ({ header: text }),
        separator: (text) => ({ text }),
        openPage: (page) => {
          opened = page;
        },
        toast: (text) => toasts.push(text),
      },
      android: {
        getCurrentFragment: () => ({
          call: () => ({ call: () => ({ call: () => celebrations++ }) }),
        }),
      },
      jvm: { runnable: (fn) => fn, cls: () => ({ callStatic: (_, fn) => native.push(fn) }) },
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    AbortController,
    setTimeout: (fn) => {
      const id = ++nextTimer;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  vm.runInNewContext(fixture, context);
  return {
    api: context.Updates,
    controller: context.Updates.createUpdates(() => invalidations++, source),
    storage,
    toasts,
    urls,
    timers,
    get opened() {
      return opened;
    },
    get invalidations() {
      return invalidations;
    },
    get celebrations() {
      return celebrations;
    },
    flushNative() {
      while (native.length) native.shift()();
    },
  };
}
const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
const latest = () => ({
  version: '1.0.1',
  notes: { en: '**Added**\n- An improvement', tr: '**Eklendi**\n- Bir iyileştirme' },
});
const row = (page, id) => page.items().find((item) => item.id === id);
const notes = (page) => page.items().find((item) => typeof item.text === 'object');

test('unconfigured updates show no banner, start no requests or demo timers', () => {
  const h = harness();
  h.controller.checkOnce();
  assert.equal(h.controller.available(), false);
  assert.equal(h.controller.banner().available, false);
  assert.equal(h.timers.size, 0);
  h.controller.banner().onClick();
  assert.equal(h.opened, undefined);
});

test('only newer stable releases appear; numeric comparison handles multi-digit versions', async () => {
  const h = harness();
  assert.equal(h.api.isNewer('1.10.0', '1.9.9'), true);
  for (const candidate of [
    '1.0.0',
    '0.9.9',
    '1.0.1-beta',
    '1.0',
    '01.0.1',
    '999999999999999999999.0.0',
  ]) {
    assert.equal(h.api.isNewer(candidate, '1.0.0'), false);
  }
  for (const version of ['1.0.0', '0.9.9', 'garbage']) {
    const h = harness({ check: async () => ({ version }), install: async () => {} });
    h.controller.checkOnce();
    await settle();
    assert.equal(h.controller.available(), false);
  }
});

test('verified release loads current release notes in a localized UI and installs only after a tap', async () => {
  let checks = 0,
    installs = 0;
  const h = harness(
    {
      check: async () => {
        checks++;
        return latest();
      },
      install: async () => {
        installs++;
      },
    },
    '',
    'tr',
  );
  h.controller.checkOnce();
  h.controller.checkOnce();
  await settle();
  assert.equal(checks, 1);
  assert.equal(installs, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.controller.banner().text, '↑  Güncelleme mevcut · 1.0.1');
  h.controller.banner().onClick();
  assert.equal(h.opened.title, 'Güncellemeler');
  await settle();
  const card = notes(h.opened);
  assert.equal(card.onClick, undefined);
  assert.equal(card.text.text, latest().notes.en);
  assert.equal(
    h.opened.items().some((item) => item.id === 'release.scenario'),
    false,
  );
  row(h.opened, 'release.update').onClick();
  row(h.opened, 'release.update').onClick();
  await settle();
  assert.equal(installs, 1);
  assert.equal(h.celebrations, 0);
  assert.equal(h.storage.get('chatlate.update.pendingVersion'), '1.0.1');
});

test('completion is confirmed by the successor version, once, and skips closed settings', () => {
  const h = harness(null, '1.0.0');
  h.controller.checkOnce();
  h.controller.checkOnce();
  h.flushNative();
  assert.equal(h.celebrations, 1);
  assert.equal(h.toasts.length, 1);
  assert.equal(h.storage.get('chatlate.update.pendingVersion'), '');
  const stale = harness(null, '1.0.1');
  stale.controller.checkOnce();
  stale.flushNative();
  assert.equal(stale.celebrations, 0);
  const closed = harness(null, '1.0.0');
  closed.controller.checkOnce();
  closed.controller.reset();
  closed.flushNative();
  assert.equal(closed.celebrations, 0);
});

test('closing aborts the install and ignores late checks; failures clear pending completion', async () => {
  let resolveCheck, signal;
  const h = harness({
    check: (abort) => {
      signal = abort;
      return new Promise((resolve) => {
        resolveCheck = resolve;
      });
    },
    install: async () => {},
  });
  h.controller.checkOnce();
  h.controller.reset();
  assert.equal(signal.aborted, true);
  resolveCheck(latest());
  await settle();
  assert.equal(h.controller.available(), false);
  assert.equal(h.invalidations, 0);
  const failing = harness({
    check: async () => latest(),
    install: async () => {
      throw Error('No install');
    },
  });
  failing.controller.checkOnce();
  await settle();
  failing.controller.banner().onClick();
  row(failing.opened, 'release.update').onClick();
  await settle();
  assert.equal(failing.storage.get('chatlate.update.pendingVersion'), '');
  assert.equal(failing.toasts.length, 1);
  let installSignal;
  const closing = harness({
    check: async () => latest(),
    install: async (_, signal) => {
      installSignal = signal;
    },
  });
  closing.controller.checkOnce();
  await settle();
  closing.controller.banner().onClick();
  row(closing.opened, 'release.update').onClick();
  closing.opened.onClose();
  assert.equal(installSignal.aborted, true);
});

test('history and selected notes are fetched on every opening, with no embedded offline archive', async () => {
  let content = '**Translation**\n- First text',
    reads = 0;
  const source = {
    check: async () => null,
    install: async () => {},
    changelog: async () => {
      reads++;
      return [{ version: '1.0.0', notes: { en: content } }];
    },
  };
  const h = harness(source, '', 'tr');
  assert.equal(reads, 0);
  const item = h.controller.historyItem();
  assert.equal(item.text, 'Sürüm geçmişi');
  item.onClick();
  const history = h.opened;
  assert.equal(history.items()[0].text, 'Sürüm notları yükleniyor…');
  await settle();
  const entry = history.items()[0];
  assert.equal(entry.id, 'release.history.1.0.0');
  assert.equal(entry.value, 'Yüklü');
  content = '**Translation**\n- Corrected text';
  entry.onClick();
  await settle();
  assert.equal(h.opened.title, 'Chatlate 1.0.0');
  assert.equal(notes(h.opened).text.text, content);
  assert.equal(reads, 2);
  assert.equal(row(h.opened, 'release.update'), undefined);
  h.opened.onClose();
  content = '**Translation**\n- Another correction';
  entry.onClick();
  await settle();
  assert.equal(notes(h.opened).text.text, content);
  assert.equal(reads, 3);
  h.controller.reset();
  assert.equal(h.timers.size, 0);
  const previous = h.opened;
  entry.onClick();
  assert.equal(h.opened, previous);
});

test('history failures expose Retry and never replace missing online data with bundled notes', async () => {
  let fail = true;
  const h = harness({
    check: async () => null,
    install: async () => {},
    changelog: async () => {
      if (fail) throw Error('offline');
      return [{ version: '1.0.0', notes: { en: '**Translation**\n- Current notes' } }];
    },
  });
  h.controller.historyItem().onClick();
  await settle();
  assert.match(h.opened.items()[0].text, /Could not load/);
  assert.equal(notes(h.opened), undefined);
  assert.equal(
    h.opened.items().some((item) => item.id === 'release.history.1.0.0'),
    false,
  );
  fail = false;
  row(h.opened, 'release.notes.retry').onClick();
  await settle();
  assert.equal(h.opened.items()[0].id, 'release.history.1.0.0');
  h.controller.reset();
  assert.equal(h.timers.size, 0);
});

test('update notes ignore metadata text, retry fresh data and never display stale fallback notes', async () => {
  let fail = true;
  const h = harness({
    check: async () => latest(),
    install: async () => {},
    changelog: async () => {
      if (fail) throw Error('offline');
      return [{ version: '1.0.1', notes: { en: '**Settings**\n- Fresh canonical text' } }];
    },
  });
  h.controller.checkOnce();
  await settle();
  h.controller.banner().onClick();
  await settle();
  assert.equal(notes(h.opened), undefined);
  assert.match(
    h.opened
      .items()
      .find((item) => typeof item.text === 'string' && item.text.includes('Could not load')).text,
    /connection/,
  );
  fail = false;
  row(h.opened, 'release.notes.retry').onClick();
  await settle();
  assert.equal(notes(h.opened).text.text, '**Settings**\n- Fresh canonical text');
  h.controller.reset();
});

test('closing or unloading notes aborts the request and ignores late responses', async () => {
  for (const reset of [false, true]) {
    let signal, resolve;
    const h = harness({
      check: async () => null,
      install: async () => {},
      changelog: (abort) => {
        signal = abort;
        return new Promise((done) => {
          resolve = done;
        });
      },
    });
    h.controller.historyItem().onClick();
    const page = h.opened;
    const count = page.invalidations;
    if (reset) h.controller.reset();
    else page.onClose();
    assert.equal(signal.aborted, true);
    assert.equal(h.timers.size, 0);
    resolve([{ version: '1.0.0', notes: { en: 'Late notes' } }]);
    await settle();
    assert.equal(page.invalidations, count);
    assert.equal(notes(page), undefined);
  }
});

test('GitHub release action is above Update and opens only the selected release URL', async () => {
  const url = 'https://github.com/berkmirsatk/Chatlate/releases/tag/v1.0.1';
  const h = harness({ check: async () => ({ ...latest(), url }), install: async () => {} });
  h.controller.checkOnce();
  await settle();
  h.controller.banner().onClick();
  const page = h.opened,
    items = page.items();
  assert.ok(
    items.findIndex((item) => item.id === 'release.github') <
      items.findIndex((item) => item.id === 'release.update'),
  );
  const link = row(page, 'release.github');
  assert.equal(link.subtitle, undefined);
  assert.deepEqual(h.urls, []);
  link.onClick();
  assert.deepEqual(h.urls, [url]);
  page.onClose();
  link.onClick();
  assert.equal(h.urls.length, 1);
  for (const invalid of [
    undefined,
    'http://github.com/a/b/releases/tag/v1.0.1',
    'https://github.com.evil.test/a/b/releases/tag/v1.0.1',
    'https://github.com/a/b/releases/tag/v1.0.2',
    'javascript:alert(1)',
    'https://github.com/a/b/releases/tag/v1.0.1?redirect=evil',
  ]) {
    assert.equal(h.api.githubReleaseUrl({ ...latest(), url: invalid }), undefined);
  }
});

test('missing GitHub release links show a localized message without opening another destination', async () => {
  const h = harness({ check: async () => latest(), install: async () => {} }, '', 'tr');
  h.controller.checkOnce();
  await settle();
  h.controller.banner().onClick();
  const link = row(h.opened, 'release.github');
  assert.equal(link.text, 'GitHub’da sürümü görüntüle');
  assert.equal(link.subtitle, 'Sürüm bağlantısı mevcut değil');
  link.onClick();
  assert.equal(h.urls.length, 0);
  assert.equal(h.toasts.at(-1), 'Sürüm bağlantısı mevcut değil');
});
