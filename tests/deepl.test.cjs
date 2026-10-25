const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness, ok, runWith, googleReply, googleTexts } = require('./helpers/plugin-runtime.cjs');
const reply = (texts) => ok({ translations: texts.map((text) => ({ text })) });

test('DeepL sends plain fragments and preserves formatting and protected text', async () => {
  const h = harness({}, async (url, options) => {
    assert.equal(url, 'https://oneshot-free.www.deepl.com/v1/translate');
    assert.equal(options.headers.Authorization, 'None');
    assert.deepEqual(JSON.parse(options.body), {
      text: ['Hello'],
      target_lang: 'tr',
      usage_type: 'translate',
    });
    return reply(['Merhaba']);
  });
  const result = await runWith(h, 'deepl', [
    {
      text: 'Hello @user',
      entities: [
        { _: 'messageEntityBold', offset: 0, length: 5 },
        { _: 'messageEntityMention', offset: 6, length: 5 },
      ],
    },
  ]);
  assert.equal(result[0].text, 'Merhaba @user');
  assert.equal(result[0].entities[0].length, 7);
  assert.equal(result[0].entities[1].offset, 8);
});

test('DeepL maps regional targets to oneshot language codes', async () => {
  for (const [language, expected] of [
    ['en', 'en-US'],
    ['en_GB', 'en-GB'],
    ['pt', 'pt-BR'],
    ['zh-TW', 'zh-Hant'],
    ['iw', 'he'],
  ]) {
    const h = harness({}, async (_url, options) => {
      assert.equal(JSON.parse(options.body).target_lang, expected);
      return reply(['translated']);
    });
    await runWith(h, 'deepl', [{ text: 'Hello' }], language);
  }
});

test('DeepL batches stay below 1500 UTF-16 units and accept an exact-limit fragment', async () => {
  const batches = [];
  const h = harness({}, async (_url, options) => {
    const texts = JSON.parse(options.body).text;
    assert.ok(texts.reduce((n, text) => n + text.length, 0) <= 1500);
    batches.push(texts);
    return reply(texts);
  });
  await runWith(h, 'deepl', [{ text: 'a' + '😀'.repeat(749) + 'b' }, { text: 'b'.repeat(800) }]);
  assert.equal(batches.length, 2);
  assert.equal(batches[0][0].length, 1500);
});

test('oversized DeepL fragments fall back intact without a DeepL request', async () => {
  const source = 'a'.repeat(1501);
  const h = harness({ fallback: '["google"]' }, async (url, options) => {
    assert.ok(url.includes('google'));
    assert.deepEqual(googleTexts(options), [source]);
    return googleReply(['translated']);
  });
  assert.equal((await runWith(h, 'deepl', [{ text: source }]))[0].text, 'translated');
});

test('DeepL rate limits persist a cooldown and use the enabled backup', async () => {
  let calls = 0;
  const h = harness({ fallback: '["google"]' }, async (url) => {
    if (url.includes('deepl')) {
      calls++;
      return { ok: false, status: 429, headers: { get: () => '120' } };
    }
    return googleReply(['translated']);
  });
  await runWith(h, 'deepl', [{ text: 'Hello' }]);
  await runWith(h, 'deepl', [{ text: 'Goodbye' }]);
  assert.equal(calls, 1);
  assert.ok(Number(h.storage.get('chatlate.deepl.blockedUntil')) > Date.now());
});

test('DeepL rejects incomplete responses and honours cancellation before dispatch', async () => {
  const h = harness({}, async () => reply([]));
  await assert.rejects(runWith(h, 'deepl', [{ text: 'Hello' }]));
  const controller = new AbortController();
  controller.abort();
  const cancelled = harness({}, () => assert.fail('cancelled request sent'));
  await assert.rejects(runWith(cancelled, 'deepl', [{ text: 'Hello' }], 'tr', controller.signal));
});
