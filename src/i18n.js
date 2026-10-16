import { LANGUAGES } from './language-catalog.js';
import { get } from './storage.js';

const messages = {
  en: {
    channel: 'Channel',
    github: 'GitHub',
    group: 'Group',
    donate: 'Support development',
    copyAddress: 'Copy address',
    addressCopied: 'Address copied.',
    copyFailed: 'Could not copy the address. Try again.',
    donationChain: '{network} network',
    donationNetwork: 'Send only USDT on the TON network.',
    donationUnavailable: 'Could not open the support page.',
    language: 'Language',
    provider: 'Translation provider',
    testProvider: 'Test provider',
    chooseProvider: 'Select…',
    selectInApp: 'Select Chatlate Google or Yandex in Inugram’s translation settings first.',
    providerSyncFailed: 'Could not update Inugram’s provider. Select it in translation settings.',
    setup: 'Select a provider in the app’s translation settings.',
    test: 'Test connection',
    testing: 'Testing…',
    privacy: 'Text is sent to the selected translation service.',
    success: 'Connection successful.',
    timedResult: '{status} · {ms} ms',
    disableProvider: 'Disable {name}',
    enableProvider: 'Enable {name}',
    moveUp: 'Move up: {name}',
    moveDown: 'Move down: {name}',
    addProvider: 'Add: {name}',
    removeProvider: 'Remove: {name}',
    fallbackPrivacy: 'On failure, text may be sent to the next service in the selected order.',
    connectionFailed: 'Could not connect to the translation service.',
    updateRequired: 'Update Inugram to use translation providers.',
    cancelled: 'Translation cancelled.',
    invalidFormatting: 'Invalid message formatting.',
    invalidEmoji: 'Invalid emoji formatting range.',
    partMismatch: 'Translation fragment count does not match.',
    missingRange: 'Formatting range not found.',
    invalidResponse: 'Invalid translation response. Original text kept.',
    tooLarge: 'Too much text. Select fewer messages.',
    rateLimited: 'Translation service rate limit (HTTP 429). Try again in {seconds} seconds.',
    batchMarkers: 'The service changed translation separators. Original text kept.',
    invalidBatch: 'Invalid translation response.',
    fragmentTooLong: 'Text is too long for translation.',
    queueFull: 'Translation queue is full. Try again shortly.',
    queueTimeout: 'Translation timed out. Try fewer messages.',
    http: 'Translation service returned HTTP {status}.',
    httpRateLimited: 'Translation service rate limit (HTTP 429). Try again later.',
  },
  tr: {
    channel: 'Kanal',
    github: 'GitHub',
    group: 'Grup',
    donate: 'Geliştirmeyi destekle',
    copyAddress: 'Adresi kopyala',
    addressCopied: 'Adres kopyalandı.',
    copyFailed: 'Adres kopyalanamadı. Tekrar deneyin.',
    donationChain: '{network} ağı',
    donationNetwork: 'Yalnızca TON ağında USDT gönderin.',
    donationUnavailable: 'Destek sayfası açılamadı.',
    language: 'Dil',
    provider: 'Çeviri sağlayıcısı',
    testProvider: 'Test sağlayıcısı',
    chooseProvider: 'Seçin…',
    selectInApp: 'Önce İnugram’ın çeviri ayarlarından Chatlate Google veya Yandex’i seçin.',
    providerSyncFailed: 'İnugram’ın sağlayıcısı değiştirilemedi. Çeviri ayarlarından seçin.',
    setup: 'Uygulamanın çeviri ayarlarından bir sağlayıcı seçin.',
    test: 'Bağlantıyı test et',
    testing: 'Test ediliyor…',
    privacy: 'Metin seçilen çeviri servisine gönderilir.',
    success: 'Bağlantı başarılı.',
    timedResult: '{status} · {ms} ms',
    disableProvider: '{name} devre dışı bırak',
    enableProvider: '{name} etkinleştir',
    moveUp: 'Yukarı taşı: {name}',
    moveDown: 'Aşağı taşı: {name}',
    addProvider: 'Ekle: {name}',
    removeProvider: 'Kaldır: {name}',
    fallbackPrivacy: 'Hata durumunda metin sıralamadaki sonraki servise gönderilebilir.',
    connectionFailed: 'Çeviri servisine bağlanılamadı.',
    updateRequired: 'Çeviri sağlayıcılarını kullanmak için İnugram’ı güncelleyin.',
    cancelled: 'Çeviri iptal edildi.',
    invalidFormatting: 'Geçersiz mesaj biçimlendirmesi.',
    invalidEmoji: 'Geçersiz emoji biçim aralığı.',
    partMismatch: 'Çeviri parça sayısı uyuşmuyor.',
    missingRange: 'Biçim aralığı bulunamadı.',
    invalidResponse: 'Geçersiz çeviri yanıtı. Orijinal metin korundu.',
    tooLarge: 'Metin fazla büyük. Daha az mesaj seçin.',
    rateLimited: 'Çeviri servisi hız sınırı (HTTP 429). {seconds} saniye sonra tekrar deneyin.',
    batchMarkers: 'Servis çeviri ayraçlarını değiştirdi. Orijinal metin korundu.',
    invalidBatch: 'Geçersiz çeviri yanıtı.',
    fragmentTooLong: 'Metin çeviri için fazla uzun.',
    queueFull: 'Çeviri sırası dolu. Biraz sonra tekrar deneyin.',
    queueTimeout: 'Çeviri zaman aşımına uğradı. Daha az mesaj deneyin.',
    http: 'Çeviri servisi HTTP {status} yanıtı verdi.',
    httpRateLimited: 'Çeviri servisi hız sınırı (HTTP 429). Daha sonra tekrar deneyin.',
  },
};

/** @param {unknown} language */
export function normalizeLanguage(language) {
  const code = typeof language === 'string' ? language.toLowerCase().split(/[-_]/)[0] : '';
  return LANGUAGES.find((item) => item.code === code)?.code || 'en';
}

export function getAppLanguage() {
  try {
    return normalizeLanguage(inu.info().language);
  } catch {
    return 'en';
  }
}

export function getLanguageOverride() {
  const selected = get('language');
  return LANGUAGES.find((item) => item.code === selected)?.code || '';
}

export function getLanguage() {
  return getLanguageOverride() || getAppLanguage();
}

/**
 * @param {keyof typeof messages.en} key
 * @param {Record<string, string | number>} values
 */
export function t(key, values = {}) {
  return messages[getLanguage()][key].replace(/\{(\w+)\}/g, (placeholder, name) =>
    String(values[name] ?? placeholder),
  );
}
