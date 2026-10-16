const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const fixture = buildSync({
  entryPoints: ['src/updates/changelog.js'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Changelog',
}).outputFiles[0].text;
const context = {};
vm.runInNewContext(fixture, context);
const { parseChangelog, telegramMarkdown } = context.Changelog;

test('shared release notes preserve the approved Translation, Providers and Settings sections', () => {
  const entries = parseChangelog(readFileSync('CHANGELOG.md', 'utf8'));
  const first = entries.find((entry) => entry.version === '1.0.0');
  assert.ok(first);
  assert.match(first.markdown, /^### Translation/);
  assert.match(first.markdown, /### Providers/);
  assert.match(first.markdown, /### Settings/);
  assert.match(first.markdown, /Google · Yandex/);
  assert.doesNotMatch(first.markdown, /## 1\.0\.0|API key/);
});

test('version boundaries, unreleased sections and fenced headings cannot mix release notes', () => {
  const text =
    '# Changelog\r\n\r\n## 1.0.0\r\nOld\r\n## Unreleased\r\nHidden\r\n## 1.10.0\r\nNew\r\n~~~md\r\n## 9.9.9\r\n### Literal heading\r\n~~~\r\n## 1.2.0\r\nMiddle';
  const entries = parseChangelog(text);
  assert.deepEqual(
    Array.from(entries, (entry) => entry.version),
    ['1.10.0', '1.2.0', '1.0.0'],
  );
  assert.equal(entries[2].markdown, 'Old');
  assert.match(entries[0].markdown, /## 9.9.9/);
  const formatted = telegramMarkdown(entries[0].markdown);
  assert.match(formatted, /### Literal heading/);
  assert.equal(telegramMarkdown('### Translation\n- Text'), '**Translation**\n- Text');
});

test('duplicate releases and oversized sources fail instead of presenting ambiguous notes', () => {
  assert.throws(() => parseChangelog('## 1.0.0\na\n## 1.0.0\nb'), /Duplicate/);
  assert.throws(() => parseChangelog('x'.repeat(128001)), /size/);
  assert.deepEqual(Array.from(parseChangelog('## 01.0.0\nInvalid')), []);
});
