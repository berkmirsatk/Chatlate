const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./helpers/plugin-runtime.cjs');

const STRINGS = {
  TranslateToButton: 'Translate to %s',
  ShowOriginalButton: 'Show Original',
  InuTranslating: 'Translating...',
  Hide: 'Hide',
};

/** A view that records what the plugin sets on it. */
function fakeView(kind) {
  return {
    kind,
    children: [],
    visibility: 0,
    padding: [0, 56, 0, 0],
    call(signature, ...args) {
      const method = signature.split('(')[0];
      if (method === 'addView')
        this.children.splice(args.length === 3 ? args[1] : this.children.length, 0, args[0]);
      else if (method === 'removeView') this.children.splice(this.children.indexOf(args[0]), 1);
      else if (method === 'indexOfChild') return this.children.indexOf(args[0]);
      else if (method === 'getContext') return 'context';
      else if (method === 'getParent') return this.parent;
      else if (method === 'setVisibility') this.visibility = args[0];
      else if (method === 'setText') this.text = args[0];
      else if (method === 'setTag') this.tag = args[0];
      else if (method === 'getTag') return this.tag;
      else if (method === 'setOnClickListener') this.listener = args[0];
      else if (method === 'setTranslationY') this.y = args[0];
      else if (method === 'setPadding') this.padding = args;
      else if (method === 'getPaddingLeft') return this.padding[0];
      else if (method === 'getPaddingTop') return this.padding[1];
      else if (method === 'getPaddingRight') return this.padding[2];
      else if (method === 'getPaddingBottom') return this.padding[3];
      else if (method === 'equals') return args[0] === this;
    },
  };
}

function articleRuntime({ installed = 'installation:chatlate.google', sheet } = {}) {
  const hooks = new Map(),
    disposed = new Set(),
    clicks = [],
    delayed = [];
  const container = fakeView('container');
  const header = {
    kind: 'header',
    getField: (name) => ({ menuBackgroundColor: 0, menuTextColor: -1, menuIconColor: -1 })[name],
    call: (method) =>
      ({ 'getBackgroundColor()I': 0, getTextColor: -1, getTop: 0, topPadding: 24 })[method],
    equals: undefined,
  };
  container.children.push(header);
  const list = fakeView('list');
  const page = {
    getField: (name) => (name === 'url' ? 'https://telegra.ph/api' : undefined),
    call: (method, other) => method === 'equals' && other === page,
  };
  const layout = {
    getField: (name) => ({ type: 0, listView: list, adapter: { getField: () => page } })[name],
  };
  const viewer = {
    getField: (name) =>
      ({ containerView: container, actionBar: header, currentHeaderHeight: 56, sheet })[name],
    call: (method, other) =>
      method === 'getCurrentPageLayout' ? layout : method === 'equals' && other === viewer,
  };
  const state = {
    fields: { detectionDone: false, detectedSrcLang: null, unavailable: false, applied: false },
    getField(name) {
      return name === 'original' ? page : this.fields[name];
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
  const menus = [];
  const menu = () => {
    const created = {
      items: [],
      call(signature, ...args) {
        if (signature.startsWith('add')) this.items.push([signature.split('(')[0], ...args]);
      },
    };
    menus.push(created);
    return created;
  };
  const views = { TextView: [], ImageView: [] };
  const native = {
    onUnload() {},
    xposed: {
      hookMethod(method, hook) {
        hooks.set(method, hook);
        disposed.delete(method);
        return () => disposed.add(method);
      },
    },
    jvm: {
      runnable: (fn) => ({ run: fn }),
      defineClass: ({ methods }) =>
        function Listener() {
          this.click = (view) => methods.onClick.body(this, view);
        },
      cls(name) {
        const short = name.split('.').pop();
        const View = function () {
          const view = fakeView(short);
          views[short]?.push(view);
          return view;
        };
        return Object.assign(View, {
          getStaticField(field) {
            if (field === 'TRANSLATION_PROVIDER')
              return { call: (method) => (method === 'getValue' ? installed : undefined) };
            if (field === 'states') return states;
            return field;
          },
          getDeclaredMethod: (method) => short + '.' + method,
          callStatic(signature, ...args) {
            const method = signature.split('(')[0];
            if (method === 'getString') return STRINGS[args[0]] ?? args[0];
            if (method === 'runOnUIThread') {
              if (args.length > 1) delayed.push(args[0]);
              else args[0].run();
              return;
            }
            if (method === 'onClick') return clicks.push(args[0]);
            if (method === 'makeOptions') return menu();
            if (method === 'createFrame') return 'params';
            if (method === 'languageName') return args[0] === 'tr' ? 'Turkish' : args[0];
            if (method === 'getToLanguage') return 'tr';
            if (method === 'dp') return args[0];
            return 0;
          },
        });
      },
    },
  };
  return {
    native,
    hooks,
    disposed,
    clicks,
    state,
    list,
    container,
    viewer,
    menus,
    get bar() {
      return container.children.find((child) => child.kind === 'FrameLayout');
    },
    get label() {
      return views.TextView[0];
    },
    get button() {
      return views.ImageView[0];
    },
    open() {
      hooks.get('InstantViewHelper.onPageOpened').after({ args: [viewer, page] });
    },
    /** Inugram finishes detecting the page language. */
    detect(language) {
      state.fields.detectionDone = true;
      state.fields.detectedSrcLang = language;
      delayed.splice(0).forEach((runnable) => runnable.run());
    },
  };
}

test('the article bar appears once a foreign page language is detected', () => {
  const runtime = articleRuntime();
  harness({}, undefined, 'en', runtime.native);
  runtime.open();
  assert.equal(runtime.bar.visibility, 8);
  runtime.detect('en');
  assert.equal(runtime.bar.visibility, 0);
  assert.equal(runtime.label.text, 'Translate to Turkish');
  // It sits under the header, and the article moves down to make room for it.
  assert.equal(runtime.container.children.indexOf(runtime.bar), 0);
  assert.equal(runtime.bar.y, 80);
  assert.deepEqual(runtime.list.padding, [0, 96, 0, 0]);
});

test('tapping the article bar translates the page and then offers the original', () => {
  const runtime = articleRuntime();
  harness({}, undefined, 'en', runtime.native);
  runtime.open();
  runtime.detect('en');
  runtime.label.listener.click(runtime.label);
  assert.deepEqual(runtime.clicks, [runtime.viewer]);
  runtime.state.fields.applied = true;
  runtime.hooks.get('InstantViewHelper.invalidatePages').after({ args: [runtime.viewer] });
  assert.equal(runtime.label.text, 'Show Original');
});

test('hiding the article bar gives the article its space back', () => {
  const runtime = articleRuntime();
  harness({}, undefined, 'en', runtime.native);
  runtime.open();
  runtime.detect('en');
  runtime.button.listener.click(runtime.button);
  const items = runtime.menus.at(-1).items;
  assert.deepEqual(
    items.map(([method, ...args]) => (method === 'addChecked' ? args[1] : args[0])),
    ['Google', 'Yandex', 'Microsoft', undefined, 'Hide'],
  );
  items.at(-1)[2].run();
  assert.equal(runtime.bar.visibility, 8);
  assert.deepEqual(runtime.list.padding, [0, 56, 0, 0]);
  assert.ok(runtime.disposed.has('ArticleViewer.setCurrentHeaderHeight'));
  // It stays hidden for that article.
  runtime.open();
  runtime.detect('en');
  assert.equal(runtime.bar.visibility, 8);
});

test('no article bar for the target language or another translation service', () => {
  for (const [installed, language] of [
    ['installation:chatlate.google', 'tr'],
    ['', 'en'],
  ]) {
    const runtime = articleRuntime({ installed });
    harness({}, undefined, 'en', runtime.native);
    runtime.open();
    runtime.state.fields.unavailable = language === 'tr';
    runtime.detect(language);
    assert.equal(runtime.bar.visibility, 8);
    assert.deepEqual(runtime.list.padding, [0, 56, 0, 0]);
  }
});

test('a half-open article sheet keeps the bar out of sight until it reaches the header', () => {
  const sheet = { attached: false, getField: () => sheet.attached };
  const runtime = articleRuntime({ sheet });
  harness({}, undefined, 'en', runtime.native);
  runtime.open();
  runtime.detect('en');
  assert.equal(runtime.bar.visibility, 4);
  sheet.attached = true;
  runtime.hooks.get('ArticleViewer$Sheet.checkNavColor').after({});
  assert.equal(runtime.bar.visibility, 0);
});
