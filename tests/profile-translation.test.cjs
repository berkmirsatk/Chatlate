const assert = require('node:assert/strict');
const { test } = require('node:test');
const { googleReply, googleTexts, harness, waitUntil } = require('./helpers/plugin-runtime.cjs');

function profileRuntime(selected = 'installation:chatlate.google') {
  const hooks = new Map(),
    changed = [],
    unloaders = [],
    ui = [];
  let nextGuid = 1,
    deferredUi = false;
  const config = {
    call(method, arg) {
      if (method === 'getValue') return selected;
      if (method === 'setValue') selected = arg;
    },
  };
  const adapter = { call: (method, row) => changed.push([method, row]) };
  const newProfile = () => {
    const guid = nextGuid++;
    return {
      call(method) {
        if (method === 'getClassGuid') return guid;
        throw Error(method);
      },
      getField: (name) =>
        ({ listAdapter: adapter, channelInfoRow: 5, userInfoRow: -1, bioRow: -1 })[name],
    };
  };
  const profile = newProfile();
  const native = {
    onUnload(callback) {
      unloaders.push(callback);
    },
    xposed: {
      hookMethod(method, hook) {
        const key = method.split('(')[0];
        hooks.set(key, hook);
        return () => hooks.delete(key);
      },
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
          if (method === 'runOnUIThread') return deferredUi ? ui.push(args[0]) : args[0]();
          throw Error(method);
        },
      }),
    },
  };
  const tapTranslate = (text, owner = profile, to = 'tr') => {
    let skipped = false;
    hooks.get('showAlert').before({
      args: ['context', owner, 0, 'en', to, text, null, false, null, null],
      setReturnValue: () => (skipped = true),
    });
    return skipped;
  };
  const bind = (text, owner = profile) => {
    const ctx = {
      thisObject: { getField: (name) => (name === 'parentFragment' ? owner : undefined) },
      args: [text, 'Description', true],
    };
    hooks.get('setTextAndValue')?.before(ctx);
    return ctx.args[0];
  };
  return {
    native,
    changed,
    profile,
    newProfile,
    tapTranslate,
    bind,
    close: (owner = profile) => hooks.get('onFragmentDestroy').before({ thisObject: owner }),
    unload: () => unloaders.forEach((callback) => callback()),
    select: (value) => {
      selected = value;
    },
    deferUi: () => {
      deferredUi = true;
    },
    pendingUi: () => ui.length,
    flushUi: () => ui.splice(0).forEach((callback) => callback()),
  };
}

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
  await waitUntil(() => runtime.changed.length > 0);
  // Links and usernames are never sent for translation.
  assert.ok(sent.every((text) => !text.includes('@chatlate') && !text.includes('t.me')));
  assert.deepEqual(runtime.changed, [['notifyItemChanged', 5]]);
  // Telegram collapses blank lines before showing the text.
  const translated = runtime.bind('News from @chatlate\n\nhttps://t.me/Plumgins');
  assert.equal(translated, 'Haberler: @chatlate\n\nhttps://t.me/Plumgins');
  assert.equal(runtime.tapTranslate(about), true);
  await waitUntil(() => runtime.changed.length === 2);
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
  await waitUntil(() => runtime.changed.length > 0);
  assert.equal(runtime.bind('Hello'), 'Merhaba');
  runtime.close();
  assert.equal(runtime.bind('Hello'), 'Hello');
});

test("Telegram's popup stays when another translation service is selected", () => {
  const runtime = profileRuntime('');
  harness({}, undefined, 'en', runtime.native);
  assert.equal(runtime.tapTranslate('Hello'), false);
});

test('identical descriptions stay independent in different profiles', async () => {
  const runtime = profileRuntime(),
    other = runtime.newProfile();
  harness(
    {},
    async (_url, options) => googleReply(googleTexts(options).map(() => 'Merhaba')),
    'en',
    runtime.native,
  );
  runtime.tapTranslate('Hello');
  await waitUntil(() => runtime.bind('Hello') === 'Merhaba');
  assert.equal(runtime.bind('Hello', other), 'Hello');
  runtime.tapTranslate('Hello', other);
  await waitUntil(() => runtime.bind('Hello', other) === 'Merhaba');
  runtime.tapTranslate('Hello', other);
  await waitUntil(() => runtime.bind('Hello', other) === 'Hello');
  assert.equal(runtime.bind('Hello'), 'Merhaba');
  runtime.close(other);
  assert.equal(runtime.bind('Hello'), 'Merhaba');
});

test('changing a profile target requests that language instead of toggling the old translation', async () => {
  const runtime = profileRuntime(),
    targets = [];
  harness(
    {},
    async (url) => {
      const to = new URL(url).searchParams.get('tl');
      targets.push(to);
      return googleReply([to === 'tr' ? 'Merhaba' : 'Hallo']);
    },
    'en',
    runtime.native,
  );
  runtime.tapTranslate('Hello');
  await waitUntil(() => runtime.bind('Hello') === 'Merhaba');
  runtime.tapTranslate('Hello', runtime.profile, 'de');
  await waitUntil(() => runtime.bind('Hello') === 'Hallo');
  assert.deepEqual(targets, ['tr', 'de']);
});

test('closing a profile aborts its request and discards a late response', async () => {
  const runtime = profileRuntime(),
    toasts = [];
  let finish, signal;
  const h = harness(
    {},
    async (_url, options) => {
      signal = options.signal;
      return new Promise((resolve) => {
        finish = () => resolve(googleReply(['Merhaba']));
      });
    },
    'en',
    runtime.native,
  );
  h.ui.toast = (text) => toasts.push(text);
  runtime.tapTranslate('Hello');
  await waitUntil(() => !!finish);
  runtime.close();
  await waitUntil(() => signal.aborted);
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runtime.bind('Hello'), 'Hello');
  assert.deepEqual(runtime.changed, []);
  assert.deepEqual(toasts, []);
});

test('unloading aborts pending profile translations without late updates', async () => {
  const runtime = profileRuntime(),
    toasts = [];
  let finish, signal;
  const h = harness(
    {},
    async (_url, options) => {
      signal = options.signal;
      return new Promise((resolve) => {
        finish = () => resolve(googleReply(['Merhaba']));
      });
    },
    'en',
    runtime.native,
  );
  h.ui.toast = (text) => toasts.push(text);
  runtime.tapTranslate('Hello');
  await waitUntil(() => !!finish);
  runtime.unload();
  assert.equal(signal.aborted, true);
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runtime.bind('Hello'), 'Hello');
  assert.deepEqual(runtime.changed, []);
  assert.deepEqual(toasts, []);
});

test('a queued profile refresh does not run after the profile closes', async () => {
  const runtime = profileRuntime();
  harness({}, async () => googleReply(['Merhaba']), 'en', runtime.native);
  runtime.deferUi();
  runtime.tapTranslate('Hello');
  await waitUntil(() => runtime.pendingUi() > 0);
  runtime.close();
  runtime.flushUi();
  assert.deepEqual(runtime.changed, []);
  assert.equal(runtime.bind('Hello'), 'Hello');
});

test('closing before the deferred translation starts sends no request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runtime = profileRuntime(),
    calls = [];
  harness(
    {},
    async (url) => {
      calls.push(url);
      return googleReply(['Merhaba']);
    },
    'en',
    runtime.native,
  );
  runtime.tapTranslate('Hello');
  runtime.close();
  t.mock.timers.tick(0);
  await Promise.resolve();
  t.mock.timers.tick(1000);
  await Promise.resolve();
  assert.deepEqual(calls, []);
  assert.deepEqual(runtime.changed, []);
});

test('existing profile translations do not replace cells while Telegram is selected', async () => {
  const runtime = profileRuntime();
  harness({}, async () => googleReply(['Merhaba']), 'en', runtime.native);
  runtime.tapTranslate('Hello');
  await waitUntil(() => runtime.bind('Hello') === 'Merhaba');
  runtime.select('');
  assert.equal(runtime.bind('Hello'), 'Hello');
});
