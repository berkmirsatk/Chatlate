import { PROVIDER_IDS } from './identity.js';

const PREFIX = 'multi-translate.';
const SETTINGS_VERSION = '7';
const supportedKeys = new Set([
  'settings-version',
  'google-free.blockedUntil',
  'yandex-free.blockedUntil',
  'provider',
  'language',
  'fallback',
  'update.pendingVersion',
]);

export const get = (key, fallback = '') => localStorage.getItem(PREFIX + key) ?? fallback;
export const put = (key, value) => localStorage.setItem(PREFIX + key, value);

/** Keep supported settings when upgrading, and remove obsolete configuration and credentials. */
export function migrateSettings() {
  if (get('settings-version') === SETTINGS_VERSION) return;
  const obsolete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX) && !supportedKeys.has(key.slice(PREFIX.length))) obsolete.push(key);
  }
  for (const key of obsolete) localStorage.removeItem(key);
  if (get('provider') && !PROVIDER_IDS.includes(get('provider')))
    localStorage.removeItem(PREFIX + 'provider');
  const primary = get('provider') || 'google-free';
  const previous = get('fallback');
  let order;
  try {
    order = JSON.parse(previous);
  } catch {
    order = [];
  }
  if (!Array.isArray(order)) order = [];
  if (previous === '1' || PROVIDER_IDS.includes(previous)) {
    const backup =
      previous === '1' ? (primary === 'yandex-free' ? 'google-free' : 'yandex-free') : previous;
    order = [
      primary,
      backup === primary ? (primary === 'yandex-free' ? 'google-free' : 'yandex-free') : backup,
    ];
  }
  put('fallback', JSON.stringify([...new Set(order.filter((id) => PROVIDER_IDS.includes(id)))]));
  put('settings-version', SETTINGS_VERSION);
}
