const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
// Exercise three simulated providers without shipping an unverified third service.
const fixture = buildSync({
  stdin: {
    contents:
      "export { withFallback, getProviderOrder } from './src/fallback.js'; export { HttpError } from './src/http.js'; export { createCache } from './src/cache.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'OrderTest',
}).outputFiles[0].text;
function helpers(order) {
  const context = {
    localStorage: { getItem: () => order },
    inu: { info: () => ({ language: 'en' }) },
    AbortController,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(fixture, context);
  return context.OrderTest;
}
test('ordered failover reaches the third provider, tries each once and reuses the same fragments', async () => {
  const api = helpers('["first","second","third","second","https://untrusted.example/"]');
  const calls = [];
  const parts = ['Hello', 'world'];
  const providers = ['first', 'second', 'third'].map((id) => ({
    id,
    name: id,
    async translateParts(texts) {
      calls.push(id);
      assert.equal(texts, parts);
      if (id !== 'third') throw new api.HttpError(503, '');
      return ['Merhaba', 'dünya'];
    },
  }));
  const chain = api.withFallback(providers[0], providers);
  assert.deepEqual(await chain.translateParts(parts, 'tr', new AbortController().signal), [
    'Merhaba',
    'dünya',
  ]);
  assert.deepEqual(calls, ['first', 'second', 'third']);
  assert.equal(chain.cacheContext(), '["first","second","third"]');
});
test('nonrecoverable errors stop an ordered chain before later services receive text', async () => {
  const api = helpers('["first","second","third"]');
  const calls = [];
  const providers = ['first', 'second', 'third'].map((id) => ({
    id,
    name: id,
    async translateParts() {
      calls.push(id);
      throw new api.HttpError(id === 'first' ? 503 : 403, '');
    },
  }));
  await assert.rejects(
    api
      .withFallback(providers[0], providers)
      .translateParts(['Hello'], 'tr', new AbortController().signal),
    /403/,
  );
  assert.deepEqual(calls, ['first', 'second']);
});
test('successful failover does not promote the backup on the next translation', async () => {
  const api = helpers('["first","second"]');
  const calls = [];
  let failed = false;
  const providers = ['first', 'second'].map((id) => ({
    id,
    name: id,
    async translateParts() {
      calls.push(id);
      if (id === 'first' && !failed) {
        failed = true;
        throw new api.HttpError(503, '');
      }
      return [id];
    },
  }));
  const chain = api.withFallback(providers[0], providers);
  assert.deepEqual(await chain.translateParts(['Hello'], 'tr', new AbortController().signal), [
    'second',
  ]);
  assert.deepEqual(
    await chain.translateParts(['Another message'], 'tr', new AbortController().signal),
    ['first'],
  );
  assert.deepEqual(calls, ['first', 'second', 'first']);
  assert.equal(chain.cacheContext(), '["first","second"]');
});
test('malformed and unknown priorities cannot introduce a provider or duplicate the primary', () => {
  const providers = ['first', 'second', 'third'].map((id) => ({ id, name: id }));
  for (const order of ['{bad', '{"first":true}', '[null,{},"unknown","first","second","second"]']) {
    const api = helpers(order);
    const resolved = Array.from(api.getProviderOrder(providers[0], providers), (item) => item.id);
    assert.deepEqual(resolved, order.startsWith('[null') ? ['first', 'second'] : ['first']);
  }
});
test('caches evict large retained values and excessive entry counts', () => {
  const api = helpers('[]');
  const cache = api.createCache((value) => value.length);
  cache.set('old', 'a'.repeat(600000));
  cache.set('new', 'b'.repeat(600000));
  assert.equal(cache.has('old'), false);
  assert.equal(cache.get('new').length, 600000);
  cache.clear();
  for (let index = 0; index < 257; index++) cache.set(String(index), 'value');
  assert.equal(cache.has('0'), false);
  assert.equal(cache.get('256'), 'value');
  cache.set('huge', 'x'.repeat(1000001));
  assert.equal(cache.has('huge'), false);
});
