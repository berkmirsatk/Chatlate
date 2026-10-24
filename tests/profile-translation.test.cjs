const assert = require('node:assert/strict');
const { test } = require('node:test');
const { googleReply, googleTexts, harness } = require('./helpers/plugin-runtime.cjs');

function profileRuntime(selected = 'installation:chatlate.google') {
  const hooks = new Map(),
    changed = [];
  const config = {
    call(method, arg) {
      if (method === 'getValue') return selected;
      if (method === 'setValue') selected = arg;
    },
  };
  const adapter = { call: (method, row) => changed.push([method, row]) };
  const profile = {
    getField: (name) =>
      ({ listAdapter: adapter, channelInfoRow: 5, userInfoRow: -1, bioRow: -1 })[name],
  };
  const native = {
    onUnload() {},
    xposed: {
      hookMethod: (method, hook) => (hooks.set(method.split('(')[0], hook), () => {}),
    },
    jvm: {
      runnable: (fn) => fn,
      routine: (spec) => spec,
      defineClass: (spec) => class {},
      cls: () => ({
        getStaticField: (field) => {
          if (field === 'TRANSLATION_PROVIDER') return config;
          throw Error(field);
        },
        getDeclaredMethod: (descriptor) => descriptor,
        getDeclaredConstructor: () => ({ newInstance: () => ({}) }),
        callStatic(method, ...args) {
          if (method === 'runOnUIThread') return args[0]();
          if (method === 'identityHashCode') return args[0] === profile ? 7 : 8;
          throw Error(method);
        },
      }),
    },
  };
  const tapTranslate = (text) => {
    let skipped = false;
    hooks.get('showAlert').before({
      args: ['context', profile, 0, 'en', 'tr', text, null, false, null, null],
      setReturnValue: () => (skipped = true),
    });
    return skipped;
  };
  const bind = (text) => {
    const ctx = { args: [text, 'Description', true] };
    hooks.get('setTextAndValue').before(ctx);
    return ctx.args[0];
  };
  return {
    native,
    changed,
    tapTranslate,
    bind,
    close: () => hooks.get('onFragmentDestroy').before({ thisObject: profile }),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

test('a description translates in place, keeps its links and shows the original again', async () => {
  const sent = [];
  const runtime = profileRuntime();
  harness(
    {},
    async (_url, options) => {
      const texts = googleTexts(options);
      sent.push(...texts);
      return googleReply(texts.map((text) => (text.trim() === 'News from' ? 'Haberler:' : text)));
    },
    'en',
    runtime.native,
  );
  const about = 'News from @chatlate\n\n\n\nhttps://t.me/Plumgins';
  assert.equal(runtime.tapTranslate(about), true);
  await settle();
  // Links and usernames are never sent for translation.
  assert.ok(sent.every((text) => !text.includes('@chatlate') && !text.includes('t.me')));
  assert.deepEqual(runtime.changed, [['notifyItemChanged', 5]]);
  // Telegram collapses blank lines before showing the text.
  const translated = runtime.bind('News from @chatlate\n\nhttps://t.me/Plumgins');
  assert.equal(translated, 'Haberler: @chatlate\n\nhttps://t.me/Plumgins');
  assert.equal(runtime.tapTranslate(about), true);
  await settle();
  assert.equal(
    runtime.bind('News from @chatlate\n\nhttps://t.me/Plumgins').startsWith('News'),
    true,
  );
});

test('closing the profile forgets its translation', async () => {
  const runtime = profileRuntime();
  harness(
    {},
    async (_url, options) => googleReply(googleTexts(options).map(() => 'Merhaba')),
    'en',
    runtime.native,
  );
  runtime.tapTranslate('Hello');
  await settle();
  assert.equal(runtime.bind('Hello'), 'Merhaba');
  runtime.close();
  assert.equal(runtime.bind('Hello'), 'Hello');
});

test("Telegram's popup stays when another translation service is selected", () => {
  const runtime = profileRuntime('');
  harness({}, undefined, 'en', runtime.native);
  assert.equal(runtime.tapTranslate('Hello'), false);
});
