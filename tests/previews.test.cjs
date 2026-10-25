const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./helpers/plugin-runtime.cjs');
const { bannerRuntime, dragRuntime, nativeOrderPage } = require('./helpers/native-runtime.cjs');

test('order summary delegates overflow scrolling to Android and expands the provider editor', async () => {
  const runtime = dragRuntime(true, true),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const row = h.page.items().find((item) => item.native)?.native;
  assert.ok(row);
  assert.equal(row.values.setClipChildren, true);
  const summary = row.children[1];
  assert.equal(summary.values.setEllipsize, 'MARQUEE');
  assert.equal(summary.values.setGravity, 21);
  assert.deepEqual(
    summary.calls.find((call) => call[0] === 'setTextSize'),
    ['setTextSize', 0, 16],
  );
  assert.deepEqual(row.children[0].values.setLayoutParams.args, [-2, 56]);
  assert.deepEqual(summary.values.setLayoutParams.args, [0, 56, 1]);
  assert.equal(summary.values.setMarqueeRepeatLimit, -1);
  assert.equal(summary.values.setSelected, false);
  function resize(width) {
    runtime.onUiThread(() => {
      summary.width = width;
      const listener = summary.values.addOnLayoutChangeListener;
      listener.spec.methods.onLayoutChange.body(listener, summary);
    });
  }
  resize(100);
  assert.equal(summary.values.setSelected, true);
  assert.equal(summary.values.setHorizontalFadingEdgeEnabled, true);
  // Scrolling text starts from its beginning instead of mid-way.
  assert.equal(summary.values.setGravity, 19);
  resize(400);
  assert.equal(summary.values.setSelected, false);
  assert.equal(summary.values.setHorizontalFadingEdgeEnabled, false);
  assert.equal(summary.values.setGravity, 21);
  resize(100);
  assert.equal(summary.values.setSelected, true);
  assert.equal(summary.values.setContentDescription, '1. Google → 2. Yandex');
  assert.equal(summary.values.setText, '1. Google → 2. Yandex');
  runtime.click(row);
  assert.equal(h.opened, undefined);
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  runtime.flush();
  assert.equal(h.opened, undefined);
  assert.equal(row.children[0].values.setText, 'Translation provider');
  assert.equal(row.children[0].values.setTextSize, 18);
  assert.equal(row.values.setPadding, 0);
  assert.deepEqual(row.padding, [0, 0, 0, 0]);
  assert.deepEqual(row.children[0].padding, [23, 0, 0, 0]);
  assert.equal(row.values.setForegroundGravity, 119);
  assert.equal(row.values.setClipToOutline, false);
  assert.equal(row.values.setBackground, undefined);
  assert.equal(row.values.setBackgroundColor, 'key_windowBackgroundWhite');
  const arrow = row.children[2].children[0],
    bitmap = arrow.values.setImageBitmap;
  assert.equal(arrow.values.setRotation, 180);
  assert.equal(row.children[2].values.setLayoutParams.args[0], 48);
  assert.deepEqual(arrow.values.setLayoutParams.args, [20, 20, 17]);
  assert.equal(bitmap.width, 20);
  assert.equal(bitmap.height, 20);
  const circle = bitmap.canvas.calls.find((call) => call[0] === 'drawCircle');
  assert.deepEqual(circle.slice(1, 4), [10, 10, 9]);
  const path = bitmap.canvas.values.drawPath;
  assert.deepEqual(
    path.calls.map((call) => call.slice(0, 3)),
    [
      ['moveTo', 6, 8],
      ['lineTo', 10, 12],
      ['lineTo', 14, 8],
    ],
  );
  assert.equal(circle[4].values.setStrokeWidth, 1.5);
  const providerGroup = h.page.items().find((item) => item.native && item.native !== row).native;
  for (const providerRow of providerGroup.children) {
    const slot = providerRow.children[2],
      symbol = slot.children[0],
      providerBitmap = symbol.values.setImageBitmap;
    const providerCircle = providerBitmap.canvas.calls.find((call) => call[0] === 'drawCircle');
    assert.deepEqual(providerCircle.slice(1, 4), circle.slice(1, 4));
    assert.equal(providerCircle[4].values.setStrokeWidth, circle[4].values.setStrokeWidth);
    assert.equal(providerCircle[4].values.setColor, circle[4].values.setColor);
    assert.deepEqual(symbol.values.setLayoutParams.args, arrow.values.setLayoutParams.args);
    assert.equal(slot.values.setLayoutParams.args[0], 48);
  }
  runtime.unload();
  runtime.flush();
  assert.equal(summary.values.setSelected, false);
  assert.equal(row.values.setOnClickListener, null);
  assert.equal(
    summary.values.removeOnLayoutChangeListener,
    summary.values.addOnLayoutChangeListener,
  );
});

test('contained dragging clamps boxes to the list boundary and cancels without detaching them', async () => {
  const runtime = dragRuntime(),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  const { page, root } = await nativeOrderPage(h, runtime);
  const original = [...root.children];
  runtime.drag(root, 1);
  runtime.event(2, -10000);
  assert.equal(root.children[1].values.setTranslationY, 0);
  assert.equal(root.children[0].values.setTranslationY, 56);
  assert.equal(root.values.setClipToPadding, true);
  assert.equal(root.values.setBackgroundColor, 'key_windowBackgroundWhite');
  assert.equal(root.values.setClipToOutline, false);
  assert.deepEqual(root.children, original);
  runtime.event(4, -10000);
  for (const [index, box] of root.children.entries())
    assert.equal(box.values.setTranslationY, index * 56);
  assert.equal(runtime.value, 'drag-installation:chatlate.google');
  page.onClose();
  runtime.flush();
});

test('summary updates reuse the header and keep expansion on the same page', async () => {
  const runtime = dragRuntime(true, true),
    h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const original = h.page.items().find((item) => item.native).native;
  runtime.click(original);
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const root = h.page.items().find((item) => item.native?.children[0]?.children.length).native;
  runtime.click(root.children[1].children[2]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  runtime.drag(root, 1);
  runtime.event(3, 0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  h.page.items();
  runtime.flush();
  assert.equal(h.page.items().find((item) => item.native).native, original);
  assert.equal(original.children[1].values.setSelected, true);
  assert.equal(original.children[1].values.setContentDescription, '1. Yandex → 2. Google');
  assert.equal(runtime.definitions, 3);
  assert.equal(h.opened, undefined);
  runtime.click(original);
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  runtime.flush();
  assert.equal(h.page.items().filter((item) => item.native).length, 1);
  assert.equal(original.children[2].children[0].values.setRotation, 0);
  assert.equal(root.children[1].children[0].values.setOnClickListener, undefined);
  runtime.unload();
  runtime.flush();
});

test('SDK previews scroll only when narrow, stop when wide, and never change another page', async () => {
  const runtime = bannerRuntime(),
    cls = runtime.native.jvm.cls,
    hooks = new Map(),
    disposed = [];
  class NativeMap {
    constructor() {
      this.entries = new Map();
    }
    call(method, ...args) {
      if (method === 'put') return this.entries.set(args[0], args[1]);
      if (method === 'containsKey') return this.entries.has(args[0]);
      if (method === 'get') return this.entries.get(args[0]);
      if (method === 'remove') return this.entries.delete(args[0]);
      if (method === 'clear') return this.entries.clear();
      if (method === 'entrySet')
        return {
          call: () => {
            const entries = [...this.entries],
              iterator = {
                call: (name) =>
                  name === 'hasNext'
                    ? entries.length > 0
                    : {
                        call: (key) =>
                          key === 'getKey' ? iterator.current[0] : iterator.current[1],
                      },
              };
            const call = iterator.call;
            iterator.call = (name) => {
              if (name === 'next') iterator.current = entries.shift();
              return call(name);
            };
            return iterator;
          },
        };
      throw Error(method);
    }
  }
  runtime.native.jvm.cls = (name) => {
    if (name === 'java.util.WeakHashMap') return NativeMap;
    if (name === 'android.view.View$MeasureSpec')
      return {
        getStaticField: () => 1073741824,
        callStatic: (_method, size, mode) => ({ size, mode }),
      };
    if (
      [
        'desu.inugram.ui.settings.PluginSettingsActivity',
        'desu.inugram.ui.settings.PluginSettingCell',
        'desu.inugram.ui.settings.ButtonCellFactory',
      ].includes(name)
    )
      return { getDeclaredMethod: (method) => method };
    return cls(name);
  };
  runtime.native.xposed = {
    hookMethod: (method, spec) => {
      hooks.set(method, spec.after);
      return () => disposed.push(method);
    },
  };
  const h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  await runtime.ready();
  const banner = h.page.items()[0].native;
  assert.equal(hooks.size, 3);
  const row = (value) => ({ getField: (key) => (key === 'textValue' ? value : null) });
  const own = row('Card · Crypto'),
    foreign = row('Other plugin value');
  const items = (values) => ({
    call: (method, index) => (method === 'size' ? values.length : values[index]),
  });
  hooks.get('fillItems')({ throwable: null, args: [items([foreign])] });
  const text = (initial) => ({
    value: initial,
    width: 0,
    height: 20,
    flags: {},
    call(method, ...args) {
      if (method === 'getPaint') return { call: (_method, value) => value.length * 8 };
      if (method === 'getText') return this.value;
      if (method === 'getMeasuredHeight') return this.height;
      if (method === 'measure') {
        this.width = args[0].size;
        this.height = args[1].size;
        return;
      }
      if (method === 'setText') {
        this.value = args[0];
        return;
      }
      this.flags[method] = args[0] ?? true;
    },
  });
  const fields = {
    textView: text('Support development'),
    subtitleView: text(''),
    valueTextView: text('Card · Crypto'),
    valueSpoilersTextView: text(''),
    imageView: { call: () => 0 },
    offsetFromImage: 58,
    leftPadding: 23,
  };
  const cell = { width: 300, getField: (key) => fields[key], call: () => cell.width };
  hooks.get('bindView')({ throwable: null, args: [cell, foreign] });
  assert.equal(fields.valueTextView.flags.setVisibility, undefined);
  const marker = {
    getField: (key) => (key === 'view' ? { call: (_method, view) => view === banner } : null),
  };
  hooks.get('fillItems')({ throwable: null, args: [items([marker, own])] });
  hooks.get('bindView')({ throwable: null, args: [cell, own] });
  assert.equal(fields.valueTextView.flags.setVisibility, 8);
  assert.equal(fields.valueSpoilersTextView.value, 'Card · Crypto');
  const measure = () => hooks.get('onMeasure')({ throwable: null, thisObject: cell });
  measure();
  assert.equal(fields.valueSpoilersTextView.flags.setScrollNonFitText, true);
  assert.equal(fields.textView.width, 'Support development'.length * 8);
  cell.width = 600;
  measure();
  assert.equal(fields.valueSpoilersTextView.flags.setScrollNonFitText, false);
  assert.equal(fields.valueSpoilersTextView.flags.resetScrolling, true);
  cell.width = 280;
  measure();
  assert.equal(fields.valueSpoilersTextView.flags.setScrollNonFitText, true);
  hooks.get('bindView')({ throwable: null, args: [cell, foreign] });
  assert.equal(fields.valueTextView.flags.setVisibility, 0);
  assert.equal(fields.valueTextView.value, 'Other plugin value');
  assert.equal(fields.valueSpoilersTextView.flags.setVisibility, 8);
  hooks.get('bindView')({ throwable: null, args: [cell, own] });
  h.page.onClose();
  runtime.flush();
  assert.equal(fields.valueTextView.value, 'Card · Crypto');
  assert.equal(fields.valueTextView.flags.setVisibility, 0);
  assert.equal(fields.valueSpoilersTextView.flags.setScrollNonFitText, false);
  assert.deepEqual(disposed, ['fillItems', 'bindView', 'onMeasure']);
});
