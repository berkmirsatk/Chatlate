// Stable identities are retained across upgrades; installation IDs belong to the host.
/** @type {readonly string[]} */
export const PROVIDER_IDS = ['google-free', 'yandex-free'];
export const PLUGIN_VERSION = '1.0.0';
export const PLUGIN_ID = 'io.inugram.community.chatlate';
/** @type {Record<string, string>} */
export const PLUGIN_DESCRIPTIONS = {
  en: 'Chat translation with formatting preserved.',
  tr: 'Biçimlendirmeyi koruyan sohbet çevirisi.',
};

/** @param {string} id */
export const registeredProviderId = (id) => 'multi.' + id;
