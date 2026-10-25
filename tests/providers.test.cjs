const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  googleReply,
  googleText,
  googleTexts,
  harness,
  ok,
  run,
  replyWith,
  runWith,
} = require('./helpers/plugin-runtime.cjs');

test('Google batches formatting fragments and repeated text into one HTTP request', async () => {
  const batches = [];
  const h = harness({}, async (_url, options) => {
    const texts = googleTexts(options);
    batches.push(texts);
    return googleReply(
      texts.map((q) => q.replaceAll('Hello', 'Merhaba').replaceAll('world', 'dünya')),
    );
  });
  const a = run(h, [
    { text: 'Hello world', entities: [{ _: 'messageEntityBold', offset: 0, length: 5 }] },
  ]);
  const b = run(h, [{ text: 'Hello' }]);
  const [first, second] = await Promise.all([a, b]);
  assert.deepEqual(batches, [['Hello', 'world']]);
  assert.equal(first[0].text, 'Merhaba dünya');
  assert.equal(first[0].entities[0].length, 7);
  assert.equal(second[0].text, 'Merhaba');
  await run(h, [{ text: 'world' }]);
  assert.equal(batches.length, 1);
});

test('Google 429 respects Retry-After, stops requests across chats, and persists cooldown', async () => {
  let calls = 0;
  const h = harness({}, async () => {
    calls++;
    return { ok: false, status: 429, headers: { get: () => '120' } };
  });
  await assert.rejects(run(h, [{ text: 'Hello' }]), /limiting requests.*120 seconds/);
  await assert.rejects(run(h, [{ text: 'Different message' }]), /limiting requests/);
  assert.equal(calls, 1);
  const until = h.storage.get('chatlate.google.blockedUntil');
  assert.ok(Number(until) > Date.now() + 110000);
  const reloaded = harness({ 'google.blockedUntil': until });
  await assert.rejects(run(reloaded, [{ text: 'Reloaded' }]), /limiting requests/);
});

test('Google serializes different target-language batches with minimum spacing', async () => {
  const starts = [];
  let active = 0,
    maxActive = 0;
  const h = harness({}, async (_url, options) => {
    starts.push(Date.now());
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 20));
    active--;
    return googleReply([googleText(options)]);
  });
  const p = h.registered.get('chatlate.google');
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

test('Google rejects a reply that does not match the requested texts', async () => {
  for (const reply of [
    [['only one', 'en']],
    [
      ['one', 'en'],
      [null, 'en'],
    ],
    { error: true },
  ]) {
    let calls = 0;
    const h = harness({}, async () => {
      calls++;
      return ok(reply);
    });
    await assert.rejects(
      run(h, [
        { text: 'Hello world', entities: [{ _: 'messageEntityBold', offset: 0, length: 5 }] },
      ]),
      /Invalid translation response/,
    );
    assert.equal(calls, 1);
  }
});

test('cancelling one Google subscriber keeps the shared request alive for another', async () => {
  let started, release;
  const began = new Promise((r) => (started = r)),
    gate = new Promise((r) => (release = r));
  const h = harness({}, async (_url, opts) => {
    started();
    await gate;
    assert.equal(opts.signal.aborted, false);
    return googleReply(['merhaba']);
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

test('Google posts each text as an escaped form field and detects its language separately', async () => {
  const h = harness({}, async (url, opts) => {
    const u = new URL(url);
    assert.equal(u.hostname, 'translate.googleapis.com');
    assert.equal(u.pathname, '/translate_a/t');
    assert.equal(u.searchParams.get('client'), 'gtx');
    assert.equal(u.searchParams.get('sl'), 'auto');
    assert.equal(u.searchParams.get('q'), null);
    assert.equal(url.includes('Hello'), false);
    assert.equal(opts.method, 'POST');
    assert.match(opts.headers['content-type'], /^application\/x-www-form-urlencoded/);
    // The endpoint reads HTML, so literal markup and entities are escaped.
    assert.deepEqual(new URLSearchParams(opts.body).getAll('q'), ['Hello &lt;b&gt; &amp;amp;']);
    assert.match(opts.headers['User-Agent'], /Android.*Chrome.*Mobile/);
    return googleReply(['merhaba <b> &amp;']);
  });
  assert.equal((await run(h, [{ text: 'Hello <b> &amp;' }]))[0].text, 'merhaba <b> &amp;');
});

test('Google accepts a lone reply without the outer list', async () => {
  const h = harness({}, async () => ok(['Merhaba dünya', 'ru']));
  const [result] = await run(h, [{ text: 'Привет мир' }]);
  assert.equal(result.text, 'Merhaba dünya');
});

test('Google batches stay within an encoded size limit for non-Latin text', async () => {
  const bodies = [];
  const h = harness({}, async (_url, options) => {
    bodies.push(options.body.length);
    return googleReply(googleTexts(options));
  });
  const message = 'Привет мир, как у тебя дела сегодня? '.repeat(25).trim();
  const results = await Promise.all([1, 2, 3].map((n) => run(h, [{ text: message + ' ' + n }])));
  assert.equal(results.length, 3);
  assert.ok(bodies.length >= 2);
  assert.ok(bodies.every((size) => size <= 10000));
});

test('Google accepts a single fragment exactly at the encoded body limit', async () => {
  let size;
  const h = harness({}, async (_url, options) => {
    size = Buffer.byteLength(options.body, 'utf8');
    return googleReply(['Merhaba']);
  });
  const text = '界'.repeat(1000) + 'a'.repeat(998);
  assert.equal((await run(h, [{ text }]))[0].text, 'Merhaba');
  assert.equal(size, 10000);
});

test('Google rejects a single oversized encoded fragment before sending it', async () => {
  let calls = 0;
  const h = harness({}, async () => {
    calls++;
    return googleReply(['Merhaba']);
  });
  await assert.rejects(run(h, [{ text: '界'.repeat(1000) + 'a'.repeat(999) }]), /too long/);
  assert.equal(calls, 0);
});

test('an oversized Google fragment falls back without truncating the source', async () => {
  const text = '界'.repeat(1500),
    hosts = [];
  const h = harness({ fallback: '["google","yandex"]' }, async (url, options) => {
    hosts.push(new URL(url).hostname);
    assert.deepEqual(new URLSearchParams(options.body).getAll('text'), [text]);
    return ok({ code: 200, text: ['Uzun metin'] });
  });
  assert.equal((await run(h, [{ text }]))[0].text, 'Uzun metin');
  assert.deepEqual(hosts, ['translate.yandex.net']);
});

test('Google CAPTCHA redirects start a cooldown and use the backup service', async () => {
  const hosts = [];
  const h = harness({ fallback: '["google","yandex"]' }, async (url) => {
    hosts.push(new URL(url).hostname);
    if (url.includes('yandex')) return ok({ code: 200, text: ['Merhaba'] });
    return { ok: false, status: 302, headers: { get: () => '' } };
  });
  assert.equal((await run(h, [{ text: 'Hello' }]))[0].text, 'Merhaba');
  assert.deepEqual(hosts, ['translate.googleapis.com', 'translate.yandex.net']);
  assert.ok(Number(h.storage.get('chatlate.google.blockedUntil')) > Date.now());
});

test('Google rejecting a large body uses the backup service', async () => {
  for (const status of [405, 413]) {
    const hosts = [];
    const h = harness({ fallback: '["google","yandex"]' }, async (url) => {
      hosts.push(new URL(url).hostname);
      if (url.includes('yandex')) return ok({ code: 200, text: ['Merhaba'] });
      return { ok: false, status, headers: { get: () => '' } };
    });
    assert.equal((await run(h, [{ text: 'Hello' }]))[0].text, 'Merhaba');
    assert.deepEqual(hosts, ['translate.googleapis.com', 'translate.yandex.net']);
  }
});

test('batches never mix detected source languages', async () => {
  const batches = [];
  const h = harness({ provider: 'yandex' }, async (_url, options) => {
    const texts = new URLSearchParams(options.body).getAll('text');
    batches.push(texts);
    return ok({ code: 200, text: texts.map((text) => text.toUpperCase()) });
  });
  const p = h.registered.get('chatlate.yandex');
  const translate = (text, from) =>
    p.translate({
      texts: [{ text }],
      to: 'tr',
      from: [from],
      signal: new AbortController().signal,
    });
  const results = await Promise.all([
    translate('Привет', 'ru'),
    translate('Hello', 'en'),
    translate('Пока', 'ru'),
  ]);
  assert.deepEqual(
    results.map((r) => r[0].text),
    ['ПРИВЕТ', 'HELLO', 'ПОКА'],
  );
  assert.deepEqual(batches, [['Привет', 'Пока'], ['Hello']]);
});

test('Google sends mixed languages together; Yandex batches unknown languages by writing system', async () => {
  const texts = [
    'Did anyone watch the stream?',
    '你看了这个吗 有没有省流',
    'I think the update is great',
    'これを見ましたか',
  ];
  const batches = { google: [], yandex: [] };
  const h = harness({}, async (url, options) => {
    if (url.includes('yandex')) {
      const sent = new URLSearchParams(options.body).getAll('text');
      batches.yandex.push(sent);
      return ok({ code: 200, text: sent });
    }
    const sent = googleTexts(options);
    batches.google.push(sent);
    return googleReply(sent);
  });
  for (const id of ['google', 'yandex']) {
    const p = h.registered.get('chatlate.' + id);
    await Promise.all(
      texts.map((text) =>
        p.translate({
          texts: [{ text }],
          to: 'tr',
          from: [null],
          signal: new AbortController().signal,
        }),
      ),
    );
  }
  assert.deepEqual(batches.google, [texts]);
  assert.deepEqual(batches.yandex, [[texts[0], texts[2]], [texts[1]], [texts[3]]]);
});

test('Yandex receives supported codes for regional Chinese targets', async () => {
  const langs = [];
  const h = harness({}, async (url) => {
    langs.push(new URL(url).searchParams.get('lang'));
    return ok({ code: 200, text: ['你好'] });
  });
  for (const to of ['zh-CN', 'zh-TW', 'pt-BR'])
    await runWith(h, 'yandex', [{ text: 'Hello ' + to }], to);
  assert.deepEqual(langs, ['zh', 'zh', 'pt-BR']);
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
  const result = await runWith(h, 'yandex', [
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
  await runWith(h, 'yandex', [{ text: 'world' }]);
  assert.equal(calls, 1);
});

test('provider cooldowns are independent and persisted', async () => {
  const h = harness({}, async (url) =>
    url.includes('yandex') ? ok({ code: 429 }) : googleReply(['Merhaba']),
  );
  await assert.rejects(runWith(h, 'yandex', [{ text: 'Hello' }]), /limiting requests/);
  assert.ok(Number(h.storage.get('chatlate.yandex.blockedUntil')) > Date.now());
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
    runWith(h, 'yandex', [
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
  const hosts = [];
  const h = harness({ fallback: '["google","yandex"]' }, async (url, options) => {
    hosts.push(new URL(url).hostname);
    assert.equal(options.redirect, 'manual');
    return { ok: false, status: 302, headers: { get: () => 'https://untrusted.example/' } };
  });
  await assert.rejects(run(h, [{ text: 'Private text' }]), /HTTP 302/);
  assert.deepEqual(hosts, ['translate.googleapis.com', 'translate.yandex.net']);
});

test('untrusted Retry-After and saved cooldowns cannot disable a provider indefinitely', async () => {
  const h = harness({}, async () => ({
    ok: false,
    status: 429,
    headers: { get: () => '9999999999999999999999999' },
  }));
  await assert.rejects(run(h, [{ text: 'Hello' }]), /limiting requests/);
  assert.ok(Number(h.storage.get('chatlate.google.blockedUntil')) <= Date.now() + 900000);
  const reloaded = harness({ 'google.blockedUntil': 'Infinity' }, replyWith(['Merhaba']));
  assert.equal((await run(reloaded, [{ text: 'Hello' }]))[0].text, 'Merhaba');
});

test('Microsoft sends texts as a JSON array and keeps the characters each source used', async () => {
  const requests = [];
  const h = harness({}, async (url, options) => {
    requests.push({ url, texts: JSON.parse(options.body), method: options.method });
    return ok([
      { translations: [{ text: 'a < b &amp;&amp; c' }] },
      { translations: [{ text: 'Yaz &amp;amp;' }] },
    ]);
  });
  const result = await runWith(
    h,
    'microsoft',
    [{ text: 'a < b && c' }, { text: 'Write &amp;' }],
    'zh-TW',
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.match(
    requests[0].url,
    /^https:\/\/edge\.microsoft\.com\/translate\/translatetext\?.*&to=zh-Hant$/,
  );
  assert.deepEqual(requests[0].texts, ['a < b && c', 'Write &amp;']);
  assert.equal(result[0].text, 'a < b && c');
  // A source that spelled out an entity keeps it as written.
  assert.equal(result[1].text, 'Yaz &amp;amp;');
});

test('Microsoft rejecting a target language hands the text to the next service', async () => {
  const calls = [];
  const h = harness(
    { fallback: '["microsoft","google"]', provider: 'microsoft' },
    async (url, options) => {
      calls.push(url.includes('microsoft') ? 'Microsoft' : 'Google');
      return url.includes('microsoft')
        ? { ok: false, status: 400, headers: { get: () => '' } }
        : googleReply(googleTexts(options).map(() => 'Merhaba'));
    },
  );
  assert.equal((await runWith(h, 'microsoft', [{ text: 'Hello' }]))[0].text, 'Merhaba');
  assert.deepEqual(calls, ['Microsoft', 'Google']);
});
