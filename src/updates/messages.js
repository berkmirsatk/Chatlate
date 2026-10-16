import { getLanguage } from '../i18n.js';

const messages = {
  en: {
    title: 'Updates',
    history: 'Version history',
    installed: 'Installed',
    banner: '↑  Update available · {version}',
    current: 'Installed version',
    latest: 'Latest version',
    install: 'Update',
    githubRelease: 'View release on GitHub',
    githubUnavailable: 'Release link unavailable',
    installing: 'Updating…',
    complete: 'Update complete',
    failed: 'Could not update. Try again.',
    missingNotes: 'Release notes are not available.',
  },
  tr: {
    title: 'Güncellemeler',
    history: 'Sürüm geçmişi',
    installed: 'Yüklü',
    banner: '↑  Güncelleme mevcut · {version}',
    current: 'Yüklü sürüm',
    latest: 'Son sürüm',
    install: 'Güncelle',
    githubRelease: 'GitHub’da sürümü görüntüle',
    githubUnavailable: 'Sürüm bağlantısı mevcut değil',
    installing: 'Güncelleniyor…',
    complete: 'Güncelleme tamamlandı',
    failed: 'Güncelleme yapılamadı. Tekrar deneyin.',
    missingNotes: 'Sürüm notları mevcut değil.',
  },
};

export const updateMessages = () => messages[getLanguage()];
