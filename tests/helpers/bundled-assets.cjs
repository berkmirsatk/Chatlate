const { readFileSync } = require('node:fs');

/** Read the SDK asset footer so fixtures exercise the packaged artwork. */
function bundledAssets(
  source = readFileSync(process.env.PLUGIN_FILE || 'dist/chatlate.inu.js', 'utf8'),
) {
  const assets = new Map();
  for (const match of source.matchAll(
    /@asset (\S+) (\S+)\n([A-Za-z0-9+/=\r\n]+)(?=@asset|==\/InuAssets==)/g,
  )) {
    const bytes = Buffer.from(match[3].replace(/\s/g, ''), 'base64');
    assets.set(match[1], {
      name: match[1],
      type: match[2],
      size: bytes.length,
      bytes: async () => bytes,
    });
  }
  return {
    get(name) {
      if (!assets.has(name)) throw Error('Unknown bundled asset: ' + name);
      return assets.get(name);
    },
  };
}

module.exports = { bundledAssets };
