const assert = require('node:assert/strict');
const { test, before } = require('node:test');
const vm = require('node:vm');
const { build } = require('esbuild');
const { waitUntil } = require('./helpers/plugin-runtime.cjs');
let code;
before(async () => {
  code = (
    await build({
      stdin: {
        contents: "export { registerDraftTranslation } from './src/draft-translation.js';",
        resolveDir: process.cwd(),
      },
      plugins: [
        {
          name: 'native-language-picker',
          setup(build) {
            build.onLoad({ filter: /draft-send-menu\.js$/ }, () => ({
              contents: `export function registerDraftSendMenu(handlers) { inu.draftMenu = handlers; return { refresh() {} }; }`,
              loader: 'js',
            }));
            build.onLoad({ filter: /draft-language-picker\.js$/ }, () => ({
              contents: `export function createDraftLanguagePicker() { return { choose: async (options) => { const index = await inu.ui.chooser({}); return index === null ? null : options[index].code; }, dispose() {} }; }`,
              loader: 'js',
            }));
          },
        },
      ],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'Draft',
    })
  ).outputFiles[0].text;
});

function runtime(handler = async (texts) => texts.map((text) => text.replace('Hello', 'Merhaba'))) {
  const actions = new Map(),
    notices = [],
    storage = new Map();
  const ctx = { account: { id: 0 }, dialogId: -1001 };
  let destroy,
    unload,
    chosen = 0,
    chooseCount = 0,
    requests = 0,
    signal;
  class Text {
    constructor(value) {
      this.text = typeof value === 'string' ? value : value.text;
      this.entities = structuredClone(value.entities ?? []);
    }
    call(method) {
      assert.equal(method, 'toString');
      return this.text;
    }
  }
  let draft = new Text('Hello');
  const edit = { call: (method) => (method === 'getPaint' ? { call: () => null } : undefined) };
  const composer = {
    call(method, value) {
      if (method === 'getFieldText') return draft;
      if (method === 'getEditField') return edit;
      if (method === 'setFieldText') draft = new Text(value);
    },
  };
  const chat = {
    call: (method) => ({ getCurrentAccount: 0, getDialogId: -1001, getClassGuid: 7 })[method],
    getField: (field) => (field === 'chatActivityEnterView' ? composer : null),
  };
  let active = chat;
  const native = {
    android: { getCurrentFragment: () => active },
    registerChatAction: (action) => (
      actions.set(action.id, action),
      () => actions.delete(action.id)
    ),
    onUnload: (fn) => (unload = fn),
    info: () => ({ language: 'en' }),
    ui: {
      toast: (text) => notices.push(text),
      chooser: async () => {
        chooseCount++;
        return chosen;
      },
    },
    xposed: {
      hookMethod: (method, hook) => {
        if (method === 'onFragmentDestroy') destroy = hook.before;
        return () => {};
      },
    },
    jvm: {
      runnable: (fn) => fn,
      toTl: (object) => object.fields,
      fromTl: (object) => ({ getField: (key) => object[key] }),
      cls(name) {
        if (name.startsWith('desu.inugram.helpers.plugins'))
          throw Error('engine internals forbidden');
        if (name === 'android.text.SpannableStringBuilder') return Text;
        if (name.endsWith('$TL_textWithEntities'))
          return class {
            fields = {};
            setField(key, value) {
              this.fields[key] = value;
            }
          };
        if (name === 'java.util.ArrayList') return class extends Array {};
        if (name === 'java.lang.CharSequence') return {};
        if (name.endsWith('ProfileActivity')) throw Error(name);
        return {
          getDeclaredMethod: (method) => method,
          getStaticField: () => ({
            call: (_method, text, entities) => {
              const result = new Text(text);
              result.entities = JSON.parse(entities);
              return result;
            },
          }),
          callStatic(method, ...args) {
            if (method === 'addEntitiesToText') {
              args[0].entities = structuredClone(args[1]);
              return;
            }
            if (method === 'replaceAnimatedEmoji') return args[0];
            if (method === 'runOnUIThread') return args[0]();
            if (method === 'newInstance') return [];
            if (method === 'set') {
              args[0][args[1]] = args[2];
              return;
            }
            if (method === 'getInstance') return { call: (_method, input) => input[0].entities };
            if (method === 'getLanguages')
              return {
                call: (method, index) =>
                  method === 'size'
                    ? 2
                    : {
                        getField: (key) =>
                          ({
                            code: ['tr', 'en'][index],
                            displayName: ['Türkçe', 'English'][index],
                          })[key],
                      },
              };
            throw Error(method);
          },
        };
      },
    },
  };
  const sandbox = {
    inu: native,
    AbortController,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  vm.runInNewContext(code, sandbox);
  const provider = {
    id: 'google',
    name: 'Google',
    translateParts: async (texts, _to, abort) => {
      requests++;
      signal = abort;
      return handler(texts);
    },
  };
  sandbox.Draft.registerDraftTranslation([provider], { read: () => ({ index: 0 }) });
  return {
    actions,
    notices,
    storage,
    get draft() {
      return draft;
    },
    get requests() {
      return requests;
    },
    get signal() {
      return signal;
    },
    get choices() {
      return chooseCount;
    },
    set(text, entities = []) {
      draft = new Text(text);
      draft.entities = entities;
    },
    choose: (index) => (chosen = index),
    translate: () => native.draftMenu.translate(ctx),
    restore: () => native.draftMenu.restore(ctx),
    canRestore: () => native.draftMenu.canRestore(chat),
    close() {
      active = null;
      destroy({ thisObject: chat });
    },
    unload: () => unload(),
  };
}

test('draft translation preserves entities, previews in the composer and restores the original', async () => {
  const r = runtime();
  r.set('Hello @user', [
    { _: 'messageEntityBold', offset: 0, length: 5 },
    { _: 'messageEntityMention', offset: 6, length: 5 },
  ]);
  r.translate();
  await waitUntil(() => r.canRestore());
  assert.equal(r.draft.text, 'Merhaba @user');
  assert.equal(r.draft.entities[0].length, 7);
  assert.equal(r.draft.entities[1].offset, 8);
  r.restore();
  await waitUntil(() => !r.canRestore());
  assert.equal(r.draft.text, 'Hello @user');
  assert.equal(r.draft.entities[0].length, 5);
});

test('draft text edited while translation runs is never overwritten', async () => {
  let finish;
  const r = runtime(() => new Promise((resolve) => (finish = resolve)));
  r.translate();
  await waitUntil(() => finish);
  r.set('My newer draft');
  finish(['Merhaba']);
  await waitUntil(() => r.notices.some((text) => text.includes('draft changed')));
  assert.equal(r.draft.text, 'My newer draft');
  assert.equal(r.canRestore(), false);
});

test('changing only formatting also prevents stale draft replacement', async () => {
  let finish;
  const r = runtime(() => new Promise((resolve) => (finish = resolve)));
  r.translate();
  await waitUntil(() => finish);
  r.set('Hello', [{ _: 'messageEntityItalic', offset: 0, length: 5 }]);
  finish(['Merhaba']);
  await waitUntil(() => r.notices.some((text) => text.includes('draft changed')));
  assert.equal(r.draft.text, 'Hello');
  assert.equal(r.draft.entities[0]._, 'messageEntityItalic');
});

test('edited translations are not overwritten by restore', async () => {
  const r = runtime();
  r.translate();
  await waitUntil(() => r.canRestore());
  r.set('Edited translation');
  r.restore();
  await waitUntil(() => r.notices.some((text) => text.includes('draft changed')));
  assert.equal(r.draft.text, 'Edited translation');
});

test('closing the chat cancels translation and discards a late response', async () => {
  let finish;
  const r = runtime(() => new Promise((resolve) => (finish = resolve)));
  r.translate();
  await waitUntil(() => finish);
  r.close();
  await waitUntil(() => r.signal.aborted);
  finish(['Merhaba']);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(r.draft.text, 'Hello');
});

test('cancelling language selection sends no request', async () => {
  const r = runtime();
  r.choose(null);
  r.translate();
  await waitUntil(() => r.choices > 0);
  assert.equal(r.requests, 0);
  assert.equal(r.draft.text, 'Hello');
});

test('unloading cancels outstanding draft work', async () => {
  let finish;
  const r = runtime(() => new Promise((resolve) => (finish = resolve)));
  r.translate();
  await waitUntil(() => finish);
  r.unload();
  assert.equal(r.signal.aborted, true);
  finish(['Merhaba']);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(r.draft.text, 'Hello');
  assert.equal(r.actions.size, 0);
});

test('draft actions are available only through the send menu', () => {
  const r = runtime();
  assert.equal(r.actions.size, 0);
});

for (const failure of [false, true]) {
  test(`a ${failure ? 'failed' : 'cancelled'} second translation preserves the original draft`, async () => {
    let calls = 0;
    const r = runtime(async () => {
      if (++calls > 1) throw new Error('Unavailable');
      return ['Merhaba'];
    });
    r.translate();
    await waitUntil(() => r.canRestore());
    if (!failure) r.choose(null);
    r.translate();
    await waitUntil(() => r.choices === 2);
    if (failure) await waitUntil(() => r.notices.includes('Unavailable'));
    await waitUntil(() => r.canRestore());
    r.restore();
    await waitUntil(() => r.draft.text === 'Hello');
  });
}
