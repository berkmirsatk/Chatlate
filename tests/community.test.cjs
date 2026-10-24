const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness, ok } = require('./helpers/plugin-runtime.cjs');
const { bannerRuntime } = require('./helpers/native-runtime.cjs');

test('banner expands localized inline links with host icons and never opens a popup', async () => {
  const runtime = bannerRuntime(),
    urls = [];
  runtime.native.openUrl = (url) => urls.push(url);
  runtime.native.icons = { common: (name) => ({ hostIcon: name }) };
  const h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  await runtime.ready();
  const header = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  assert.equal(
    h.page.items().some((row) => row.id === 'community.channel'),
    false,
  );
  runtime.click(header);
  await new Promise((resolve) => setTimeout(resolve, 5));
  let rows = h.page.items();
  runtime.flush();
  const index = rows.findIndex((row) => row.native === header);
  const link = rows[index + 1];
  assert.equal(link.id, 'community.channel');
  assert.equal(link.text, 'Channel');
  assert.equal(link.value, '@Plumgins');
  assert.equal(link.icon.hostIcon, 'channel');
  assert.equal(urls.length, 0);
  assert.equal(rows[index + 2].id, 'community.group');
  assert.equal(rows[index + 2].value, '@PlumginsChat');
  rows[index + 2].onClick();
  assert.deepEqual(urls, ['https://t.me/PlumginsChat']);
  urls.length = 0;
  assert.equal(header.children[0].children[1].values.setRotation, 180);
  assert.equal(header.values.setBackground, undefined);
  assert.equal(header.values.setClipToOutline, false);
  assert.equal(runtime.menus.length, 0);
  assert.equal(h.opened, undefined);
  link.onClick();
  assert.deepEqual(urls, ['https://t.me/Plumgins']);
  h.page
    .items()
    .find((row) => row.id === 'language')
    .onChange(1);
  assert.equal(h.page.items().find((row) => row.id === 'community.channel').text, 'Kanal');
  runtime.click(header);
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  runtime.flush();
  assert.equal(
    h.page.items().some((row) => row.id === 'community.channel'),
    false,
  );
  assert.equal(header.children[0].children[1].values.setRotation, 0);
  assert.equal(header.values.setBackgroundColor, 'key_windowBackgroundWhite');
  assert.equal(header.values.setClipToOutline, false);
  h.page.onClose();
  runtime.flush();
  assert.equal(header.values.setOnClickListener, null);
});

test('community profiles load lazily and use the real title and account-scoped avatar', async () => {
  const runtime = bannerRuntime(),
    lookups = [],
    avatars = [];
  const peer = { _: 'channel', title: 'plumgins', id: 123 };
  runtime.native.account = () => ({
    id: 2,
    resolvePeer: async (username) => {
      lookups.push(username);
      return { _: 'inputPeerChannel', channel_id: 123 };
    },
    getPeer: () => peer,
  });
  runtime.native.utils = {
    peers: {
      getMarkedPeerId: (value) => {
        assert.equal(value, peer);
        return -1000000000123;
      },
    },
  };
  runtime.native.icons = {
    common: (name) => ({ hostIcon: name }),
    avatar: (id, options) => {
      avatars.push([id, options.account]);
      return { avatar: id, account: options.account };
    },
  };
  const h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  await runtime.ready();
  const header = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  assert.equal(lookups.length, 0);
  runtime.click(header);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(h.page.items().find((row) => row.id === 'community.channel').text, 'Channel');
  await new Promise((resolve) => setTimeout(resolve, 5));
  const link = h.page.items().find((row) => row.id === 'community.channel');
  assert.equal(link.text, 'plumgins');
  assert.equal(link.value, '@Plumgins');
  assert.equal(link.icon.avatar, -1000000000123);
  assert.equal(link.icon.account, 2);
  h.page.items();
  h.page.items();
  assert.deepEqual(lookups, ['@Plumgins', '@PlumginsChat']);
  assert.deepEqual(avatars, [
    [-1000000000123, 2],
    [-1000000000123, 2],
  ]);
  h.page.onClose();
  runtime.flush();
});

test('community photo changes refresh visible rows and stop after closing', async () => {
  const runtime = bannerRuntime();
  let refresh,
    photo = 10;
  const avatars = [];
  runtime.native.account = () => ({
    id: 0,
    resolvePeer: async (username) => ({ username }),
    getPeer: (input) => ({ title: input.username, id: 123, photo: { photo_id: photo, dc_id: 4 } }),
  });
  runtime.native.utils = { peers: { getMarkedPeerId: () => -1000000000123 } };
  runtime.native.icons = {
    avatar: () => {
      avatars.push(photo);
      return { photo };
    },
  };
  const h = harness({}, undefined, 'en', runtime.native, {
    setTimeout: (callback, delay) => {
      if (delay === 10000) {
        refresh = callback;
        return 987654;
      }
      return setTimeout(callback, delay);
    },
  });
  h.page.items();
  await runtime.ready();
  const header = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  runtime.click(header);
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(h.page.items().find((row) => row.id === 'community.group').icon.photo, 10);
  const initial = h.page.invalidations;
  photo = 20;
  refresh();
  assert.ok(h.page.invalidations > initial);
  assert.equal(h.page.items().find((row) => row.id === 'community.channel').icon.photo, 20);
  assert.equal(h.page.items().find((row) => row.id === 'community.group').icon.photo, 20);
  h.page.onClose();
  runtime.flush();
  const closed = h.page.invalidations;
  photo = 30;
  refresh();
  assert.equal(h.page.invalidations, closed);
  assert.deepEqual(avatars, [10, 10, 20, 20]);
});

test('denied community lookups preserve generic icons without retrying every render', async () => {
  const runtime = bannerRuntime();
  let lookups = 0;
  runtime.native.account = () => ({
    id: 0,
    resolvePeer() {
      lookups++;
      throw Error('Permission denied');
    },
  });
  runtime.native.icons = { common: (name) => ({ hostIcon: name }) };
  const h = harness({}, undefined, 'tr', runtime.native);
  h.page.items();
  await runtime.ready();
  const header = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  runtime.click(header);
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const link = h.page.items().find((row) => row.id === 'community.channel');
  assert.equal(link.text, 'Kanal');
  assert.equal(link.icon.hostIcon, 'channel');
  h.page.items();
  h.page.items();
  assert.equal(lookups, 2);
  h.page.onClose();
  runtime.flush();
});

test('closed community sections ignore late profile results', async () => {
  const runtime = bannerRuntime();
  let finish,
    reads = 0;
  runtime.native.account = () => ({
    id: 0,
    resolvePeer: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    getPeer: () => {
      reads++;
      return { title: 'plumgins' };
    },
  });
  const h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  await runtime.ready();
  const header = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  runtime.click(header);
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(typeof finish, 'function');
  h.page.onClose();
  runtime.flush();
  const invalidations = h.page.invalidations;
  finish({ _: 'inputPeerChannel', channel_id: 123 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(reads, 0);
  assert.equal(h.page.invalidations, invalidations);
});

test('community avatars stay isolated when the active account changes', async () => {
  const runtime = bannerRuntime();
  let slot = 0;
  const requests = [];
  runtime.native.account = () => {
    const id = slot;
    return {
      id,
      resolvePeer: async (username) => {
        requests.push([id, username]);
        return { _: 'inputPeerChannel', channel_id: 123 };
      },
      getPeer: () => ({ title: 'plumgins ' + id, id: 123 }),
    };
  };
  runtime.native.utils = { peers: { getMarkedPeerId: () => -1000000000123 } };
  runtime.native.icons = {
    common: (name) => ({ hostIcon: name }),
    avatar: (id, options) => ({ avatar: id, account: options.account }),
  };
  const h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  await runtime.ready();
  const header = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  runtime.click(header);
  await new Promise((resolve) => setTimeout(resolve, 5));
  h.page.items();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(h.page.items().find((row) => row.id === 'community.channel').icon.account, 0);
  slot = 1;
  assert.equal(
    h.page.items().find((row) => row.id === 'community.channel').icon.hostIcon,
    'channel',
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  const link = h.page.items().find((row) => row.id === 'community.channel');
  assert.equal(link.icon.account, 1);
  assert.equal(link.text, 'plumgins 1');
  assert.deepEqual(requests, [
    [0, '@Plumgins'],
    [0, '@PlumginsChat'],
    [1, '@Plumgins'],
    [1, '@PlumginsChat'],
  ]);
  h.page.onClose();
  runtime.flush();
});

test('inline community rows remain usable without optional host icons', async () => {
  const runtime = bannerRuntime(),
    urls = [];
  runtime.native.openUrl = (url) => urls.push(url);
  const h = harness({}, undefined, 'tr', runtime.native);
  h.page.items();
  await runtime.ready();
  const header = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  runtime.click(header);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const link = h.page.items().find((row) => row.id === 'community.channel');
  assert.equal(link.text, 'Kanal');
  assert.equal(link.icon, undefined);
  link.onClick();
  assert.deepEqual(urls, ['https://t.me/Plumgins']);
  h.page.onClose();
  runtime.flush();
});

test('closing settings cancels queued expansion and reopening starts collapsed', async () => {
  const runtime = bannerRuntime(),
    h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  await runtime.ready();
  let header = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  runtime.click(header);
  h.page.onClose();
  await runtime.ready();
  h.page.items();
  await runtime.ready();
  assert.equal(
    h.page.items().some((row) => row.id === 'community.channel'),
    false,
  );
  header = h.page
    .items()
    .find((row) => row.native?.values.setImportantForAccessibility === 1).native;
  runtime.click(header);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(h.page.items().some((row) => row.id === 'community.channel'));
  h.page.onClose();
  runtime.flush();
  h.page.items();
  await runtime.ready();
  assert.equal(
    h.page.items().some((row) => row.id === 'community.channel'),
    false,
  );
  h.page.onClose();
  runtime.flush();
});

test('settings controls remain available while the banner loads', async () => {
  const runtime = bannerRuntime(),
    h = harness({}, undefined, 'en', runtime.native);
  assert.ok(h.page.items().some((row) => row.id === 'test'));
  await runtime.ready();
  const rows = h.page.items(),
    header = rows[0].native;
  assert.equal(header.values.setContentDescription, 'Chatlate');
  assert.ok(rows.some((row) => row.id === 'test'));
  assert.equal(h.page.items()[0].native, header);
  h.page.onClose();
  runtime.flush();
  assert.ok(h.page.items().some((row) => row.id === 'test'));
  await runtime.ready();
  assert.equal(h.page.items()[0].native.values.setContentDescription, 'Chatlate');
  h.page.onClose();
  runtime.flush();
});

test('support opens immediately with branded rows and copies only the USDT TON address on tap', () => {
  const address = 'UQDMLf2PHHFTeMKqdpNS0OgGLh8_vl31bTt80md0kvG2J2Br';
  for (const language of ['en', 'tr']) {
    const copied = [],
      urls = [],
      toasts = [];
    const h = harness({ language }, undefined, 'en', {
      icons: { svg: (source) => ({ svg: source }), common: (name) => ({ hostIcon: name }) },
      openUrl: (url) => urls.push(url),
      clipboard: { write: (value) => copied.push(value) },
    });
    h.ui.toast = (text) => toasts.push(text);
    h.page
      .items()
      .find((row) => row.id === 'community.donate')
      .onClick();
    const page = h.opened,
      items = page.items();
    assert.equal(page.transient, true);
    assert.equal(page.title, language === 'tr' ? 'Geliştirmeyi destekle' : 'Support development');
    assert.equal(page.invalidations, 0);
    assert.ok(items.every((row) => !row.native));
    const coffee = items.find((row) => row.id === 'donation.coffee');
    const crypto = items.find((row) => row.id === 'donation.copy');
    assert.ok(coffee.icon.svg.includes('viewBox="0 0 35 50"'));
    assert.ok(crypto.icon.svg.includes('<ellipse'));
    assert.equal(coffee.text, 'Buy Me a Coffee');
    assert.equal(coffee.subtitle, undefined);
    assert.equal(crypto.text, 'USDT');
    assert.equal(crypto.subtitle, language === 'tr' ? 'TON ağı' : 'TON network');
    assert.equal(crypto.value, language === 'tr' ? 'Adresi kopyala' : 'Copy address');
    assert.ok(items.every((row) => !JSON.stringify(row).includes(address)));
    assert.deepEqual(copied, []);
    assert.deepEqual(urls, []);
    coffee.onClick();
    assert.deepEqual(urls, ['https://buymeacoffee.com/berkmirsatk']);
    crypto.onClick();
    assert.deepEqual(copied, [address]);
    assert.equal(toasts.at(-1), language === 'tr' ? 'Adres kopyalandı.' : 'Address copied.');
    assert.ok(
      items.some((row) =>
        String(row.text).includes(language === 'tr' ? 'Yalnızca TON' : 'only USDT'),
      ),
    );
    page.onClose();
    coffee.onClick();
    crypto.onClick();
    assert.equal(copied.length, 1);
    assert.equal(urls.length, 1);
  }
});

test('closed support pages cannot copy addresses or open links after settings closes', () => {
  const h = harness({}, undefined, 'en', {
    clipboard: {
      write: () => {
        throw Error('stale copy');
      },
    },
    openUrl: () => {
      throw Error('stale URL');
    },
  });
  h.page
    .items()
    .find((row) => row.id === 'community.donate')
    .onClick();
  const rows = h.opened.items();
  h.page.onClose();
  for (const row of rows) row.onClick?.();
});

test('support retains native icon fallbacks and reports denied clipboard writes', () => {
  const h = harness({}, undefined, 'en', {
    icons: { common: (name) => ({ hostIcon: name }) },
  });
  const toasts = [];
  h.ui.toast = (text) => toasts.push(text);
  h.page
    .items()
    .find((row) => row.id === 'community.donate')
    .onClick();
  const rows = h.opened.items();
  assert.equal(rows.find((row) => row.id === 'donation.coffee').icon.hostIcon, 'link');
  const crypto = rows.find((row) => row.id === 'donation.copy');
  assert.equal(crypto.icon.hostIcon, 'copy');
  crypto.onClick();
  assert.match(toasts.at(-1), /Could not copy/);
  h.opened.onClose();
  h.page.onClose();
});

test('community menu keeps GitHub and permanent version history above support as native rows', async () => {
  const runtime = bannerRuntime(),
    urls = [];
  runtime.native.icons = {
    common: (name) => ({ hostIcon: name }),
    svg: (source) => ({ svg: source }),
  };
  runtime.native.utils = { md: (text) => ({ text, entities: [] }) };
  runtime.native.openUrl = (url) => urls.push(url);
  const h = harness({}, undefined, 'en', runtime.native);
  h.page.items();
  await runtime.ready();
  const banner = h.page.items()[0].native;
  assert.equal(
    h.page.items().some((row) => row.id === 'release.notes'),
    false,
  );
  runtime.click(banner);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const menu = h.page
    .items()
    .filter((row) => row.id?.startsWith('community.') || row.id === 'release.notes');
  assert.deepEqual(
    Array.from(menu, (row) => row.id),
    [
      'community.channel',
      'community.group',
      'community.github',
      'release.notes',
      'community.donate',
    ],
  );
  const github = menu[2],
    history = menu[3];
  assert.equal(github.value, undefined);
  assert.ok(github.icon.svg);
  assert.ok(history.icon.svg);
  github.onClick();
  assert.deepEqual(urls, ['https://github.com/berkmirsatk/Chatlate']);
  history.onClick();
  assert.equal(h.opened.title, 'Version history');
  await new Promise((resolve) => setTimeout(resolve, 5));
  // The shared plugin harness models the repository as private (HTTP 404).
  assert.match(h.opened.items()[0].text, /Could not load release notes/);
  assert.equal(h.opened.items()[1].id, 'release.notes.retry');
  h.opened.onClose();
  h.page.onClose();
  runtime.flush();
});
