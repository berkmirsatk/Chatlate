import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseChangelog } from '../src/updates/changelog.js';

const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    output: { type: 'string' },
    body: { type: 'boolean' },
    all: { type: 'boolean' },
  },
});
const version = values.version || JSON.parse(readFileSync('package.json', 'utf8')).version;
const entries = parseChangelog(readFileSync('CHANGELOG.md', 'utf8'));
const selected = values.all ? entries : entries.filter((entry) => entry.version === version);
if (!selected.length) throw Error('Changelog entry not found: ' + version);
for (const entry of selected) {
  const output = values.all
    ? join(values.output || 'dist/release-notes', 'v' + entry.version + '.md')
    : values.output || 'dist/release-notes.md';
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    (values.body ? '' : '# Chatlate v' + entry.version + '\n\n') + entry.markdown + '\n',
  );
}
