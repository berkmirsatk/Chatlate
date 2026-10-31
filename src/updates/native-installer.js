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
  // The JVM bridge refuses Inugram's plugin engine classes, so the package goes through the same
  // path as a plugin file tapped in a chat: Inugram's install sheet shows grant changes.
  const name = `Chatlate-${version}.inu.js`;
  const constructor = (/** @type {string} */ cls, /** @type {string} */ descriptor) =>
    inu.jvm.cls(cls).getDeclaredConstructor(descriptor);
  const cache = inu.jvm
    .cls('org.telegram.messenger.ApplicationLoader')
    .getStaticField('applicationContext')
    .call('getCacheDir');
  const file = constructor('java.io.File', '(Ljava/io/File;Ljava/lang/String;)V').newInstance(
    cache,
    name,
  );
  const output = constructor('java.io.FileOutputStream', '(Ljava/io/File;)V').newInstance(file);
  try {
    output.call('write([B)V', bytes);
  } finally {
    output.call('close');
  }
  const document = constructor('org.telegram.tgnet.TLRPC$TL_document', '()V').newInstance();
  const attribute = constructor(
    'org.telegram.tgnet.TLRPC$TL_documentAttributeFilename',
    '()V',
  ).newInstance();
  attribute.setField('file_name', name);
  document.getField('attributes').call('add(Ljava/lang/Object;)Z', attribute);
  const opened = inu.jvm
    .cls('desu.inugram.helpers.chat.ChatHelper')
    .callStatic('maybeHandleRichDocumentClick', document, file);
  if (!opened) throw Error('Install sheet unavailable');
}
