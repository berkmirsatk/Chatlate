const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const { test } = require('node:test');

const source = buildSync({
  stdin: {
    contents: "export { createRainbowHeart } from './src/rainbow-heart.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Heart',
}).outputFiles[0].text;

function harness() {
  const queue = [],
    animators = [];
  const arrays = {
    setFloat: (array, index, value) => {
      array[index] = value;
    },
    callStatic(method, ...args) {
      if (method === 'newInstance') return Array(args[1]).fill(0);
      assert.equal(method, 'setFloat');
      this.setFloat(...args);
    },
  };
  const color = { HSVToColor: (hsv) => Math.round(hsv[0] * 1000) };
  class Listener {
    setField(name, value) {
      this[name] = value;
    }
  }
  class Graphic {
    constructor(...args) {
      this.args = args;
      this.calls = [];
    }
    call(method, ...args) {
      this.calls.push([method, ...args]);
    }
  }
  class Animator {
    constructor() {
      this.values = {};
      this.fraction = 0;
      animators.push(this);
    }
    call(method, ...args) {
      if (method === 'getCurrentPlayTime') return this.fraction * 4800;
      this.values[method] = args[0];
      if (method === 'start' || method === 'setCurrentPlayTime') this.sample(this.fraction);
    }
    getAnimatedFraction() {
      return this.fraction;
    }
    sample(fraction) {
      this.fraction = fraction;
      const listener = this.values.addUpdateListener;
      listener.spec.methods.onAnimationUpdate.body.call(listener, this);
    }
  }
  const context = {
    inu: {
      icons: { svg: (value) => ({ svg: value }) },
      jvm: {
        routine: (body) => body,
        runnable: (body) => body,
        defineClass: (spec) =>
          class extends Listener {
            constructor() {
              super();
              this.spec = spec;
            }
          },
        cls: (name) => {
          if (name.endsWith('$Mode') || name.endsWith('$Config') || name.endsWith('$TileMode'))
            return { getStaticField: (key) => key };
          if (name === 'android.graphics.Bitmap')
            return { callStatic: (_, ...args) => new Graphic(...args) };
          if (name === 'android.graphics.Canvas')
            return class extends Graphic {
              constructor(bitmap) {
                super(bitmap);
                bitmap.canvas = this;
              }
            };
          if (name === 'java.lang.reflect.Array') return arrays;
          if (name === 'android.graphics.Color') return color;
          if (name === 'java.lang.Float') return { getStaticField: () => 'float' };
          if (name === 'android.animation.ValueAnimator')
            return { callStatic: () => new Animator() };
          if (name.endsWith('AndroidUtilities'))
            return { callStatic: (method, arg) => (method === 'dp' ? arg : queue.push(arg)) };
          if (name.endsWith('Theme'))
            return { getStaticField: () => 'gray', callStatic: () => 'gray' };
          return Graphic;
        },
      },
    },
  };
  vm.runInNewContext(source, context);
  const image = () => ({
    tint: '',
    setColorFilter(value, mode) {
      this.tint = value;
      this.mode = mode;
    },
    call(method, arg) {
      if (method === 'equals') return this === arg;
      if (method === 'setImageBitmap') {
        this.bitmap = arg;
        return;
      }
      assert.equal(method, 'setColorFilter');
      this.setColorFilter(arg);
    },
  });
  return {
    api: context.Heart.createRainbowHeart(),
    animators,
    image,
    cell: (view) => ({
      getField: (name) => {
        assert.equal(name, 'imageView');
        return view;
      },
    }),
    flush: () => {
      while (queue.length) queue.shift()();
    },
  };
}

test('RGB heart loops smoothly and binding the same icon preserves animation position', () => {
  const h = harness(),
    view = h.image(),
    cell = h.cell(view);
  assert.match(h.api.icon().svg, /<path/);
  assert.match(h.api.icon().svg, /fill="#ffffff"/);
  assert.equal(h.api.icon(), h.api.icon());
  h.api.bind(cell, true);
  const animator = h.animators[0];
  assert.equal(view.mode, 'MULTIPLY', 'rainbow tint preserves the light and shadow');
  assert.equal(view.bitmap.canvas.calls.filter((call) => call[0] === 'drawPath').length, 2);
  const shaded = view.bitmap;
  assert.equal(animator.values.setDuration, 4800);
  assert.equal(animator.values.setRepeatCount, -1);
  const colors = [0, 0.25, 0.5, 0.75].map((fraction) => {
    animator.sample(fraction);
    return view.tint;
  });
  assert.equal(new Set(colors).size, 4);
  animator.sample(1);
  assert.equal(view.tint, colors[0]);
  animator.sample(0.5);
  h.api.bind(cell, true);
  assert.equal(h.animators.length, 1);
  assert.equal(view.bitmap, shaded, 'rebinding reuses the shaded artwork');
  assert.equal(view.tint, colors[2]);
});

test('recycling or closing cancels RGB animation and restores only its own icon', () => {
  const h = harness(),
    view = h.image(),
    other = h.image();
  h.api.bind(h.cell(view), true);
  h.api.bind(h.cell(other), false);
  assert.equal(h.animators[0].values.cancel, undefined);
  assert.equal(other.tint, '');
  h.api.bind(h.cell(view), false);
  assert.ok('cancel' in h.animators[0].values);
  assert.equal(view.tint, 'gray');
  h.api.bind(h.cell(view), true);
  h.api.reset();
  h.flush();
  assert.ok('cancel' in h.animators[1].values);
  assert.equal(view.tint, 'gray');
});

test('a delayed cleanup does not cancel or recolor a newly bound heart', () => {
  const h = harness(),
    view = h.image(),
    cell = h.cell(view);
  h.api.bind(cell, true);
  h.api.reset();
  h.api.bind(cell, true);
  h.animators[1].sample(0.25);
  const color = view.tint;
  h.flush();
  assert.ok('cancel' in h.animators[0].values);
  assert.equal('cancel' in h.animators[1].values, false);
  assert.equal(view.tint, color);
});
