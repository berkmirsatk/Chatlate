const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

const fixture = buildSync({
  stdin: {
    contents: "export { createGitHubSource } from './src/updates/github-source.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Distribution',
}).outputFiles[0].text;
const repository = 'berkmirsatk/Chatlate';
const api = 'https://api.github.com/repos/' + repository;
const source = Buffer.from('// ==InuPlugin==\n// reviewed package fixture\n');
const hash = createHash('sha256').update(source).digest('hex');
const release = () => ({
  tag_name: 'v1.0.1',
  html_url: 'https://github.com/' + repository + '/releases/tag/v1.0.1',
  body: '# Added\n- A feature\n```\n# literal code\n```',
  assets: [
    { id: 42, name: 'Chatlate-1.0.1.inu.js', size: source.length, digest: 'sha256:' + hash },
  ],
});

function harness(options = {}) {
  const requests = [],
    imports = [];
  const context = {
    Uint8Array,
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (options.fetch) return options.fetch(url, init);
      if (url.endsWith('/releases/assets/42'))
        return {
          ok: true,
          url: options.finalUrl || 'https://release-assets.githubusercontent.com/package',
          arrayBuffer: async () => Uint8Array.from(options.bytes || source).buffer,
        };
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify(options.release || release()),
      };
    },
    inu: {
      android: { getCurrentFragment: () => (options.noFragment ? null : 'fragment') },
      jvm: {
        cls(name) {
          if (name === 'java.security.MessageDigest')
            return {
              callStatic: (method, algorithm) => {
                assert.equal(method, 'getInstance');
                assert.equal(algorithm, 'SHA-256');
                return {
                  call: (method, bytes) => {
                    assert.equal(method, 'digest');
                    return new Uint8Array(createHash('sha256').update(bytes).digest());
                  },
                };
              },
            };
          if (name === 'java.lang.String')
            return class {
              constructor(bytes, encoding) {
                assert.equal(encoding, 'UTF-8');
                this.source = Buffer.from(bytes).toString('utf8');
              }
              call(method) {
                assert.equal(method, 'toString');
                return this.source;
              }
            };
          if (name.endsWith('PluginManifestParser'))
            return {
              getStaticField: () => ({
                call: (method, text) => {
                  assert.equal(method, 'parseOrNull');
                  assert.equal(text, source.toString());
                  if (options.invalidManifest) return null;
                  return {
                    call: (field) =>
                      field === 'getId'
                        ? options.id || 'io.inugram.community.chatlate'
                        : options.version || '1.0.1',
                  };
                },
              }),
            };
          if (name.endsWith('PluginImportHelper'))
            return {
              getStaticField: () => ({
                call: (...args) => {
                  if (options.legacyImport && args.length !== 3) throw TypeError('No overload');
                  if (!options.legacyImport && args.length !== 4) throw TypeError('No overload');
                  imports.push(args);
                },
              }),
            };
          throw Error('Unexpected native access: ' + name);
        },
      },
    },
  };
  vm.runInNewContext(fixture, context);
  return { create: context.Distribution.createGitHubSource, requests, imports };
}
const signal = () => new AbortController().signal;

test('release checks select the stable newer version without copying potentially stale release notes', async () => {
  const h = harness();
  assert.equal(h.create(null), null);
  assert.throws(() => h.create('../other/repo'), /Invalid repository/);
  const found = await h.create(repository).check(signal());
  assert.equal(found.version, '1.0.1');
  assert.equal(found.url, release().html_url);
  assert.equal(found.notes.en, undefined);
  assert.equal(h.requests[0].url, api + '/releases/latest');
  assert.equal(h.requests[0].init.redirect, 'error');
  assert.equal(h.imports.length, 0);
});

test('changelog reads the current main file every time and uses no new fetch host', async () => {
  let text = '# Changelog\n## 1.0.0\n### Translation\n- First text';
  const h = harness({ fetch: async () => ({ status: 200, ok: true, text: async () => text }) });
  const source = h.create(repository);
  const first = await source.changelog(signal());
  assert.equal(first[0].notes.en, '**Translation**\n- First text');
  text = text.replace('First text', 'Corrected text');
  const second = await source.changelog(signal());
  assert.equal(second[0].notes.en, '**Translation**\n- Corrected text');
  assert.equal(h.requests.length, 2);
  for (const request of h.requests) {
    assert.equal(request.url, api + '/contents/CHANGELOG.md?ref=main');
    assert.equal(request.init.headers.Accept, 'application/vnd.github.raw+json');
    assert.equal(request.init.headers['Cache-Control'], 'no-cache');
    assert.equal(request.init.redirect, 'error');
  }
  const hidden = harness({ fetch: async () => ({ status: 404 }) });
  await assert.rejects(hidden.create(repository).changelog(signal()), /unavailable/);
});

test('private or unpublished repositories are silent; HTTP and oversized metadata fail', async () => {
  const hidden = harness({ fetch: async () => ({ status: 404 }) });
  assert.equal(await hidden.create(repository).check(signal()), null);
  for (const response of [
    { status: 503, ok: false },
    { status: 200, ok: true, text: async () => ' '.repeat(128001) },
    { status: 200, ok: true, text: async () => '{invalid' },
  ]) {
    const h = harness({ fetch: async () => response });
    await assert.rejects(h.create(repository).check(signal()));
    assert.equal(h.imports.length, 0);
  }
});

test('untrusted or incomplete release metadata cannot produce an update', async () => {
  const variants = [
    { draft: true },
    { prerelease: true },
    { tag_name: 'v1.0.0' },
    { tag_name: 'v1.0.1-beta' },
    { tag_name: 'x1.0.1' },
    { html_url: 'https://github.com/another/repo/releases/tag/v1.0.1' },
    { assets: [] },
    { assets: [...release().assets, ...release().assets] },
    ...[
      { digest: null },
      { digest: 'sha256:wrong' },
      { size: 524289 },
      { size: 0 },
      { size: 1.5 },
      { id: 0 },
      { name: 'other.inu.js' },
    ].map((change) => ({ assets: [{ ...release().assets[0], ...change }] })),
  ];
  for (const change of variants) {
    const h = harness({ release: { ...release(), ...change } });
    assert.equal(await h.create(repository).check(signal()), null, JSON.stringify(change));
    assert.equal(h.imports.length, 0);
  }
});

test('installation rechecks the selected tag and uses the native permission sheet only after verification', async () => {
  const h = harness();
  await h.create(repository).install({ version: '1.0.1', url: 'https://untrusted.test' }, signal());
  assert.deepEqual(
    h.requests.map(({ url }) => url),
    [api + '/releases/tags/v1.0.1', api + '/releases/assets/42'],
  );
  assert.equal(h.requests[1].init.headers.Accept, 'application/octet-stream');
  assert.deepEqual(h.imports, [['startImport', 'fragment', source.toString(), null]]);
  const legacy = harness({ legacyImport: true });
  await legacy.create(repository).install({ version: '1.0.1' }, signal());
  assert.deepEqual(legacy.imports, [['startImport', 'fragment', source.toString()]]);
});

test('mismatched bytes, plugin identity, final host or missing page never reach native import', async () => {
  for (const options of [
    { bytes: Buffer.from(source.toString().replace('reviewed', 'tampered')) },
    { bytes: Buffer.from('short') },
    { id: 'another.plugin' },
    { version: '2.0.0' },
    { invalidManifest: true },
    { noFragment: true },
    { finalUrl: 'https://release-assets.githubusercontent.com.evil.test/x' },
    { release: { ...release(), tag_name: 'v1.0.2' } },
  ]) {
    const h = harness(options);
    await assert.rejects(h.create(repository).install({ version: '1.0.1' }, signal()));
    assert.equal(h.imports.length, 0, JSON.stringify(options));
  }
});

test('cancellation and invalid versions stop installation before download', async () => {
  const h = harness(),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(h.create(repository).install({ version: '1.0.1' }, controller.signal));
  assert.equal(h.requests.length, 0);
  assert.equal(h.imports.length, 0);
  for (const version of ['1.0.0', '0.9.9', '../latest', '1.0.2-beta']) {
    await assert.rejects(h.create(repository).install({ version }, signal()));
  }
  assert.equal(h.requests.length, 0);
});
