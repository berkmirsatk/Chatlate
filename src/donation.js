import { DONATION } from './donation-config.js';
import coffeeLogo from '../assets/buy-me-a-coffee.svg';
import { t } from './i18n.js';

const USDT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#ffffff" stroke-width="1.8"/><path fill="#ffffff" d="M7 6.5h10v2h-4v9h-2v-9H7z"/><ellipse cx="12" cy="10.5" rx="6" ry="1.5" fill="none" stroke="#ffffff" stroke-width="1.3"/></svg>';

/** Native support rows; payment links and clipboard writes require an explicit tap.
 * @param {inu.UIIcon | undefined} [supportIcon] */
export function createDonation(supportIcon) {
  const cleanups = new Set();
  const icons = new Map();
  function icon(svg, fallback) {
    try {
      if (!icons.has(svg)) icons.set(svg, inu.icons.svg(svg));
      return icons.get(svg);
    } catch {
      try {
        return inu.icons.common(fallback);
      } catch {
        return undefined;
      }
    }
  }
  function copyAddress() {
    try {
      inu.clipboard.write(DONATION.address);
      inu.ui.toast(t('addressCopied'));
    } catch {
      inu.ui.toast(t('copyFailed'));
    }
  }
  function open() {
    let closed = false;
    function cleanup() {
      closed = true;
      cleanups.delete(cleanup);
    }
    cleanups.add(cleanup);
    const page = inu.ui.settingsPage({
      title: t('donate'),
      transient: true,
      onClose: cleanup,
      items: () => [
        inu.ui.button({
          id: 'donation.coffee',
          text: 'Buy Me a Coffee',
          icon: icon(coffeeLogo, 'link'),
          onClick: () => {
            if (!closed) inu.openUrl(DONATION.supportUrl);
          },
        }),
        inu.ui.separator(),
        inu.ui.button({
          id: 'donation.copy',
          text: DONATION.asset,
          subtitle: t('donationChain', { network: DONATION.network }),
          value: t('copyAddress'),
          icon: icon(USDT_ICON, 'copy'),
          onClick: () => {
            if (!closed) copyAddress();
          },
        }),
        inu.ui.separator(t('donationNetwork')),
      ],
    });
    try {
      inu.ui.openPage(page);
    } catch {
      cleanup();
      page.dispose();
      inu.ui.toast(t('donationUnavailable'));
    }
  }
  return {
    reset() {
      for (const cleanup of [...cleanups]) cleanup();
    },
    item: () =>
      inu.ui.button({
        id: 'community.donate',
        text: t('donate'),
        icon: supportIcon,
        onClick: open,
      }),
  };
}
