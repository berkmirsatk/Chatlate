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
    selectInApp: 'Select a Chatlate provider in Inugram’s translation settings first.',
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
    deeplLimits: 'DeepL may be temporarily limited during heavy use.',
    removeProvider: 'Remove: {name}',
    fallbackPrivacy: 'On failure, text may be sent to the next service in the selected order.',
    connectionFailed: 'Could not connect to the translation service.',
    cancelled: 'Translation cancelled.',
    invalidFormatting: 'Invalid message formatting.',
    invalidEmoji: 'Invalid emoji formatting range.',
    partMismatch: 'Translation fragment count does not match.',
    missingRange: 'Formatting range not found.',
    invalidResponse: 'Invalid translation response. Original text kept.',
    tooLarge: 'Too much text. Select fewer messages.',
    rateLimited: 'The translation service is limiting requests. Try again in {seconds} seconds.',
    switchedSlow: '{from} is not responding. Translated with {to}.',
    translationService: 'Translation service',
    switchedLimited: '{from} is limiting requests. Translated with {to}.',
    switchedFailed: '{from} could not translate. Translated with {to}.',
    invalidBatch: 'Invalid translation response.',
    fragmentTooLong: 'Text is too long for translation.',
    queueFull: 'Translation queue is full. Try again shortly.',
    queueTimeout: 'Translation timed out. Try fewer messages.',
    http: 'Translation service returned HTTP {status}.',
    httpRateLimited: 'The translation service is limiting requests. Try again later.',
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
    selectInApp: 'Önce Inugram’ın çeviri ayarlarından bir Chatlate sağlayıcısı seçin.',
    providerSyncFailed: 'Inugram’ın sağlayıcısı değiştirilemedi. Çeviri ayarlarından seçin.',
    setup: 'Uygulamanın çeviri ayarlarından bir sağlayıcı seçin.',
    test: 'Bağlantıyı test et',
    testing: 'Test ediliyor…',
    privacy: 'Metin seçilen çeviri servisine gönderilir.',
    success: 'Bağlantı başarılı.',
    timedResult: '{status} · {ms} ms',
    disableProvider: 'Devre dışı bırak: {name}',
    enableProvider: 'Etkinleştir: {name}',
    moveUp: 'Yukarı taşı: {name}',
    moveDown: 'Aşağı taşı: {name}',
    addProvider: 'Ekle: {name}',
    deeplLimits: 'DeepL yoğun kullanımda geçici olarak sınırlanabilir.',
    removeProvider: 'Kaldır: {name}',
    fallbackPrivacy: 'Hata durumunda metin sıralamadaki sonraki servise gönderilebilir.',
    connectionFailed: 'Çeviri servisine bağlanılamadı.',
    cancelled: 'Çeviri iptal edildi.',
    invalidFormatting: 'Geçersiz mesaj biçimlendirmesi.',
    invalidEmoji: 'Geçersiz emoji biçim aralığı.',
    partMismatch: 'Çeviri parça sayısı uyuşmuyor.',
    missingRange: 'Biçim aralığı bulunamadı.',
    invalidResponse: 'Geçersiz çeviri yanıtı. Orijinal metin korundu.',
    tooLarge: 'Metin fazla büyük. Daha az mesaj seçin.',
    rateLimited: 'Çeviri servisi istekleri sınırlıyor. {seconds} saniye sonra tekrar deneyin.',
    switchedSlow: '{from} yanıt vermiyor. {to} ile çevrildi.',
    translationService: 'Çeviri hizmeti',
    switchedLimited: '{from} istekleri sınırlıyor. {to} ile çevrildi.',
    switchedFailed: '{from} çeviremedi. {to} ile çevrildi.',
    invalidBatch: 'Geçersiz çeviri yanıtı.',
    fragmentTooLong: 'Metin çeviri için fazla uzun.',
    queueFull: 'Çeviri sırası dolu. Biraz sonra tekrar deneyin.',
    queueTimeout: 'Çeviri zaman aşımına uğradı. Daha az mesaj deneyin.',
    http: 'Çeviri servisi HTTP {status} yanıtı verdi.',
    httpRateLimited: 'Çeviri servisi istekleri sınırlıyor. Daha sonra tekrar deneyin.',
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

/** The app's own language code, even one Chatlate has no strings for. */
export function getAppLanguageCode() {
  try {
    const language = inu.info().language;
    if (typeof language === 'string' && language) return language;
  } catch {}
  return 'en';
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
