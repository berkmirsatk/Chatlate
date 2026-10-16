import { PLUGIN_ID, registeredProviderId } from './identity.js';
import { get, put } from './storage.js';

/** @param {import('./provider.js').Provider[]} providers */
export function createProviderSelection(providers) {
  let installationPrefix = '';
  function configItem(name = 'TRANSLATION_PROVIDER') {
    const cls = inu.jvm.cls('desu.inugram.InuConfig');
    // Kotlin object properties may expose fields rather than callable accessors.
    try {
      return cls.getStaticField(name);
    } catch {
      return cls.getStaticField('INSTANCE').call('get' + name);
    }
  }
  function readValue(config) {
    try {
      return String(config.call('getValue'));
    } catch {
      return String(config.getField('currentValue'));
    }
  }
  function installationId() {
    const records = JSON.parse(readValue(configItem('PLUGINS_STATE')));
    if (!Array.isArray(records)) return '';
    const own = records.filter(
      (record) =>
        record?.pluginId === PLUGIN_ID &&
        record.enabled !== false &&
        /^[a-f0-9]{32}$/.test(record.id),
    );
    return own.length === 1 ? own[0].id : '';
  }
  function nativeState() {
    const config = configItem();
    const key = readValue(config);
    let prefix = installationPrefix;
    try {
      const id = installationId();
      if (id) prefix = id + ':';
    } catch {
      /* retain compatibility with hosts lacking installation metadata */
    }
    const separator = key.lastIndexOf(':');
    const id = separator < 0 ? '' : key.slice(separator + 1);
    const legacyIndex = providers.findIndex((provider) => registeredProviderId(provider.id) === id);
    if (!prefix && (legacyIndex >= 0 || id === 'multi.deepl-free'))
      prefix = key.slice(0, separator + 1);
    if (prefix) installationPrefix = prefix;
    const index = prefix
      ? providers.findIndex((provider) => prefix + registeredProviderId(provider.id) === key)
      : -1;
    return { config, index, retired: !!prefix && key === prefix + 'multi.deepl-free', prefix };
  }
  function apply(state, index) {
    const desired = state.prefix + registeredProviderId(providers[index].id);
    state.config.call('setValue', desired);
    // Never report success based only on a plugin-local setting.
    if (readValue(state.config) !== desired) throw new Error('Provider write verification failed');
  }
  try {
    const state = nativeState();
    const saved = providers.findIndex((provider) => provider.id === get('provider'));
    if (state.prefix) apply(state, Math.max(0, saved));
  } catch {
    /* the UI reports unavailable native synchronization */
  }
  inu.onUnload?.(() => {
    try {
      const state = nativeState();
      // Leave another plugin or Telegram alone if the user switched providers.
      if (state.index < 0 && !state.retired) return;
      if (state.index >= 0) put('provider', providers[state.index].id);
      // Inugram uses an empty provider key for its built-in Telegram service.
      state.config.call('setValue', '');
    } catch {
      /* unloading must remain safe when native access is unavailable */
    }
  });
  return {
    // Read the native setting once for each render/menu instead of crossing JVM
    // repeatedly and potentially showing values from different selections.
    read() {
      let active = -1,
        available = false;
      try {
        const state = nativeState();
        active = state.index;
        available = !!state.prefix;
      } catch {
        /* local test selection remains usable */
      }
      const saved = get('provider');
      const fallback = providers.findIndex((provider) => provider.id === saved);
      return {
        index: active >= 0 ? active : Math.max(0, fallback),
        active: active >= 0,
        available,
      };
    },
    /** @param {number} index @returns {'applied' | 'inactive' | 'unavailable'} */
    select(index) {
      const provider = providers[index];
      if (!provider) return 'unavailable';
      let state;
      try {
        state = nativeState();
      } catch {
        put('provider', provider.id);
        return 'unavailable';
      }
      try {
        if (!state.prefix) {
          put('provider', provider.id);
          return 'inactive';
        }
        apply(state, index);
        put('provider', provider.id);
        return 'applied';
      } catch {
        return 'unavailable';
      }
    },
  };
}
