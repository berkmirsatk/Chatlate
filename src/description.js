import { getAppLanguage, getLanguageOverride, normalizeLanguage } from './i18n.js';
import { PLUGIN_ID, PLUGIN_DESCRIPTIONS } from './identity.js';

/** Localize only Chatlate; leave its source and other plugins untouched. */
export function registerDescription() {
  let override = getLanguageOverride();
  let appLanguage = getAppLanguage();
  let snapshotLanguage = '';
  function refresh() {
    override = getLanguageOverride();
    appLanguage = getAppLanguage();
    const language = override || appLanguage;
    if (snapshotLanguage === language) return;
    try {
      const manager = inu.jvm
        .cls('desu.inugram.helpers.plugins.PluginManager')
        .getStaticField('INSTANCE');
      const plugins = manager.call('plugins');
      const matches = [];
      for (let index = 0, size = Number(plugins.call('size')); index < size; index++) {
        const plugin = plugins.call('get', index);
        const manifest = plugin.call('getManifest');
        if (manifest.call('getId') === PLUGIN_ID) matches.push({ plugin, manifest });
      }
      // Avoid changing another installation if the host ever allows duplicates.
      if (matches.length !== 1) return;
      const { plugin, manifest } = matches[0];
      const description = PLUGIN_DESCRIPTIONS[language] || PLUGIN_DESCRIPTIONS.en;
      const localized = new (inu.jvm.cls('java.util.LinkedHashMap'))();
      for (const code of Object.keys(PLUGIN_DESCRIPTIONS)) localized.call('put', code, description);
      // Manifest fields are final. Replace only our plugin's volatile manifest
      // with a copy, so the description survives hook disposal on disable.
      const copy = new (inu.jvm.cls('desu.inugram.core.plugins.PluginManifest'))(
        manifest.call('getName'),
        manifest.call('getAuthor'),
        manifest.call('getDeclaredId'),
        manifest.call('getVersion'),
        description,
        localized,
        manifest.call('getIcon'),
        manifest.call('getGrants'),
        manifest.call('getPluginApi'),
        manifest.call('getPlatform'),
        manifest.call('getRaw'),
      );
      plugin.setField('manifest', copy);
      snapshotLanguage = language;
    } catch {
      /* active description hooks remain the compatibility fallback */
    }
  }
  refresh();
  const disposers = [];
  try {
    const manifest = inu.jvm.cls('desu.inugram.core.plugins.PluginManifest');
    /** @param {inu.xposed.MethodHookContext} ctx */
    const after = (ctx) => {
      try {
        if (ctx.throwable || ctx.thisObject?.call('getId') !== PLUGIN_ID) return;
        // Hook callbacks cannot call localStorage or other plugin-thread-only APIs.
        let language = override;
        if (!language) {
          let locale = ctx.args[0];
          if (locale == null) {
            try {
              locale = inu.jvm
                .cls('org.telegram.messenger.LocaleController')
                .callStatic('getInstance')
                .getField('currentLocaleInfo')
                .getField('langCode');
            } catch {
              locale = appLanguage;
            }
          }
          language = normalizeLanguage(locale ?? appLanguage);
        }
        ctx.setReturnValue(PLUGIN_DESCRIPTIONS[language] || PLUGIN_DESCRIPTIONS.en);
      } catch {
        /* preserve the original English description if host internals change */
      }
    };
    disposers.push(inu.xposed.hookMethod(manifest.getDeclaredMethod('description'), { after }));
    // Compact plugin rows use the zero-argument Kotlin property getter.
    disposers.push(inu.xposed.hookMethod(manifest.getDeclaredMethod('getDescription'), { after }));
    for (const name of ['PluginInfoActivity', 'PluginsActivity']) {
      try {
        const screen = inu.jvm.cls('desu.inugram.ui.settings.' + name);
        const utilities = inu.jvm.cls('org.telegram.messenger.AndroidUtilities');
        disposers.push(
          inu.xposed.hookMethod(screen.getDeclaredMethod('onResume'), {
            after: (ctx) => {
              try {
                if (ctx.throwable) return;
                /** @type {any} */
                const adapter = ctx.thisObject?.getField('listView')?.call('getAdapter');
                if (!adapter) return;
                // Delay one frame: an immediate Java call inside this hook would
                // suppress our nested description hooks. Capture the resumed screen's
                // adapter instead of querying a possibly stale current fragment.
                utilities.callStatic(
                  'runOnUIThread',
                  inu.jvm.routine(() => {
                    try {
                      adapter.update(true);
                    } catch {
                      /* screen may have closed */
                    }
                  }),
                  16,
                );
              } catch {
                /* an unavailable host view must not break screen resume */
              }
            },
          }),
        );
      } catch {
        /* description localization works even without lifecycle refresh */
      }
    }
    inu.onUnload(() => {
      for (const dispose of disposers) dispose();
    });
  } catch {
    for (const dispose of disposers) dispose();
  }
  return refresh;
}
