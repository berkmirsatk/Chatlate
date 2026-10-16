const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness, ok } = require('./helpers/plugin-runtime.cjs');
const { bannerRuntime } = require('./helpers/native-runtime.cjs');

test('static settings banner preserves its aspect ratio and schedules no animation timers', async () => {
  const runtime = bannerRuntime();
  const longTimers = [];
  const h = harness({}, undefined, 'en', runtime.native, {
    setTimeout: (fn, ms) => {
      if (ms >= 900) longTimers.push(ms);
      return setTimeout(fn, ms);
    },
  });
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const header = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  const image = header.children[0].children[0];
  assert.equal(header.children.length, 2);
  assert.equal(image.values.setImageBitmap.localBanner, true);
  assert.equal(image.values.setAdjustViewBounds, true);
  assert.equal(image.values.setScaleType, 'FIT_CENTER');
  assert.deepEqual(image.values.setLayoutParams.args, [-1, -2]);
  assert.equal(header.values.setClipToOutline, false);
  assert.equal(header.values.setBackgroundColor, 'key_windowBackgroundWhite');
  assert.equal(
    h.page.items().find((row) => row.native?.values.setImportantForAccessibility === 1).native,
    header,
  );
  assert.equal(runtime.decodedBanners.length, 1);
  // The only long timer is the release-check deadline, not a banner animation.
  assert.deepEqual(longTimers, [10000]);
  h.page.onClose();
  runtime.flush();
  assert.equal(image.values.setImageDrawable, null);
});

test('closing settings discards queued banner creation and permits a fresh reopen', async () => {
  const runtime = bannerRuntime(),
    h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  h.page.onClose();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(
    h.page.items().filter((row) => row.native?.values.setImportantForAccessibility === 1).length,
    1,
  );
  h.page.onClose();
  runtime.flush();
});

test('static banner is reused while open and releases its image on close/unload', async () => {
  const runtime = bannerRuntime(),
    h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const header = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  const image = header.children[0].children[0];
  assert.equal(image.values.setImageBitmap, runtime.decodedBanners[0]);
  h.page.items();
  runtime.flush();
  assert.equal(runtime.decodedBanners.length, 1);
  h.page.onClose();
  runtime.flush();
  assert.equal(image.values.setImageDrawable, null);
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const reopened = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  assert.equal(runtime.decodedBanners.length, 2);
  runtime.unload();
  runtime.flush();
  assert.equal(reopened.children[0].children[0].values.setImageDrawable, null);
});

test('failed banner decoding leaves settings usable without repeated decode attempts', async () => {
  const runtime = bannerRuntime(),
    original = runtime.native.jvm.cls;
  let attempts = 0;
  runtime.native.jvm.cls = (name) =>
    name === 'android.graphics.BitmapFactory'
      ? {
          callStatic() {
            attempts++;
            return null;
          },
        }
      : original(name);
  const h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  runtime.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(
    h.page.items().some((row) => row.native?.values.setImportantForAccessibility === 1),
    false,
  );
  assert.ok(h.page.items().some((row) => row.id === 'test'));
  assert.equal(attempts, 1);
  h.page.onClose();
  runtime.flush();
});
