import { PLUGIN_ID, PLUGIN_DESCRIPTIONS, PLUGIN_VERSION } from './src/identity.js';
import { defineConfig } from '@inugram/cli';
export default defineConfig({
  outDir: 'dist',
  esbuild: (options) => ({
    ...options,
    format: 'iife',
    minifyWhitespace: false,
    minifyIdentifiers: false,
    minifySyntax: false,
    loader: { ...options.loader, '.svg': 'text' },
  }),
  plugins: {
    chatlate: {
      entry: 'src/index.js',
      manifest: {
        name: 'Chatlate',
        author: '@berkmirsatk',
        id: PLUGIN_ID,
        version: PLUGIN_VERSION,
        description: PLUGIN_DESCRIPTIONS,
        icon: 'tg://addstickers?set=Plumgins&idx=2',
        grants: [
          'fetch(translate.googleapis.com)',
          'fetch(translate.yandex.net)',
          'fetch(api.github.com)',
          'fetch(release-assets.githubusercontent.com)',
          'openUrl',
          'clipboard.write',
          'account.read(peers)',
          'unsafe.jvm',
          'unsafe.xposed',
        ],
      },
    },
  },
});
