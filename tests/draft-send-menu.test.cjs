const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const code = buildSync({
  stdin: {
    contents: "export { registerDraftSendMenu } from './src/draft-send-menu.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Menu',
}).outputFiles[0].text;

function runtime(canRestore = false, text = 'Hello') {
  let hook, unload;
  const rows = [],
    events = [];
  const chat = {
    call: (method) => (method === 'getCurrentAccount' ? 2 : -1001),
    getField: () => null,
  };
  const composer = {
    getField: () => chat,
    call: () => text,
    setField: (name, value) => events.push([name, value]),
  };
  const preview = { call: (method, value) => events.push([method, value]) };
  const options = {
    call: (method, icon, title, callback) => {
      assert.equal(method, 'add');
      rows.push({ icon, title, callback });
    },
  };
  const context = {
    setTimeout,
    localStorage: { getItem: () => null },
    inu: {
      info: () => ({ language: 'en' }),
      onUnload: (fn) => (unload = fn),
      xposed: {
        hookMethod: (method, callbacks) => {
          assert.ok(method.startsWith('showSendPreview('));
          hook = callbacks.before;
          return () => events.push('detached');
        },
      },
      jvm: {
        runnable: (fn) => fn,
        cls: () => ({ getStaticField: () => 42, getDeclaredMethod: (name) => name }),
      },
    },
  };
  vm.runInNewContext(code, context);
  context.Menu.registerDraftSendMenu({
    translate: (ctx) => events.push(['translate', ctx.account.id, ctx.dialogId]),
    restore: () => events.push('restore'),
    canRestore: () => canRestore,
  });
  return {
    rows,
    events,
    show: () => hook({ args: [composer, options, preview] }),
    unload: () => unload(),
  };
}

test('send preview gains a draft action before it opens', () => {
  const r = runtime();
  r.show();
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].title, 'Translate draft');
});

test('draft action dismisses the send preview before opening translation', async () => {
  const r = runtime();
  r.show();
  r.rows[0].callback();
  assert.deepEqual(r.events, [
    ['dismiss', false],
    ['messageSendPreview', null],
  ]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(r.events[2], ['translate', 2, -1001]);
});

test('restoration is offered after a translated draft exists', async () => {
  const r = runtime(true);
  r.show();
  assert.equal(r.rows[1].title, 'Restore original draft');
  r.rows[1].callback();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(r.events.at(-1), 'restore');
});

test('voice-only send previews receive no draft actions', () => {
  const r = runtime(false, null);
  r.show();
  assert.equal(r.rows.length, 0);
});

test('unloading detaches the send hook and drops its pending context', () => {
  const r = runtime();
  r.show();
  r.unload();
  r.rows[0].callback();
  assert.deepEqual(r.events, ['detached']);
});
