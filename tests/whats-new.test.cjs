const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./helpers/plugin-runtime.cjs');

const PREVIEW = 'org.telegram.messenger.RichMessageLayout$PreviewView';
const wait = () => new Promise((resolve) => setTimeout(resolve, 5));
const list = (values) => ({
  call: (method, index) => (method === 'size' ? values.length : values[index]),
});

/** A view that records what the plugin sets on it. */
function fakeView(className, extra = {}) {
  const view = {
    values: {},
    children: [],
    listeners: [],
    ...extra,
    call(signature, ...args) {
      const method = signature.split('(')[0];
      if (method === 'getClass') return { call: () => className };
      if (method === 'getContext') return 'context';
      if (method === 'getParent') return view.parent;
      if (method === 'equals') return args[0] === view;
      if (method === 'getTag') return view.values.setTag;
      if (method === 'addView') {
        args[0].parent = view;
        return view.children.push(args[0]);
      }
      if (method === 'removeView') {
        args[0].parent = undefined;
        return view.children.splice(view.children.indexOf(args[0]), 1);
      }
      if (method === 'addOnAttachStateChangeListener') return view.listeners.push(args[0]);
      if (method === 'set') view.shown = args[0];
      view.values[method] = args.length > 1 ? args : args[0];
    },
    getField: (name) => (name === 'richMessage' ? view.shown : undefined),
  };
  return view;
}
const notes = (text) => fakeView(PREVIEW, { shown: { original: text } });

function runtime() {
  const hooks = new Map(),
    requests = [],
    icons = [];
  class Listener {
    constructor(spec) {
      this.spec = spec;
    }
  }
  const menu = {
    call(method, id) {
      assert.match(method, /^addItem\(II\).*SimpleActionBarMenuItem;$/);
      const item = fakeView('SimpleActionBarMenuItem', { parent: fakeView('menu') });
      item.values.setTag = id;
      icons.push(item);
      return item;
    },
  };
  const bar = {
    call: (method) => (method === 'createMenu' ? menu : undefined),
    getField: (name) => (assert.equal(name, 'itemsColor'), 'items colour'),
  };
  const native = {
    onUnload() {},
    xposed: {
      hookMethod: (method, hook) => (hooks.set(method, hook), () => {}),
      hookAllConstructors: (cls, hook) => (hooks.set(cls.short + '()', hook), () => {}),
    },
    jvm: {
      runnable: (fn) => fn,
      defineClass: (spec) =>
        class extends Listener {
          constructor() {
            super(spec);
          }
        },
      cls(name) {
        const short = name.split('.').pop();
        const View = function () {
          const view = fakeView(short);
          if (short === 'ImageView') icons.push(view);
          return view;
        };
        return Object.assign(View, {
          short,
          getStaticField(field) {
            if (field === 'TRANSLATION_PROVIDER')
              return {
                call: (method) =>
                  method === 'getValue' ? 'installation:chatlate.yandex' : undefined,
              };
            return field;
          },
          getDeclaredMethod: (method) => short + '.' + method,
          callStatic(signature, ...args) {
            const method = signature.split('(')[0];
            if (method === 'runOnUIThread') return args[0]();
            if (method === 'createRichRequest')
              return { original: args[0], from: args[1], to: args[2] };
            if (method === 'setRequestProvider') return (args[0].provider = args[1]);
            if (method === 'getInstance')
              return { call: (_send, request, delegate) => requests.push({ request, delegate }) };
            if (method === 'getColor') return args[0];
            if (method === 'createFrame') return 'params';
            return 0;
          },
        });
      },
    },
  };
  return {
    native,
    hooks,
    requests,
    icons,
    bar,
    tap: async (icon) => {
      icon.values.setOnClickListener.spec.methods.onClick.body(null, icon);
      await wait();
    },
    /** Answers the request in flight. */
    answer(text) {
      const { request, delegate } = requests.at(-1);
      delegate.spec.methods.run.body(
        null,
        text === null
          ? null
          : { getField: () => list([{ translated: text, of: request.original }]) },
      );
    },
  };
}

test("What's new in settings gets a header icon that translates each release and back", async () => {
  const r = runtime();
  harness({}, undefined, 'tr', r.native);
  const views = [notes('Release 56'), notes('Release 55')];
  const originals = views.map((view) => view.shown);
  const fragment = {
    call: (method) => (method === 'getSimpleActionBar' ? r.bar : undefined),
    getField: (name) => (name === 'releaseViews' ? list(views) : undefined),
  };
  r.hooks.get('WhatsNewActivity.createView').after({ thisObject: fragment });
  const [icon] = r.icons;
  assert.equal(icon.values.setIconColor, 'items colour');
  assert.equal(icon.values.setContentDescription, 'Çevir');

  await r.tap(icon);
  // One release at a time, with the preferred Chatlate service, into the app's language.
  assert.equal(r.requests.length, 1);
  assert.deepEqual(r.requests[0].request, {
    original: originals[0],
    from: 'en',
    to: 'tr',
    provider: 'installation:chatlate.yandex',
  });
  assert.equal(views[0].values.setTranslationLoading, true);
  assert.equal(icon.values.setEnabled, false);
  r.answer('Sürüm 56');
  assert.equal(views[0].shown.translated, 'Sürüm 56');
  assert.equal(r.requests.length, 2);
  r.answer('Sürüm 55');
  assert.equal(views[1].shown.translated, 'Sürüm 55');
  assert.equal(icon.values.setEnabled, true);
  // The accent colour marks the translated page.
  assert.equal(icon.values.setIconColor, 'key_windowBackgroundWhiteBlueText');
  assert.equal(icon.values.setContentDescription, 'Orijinalini göster');

  await r.tap(icon);
  assert.deepEqual(
    views.map((view) => view.shown),
    originals,
  );
  // Translating again needs no new request.
  await r.tap(icon);
  assert.equal(views[1].shown.translated, 'Sürüm 55');
  assert.equal(r.requests.length, 2);
});

test('a failed translation keeps the original notes', async () => {
  const r = runtime();
  harness({}, undefined, 'tr', r.native);
  const view = notes('Release 56');
  const original = view.shown;
  const fragment = {
    call: (method) => (method === 'getSimpleActionBar' ? r.bar : undefined),
    getField: () => list([view]),
  };
  r.hooks.get('WhatsNewActivity.createView').after({ thisObject: fragment });
  await r.tap(r.icons[0]);
  r.answer(null);
  await wait();
  assert.equal(view.shown, original);
  assert.equal(view.values.setTranslationLoading, false);
  assert.equal(r.icons[0].values.setIconColor, 'items colour');
  assert.equal(r.icons[0].values.setEnabled, true);
  // The next tap tries again.
  await r.tap(r.icons[0]);
  assert.equal(r.requests.length, 2);
});

test('the sheet shown after an update gets the icon beside its title', async () => {
  const r = runtime();
  harness({}, undefined, 'tr', r.native);
  const title = fakeView('TextView');
  const view = notes('Release 56');
  const sheet = { getField: () => list([title, fakeView('TextView'), view]) };
  r.hooks.get('ChangelogSheet()').after({ thisObject: sheet });
  const [icon] = r.icons;
  assert.equal(icon.values.setImageResource, 'msg_translate');
  // The title's row exists once the list shows it.
  title.parent = fakeView('FrameLayout');
  title.listeners[0].spec.methods.onViewAttachedToWindow.body(null, title);
  assert.deepEqual(title.parent.children, [icon]);
  await r.tap(icon);
  r.answer('Sürüm 56');
  assert.equal(view.shown.translated, 'Sürüm 56');
  assert.equal(icon.values.setColorFilter, 'key_windowBackgroundWhiteBlueText');
});

test('no icon for an English app or a sheet without notes', () => {
  const english = runtime();
  harness({}, undefined, 'en', english.native);
  english.hooks.get('WhatsNewActivity.createView').after({
    thisObject: { call: () => english.bar, getField: () => list([notes('Release 56')]) },
  });
  assert.equal(english.icons.length, 0);
  const r = runtime();
  harness({}, undefined, 'tr', r.native);
  r.hooks.get('ChangelogSheet()').after({
    thisObject: { getField: () => list([fakeView('TextView'), fakeView('TextView')]) },
  });
  assert.equal(r.icons.length, 0);
});
