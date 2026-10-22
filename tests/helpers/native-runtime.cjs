const assert = require('node:assert/strict');
const { openOrder } = require('./plugin-runtime.cjs');

const toggleSymbol = (icon) =>
  icon.children[0].values.setImageBitmap.canvas.calls.filter((call) => call[0] === 'drawLine')
    .length === 2
    ? '⊕'
    : '⊖';

function bannerRuntime() {
  const runtime = dragRuntime();
  const original = runtime.native.jvm.cls;
  runtime.decodedBanners = [];
  runtime.ready = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    runtime.flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
  };
  runtime.native.jvm.cls = (name) => {
    if (name === 'org.telegram.ui.Components.ItemOptions')
      return {
        callStatic(method) {
          assert.equal(method, 'makeOptions');
          const menu = {
            items: [],
            call(method, ...args) {
              if (method === 'add') this.items.push({ text: args[0], fn: args[1] });
              else this[method] = true;
            },
          };
          runtime.menus.push(menu);
          return menu;
        },
      };
    if (name === 'android.graphics.BitmapFactory')
      return {
        callStatic: (method, bytes, offset, length) => {
          assert.equal(method, 'decodeByteArray');
          assert.equal(offset, 0);
          assert.equal(length, bytes.length);
          assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
          assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
          assert.ok(length < 30000);
          assert.ok(!bytes.includes(Buffer.from('ANIM')));
          const bitmap = { localBanner: true };
          runtime.decodedBanners.push(bitmap);
          return bitmap;
        },
      };
    if (name === 'android.widget.ImageView$ScaleType') return { getStaticField: (key) => key };
    return original(name);
  };
  return runtime;
}

function dragRuntime(
  writeSucceeds = true,
  marquee = false,
  languageFlags = false,
  attachedSelector = false,
) {
  let value = 'drag-installation:multi.google-free',
    onUi = false,
    definitions = 0;
  const queue = [],
    unloaders = [],
    menus = [];
  let touched;
  const container = {
    call() {
      assert.equal(onUi, true);
    },
  };
  class View {
    constructor() {
      assert.equal(onUi, true);
      this.children = [];
      this.values = {};
    }
    call(method, ...args) {
      assert.equal(onUi, true);
      if (method === 'addView') {
        this.children.splice(
          typeof args[1] === 'number' ? args[1] : this.children.length,
          0,
          args[0],
        );
        args[0].parent = this;
        return;
      }
      if (method === 'removeView') {
        this.children.splice(this.children.indexOf(args[0]), 1);
        return;
      }
      if (method === 'removeAllViews') {
        this.children = [];
        return;
      }
      if (method === 'getChildAt') return this.children[args[0]];
      if (method === 'getHeight') return 56;
      if (method === 'getWidth') return this.width || 100;
      if (method === 'getCompoundPaddingLeft') return this.padding?.[0] || 0;
      if (method === 'getCompoundPaddingRight') return this.padding?.[2] || 0;
      if (method === 'getPaint')
        return {
          call: (name, text) => {
            assert.equal(name, 'measureText');
            return text.length * 8;
          },
        };
      if (method === 'equals') return this === args[0];
      if (method === 'getId') return this.values.setId;
      if (method === 'getTag') return this.values.setTag;
      if (method === 'getParent') return this.parent || container;
      if (method === 'animate') {
        (this.calls ||= []).push([method]);
        return {
          call: (name, value) => {
            assert.equal(onUi, true);
            this.values['animated.' + name] = value;
            if (name === 'translationY') this.values.setTranslationY = value;
          },
        };
      }
      if (method === 'setPadding') this.padding = args;
      (this.calls ||= []).push([method, ...args]);
      this.values[method] = args[0];
    }
  }
  function emit(root, action, y = 0) {
    const listener = touched.values.setOnTouchListener;
    // Old test helper names: 3 = release, 4 = cancel; MotionEvent uses 1 and 3.
    const touchAction = action === 3 ? 1 : action === 4 ? 3 : action;
    return listener?.spec.methods.onTouch.body(listener, touched, {
      call: (method) => (method === 'getActionMasked' ? touchAction : y),
    });
  }
  const config = {
    call(method, arg) {
      if (method === 'getValue') return value;
      if (method === 'setValue') {
        if (writeSucceeds) value = arg;
        return;
      }
      throw Error(method);
    },
  };
  const native = {
    onUnload: (fn) => unloaders.push(fn),
    jvm: {
      runnable: (fn) => fn,
      routine(spec, captures = []) {
        return Function(...spec.captures, 'return (' + spec.source + ');')(...captures);
      },
      defineClass(spec) {
        definitions++;
        return class Listener {
          constructor() {
            this.spec = spec;
          }
        };
      },
      cls(name) {
        if (languageFlags && name === 'org.telegram.ui.Components.RecyclerListView')
          return { isInstance: (parent) => !!parent?.isRecycler };
        if (languageFlags && name === 'org.telegram.ui.Components.ItemOptions')
          return {
            callStatic(method, ...params) {
              assert.equal(onUi, true);
              assert.equal(method, 'makeOptions');
              const menu = {
                anchor: params[1],
                items: [],
                call(method, ...args) {
                  assert.equal(onUi, true);
                  if (method === 'add') this.items.push(args);
                  else if (method === 'setDrawScrim') this.drawScrim = args[0];
                  else this[method] = true;
                },
              };
              menus.push(menu);
              return menu;
            },
          };
        if (languageFlags && name === 'android.graphics.Path$Direction')
          return { getStaticField: (key) => key };
        if (
          languageFlags &&
          [
            'android.text.SpannableString',
            'android.text.style.ImageSpan',
            'android.graphics.drawable.BitmapDrawable',
          ].includes(name)
        )
          return class extends View {
            constructor(...args) {
              super();
              this.args = args;
            }
          };
        if (name === 'desu.inugram.InuConfig') return { getStaticField: () => config };
        if (name.endsWith('AndroidUtilities'))
          return {
            callStatic(method, ...args) {
              if (method === 'dp') return args[0];
              assert.equal(method, 'runOnUIThread');
              queue.push({ fn: args[0], delay: args[1] || 0 });
            },
          };
        if (name.endsWith('ApplicationLoader'))
          return { getStaticField: () => (languageFlags ? new View() : 'context') };
        if (name.endsWith('Theme'))
          return { getStaticField: (key) => key, callStatic: (method, key) => key };
        if (name === 'android.graphics.Bitmap$Config' || name === 'android.graphics.Paint$Style')
          return { getStaticField: (key) => key };
        if (name === 'android.graphics.Bitmap')
          return {
            callStatic(method, width, height, config) {
              assert.equal(onUi, true);
              return { width, height, config };
            },
          };
        if (name === 'android.graphics.Canvas')
          return class extends View {
            constructor(bitmap) {
              super();
              bitmap.canvas = this;
            }
          };
        if (
          name === 'android.graphics.Paint' ||
          name === 'android.graphics.Path' ||
          name === 'android.widget.ImageView'
        )
          return View;
        if (
          name === 'android.view.View$OnTouchListener' ||
          name === 'android.view.View$OnClickListener' ||
          name === 'android.view.View$OnLayoutChangeListener'
        )
          return {};
        if (name === 'android.text.TextUtils$TruncateAt' && (marquee || languageFlags))
          return { getStaticField: (key) => key };
        if (
          name === 'android.widget.LinearLayout$LayoutParams' ||
          name === 'android.widget.FrameLayout$LayoutParams'
        )
          return class {
            constructor(...args) {
              this.args = args;
            }
            call() {
              assert.equal(onUi, true);
            }
          };
        if (
          name === 'android.view.View' ||
          name === 'android.widget.LinearLayout' ||
          name === 'android.widget.FrameLayout' ||
          name === 'android.widget.TextView' ||
          name === 'org.telegram.ui.Cells.TextInfoPrivacyCell' ||
          name === 'android.graphics.drawable.GradientDrawable'
        )
          return View;
        throw Error(name);
      },
    },
    android: {
      nativeView: (root) => {
        if (attachedSelector && !root.parent)
          root.parent = {
            outerRow: true,
            call(method) {
              assert.equal(onUi, true);
              return method === 'getParent' ? { isRecycler: true } : undefined;
            },
          };
        return { native: root };
      },
      getCurrentFragment: () => ({}),
    },
  };
  function onUiThread(fn) {
    onUi = true;
    try {
      return fn();
    } finally {
      onUi = false;
    }
  }
  return {
    native,
    menus,
    onUiThread,
    get value() {
      return value;
    },
    get definitions() {
      return definitions;
    },
    queue,
    unload() {
      for (const dispose of unloaders) dispose();
    },
    flush() {
      while (queue.length) onUiThread(queue.shift().fn);
    },
    drag(root, index) {
      return onUiThread(() => {
        const row = root.children[index];
        touched = row.children[0];
        const listener = touched.values.setOnTouchListener;
        return listener.spec.methods.onTouch.body(listener, touched, {
          call: (method) => (method === 'getActionMasked' ? 0 : row.values.setTranslationY),
        });
      });
    },
    click(root) {
      return onUiThread(() => {
        const listener = root.values.setOnClickListener;
        listener?.spec.methods.onClick.body(listener, root);
      });
    },
    event(root, action, y) {
      return onUiThread(() => emit(root, action, y));
    },
  };
}
async function nativeOrderPage(h, runtime) {
  const page = openOrder(h);
  page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const root = page.items().find((row) => row.native)?.native;
  assert.ok(root);
  return { page, root };
}

module.exports = { toggleSymbol, bannerRuntime, dragRuntime, nativeOrderPage };
