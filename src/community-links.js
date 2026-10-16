import { REPOSITORY_URL } from './distribution.js';
import { GITHUB_SVG } from './community-icons.js';
import { t } from './i18n.js';

/** Configured public community links. Crypto support is defined in donation-config.js. */
/** @type {{ label: 'channel' | 'github' | 'group', name: string, url: string }[]} */
export const COMMUNITY_LINKS = [
  { label: 'channel', name: '@Plumgins', url: 'https://t.me/Plumgins' },
  { label: 'group', name: '@PlumginsChat', url: 'https://t.me/PlumginsChat' },
  { label: 'github', name: 'berkmirsatk', url: REPOSITORY_URL || 'https://github.com/berkmirsatk' },
];

/** Resolve public community profiles only while their inline section is visible.
 * @param {() => void} invalidate
 */
export function createCommunityLinks(invalidate) {
  let githubIcon;
  /** @type {Map<string, { title?: string, icon?: inu.UIIcon }>} */
  const profiles = new Map();
  let revision = 0;
  let refreshTimer;
  const refreshProfiles = new Set();

  function scheduleRefresh() {
    if (refreshTimer || !refreshProfiles.size) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      let changed = false;
      for (const refresh of refreshProfiles) {
        try {
          changed = refresh() || changed;
        } catch {
          /* retain last known profile */
        }
      }
      if (changed) invalidate();
      scheduleRefresh();
    }, 10000);
  }

  function profile(link, account) {
    const username = /^https:\/\/t\.me\/([a-zA-Z0-9_]{5,32})\/?$/.exec(link.url)?.[1];
    if (!account || !username || (link.label !== 'channel' && link.label !== 'group')) return;
    const key = account.id + ':' + username;
    if (profiles.has(key)) return profiles.get(key);
    /** @type {{ title?: string, icon?: inu.UIIcon }} */
    const result = {};
    profiles.set(key, result); // Pending and failed lookups are not repeated per render.
    const lookupRevision = revision;
    void Promise.resolve()
      .then(() => {
        if (revision === lookupRevision) return account.resolvePeer('@' + username);
      })
      .then((input) => {
        if (!input || revision !== lookupRevision) return;
        let signature;
        const refresh = () => {
          const peer = account.getPeer(input);
          if (!peer || !('title' in peer) || typeof peer.title !== 'string') return false;
          const photo = 'photo' in peer ? peer.photo : undefined;
          const next =
            peer.title +
            ':' +
            String(photo && 'photo_id' in photo ? photo.photo_id : '') +
            ':' +
            String(photo && 'dc_id' in photo ? photo.dc_id : '');
          if (signature === next) return false;
          signature = next;
          result.title = peer.title.slice(0, 128);
          try {
            result.icon = inu.icons.avatar(inu.utils.peers.getMarkedPeerId(peer), {
              account: account.id,
            });
          } catch {
            /* retain generic icon */
          }
          return true;
        };
        refresh();
        refreshProfiles.add(refresh);
        scheduleRefresh();
        invalidate();
      })
      .catch(() => {
        /* Public lookup denied/offline: retain configured label and icon. */
      });
    return result;
  }

  return {
    reset() {
      revision++;
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
      refreshProfiles.clear();
      profiles.clear();
    },
    items() {
      let account;
      try {
        account = inu.account();
      } catch {
        /* no active account or permission */
      }
      return COMMUNITY_LINKS.map((link) => {
        const resolved = profile(link, account);
        let icon = resolved?.icon;
        if (link.label === 'github') {
          try {
            icon = githubIcon ||= inu.icons.svg(GITHUB_SVG);
          } catch {}
        }
        if (!icon) {
          try {
            icon = inu.icons.common(link.label === 'github' ? 'link' : link.label);
          } catch {
            /* older icon hosts */
          }
        }
        return inu.ui.button({
          id: 'community.' + link.label,
          text: resolved?.title || t(link.label),
          value: link.label === 'github' ? undefined : link.name,
          icon,
          onClick: () => inu.openUrl(link.url),
        });
      });
    },
  };
}
