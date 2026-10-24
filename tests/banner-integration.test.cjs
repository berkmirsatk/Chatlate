const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./helpers/plugin-runtime.cjs');
const { bannerRuntime } = require('./helpers/native-runtime.cjs');
const { bundledAssets } = require('./helpers/bundled-assets.cjs');

test('delayed asset reads cannot rebuild a closed banner or replace a newer settings session', async () => {
  const runtime = bannerRuntime();
  const assets = bundledAssets();
  const reads = [];
  let file;
  runtime.native.assets = {
    get(name) {
      file = assets.get(name);
      return {
        bytes: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
      };
    },
  };
  const h = harness({}, undefined, 'en', runtime.native);
  assert.equal(reads.length, 0, 'importing the asset does not read the image');
  h.page.items();
  assert.equal(reads.length, 1);
  h.page.onClose();
  h.page.items();
  assert.equal(reads.length, 2);
  reads[0].resolve(await file.bytes());
  await runtime.ready();
  assert.equal(runtime.decodedBanners.length, 0);
  reads[1].resolve(await file.bytes());
  await runtime.ready();
  assert.equal(runtime.decodedBanners.length, 1);
  assert.ok(h.page.items().some((row) => row.native?.values.setImportantForAccessibility === 1));
  h.page.onClose();
  runtime.flush();
});

test('an asset read failure restores settings controls and invalidates without retrying on every render', async () => {
  const runtime = bannerRuntime();
  let reads = 0;
  runtime.native.assets = {
    get: () => ({
      bytes: async () => {
        reads++;
        throw Error('Asset unavailable');
      },
    }),
  };
  const h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  await runtime.ready();
  assert.ok(h.page.items().some((row) => row.id === 'test'));
  assert.ok(h.page.invalidations > 0);
  assert.equal(reads, 1);
  h.page.onClose();
  runtime.flush();
});

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
  await runtime.ready();
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
  await runtime.ready();
  h.page.items();
  await runtime.ready();
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
  await runtime.ready();
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
  await runtime.ready();
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
  await runtime.ready();
  assert.equal(
    h.page.items().some((row) => row.native?.values.setImportantForAccessibility === 1),
    false,
  );
  assert.ok(h.page.items().some((row) => row.id === 'test'));
  assert.equal(attempts, 1);
  h.page.onClose();
  runtime.flush();
});
