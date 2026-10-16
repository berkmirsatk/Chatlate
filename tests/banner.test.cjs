const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const { test } = require('node:test');

const source = buildSync({
  stdin: {
    contents: "export { createSettingsBanner } from './src/settings-banner.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Banner',
  minifyWhitespace: true,
}).outputFiles[0].text;

test('banner strip has its own click, keeps artwork size, follows state and cancels stale actions', () => {
  const ui = [],
    callbacks = [];
  const animations = [];
  let toggles = 0,
    updates = 0;
  class View {
    constructor(...args) {
      this.args = args;
      this.values = {};
      this.children = [];
    }
    call(name, ...args) {
      if (name === 'equals') return this === args[0];
      if (name === 'addView') this.children.push(args[0]);
      this.values[name] = args;
    }
  }
  class PropertyAnimator extends View {
    constructor(view, values) {
      super(...values);
      this.view = view;
    }
    sample(alpha) {
      if (!('cancel' in this.values)) this.view.call('setAlpha', alpha);
    }
  }
  const context = {
    inu: {
      jvm: {
        runnable: (fn) => fn,
        defineClass: (spec) =>
          class Listener {
            constructor() {
              this.spec = spec;
            }
          },
        cls: (name) => {
          if (name === 'java.lang.reflect.Array')
            return {
              callStatic: (method, ...args) => {
                if (method === 'newInstance') return Array(args[1]).fill(0);
                args[0][args[1]] = args[2];
              },
            };
          if (name === 'java.lang.Float') return { getStaticField: (key) => key };
          if (name === 'android.animation.ObjectAnimator')
            return {
              callStatic: (_, view, property, values) => {
                assert.equal(property, 'alpha');
                const animation = new PropertyAnimator(view, values);
                animations.push(animation);
                return animation;
              },
            };
          if (name.endsWith('AndroidUtilities'))
            return { callStatic: (method, arg) => (method === 'dp' ? arg : ui.push(arg)) };
          if (name.endsWith('ApplicationLoader')) return { getStaticField: () => new View() };
          if (name.endsWith('Theme'))
            return { getStaticField: (key) => key, callStatic: (_, key) => key };
          if (name.endsWith('Base64')) return { callStatic: () => new Uint8Array() };
          if (name.endsWith('BitmapFactory') || name.endsWith('Bitmap'))
            return { callStatic: () => ({ bitmap: true }) };
          if (name.endsWith('$Config') || name.endsWith('$ScaleType') || name.endsWith('$Style'))
            return { getStaticField: (key) => key };
          return View;
        },
      },
      android: { nativeView: (view) => ({ native: view }) },
    },
    setTimeout: (fn) => callbacks.push(fn),
  };
  vm.runInNewContext(source, context);
  const banner = context.Banner.createSettingsBanner(
    () => {},
    () => toggles++,
  );
  const state = { available: true, text: 'Update available · 1.0.1', onClick: () => updates++ };
  const flushUi = () => {
    while (ui.length) ui.shift()();
  };
  const flushCallbacks = () => {
    while (callbacks.length) callbacks.shift()();
  };
  const click = (view) => {
    const listener = view.values.setOnClickListener[0];
    listener.spec.methods.onClick.body(listener, view);
  };
  banner.render(false, state);
  flushUi();
  flushCallbacks();
  const root = banner.getView(),
    [artwork, stripe] = root.children,
    [image, arrow] = artwork.children;
  assert.equal(root.values.setOrientation[0], 1);
  assert.deepEqual(artwork.values.setLayoutParams[0].args, [-1, -2]);
  assert.deepEqual(image.values.setLayoutParams[0].args, [-1, -2]);
  assert.equal(image.values.setAdjustViewBounds[0], true);
  assert.deepEqual(stripe.values.setLayoutParams[0].args, [-1, 34]);
  const glow = stripe.children[0];
  assert.equal(stripe.children[2].values.setText[0], state.text);
  assert.equal(stripe.values.startAnimation, undefined);
  assert.equal(stripe.children[2].values.startAnimation, undefined);
  const animation = animations[0];
  assert.deepEqual(animation.args, [0, 0.65]);
  assert.equal(animation.values.setRepeatMode[0], 2);
  assert.equal(animation.values.setRepeatCount[0], 3);
  assert.equal(glow.values.setAlpha[0], 0);
  banner.render(false, state);
  flushUi();
  assert.equal(animations.length, 1);
  animation.sample(0.65);
  click(stripe);
  flushCallbacks();
  assert.equal(updates, 1);
  assert.equal(toggles, 0);
  assert.ok('cancel' in animation.values);
  assert.equal(glow.values.setAlpha[0], 0);
  banner.render(false, state);
  flushUi();
  animation.sample(0.65);
  assert.equal(
    glow.values.setAlpha[0],
    0,
    'leaving update notes without installing keeps the light off',
  );
  click(root);
  flushCallbacks();
  assert.equal(toggles, 1);
  banner.render(false, { ...state, available: false });
  flushUi();
  assert.equal(stripe.values.setVisibility[0], 8);
  assert.equal(glow.values.setAlpha[0], 0);
  assert.equal(glow.values.setVisibility[0], 8);
  assert.deepEqual(arrow.values.setLayoutParams[0].values.setMargins, [0, 0, 14, 12]);
  banner.render(true, { ...state, text: 'Güncelleme mevcut · 1.0.1' });
  flushUi();
  assert.equal(stripe.values.setVisibility[0], 0);
  assert.notEqual(animations.at(-1), animation);
  assert.equal(stripe.children[2].values.setText[0], 'Güncelleme mevcut · 1.0.1');
  click(stripe);
  banner.reset();
  flushUi();
  flushCallbacks();
  assert.equal(updates, 1);
  assert.equal(stripe.values.setOnClickListener[0], null);
});
