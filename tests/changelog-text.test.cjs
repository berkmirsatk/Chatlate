const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const { test } = require('node:test');
const source = buildSync({
  stdin: {
    contents: "export { createChangelogText } from './src/updates/changelog-text.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Notes',
}).outputFiles[0].text;

function harness() {
  const hooks = [],
    queue = [];
  class NativeMap {
    constructor() {
      this.data = new Map();
    }
    call(method, ...args) {
      if (method === 'put') this.data.set(args[0], args[1]);
      if (method === 'get') return this.data.get(args[0]);
      if (method === 'remove') this.data.delete(args[0]);
    }
  }
  class Styled {
    constructor(original) {
      this.original = original;
      this.text = typeof original === 'string' ? original : original.text;
      this.spans = [];
    }
    call(method, ...args) {
      if (method === 'toString') return this.text;
      if (method === 'setSpan') this.spans.push(args);
    }
  }
  class Span {
    constructor(...args) {
      this.args = args;
    }
  }
  const context = {
    inu: {
      ui: { separator: (text) => ({ text }) },
      jvm: {
        runnable: (fn) => fn,
        cls(name) {
          if (name.endsWith('AndroidUtilities')) return { callStatic: (_, fn) => queue.push(fn) };
          if (name.endsWith('WeakHashMap')) return NativeMap;
          if (name.endsWith('TextInfoPrivacyCell')) return { getDeclaredMethod: (name) => name };
          if (name.endsWith('Theme'))
            return { getStaticField: (key) => key, callStatic: (_, key) => key };
          if (name.endsWith('SpannableStringBuilder')) return Styled;
          if (name.endsWith('Span')) return Span;
          throw Error(name);
        },
      },
      xposed: {
        hookMethod(method, spec) {
          assert.equal(method, 'setText');
          const hook = { ...spec, active: true };
          hooks.push(hook);
          return () => {
            hook.active = false;
          };
        },
      },
    },
  };
  vm.runInNewContext(source, context);
  const content = {
    text: 'Added\nBody bold',
    entities: [
      { _: 'messageEntityBold', offset: 0, length: 5 },
      { _: 'messageEntityBold', offset: 11, length: 4 },
    ],
  };
  const view = {
    text: content.text,
    color: 'gray',
    size: 14,
    call(method, ...args) {
      if (method === 'getCurrentTextColor') return this.color;
      if (method === 'getTextSize') return this.size;
      if (method === 'getText') return this.text;
      if (method === 'setTextColor') this.color = args[0];
      if (method === 'setTextSize') this.size = args.at(-1);
      if (method === 'setText') this.text = args[0];
      if (method.startsWith('setBackground')) throw Error('No background allowed');
    },
  };
  const cell = {
    call(method, other) {
      if (method === 'equals') return this === other;
      if (method === 'getTextView') return view;
    },
  };
  function bind(value = content.text) {
    view.text = value;
    for (const hook of hooks) if (hook.active) hook.after({ thisObject: cell, args: [value] });
  }
  return {
    view,
    content,
    hooks,
    bind,
    create: () => context.Notes.createChangelogText(content),
    flush: () => {
      while (queue.length) queue.shift()();
    },
  };
}

test('background-free notes use normal text color and emphasize only full-line headings', () => {
  const h = harness(),
    renderer = h.create();
  assert.equal(renderer.item().text, h.content);
  h.bind();
  assert.equal(h.view.color, 'key_windowBackgroundWhiteBlackText');
  assert.equal(h.view.size, 16);
  assert.equal(h.view.text.original, h.content.text);
  assert.equal(h.view.text.spans.length, 3);
  for (const span of h.view.text.spans) assert.deepEqual(span.slice(1), [0, 5, 33]);
  h.bind('Other settings');
  assert.equal(h.view.color, 'gray');
  assert.equal(h.view.size, 14);
  assert.equal(h.view.text, 'Other settings');
  renderer.dispose();
  h.flush();
});

test('closing restores text and removes hooks; old queued cleanup cannot overwrite a new binding', () => {
  const h = harness(),
    old = h.create();
  h.bind();
  old.dispose();
  const current = h.create();
  h.bind();
  h.flush();
  assert.equal(h.view.color, 'key_windowBackgroundWhiteBlackText');
  current.dispose();
  h.flush();
  assert.equal(
    h.hooks.every((hook) => !hook.active),
    true,
  );
});

test('SDK Markdown remains readable if native styling is unavailable', () => {
  const context = { inu: { ui: { separator: (text) => ({ text }) } } };
  vm.runInNewContext(source, context);
  const content = { text: 'Notes', entities: [] };
  const renderer = context.Notes.createChangelogText(content);
  assert.equal(renderer.item().text, content);
  renderer.dispose();
});
