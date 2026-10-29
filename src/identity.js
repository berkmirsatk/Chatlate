// Stable identities are retained across upgrades; installation IDs belong to the host.
export const PLUGIN_VERSION = '1.2.1';
export const PLUGIN_ID = 'io.inugram.community.chatlate';
/** @type {Record<string, string>} */
export const PLUGIN_DESCRIPTIONS = {
  en: 'Chat translation with formatting preserved.',
  tr: 'Biçimlendirmeyi koruyan sohbet çevirisi.',
};

/** @param {string} id */
export const registeredProviderId = (id) => 'chatlate.' + id;
