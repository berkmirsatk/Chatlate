const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const banner = fs.readFileSync(path.join(root, 'assets/chatlate-settings-poster.webp'));
if (banner.toString('ascii', 0, 4) !== 'RIFF' || banner.toString('ascii', 8, 12) !== 'WEBP') {
  throw new Error('Banner must be a WebP image');
}
fs.writeFileSync(
  path.join(root, 'src/banner-data.js'),
  '/** Banner artwork. Regenerate with npm run embed:banner. */\n' +
    `export const BANNER_BASE64 = '${banner.toString('base64')}';\n` +
    `export const BANNER_BYTE_LENGTH = ${banner.length};\n`,
);
