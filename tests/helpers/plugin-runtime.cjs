const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { bundledAssets } = require('./bundled-assets.cjs');
const code = fs.readFileSync(process.env.PLUGIN_FILE || 'dist/chatlate.inu.js', 'utf8');
function harness(
  values = {},
  handler = () => {
    throw Error('Unexpected network');
  },
  appLanguage = 'en',
  native = {},
  timers = {},
) {
  const registered = new Map(),
    storage = new Map(Object.entries(values).map(([k, v]) => ['chatlate.' + k, v]));
  let page, opened;
  const ui = {
    ...native.ui,
    toast() {},
    settingsPage(p) {
      const result = {
        ...p,
        invalidations: 0,
        dispose() {
          this.disposed = true;
        },
        invalidate() {
          this.invalidations++;
        },
      };
      if (!p.transient) page = result;
      return result;
    },
    openPage(p) {
      opened = p;
    },
    header: (text) => ({ header: text }),
    separator: (text) => ({ text }),
    select: (x) => x,
    button: (x) => x,
  };
  vm.runInNewContext(code, {
    inu: {
      assets: bundledAssets(code),
      ...native,
      ui,
      info: () => ({ language: appLanguage }),
      registerTranslationProvider: (p) => registered.set(p.id, p),
      registerSettings() {},
    },
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
      get length() {
        return storage.size;
      },
      key: (i) => [...storage.keys()][i] ?? null,
      removeItem: (k) => storage.delete(k),
    },
    // Translation fixtures see the distribution repository as unpublished.
    fetch: (url, options) =>
      url.startsWith('https://api.github.com/')
        ? Promise.resolve({ status: 404, ok: false })
        : handler(url, options),
    structuredClone,
    AbortController,
    setTimeout: timers.setTimeout || setTimeout,
    clearTimeout,
  });
  return {
    registered,
    page,
    get opened() {
      return opened;
    },
    ui,
    storage,
    setAppLanguage: (language) => {
      appLanguage = language;
    },
  };
}
const summaryValue = (h) =>
  h.page
    .items()
    .find((row) => row.id === 'provider')
    .value.replace(/  [▴▾]$/, '');
const openOrder = (h) => {
  const row = h.page.items().find((row) => row.id === 'provider');
  if (row?.value.endsWith('▾')) row.onClick();
  return h.page;
};
const orderAction = (h, label) => {
  const rows = openOrder(h).items();
  let selected;
  for (const row of rows.filter(
    (row) => row.id?.startsWith('order.') || row.id?.startsWith('add.'),
  )) {
    if (row.text === label) selected ||= row;
    // Add rows act directly; only order rows open a menu of actions.
    else if (row.id.startsWith('order.'))
      row.onClick({
        openMenu: (items) => {
          selected ||= items.find((item) => item.text === label);
        },
      });
  }
  assert.ok(selected, label);
  selected.onClick();
};
const chooseProvider = (h, index) => {
  const name = ['Google', 'Yandex', 'Microsoft'][index];
  const rows = openOrder(h)
    .items()
    .filter((row) => row.id?.startsWith('order.'));
  const single = rows.length === 1;
  if (rows[0]?.text === '1. ' + name) return;
  if (!rows.some((row) => row.text.endsWith(name))) orderAction(h, 'Add: ' + name);
  orderAction(h, 'Move up: ' + name);
  if (single && summaryValue(h).startsWith('1. ' + name))
    orderAction(h, 'Remove: ' + ['Yandex', 'Google'][index]);
};
async function waitUntil(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'Operation did not finish');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
const ok = (data) => ({ ok: true, json: async () => data });
/** Google receives each source text as an HTML-escaped `q` form field. */
const googleTexts = (options) =>
  new URLSearchParams(options?.body ?? '')
    .getAll('q')
    .map((q) => q.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'));
const googleText = (options) => googleTexts(options)[0];
/** Google's reply: one [translation, detected language] pair per text. */
const googleReply = (translations) => ok(translations.map((text) => [text, 'en']));
const run = (h, texts, signal = new AbortController().signal) =>
  h.registered
    .get('chatlate.google')
    .translate({ texts, to: 'tr', from: texts.map(() => 'en'), signal });
function replyWith(translations, inspect = () => {}) {
  return async (url, options) => {
    const texts = googleTexts(options);
    inspect(url, options, texts.join('\n'));
    assert.equal(texts.length, translations.length);
    return googleReply(translations);
  };
}

const runWith = (h, id, texts, to = 'tr', signal = new AbortController().signal) =>
  h.registered.get('chatlate.' + id).translate({ texts, to, from: texts.map(() => 'en'), signal });

module.exports = {
  googleText,
  googleTexts,
  googleReply,
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
};
