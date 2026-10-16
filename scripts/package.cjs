const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const project = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(project, file), 'utf8');
const { version } = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
if (
  lock.version !== version ||
  lock.packages[''].version !== version ||
  !read('src/identity.js').includes(`export const PLUGIN_VERSION = '${version}';`) ||
  !read('inu.config.ts').includes('version: PLUGIN_VERSION')
) {
  throw Error('Release versions must match the package, lockfile and plugin identity');
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const cli = path.join(
  project,
  'node_modules/.bin',
  process.platform === 'win32' ? 'inu.cmd' : 'inu',
);
execFileSync(npm, ['run', 'verify'], { cwd: project, stdio: 'inherit' });
execFileSync(cli, ['verify', 'dist/chatlate.inu.js'], { cwd: project, stdio: 'inherit' });

const name = `Chatlate-${version}.inu.js`;
const output = path.join(project, 'dist', name);
fs.copyFileSync(path.join(project, 'dist/chatlate.inu.js'), output);
const checksum = createHash('sha256').update(fs.readFileSync(output)).digest('hex');
fs.writeFileSync(
  path.join(project, 'dist', `Chatlate-${version}.sha256`),
  `${checksum}  ${name}\n`,
);
console.log(output);
