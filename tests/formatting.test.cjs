const assert = require('node:assert/strict');
const { test } = require('node:test');
const { code, harness, ok, run, replyWith } = require('./helpers/plugin-runtime.cjs');

test('nested formatting, protected code, URL and custom emoji survive changed lengths', async () => {
  const input = {
    text: 'Hello world\nconst x=1; https://example.com 😀',
    entities: [
      { _: 'messageEntityBold', offset: 0, length: 11 },
      { _: 'messageEntityItalic', offset: 6, length: 5 },
      { _: 'messageEntityPre', offset: 12, length: 10, language: 'js' },
      { _: 'messageEntityUrl', offset: 23, length: 19 },
      { _: 'messageEntityCustomEmoji', offset: 43, length: 2, document_id: '123456789012345678' },
    ],
  };
  const h = harness({}, replyWith(['Merhaba', 'dünya']));
  const result = (await run(h, [input]))[0];
  assert.equal(result.text, 'Merhaba dünya\nconst x=1; https://example.com 😀');
  assert.deepEqual(JSON.parse(JSON.stringify(result.entities)), [
    { _: 'messageEntityBold', offset: 0, length: 13 },
    { _: 'messageEntityItalic', offset: 8, length: 5 },
    { _: 'messageEntityPre', offset: 14, length: 10, language: 'js' },
    { _: 'messageEntityUrl', offset: 25, length: 19 },
    { _: 'messageEntityCustomEmoji', offset: 45, length: 2, document_id: '123456789012345678' },
  ]);
  assert.ok(input.text.startsWith('Hello'));
});

test('link target and spoiler survive while their text is translated', async () => {
  const h = harness({}, replyWith(['gizli', 'buraya']));
  const r = (
    await run(h, [
      {
        text: 'secret here',
        entities: [
          { _: 'messageEntitySpoiler', offset: 0, length: 6 },
          { _: 'messageEntityTextUrl', offset: 7, length: 4, url: 'https://example.com/a?b=1' },
        ],
      },
    ])
  )[0];
  assert.equal(r.text, 'gizli buraya');
  assert.equal(r.entities[1].url, 'https://example.com/a?b=1');
  assert.equal(r.entities[1].offset, 6);
});

test('whitespace, CRLF, literal punctuation and empty messages survive', async () => {
  const h = harness({}, replyWith(['Merhaba', 'Dünya']));
  const r = await run(h, [{ text: '  Hello\r\nWorld  ' }, { text: '😀 123\n' }, { text: '' }]);
  assert.equal(r[0].text, '  Merhaba\r\nDünya  ');
  assert.equal(r[1].text, '😀 123\n');
  assert.equal(r[2].text, '');
});

test('protected-only messages make no network request', async () => {
  const h = harness();
  const input = {
    text: 'print("hello")',
    entities: [{ _: 'messageEntityPre', offset: 0, length: 14, language: 'python' }],
  };
  assert.equal((await run(h, [input]))[0].text, input.text);
});

test('invalid provider responses are rejected', async () => {
  for (const text of ['', 'unexpected\nline']) {
    const h = harness({}, async () => ok([[[text]]]));
    await assert.rejects(run(h, [{ text: 'Hello' }]), /Invalid translation/);
  }
});

test('entity ranges cannot split an emoji or run outside the text', async () => {
  const h = harness();
  await assert.rejects(
    run(h, [{ text: '😀', entities: [{ _: 'messageEntityBold', offset: 0, length: 1 }] }]),
    /emoji/i,
  );
  await assert.rejects(
    run(h, [{ text: 'a', entities: [{ _: 'messageEntityBold', offset: 0, length: 2 }] }]),
    /Invalid message/,
  );
});
