const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  code,
  harness,
  summaryValue,
  orderAction,
  ok,
  run,
  runWith,
} = require('./helpers/plugin-runtime.cjs');

test('backup provider defaults off and opt-in persists after reload', async () => {
  const h = harness({}, async () => ({ ok: false, status: 429 }));
  assert.equal(summaryValue(h), '1. Google');
  await assert.rejects(run(h, [{ text: 'Hello' }]), /429/);
  orderAction(h, 'Add: Yandex');
  assert.equal(h.storage.get('chatlate.fallback'), '["google","yandex"]');
  const upgraded = harness({ fallback: h.storage.get('chatlate.fallback') });
  assert.equal(summaryValue(upgraded), '1. Google → 2. Yandex');
  assert.ok(
    upgraded.page
      .items()
      .some(
        (row) =>
          row.text === 'On failure, text may be sent to the next service in the selected order.',
      ),
  );
});

test('quota fallback retries all fragments on Yandex and preserves nested entities and code', async () => {
  const calls = [];
  const h = harness({ fallback: '["google","yandex"]' }, async (url, options) => {
    calls.push(new URL(url).hostname);
    if (url.includes('googleapis')) return { ok: false, status: 429 };
    const parts = new URLSearchParams(options.body).getAll('text');
    assert.deepEqual(parts, ['Hello', 'world']);
    return ok({ code: 200, text: ['Merhaba', 'dünya'] });
  });
  const input = {
    text: 'Hello world\ncode',
    entities: [
      { _: 'messageEntityBold', offset: 0, length: 11 },
      { _: 'messageEntityItalic', offset: 6, length: 5 },
      { _: 'messageEntityCode', offset: 12, length: 4 },
    ],
  };
  const result = (await run(h, [input]))[0];
  assert.equal(result.text, 'Merhaba dünya\ncode');
  assert.deepEqual(JSON.parse(JSON.stringify(result.entities)), [
    { _: 'messageEntityBold', offset: 0, length: 13 },
    { _: 'messageEntityItalic', offset: 8, length: 5 },
    { _: 'messageEntityCode', offset: 14, length: 4 },
  ]);
  assert.deepEqual(calls, ['translate.googleapis.com', 'translate.yandex.net']);
  // Disabling backup must not reuse a message translated by it.
  orderAction(h, 'Remove: Yandex');
  await assert.rejects(run(h, [input]), /429/);
  assert.equal(calls.length, 2);
});

test('network, temporary HTTP errors and invalid responses use backup; authorization does not', async () => {
  for (const failure of ['network', 408, 503, 403, 'invalid']) {
    let backupCalls = 0;
    const h = harness({ fallback: '["google","yandex"]' }, async (url) => {
      if (url.includes('yandex')) {
        backupCalls++;
        return ok({ code: 200, text: ['Merhaba'] });
      }
      if (failure === 'network') throw Error('offline');
      if (failure === 'invalid')
        return {
          ok: true,
          json: async () => {
            throw Error('bad JSON');
          },
        };
      return { ok: false, status: failure };
    });
    const recovers = ['network', 408, 503, 'invalid'].includes(failure);
    if (recovers) assert.equal((await run(h, [{ text: 'Hello' }]))[0].text, 'Merhaba');
    else await assert.rejects(run(h, [{ text: 'Hello' }]));
    assert.equal(backupCalls, recovers ? 1 : 0);
  }
});

test('Yandex quota falls back to Google without changing the selected provider', async () => {
  const calls = [];
  const h = harness({ fallback: '["google","yandex"]', provider: 'yandex' }, async (url) => {
    calls.push(new URL(url).hostname);
    if (url.includes('yandex')) return { ok: false, status: 429 };
    return ok([[['Merhaba']]]);
  });
  assert.equal((await runWith(h, 'yandex', [{ text: 'Hello' }]))[0].text, 'Merhaba');
  assert.deepEqual(calls, ['translate.yandex.net', 'translate.googleapis.com']);
  assert.equal(h.storage.get('chatlate.provider'), 'yandex');
});

test('both providers failing terminates after one attempt per service', async () => {
  let calls = 0;
  const h = harness({ fallback: '["google","yandex"]' }, async () => {
    calls++;
    return { ok: false, status: 503 };
  });
  await assert.rejects(run(h, [{ text: 'Hello' }]), /HTTP 503/);
  assert.equal(calls, 2);
});

test('cancelled translation never starts a backup request', async () => {
  let started;
  const began = new Promise((resolve) => (started = resolve));
  let calls = 0;
  const h = harness({ fallback: '["google","yandex"]' }, async (url, options) => {
    calls++;
    started();
    return new Promise((resolve, reject) =>
      options.signal.addEventListener('abort', () => reject(Error('aborted'))),
    );
  });
  const controller = new AbortController();
  const pending = run(h, [{ text: 'Hello' }], controller.signal);
  const rejected = assert.rejects(pending, /cancelled/);
  await began;
  controller.abort();
  await rejected;
  assert.equal(calls, 1);
});

test('primary attempt timeout leaves time for backup within the host budget', async () => {
  const calls = [];
  const h = harness(
    { fallback: '["google","yandex"]' },
    async (url, options) => {
      calls.push(new URL(url).hostname);
      if (url.includes('yandex')) return ok({ code: 200, text: ['Merhaba'] });
      return new Promise((resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(Error('aborted'))),
      );
    },
    'en',
    {},
    { setTimeout: (fn, ms) => setTimeout(fn, ms === 5000 ? 100 : ms) },
  );
  assert.equal((await run(h, [{ text: 'Hello' }]))[0].text, 'Merhaba');
  assert.deepEqual(calls, ['translate.googleapis.com', 'translate.yandex.net']);
});

test('connection test checks each enabled service directly after a failed primary', async () => {
  const calls = [];
  const h = harness({ fallback: '["google","yandex"]', language: 'tr' }, async (url) => {
    calls.push(url.includes('yandex') ? 'Yandex' : 'Google');
    return url.includes('yandex')
      ? ok({ code: 200, text: ['Merhaba'] })
      : { ok: false, status: 503 };
  });
  h.page
    .items()
    .find((row) => row.id === 'test')
    .onClick();
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.deepEqual(calls, ['Google', 'Yandex']);
  const rows = h.page.items();
  assert.ok(
    rows.some((row) =>
      /^Google: Çeviri servisi HTTP 503 yanıtı verdi\. · [0-9]+ ms$/m.test(row.text),
    ),
  );
  assert.ok(rows.some((row) => /^Yandex: Bağlantı başarılı\. · [0-9]+ ms$/m.test(row.text)));
  assert.equal(rows.find((row) => row.id === 'test').text, 'Bağlantıyı test et');
});

test('invalid formatting never triggers backup; changed Google separators do', async () => {
  const hosts = [];
  const h = harness({ fallback: '["google","yandex"]' }, async (url, options) => {
    hosts.push(new URL(url).hostname);
    if (url.includes('yandex'))
      return ok({ code: 200, text: new URLSearchParams(options.body).getAll('text') });
    return ok([[['broken separators']]]);
  });
  await assert.rejects(
    run(h, [{ text: 'Hello', entities: [{ _: 'messageEntityBold', offset: 0, length: 99 }] }]),
  );
  assert.equal(hosts.length, 0);
  const [result] = await run(h, [
    { text: 'Hello world', entities: [{ _: 'messageEntityBold', offset: 0, length: 5 }] },
  ]);
  assert.equal(result.text, 'Hello world');
  assert.deepEqual(hosts, ['translate.googleapis.com', 'translate.yandex.net']);
});

test('one timed-out fallback subscriber does not abort another shared primary request', async () => {
  let primaryTimerCount = 0,
    started,
    release;
  const began = new Promise((resolve) => (started = resolve)),
    gate = new Promise((resolve) => (release = resolve));
  let calls = 0;
  const h = harness(
    { fallback: '["google","yandex"]' },
    async (url, options) => {
      calls++;
      if (url.includes('yandex')) return ok({ code: 200, text: ['Yedek'] });
      started();
      await gate;
      assert.equal(options.signal.aborted, false);
      return ok([[['Birincil']]]);
    },
    'en',
    {},
    { setTimeout: (fn, ms) => setTimeout(fn, ms === 5000 && ++primaryTimerCount === 1 ? 100 : ms) },
  );
  const first = run(h, [{ text: 'Hello' }]);
  const second = run(h, [{ text: 'Hello' }]);
  await began;
  assert.equal((await first)[0].text, 'Yedek');
  release();
  assert.equal((await second)[0].text, 'Birincil');
  assert.equal(calls, 2);
});
