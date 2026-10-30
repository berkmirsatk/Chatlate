const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness, summaryValue, openOrder } = require('./helpers/plugin-runtime.cjs');
const { toggleSymbol, dragRuntime, nativeOrderPage } = require('./helpers/native-runtime.cjs');

test('provider expansion waits for native rows without displaying temporary fallback rows', async () => {
  const runtime = dragRuntime(),
    h = harness({}, undefined, 'en', runtime.native);
  h.page.items(); // starts preparing the list while collapsed
  openOrder(h);
  const pending = h.page.items();
  assert.equal(
    pending.some((row) => row.id?.startsWith('order.') || row.id?.startsWith('add.')),
    false,
  );
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const ready = h.page.items();
  assert.equal(ready.filter((row) => row.native).length, 1);
  const root = ready.find((row) => row.native).native;
  assert.equal(h.page.items().find((row) => row.native).native, root);
  h.page.onClose();
  runtime.flush();
});

test('inline provider editor uses native dragging and persists only a completed drop', async () => {
  const runtime = dragRuntime(),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  const { page, root } = await nativeOrderPage(h, runtime);
  assert.equal(page.title, 'Chatlate');
  assert.equal(page.transient, undefined);
  assert.equal(h.opened, undefined);
  assert.equal(runtime.drag(root, 1), true);
  assert.equal(runtime.queue.length, 0);
  runtime.flush();
  runtime.event(2, 0);
  assert.equal(root.children[1].values.setTranslationY, 0);
  assert.equal(root.children[0].values.setTranslationY, 56);
  assert.equal(root.values.setClipChildren, true);
  assert.equal(root.children[1].values.setAlpha, undefined);
  assert.equal(runtime.value, 'drag-installation:chatlate.google');
  runtime.event(3, 0);
  runtime.event(4, 0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(runtime.value, 'drag-installation:chatlate.yandex');
  assert.equal(h.storage.get('chatlate.fallback'), '["yandex","google"]');
  assert.equal(summaryValue(h), '1. Yandex → 2. Google');
  page.onClose();
  runtime.flush();
  assert.equal(root.values.setOnDragListener, undefined);
  for (const row of root.children) {
    assert.equal(row.children[0].values.setOnTouchListener, null);
    assert.equal(row.children.at(-1).values.setOnClickListener, null);
  }
});

test('cancelled native dragging restores visual order and does not save changes', async () => {
  const runtime = dragRuntime(),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  const { page, root } = await nativeOrderPage(h, runtime);
  const before = h.storage.get('chatlate.fallback');
  runtime.drag(root, 1);
  runtime.flush();
  runtime.event(2, 0);
  runtime.event(4, 0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(root.children[0].values.setTag, 'google');
  assert.equal(h.storage.get('chatlate.fallback'), before);
  page.onClose();
  runtime.flush();
});

test('failed native primary change rejects a dropped order and restores the saved selection', async () => {
  const runtime = dragRuntime(false),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  const { page, root } = await nativeOrderPage(h, runtime);
  const before = h.storage.get('chatlate.fallback');
  runtime.drag(root, 1);
  runtime.flush();
  runtime.event(3, 0);
  runtime.event(4, 0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(h.storage.get('chatlate.fallback'), before);
  assert.ok(page.items().some((row) => String(row.text).includes('Could not update Inugram')));
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(page.items().find((row) => row.native).native.children[0].values.setTag, 'google');
  page.onClose();
  runtime.flush();
});

test('closing an order page prevents queued drops or native builds from changing settings', async () => {
  const runtime = dragRuntime(),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  const { page, root } = await nativeOrderPage(h, runtime);
  const before = h.storage.get('chatlate.fallback');
  runtime.drag(root, 1);
  runtime.flush();
  runtime.event(3, 0);
  page.onClose();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(h.storage.get('chatlate.fallback'), before);
  const another = openOrder(h);
  another.items();
  another.onClose();
  runtime.flush();
  assert.equal(runtime.definitions, 2);
});

test('listener classes are reused across repeated opens rather than exhausting the engine class limit', async () => {
  const runtime = dragRuntime(),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  for (let index = 0; index < 4; index++) {
    const { page } = await nativeOrderPage(h, runtime);
    page.onClose();
    runtime.flush();
  }
  assert.equal(runtime.definitions, 2);
});

test('completed reorder preserves the native group and preserves rows during the summary refresh', async () => {
  const runtime = dragRuntime(),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  const { page, root } = await nativeOrderPage(h, runtime);
  const rows = [...root.children],
    refreshes = page.invalidations;
  runtime.drag(root, 1);
  runtime.event(3, 0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  assert.equal(page.items().find((row) => row.native).native, root);
  assert.deepEqual(root.children, rows);
  assert.ok(page.invalidations >= refreshes);
  assert.equal(root.children[1].values.setTranslationY, 0);
  assert.equal(root.children[0].values.setTranslationY, 56);
  // A second gesture uses the existing row's settled position, not its original child index.
  runtime.drag(root, 0);
  runtime.event(3, 0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  assert.equal(runtime.value, 'drag-installation:chatlate.google');
  assert.equal(page.items().find((row) => row.native).native, root);
  page.onClose();
  runtime.flush();
});

test('inline icons disable and re-enable providers without separate remove buttons or rebuilt views', async () => {
  const runtime = dragRuntime(),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  const { page, root } = await nativeOrderPage(h, runtime);
  assert.ok(
    page.items().every((row) => !row.id?.startsWith('remove.') && !row.id?.startsWith('add.')),
  );
  const icon = root.children[1].children[2];
  assert.equal(toggleSymbol(icon), '⊖');
  runtime.click(icon);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  assert.equal(h.storage.get('chatlate.fallback'), '["google"]');
  assert.equal(toggleSymbol(icon), '⊕');
  assert.equal(icon.values.setContentDescription, 'Enable Yandex');
  assert.equal(page.items().find((row) => row.native).native, root);
  assert.equal(root.children[0].children[2].values.setEnabled, false);
  runtime.click(root.children[0].children[2]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(h.storage.get('chatlate.fallback'), '["google"]');
  runtime.click(icon);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  assert.equal(h.storage.get('chatlate.fallback'), '["google","yandex"]');
  assert.equal(toggleSymbol(icon), '⊖');
  assert.equal(page.items().find((row) => row.native).native, root);
  page.onClose();
  runtime.flush();
});

test('disabling the primary promotes the next provider only after the native write succeeds', async () => {
  for (const writeSucceeds of [true, false]) {
    const runtime = dragRuntime(writeSucceeds),
      h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
    const { page, root } = await nativeOrderPage(h, runtime);
    const before = h.storage.get('chatlate.fallback');
    runtime.click(root.children[0].children[2]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    runtime.flush();
    if (writeSucceeds) {
      assert.equal(runtime.value, 'drag-installation:chatlate.yandex');
      assert.equal(h.storage.get('chatlate.fallback'), '["yandex"]');
      assert.equal(toggleSymbol(root.children[0].children[2]), '⊕');
    } else {
      assert.equal(h.storage.get('chatlate.fallback'), before);
      assert.ok(page.items().some((row) => String(row.text).includes('Could not update Inugram')));
    }
    assert.equal(page.items().find((row) => row.native).native, root);
    page.onClose();
    runtime.flush();
  }
});

test('provider label taps and small finger movements never change selection or priority', async () => {
  for (const backup of [false, true]) {
    const runtime = dragRuntime(),
      h = harness(
        backup ? { fallback: '["google","yandex"]' } : {},
        undefined,
        'en',
        runtime.native,
      );
    const { page, root } = await nativeOrderPage(h, runtime);
    const before = h.storage.get('chatlate.fallback');
    const label = root.children[1].children[1];
    assert.equal(label.values.setOnClickListener, undefined);
    assert.equal(label.values.setClickable, false);
    runtime.click(label);
    runtime.drag(root, 1);
    runtime.event(3, 60);
    await new Promise((resolve) => setTimeout(resolve, 5));
    runtime.flush();
    assert.equal(runtime.value, 'drag-installation:chatlate.google');
    assert.equal(h.storage.get('chatlate.fallback'), before);
    assert.equal(page.items().find((row) => row.native).native, root);
    page.onClose();
    runtime.flush();
  }
});

test('collapsing the provider section discards a queued completed drop', async () => {
  const runtime = dragRuntime(),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  const { root } = await nativeOrderPage(h, runtime);
  const before = h.storage.get('chatlate.fallback');
  runtime.drag(root, 1);
  runtime.event(3, 0);
  h.page
    .items()
    .find((row) => row.id === 'provider')
    .onClick();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(runtime.value, 'drag-installation:chatlate.google');
  assert.equal(h.storage.get('chatlate.fallback'), before);
  assert.ok(h.page.items().every((row) => !row.native));
  assert.equal(h.opened, undefined);
});

test('changing language refreshes expanded native icon labels', async () => {
  const runtime = dragRuntime(),
    h = harness({}, undefined, 'en', runtime.native);
  await nativeOrderPage(h, runtime);
  h.page
    .items()
    .find((row) => row.id === 'language')
    .onChange(1);
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const root = h.page.items().find((row) => row.native).native;
  assert.equal(root.children[1].children[2].values.setContentDescription, 'Etkinleştir: Yandex');
  h.page.onClose();
  runtime.flush();
});

test('custom icons stay centered and consistent while left handles drag and labels remain inert', async () => {
  const runtime = dragRuntime(true, true),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const header = h.page.items().find((item) => item.native).native;
  const arrow = header.children[2].children[0];
  assert.equal(arrow.values.setImageDrawable, undefined);
  runtime.click(header);
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  runtime.flush();
  const group = h.page.items().find((item) => item.native !== header && item.native)?.native;
  for (const [index, row] of group.children.entries()) {
    const [handle, label] = row.children,
      toggle = row.children.at(-1),
      grip = handle.children[0];
    assert.deepEqual(grip.values.setLayoutParams.args, [20, 20, 17]);
    assert.equal(grip.values.setImageBitmap.width, 20);
    assert.equal(
      grip.values.setImageBitmap.canvas.calls.filter((call) => call[0] === 'drawLine').length,
      3,
    );
    assert.equal(handle.values.setLayoutParams.args[0], 48);
    assert.equal(handle.padding, undefined);
    assert.ok(handle.values.setOnTouchListener);
    assert.equal(label.values.setOnTouchListener, undefined);
    assert.equal(label.values.setOnClickListener, undefined);
    // Google and Yandex are enabled; Microsoft is available to add.
    assert.equal(toggleSymbol(toggle), index < 2 ? '⊖' : '⊕');
  }
  runtime.drag(group, 1);
  runtime.event(3, 0);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  h.page.items();
  runtime.flush();
  assert.equal(runtime.value, 'drag-installation:chatlate.yandex');
  assert.equal(arrow.values.setRotation, 180);
  runtime.click(group.children[0].children[2]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  assert.equal(toggleSymbol(group.children[0].children[2]), '⊕');
  runtime.click(header);
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  runtime.flush();
  assert.equal(arrow.values.setRotation, 0);
  assert.deepEqual(arrow.values.setLayoutParams.args, [20, 20, 17]);
  assert.equal(arrow.values.setImageMatrix, undefined);
  h.page.onClose();
  runtime.flush();
  assert.equal(group.children[0].children[0].values.setOnTouchListener, null);
});

test('settings refreshes preserve an active drag and its pending drop', async () => {
  const runtime = dragRuntime(),
    h = harness({ fallback: '["google","yandex"]' }, undefined, 'en', runtime.native);
  const { page, root } = await nativeOrderPage(h, runtime);
  runtime.drag(root, 1);
  runtime.event(2, 0);
  page.items();
  runtime.flush();
  assert.equal(root.children[1].values.setTranslationY, 0);
  assert.equal(root.children[0].values.setTranslationY, 56);
  runtime.event(3, 0);
  page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  runtime.flush();
  assert.equal(runtime.value, 'drag-installation:chatlate.yandex');
  assert.equal(h.storage.get('chatlate.fallback'), '["yandex","google"]');
  page.onClose();
  runtime.flush();
});
