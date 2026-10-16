const assert = require('node:assert/strict');
const { test } = require('node:test');
const { code, harness, ok, run, replyWith, runWith } = require('./helpers/plugin-runtime.cjs');

test('Google batches formatting fragments and repeated text into one HTTP request', async () => {
  let calls = 0;
  const h = harness({}, async (url) => {
    calls++;
    const q = new URL(url).searchParams.get('q');
    assert.match(q, /⟦900000:0⟧/);
    return ok([[[q.replaceAll('Hello', 'Merhaba').replaceAll('world', 'dünya')]]]);
  });
  const a = run(h, [
    { text: 'Hello world', entities: [{ _: 'messageEntityBold', offset: 0, length: 5 }] },
  ]);
  const b = run(h, [{ text: 'Hello' }]);
  const [first, second] = await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(first[0].text, 'Merhaba dünya');
  assert.equal(first[0].entities[0].length, 7);
  assert.equal(second[0].text, 'Merhaba');
  await run(h, [{ text: 'world' }]);
  assert.equal(calls, 1);
});

test('Google 429 respects Retry-After, stops requests across chats, and persists cooldown', async () => {
  let calls = 0;
  const h = harness({}, async () => {
    calls++;
    return { ok: false, status: 429, headers: { get: () => '120' } };
  });
  await assert.rejects(run(h, [{ text: 'Hello' }]), /Translation service.*429.*120/);
  await assert.rejects(run(h, [{ text: 'Different message' }]), /Translation service.*429/);
  assert.equal(calls, 1);
  const until = h.storage.get('multi-translate.google-free.blockedUntil');
  assert.ok(Number(until) > Date.now() + 110000);
  const reloaded = harness({ 'google-free.blockedUntil': until });
  await assert.rejects(run(reloaded, [{ text: 'Reloaded' }]), /Translation service.*429/);
});

test('Google serializes different target-language batches with minimum spacing', async () => {
  const starts = [];
  let active = 0,
    maxActive = 0;
  const h = harness({}, async (url) => {
    starts.push(Date.now());
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 20));
    active--;
    return ok([[[new URL(url).searchParams.get('q')]]]);
  });
  const p = h.registered.get('multi.google-free');
  await Promise.all(
    ['tr', 'de'].map((to) =>
      p.translate({
        texts: [{ text: 'Hello' }],
        to,
        from: ['en'],
        signal: new AbortController().signal,
      }),
    ),
  );
  assert.equal(starts.length, 2);
  assert.equal(maxActive, 1);
  assert.ok(starts[1] - starts[0] >= 1750);
});

test('Google rejects corrupted batch markers without falling back to per-fragment requests', async () => {
  let calls = 0;
  const h = harness({}, async () => {
    calls++;
    return ok([[['broken merged text']]]);
  });
  await assert.rejects(
    run(h, [{ text: 'Hello world', entities: [{ _: 'messageEntityBold', offset: 0, length: 5 }] }]),
    /separators/,
  );
  assert.equal(calls, 1);
});

test('cancelling one Google subscriber keeps the shared request alive for another', async () => {
  let started, release;
  const began = new Promise((r) => (started = r)),
    gate = new Promise((r) => (release = r));
  const h = harness({}, async (url, opts) => {
    started();
    await gate;
    assert.equal(opts.signal.aborted, false);
    return ok([[['merhaba']]]);
  });
  const controller = new AbortController();
  const first = run(h, [{ text: 'Hello' }], controller.signal);
  const rejected = assert.rejects(first, /cancelled/);
  const second = run(h, [{ text: 'Hello' }]);
  await began;
  controller.abort();
  release();
  await rejected;
  assert.equal((await second)[0].text, 'merhaba');
});

test('Google cancellation before dispatch sends no HTTP request', async () => {
  const h = harness();
  const controller = new AbortController();
  const pending = run(h, [{ text: 'Hello' }], controller.signal);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  await new Promise((r) => setTimeout(r, 80));
});

test('Google sends the working browser headers and request parameters', async () => {
  const h = harness({}, async (url, opts) => {
    const u = new URL(url);
    assert.equal(u.hostname, 'translate.googleapis.com');
    assert.equal(u.searchParams.get('client'), 'gtx');
    assert.equal(u.searchParams.get('ie'), 'UTF-8');
    assert.ok(u.searchParams.getAll('dt').includes('ss'));
    assert.match(opts.headers['User-Agent'], /Android.*Chrome.*Mobile/);
    return ok([[['merhaba']]]);
  });
  assert.equal((await run(h, [{ text: 'Hello' }]))[0].text, 'merhaba');
});

test('network errors are localized without exposing low-level error details', async () => {
  for (const [language, message] of [
    ['en', /Could not connect/],
    ['tr', /bağlanılamadı/],
  ]) {
    const h = harness({ language }, async () => {
      throw new Error('internal connection error details');
    });
    await assert.rejects(run(h, [{ text: 'Hello' }]), message);
  }
});

test('invalid JSON from Google is reported as a localized response error', async () => {
  const h = harness({}, async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError('server html content');
    },
  }));
  await assert.rejects(run(h, [{ text: 'Hello' }]), /Invalid translation response/);
});

test('Yandex batches fragments with form encoding and preserves Telegram entities', async () => {
  let calls = 0;
  const h = harness({}, async (url, options) => {
    calls++;
    const u = new URL(url);
    assert.equal(u.hostname, 'translate.yandex.net');
    assert.equal(u.searchParams.get('srv'), 'android');
    assert.equal(u.searchParams.get('lang'), 'tr');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['content-type'], 'application/x-www-form-urlencoded');
    assert.deepEqual(new URLSearchParams(options.body).getAll('text'), ['Hello', 'world']);
    return ok({ code: 200, text: ['Merhaba', 'dünya'] });
  });
  const result = await runWith(h, 'yandex-free', [
    {
      text: 'Hello world https://example.com',
      entities: [
        { _: 'messageEntityBold', offset: 0, length: 5 },
        { _: 'messageEntityUrl', offset: 12, length: 19 },
      ],
    },
  ]);
  assert.equal(result[0].text, 'Merhaba dünya https://example.com');
  assert.equal(result[0].entities[0].length, 7);
  assert.equal(result[0].entities[1].offset, 14);
  assert.equal(calls, 1);
  await runWith(h, 'yandex-free', [{ text: 'world' }]);
  assert.equal(calls, 1);
});

test('provider cooldowns are independent and persisted', async () => {
  const h = harness({}, async (url) =>
    url.includes('yandex') ? ok({ code: 429 }) : ok([[['Merhaba']]]),
  );
  await assert.rejects(runWith(h, 'yandex-free', [{ text: 'Hello' }]), /429/);
  assert.ok(Number(h.storage.get('multi-translate.yandex-free.blockedUntil')) > Date.now());
  assert.equal((await run(h, [{ text: 'Hello' }]))[0].text, 'Merhaba');
});

test('excessive source text, message counts and entity counts are rejected before HTTP', async () => {
  const h = harness();
  for (const texts of [
    [{ text: 'x'.repeat(18001) }],
    Array.from({ length: 101 }, () => ({ text: 'hello' })),
    [
      {
        text: 'hello',
        entities: Array.from({ length: 1001 }, () => ({
          _: 'messageEntityBold',
          offset: 0,
          length: 1,
        })),
      },
    ],
  ]) {
    await assert.rejects(run(h, texts), /Too much text/);
  }
});

test('malformed Google rows and excessive translated batches are rejected', async () => {
  for (const data of [[[null]], [[[{ secret: 'untrusted' }]]]]) {
    const h = harness({}, async () => ok(data));
    await assert.rejects(run(h, [{ text: 'Hello' }]), /Invalid translation response/);
  }
  const h = harness({}, async () =>
    ok({ code: 200, text: ['a'.repeat(50000), 'b'.repeat(50000), 'c'.repeat(50000)] }),
  );
  await assert.rejects(
    runWith(h, 'yandex-free', [
      {
        text: 'Hello world again',
        entities: [
          { _: 'messageEntityBold', offset: 0, length: 5 },
          { _: 'messageEntityItalic', offset: 6, length: 5 },
        ],
      },
    ]),
    /Invalid translation response/,
  );
});

test('HTTP redirects are disabled and do not send source text to a new host', async () => {
  let calls = 0;
  const h = harness({ fallback: '1' }, async (url, options) => {
    calls++;
    assert.equal(options.redirect, 'manual');
    return { ok: false, status: 302, headers: { get: () => 'https://untrusted.example/' } };
  });
  await assert.rejects(run(h, [{ text: 'Private text' }]), /HTTP 302/);
  assert.equal(calls, 1);
});

test('untrusted Retry-After and saved cooldowns cannot disable a provider indefinitely', async () => {
  const h = harness({}, async () => ({
    ok: false,
    status: 429,
    headers: { get: () => '9999999999999999999999999' },
  }));
  await assert.rejects(run(h, [{ text: 'Hello' }]), /429/);
  assert.ok(
    Number(h.storage.get('multi-translate.google-free.blockedUntil')) <= Date.now() + 900000,
  );
  const reloaded = harness({ 'google-free.blockedUntil': 'Infinity' }, replyWith(['Merhaba']));
  assert.equal((await run(reloaded, [{ text: 'Hello' }]))[0].text, 'Merhaba');
});
