import { PLUGIN_ID } from '../identity.js';

/** Verify bytes and the host-parsed identity, then use Inugram's normal install sheet.
 * Native import owns permission consent, compatibility checks and reload/storage handling.
 * @param {Uint8Array} bytes @param {string} expectedHash @param {string} version
 * @param {AbortSignal} signal */
export function installPackage(bytes, expectedHash, version, signal) {
  if (signal.aborted) throw Error('Update cancelled');
  const digest = inu.jvm.cls('java.security.MessageDigest').callStatic('getInstance', 'SHA-256');
  const hash = Array.from(digest.call('digest', bytes), (byte) =>
    Number(byte).toString(16).padStart(2, '0'),
  ).join('');
  if (hash !== expectedHash) throw Error('Package checksum mismatch');
  const source = new TextDecoder().decode(bytes);
  const parser = inu.jvm
    .cls('desu.inugram.core.plugins.PluginManifestParser')
    .getStaticField('INSTANCE');
  const manifest = parser.call('parseOrNull', source);
  if (
    !manifest ||
    manifest.call('getId') !== PLUGIN_ID ||
    manifest.call('getVersion') !== version
  ) {
    throw Error('Package identity mismatch');
  }
  const fragment = inu.android.getCurrentFragment();
  if (!fragment || signal.aborted) throw Error('Update page closed');
  // Never call PluginManager.update directly: the native sheet must display grant changes.
  const importer = inu.jvm
    .cls('desu.inugram.helpers.plugins.PluginImportHelper')
    .getStaticField('INSTANCE');
  try {
    // Current hosts add a Kotlin default `origin` parameter, which the JVM bridge must receive.
    importer.call('startImport', fragment, source, null);
  } catch {
    importer.call('startImport', fragment, source);
  }
}
